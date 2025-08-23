from typing import Any, Mapping

from ._compat import copy_with, get_args, is_annotated, is_generic


def deep_copy_with(t, mapping: Mapping[str, Any]):
    args = get_args(t)
    rest = ()
    if is_annotated(t) and args:
        # If we're dealing with `Annotated`, we only map the first type parameter
        rest = tuple(args[1:])
        args = (args[0],)
    new_args = (
        tuple(
            (
                mapping[a.__name__]
                if hasattr(a, "__name__") and a.__name__ in mapping
                else (deep_copy_with(a, mapping) if is_generic(a) else a)
            )
            for a in args
        )
        + rest
    )
    return copy_with(t, new_args) if new_args != args else t
