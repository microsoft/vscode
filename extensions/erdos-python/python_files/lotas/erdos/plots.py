#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

from __future__ import annotations

import base64
import logging
import uuid
from typing import TYPE_CHECKING, Protocol

from .plot_comm import (
    GetIntrinsicSizeRequest,
    IntrinsicSize,
    PlotBackendMessageContent,
    PlotFrontendEvent,
    PlotResult,
    PlotSize,
    PlotUnit,
    RenderRequest,
)
from .erdos_comm import CommMessage, ErdosComm

if TYPE_CHECKING:
    from .session_mode import SessionMode
    from .utils import JsonRecord

logger = logging.getLogger(__name__)


MIME_TYPE = {
    "png": "image/png",
    "svg": "image/svg+xml",
    "pdf": "application/pdf",
    "jpeg": "image/jpeg",
    "tiff": "image/tiff",
}


class Plot:
    """
    The backend representation of a frontend plot instance.

    Paramaters
    ----------
    comm
        The communication channel to the frontend plot instance.
    render
        A callable that renders the plot. See `plot_comm.RenderRequest` for parameter details.
    intrinsic_size
        The intrinsic size of the plot in inches.
    """

    def __init__(
        self,
        comm: ErdosComm,
        render: Renderer,
        intrinsic_size: tuple[int, int],
    ) -> None:
        self._comm = comm
        self._render = render
        self._intrinsic_size = intrinsic_size

        self._closed = False

        self._comm.on_msg(self._handle_msg, PlotBackendMessageContent)
        self._comm.on_close(self._handle_close)

    @property
    def closed(self) -> bool:
        """Whether the plot is closed."""
        return self._closed

    def _open(self) -> None:
        """Re-open the plot after it's been closed."""
        if not self._closed:
            return

        self._comm.open()
        self._closed = False

    def close(self) -> None:
        """Close the plot."""
        if self._closed:
            return
        self._closed = True
        self._comm.close()

    def show(self) -> None:
        """Show the plot."""
        logger.debug(f"🎯 Plot.show() called for plot {self._comm.comm_id}")
        
        if self._closed:
            logger.debug(f"📂 Plot was closed, opening it first")
            self._open()
        else:
            logger.debug(f"📤 Sending PlotFrontendEvent.Show to frontend")
            try:
                self._comm.send_event(PlotFrontendEvent.Show, {})
                logger.debug(f"✅ Show event sent successfully")
            except Exception as e:
                logger.error(f"❌ Error sending show event: {e}")
                import traceback
                logger.error(traceback.format_exc())

    def update(self) -> None:
        """Notify the frontend that the plot needs to be rerendered."""
        if self._closed:
            self._open()
        else:
            self._comm.send_event(PlotFrontendEvent.Update, {})

    def _handle_msg(
        self, msg: CommMessage[PlotBackendMessageContent], _raw_msg: JsonRecord
    ) -> None:
        request = msg.content.data
        if isinstance(request, RenderRequest):
            self._handle_render(
                request.params.size,
                request.params.pixel_ratio,
                request.params.format,
            )
        elif isinstance(request, GetIntrinsicSizeRequest):
            self._handle_get_intrinsic_size()
        else:
            logger.warning(f"Unhandled request: {request}")

    def _handle_render(
        self,
        size: PlotSize | None,
        pixel_ratio: float,
        format_: str,
    ) -> None:
        logger.debug(f"🖼️ Plot._handle_render() called")
        logger.debug(f"🖼️ Render params: size={size}, pixel_ratio={pixel_ratio}, format={format_}")
        
        try:
            rendered = self._render(size, pixel_ratio, format_)
            logger.debug(f"🖼️ Render successful, raw data size: {len(rendered)} bytes")
            
            data = base64.b64encode(rendered).decode()
            logger.debug(f"🖼️ Base64 encoded data size: {len(data)} chars")
            
            result = PlotResult(data=data, mime_type=MIME_TYPE[format_]).dict()
            logger.debug(f"🖼️ PlotResult created with mime_type: {MIME_TYPE[format_]}")
            
            self._comm.send_result(data=result)
            logger.debug(f"✅ Render result sent to frontend")
        except Exception as e:
            logger.error(f"❌ Error in _handle_render(): {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def _handle_get_intrinsic_size(self) -> None:
        if self._intrinsic_size is None:
            result = None
        else:
            result = IntrinsicSize(
                width=self._intrinsic_size[0],
                height=self._intrinsic_size[1],
                unit=PlotUnit.Inches,
                source="Matplotlib",
            ).dict()
        self._comm.send_result(data=result)

    def _handle_close(self, _msg: JsonRecord) -> None:
        self.close()


class Renderer(Protocol):
    """A callable that renders a plot. See `plot_comm.RenderRequest` for parameter details."""

    def __call__(self, size: PlotSize | None, pixel_ratio: float, format_: str) -> bytes: ...


class PlotsService:
    """
    The plots service is responsible for managing `Plot` instances.

    Paramaters
    ----------
    target_name
        The name of the target for plot comms, as defined in the frontend.
    session_mode
        The session mode that the kernel was started in.
    """

    def __init__(self, target_name: str, session_mode: SessionMode):
        self._target_name = target_name
        self._session_mode = session_mode

        self._plots: list[Plot] = []

    def create_plot(self, render: Renderer, intrinsic_size: tuple[int, int]) -> Plot:
        """
        Create a plot.

        Parameters
        ----------
        render
            A callable that renders the plot. See `plot_comm.RenderRequest` for parameter details.
        intrinsic_size
            The intrinsic size of the plot in inches.

        See Also
        --------
        Plot
        """
        comm_id = str(uuid.uuid4())
        logger.info(f"Creating plot with comm {comm_id}")
        plot_comm = ErdosComm.create(self._target_name, comm_id)
        plot = Plot(plot_comm, render, intrinsic_size)
        self._plots.append(plot)
        return plot

    def on_comm_open(self, comm, open_msg):
        """Handle incoming comm open requests for plots."""
        logger.info(f"Plot comm opened: {comm.comm_id}")
        # Plot comms are typically created by the backend (matplotlib),
        # so we don't need to handle frontend-initiated opens here
        pass

    def shutdown(self) -> None:
        """Shutdown the plots service."""
        for plot in list(self._plots):
            plot.close()
            self._plots.remove(plot)

