import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to adb binary.
 * Priority: system PATH → local adb.exe in project root
 */
function getAdbPath() {
  const test = spawnSync('adb', ['version'], { encoding: 'utf8', windowsHide: true });
  if (test.status === 0) return 'adb';

  // Fallback: adb.exe bundled in project root
  const localAdb = join(__dirname, '..', 'adb.exe');
  if (existsSync(localAdb)) return localAdb;

  throw new Error('ADB not found in PATH or project directory.\nInstall ADB: https://developer.android.com/tools/adb');
}

function runAdb(adbPath, args) {
  return spawnSync(adbPath, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function readDeviceProp(adbPath, prop) {
  const result = runAdb(adbPath, ['shell', 'getprop', prop]);
  return (result.stdout || '').trim();
}

/**
 * Check ADB connection & detect connected device.
 * @returns {string} path to adb binary
 */
export function checkAdb() {
  const adbPath = getAdbPath();

  const result = runAdb(adbPath, ['devices']);

  if (result.error) throw new Error(`ADB error: ${result.error.message}`);

  const lines = result.stdout
    .trim()
    .split('\n')
    .slice(1) // Skip "List of devices attached" header
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('*'));

  if (lines.length === 0) {
    throw new Error(
      'No device connected.\nEnsure USB Debugging is enabled and the device is authorized.'
    );
  }

  const [serial = '', state = 'unknown'] = lines[0].split(/\s+/);

  if (state === 'unauthorized') {
    throw new Error('Device detected but not authorized.\nAccept the RSA fingerprint prompt on the device.');
  }

  if (state !== 'device') {
    throw new Error(`Device is not ready.\nCurrent state: ${state}`);
  }

  const model = readDeviceProp(adbPath, 'ro.product.model') || 'Unknown device';
  const brand = readDeviceProp(adbPath, 'ro.product.brand');
  const androidVersion = readDeviceProp(adbPath, 'ro.build.version.release') || 'Unknown';

  return {
    adbPath,
    serial,
    state,
    model,
    brand,
    androidVersion,
  };
}

/**
 * Fetch installed packages split into system & 3rd party.
 * @param {string} adbPath
 * @returns {{ sysPackages: string[], userPackages: string[] }}
 */
export function getPackages(adbPath) {
  const opts = { encoding: 'utf8', windowsHide: true };

  // -s = system packages, --user 0 = primary user
  const sysResult = spawnSync(
    adbPath,
    ['shell', 'pm', 'list', 'packages', '-s', '--user', '0'],
    opts
  );

  // -3 = 3rd party packages
  const userResult = spawnSync(
    adbPath,
    ['shell', 'pm', 'list', 'packages', '-3', '--user', '0'],
    opts
  );

  const parse = (stdout) =>
    stdout
      .split('\n')
      .map(l => l.replace('package:', '').trim())
      .filter(Boolean)
      .sort();

  return {
    sysPackages: parse(sysResult.stdout || ''),
    userPackages: parse(userResult.stdout || ''),
  };
}

/**
 * Uninstall a package for user 0 (disable without full removal).
 * @param {string} adbPath
 * @param {string} pkg  package name
 * @returns {boolean}  true if success
 */
export function uninstallPackage(adbPath, pkg) {
  const result = spawnSync(
    adbPath,
    ['shell', 'pm', 'uninstall', '-k', '--user', '0', pkg],
    { encoding: 'utf8', windowsHide: true }
  );
  return (result.stdout || '').trim().toLowerCase().includes('success');
}
