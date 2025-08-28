#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import hashlib
import io
import logging
from typing import TYPE_CHECKING, cast

import matplotlib
from matplotlib.backend_bases import FigureManagerBase
from matplotlib.backends.backend_agg import FigureCanvasAgg

if TYPE_CHECKING:
    from matplotlib.figure import Figure

    from .plot_comm import PlotSize

logger = logging.getLogger(__name__)

matplotlib.interactive(True)


class FigureManagerErdos(FigureManagerBase):
    canvas: FigureCanvasErdos

    def __init__(self, canvas: FigureCanvasErdos, num: int | str):
        from .erdos_ipkernel import ErdosIPyKernel

        super().__init__(canvas, num)

        self._plots_service = cast("ErdosIPyKernel", ErdosIPyKernel.instance()).plots_service
        self._plot = self._plots_service.create_plot(canvas.render, canvas.intrinsic_size)

    @property
    def closed(self) -> bool:
        return self._plot.closed

    def show(self) -> None:
        """Show the plot in Erdos plots pane."""
        logger.debug(f"📊 FigureManagerErdos.show() called for plot {self.num}")
        logger.debug(f"📊 Plot object: {self._plot}")
        logger.debug(f"📊 Plot closed status: {getattr(self._plot, 'closed', 'Unknown')}")
        
        try:
            self._plot.show()
            logger.info(f"✅ Matplotlib plot {self.num} shown in Erdos plots pane")
        except Exception as e:
            logger.error(f"❌ Error showing plot {self.num}: {e}")
            import traceback
            logger.error(traceback.format_exc())

    def destroy(self) -> None:
        self._plot.close()

    def update(self) -> None:
        self._plot.update()


class FigureCanvasErdos(FigureCanvasAgg):
    manager: FigureManagerErdos

    manager_class = FigureManagerErdos

    def __init__(self, figure: Figure | None = None) -> None:
        super().__init__(figure)

        self._previous_hash = ""

        self._first_render_completed = False

        self.intrinsic_size = tuple(self.figure.get_size_inches())

    def draw(self, *, is_rendering=False) -> None:
        logger.debug("Drawing to canvas")
        try:
            super().draw()
        finally:
            if not self._first_render_completed:
                return

            if is_rendering:
                return

            if self.manager.closed:
                self.manager.update()
                return

            current_hash = self._hash_buffer_rgba()
            logger.debug(f"Canvas: previous hash: {self._previous_hash[:6]}")
            logger.debug(f"Canvas: current hash: {current_hash[:6]}")
            if current_hash == self._previous_hash:
                logger.debug("Canvas: hash is the same, no need to update")
                return

            logger.debug("Canvas: hash changed, requesting an update")
            self.manager.update()

    def render(self, size: PlotSize | None, pixel_ratio: float, format_: str) -> bytes:
        logger.debug(f"🎨 FigureCanvasErdos.render() called")
        logger.debug(f"🎨 Render params: size={size}, pixel_ratio={pixel_ratio}, format={format_}")
        
        try:
            self._set_device_pixel_ratio(pixel_ratio)

            if not self.figure.get_layout_engine():
                self.figure.set_layout_engine("tight")

            if size is None:
                logger.debug(f"🎨 Using intrinsic size: {self.intrinsic_size}")
                self.figure.set_size_inches(*self.intrinsic_size, forward=False)
                bbox_inches = "tight"
            else:
                width_in = size.width * self.device_pixel_ratio / self.figure.dpi
                height_in = size.height * self.device_pixel_ratio / self.figure.dpi
                logger.debug(f"🎨 Setting figure size: {width_in:.2f}x{height_in:.2f} inches")
                self.figure.set_size_inches(width_in, height_in, forward=False)
                bbox_inches = None

            logger.debug(f"🎨 Rendering with DPI: {self.figure.dpi}")
            with io.BytesIO() as figure_buffer:
                self.print_figure(
                    figure_buffer,
                    format=format_,
                    dpi=self.figure.dpi,
                    bbox_inches=bbox_inches,
                )
                rendered = figure_buffer.getvalue()

            logger.debug(f"✅ Render complete, size: {len(rendered)} bytes")
            
            self.draw(is_rendering=True)
            self._previous_hash = self._hash_buffer_rgba()
            self._first_render_completed = True

            return rendered
            
        except Exception as e:
            logger.error(f"❌ Error in render(): {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def _hash_buffer_rgba(self) -> str:
        return hashlib.sha1(self.buffer_rgba()).hexdigest()


FigureCanvas = FigureCanvasErdos
FigureManager = FigureManagerErdos




















