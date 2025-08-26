import enum
import sys

from typing import (
    Any,
    Callable,
    Generic,
    Literal,
    Mapping,
    Protocol,
    Sequence,
    TypeVar,
    overload,
)

# `import X as X` is required to make these public
from . import converters as converters
from . import exceptions as exceptions
from . import filters as filters
from . import setters as setters
from . import validators as validators
from ._cmp import cmp_using as cmp_using
from ._typing_compat import AttrsInstance_
from ._version_info import VersionInfo
from attrs import (
    define as define,
    field as field,
    mutable as mutable,
    frozen as frozen,
    _EqOrderType,
    _ValidatorType,
    _ConverterType,
    _ReprArgType,
    _OnSetAttrType,
    _OnSetAttrArgType,
    _FieldTransformer,
    _ValidatorArgType,
)

if sys.version_info >= (3, 10):
    from typing import TypeGuard, TypeAlias
else:
    from typing_extensions import TypeGuard, TypeAlias

if sys.version_info >= (3, 11):
    from typing import dataclass_transform
else:
    from typing_extensions import dataclass_transform

__version__: str
__version_info__: VersionInfo
__title__: str
__description__: str
__url__: str
__uri__: str
__author__: str
__email__: str
__license__: str
__copyright__: str

_T = TypeVar("_T")
_C = TypeVar("_C", bound=type)

_FilterType = Callable[["Attribute[_T]", _T], bool]

# We subclass this here to keep the protocol's qualified name clean.
class AttrsInstance(AttrsInstance_, Protocol):
    pass

_A = TypeVar("_A", bound=type[AttrsInstance])

class _Nothing(enum.Enum):
    NOTHING = enum.auto()

NOTHING = _Nothing.NOTHING
NothingType: TypeAlias = Literal[_Nothing.NOTHING]

# NOTE: Factory lies about its return type to make this possible:
# `x: List[int] # = Factory(list)`
# Work around mypy issue #4554 in the common case by using an overload.

@overload
def Factory(factory: Callable[[], _T]) -> _T: ...
@overload
def Factory(
    factory: Callable[[Any], _T],
    takes_self: Literal[True],
) -> _T: ...
@overload
def Factory(
    factory: Callable[[], _T],
    takes_self: Literal[False],
) -> _T: ...

In = TypeVar("In")
Out = TypeVar("Out")

class Converter(Generic[In, Out]):
    @overload
    def __init__(self, converter: Callable[[In], Out]) -> None: ...
    @overload
    def __init__(
        self,
        converter: Callable[[In, AttrsInstance, Attribute], Out],
        *,
        takes_self: Literal[True],
        takes_field: Literal[True],
    ) -> None: ...
    @overload
    def __init__(
        self,
        converter: Callable[[In, Attribute], Out],
        *,
        takes_field: Literal[True],
    ) -> None: ...
    @overload
    def __init__(
        self,
        converter: Callable[[In, AttrsInstance], Out],
        *,
        takes_self: Literal[True],
    ) -> None: ...

class Attribute(Generic[_T]):
    name: str
    default: _T | None
    validator: _ValidatorType[_T] | None
    repr: _ReprArgType
    cmp: _EqOrderType
    eq: _EqOrderType
    order: _EqOrderType
    hash: bool | None
    init: bool
    converter: Converter | None
    metadata: dict[Any, Any]
    type: type[_T] | None
    kw_only: bool
    on_setattr: _OnSetAttrType
    alias: str | None

    def evolve(self, **changes: Any) -> "Attribute[Any]": ...

# NOTE: We had several choices for the annotation to use for type arg:
# 1) Type[_T]
#   - Pros: Handles simple cases correctly
#   - Cons: Might produce less informative errors in the case of conflicting
#     TypeVars e.g. `attr.ib(default='bad', type=int)`
# 2) Callable[..., _T]
#   - Pros: Better error messages than #1 for conflicting TypeVars
#   - Cons: Terrible error messages for validator checks.
#   e.g. attr.ib(type=int, validator=validate_str)
#        -> error: Cannot infer function type argument
# 3) type (and do all of the work in the mypy plugin)
#   - Pros: Simple here, and we could customize the plugin with our own errors.
#   - Cons: Would need to write mypy plugin code to handle all the cases.
# We chose option #1.

# `attr` lies about its return type to make the following possible:
#     attr()    -> Any
#     attr(8)   -> int
#     attr(validator=<some callable>)  -> Whatever the callable expects.
# This makes this type of assignments possible:
#     x: int = attr(8)
#
# This form catches explicit None or no default but with no other arguments
# returns Any.
@overload
def attrib(
    default: None = ...,
    validator: None = ...,
    repr: _ReprArgType = ...,
    cmp: _EqOrderType | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    type: None = ...,
    converter: None = ...,
    factory: None = ...,
    kw_only: bool = ...,
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    alias: str | None = ...,
) -> Any: ...

# This form catches an explicit None or no default and infers the type from the
# other arguments.
@overload
def attrib(
    default: None = ...,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    cmp: _EqOrderType | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    type: type[_T] | None = ...,
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
) -> _T: ...

# This form catches an explicit default argument.
@overload
def attrib(
    default: _T,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    cmp: _EqOrderType | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    type: type[_T] | None = ...,
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
) -> _T: ...

# This form covers type=non-Type: e.g. forward references (str), Any
@overload
def attrib(
    default: _T | None = ...,
    validator: _ValidatorArgType[_T] | None = ...,
    repr: _ReprArgType = ...,
    cmp: _EqOrderType | None = ...,
    hash: bool | None = ...,
    init: bool = ...,
    metadata: Mapping[Any, Any] | None = ...,
    type: object = ...,
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
) -> Any: ...
@overload
@dataclass_transform(order_default=True, field_specifiers=(attrib, field))
def attrs(
    maybe_cls: _C,
    these: dict[str, Any] | None = ...,
    repr_ns: str | None = ...,
    repr: bool = ...,
    cmp: _EqOrderType | None = ...,
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
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    auto_detect: bool = ...,
    collect_by_mro: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
    unsafe_hash: bool | None = ...,
) -> _C: ...
@overload
@dataclass_transform(order_default=True, field_specifiers=(attrib, field))
def attrs(
    maybe_cls: None = ...,
    these: dict[str, Any] | None = ...,
    repr_ns: str | None = ...,
    repr: bool = ...,
    cmp: _EqOrderType | None = ...,
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
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    auto_detect: bool = ...,
    collect_by_mro: bool = ...,
    getstate_setstate: bool | None = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
    match_args: bool = ...,
    unsafe_hash: bool | None = ...,
) -> Callable[[_C], _C]: ...
def fields(cls: type[AttrsInstance]) -> Any: ...
def fields_dict(cls: type[AttrsInstance]) -> dict[str, Attribute[Any]]: ...
def validate(inst: AttrsInstance) -> None: ...
def resolve_types(
    cls: _A,
    globalns: dict[str, Any] | None = ...,
    localns: dict[str, Any] | None = ...,
    attribs: list[Attribute[Any]] | None = ...,
    include_extras: bool = ...,
) -> _A: ...

# TODO: add support for returning a proper attrs class from the mypy plugin
# we use Any instead of _CountingAttr so that e.g. `make_class('Foo',
# [attr.ib()])` is valid
def make_class(
    name: str,
    attrs: list[str] | tuple[str, ...] | dict[str, Any],
    bases: tuple[type, ...] = ...,
    class_body: dict[str, Any] | None = ...,
    repr_ns: str | None = ...,
    repr: bool = ...,
    cmp: _EqOrderType | None = ...,
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
    eq: _EqOrderType | None = ...,
    order: _EqOrderType | None = ...,
    collect_by_mro: bool = ...,
    on_setattr: _OnSetAttrArgType | None = ...,
    field_transformer: _FieldTransformer | None = ...,
) -> type: ...

# _funcs --

# TODO: add support for returning TypedDict from the mypy plugin
# FIXME: asdict/astuple do not honor their factory args. Waiting on one of
# these:
# https://github.com/python/mypy/issues/4236
# https://github.com/python/typing/issues/253
# XXX: remember to fix attrs.asdict/astuple too!
def asdict(
    inst: AttrsInstance,
    recurse: bool = ...,
    filter: _FilterType[Any] | None = ...,
    dict_factory: type[Mapping[Any, Any]] = ...,
    retain_collection_types: bool = ...,
    value_serializer: Callable[[type, Attribute[Any], Any], Any] | None = ...,
    tuple_keys: bool | None = ...,
) -> dict[str, Any]: ...

# TODO: add support for returning NamedTuple from the mypy plugin
def astuple(
    inst: AttrsInstance,
    recurse: bool = ...,
    filter: _FilterType[Any] | None = ...,
    tuple_factory: type[Sequence[Any]] = ...,
    retain_collection_types: bool = ...,
) -> tuple[Any, ...]: ...
def has(cls: type) -> TypeGuard[type[AttrsInstance]]: ...
def assoc(inst: _T, **changes: Any) -> _T: ...
def evolve(inst: _T, **changes: Any) -> _T: ...

# _config --

def set_run_validators(run: bool) -> None: ...
def get_run_validators() -> bool: ...

# aliases --

s = attributes = attrs
ib = attr = attrib
dataclass = attrs  # Technically, partial(attrs, auto_attribs=True) ;)
