from typing import List
import warnings

from lotas.erdos._vendor.lsprotocol import types

from .workspace import Workspace
from .text_document import TextDocument
from .position_codec import PositionCodec

# For backwards compatibility
Document = TextDocument


def utf16_unit_offset(chars: str):
    warnings.warn(
        "'utf16_unit_offset' has been deprecated, instead use "
        "'PositionCodec.utf16_unit_offset' via 'workspace.position_codec' "
        "or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.utf16_unit_offset(chars)


def utf16_num_units(chars: str):
    warnings.warn(
        "'utf16_num_units' has been deprecated, instead use "
        "'PositionCodec.client_num_units' via 'workspace.position_codec' "
        "or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.client_num_units(chars)


def position_from_utf16(lines: List[str], position: types.Position):
    warnings.warn(
        "'position_from_utf16' has been deprecated, instead use "
        "'PositionCodec.position_from_client_units' via "
        "'workspace.position_codec' or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.position_from_client_units(lines, position)


def position_to_utf16(lines: List[str], position: types.Position):
    warnings.warn(
        "'position_to_utf16' has been deprecated, instead use "
        "'PositionCodec.position_to_client_units' via "
        "'workspace.position_codec' or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.position_to_client_units(lines, position)


def range_from_utf16(lines: List[str], range: types.Range):
    warnings.warn(
        "'range_from_utf16' has been deprecated, instead use "
        "'PositionCodec.range_from_client_units' via "
        "'workspace.position_codec' or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.range_from_client_units(lines, range)


def range_to_utf16(lines: List[str], range: types.Range):
    warnings.warn(
        "'range_to_utf16' has been deprecated, instead use "
        "'PositionCodec.range_to_client_units' via 'workspace.position_codec' "
        "or 'text_document.position_codec'",
        DeprecationWarning,
        stacklevel=2,
    )
    _codec = PositionCodec()
    return _codec.range_to_client_units(lines, range)


__all__ = (
    "Workspace",
    "TextDocument",
    "PositionCodec",
    "Document",
    "utf16_unit_offset",
    "utf16_num_units",
    "position_from_utf16",
    "position_to_utf16",
    "range_from_utf16",
    "range_to_utf16",
)
