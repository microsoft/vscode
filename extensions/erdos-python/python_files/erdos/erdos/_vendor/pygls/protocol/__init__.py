import json
from typing import Any

from collections import namedtuple

from erdos.erdos._vendor.lsprotocol import converters

from erdos.erdos._vendor.pygls.protocol.json_rpc import (
    JsonRPCNotification,
    JsonRPCProtocol,
    JsonRPCRequestMessage,
    JsonRPCResponseMessage,
)
from erdos.erdos._vendor.pygls.protocol.language_server import LanguageServerProtocol, lsp_method
from erdos.erdos._vendor.pygls.protocol.lsp_meta import LSPMeta, call_user_feature


def _dict_to_object(d: Any):
    """Create nested objects (namedtuple) from dict."""

    if d is None:
        return None

    if not isinstance(d, dict):
        return d

    type_name = d.pop("type_name", "Object")
    return json.loads(
        json.dumps(d),
        object_hook=lambda p: namedtuple(type_name, p.keys(), rename=True)(*p.values()),
    )


def _params_field_structure_hook(obj, cls):
    if "params" in obj:
        obj["params"] = _dict_to_object(obj["params"])

    return cls(**obj)


def _result_field_structure_hook(obj, cls):
    if "result" in obj:
        obj["result"] = _dict_to_object(obj["result"])

    return cls(**obj)


def default_converter():
    """Default converter factory function."""

    converter = converters.get_converter()
    converter.register_structure_hook(
        JsonRPCRequestMessage, _params_field_structure_hook
    )

    converter.register_structure_hook(
        JsonRPCResponseMessage, _result_field_structure_hook
    )

    converter.register_structure_hook(JsonRPCNotification, _params_field_structure_hook)

    return converter


__all__ = (
    "JsonRPCProtocol",
    "LanguageServerProtocol",
    "JsonRPCRequestMessage",
    "JsonRPCResponseMessage",
    "JsonRPCNotification",
    "LSPMeta",
    "call_user_feature",
    "_dict_to_object",
    "_params_field_structure_hook",
    "_result_field_structure_hook",
    "default_converter",
    "lsp_method",
)
