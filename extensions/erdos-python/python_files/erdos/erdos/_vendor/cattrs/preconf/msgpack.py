"""Preconfigured converters for msgpack."""

from datetime import date, datetime, time, timezone
from typing import Any, Type, TypeVar, Union

from msgpack import dumps, loads

from erdos.erdos._vendor.cattrs._compat import AbstractSet

from ..converters import BaseConverter, Converter
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")


class MsgpackConverter(Converter):
    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> bytes:
        return dumps(self.unstructure(obj, unstructure_as=unstructure_as), **kwargs)

    def loads(self, data: bytes, cl: Type[T], **kwargs: Any) -> T:
        return self.structure(loads(data, **kwargs), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the msgpack library.

    * datetimes are serialized as timestamp floats
    * sets are serialized as lists
    """
    converter.register_unstructure_hook(datetime, lambda v: v.timestamp())
    converter.register_structure_hook(
        datetime, lambda v, _: datetime.fromtimestamp(v, timezone.utc)
    )
    converter.register_unstructure_hook(
        date, lambda v: datetime.combine(v, time(tzinfo=timezone.utc)).timestamp()
    )
    converter.register_structure_hook(
        date, lambda v, _: datetime.fromtimestamp(v, timezone.utc).date()
    )
    configure_union_passthrough(Union[str, bool, int, float, None, bytes], converter)


@wrap(MsgpackConverter)
def make_converter(*args: Any, **kwargs: Any) -> MsgpackConverter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = MsgpackConverter(*args, **kwargs)
    configure_converter(res)

    return res
