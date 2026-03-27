# ADB App Remover

A terminal-based (TUI) application to **list** and **uninstall** apps installed on your Android device via ADB — with **full mouse support**.

---

## Features

- 🖱️ **Mouse-friendly TUI** — click to select, scroll, interact with buttons
- ⌨️ **Keyboard shortcuts** — `q` quit, `r` refresh, `u` uninstall, `/` search
- 📋 Displays all installed apps (System + 3rd Party) in two columns
- 🔍 Real-time search filtering
- 🗑️ Uninstall one or multiple selected apps with confirmation dialog
- ✅ Works in any terminal (CMD, PowerShell, Windows Terminal, etc.)

---

## Requirements

- Python 3.10+
- Android device with **Developer Options** and **USB Debugging** enabled
- ADB installed and configured in your computer's PATH
- USB connection between Android device and computer

---

## Installation

```bash
pip install -r requirements.txt
```

## Usage

1. Connect your Android device via USB (USB Debugging enabled)
2. Run the app:

```bash
python adb_uninstaller.py
```

3. **Click** on apps in the table to select/deselect them (✓ mark)
4. Use the **search box** to filter apps (click or press `/`)
5. Click **Refresh** to reload the app list
6. Click **Uninstall Selected** to remove selected apps
7. Press `q` to quit

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `r` | Refresh list |
| `u` | Uninstall selected |
| `/` | Focus search box |

---

## Notes

- Make sure your device is connected and ADB is working properly.
- Be careful when uninstalling system or critical apps.
- The application is not responsible for uninstalling the wrong apps.

---

## License

This application is released under the MIT License.
