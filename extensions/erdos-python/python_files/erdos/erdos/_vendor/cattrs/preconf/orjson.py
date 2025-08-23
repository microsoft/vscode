"""Preconfigured converters for orjson."""

from base64 import b85decode, b85encode
from datetime import date, datetime
from enum import Enum
from functools import partial
from typing import Any, Type, TypeVar, Union

from orjson import dumps, loads

from .._compat import AbstractSet, is_mapping
from ..cols import is_namedtuple, namedtuple_unstructure_factory
from ..converters import BaseConverter, Converter
from ..fns import identity
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")


class OrjsonConverter(Converter):
    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> bytes:
        return dumps(self.unstructure(obj, unstructure_as=unstructure_as), **kwargs)

    def loads(self, data: Union[bytes, bytearray, memoryview, str], cl: Type[T]) -> T:
        return self.structure(loads(data), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the orjson library.

    * bytes are serialized as base85 strings
    * datetimes and dates are passed through to be serialized as RFC 3339 by orjson
    * typed namedtuples are serialized as lists
    * sets are serialized as lists
    * string enum mapping keys have special handling
    * mapping keys are coerced into strings when unstructuring

    .. versionchanged: 24.1.0
        Add support for typed namedtuples.
    """
    converter.register_unstructure_hook(
        bytes, lambda v: (b85encode(v) if v else b"").decode("utf8")
    )
    converter.register_structure_hook(bytes, lambda v, _: b85decode(v))

    converter.register_structure_hook(datetime, lambda v, _: datetime.fromisoformat(v))
    converter.register_structure_hook(date, lambda v, _: date.fromisoformat(v))

    def gen_unstructure_mapping(cl: Any, unstructure_to=None):
        key_handler = str
        args = getattr(cl, "__args__", None)
        if args:
            if issubclass(args[0], str) and issubclass(args[0], Enum):

                def key_handler(v):
                    return v.value

            else:
                # It's possible the handler for the key type has been overridden.
                # (For example base85 encoding for bytes.)
                # In that case, we want to use the override.

                kh = converter.get_unstructure_hook(args[0])
                if kh != identity:
                    key_handler = kh

        return converter.gen_unstructure_mapping(
            cl, unstructure_to=unstructure_to, key_handler=key_handler
        )

    converter._unstructure_func.register_func_list(
        [
            (is_mapping, gen_unstructure_mapping, True),
            (
                is_namedtuple,
                partial(namedtuple_unstructure_factory, unstructure_to=tuple),
                "extended",
            ),
        ]
    )
    configure_union_passthrough(Union[str, bool, int, float, None], converter)


@wrap(OrjsonConverter)
def make_converter(*args: Any, **kwargs: Any) -> OrjsonConverter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = OrjsonConverter(*args, **kwargs)
    configure_converter(res)

    return res
