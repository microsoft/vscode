"""Preconfigured converters for bson."""

from base64 import b85decode, b85encode
from datetime import date, datetime
from typing import Any, Type, TypeVar, Union

from bson import DEFAULT_CODEC_OPTIONS, CodecOptions, Int64, ObjectId, decode, encode

from erdos.erdos._vendor.cattrs._compat import AbstractSet, is_mapping
from erdos.erdos._vendor.cattrs.gen import make_mapping_structure_fn

from ..converters import BaseConverter, Converter
from ..dispatch import StructureHook
from ..strategies import configure_union_passthrough
from . import validate_datetime, wrap

T = TypeVar("T")


class Base85Bytes(bytes):
    """A subclass to help with binary key encoding/decoding."""


class BsonConverter(Converter):
    def dumps(
        self,
        obj: Any,
        unstructure_as: Any = None,
        check_keys: bool = False,
        codec_options: CodecOptions = DEFAULT_CODEC_OPTIONS,
    ) -> bytes:
        return encode(
            self.unstructure(obj, unstructure_as=unstructure_as),
            check_keys=check_keys,
            codec_options=codec_options,
        )

    def loads(
        self,
        data: bytes,
        cl: Type[T],
        codec_options: CodecOptions = DEFAULT_CODEC_OPTIONS,
    ) -> T:
        return self.structure(decode(data, codec_options=codec_options), cl)


def configure_converter(converter: BaseConverter):
    """
    Configure the converter for use with the bson library.

    * sets are serialized as lists
    * byte mapping keys are base85-encoded into strings when unstructuring, and reverse
    * non-string, non-byte mapping keys are coerced into strings when unstructuring
    * a deserialization hook is registered for bson.ObjectId by default
    """

    def gen_unstructure_mapping(cl: Any, unstructure_to=None):
        key_handler = str
        args = getattr(cl, "__args__", None)
        if args:
            if issubclass(args[0], str):
                key_handler = None
            elif issubclass(args[0], bytes):

                def key_handler(k):
                    return b85encode(k).decode("utf8")

        return converter.gen_unstructure_mapping(
            cl, unstructure_to=unstructure_to, key_handler=key_handler
        )

    def gen_structure_mapping(cl: Any) -> StructureHook:
        args = getattr(cl, "__args__", None)
        if args and issubclass(args[0], bytes):
            h = make_mapping_structure_fn(cl, converter, key_type=Base85Bytes)
        else:
            h = make_mapping_structure_fn(cl, converter)
        return h

    converter.register_structure_hook(Base85Bytes, lambda v, _: b85decode(v))
    converter.register_unstructure_hook_factory(is_mapping, gen_unstructure_mapping)
    converter.register_structure_hook_factory(is_mapping, gen_structure_mapping)

    converter.register_structure_hook(ObjectId, lambda v, _: ObjectId(v))
    configure_union_passthrough(
        Union[str, bool, int, float, None, bytes, datetime, ObjectId, Int64], converter
    )

    # datetime inherits from date, so identity unstructure hook used
    # here to prevent the date unstructure hook running.
    converter.register_unstructure_hook(datetime, lambda v: v)
    converter.register_structure_hook(datetime, validate_datetime)
    converter.register_unstructure_hook(date, lambda v: v.isoformat())
    converter.register_structure_hook(date, lambda v, _: date.fromisoformat(v))


@wrap(BsonConverter)
def make_converter(*args: Any, **kwargs: Any) -> BsonConverter:
    kwargs["unstruct_collection_overrides"] = {
        AbstractSet: list,
        **kwargs.get("unstruct_collection_overrides", {}),
    }
    res = BsonConverter(*args, **kwargs)
    configure_converter(res)

    return res
