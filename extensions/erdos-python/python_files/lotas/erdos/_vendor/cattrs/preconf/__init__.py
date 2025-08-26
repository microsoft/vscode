import sys
from datetime import datetime
from typing import Any, Callable, TypeVar

if sys.version_info[:2] < (3, 10):
    from typing_extensions import ParamSpec
else:
    from typing import ParamSpec


def validate_datetime(v, _):
    if not isinstance(v, datetime):
        raise Exception(f"Expected datetime, got {v}")
    return v


T = TypeVar("T")
P = ParamSpec("P")


def wrap(_: Callable[P, Any]) -> Callable[[Callable[..., T]], Callable[P, T]]:
    """Wrap a `Converter` `__init__` in a type-safe way."""

    def impl(x: Callable[..., T]) -> Callable[P, T]:
        return x

    return impl
