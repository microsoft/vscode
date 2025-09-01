"""Preconfigured converters for cbor2."""

from datetime import date, datetime, timezone
from typing import Any, Type, TypeVar, Union

from cbor2 import dumps, loads

from erdos._vendor.cattrs._compat import AbstractSet

from ..converters import BaseConverter, Converter
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")


class Cbor2Converter(Converter):
    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> bytes:
        return dumps(self.unstructure(obj, unstructure_as=unstructure_as), **kwargs)

    def loads(self, data: bytes, cl: Type[T], **kwargs: Any) -> T:
        return self.structure(loads(data, **kwargs), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the cbor2 library.

    * datetimes are serialized as timestamp floats
    * sets are serialized as lists
    """
    converter.register_unstructure_hook(datetime, lambda v: v.timestamp())
    converter.register_structure_hook(
        datetime, lambda v, _: datetime.fromtimestamp(v, timezone.utc)
    )
    converter.register_unstructure_hook(date, lambda v: v.isoformat())
    converter.register_structure_hook(date, lambda v, _: date.fromisoformat(v))
    configure_union_passthrough(Union[str, bool, int, float, None, bytes], converter)


@wrap(Cbor2Converter)
def make_converter(*args: Any, **kwargs: Any) -> Cbor2Converter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = Cbor2Converter(*args, **kwargs)
    configure_converter(res)

    return res
