from __future__ import annotations

from typing import TYPE_CHECKING, Any

from attrs import NOTHING, Attribute, Factory

from .._compat import is_bare_final
from ..dispatch import StructureHook
from ..fns import raise_error

if TYPE_CHECKING:
    from ..converters import BaseConverter


def find_structure_handler(
    a: Attribute, type: Any, c: BaseConverter, prefer_attrs_converters: bool = False
) -> StructureHook | None:
    """Find the appropriate structure handler to use.

    Return `None` if no handler should be used.
    """
    try:
        if a.converter is not None and prefer_attrs_converters:
            # If the user as requested to use attrib converters, use nothing
            # so it falls back to that.
            handler = None
        elif (
            a.converter is not None and not prefer_attrs_converters and type is not None
        ):
            handler = c.get_structure_hook(type, cache_result=False)
            if handler == raise_error:
                handler = None
        elif type is not None:
            if (
                is_bare_final(type)
                and a.default is not NOTHING
                and not isinstance(a.default, Factory)
            ):
                # This is a special case where we can use the
                # type of the default to dispatch on.
                type = a.default.__class__
                handler = c.get_structure_hook(type, cache_result=False)
                if handler == c._structure_call:
                    # Finals can't really be used with _structure_call, so
                    # we wrap it so the rest of the toolchain doesn't get
                    # confused.

                    def handler(v, _, _h=handler):
                        return _h(v, type)

            else:
                handler = c.get_structure_hook(type, cache_result=False)
        else:
            handler = c.structure
        return handler
    except RecursionError:
        # This means we're dealing with a reference cycle, so use late binding.
        return c.structure
