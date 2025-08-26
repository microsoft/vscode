"""Preconfigured converters for ujson."""

from base64 import b85decode, b85encode
from datetime import date, datetime
from typing import Any, AnyStr, Type, TypeVar, Union

from ujson import dumps, loads

from lotas.erdos._vendor.cattrs._compat import AbstractSet

from ..converters import BaseConverter, Converter
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")


class UjsonConverter(Converter):
    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> str:
        return dumps(self.unstructure(obj, unstructure_as=unstructure_as), **kwargs)

    def loads(self, data: AnyStr, cl: Type[T], **kwargs: Any) -> T:
        return self.structure(loads(data, **kwargs), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the ujson library.

    * bytes are serialized as base64 strings
    * datetimes are serialized as ISO 8601
    * sets are serialized as lists
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


@wrap(UjsonConverter)
def make_converter(*args: Any, **kwargs: Any) -> UjsonConverter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = UjsonConverter(*args, **kwargs)
    configure_converter(res)

    return res
