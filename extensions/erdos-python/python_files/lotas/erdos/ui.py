#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import contextlib
import inspect
import logging
import os
import sys
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Dict, List, Optional, Union
from urllib.parse import urlparse

from comm.base_comm import BaseComm

from ._vendor.pydantic import BaseModel
from .erdos_comm import CommMessage, ErdosComm
from .ui_comm import (
    CallMethodParams,
    CallMethodRequest,
    OpenEditorParams,
    ShowHtmlFileParams,
    ShowUrlParams,
    UiBackendMessageContent,
    UiFrontendEvent,
    WorkingDirectoryParams,
)
from .utils import JsonData, JsonRecord, alias_home, is_local_html_file

if TYPE_CHECKING:
    from .erdos_ipkernel import ErdosIPyKernel

logger = logging.getLogger(__name__)

_localhosts = [
    "localhost",
    "127.0.0.1",
    "[0:0:0:0:0:0:0:1]",
    "[::1]",
    "0.0.0.0",
    "[0:0:0:0:0:0:0:0]",
    "[::]",
]


class _InvalidParamsError(Exception):
    pass


def _is_module_loaded(kernel: "ErdosIPyKernel", params: List[JsonData]) -> bool:
    if not (isinstance(params, list) and len(params) == 1 and isinstance(params[0], str)):
        raise _InvalidParamsError(f"Expected a module name, got: {params}")
    return params[0] in kernel.shell.user_ns


def _get_loaded_modules(kernel: "ErdosIPyKernel", _params: List[JsonData]) -> Optional[JsonData]:
    return [
        name
        for name in kernel.shell.user_ns
        if not name.startswith("_") and isinstance(kernel.shell.user_ns[name], type(sys))
    ]


def _set_console_width(_kernel: "ErdosIPyKernel", params: List[JsonData]) -> None:
    if not (isinstance(params, list) and len(params) == 1 and isinstance(params[0], int)):
        raise _InvalidParamsError(f"Expected an integer width, got: {params}")

    width = params[0]

    os.environ["COLUMNS"] = str(width)

    if "numpy" in sys.modules:
        import numpy as np

        np.set_printoptions(linewidth=width)

    if "pandas" in sys.modules:
        import pandas as pd

        pd.set_option("display.width", None)

    if "polars" in sys.modules:
        import polars as pl

        pl.Config.set_tbl_width_chars(width)

    if "torch" in sys.modules:
        import torch

        torch.set_printoptions(linewidth=width)


def _suggest_help_topics(kernel: "ErdosIPyKernel", params: List[JsonData]) -> List[str]:
    """
    Suggest Python help topics based on a query string.
    Similar to R's suggest_topics method for AI context attachment.
    """
    if not (isinstance(params, list) and len(params) == 1 and isinstance(params[0], str)):
        raise _InvalidParamsError(f"Expected a query string, got: {params}")
    
    query = params[0].strip().lower()
    if not query:
        return []
    
    suggestions = []
    
    for name, obj in kernel.shell.user_ns.items():
        if name.startswith('_'):
            continue
        if query in name.lower():
            suggestions.append(name)
    
    import builtins
    for name in dir(builtins):
        if name.startswith('_'):
            continue
        if query in name.lower():
            suggestions.append(name)
    
    import sys
    for module_name, module in sys.modules.items():
        if module is None or module_name.startswith('_'):
            continue
        
        if query in module_name.lower():
            suggestions.append(module_name)
        
        try:
            for attr_name in dir(module):
                if attr_name.startswith('_'):
                    continue
                if query in attr_name.lower():
                    full_name = f"{module_name}.{attr_name}"
                    suggestions.append(full_name)
        except Exception:
            continue
    
    unique_suggestions = sorted(list(set(suggestions)))
    
    return unique_suggestions[:50]




_RPC_METHODS: Dict[str, Callable[["ErdosIPyKernel", List[JsonData]], Optional[JsonData]]] = {
    "setConsoleWidth": _set_console_width,
    "isModuleLoaded": _is_module_loaded,
    "getLoadedModules": _get_loaded_modules,
    "suggest_help_topics": _suggest_help_topics,

}


class UiService:
    """
    Wrapper around a comm channel whose lifetime matches that of the Erdos frontend.

    Used for communication with the frontend, unscoped to any particular view.
    """

    def __init__(self, kernel: "ErdosIPyKernel") -> None:
        self.kernel = kernel

        # Store active comm channels by comm_id to respond on correct channel
        self._comms: dict[str, ErdosComm] = {}

        self._working_directory: Optional[Path] = None

    def on_comm_open(self, comm: BaseComm, _msg: JsonRecord) -> None:
        erdos_comm = ErdosComm(comm)
        self._comms[comm.comm_id] = erdos_comm
        erdos_comm.on_msg(lambda msg, raw_msg: self.handle_msg(msg, raw_msg, erdos_comm), UiBackendMessageContent)

        self.browser = ErdosViewerBrowser(comm=erdos_comm)
        webbrowser.register(
            self.browser.name,
            ErdosViewerBrowser,
            self.browser,
            preferred=True,
        )

        self._working_directory = None
        try:
            self.poll_working_directory()
        except Exception:
            logger.exception("Error polling working directory")

    def poll_working_directory(self) -> None:
        """
        Polls for changes to the working directory.

        And sends an event to the front end if the working directory has changed.
        """
        current_dir = Path.cwd()

        if current_dir != self._working_directory:
            self._working_directory = current_dir
            if self._comm is not None:
                event = WorkingDirectoryParams(directory=str(alias_home(current_dir)))
                self._send_event(name=UiFrontendEvent.WorkingDirectory, payload=event)

    def open_editor(self, file: str, line: int, column: int) -> None:
        event = OpenEditorParams(file=file, line=line, column=column)
        self._send_event(name=UiFrontendEvent.OpenEditor, payload=event)

    def clear_console(self) -> None:
        self._send_event(name=UiFrontendEvent.ClearConsole, payload={})

    def clear_webview_preloads(self) -> None:
        self._send_event(name=UiFrontendEvent.ClearWebviewPreloads, payload={})

    def handle_msg(self, msg: CommMessage[UiBackendMessageContent], _raw_msg: JsonRecord, comm: ErdosComm) -> None:
        request = msg.content.data

        if isinstance(request, CallMethodRequest):
            self._call_method(request.params, comm)

        else:
            logger.warning(f"Unhandled request: {request}")

    def _call_method(self, rpc_request: CallMethodParams, comm: ErdosComm) -> None:
        func = _RPC_METHODS.get(rpc_request.method, None)
        if func is None:
            return logger.warning(f"Invalid frontend RPC request method: {rpc_request.method}")

        try:
            result = func(self.kernel, rpc_request.params)
        except _InvalidParamsError as exception:
            return logger.warning(
                f"Invalid frontend RPC request params for method '{rpc_request.method}'. {exception}"
            )

        comm.send_result(data=result)
        return None

    def shutdown(self) -> None:
        for comm in self._comms.values():
            with contextlib.suppress(Exception):
                comm.close()
        self._comms.clear()

    def _send_event(self, name: str, payload: Union[BaseModel, JsonRecord]) -> None:
        if isinstance(payload, BaseModel):
            payload = payload.dict()
        for comm in self._comms.values():
            comm.send_event(name=name, payload=payload)


class ErdosViewerBrowser(webbrowser.BaseBrowser):
    """Launcher class for Erdos Viewer browsers."""

    def __init__(
        self,
        name: str = "erdos_viewer",
        comm: Optional[ErdosComm] = None,
    ):
        self.name = name
        self._comm = comm

    def open(self, url, new=0, autoraise=True) -> bool:
        if not self._comm:
            return False

        is_plot = False
        if is_local_html_file(url):
            is_plot = self._is_module_function("bokeh.io.showing", "show")

            return self._send_show_html_event(url, is_plot)

        for addr in _localhosts:
            if addr in url:
                is_plot = self._is_module_function("plotly.basedatatypes")
                if is_plot:
                    return self._send_show_html_event(url, is_plot)
                else:
                    event = ShowUrlParams(url=url)
                    self._comm.send_event(name=UiFrontendEvent.ShowUrl, payload=event.dict())

                return True
        return False

    @staticmethod
    def _is_module_function(module_name: str, function_name: Union[str, None] = None) -> bool:
        module = sys.modules.get(module_name)
        if module:
            for frame_info in inspect.stack():
                if function_name:
                    if (
                        inspect.getmodule(frame_info.frame, frame_info.filename) == module
                        and frame_info.function == function_name
                    ):
                        return True
                else:
                    if inspect.getmodule(frame_info.frame) == module:
                        return True
        return False

    def _send_show_html_event(self, url: str, is_plot: bool) -> bool:
        if self._comm is None:
            logger.warning("No comm available to send ShowHtmlFile event")
            return False
        if os.name == "nt" and is_local_html_file(url):
            url = urlparse(url).netloc or urlparse(url).path
        self._comm.send_event(
            name=UiFrontendEvent.ShowHtmlFile,
            payload=ShowHtmlFileParams(
                path=url,
                title="",
                is_plot=is_plot,
                height=0,
            ).dict(),
        )
        return True

