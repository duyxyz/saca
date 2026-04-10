# SACA (System Adb Cleaner Assistant)

Interactive CLI tool to list and uninstall Android apps via ADB. Super fast, full-screen TUI runnable with a single `npx` command.

---

## ✨ Features

- ⚡ **Zero-install**: run directly with `npx saca`
- 🖥️ **Full-screen TUI**: Responsive terminal interface with split panes
- 📋 **Grouped View**: System Apps and User Apps in side-by-side columns
- 🔍 **Fast Search**: Type any character to filter the list instantly
- ☑️ **Multi-select**: Toggle multiple apps with `Space` and review before purge
- 🔄 **Auto-Refresh**: Automatically reloads device state after uninstallation
- 🎨 **Modern Aesthetics**: Bullet points, markers, and curated colors

---

## 🚀 Quick Start

> **Requires:** Node.js ≥ 18, ADB in PATH, USB Debugging enabled on device.

Run directly via NPM:

```bash
npx saca
```

Or run directly from the GitHub repository:

```bash
npx github:duyxyz/saca
```

---

## ⌨️ Controls

- **Up/Down Arrows**: Navigate the active list
- **Left/Right Arrows / Tab**: Switch between System and User panes
- **Space**: Toggle selection of the current app
- **Enter**: Proceed to review screen / Confirm uninstallation
- **Esc**: Clear the current search filter / Go back
- **Ctrl + Q**: Quit the application

---

## 📦 Local Development

```bash
git clone https://github.com/duyxyz/saca
cd saca
npm install
npx .
```

---

## ⚠️ Notes

- Uninstall uses `pm uninstall -k --user 0` — apps are **disabled for user 0** only, ensuring safety while effectively debloating.
- Be careful when removing system-critical apps.

---

## License

MIT
