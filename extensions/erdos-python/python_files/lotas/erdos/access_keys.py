#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import json
from typing import TYPE_CHECKING, Any, Dict, Hashable, cast

from .inspectors import INSPECTOR_CLASSES, ErdosInspector, get_inspector

if TYPE_CHECKING:
    from .utils import JsonData


def encode_access_key(key: Any) -> str:
    if not isinstance(key, Hashable):
        raise TypeError(f"Key {key} is not hashable.")

    if isinstance(key, str) and key == "":
        return key

    json_data = get_inspector(key).to_json()
    return json.dumps(json_data, separators=(",", ":"))


_ACCESS_KEY_QUALNAME_TO_INSPECTOR_KEY: Dict[str, str] = {
    "int": "number",
    "float": "number",
    "complex": "number",
    "bool": "boolean",
    "str": "string",
    "range": "collection",
    "type": "class",
}


def decode_access_key(access_key: str) -> Any:
    if access_key == "":
        return access_key

    try:
        json_data: JsonData = json.loads(access_key)
    except json.JSONDecodeError:
        return access_key

    if (
        not isinstance(json_data, dict)
        or not isinstance(json_data["type"], str)
        or not isinstance(json_data["data"], (dict, list, str, int, float, bool, type(None)))
    ):
        return access_key

    type_name = cast("str", json_data["type"])
    inspector_key = _ACCESS_KEY_QUALNAME_TO_INSPECTOR_KEY.get(type_name, type_name)
    inspector_cls = INSPECTOR_CLASSES.get(inspector_key, ErdosInspector)

    return inspector_cls.from_json(json_data)




















