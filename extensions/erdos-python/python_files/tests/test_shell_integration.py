import importlib
import platform
import sys
from unittest.mock import Mock

import pythonrc

is_wsl = "microsoft-standard-WSL" in platform.release()


def test_decoration_success():
    importlib.reload(pythonrc)
    ps1 = pythonrc.PS1()

    ps1.hooks.failure_flag = False
    result = str(ps1)
    if sys.platform != "win32" and (not is_wsl):
        assert (
            result
            == "\x1b]633;C\x07\x1b]633;E;None\x07\x1b]633;D;0\x07\x1b]633;A\x07>>> \x1b]633;B\x07"
        )
    else:
        pass


def test_decoration_failure():
    importlib.reload(pythonrc)
    ps1 = pythonrc.PS1()

    ps1.hooks.failure_flag = True
    result = str(ps1)
    if sys.platform != "win32" and (not is_wsl):
        assert (
            result
            == "\x1b]633;C\x07\x1b]633;E;None\x07\x1b]633;D;1\x07\x1b]633;A\x07>>> \x1b]633;B\x07"
        )
    else:
        pass


def test_displayhook_call():
    importlib.reload(pythonrc)
    pythonrc.PS1()
    mock_displayhook = Mock()

    hooks = pythonrc.REPLHooks()
    hooks.original_displayhook = mock_displayhook

    hooks.my_displayhook("mock_value")

    mock_displayhook.assert_called_once_with("mock_value")


def test_excepthook_call():
    importlib.reload(pythonrc)
    pythonrc.PS1()
    mock_excepthook = Mock()

    hooks = pythonrc.REPLHooks()
    hooks.original_excepthook = mock_excepthook

    hooks.my_excepthook("mock_type", "mock_value", "mock_traceback")
    mock_excepthook.assert_called_once_with("mock_type", "mock_value", "mock_traceback")


if sys.platform == "darwin":

    def test_print_statement_darwin(monkeypatch):
        importlib.reload(pythonrc)
        with monkeypatch.context() as m:
            m.setattr("builtins.print", Mock())
            importlib.reload(sys.modules["pythonrc"])
            print.assert_any_call("Cmd click to launch VS Code Native REPL")


if sys.platform == "win32":

    def test_print_statement_non_darwin(monkeypatch):
        importlib.reload(pythonrc)
        with monkeypatch.context() as m:
            m.setattr("builtins.print", Mock())
            importlib.reload(sys.modules["pythonrc"])
            print.assert_any_call("Ctrl click to launch VS Code Native REPL")
