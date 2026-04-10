# ADB App Remove

Interactive **CLI tool** to list and uninstall Android apps via ADB — runnable with a single `npx` command, no installation required.

---

## ✨ Features

- ⚡ Zero-install: run directly with `npx`
- 📋 Lists **System Apps** and **3rd Party Apps** in separate groups
- 🔍 Type to **search/filter** inside the selector
- ☑️ **Multi-select** — choose multiple apps at once
- ✅ Confirmation prompt before uninstalling
- 📊 Summary of success/failed results
- 🎨 Colorful, readable terminal output

---

## 🚀 Quick Start

> **Requires:** Node.js ≥ 18, ADB in PATH, USB Debugging enabled on device.

```bash
npx adb-app-remove
```

Or run from this repo without publishing:

```bash
npx github:duyxyz/ADB.App.Remove
```

---

## 💻 Usage

```
 ╔═══════════════════════════════╗
 ║   📱  ADB App Remove  v1.0    ║
 ╚═══════════════════════════════╝
  Uninstall Android apps via ADB

✔ Device connected!
✔ Packages loaded: 142 system  67 3rd party

  ↑↓ Navigate  •  Space: Select  •  Type to search  •  Enter: Confirm

? Select apps to uninstall: (Use arrow keys)
  ─── System Apps (142) ───
 ❯ ○ com.android.calculator2
   ○ com.android.camera2
   ...
  ─── 3rd Party Apps (67) ───
   ○ com.facebook.katana
   ...
```

---

## 📦 Local Development

```bash
git clone https://github.com/duyxyz/ADB.App.Remove
cd ADB.App.Remove
npm install
npx .
```

---

## ⚠️ Notes

- Uninstall uses `pm uninstall -k --user 0` — apps are **disabled for user 0** only, not fully removed from the system partition.
- Be careful when removing system-critical apps.

---

## License

MIT
