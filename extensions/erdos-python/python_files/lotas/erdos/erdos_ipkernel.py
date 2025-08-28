#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

"""Erdos extensions to the iPython Kernel."""

from __future__ import annotations

import enum
import logging
import os
import re
import warnings
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Container, cast

import psutil
import traitlets
from ipykernel.compiler import get_tmp_directory
from ipykernel.ipkernel import IPythonKernel
from ipykernel.kernelapp import IPKernelApp
from ipykernel.zmqshell import ZMQDisplayPublisher, ZMQInteractiveShell
from IPython.core import magic_arguments, oinspect, page
from IPython.core.error import UsageError
from IPython.core.formatters import DisplayFormatter, IPythonDisplayFormatter, catch_format_error
from IPython.core.interactiveshell import ExecutionInfo, ExecutionResult, InteractiveShell
from IPython.core.magic import Magics, MagicsManager, line_magic, magics_class
from IPython.utils import PyColorize

from .access_keys import encode_access_key
# from .connections import ConnectionsService
# from .data_explorer import DataExplorerService, DataExplorerWarning
from .help import HelpService, help
from .lsp import LSPService
from .patch.bokeh import handle_bokeh_output, patch_bokeh_no_access
from .patch.haystack import patch_haystack_is_in_jupyter
from .patch.holoviews import set_holoviews_extension
from .plots import PlotsService
from .session_mode import SessionMode
from .ui import UiService
from .utils import BackgroundJobQueue, JsonRecord, get_qualname, with_logging
# from .variables import VariablesService

if TYPE_CHECKING:
    from ipykernel.comm.manager import CommManager
    from ipykernel.control import ControlThread


class _CommTarget(str, enum.Enum):
    # DataExplorer = "erdos.dataExplorer"
    Ui = "erdos.ui"
    Help = "erdos.help"
    Lsp = "erdos.lsp"
    Plot = "erdos.plot"
    # Variables = "erdos.variables"
    Widget = "jupyter.widget"
    # Connections = "erdos.connection"


logger = logging.getLogger(__name__)


class ErdosIPythonInspector(oinspect.Inspector):
    parent: ErdosShell

    def pinfo(
        self,
        obj: Any,
        oname: str = "",
        formatter: Callable[[str], dict[str, str]] | None = None,
        info: oinspect.OInfo | None = None,
        detail_level: int = 0,
        enable_html_pager: bool = True,
        omit_sections: Container[str] = (),
    ) -> None:
        kernel = self.parent.kernel

        if detail_level == 0:
            kernel.help_service.show_help(obj)
            return None

        fname = oinspect.find_file(obj)

        if fname is None:
            return super().pinfo(
                obj,
                oname,
                formatter,
                info,
                detail_level,
                enable_html_pager,
                omit_sections,
            )

        lineno = oinspect.find_source_lines(obj) or 0
        kernel.ui_service.open_editor(fname, lineno, 0)
        return None

    pinfo.__doc__ = oinspect.Inspector.pinfo.__doc__


@magics_class
class ErdosMagics(Magics):
    shell: ErdosShell

    @line_magic
    def clear(self, line: str) -> None:
        """Clear the console."""
        self.shell.kernel.ui_service.clear_console()

    @magic_arguments.magic_arguments()
    @magic_arguments.argument(
        "object",
        help="The object or expression to view.",
    )
    @magic_arguments.argument(
        "title",
        nargs="?",
        help="The title of the Data Explorer tab. Defaults to the object's name or expression.",
    )
    @line_magic
    def view(self, line: str) -> None:
        """
        View an object or expression result in the Erdos Data Explorer.

        Examples
        --------
        View an object:

        >>> %view df

        View an expression result:

        >>> %view df.groupby('column').sum()

        View an object with a custom title (quotes are required if the title contains spaces):

        >>> %view df "My Dataset"
        """
        try:
            args = magic_arguments.parse_argstring(self.view, line)
        except UsageError as e:
            if (
                len(e.args) > 0
                and isinstance(e.args[0], str)
                and e.args[0].startswith("unrecognized arguments")
            ):
                raise UsageError(f"{e.args[0]}. Did you quote the title?") from e
            raise

        info = self.shell._ofind(args.object)

        if info.found:
            obj = info.obj
        else:
            obj_name = args.object
            if (obj_name.startswith('"') and obj_name.endswith('"')) or (
                obj_name.startswith("'") and obj_name.endswith("'")
            ):
                obj_name = obj_name[1:-1]

            try:
                obj = self.shell.ev(obj_name)
            except Exception as e:
                raise UsageError(f"Failed to evaluate expression '{obj_name}': %s" % e) from e

        title = args.title
        if title is None:
            title = args.object
        else:
            if (title.startswith('"') and title.endswith('"')) or (
                title.startswith("'") and title.endswith("'")
            ):
                title = title[1:-1]

        try:
            self.shell.kernel.data_explorer_service.register_table(
                obj, title, variable_path=[encode_access_key(args.object)]
            )
        except TypeError as e:
            raise UsageError(f"cannot view object of type '{get_qualname(obj)}'") from e

    @magic_arguments.magic_arguments()
    @magic_arguments.argument(
        "object",
        help="The connection object to show.",
    )
    @line_magic
    def connection_show(self, line: str) -> None:
        """Show a connection object in the Erdos Connections Pane."""
        args = magic_arguments.parse_argstring(self.connection_show, line)

        info = self.shell._ofind(args.object)
        if not info.found:
            raise UsageError(f"name '{args.object}' is not defined")

        try:
            self.shell.kernel.connections_service.register_connection(
                info.obj, variable_path=args.object
            )
        except TypeError as e:
            raise UsageError(f"cannot show object of type '{get_qualname(info.obj)}'") from e


_traceback_file_link_re = re.compile(r"^(File \x1b\[\d+;\d+m)(.+):(\d+)")

original_showwarning = warnings.showwarning


class ErdosDisplayFormatter(DisplayFormatter):
    @traitlets.default("ipython_display_formatter")
    def _default_formatter(self):
        return ErdosIPythonDisplayFormatter(parent=self)


class ErdosIPythonDisplayFormatter(IPythonDisplayFormatter):
    print_method = traitlets.ObjectName("_ipython_display_")
    _return_type = (type(None), bool)

    @catch_format_error
    def __call__(self, obj):
        """Compute the format for an object."""
        try:
            if obj.__module__ == "plotnine.ggplot":
                obj.draw(show=True)
                return True
        except AttributeError:
            pass
        return super().__call__(obj)


class ErdosShell(ZMQInteractiveShell):
    kernel: ErdosIPyKernel
    object_info_string_level: int
    magics_manager: MagicsManager
    display_pub: ZMQDisplayPublisher
    display_formatter: ErdosDisplayFormatter = traitlets.Instance(ErdosDisplayFormatter)

    inspector_class: type[ErdosIPythonInspector] = traitlets.Type(
        ErdosIPythonInspector,
        help="Class to use to instantiate the shell inspector",
    ).tag(config=True)

    session_mode: SessionMode = SessionMode.trait()

    def __init__(self, *args, **kwargs):
        parent = cast("ErdosIPyKernel", kwargs["parent"])
        self.session_mode = parent.session_mode

        super().__init__(*args, **kwargs)

    def init_events(self) -> None:
        super().init_events()

        self.events.register("pre_run_cell", self._handle_pre_run_cell)
        self.events.register("post_run_cell", self._handle_post_run_cell)

    @traitlets.observe("colors")
    def init_inspector(self, changes: traitlets.Bunch | None = None) -> None:
        self.inspector = self.inspector_class(
            oinspect.InspectColors,
            PyColorize.ANSICodeColors,
            self.colors,
            self.object_info_string_level,
            parent=self,
        )

    def init_hooks(self):
        super().init_hooks()

        self.set_hook("show_in_pager", page.as_hook(page.display_page), 90)

    def init_magics(self):
        super().init_magics()

        self.register_magics(ErdosMagics)

    def init_user_ns(self):
        super().init_user_ns()

        self.user_ns_hidden["help"] = help
        self.user_ns["help"] = help

        self.user_ns_hidden.update(
            {
                "_exit_code": {},
                "__pydevd_ret_val_dict": {},
                "__warningregistry__": {},
                "__nonzero__": {},
            }
        )

    def init_display_formatter(self):
        self.display_formatter = ErdosDisplayFormatter(parent=self)
        self.configurables.append(self.display_formatter)

    def _handle_pre_run_cell(self, info: ExecutionInfo) -> None:
        """Prior to execution, reset the user environment watch state."""
        raw_cell = cast("str", info.raw_cell)
        if not raw_cell or raw_cell.isspace():
            return

        try:
            self.kernel.variables_service.snapshot_user_ns()
        except Exception:
            logger.warning("Failed to snapshot user namespace", exc_info=True)

    def _handle_post_run_cell(self, result: ExecutionResult) -> None:
        """
        Send a msg.

        After execution, sends an update message to the client to summarize
        the changes observed to variables in the user's environment.
        """
        info = cast("ExecutionInfo", result.info)
        raw_cell = cast("str", info.raw_cell)
        if not raw_cell or raw_cell.isspace():
            return

        try:
            self.kernel.ui_service.poll_working_directory()
        except Exception:
            logger.exception("Error polling working directory")

        try:
            self.kernel.variables_service.poll_variables()
        except Exception:
            logger.exception("Error polling variables")

    async def _stop(self):
        await self.kernel.do_shutdown(restart=False)

        self.kernel.io_loop.stop()

    def show_usage(self):
        """Show a usage message."""
        self.kernel.help_service.show_help("erdos.utils.erdos_ipykernel_usage")

    @traitlets.observe("exit_now")
    def _update_exit_now(self, change):
        """Stop eventloop when exit_now fires."""
        if change["new"]:
            if hasattr(self.kernel, "io_loop"):
                loop = self.kernel.io_loop
                loop.call_later(0.1, self._stop)
            if self.kernel.eventloop:
                exit_hook = getattr(self.kernel.eventloop, "exit_hook", None)
                if exit_hook:
                    exit_hook(self.kernel)

    def _showtraceback(self, etype, evalue: Exception, stb: list[str]):
        """Enhance tracebacks for the Erdos frontend."""
        if self.session_mode == SessionMode.NOTEBOOK:
            return super()._showtraceback(etype, evalue, stb)

        frames = stb[2:-1]

        new_frames = []
        for frame in frames:
            lines = frame.split("\n")
            lines[0] = _traceback_file_link_re.sub(_add_osc8_link, lines[0])
            new_frames.append("\n".join(lines))

        first_frame = new_frames.pop(0) if new_frames else ""
        evalue_str = f"{evalue}\n{first_frame}"

        return super()._showtraceback(etype, evalue_str, new_frames)


def _add_osc8_link(match: re.Match) -> str:
    """Convert a link matched by `_traceback_file_link_re` to an OSC8 link."""
    pre, path, line = match.groups()
    abs_path = Path(path).expanduser()
    try:
        uri = abs_path.as_uri()
    except ValueError:
        return match.group(0)
    return pre + _link(uri, f"{path}:{line}", {"line": line})


class ErdosIPyKernel(IPythonKernel):
    """
    Erdos extension of IPythonKernel.

    Adds additional comms to introspect the user's environment.
    """

    execution_count: int
    shell: ErdosShell
    comm_manager: CommManager

    shell_class: ErdosShell = traitlets.Type(
        ErdosShell,
        klass=InteractiveShell,
    )

    session_mode: SessionMode = SessionMode.trait()

    def __init__(self, **kwargs) -> None:
        parent = cast("ErdosIPKernelApp", kwargs["parent"])
        self.session_mode = parent.session_mode

        super().__init__(**kwargs)

        self.job_queue = BackgroundJobQueue()

        # self.data_explorer_service = DataExplorerService(_CommTarget.DataExplorer, self.job_queue)
        self.plots_service = PlotsService(_CommTarget.Plot, self.session_mode)
        self.ui_service = UiService(self)
        self.help_service = HelpService()
        self.lsp_service = LSPService(self)
        # self.variables_service = VariablesService(self)
        # self.connections_service = ConnectionsService(self, _CommTarget.Connections)

        self.comm_manager.register_target(_CommTarget.Lsp, self.lsp_service.on_comm_open)
        self.comm_manager.register_target(_CommTarget.Ui, self.ui_service.on_comm_open)
        self.comm_manager.register_target(_CommTarget.Help, self.help_service.on_comm_open)
        self.comm_manager.register_target(_CommTarget.Plot, self.plots_service.on_comm_open)
        # self.comm_manager.register_target(
        #     _CommTarget.Variables, self.variables_service.on_comm_open
        # )

        warnings.showwarning = self._showwarning
        self._show_dataexplorer_warning = True

        warnings.filterwarnings(
            "ignore",
            category=UserWarning,
            message="Matplotlib is currently using module://matplotlib_inline.backend_inline",
        )
        warnings.filterwarnings(
            "ignore",
            category=UserWarning,
            message=r"Module [^\s]+ not importable in path",
            module="jedi",
        )

        set_holoviews_extension(self.ui_service)
        handle_bokeh_output(self.session_mode)

        patch_bokeh_no_access()

        patch_haystack_is_in_jupyter()

    def publish_execute_input(
        self,
        code: str,
        parent: JsonRecord,
    ) -> None:
        self._publish_execute_input(code, parent, self.execution_count - 1)

    def start(self) -> None:
        super().start()

        self.help_service.start()

    async def do_shutdown(self, restart: bool) -> JsonRecord:
        """Handle kernel shutdown."""
        logger.info("Shutting down the kernel")

        self.job_queue.shutdown()

        if hasattr(self, 'data_explorer_service'):
            self.data_explorer_service.shutdown()
        self.ui_service.shutdown()
        self.help_service.shutdown()
        self.lsp_service.shutdown()
        self.plots_service.shutdown()
        if hasattr(self, 'variables_service'):
            await self.variables_service.shutdown()
        if hasattr(self, 'connections_service'):
            self.connections_service.shutdown()

        return {"status": "ok", "restart": restart}

    def _signal_children(self, signum: int) -> None:
        super()._signal_children(signum)

        children: list[psutil.Process] = self._process_children()
        for child in children:
            if child.status() == psutil.STATUS_ZOMBIE:
                self.log.debug("Reaping zombie subprocess %s", child)
                try:
                    child.wait(timeout=0)
                except psutil.TimeoutExpired as exception:
                    self.log.warning(
                        "Error while reaping zombie subprocess %s: %s",
                        child,
                        exception,
                    )

    def _showwarning(self, message, category, filename, lineno, file=None, line=None):
        erdos_files_path = Path(__file__).parent

        console_dir = get_tmp_directory()
        if console_dir in str(filename):
            filename = f"<erdos-console-cell-{self.execution_count}>"

        # if isinstance(message, DataExplorerWarning):
        #     if not self._show_dataexplorer_warning:
        #         return None
        #     else:
        #         self._show_dataexplorer_warning = False

        if (str(erdos_files_path) in str(filename) or str(filename) == "<>"):
            # and not isinstance(message, DataExplorerWarning):
            msg = f"{filename}-{lineno}: {category}: {message}"
            logger.warning(msg)
            return None

        msg = warnings.WarningMessage(message, category, filename, lineno, file, line)

        return original_showwarning(message, category, filename, lineno, file, line)


class ErdosIPKernelApp(IPKernelApp):
    control_thread: ControlThread | None
    kernel: ErdosIPyKernel

    kernel_class: type[ErdosIPyKernel] = traitlets.Type(ErdosIPyKernel)

    session_mode: SessionMode = SessionMode.trait()

    def init_control(self, context):
        result = super().init_control(context)
        assert self.control_thread is not None
        self.control_thread.io_loop.start = with_logging(self.control_thread.io_loop.start)
        self.control_thread.io_loop.stop = with_logging(self.control_thread.io_loop.stop)
        self.control_thread.io_loop.close = with_logging(self.control_thread.io_loop.close)
        self.control_thread.run = with_logging(self.control_thread.run)
        self.control_thread.stop = with_logging(self.control_thread.stop)
        self.control_thread.join = with_logging(self.control_thread.join)
        return result

    def init_gui_pylab(self):
        if self.session_mode != SessionMode.NOTEBOOK and not os.environ.get("MPLBACKEND"):
            os.environ["MPLBACKEND"] = "module://erdos.matplotlib_backend"

        return super().init_gui_pylab()

    def close(self):
        if self.control_thread and self.control_thread.is_alive():
            self.log.debug("Closing control thread")
            self.control_thread.stop()
            self.control_thread.join(timeout=5)
            if self.control_thread.is_alive() and self.control_thread.daemon:
                self.log.warning("Control thread did not exit after 5 seconds, dropping it")
                self.control_thread = None

        super().close()


_ESC = "\x1b"
_OSC = _ESC + "]"
_OSC8 = _OSC + "8"
_ST = _ESC + "\\"


def _start_hyperlink(uri: str = "", params: dict[str, str] | None = None) -> str:
    """Start sequence for a hyperlink."""
    if params is None:
        params = {}
    params_str = ":".join(f"{key}={value}" for key, value in params.items())
    return f"{_OSC8};{params_str};{uri}" + _ST


def _end_hyperlink() -> str:
    """End sequence for a hyperlink."""
    return _start_hyperlink()


def _link(uri: str, label: str, params: dict[str, str] | None = None) -> str:
    """Create a hyperlink with the given label, URI, and params."""
    if params is None:
        params = {}
    return _start_hyperlink(uri, params) + label + _end_hyperlink()

