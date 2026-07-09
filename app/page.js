'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Search, X, AlertTriangle, ShieldAlert, Trash2, SquareMinus } from 'lucide-react';

export default function Home() {
  const [device, setDevice] = useState(null);
  const [packages, setPackages] = useState({ system: [], user: [] });
  const [selectedPackages, setSelectedPackages] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [pane, setPane] = useState('loading'); // 'loading', 'alert', 'app-list'
  const [alertInfo, setAlertInfo] = useState({ title: '', message: '' });
  const [loadingText, setLoadingText] = useState('Initializing WebUSB...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemScrolled, setSystemScrolled] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [webUsbSupported, setWebUsbSupported] = useState(true);

  // Modals state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);

  // Progress state
  const [progressTitle, setProgressTitle] = useState('Uninstalling Packages...');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('Preparing...');
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [consoleLog, setConsoleLog] = useState([]);
  const [isProgressDone, setIsProgressDone] = useState(false);

  const searchInputRef = useRef(null);
  const consoleLogRef = useRef(null);
  const adbRef = useRef(null);

  // Keep device ref updated to avoid stale closure in events
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  // Initial load and connection scanner
  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && !!(navigator && navigator.usb);
    setWebUsbSupported(isSupported);

    if (isSupported) {
      const scanDevices = async () => {
        try {
          const { AdbDaemonWebUsbDeviceManager } = await import('@yume-chan/adb-daemon-webusb');
          const pairedDevices = await AdbDaemonWebUsbDeviceManager.BROWSER.getDevices();
          if (pairedDevices.length > 0) {
            logConsole('Auto-reconnecting to paired device...', 'info');
            await connectToDevice(pairedDevices[0]);
          } else {
            setPane('alert');
            setAlertInfo({
              title: 'Connect Android Device',
              message: 'Please connect your device via USB cable, enable USB Debugging, then click Connect Device.'
            });
          }
        } catch (e) {
          console.error('Scan paired devices failed', e);
          showConnectionError('Scan Failed', 'Could not scan for connected USB devices.');
        }
      };
      scanDevices();

      // Listen for browser device disconnections
      const handleDisconnect = (event) => {
        if (deviceRef.current && event.device.serialNumber === deviceRef.current.serial) {
          setDevice(null);
          setPackages({ system: [], user: [] });
          setSelectedPackages(new Set());
          adbRef.current = null;
          showConnectionError('Device Disconnected', 'USB connection to your device was lost.');
        }
      };

      navigator.usb.addEventListener('disconnect', handleDisconnect);
      return () => {
        navigator.usb.removeEventListener('disconnect', handleDisconnect);
      };
    } else {
      setPane('alert');
      setAlertInfo({
        title: 'Browser Not Supported',
        message: 'Your current browser does not support WebUSB. Please switch to Google Chrome, Microsoft Edge, Opera, or Brave.'
      });
    }
  }, []);

  // Global hotkeys handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === 'Escape') {
        if (isConfirmOpen) {
          setIsConfirmOpen(false);
        } else if (searchQuery) {
          setSearchQuery('');
          searchInputRef.current?.focus();
        } else {
          setSelectedPackages(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConfirmOpen, searchQuery]);

  // Scroll console log to bottom on changes
  useEffect(() => {
    if (consoleLogRef.current) {
      consoleLogRef.current.scrollTop = consoleLogRef.current.scrollHeight;
    }
  }, [consoleLog]);

  const showConnectionError = (title, message) => {
    setAlertInfo({ title, message });
    setPane('alert');
  };

  // Helper to execute shell command and read stdout
  const runAdbCommand = async (adb, cmd) => {
    const process = await adb.subprocess.shell(cmd);
    const reader = process.stdout.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(combined);
  };

  const loadPackages = async (adbInstance) => {
    try {
      setLoadingText('Loading system packages...');
      const sysRaw = await runAdbCommand(adbInstance, 'pm list packages -s --user 0');
      
      setLoadingText('Loading user packages...');
      const userRaw = await runAdbCommand(adbInstance, 'pm list packages -3 --user 0');

      const parse = (raw) =>
        raw
          .split(/[\r\n]+/)
          .map(l => l.replace('package:', '').trim())
          .filter(Boolean)
          .sort();

      const sysPkgs = parse(sysRaw);
      const userPkgs = parse(userRaw);

      setPackages({ system: sysPkgs, user: userPkgs });

      // Clean selected packages that no longer exist
      const allPkgs = new Set([...sysPkgs, ...userPkgs]);
      setSelectedPackages(prev => {
        const next = new Set(prev);
        for (const pkg of next) {
          if (!allPkgs.has(pkg)) {
            next.delete(pkg);
          }
        }
        return next;
      });

      setPane('app-list');
    } catch (e) {
      console.error('Failed to load packages', e);
      showConnectionError('Load Failed', 'Could not read package list from device.');
    }
  };

  const connectToDevice = async (usbDevice) => {
    setPane('loading');
    setLoadingText('Connecting and authenticating with device...');
    try {
      const { Adb } = await import('@yume-chan/adb');
      const { AdbDaemonTransport } = await import('@yume-chan/adb');
      const { default: AdbWebCredentialStore } = await import('@yume-chan/adb-credential-web');

      const connection = await usbDevice.connect();
      const credentialStore = new AdbWebCredentialStore();
      
      // Perform authentication handshake
      const transport = await AdbDaemonTransport.authenticate({
        serial: usbDevice.serial,
        connection: connection,
        credentialStore: credentialStore,
      });

      const adb = new Adb(transport);
      adbRef.current = adb;

      // Fetch device info
      const brandRaw = await runAdbCommand(adb, 'getprop ro.product.brand');
      const modelRaw = await runAdbCommand(adb, 'getprop ro.product.model');
      const releaseRaw = await runAdbCommand(adb, 'getprop ro.build.version.release');

      setDevice({
        brand: brandRaw.trim(),
        model: modelRaw.trim(),
        androidVersion: releaseRaw.trim(),
        serial: usbDevice.serial
      });

      // Fetch package lists
      await loadPackages(adb);
    } catch (e) {
      console.error('Connection failed', e);
      showConnectionError('Authentication Failed', e.message || 'Make sure USB debugging is enabled and you accept the RSA authentication prompt on the device screen.');
    }
  };

  const handleConnectClick = async () => {
    try {
      const { AdbDaemonWebUsbDeviceManager } = await import('@yume-chan/adb-daemon-webusb');
      const usbDevice = await AdbDaemonWebUsbDeviceManager.BROWSER.requestDevice();
      if (usbDevice) {
        await connectToDevice(usbDevice);
      }
    } catch (e) {
      console.error('Device pairing cancelled', e);
    }
  };

  const refreshAll = async (showLoading = true) => {
    if (!adbRef.current) {
      await handleConnectClick();
      return;
    }

    if (showLoading) {
      setPane('loading');
      setLoadingText('Refreshing package lists...');
    }
    setIsRefreshing(true);

    try {
      await loadPackages(adbRef.current);
    } catch (e) {
      console.error('Refresh packages failed', e);
      showConnectionError('Refresh Failed', 'Communication with the device was lost.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter visible items
  const q = searchQuery.trim().toLowerCase();
  const visibleSystemPackages = packages.system.filter(pkg => pkg.toLowerCase().includes(q));
  const visibleUserPackages = packages.user.filter(pkg => pkg.toLowerCase().includes(q));

  // Toggle selection on a single package
  const togglePackage = (pkg) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkg)) {
        next.delete(pkg);
      } else {
        next.add(pkg);
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedPackages(new Set());
  };

  // Human-friendly package name formatter
  const getFriendlyName = (pkgName) => {
    const parts = pkgName.split('.');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const prev = parts[parts.length - 2];
      let name = last;
      if (['android', 'google', 'sec', 'samsung', 'huawei', 'xiaomi', 'miui'].includes(last)) {
        name = prev;
      }
      return name.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    return pkgName;
  };

  // Log to progress console
  const logConsole = (message, type = 'info') => {
    setConsoleLog(prev => [...prev, { text: message, type }]);
  };

  const handleProgressDone = () => {
    setIsProgressOpen(false);
    refreshAll(false);
  };

  // Client-side WebUSB uninstallation sequence
  const startUninstallation = async () => {
    setIsConfirmOpen(false);
    
    const targetPackages = Array.from(selectedPackages);
    if (targetPackages.length === 0) return;

    // Reset progress state
    setProgressTitle('Uninstalling Packages...');
    setProgressPercent(0);
    setProgressStatus('Initializing WebUSB...');
    setSuccessCount(0);
    setFailCount(0);
    setConsoleLog([{ text: 'Establishing secure communication...', type: 'info' }]);
    setIsProgressDone(false);
    setIsProgressOpen(true);

    const adb = adbRef.current;
    if (!adb) {
      logConsole('Error: Device is no longer connected.', 'error');
      setProgressStatus('Failed: Device disconnected.');
      setIsProgressDone(true);
      return;
    }

    logConsole(`Target: Uninstalling/disabling ${targetPackages.length} packages.`, 'info');
    setProgressStatus(`Removing ${targetPackages.length} packages...`);

    let completed = 0;
    let localSuccess = 0;
    let localFail = 0;

    for (const pkg of targetPackages) {
      setProgressStatus(`Uninstalling: ${pkg} (${completed + 1}/${targetPackages.length})`);
      logConsole(`Processing ${pkg}...`, 'info');
      try {
        const result = await runAdbCommand(adb, `pm uninstall --user 0 ${pkg}`);
        if (result.toLowerCase().includes('success')) {
          logConsole(`[✓] SUCCESS: ${pkg}`, 'success');
          localSuccess++;
          setSuccessCount(localSuccess);
        } else {
          // Try disabling as fallback
          logConsole(`[!] Uninstall failed, trying to disable: ${pkg}`, 'info');
          const disableResult = await runAdbCommand(adb, `pm disable-user --user 0 ${pkg}`);
          if (disableResult.toLowerCase().includes('new state')) {
            logConsole(`[✓] SUCCESS (Disabled): ${pkg}`, 'success');
            localSuccess++;
            setSuccessCount(localSuccess);
          } else {
            const errReason = result.trim() || disableResult.trim() || 'Unknown error';
            logConsole(`[✗] FAILED:  ${pkg} (${errReason})`, 'error');
            localFail++;
            setFailCount(localFail);
          }
        }
      } catch (err) {
        logConsole(`[✗] ERROR:  ${pkg} (${err.message})`, 'error');
        localFail++;
        setFailCount(localFail);
      }
      
      completed++;
      setProgressPercent(Math.round((completed / targetPackages.length) * 100));
    }

    logConsole(`\n========================================`, 'info');
    logConsole(`UNINSTALLATION COMPLETE`, 'info');
    logConsole(`Total Packages: ${targetPackages.length}`, 'info');
    logConsole(`Succeeded:      ${localSuccess}`, 'success');
    logConsole(`Failed:         ${localFail}`, localFail > 0 ? 'error' : 'info');
    logConsole(`========================================`, 'info');

    setProgressStatus('Removal complete!');
    setProgressTitle('Uninstallation Complete');
    setIsProgressDone(true);
    setSelectedPackages(new Set());
  };

  // Circular progress ring parameters
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="main-header">
        <div className="logo-container">
          <h1 className="logo-text">SACA</h1>
        </div>

        <div className={`device-panel ${device ? 'connected' : 'disconnected'}`}>
          <div className="status-indicator">
            <span className="pulse-dot"></span>
            <span className="status-text">{device ? 'Connected' : 'No Device'}</span>
          </div>
          {device ? (
            <div className="device-details">
              <span className="device-name">{`${device.brand || ''} ${device.model || ''}`.trim() || 'Unknown'}</span>
              <span className="separator">|</span>
              <span className="device-version">Android {device.androidVersion}</span>
              <span className="separator">|</span>
              <span className="device-serial">{device.serial}</span>
            </div>
          ) : (
            webUsbSupported && (
              <button className="btn btn-primary" onClick={handleConnectClick} style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '12px' }}>
                Connect Device
              </button>
            )
          )}
          {device && (
            <button 
              className={`btn-icon ${isRefreshing ? 'spinning' : ''}`} 
              onClick={() => refreshAll(true)}
              title="Refresh connection and package lists"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">

        {/* Loading Pane */}
        {pane === 'loading' && (
          <section className="loading-pane">
            <div className="spinner"></div>
            <p>{loadingText}</p>
          </section>
        )}

        {/* Device Alert Pane */}
        {pane === 'alert' && (
          <section className="alert-pane">
            <div className="alert-card">
              <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '8px' }} />
              <h2>{alertInfo.title}</h2>
              <p>{alertInfo.message}</p>
              <div className="alert-actions">
                {webUsbSupported ? (
                  <button className="btn btn-primary" onClick={handleConnectClick}>Connect Device</button>
                ) : (
                  <p style={{ color: '#ef4444', fontWeight: 'bold' }}>WebUSB is not supported in this browser.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Split Pane View */}
        {pane === 'app-list' && (
          <div className="split-container">
            {/* System Apps Column */}
            <section className="column-panel system-column">
              <div className={`column-header ${systemScrolled ? 'scrolled' : ''}`}>
                <h2>System Apps <span className="badge">{packages.system.length}</span></h2>
              </div>

              {visibleSystemPackages.length > 0 ? (
                <div className="package-list" onScroll={(e) => setSystemScrolled(e.target.scrollTop > 0)}>
                  {visibleSystemPackages.map((pkg) => {
                    const isSelected = selectedPackages.has(pkg);
                    return (
                      <div 
                        key={pkg}
                        className={`package-card ${isSelected ? 'selected' : ''} system-app`}
                        onClick={() => togglePackage(pkg)}
                      >
                        <div className="card-checkbox">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => togglePackage(pkg)}
                            onClick={e => e.stopPropagation()}
                            className="default-checkbox"
                          />
                        </div>
                        <div className="card-info">
                          <div className="card-pkg-friendly">{getFriendlyName(pkg)}</div>
                          <div className="card-pkg-name" title={pkg}>{pkg}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={36} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                  <h3>No matching system apps</h3>
                </div>
              )}
            </section>

            {/* User Apps Column */}
            <section className="column-panel user-column">
              <div className={`column-header ${userScrolled ? 'scrolled' : ''}`}>
                <h2>User Apps <span className="badge">{packages.user.length}</span></h2>
              </div>

              {visibleUserPackages.length > 0 ? (
                <div className="package-list" onScroll={(e) => setUserScrolled(e.target.scrollTop > 0)}>
                  {visibleUserPackages.map((pkg) => {
                    const isSelected = selectedPackages.has(pkg);
                    return (
                      <div 
                        key={pkg}
                        className={`package-card ${isSelected ? 'selected' : ''} user-app`}
                        onClick={() => togglePackage(pkg)}
                      >
                        <div className="card-checkbox">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => togglePackage(pkg)}
                            onClick={e => e.stopPropagation()}
                            className="default-checkbox"
                          />
                        </div>
                        <div className="card-info">
                          <div className="card-pkg-friendly">{getFriendlyName(pkg)}</div>
                          <div className="card-pkg-name" title={pkg}>{pkg}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={36} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                  <h3>No matching user apps</h3>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Footer Toolbar */}
      {pane === 'app-list' && (
        <footer className="footer-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" style={{ color: 'var(--text-muted)' }} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search packages (press '/' to focus)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
            {searchQuery && (
              <button className="btn-clear" onClick={() => setSearchQuery('')}><X size={16} /></button>
            )}
          </div>

          {selectedPackages.size > 0 && (
            <div className="header-selection-bar">
              <span className="selection-count"><strong>{selectedPackages.size}</strong> selected</span>
              <button className="btn-icon" onClick={handleDeselectAll} title="Deselect All">
                <SquareMinus size={18} />
              </button>
              <button className="btn-icon" onClick={() => setIsConfirmOpen(true)} title="Uninstall Selected">
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </footer>
      )}


      {/* Confirmation Modal */}
      <div className={`modal-overlay ${isConfirmOpen ? 'visible' : ''}`}>
        <div className="modal-card">
          <div className="modal-header">
            <h2>Confirm Uninstallation</h2>
            <button className="modal-close" onClick={() => setIsConfirmOpen(false)}><X size={20} /></button>
          </div>
          <div className="modal-body">
            <div className="warning-banner">
              <ShieldAlert size={24} style={{ color: '#b45309', flexShrink: 0 }} />
              <div className="warning-text">
                <strong>Warning:</strong> You are about to disable/uninstall system packages. 
                Removing essential system files could cause device instability or boot loops. Proceed with care.
              </div>
            </div>
            <p>You have selected <strong>{selectedPackages.size}</strong> package(s) for removal:</p>
            <div className="confirm-packages-list">
              {Array.from(selectedPackages).map((pkg) => (
                <div key={pkg} className="confirm-pkg-item">
                  <strong>{getFriendlyName(pkg)}</strong> ({pkg})
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setIsConfirmOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={startUninstallation} style={{ background: '#ef4444', color: 'white', marginLeft: '12px' }}>
              Confirm & Uninstall
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Log Modal */}
      <div className={`modal-overlay ${isProgressOpen ? 'visible' : ''}`}>
        <div className="modal-card" style={{ maxWidth: '600px' }}>
          <div className="modal-header">
            <h2>{progressTitle}</h2>
          </div>
          <div className="modal-body">
            
            <div className="progress-meter-container">
              <svg className="progress-ring" width="120" height="120">
                <circle
                  className="progress-ring-bg"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  fill="transparent"
                  r={radius}
                  cx="60"
                  cy="60"
                />
                <circle
                  className="progress-ring-bar"
                  stroke="#10b981"
                  strokeWidth="8"
                  fill="transparent"
                  r={radius}
                  cx="60"
                  cy="60"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="progress-percent-label">{progressPercent}%</div>
            </div>

            <div className="progress-status-container">
              <div className="progress-status">{progressStatus}</div>
              <div className="progress-stats-summary">
                <span className="stat-success">✓ {successCount} Succeeded</span>
                <span className="stat-separator">|</span>
                <span className="stat-fail">✗ {failCount} Failed</span>
              </div>
            </div>

            <div className="console-log" ref={consoleLogRef}>
              {consoleLog.map((log, index) => (
                <div key={index} className={`console-line ${log.type}`}>
                  {log.text}
                </div>
              ))}
            </div>

          </div>
          <div className="modal-footer">
            <button 
              className="btn btn-primary" 
              onClick={handleProgressDone} 
              disabled={!isProgressDone}
              style={{ opacity: isProgressDone ? 1 : 0.5, cursor: isProgressDone ? 'pointer' : 'not-allowed' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
