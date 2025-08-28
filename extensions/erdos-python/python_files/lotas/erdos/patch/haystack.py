#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import importlib.util
import logging

logger = logging.getLogger(__name__)


def _patched_is_in_jupyter() -> bool:
    return True


def patch_haystack_is_in_jupyter() -> None:
    try:
        if (
            importlib.util.find_spec("haystack_ai") is not None
            or importlib.util.find_spec("haystack") is not None
        ):
            try:
                import haystack.utils

                if hasattr(haystack.utils, "is_in_jupyter"):
                    haystack.utils.is_in_jupyter = _patched_is_in_jupyter
                    logger.debug("Patched haystack.utils.is_in_jupyter")
            except ImportError:
                logger.debug("haystack package found but couldn't import haystack.utils")

    except Exception as e:
        logger.debug(f"Failed to patch haystack is_in_jupyter: {e}")




















