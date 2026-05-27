# SACA (System Adb Cleaner Assistant)

**SACA** is a full-screen TUI tool to quickly uninstall Android bloatware via ADB.

## Quick Install (No Node.js)

### Windows
```powershell
irm https://raw.githubusercontent.com/duyxyz/saca/main/install.ps1 | iex
```
*Once installed, restart your terminal and run `saca`.*

### macOS & Linux
Download the binary from [Releases](https://github.com/duyxyz/saca/releases), extract and run.

---

## Node.js & npm Alternative

```bash
# Run instantly
npx @duyxyz/saca

# Install globally
npm install -g @duyxyz/saca
```

---

## Controls

- **Arrows / Tab**: Navigate & Switch Panes
- **Space**: Select Apps
- **Enter**: Uninstall Selected
- **Esc**: Clear Filter / Back
- **Ctrl + Q**: Quit

---

## Requirements
- **USB Debugging** enabled on your Android device.
- **Standalone Version**: ADB is bundled automatically (No setup required).
- **npm Version**: Requires Node.js ≥ 18 and ADB installed in PATH.




