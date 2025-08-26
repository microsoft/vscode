from types import UnionType
from typing import (
    Any,
    AnyStr,
    Callable,
    Container,
    ContextManager,
    Iterable,
    Mapping,
    Match,
    Pattern,
    TypeVar,
    overload,
)

from attrs import _ValidatorType
from attrs import _ValidatorArgType

_T = TypeVar("_T")
_T1 = TypeVar("_T1")
_T2 = TypeVar("_T2")
_T3 = TypeVar("_T3")
_I = TypeVar("_I", bound=Iterable)
_K = TypeVar("_K")
_V = TypeVar("_V")
_M = TypeVar("_M", bound=Mapping)

def set_disabled(run: bool) -> None: ...
def get_disabled() -> bool: ...
def disabled() -> ContextManager[None]: ...

# To be more precise on instance_of use some overloads.
# If there are more than 3 items in the tuple then we fall back to Any
@overload
def instance_of(type: type[_T]) -> _ValidatorType[_T]: ...
@overload
def instance_of(type: tuple[type[_T]]) -> _ValidatorType[_T]: ...
@overload
def instance_of(
    type: tuple[type[_T1], type[_T2]],
) -> _ValidatorType[_T1 | _T2]: ...
@overload
def instance_of(
    type: tuple[type[_T1], type[_T2], type[_T3]],
) -> _ValidatorType[_T1 | _T2 | _T3]: ...
@overload
def instance_of(type: tuple[type, ...]) -> _ValidatorType[Any]: ...
@overload
def instance_of(type: UnionType) -> _ValidatorType[Any]: ...
def optional(
    validator: (
        _ValidatorType[_T]
        | list[_ValidatorType[_T]]
        | tuple[_ValidatorType[_T]]
    ),
) -> _ValidatorType[_T | None]: ...
def in_(options: Container[_T]) -> _ValidatorType[_T]: ...
def and_(*validators: _ValidatorType[_T]) -> _ValidatorType[_T]: ...
def matches_re(
    regex: Pattern[AnyStr] | AnyStr,
    flags: int = ...,
    func: Callable[[AnyStr, AnyStr, int], Match[AnyStr] | None] | None = ...,
) -> _ValidatorType[AnyStr]: ...
def deep_iterable(
    member_validator: _ValidatorArgType[_T],
    iterable_validator: _ValidatorType[_I] | None = ...,
) -> _ValidatorType[_I]: ...
def deep_mapping(
    key_validator: _ValidatorType[_K],
    value_validator: _ValidatorType[_V],
    mapping_validator: _ValidatorType[_M] | None = ...,
) -> _ValidatorType[_M]: ...
def is_callable() -> _ValidatorType[_T]: ...
def lt(val: _T) -> _ValidatorType[_T]: ...
def le(val: _T) -> _ValidatorType[_T]: ...
def ge(val: _T) -> _ValidatorType[_T]: ...
def gt(val: _T) -> _ValidatorType[_T]: ...
def max_len(length: int) -> _ValidatorType[_T]: ...
def min_len(length: int) -> _ValidatorType[_T]: ...
def not_(
    validator: _ValidatorType[_T],
    *,
    msg: str | None = None,
    exc_types: type[Exception] | Iterable[type[Exception]] = ...,
) -> _ValidatorType[_T]: ...
def or_(*validators: _ValidatorType[_T]) -> _ValidatorType[_T]: ...
