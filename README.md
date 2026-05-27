# SACA (System Adb Cleaner Assistant)

**SACA** is a full-screen TUI tool to quickly uninstall Android bloatware via ADB.

## Quick Install (No Node.js)

### Windows

#### Install
```powershell
irm https://raw.githubusercontent.com/duyxyz/saca/main/install.ps1 | iex
```
*Once installed, restart your terminal and run `saca`.*

#### Uninstall
```powershell
Remove-Item -Path "$env:USERPROFILE\.saca" -Recurse -Force; [Environment]::SetEnvironmentVariable("PATH", ([Environment]::GetEnvironmentVariable("PATH", "User") -split ';' | Where-Object { $_ -ne "$env:USERPROFILE\.saca" }) -join ';', "User")
```

### macOS & Linux
Download the binary from [Releases](https://github.com/duyxyz/saca/releases), extract and run.

---

## Node.js & npm Alternative

### Run instantly (No install)
```bash
npx @duyxyz/saca
```

### Install globally
```bash
npm install -g @duyxyz/saca
```

### Uninstall
```bash
npm uninstall -g @duyxyz/saca
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




