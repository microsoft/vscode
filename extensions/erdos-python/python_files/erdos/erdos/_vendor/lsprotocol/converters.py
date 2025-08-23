# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from typing import Optional

from erdos.erdos._vendor import cattrs

from . import _hooks


def get_converter(
    converter: Optional[cattrs.Converter] = None,
) -> cattrs.Converter:
    """Adds cattrs hooks for LSP lsp_types to the given converter."""
    if converter is None:
        converter = cattrs.Converter()
    return _hooks.register_hooks(converter)
