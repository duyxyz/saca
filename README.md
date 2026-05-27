# SACA (System Adb Cleaner Assistant)

Full-screen TUI tool to quickly uninstall Android bloatware via ADB.

## Installation

### Windows (No Node.js)

*   **Install:**
    ```powershell
    irm https://raw.githubusercontent.com/duyxyz/saca/main/install.ps1 | iex
    ```
*   **Uninstall:**
    ```powershell
    Remove-Item -Path "$env:USERPROFILE\.saca" -Recurse -Force; [Environment]::SetEnvironmentVariable("PATH", ([Environment]::GetEnvironmentVariable("PATH", "User") -split ';' | Where-Object { $_ -ne "$env:USERPROFILE\.saca" }) -join ';', "User")
    ```

### macOS & Linux (No Node.js)
Download and extract from [Releases](https://github.com/duyxyz/saca/releases).

### Via Node.js / npm (Direct from GitHub)

*   **Run without install:**
    ```bash
    npx github:duyxyz/saca
    ```
*   **Install globally:**
    ```bash
    npm install -g duyxyz/saca
    ```
*   **Uninstall:**
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
- **Standalone Version**: ADB is bundled automatically (no setup required on Windows).
- **npm Version**: Requires Node.js ≥ 18 and ADB installed in system PATH.
