#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import logging

from ..ui import UiService

logger = logging.getLogger(__name__)


def set_holoviews_extension(ui_service: UiService) -> None:
    try:
        import holoviews
    except ImportError:
        pass
    else:
        if holoviews.extension == holoviews.ipython.notebook_extension:

            class ErdosNotebookExtension(holoviews.ipython.notebook_extension):
                def __call__(self, *args, **kwargs) -> None:
                    ui_service.clear_webview_preloads()

                    super().__call__(*args, **kwargs)

            holoviews.extension = ErdosNotebookExtension

        try:
            from holoviews.plotting import Renderer

            original_load_nb = Renderer.load_nb

            @classmethod
            def patched_load_nb(cls, *args, **kwargs):
                if "reloading" in kwargs:
                    kwargs["reloading"] = False
                return original_load_nb(*args, **kwargs)

            Renderer.load_nb = patched_load_nb
        except Exception as e:
            logger.warning(
                "Could not patch hvplot for block execution due to an error: %s. "
                "Run each line separately if plots don't appear.",
                e,
            )




















