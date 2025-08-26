from __future__ import annotations

from typing import TypeVar

from .._compat import get_args, get_origin, is_generic


def _tvar_has_default(tvar) -> bool:
    """Does `tvar` have a default?

    In CPython 3.13+ and typing_extensions>=4.12.0:
    - TypeVars have a `no_default()` method for detecting
      if a TypeVar has a default
    - TypeVars with `default=None` have `__default__` set to `None`
    - TypeVars with no `default` parameter passed
      have `__default__` set to `typing(_extensions).NoDefault

    On typing_exensions<4.12.0:
    - TypeVars do not have a `no_default()` method for detecting
      if a TypeVar has a default
    - TypeVars with `default=None` have `__default__` set to `NoneType`
    - TypeVars with no `default` parameter passed
      have `__default__` set to `typing(_extensions).NoDefault
    """
    try:
        return tvar.has_default()
    except AttributeError:
        # compatibility for typing_extensions<4.12.0
        return getattr(tvar, "__default__", None) is not None


def generate_mapping(cl: type, old_mapping: dict[str, type] = {}) -> dict[str, type]:
    """Generate a mapping of typevars to actual types for a generic class."""
    mapping = dict(old_mapping)

    origin = get_origin(cl)

    if origin is not None:
        # To handle the cases where classes in the typing module are using
        # the GenericAlias structure but aren't a Generic and hence
        # end up in this function but do not have an `__parameters__`
        # attribute. These classes are interface types, for example
        # `typing.Hashable`.
        parameters = getattr(get_origin(cl), "__parameters__", None)
        if parameters is None:
            return dict(old_mapping)

        for p, t in zip(parameters, get_args(cl)):
            if isinstance(t, TypeVar):
                continue
            mapping[p.__name__] = t

    elif is_generic(cl):
        # Origin is None, so this may be a subclass of a generic class.
        orig_bases = cl.__orig_bases__
        for base in orig_bases:
            if not hasattr(base, "__args__"):
                continue
            base_args = base.__args__
            if hasattr(base.__origin__, "__parameters__"):
                base_params = base.__origin__.__parameters__
            elif any(_tvar_has_default(base_arg) for base_arg in base_args):
                # TypeVar with a default e.g. PEP 696
                # https://www.python.org/dev/peps/pep-0696/
                # Extract the defaults for the TypeVars and insert
                # them into the mapping
                mapping_params = [
                    (base_arg, base_arg.__default__)
                    for base_arg in base_args
                    if _tvar_has_default(base_arg)
                ]
                base_params, base_args = zip(*mapping_params)
            else:
                continue

            for param, arg in zip(base_params, base_args):
                mapping[param.__name__] = arg

    return mapping
