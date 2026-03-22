import sys
import subprocess
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QLineEdit, QListWidget,
    QPushButton, QVBoxLayout, QHBoxLayout, QMessageBox, QListWidgetItem, QAbstractItemView
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QIcon


# Hide console window on Windows
if sys.platform == "win32":
    import ctypes
    ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)

class ADBUninstaller(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ADB App Uninstaller")
        self.resize(370, 520)
        self.setWindowIcon(QIcon("app_icon.ico"))

        self.all_packages = []

        # List widget for showing package list
        self.listwidget = QListWidget()
        self.listwidget.setSelectionMode(QAbstractItemView.SelectionMode.MultiSelection)

        # Search box
        self.search_entry = QLineEdit()
        self.search_entry.setPlaceholderText("Search apps...")
        self.search_entry.textChanged.connect(self.search_package)

        # Buttons layout
        btn_layout = QHBoxLayout()
        self.btn_refresh = QPushButton("Refresh")
        self.btn_refresh.clicked.connect(self.refresh_list)
        self.btn_uninstall = QPushButton("Uninstall Selected")
        self.btn_uninstall.clicked.connect(self.uninstall_selected)

        btn_layout.addWidget(self.btn_refresh)
        btn_layout.addWidget(self.btn_uninstall)

        # Status label
        self.status_label = QLabel("Waiting for action...")
        self.status_label.setStyleSheet("color: blue;")

        # Main layout
        main_layout = QVBoxLayout()
        main_layout.addWidget(self.listwidget)
        main_layout.addWidget(self.search_entry)
        main_layout.addLayout(btn_layout)
        main_layout.addWidget(self.status_label)

        self.setLayout(main_layout)

        # Load package list at start
        self.refresh_list()

    def get_installed_packages(self):
        try:
            cmd = ["adb", "shell", "pm", "list", "packages", "--user", "0"]
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            result = subprocess.run(cmd, capture_output=True, text=True, startupinfo=startupinfo)
            if result.returncode != 0:
                return [], "ADB not running or device not connected!"
            lines = result.stdout.strip().split('\n')
            packages = [line.replace("package:", "").strip() for line in lines if line]
            return packages, ""
        except Exception as e:
            return [], f"Error: {str(e)}"

    def uninstall_package(self, pkg):
        cmd = ["adb", "shell", "pm", "uninstall", "-k", "--user", "0", pkg]
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        result = subprocess.run(cmd, capture_output=True, text=True, startupinfo=startupinfo)
        output = result.stdout.strip()
        if "Success" in output:
            return True, f"Successfully uninstalled: {pkg}"
        else:
            return False, f"Failed to uninstall: {pkg} - {output}"

    def refresh_list(self):
        self.status_label.setText("Loading package list...")
        QApplication.processEvents()  # Update UI

        pkgs, err = self.get_installed_packages()
        if err:
            QMessageBox.critical(self, "Error", err)
            self.status_label.setText(err)
            self.all_packages = []
            self.listwidget.clear()
            return

        self.all_packages = pkgs
        self.update_listbox(self.all_packages)
        self.status_label.setText(f"Loaded {len(pkgs)} apps.")

    def update_listbox(self, pkg_list):
        self.listwidget.clear()
        for pkg in pkg_list:
            item = QListWidgetItem(pkg)
            self.listwidget.addItem(item)
        self.status_label.setText(f"Showing {len(pkg_list)} apps.")

    def search_package(self):
        keyword = self.search_entry.text().strip().lower()
        if not self.all_packages:
            return
        if keyword == "":
            self.update_listbox(self.all_packages)
        else:
            filtered = [pkg for pkg in self.all_packages if keyword in pkg.lower()]
            self.update_listbox(filtered)

    def uninstall_selected(self):
        selected_items = self.listwidget.selectedItems()
        if not selected_items:
            QMessageBox.warning(self, "No Selection", "Please select apps to uninstall.")
            return
        pkgs = [item.text() for item in selected_items]

        reply = QMessageBox.question(
            self,
            "Confirm",
            f"Are you sure you want to uninstall {len(pkgs)} app(s)?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply != QMessageBox.StandardButton.Yes:
            return

        ok, fail = 0, 0
        for pkg in pkgs:
            success, msg = self.uninstall_package(pkg)
            if success:
                ok += 1
            else:
                fail += 1
            self.status_label.setText(msg)
            QApplication.processEvents()

        QMessageBox.information(self, "Result", f"Success: {ok}\nFailed: {fail}")
        self.refresh_list()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle('windowsvista')
    window = ADBUninstaller()
    window.show()
    sys.exit(app.exec())