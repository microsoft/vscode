import platform
import sys

if sys.platform != "win32":
    import readline

original_ps1 = ">>> "
is_wsl = "microsoft-standard-WSL" in platform.release()


class REPLHooks:
    def __init__(self):
        self.global_exit = None
        self.failure_flag = False
        self.original_excepthook = sys.excepthook
        self.original_displayhook = sys.displayhook
        sys.excepthook = self.my_excepthook
        sys.displayhook = self.my_displayhook

    def my_displayhook(self, value):
        if value is None:
            self.failure_flag = False

        self.original_displayhook(value)

    def my_excepthook(self, type_, value, traceback):
        self.global_exit = value
        self.failure_flag = True

        self.original_excepthook(type_, value, traceback)


def get_last_command():
    # Get the last history item
    last_command = ""
    if sys.platform != "win32":
        last_command = readline.get_history_item(readline.get_current_history_length())

    return last_command


class PS1:
    hooks = REPLHooks()
    sys.excepthook = hooks.my_excepthook
    sys.displayhook = hooks.my_displayhook

    # str will get called for every prompt with exit code to show success/failure
    def __str__(self):
        exit_code = int(bool(self.hooks.failure_flag))
        self.hooks.failure_flag = False
        # Guide following official VS Code doc for shell integration sequence:
        result = ""
        # For non-windows allow recent_command history.
        if sys.platform != "win32":
            result = "{command_executed}{command_line}{command_finished}{prompt_started}{prompt}{command_start}".format(
                command_executed="\x1b]633;C\x07",
                command_line="\x1b]633;E;" + str(get_last_command()) + "\x07",
                command_finished="\x1b]633;D;" + str(exit_code) + "\x07",
                prompt_started="\x1b]633;A\x07",
                prompt=original_ps1,
                command_start="\x1b]633;B\x07",
            )
        else:
            result = "{command_finished}{prompt_started}{prompt}{command_start}{command_executed}".format(
                command_finished="\x1b]633;D;" + str(exit_code) + "\x07",
                prompt_started="\x1b]633;A\x07",
                prompt=original_ps1,
                command_start="\x1b]633;B\x07",
                command_executed="\x1b]633;C\x07",
            )

        # result = f"{chr(27)}]633;D;{exit_code}{chr(7)}{chr(27)}]633;A{chr(7)}{original_ps1}{chr(27)}]633;B{chr(7)}{chr(27)}]633;C{chr(7)}"

        return result


if sys.platform != "win32" and (not is_wsl):
    sys.ps1 = PS1()

if sys.platform == "darwin":
    print("Cmd click to launch VS Code Native REPL")
else:
    print("Ctrl click to launch VS Code Native REPL")
