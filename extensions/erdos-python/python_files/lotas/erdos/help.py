#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import contextlib
import logging
import pydoc
from types import MappingProxyType
from typing import TYPE_CHECKING, Any

from .help_comm import (
    HelpBackendMessageContent,
    HelpFrontendEvent,
    SearchHelpTopicsRequest,
    ShowHelpKind,
    ShowHelpParams,
    ShowHelpTopicRequest,
)
from .erdos_comm import CommMessage, ErdosComm
from .help_search import search_help_topics_rpc
from .pydoc import start_server
from .utils import JsonRecord, get_qualname

if TYPE_CHECKING:
    from comm.base_comm import BaseComm

logger = logging.getLogger(__name__)


def help(topic="help"):
    """
    Show help for the given topic.

    Examples
    --------

    Show help for the `help` function itself:

    >>> help()

    Show help for a type:

    >>> import pandas
    >>> help(pandas.DataFrame)

    A string import path works too:

    >>> help("pandas.DataFrame")

    Show help for a type given an instance:

    >>> df = pandas.DataFrame()
    >>> help(df)
    """
    from .erdos_ipkernel import ErdosIPyKernel

    if ErdosIPyKernel.initialized():
        kernel = ErdosIPyKernel.instance()
        kernel.help_service.show_help(topic)
    else:
        raise Exception("Unexpected error. No ErdosIPyKernel has been initialized.")


class HelpService:
    """Manages the help server and submits help-related events to the `FrontendService`."""

    _QUALNAME_OVERRIDES = MappingProxyType(
        {
            "pandas.core.frame": "pandas",
            "pandas.core.series": "pandas",
        }
    )

    def __init__(self):
        self._comm: ErdosComm | None = None
        self._pydoc_thread = None

    def on_comm_open(self, comm: BaseComm, _msg: JsonRecord) -> None:
        self._comm = ErdosComm(comm)
        self._comm.on_msg(self.handle_msg, HelpBackendMessageContent)

    def handle_msg(self, msg: CommMessage[HelpBackendMessageContent], _raw_msg: JsonRecord) -> None:
        """Handle messages received from the client via the erdos.help comm."""
        request = msg.content.data

        if isinstance(request, ShowHelpTopicRequest):
            if self._comm is not None:
                self._comm.send_result(data=True)
            self.show_help(request.params.topic)

        elif isinstance(request, SearchHelpTopicsRequest):
            if self._comm is not None:
                search_results = search_help_topics_rpc(request.params.query)
                self._comm.send_result(data=search_results)

        else:
            logger.warning(f"Unhandled request: {request}")

    def shutdown(self) -> None:
        if self._pydoc_thread is not None and self._pydoc_thread.serving:
            logger.info("Stopping pydoc server thread")
            self._pydoc_thread.stop()
            logger.info("Pydoc server thread stopped")
        if self._comm is not None:
            with contextlib.suppress(Exception):
                self._comm.close()

    def start(self):
        self._pydoc_thread = start_server()
        
        # Warm the help cache now that kernel is fully initialized and MPLBACKEND is set
        try:
            from .help_search import warm_help_cache
            warm_help_cache()
        except Exception as e:
            logger.warning(f"Failed to warm help cache: {e}")

    def show_help(self, request: str | Any | None) -> None:
        if self._pydoc_thread is None or not self._pydoc_thread.serving:
            logger.warning("Ignoring help request, the pydoc server is not serving")
            return

        result = None
        with contextlib.suppress(ImportError):
            result = pydoc.resolve(thing=request)

        if result is None:
            key = request
        else:
            obj = result[0]
            key = get_qualname(obj)

            for old, new in self._QUALNAME_OVERRIDES.items():
                if key.startswith(old):
                    key = key.replace(old, new)
                    break

        url = f"{self._pydoc_thread.url}get?key={key}"

        event = ShowHelpParams(content=url, kind=ShowHelpKind.Url, focus=True)
        if self._comm is not None:
            self._comm.send_event(name=HelpFrontendEvent.ShowHelp.value, payload=event.dict())

