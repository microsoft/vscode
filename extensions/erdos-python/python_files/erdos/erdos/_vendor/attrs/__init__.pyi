import sys

from typing import (
    Any,
    Callable,
    Mapping,
    Sequence,
    overload,
    TypeVar,
)

# Because we need to type our own stuff, we have to make everything from
# attr explicitly public too.
from attr import __author__ as __author__
from attr import __copyright__ as __copyright__
from attr import __description__ as __description__
from attr import __email__ as __email__
from attr import __license__ as __license__
from attr import __title__ as __title__
from attr import __url__ as __url__
from attr import __version__ as __version__
from attr import __version_info__ as __version_info__
from attr import assoc as assoc
from attr import Attribute as Attribute
from attr import AttrsInstance as AttrsInstance
from attr import cmp_using as cmp_using
from attr import converters as converters
from attr import Converter as Converter
from attr import evolve as evolve
from attr import exceptions as exceptions
from attr import Factory as Factory
from attr import fields as fields
from attr import fields_dict as fields_dict
from attr import filters as filters
from attr import has as has
from attr import make_class as make_class
from attr import NOTHING as NOTHING
from attr import resolve_types as resolve_types
from attr import setters as setters
from attr import validate as validate
from attr import validators as validators
from attr import attrib, asdict as asdict, astuple as astuple
from attr import NothingType as NothingType

if sys.version_info >= (3, 11):
    from typing import dataclass_transform
else:
    from typing_extensions import dataclass_transform

_T = TypeVar("_T")
_C = TypeVar("_C", bound=type)

_EqOrderType = bool | Callable[[Any], Any]
_ValidatorType = Callable[[Any, "Attribute[_T]", _T], Any]
_CallableConverterType = Callable[[Any], Any]
_ConverterType = _CallableConverterType | Converter[Any, Any]
_ReprType = Callable[[Any], str]
_ReprArgType = bool | _ReprType
_OnSetAttrType = Callable[[Any, "Attribute[Any]", Any], Any]
_OnSetAttrArgType = _OnSetAttrType | list[_OnSetAttrType] | setters._NoOpType
_FieldTransformer = Callable[
    [type, list["Attribute[Any]"]], list["Attribute[Any]"]
]
# FIXME: in reality, if multiple validators are passed they must be in a list
# or tuple, but those are invariant and so would prevent subtypes of
# _ValidatorType from working when passed in a list or tuple.
_ValidatorArgType = _ValidatorType[_T] | Sequence[_ValidatorType[_T]]

@overload
def field(
    *,
    default: None = ...,
    validator: None = ...,
    repr: _ReprArgType = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    converter: None = ...,
    factory: None = ...,
    kw_only: bool = ...,
    eq: bool | None = ...,
    order: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    alias: str | None = ...,
    type: type | None = ...,
) -> Any: ...

# This form catches an explicit None or no default and infers the type from the
# other arguments.
@overload
def field(
    *,
    default: None = ...,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    converter: _ConverterType
    | list[_ConverterType]
    | tuple[_ConverterType]
    | None = ...,
    factory: Callable[[], _T] | None = ...,
    kw_only: bool = ...,
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    alias: str | None = ...,
    type: type | None = ...,
) -> _T: ...

# This form catches an explicit default argument.
@overload
def field(
    *,
    default: _T,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    converter: _ConverterType
    | list[_ConverterType]
    | tuple[_ConverterType]
    | None = ...,
    factory: Callable[[], _T] | None = ...,
    kw_only: bool = ...,
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    alias: str | None = ...,
    type: type | None = ...,
) -> _T: ...

# This form covers type=non-Type: e.g. forward references (str), Any
@overload
def field(
    *,
    default: _T | None = ...,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    converter: _ConverterType
    | list[_ConverterType]
    | tuple[_ConverterType]
    | None = ...,
    factory: Callable[[], _T] | None = ...,
    kw_only: bool = ...,
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    alias: str | None = ...,
    type: type | None = ...,
) -> Any: ...
@overload
@dataclass_transform(field_specifiers=(attrib, field))
def define(
    maybe_cls: _C,
    *,
    these: dict[str, Any] | None = ...,
    repr: bool = ...,
    unsafe_hash: bool | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    slots: bool = ...,
    frozen: bool = ...,
    weakref_slot: bool = ...,
    str: bool = ...,
    auto_attribs: bool = ...,
    kw_only: bool = ...,
    cache_hash: bool = ...,
    auto_exc: bool = ...,
    eq: bool | None = ...,
    order: bool | None = ...,
    auto_detect: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
) -> _C: ...
@overload
@dataclass_transform(field_specifiers=(attrib, field))
def define(
    maybe_cls: None = ...,
    *,
    these: dict[str, Any] | None = ...,
    repr: bool = ...,
    unsafe_hash: bool | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    slots: bool = ...,
    frozen: bool = ...,
    weakref_slot: bool = ...,
    str: bool = ...,
    auto_attribs: bool = ...,
    kw_only: bool = ...,
    cache_hash: bool = ...,
    auto_exc: bool = ...,
    eq: bool | None = ...,
    order: bool | None = ...,
    auto_detect: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
) -> Callable[[_C], _C]: ...

mutable = define

@overload
@dataclass_transform(frozen_default=True, field_specifiers=(attrib, field))
def frozen(
    maybe_cls: _C,
    *,
    these: dict[str, Any] | None = ...,
    repr: bool = ...,
    unsafe_hash: bool | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    slots: bool = ...,
    frozen: bool = ...,
    weakref_slot: bool = ...,
    str: bool = ...,
    auto_attribs: bool = ...,
    kw_only: bool = ...,
    cache_hash: bool = ...,
    auto_exc: bool = ...,
    eq: bool | None = ...,
    order: bool | None = ...,
    auto_detect: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
) -> _C: ...
@overload
@dataclass_transform(frozen_default=True, field_specifiers=(attrib, field))
def frozen(
    maybe_cls: None = ...,
    *,
    these: dict[str, Any] | None = ...,
    repr: bool = ...,
    unsafe_hash: bool | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    slots: bool = ...,
    frozen: bool = ...,
    weakref_slot: bool = ...,
    str: bool = ...,
    auto_attribs: bool = ...,
    kw_only: bool = ...,
    cache_hash: bool = ...,
    auto_exc: bool = ...,
    eq: bool | None = ...,
    order: bool | None = ...,
    auto_detect: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
) -> Callable[[_C], _C]: ...
