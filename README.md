# SACA (System Adb Cleaner Assistant)

**SACA** is a high-performance, full-screen TUI tool to quickly uninstall Android bloatware via ADB.

---

## Quick Install (No Node.js Required)

### Windows (Recommended)
Open **PowerShell** and run this single command to install SACA along with all required ADB binaries automatically:
```powershell
irm https://raw.githubusercontent.com/duyxyz/saca/main/install.ps1 | iex
```
*Once installed, open a new terminal and simply type `saca` to run!*

### macOS & Linux
1. Go to the [Releases](https://github.com/duyxyz/saca/releases) page.
2. Download the compressed archive for your platform (`saca-macos-x64.tar.gz` or `saca-linux-x64.tar.gz`).
3. Extract the archive and execute the `saca` binary directly from your terminal!

---

## Run with Node.js & npm (Alternative)

If you already have Node.js installed, you can use the traditional npm commands:

### Run instantly with npx
```bash
npx @duyxyz/saca
```

### Install globally
```bash
npm install -g @duyxyz/saca
```

### Uninstall global package
```bash
npm uninstall -g @duyxyz/saca
```

---

## Controls

- **Arrows / Tab**: Navigate & Switch Panes
- **Space**: Select Apps
- **Enter**: Uninstall selected apps
- **Esc**: Clear Filter / Back
- **Ctrl + Q**: Quit

---

## Requirements
* **USB Debugging** enabled on your Android device.
* **For Standalone Version**: No additional software needed! ADB is bundled automatically.
* **For npm Version**: Requires **Node.js** ≥ 18 and **ADB** installed globally in your system PATH.



