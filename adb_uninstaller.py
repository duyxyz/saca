import sys
import subprocess
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Header, Static, Input, Button, DataTable
from textual.binding import Binding
from textual.screen import ModalScreen


class ConfirmScreen(ModalScreen[bool]):
    """Simple confirm dialog."""

    DEFAULT_CSS = """
    ConfirmScreen {
        align: center middle;
    }
    #dialog {
        width: 50;
        height: auto;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    #dialog Label {
        width: 100%;
        text-align: center;
        margin-bottom: 1;
    }
    #dialog-buttons {
        width: 100%;
        align: center middle;
        height: auto;
    }
    #dialog-buttons Button {
        margin: 0 1;
    }
    """

    def __init__(self, msg: str) -> None:
        super().__init__()
        self.msg = msg

    def compose(self) -> ComposeResult:
        from textual.widgets import Label
        with Vertical(id="dialog"):
            yield Label(self.msg)
            with Horizontal(id="dialog-buttons"):
                yield Button("Yes", variant="error", id="yes")
                yield Button("No", variant="primary", id="no")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss(event.button.id == "yes")


class ResultScreen(ModalScreen):
    """Simple result dialog."""

    DEFAULT_CSS = """
    ResultScreen {
        align: center middle;
    }
    #result-diag {
        width: 40;
        height: auto;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    #result-diag Label {
        width: 100%;
        text-align: center;
        margin-bottom: 1;
    }
    #result-ok {
        width: 100%;
        align: center middle;
    }
    """

    def __init__(self, msg: str) -> None:
        super().__init__()
        self.msg = msg

    def compose(self) -> ComposeResult:
        from textual.widgets import Label
        with Vertical(id="result-diag"):
            yield Label(self.msg)
            with Horizontal(id="result-ok"):
                yield Button("OK", variant="primary", id="ok")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss()


class ADBUninstaller(App):
    """ADB App Remover — TUI"""

    TITLE = "ADB App Remover"

    CSS = """
    Screen {
        background: #1e1e2e;
    }

    Header {
        background: #6c5b9e;
        color: #e0def4;
    }

    #info-bar {
        height: 1;
        background: #302d41;
        color: #c4b7d5;
        padding: 0 1;
        layout: horizontal;
    }

    #info-left {
        width: 1fr;
    }

    #info-right {
        width: auto;
    }

    #tables {
        height: 1fr;
        margin-bottom: 0;
    }

    .col {
        width: 1fr;
        border: solid #45405e;
        background: #1e1e2e;
    }

    .col:focus, .col:focus-within {
        border: solid #45405e;
        background: #1e1e2e;
    }

    .col-title {
        background: #6c5b9e;
        color: #e0def4;
        text-align: center;
        text-style: bold;
        height: 1;
        padding: 0 1;
    }

    DataTable {
        height: 1fr;
        background: #1e1e2e;
        scrollbar-background: #1e1e2e;
        scrollbar-background-hover: #1e1e2e;
        scrollbar-background-active: #1e1e2e;
        scrollbar-color: #4c3a7a;
        scrollbar-color-hover: #5d4a96;
        scrollbar-color-active: #7c6faa;
        border: none;
    }

    DataTable:focus {
        border: none;
        background: #1e1e2e;
    }

    DataTable > .datatable--header {
        background: #45405e;
        color: #c4b7d5;
        text-style: bold;
    }

    DataTable > .datatable--cursor {
        background: #3a3650;
        color: #ffffff;
        text-style: bold;
    }

    DataTable > .datatable--hover {
        background: #2a2a3e;
    }

    ScrollBar {
        background: #1e1e2e;
        color: #4c3a7a;
    }

    ScrollBar > .scrollbar--highlight {
        color: #5d4a96;
        background: #1e1e2e;
    }

    ScrollBar > .scrollbar--grabbed {
        color: #7c6faa;
        background: #1e1e2e;
    }

    #bottom-bar {
        height: 3;
        padding: 0 1;
        margin-bottom: 1;
        background: #1e1e2e;
    }

    #search {
        width: 1fr;
        margin-right: 1;
        background: #302d41;
        color: #e0def4;
        border: tall #45405e;
    }

    Button.-primary {
        background: #6c5b9e;
        color: #e0def4;
    }

    Button.-error {
        background: #8b3a62;
        color: #e0def4;
    }

    #status-bar {
        height: 1;
        background: #302d41;
        color: #c4b7d5;
        padding: 0 1;
        layout: horizontal;
        margin-top: 0;
    }

    #status {
        width: 1fr;
    }

    #key-hints {
        width: auto;
    }

    Footer {
        display: none;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", show=False),
        Binding("r", "refresh", "Refresh", show=False),
        Binding("u", "uninstall", "Uninstall", show=False),
    ]

    def __init__(self):
        super().__init__()
        self.sys_packages: list[str] = []
        self.user_packages: list[str] = []
        self.selected_sys: set[str] = set()
        self.selected_user: set[str] = set()
        self._info_left_text: str = ""

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="info-bar"):
            yield Static("System: 0 | 3rd Party: 0 | Total: 0", id="info-left")
            yield Static("", id="info-right")
        with Horizontal(id="tables"):
            v1 = Vertical(classes="col")
            v1.can_focus = False
            with v1:
                yield Static("System Apps", classes="col-title")
                yield DataTable(id="t-sys", cursor_type="row", show_header=False)
            
            v2 = Vertical(classes="col")
            v2.can_focus = False
            with v2:
                yield Static("3rd Party Apps", classes="col-title")
                yield DataTable(id="t-user", cursor_type="row", show_header=False)
                
        with Horizontal(id="bottom-bar"):
            yield Input(placeholder="Search...", id="search")
            yield Button("Refresh", variant="primary", id="btn-r")
            yield Button("Uninstall", variant="error", id="btn-u")
        with Horizontal(id="status-bar"):
            yield Static("Waiting...", id="status")
            yield Static("[b][white][u]Q[/u][/white][/b] Quit  [b][white][u]R[/u][/white][/b] Refresh  [b][white][u]U[/u][/white][/b] Uninstall", id="key-hints")

    def on_mount(self) -> None:
        for tid in ("t-sys", "t-user"):
            t = self.query_one(f"#{tid}", DataTable)
            t.add_column("✓", key="sel", width=3)
            t.add_column("Package", key="pkg")
        self.load_packages()

    def _run_adb(self, args: list[str]) -> subprocess.CompletedProcess:
        si = None
        if sys.platform == "win32":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        return subprocess.run(args, capture_output=True, text=True, startupinfo=si)

    def get_packages(self):
        try:
            r1 = self._run_adb(["adb", "shell", "pm", "list", "packages", "-s", "--user", "0"])
            if r1.returncode != 0:
                return [], [], "ADB error or device not connected"
            sys_p = sorted(l.replace("package:", "").strip() for l in r1.stdout.strip().split("\n") if l.strip())

            r2 = self._run_adb(["adb", "shell", "pm", "list", "packages", "-3", "--user", "0"])
            usr_p = sorted(l.replace("package:", "").strip() for l in r2.stdout.strip().split("\n") if l.strip())
            return sys_p, usr_p, ""
        except Exception as e:
            return [], [], str(e)

    def uninstall_pkg(self, pkg: str) -> tuple[bool, str]:
        r = self._run_adb(["adb", "shell", "pm", "uninstall", "-k", "--user", "0", pkg])
        return ("Success" in r.stdout, r.stdout.strip())

    def status(self, txt: str):
        self.query_one("#status", Static).update(txt)

    def info(self, left: str, right: str = ""):
        self._info_left_text = left
        self.query_one("#info-left", Static).update(left)
        self.query_one("#info-right", Static).update(right)

    def fill_table(self, tid: str, pkgs: list[str]):
        t = self.query_one(f"#{tid}", DataTable)
        sel = self.selected_sys if tid == "t-sys" else self.selected_user
        t.clear()
        for p in pkgs:
            t.add_row("✓" if p in sel else " ", p, key=p)

    def load_packages(self):
        self.status("Loading...")
        self.selected_sys.clear()
        self.selected_user.clear()
        s, u, err = self.get_packages()
        if err:
            self.status(err)
            self.sys_packages, self.user_packages = [], []
            self.fill_table("t-sys", [])
            self.fill_table("t-user", [])
            return
        self.sys_packages, self.user_packages = s, u
        self.fill_table("t-sys", s)
        self.fill_table("t-user", u)
        self.info(f"System: {len(s)}  |  3rd Party: {len(u)}  |  Total: {len(s)+len(u)}", "")
        self.status("Ready")

    def apply_filter(self, kw: str):
        kw = kw.strip().lower()
        fs = [p for p in self.sys_packages if kw in p.lower()] if kw else self.sys_packages
        fu = [p for p in self.user_packages if kw in p.lower()] if kw else self.user_packages
        self.fill_table("t-sys", fs)
        self.fill_table("t-user", fu)

    def on_data_table_row_selected(self, ev: DataTable.RowSelected):
        t = ev.data_table
        key = ev.row_key.value
        if not key:
            return
        sel = self.selected_sys if t.id == "t-sys" else self.selected_user
        if key in sel:
            sel.discard(key)
            t.update_cell(ev.row_key, "sel", " ")
        else:
            sel.add(key)
            t.update_cell(ev.row_key, "sel", "✓")
        n = len(self.selected_sys) + len(self.selected_user)
        self.status(f"{n} selected" if n else "Ready")

    def on_input_changed(self, ev: Input.Changed):
        if ev.input.id == "search":
            self.apply_filter(ev.value)

    def on_button_pressed(self, ev: Button.Pressed):
        if ev.button.id == "btn-r":
            self.action_refresh()
        elif ev.button.id == "btn-u":
            self.action_uninstall()

    def action_refresh(self):
        self.query_one("#search", Input).value = ""
        self.load_packages()

    def action_uninstall(self):
        pkgs = list(self.selected_sys | self.selected_user)
        if not pkgs:
            self.status("Nothing selected")
            return

        def on_confirm(yes: bool):
            if not yes:
                return
            ok = fail = 0
            for p in pkgs:
                self.status(f"Removing {p}...")
                s, _ = self.uninstall_pkg(p)
                if s:
                    ok += 1
                else:
                    fail += 1
            self.load_packages()
            res_right = f"[green]\u2713 {ok} removed[/] | [red]\u2717 {fail} failed[/]"
            self.query_one("#info-right", Static).update(res_right)
            self.status(f"Done: {ok} removed, {fail} failed")

        self.push_screen(ConfirmScreen(f"Uninstall {len(pkgs)} app(s)?"), on_confirm)


if __name__ == "__main__":
    ADBUninstaller().run()