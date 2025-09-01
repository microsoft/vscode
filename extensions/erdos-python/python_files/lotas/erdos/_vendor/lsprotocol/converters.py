# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from typing import Optional

import erdos._vendor.cattrs

from . import _hooks


def get_converter(
    converter: Optional[erdos._vendor.cattrs.Converter] = None,
) -> erdos._vendor.cattrs.Converter:
    """Adds cattrs hooks for LSP lsp_types to the given converter."""
    if converter is None:
        converter = erdos._vendor.cattrs.Converter()
    return _hooks.register_hooks(converter)
