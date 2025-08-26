"""Preconfigured converters for the stdlib json."""

from base64 import b85decode, b85encode
from datetime import date, datetime
from json import dumps, loads
from typing import Any, Type, TypeVar, Union

from .._compat import AbstractSet, Counter
from ..converters import BaseConverter, Converter
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")


class JsonConverter(Converter):
    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> str:
        return dumps(self.unstructure(obj, unstructure_as=unstructure_as), **kwargs)

    def loads(self, data: Union[bytes, str], cl: Type[T], **kwargs: Any) -> T:
        return self.structure(loads(data, **kwargs), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the stdlib json module.

    * bytes are serialized as base85 strings
    * datetimes are serialized as ISO 8601
    * counters are serialized as dicts
    * sets are serialized as lists
    * union passthrough is configured for unions of strings, bools, ints,
      floats and None
    """
    converter.register_unstructure_hook(
        bytes, lambda v: (b85encode(v) if v else b"").decode("utf8")
    )
    converter.register_structure_hook(bytes, lambda v, _: b85decode(v))
    converter.register_unstructure_hook(datetime, lambda v: v.isoformat())
    converter.register_structure_hook(datetime, lambda v, _: datetime.fromisoformat(v))
    converter.register_unstructure_hook(date, lambda v: v.isoformat())
    converter.register_structure_hook(date, lambda v, _: date.fromisoformat(v))
    configure_union_passthrough(Union[str, bool, int, float, None], converter)


@wrap(JsonConverter)
def make_converter(*args: Any, **kwargs: Any) -> JsonConverter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        Counter: dict,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = JsonConverter(*args, **kwargs)
    configure_converter(res)

    return res
