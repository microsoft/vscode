"""Useful internal functions."""

from typing import Any, Callable, NoReturn, Type, TypeVar

from ._compat import TypeAlias
from .errors import StructureHandlerNotFoundError

T = TypeVar("T")

Predicate: TypeAlias = Callable[[Any], bool]
"""A predicate function determines if a type can be handled."""


def identity(obj: T) -> T:
    """The identity function."""
    return obj


def raise_error(_, cl: Type) -> NoReturn:
    """At the bottom of the condition stack, we explode if we can't handle it."""
    msg = f"Unsupported type: {cl!r}. Register a structure hook for it."
    raise StructureHandlerNotFoundError(msg, type_=cl)
