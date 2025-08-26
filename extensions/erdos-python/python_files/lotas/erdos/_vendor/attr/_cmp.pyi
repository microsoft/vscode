from typing import Any, Callable

_CompareWithType = Callable[[Any, Any], bool]

def cmp_using(
    eq: _CompareWithType | None = ...,
    lt: _CompareWithType | None = ...,
    le: _CompareWithType | None = ...,
    gt: _CompareWithType | None = ...,
    ge: _CompareWithType | None = ...,
    require_same_type: bool = ...,
    class_name: str = ...,
) -> type: ...
