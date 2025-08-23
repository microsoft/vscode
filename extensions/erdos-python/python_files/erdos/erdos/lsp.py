#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

import contextlib
import logging
from typing import TYPE_CHECKING, Any, Dict, Optional

from comm.base_comm import BaseComm

from .erdos_jedilsp import ERDOS

if TYPE_CHECKING:
    from .erdos_ipkernel import ErdosIPyKernel


logger = logging.getLogger(__name__)


class LSPService:
    """LSPService manages the erdos.lsp comm and coordinates starting the LSP."""

    def __init__(self, kernel: "ErdosIPyKernel"):
        self._kernel = kernel
        self._comm: Optional[BaseComm] = None

    def on_comm_open(self, comm: BaseComm, msg: Dict[str, Any]) -> None:
        """Setup erdos.lsp comm to receive messages."""
        self._comm = comm

        comm.on_msg(self._receive_message)

        data = msg["content"]["data"]
        ip_address = data.get("ip_address", None)
        if ip_address is None:
            logger.warning(f"No ip_address in LSP comm open message: {msg}")
            return

        ERDOS.start(lsp_host=ip_address, shell=self._kernel.shell, comm=comm)

    def _receive_message(self, msg: Dict[str, Any]) -> None:
        """Handle messages received from the client via the erdos.lsp comm."""

    def shutdown(self) -> None:
        ERDOS.stop()

        if self._comm is not None:
            with contextlib.suppress(Exception):
                self._comm.close()

