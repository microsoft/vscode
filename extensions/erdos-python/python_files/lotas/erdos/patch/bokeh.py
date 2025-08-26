#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import logging

from ..session_mode import SessionMode

logger = logging.getLogger(__name__)


def _erdos_no_access(_filename: str):
    return True


def patch_bokeh_no_access():
    try:
        from bokeh.io import util

        util._no_access = _erdos_no_access
    except ImportError:
        pass


MIME_TYPE_ERDOS_WEBVIEW_FLAG = "application/erdos-webview-load.v0+json"


def handle_bokeh_output(session_mode: SessionMode) -> None:
    if session_mode == SessionMode.NOTEBOOK:
        return

    hide_glyph_renderer_output()
    add_preload_mime_type()


def add_preload_mime_type():
    try:
        from bokeh.io import notebook

    except ImportError:
        return

    old_publish_display_data = getattr(notebook, "publish_display_data", None)

    if old_publish_display_data is None:
        logger.warning(
            "Could not find bokeh.io.notebook.publish_display_data to update. Bokeh plots may not display correctly."
        )
        return

    def new_publish_display_data(*args, **kwargs) -> None:
        if isinstance(args[0], dict):
            args[0][MIME_TYPE_ERDOS_WEBVIEW_FLAG] = ""
        old_publish_display_data(*args, **kwargs)

    logger.debug("Overrode bokeh.notebook.publish_display_data")
    notebook.publish_display_data = new_publish_display_data


def hide_glyph_renderer_output():
    try:
        from bokeh.models import Model

        del Model._repr_html_

    except (ImportError, AttributeError):
        return




















