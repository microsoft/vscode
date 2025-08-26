"""Preconfigured converters for msgspec."""

from __future__ import annotations

from base64 import b64decode
from datetime import date, datetime
from enum import Enum
from functools import partial
from typing import Any, Callable, TypeVar, Union, get_type_hints

from attrs import has as attrs_has
from attrs import resolve_types
from msgspec import Struct, convert, to_builtins
from msgspec.json import Encoder, decode

from .._compat import (
    fields,
    get_args,
    get_origin,
    has,
    is_bare,
    is_mapping,
    is_sequence,
)
from ..cols import is_namedtuple
from ..converters import BaseConverter, Converter
from ..dispatch import UnstructureHook
from ..fns import identity
from ..gen import make_hetero_tuple_unstructure_fn
from ..strategies import configure_union_passthrough
from . import wrap

T = TypeVar("T")

__all__ = ["MsgspecJsonConverter", "configure_converter", "make_converter"]


class MsgspecJsonConverter(Converter):
    """A converter specialized for the _msgspec_ library."""

    #: The msgspec encoder for dumping.
    encoder: Encoder = Encoder()

    def dumps(self, obj: Any, unstructure_as: Any = None, **kwargs: Any) -> bytes:
        """Unstructure and encode `obj` into JSON bytes."""
        return self.encoder.encode(
            self.unstructure(obj, unstructure_as=unstructure_as), **kwargs
        )

    def get_dumps_hook(
        self, unstructure_as: Any, **kwargs: Any
    ) -> Callable[[Any], bytes]:
        """Produce a `dumps` hook for the given type."""
        unstruct_hook = self.get_unstructure_hook(unstructure_as)
        if unstruct_hook in (identity, to_builtins):
            return self.encoder.encode
        return self.dumps

    def loads(self, data: bytes, cl: type[T], **kwargs: Any) -> T:
        """Decode and structure `cl` from the provided JSON bytes."""
        return self.structure(decode(data, **kwargs), cl)

    def get_loads_hook(self, cl: type[T]) -> Callable[[bytes], T]:
        """Produce a `loads` hook for the given type."""
        return partial(self.loads, cl=cl)


def configure_converter(converter: Converter) -> None:
    """Configure the converter for the msgspec library.

    * bytes are serialized as base64 strings, directly by msgspec
    * datetimes and dates are passed through to be serialized as RFC 3339 directly
    * enums are passed through to msgspec directly
    * union passthrough configured for str, bool, int, float and None
    """
    configure_passthroughs(converter)

    converter.register_unstructure_hook(Struct, to_builtins)
    converter.register_unstructure_hook(Enum, to_builtins)

    converter.register_structure_hook(Struct, convert)
    converter.register_structure_hook(bytes, lambda v, _: b64decode(v))
    converter.register_structure_hook(datetime, lambda v, _: convert(v, datetime))
    converter.register_structure_hook(date, lambda v, _: date.fromisoformat(v))
    configure_union_passthrough(Union[str, bool, int, float, None], converter)


@wrap(MsgspecJsonConverter)
def make_converter(*args: Any, **kwargs: Any) -> MsgspecJsonConverter:
    res = MsgspecJsonConverter(*args, **kwargs)
    configure_converter(res)
    return res


def configure_passthroughs(converter: Converter) -> None:
    """Configure optimizing passthroughs.

    A passthrough is when we let msgspec handle something automatically.
    """
    converter.register_unstructure_hook(bytes, to_builtins)
    converter.register_unstructure_hook_factory(is_mapping, mapping_unstructure_factory)
    converter.register_unstructure_hook_factory(is_sequence, seq_unstructure_factory)
    converter.register_unstructure_hook_factory(has, attrs_unstructure_factory)
    converter.register_unstructure_hook_factory(
        is_namedtuple, namedtuple_unstructure_factory
    )


def seq_unstructure_factory(type, converter: Converter) -> UnstructureHook:
    """The msgspec unstructure hook factory for sequences."""
    if is_bare(type):
        type_arg = Any
    else:
        args = get_args(type)
        type_arg = args[0]
    handler = converter.get_unstructure_hook(type_arg, cache_result=False)

    if handler in (identity, to_builtins):
        return handler
    return converter.gen_unstructure_iterable(type)


def mapping_unstructure_factory(type, converter: BaseConverter) -> UnstructureHook:
    """The msgspec unstructure hook factory for mappings."""
    if is_bare(type):
        key_arg = Any
        val_arg = Any
        key_handler = converter.get_unstructure_hook(key_arg, cache_result=False)
        value_handler = converter.get_unstructure_hook(val_arg, cache_result=False)
    else:
        args = get_args(type)
        if len(args) == 2:
            key_arg, val_arg = args
        else:
            # Probably a Counter
            key_arg, val_arg = args, Any
        key_handler = converter.get_unstructure_hook(key_arg, cache_result=False)
        value_handler = converter.get_unstructure_hook(val_arg, cache_result=False)

    if key_handler in (identity, to_builtins) and value_handler in (
        identity,
        to_builtins,
    ):
        return to_builtins
    return converter.gen_unstructure_mapping(type)


def attrs_unstructure_factory(type: Any, converter: Converter) -> UnstructureHook:
    """Choose whether to use msgspec handling or our own."""
    origin = get_origin(type)
    attribs = fields(origin or type)
    if attrs_has(type) and any(isinstance(a.type, str) for a in attribs):
        resolve_types(type)
        attribs = fields(origin or type)

    if any(
        attr.name.startswith("_")
        or (
            converter.get_unstructure_hook(attr.type, cache_result=False)
            not in (identity, to_builtins)
        )
        for attr in attribs
    ):
        return converter.gen_unstructure_attrs_fromdict(type)

    return to_builtins


def namedtuple_unstructure_factory(
    type: type[tuple], converter: BaseConverter
) -> UnstructureHook:
    """A hook factory for unstructuring namedtuples, modified for msgspec."""

    if all(
        converter.get_unstructure_hook(t) in (identity, to_builtins)
        for t in get_type_hints(type).values()
    ):
        return identity

    return make_hetero_tuple_unstructure_fn(
        type,
        converter,
        unstructure_to=tuple,
        type_args=tuple(get_type_hints(type).values()),
    )
