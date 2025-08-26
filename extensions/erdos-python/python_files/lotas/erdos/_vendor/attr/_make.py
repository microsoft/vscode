# SPDX-License-Identifier: MIT

from __future__ import annotations

import abc
import contextlib
import copy
import enum
import inspect
import itertools
import linecache
import sys
import types
import unicodedata

from collections.abc import Callable, Mapping
from functools import cached_property
from typing import Any, NamedTuple, TypeVar

# We need to import _compat itself in addition to the _compat members to avoid
# having the thread-local in the globals here.
from . import _compat, _config, setters
from ._compat import (
    PY_3_10_PLUS,
    PY_3_11_PLUS,
    PY_3_13_PLUS,
    _AnnotationExtractor,
    _get_annotations,
    get_generic_base,
)
from .exceptions import (
    DefaultAlreadySetError,
    FrozenInstanceError,
    NotAnAttrsClassError,
    UnannotatedAttributeError,
)


# This is used at least twice, so cache it here.
_OBJ_SETATTR = object.__setattr__
_INIT_FACTORY_PAT = "__attr_factory_%s"
_CLASSVAR_PREFIXES = (
    "typing.ClassVar",
    "t.ClassVar",
    "ClassVar",
    "typing_extensions.ClassVar",
)
# we don't use a double-underscore prefix because that triggers
# name mangling when trying to create a slot for the field
# (when slots=True)
_HASH_CACHE_FIELD = "_attrs_cached_hash"

_EMPTY_METADATA_SINGLETON = types.MappingProxyType({})

# Unique object for unequivocal getattr() defaults.
_SENTINEL = object()

_DEFAULT_ON_SETATTR = setters.pipe(setters.convert, setters.validate)


class _Nothing(enum.Enum):
    """
    Sentinel to indicate the lack of a value when `None` is ambiguous.

    If extending attrs, you can use ``typing.Literal[NOTHING]`` to show
    that a value may be ``NOTHING``.

    .. versionchanged:: 21.1.0 ``bool(NOTHING)`` is now False.
    .. versionchanged:: 22.2.0 ``NOTHING`` is now an ``enum.Enum`` variant.
    """

    NOTHING = enum.auto()

    def __repr__(self):
        return "NOTHING"

    def __bool__(self):
        return False


NOTHING = _Nothing.NOTHING
"""
Sentinel to indicate the lack of a value when `None` is ambiguous.

When using in 3rd party code, use `attrs.NothingType` for type annotations.
"""


class _CacheHashWrapper(int):
    """
    An integer subclass that pickles / copies as None

    This is used for non-slots classes with ``cache_hash=True``, to avoid
    serializing a potentially (even likely) invalid hash value. Since `None`
    is the default value for uncalculated hashes, whenever this is copied,
    the copy's value for the hash should automatically reset.

    See GH #613 for more details.
    """

    def __reduce__(self, _none_constructor=type(None), _args=()):  # noqa: B008
        return _none_constructor, _args


def attrib(
    default=NOTHING,
    validator=None,
    repr=True,
    cmp=None,
    hash=None,
    init=True,
    metadata=None,
    type=None,
    converter=None,
    factory=None,
    kw_only=False,
    eq=None,
    order=None,
    on_setattr=None,
    alias=None,
):
    """
    Create a new field / attribute on a class.

    Identical to `attrs.field`, except it's not keyword-only.

    Consider using `attrs.field` in new code (``attr.ib`` will *never* go away,
    though).

    ..  warning::

        Does **nothing** unless the class is also decorated with
        `attr.s` (or similar)!


    .. versionadded:: 15.2.0 *convert*
    .. versionadded:: 16.3.0 *metadata*
    .. versionchanged:: 17.1.0 *validator* can be a ``list`` now.
    .. versionchanged:: 17.1.0
       *hash* is `None` and therefore mirrors *eq* by default.
    .. versionadded:: 17.3.0 *type*
    .. deprecated:: 17.4.0 *convert*
    .. versionadded:: 17.4.0
       *converter* as a replacement for the deprecated *convert* to achieve
       consistency with other noun-based arguments.
    .. versionadded:: 18.1.0
       ``factory=f`` is syntactic sugar for ``default=attr.Factory(f)``.
    .. versionadded:: 18.2.0 *kw_only*
    .. versionchanged:: 19.2.0 *convert* keyword argument removed.
    .. versionchanged:: 19.2.0 *repr* also accepts a custom callable.
    .. deprecated:: 19.2.0 *cmp* Removal on or after 2021-06-01.
    .. versionadded:: 19.2.0 *eq* and *order*
    .. versionadded:: 20.1.0 *on_setattr*
    .. versionchanged:: 20.3.0 *kw_only* backported to Python 2
    .. versionchanged:: 21.1.0
       *eq*, *order*, and *cmp* also accept a custom callable
    .. versionchanged:: 21.1.0 *cmp* undeprecated
    .. versionadded:: 22.2.0 *alias*
    """
    eq, eq_key, order, order_key = _determine_attrib_eq_order(
        cmp, eq, order, True
    )

    if hash is not None and hash is not True and hash is not False:
        msg = "Invalid value for hash.  Must be True, False, or None."
        raise TypeError(msg)

    if factory is not None:
        if default is not NOTHING:
            msg = (
                "The `default` and `factory` arguments are mutually exclusive."
            )
            raise ValueError(msg)
        if not callable(factory):
            msg = "The `factory` argument must be a callable."
            raise ValueError(msg)
        default = Factory(factory)

    if metadata is None:
        metadata = {}

    # Apply syntactic sugar by auto-wrapping.
    if isinstance(on_setattr, (list, tuple)):
        on_setattr = setters.pipe(*on_setattr)

    if validator and isinstance(validator, (list, tuple)):
        validator = and_(*validator)

    if converter and isinstance(converter, (list, tuple)):
        converter = pipe(*converter)

    return _CountingAttr(
        default=default,
        validator=validator,
        repr=repr,
        cmp=None,
        hash=hash,
        init=init,
        converter=converter,
        metadata=metadata,
        type=type,
        kw_only=kw_only,
        eq=eq,
        eq_key=eq_key,
        order=order,
        order_key=order_key,
        on_setattr=on_setattr,
        alias=alias,
    )


def _compile_and_eval(
    script: str,
    globs: dict[str, Any] | None,
    locs: Mapping[str, object] | None = None,
    filename: str = "",
) -> None:
    """
    Evaluate the script with the given global (globs) and local (locs)
    variables.
    """
    bytecode = compile(script, filename, "exec")
    eval(bytecode, globs, locs)


def _linecache_and_compile(
    script: str,
    filename: str,
    globs: dict[str, Any] | None,
    locals: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    """
    Cache the script with _linecache_, compile it and return the _locals_.
    """

    locs = {} if locals is None else locals

    # In order of debuggers like PDB being able to step through the code,
    # we add a fake linecache entry.
    count = 1
    base_filename = filename
    while True:
        linecache_tuple = (
            len(script),
            None,
            script.splitlines(True),
            filename,
        )
        old_val = linecache.cache.setdefault(filename, linecache_tuple)
        if old_val == linecache_tuple:
            break

        filename = f"{base_filename[:-1]}-{count}>"
        count += 1

    _compile_and_eval(script, globs, locs, filename)

    return locs


def _make_attr_tuple_class(cls_name: str, attr_names: list[str]) -> type:
    """
    Create a tuple subclass to hold `Attribute`s for an `attrs` class.

    The subclass is a bare tuple with properties for names.

    class MyClassAttributes(tuple):
        __slots__ = ()
        x = property(itemgetter(0))
    """
    attr_class_name = f"{cls_name}Attributes"
    body = {}
    for i, attr_name in enumerate(attr_names):

        def getter(self, i=i):
            return self[i]

        body[attr_name] = property(getter)
    return type(attr_class_name, (tuple,), body)


# Tuple class for extracted attributes from a class definition.
# `base_attrs` is a subset of `attrs`.
class _Attributes(NamedTuple):
    attrs: type
    base_attrs: list[Attribute]
    base_attrs_map: dict[str, type]


def _is_class_var(annot):
    """
    Check whether *annot* is a typing.ClassVar.

    The string comparison hack is used to avoid evaluating all string
    annotations which would put attrs-based classes at a performance
    disadvantage compared to plain old classes.
    """
    annot = str(annot)

    # Annotation can be quoted.
    if annot.startswith(("'", '"')) and annot.endswith(("'", '"')):
        annot = annot[1:-1]

    return annot.startswith(_CLASSVAR_PREFIXES)


def _has_own_attribute(cls, attrib_name):
    """
    Check whether *cls* defines *attrib_name* (and doesn't just inherit it).
    """
    return attrib_name in cls.__dict__


def _collect_base_attrs(
    cls, taken_attr_names
) -> tuple[list[Attribute], dict[str, type]]:
    """
    Collect attr.ibs from base classes of *cls*, except *taken_attr_names*.
    """
    base_attrs = []
    base_attr_map = {}  # A dictionary of base attrs to their classes.

    # Traverse the MRO and collect attributes.
    for base_cls in reversed(cls.__mro__[1:-1]):
        for a in getattr(base_cls, "__attrs_attrs__", []):
            if a.inherited or a.name in taken_attr_names:
                continue

            a = a.evolve(inherited=True)  # noqa: PLW2901
            base_attrs.append(a)
            base_attr_map[a.name] = base_cls

    # For each name, only keep the freshest definition i.e. the furthest at the
    # back.  base_attr_map is fine because it gets overwritten with every new
    # instance.
    filtered = []
    seen = set()
    for a in reversed(base_attrs):
        if a.name in seen:
            continue
        filtered.insert(0, a)
        seen.add(a.name)

    return filtered, base_attr_map


def _collect_base_attrs_broken(cls, taken_attr_names):
    """
    Collect attr.ibs from base classes of *cls*, except *taken_attr_names*.

    N.B. *taken_attr_names* will be mutated.

    Adhere to the old incorrect behavior.

    Notably it collects from the front and considers inherited attributes which
    leads to the buggy behavior reported in #428.
    """
    base_attrs = []
    base_attr_map = {}  # A dictionary of base attrs to their classes.

    # Traverse the MRO and collect attributes.
    for base_cls in cls.__mro__[1:-1]:
        for a in getattr(base_cls, "__attrs_attrs__", []):
            if a.name in taken_attr_names:
                continue

            a = a.evolve(inherited=True)  # noqa: PLW2901
            taken_attr_names.add(a.name)
            base_attrs.append(a)
            base_attr_map[a.name] = base_cls

    return base_attrs, base_attr_map


def _transform_attrs(
    cls, these, auto_attribs, kw_only, collect_by_mro, field_transformer
) -> _Attributes:
    """
    Transform all `_CountingAttr`s on a class into `Attribute`s.

    If *these* is passed, use that and don't look for them on the class.

    If *collect_by_mro* is True, collect them in the correct MRO order,
    otherwise use the old -- incorrect -- order.  See #428.

    Return an `_Attributes`.
    """
    cd = cls.__dict__
    anns = _get_annotations(cls)

    if these is not None:
        ca_list = list(these.items())
    elif auto_attribs is True:
        ca_names = {
            name
            for name, attr in cd.items()
            if attr.__class__ is _CountingAttr
        }
        ca_list = []
        annot_names = set()
        for attr_name, type in anns.items():
            if _is_class_var(type):
                continue
            annot_names.add(attr_name)
            a = cd.get(attr_name, NOTHING)

            if a.__class__ is not _CountingAttr:
                a = attrib(a)
            ca_list.append((attr_name, a))

        unannotated = ca_names - annot_names
        if unannotated:
            raise UnannotatedAttributeError(
                "The following `attr.ib`s lack a type annotation: "
                + ", ".join(
                    sorted(unannotated, key=lambda n: cd.get(n).counter)
                )
                + "."
            )
    else:
        ca_list = sorted(
            (
                (name, attr)
                for name, attr in cd.items()
                if attr.__class__ is _CountingAttr
            ),
            key=lambda e: e[1].counter,
        )

    fca = Attribute.from_counting_attr
    own_attrs = [
        fca(attr_name, ca, anns.get(attr_name)) for attr_name, ca in ca_list
    ]

    if collect_by_mro:
        base_attrs, base_attr_map = _collect_base_attrs(
            cls, {a.name for a in own_attrs}
        )
    else:
        base_attrs, base_attr_map = _collect_base_attrs_broken(
            cls, {a.name for a in own_attrs}
        )

    if kw_only:
        own_attrs = [a.evolve(kw_only=True) for a in own_attrs]
        base_attrs = [a.evolve(kw_only=True) for a in base_attrs]

    attrs = base_attrs + own_attrs

    if field_transformer is not None:
        attrs = tuple(field_transformer(cls, attrs))

    # Check attr order after executing the field_transformer.
    # Mandatory vs non-mandatory attr order only matters when they are part of
    # the __init__ signature and when they aren't kw_only (which are moved to
    # the end and can be mandatory or non-mandatory in any order, as they will
    # be specified as keyword args anyway). Check the order of those attrs:
    had_default = False
    for a in (a for a in attrs if a.init is not False and a.kw_only is False):
        if had_default is True and a.default is NOTHING:
            msg = f"No mandatory attributes allowed after an attribute with a default value or factory.  Attribute in question: {a!r}"
            raise ValueError(msg)

        if had_default is False and a.default is not NOTHING:
            had_default = True

    # Resolve default field alias after executing field_transformer.
    # This allows field_transformer to differentiate between explicit vs
    # default aliases and supply their own defaults.
    for a in attrs:
        if not a.alias:
            # Evolve is very slow, so we hold our nose and do it dirty.
            _OBJ_SETATTR.__get__(a)("alias", _default_init_alias_for(a.name))

    # Create AttrsClass *after* applying the field_transformer since it may
    # add or remove attributes!
    attr_names = [a.name for a in attrs]
    AttrsClass = _make_attr_tuple_class(cls.__name__, attr_names)

    return _Attributes(AttrsClass(attrs), base_attrs, base_attr_map)


def _make_cached_property_getattr(cached_properties, original_getattr, cls):
    lines = [
        # Wrapped to get `__class__` into closure cell for super()
        # (It will be replaced with the newly constructed class after construction).
        "def wrapper(_cls):",
        "    __class__ = _cls",
        "    def __getattr__(self, item, cached_properties=cached_properties, original_getattr=original_getattr, _cached_setattr_get=_cached_setattr_get):",
        "         func = cached_properties.get(item)",
        "         if func is not None:",
        "              result = func(self)",
        "              _setter = _cached_setattr_get(self)",
        "              _setter(item, result)",
        "              return result",
    ]
    if original_getattr is not None:
        lines.append(
            "         return original_getattr(self, item)",
        )
    else:
        lines.extend(
            [
                "         try:",
                "             return super().__getattribute__(item)",
                "         except AttributeError:",
                "             if not hasattr(super(), '__getattr__'):",
                "                 raise",
                "             return super().__getattr__(item)",
                "         original_error = f\"'{self.__class__.__name__}' object has no attribute '{item}'\"",
                "         raise AttributeError(original_error)",
            ]
        )

    lines.extend(
        [
            "    return __getattr__",
            "__getattr__ = wrapper(_cls)",
        ]
    )

    unique_filename = _generate_unique_filename(cls, "getattr")

    glob = {
        "cached_properties": cached_properties,
        "_cached_setattr_get": _OBJ_SETATTR.__get__,
        "original_getattr": original_getattr,
    }

    return _linecache_and_compile(
        "\n".join(lines), unique_filename, glob, locals={"_cls": cls}
    )["__getattr__"]


def _frozen_setattrs(self, name, value):
    """
    Attached to frozen classes as __setattr__.
    """
    if isinstance(self, BaseException) and name in (
        "__cause__",
        "__context__",
        "__traceback__",
        "__suppress_context__",
        "__notes__",
    ):
        BaseException.__setattr__(self, name, value)
        return

    raise FrozenInstanceError


def _frozen_delattrs(self, name):
    """
    Attached to frozen classes as __delattr__.
    """
    if isinstance(self, BaseException) and name in ("__notes__",):
        BaseException.__delattr__(self, name)
        return

    raise FrozenInstanceError


def evolve(*args, **changes):
    """
    Create a new instance, based on the first positional argument with
    *changes* applied.

    .. tip::

       On Python 3.13 and later, you can also use `copy.replace` instead.

    Args:

        inst:
            Instance of a class with *attrs* attributes. *inst* must be passed
            as a positional argument.

        changes:
            Keyword changes in the new copy.

    Returns:
        A copy of inst with *changes* incorporated.

    Raises:
        TypeError:
            If *attr_name* couldn't be found in the class ``__init__``.

        attrs.exceptions.NotAnAttrsClassError:
            If *cls* is not an *attrs* class.

    .. versionadded:: 17.1.0
    .. deprecated:: 23.1.0
       It is now deprecated to pass the instance using the keyword argument
       *inst*. It will raise a warning until at least April 2024, after which
       it will become an error. Always pass the instance as a positional
       argument.
    .. versionchanged:: 24.1.0
       *inst* can't be passed as a keyword argument anymore.
    """
    try:
        (inst,) = args
    except ValueError:
        msg = (
            f"evolve() takes 1 positional argument, but {len(args)} were given"
        )
        raise TypeError(msg) from None

    cls = inst.__class__
    attrs = fields(cls)
    for a in attrs:
        if not a.init:
            continue
        attr_name = a.name  # To deal with private attributes.
        init_name = a.alias
        if init_name not in changes:
            changes[init_name] = getattr(inst, attr_name)

    return cls(**changes)


class _ClassBuilder:
    """
    Iteratively build *one* class.
    """

    __slots__ = (
        "_add_method_dunders",
        "_attr_names",
        "_attrs",
        "_base_attr_map",
        "_base_names",
        "_cache_hash",
        "_cls",
        "_cls_dict",
        "_delete_attribs",
        "_frozen",
        "_has_custom_setattr",
        "_has_post_init",
        "_has_pre_init",
        "_is_exc",
        "_on_setattr",
        "_pre_init_has_args",
        "_repr_added",
        "_script_snippets",
        "_slots",
        "_weakref_slot",
        "_wrote_own_setattr",
    )

    def __init__(
        self,
        cls: type,
        these,
        slots,
        frozen,
        weakref_slot,
        getstate_setstate,
        auto_attribs,
        kw_only,
        cache_hash,
        is_exc,
        collect_by_mro,
        on_setattr,
        has_custom_setattr,
        field_transformer,
    ):
        attrs, base_attrs, base_map = _transform_attrs(
            cls,
            these,
            auto_attribs,
            kw_only,
            collect_by_mro,
            field_transformer,
        )

        self._cls = cls
        self._cls_dict = dict(cls.__dict__) if slots else {}
        self._attrs = attrs
        self._base_names = {a.name for a in base_attrs}
        self._base_attr_map = base_map
        self._attr_names = tuple(a.name for a in attrs)
        self._slots = slots
        self._frozen = frozen
        self._weakref_slot = weakref_slot
        self._cache_hash = cache_hash
        self._has_pre_init = bool(getattr(cls, "__attrs_pre_init__", False))
        self._pre_init_has_args = False
        if self._has_pre_init:
            # Check if the pre init method has more arguments than just `self`
            # We want to pass arguments if pre init expects arguments
            pre_init_func = cls.__attrs_pre_init__
            pre_init_signature = inspect.signature(pre_init_func)
            self._pre_init_has_args = len(pre_init_signature.parameters) > 1
        self._has_post_init = bool(getattr(cls, "__attrs_post_init__", False))
        self._delete_attribs = not bool(these)
        self._is_exc = is_exc
        self._on_setattr = on_setattr

        self._has_custom_setattr = has_custom_setattr
        self._wrote_own_setattr = False

        self._cls_dict["__attrs_attrs__"] = self._attrs

        if frozen:
            self._cls_dict["__setattr__"] = _frozen_setattrs
            self._cls_dict["__delattr__"] = _frozen_delattrs

            self._wrote_own_setattr = True
        elif on_setattr in (
            _DEFAULT_ON_SETATTR,
            setters.validate,
            setters.convert,
        ):
            has_validator = has_converter = False
            for a in attrs:
                if a.validator is not None:
                    has_validator = True
                if a.converter is not None:
                    has_converter = True

                if has_validator and has_converter:
                    break
            if (
                (
                    on_setattr == _DEFAULT_ON_SETATTR
                    and not (has_validator or has_converter)
                )
                or (on_setattr == setters.validate and not has_validator)
                or (on_setattr == setters.convert and not has_converter)
            ):
                # If class-level on_setattr is set to convert + validate, but
                # there's no field to convert or validate, pretend like there's
                # no on_setattr.
                self._on_setattr = None

        if getstate_setstate:
            (
                self._cls_dict["__getstate__"],
                self._cls_dict["__setstate__"],
            ) = self._make_getstate_setstate()

        # tuples of script, globs, hook
        self._script_snippets: list[
            tuple[str, dict, Callable[[dict, dict], Any]]
        ] = []
        self._repr_added = False

        # We want to only do this check once; in 99.9% of cases these
        # exist.
        if not hasattr(self._cls, "__module__") or not hasattr(
            self._cls, "__qualname__"
        ):
            self._add_method_dunders = self._add_method_dunders_safe
        else:
            self._add_method_dunders = self._add_method_dunders_unsafe

    def __repr__(self):
        return f"<_ClassBuilder(cls={self._cls.__name__})>"

    def _eval_snippets(self) -> None:
        """
        Evaluate any registered snippets in one go.
        """
        script = "\n".join([snippet[0] for snippet in self._script_snippets])
        globs = {}
        for _, snippet_globs, _ in self._script_snippets:
            globs.update(snippet_globs)

        locs = _linecache_and_compile(
            script,
            _generate_unique_filename(self._cls, "methods"),
            globs,
        )

        for _, _, hook in self._script_snippets:
            hook(self._cls_dict, locs)

    def build_class(self):
        """
        Finalize class based on the accumulated configuration.

        Builder cannot be used after calling this method.
        """
        self._eval_snippets()
        if self._slots is True:
            cls = self._create_slots_class()
        else:
            cls = self._patch_original_class()
            if PY_3_10_PLUS:
                cls = abc.update_abstractmethods(cls)

        # The method gets only called if it's not inherited from a base class.
        # _has_own_attribute does NOT work properly for classmethods.
        if (
            getattr(cls, "__attrs_init_subclass__", None)
            and "__attrs_init_subclass__" not in cls.__dict__
        ):
            cls.__attrs_init_subclass__()

        return cls

    def _patch_original_class(self):
        """
        Apply accumulated methods and return the class.
        """
        cls = self._cls
        base_names = self._base_names

        # Clean class of attribute definitions (`attr.ib()`s).
        if self._delete_attribs:
            for name in self._attr_names:
                if (
                    name not in base_names
                    and getattr(cls, name, _SENTINEL) is not _SENTINEL
                ):
                    # An AttributeError can happen if a base class defines a
                    # class variable and we want to set an attribute with the
                    # same name by using only a type annotation.
                    with contextlib.suppress(AttributeError):
                        delattr(cls, name)

        # Attach our dunder methods.
        for name, value in self._cls_dict.items():
            setattr(cls, name, value)

        # If we've inherited an attrs __setattr__ and don't write our own,
        # reset it to object's.
        if not self._wrote_own_setattr and getattr(
            cls, "__attrs_own_setattr__", False
        ):
            cls.__attrs_own_setattr__ = False

            if not self._has_custom_setattr:
                cls.__setattr__ = _OBJ_SETATTR

        return cls

    def _create_slots_class(self):
        """
        Build and return a new class with a `__slots__` attribute.
        """
        cd = {
            k: v
            for k, v in self._cls_dict.items()
            if k not in (*tuple(self._attr_names), "__dict__", "__weakref__")
        }

        # If our class doesn't have its own implementation of __setattr__
        # (either from the user or by us), check the bases, if one of them has
        # an attrs-made __setattr__, that needs to be reset. We don't walk the
        # MRO because we only care about our immediate base classes.
        # XXX: This can be confused by subclassing a slotted attrs class with
        # XXX: a non-attrs class and subclass the resulting class with an attrs
        # XXX: class.  See `test_slotted_confused` for details.  For now that's
        # XXX: OK with us.
        if not self._wrote_own_setattr:
            cd["__attrs_own_setattr__"] = False

            if not self._has_custom_setattr:
                for base_cls in self._cls.__bases__:
                    if base_cls.__dict__.get("__attrs_own_setattr__", False):
                        cd["__setattr__"] = _OBJ_SETATTR
                        break

        # Traverse the MRO to collect existing slots
        # and check for an existing __weakref__.
        existing_slots = {}
        weakref_inherited = False
        for base_cls in self._cls.__mro__[1:-1]:
            if base_cls.__dict__.get("__weakref__", None) is not None:
                weakref_inherited = True
            existing_slots.update(
                {
                    name: getattr(base_cls, name)
                    for name in getattr(base_cls, "__slots__", [])
                }
            )

        base_names = set(self._base_names)

        names = self._attr_names
        if (
            self._weakref_slot
            and "__weakref__" not in getattr(self._cls, "__slots__", ())
            and "__weakref__" not in names
            and not weakref_inherited
        ):
            names += ("__weakref__",)

        cached_properties = {
            name: cached_prop.func
            for name, cached_prop in cd.items()
            if isinstance(cached_prop, cached_property)
        }

        # Collect methods with a `__class__` reference that are shadowed in the new class.
        # To know to update them.
        additional_closure_functions_to_update = []
        if cached_properties:
            class_annotations = _get_annotations(self._cls)
            for name, func in cached_properties.items():
                # Add cached properties to names for slotting.
                names += (name,)
                # Clear out function from class to avoid clashing.
                del cd[name]
                additional_closure_functions_to_update.append(func)
                annotation = inspect.signature(func).return_annotation
                if annotation is not inspect.Parameter.empty:
                    class_annotations[name] = annotation

            original_getattr = cd.get("__getattr__")
            if original_getattr is not None:
                additional_closure_functions_to_update.append(original_getattr)

            cd["__getattr__"] = _make_cached_property_getattr(
                cached_properties, original_getattr, self._cls
            )

        # We only add the names of attributes that aren't inherited.
        # Setting __slots__ to inherited attributes wastes memory.
        slot_names = [name for name in names if name not in base_names]

        # There are slots for attributes from current class
        # that are defined in parent classes.
        # As their descriptors may be overridden by a child class,
        # we collect them here and update the class dict
        reused_slots = {
            slot: slot_descriptor
            for slot, slot_descriptor in existing_slots.items()
            if slot in slot_names
        }
        slot_names = [name for name in slot_names if name not in reused_slots]
        cd.update(reused_slots)
        if self._cache_hash:
            slot_names.append(_HASH_CACHE_FIELD)

        cd["__slots__"] = tuple(slot_names)

        cd["__qualname__"] = self._cls.__qualname__

        # Create new class based on old class and our methods.
        cls = type(self._cls)(self._cls.__name__, self._cls.__bases__, cd)

        # The following is a fix for
        # <https://github.com/python-attrs/attrs/issues/102>.
        # If a method mentions `__class__` or uses the no-arg super(), the
        # compiler will bake a reference to the class in the method itself
        # as `method.__closure__`.  Since we replace the class with a
        # clone, we rewrite these references so it keeps working.
        for item in itertools.chain(
            cls.__dict__.values(), additional_closure_functions_to_update
        ):
            if isinstance(item, (classmethod, staticmethod)):
                # Class- and staticmethods hide their functions inside.
                # These might need to be rewritten as well.
                closure_cells = getattr(item.__func__, "__closure__", None)
            elif isinstance(item, property):
                # Workaround for property `super()` shortcut (PY3-only).
                # There is no universal way for other descriptors.
                closure_cells = getattr(item.fget, "__closure__", None)
            else:
                closure_cells = getattr(item, "__closure__", None)

            if not closure_cells:  # Catch None or the empty list.
                continue
            for cell in closure_cells:
                try:
                    match = cell.cell_contents is self._cls
                except ValueError:  # noqa: PERF203
                    # ValueError: Cell is empty
                    pass
                else:
                    if match:
                        cell.cell_contents = cls
        return cls

    def add_repr(self, ns):
        script, globs = _make_repr_script(self._attrs, ns)

        def _attach_repr(cls_dict, globs):
            cls_dict["__repr__"] = self._add_method_dunders(globs["__repr__"])

        self._script_snippets.append((script, globs, _attach_repr))
        self._repr_added = True
        return self

    def add_str(self):
        if not self._repr_added:
            msg = "__str__ can only be generated if a __repr__ exists."
            raise ValueError(msg)

        def __str__(self):
            return self.__repr__()

        self._cls_dict["__str__"] = self._add_method_dunders(__str__)
        return self

    def _make_getstate_setstate(self):
        """
        Create custom __setstate__ and __getstate__ methods.
        """
        # __weakref__ is not writable.
        state_attr_names = tuple(
            an for an in self._attr_names if an != "__weakref__"
        )

        def slots_getstate(self):
            """
            Automatically created by attrs.
            """
            return {name: getattr(self, name) for name in state_attr_names}

        hash_caching_enabled = self._cache_hash

        def slots_setstate(self, state):
            """
            Automatically created by attrs.
            """
            __bound_setattr = _OBJ_SETATTR.__get__(self)
            if isinstance(state, tuple):
                # Backward compatibility with attrs instances pickled with
                # attrs versions before v22.2.0 which stored tuples.
                for name, value in zip(state_attr_names, state):
                    __bound_setattr(name, value)
            else:
                for name in state_attr_names:
                    if name in state:
                        __bound_setattr(name, state[name])

            # The hash code cache is not included when the object is
            # serialized, but it still needs to be initialized to None to
            # indicate that the first call to __hash__ should be a cache
            # miss.
            if hash_caching_enabled:
                __bound_setattr(_HASH_CACHE_FIELD, None)

        return slots_getstate, slots_setstate

    def make_unhashable(self):
        self._cls_dict["__hash__"] = None
        return self

    def add_hash(self):
        script, globs = _make_hash_script(
            self._cls,
            self._attrs,
            frozen=self._frozen,
            cache_hash=self._cache_hash,
        )

        def attach_hash(cls_dict: dict, locs: dict) -> None:
            cls_dict["__hash__"] = self._add_method_dunders(locs["__hash__"])

        self._script_snippets.append((script, globs, attach_hash))

        return self

    def add_init(self):
        script, globs, annotations = _make_init_script(
            self._cls,
            self._attrs,
            self._has_pre_init,
            self._pre_init_has_args,
            self._has_post_init,
            self._frozen,
            self._slots,
            self._cache_hash,
            self._base_attr_map,
            self._is_exc,
            self._on_setattr,
            attrs_init=False,
        )

        def _attach_init(cls_dict, globs):
            init = globs["__init__"]
            init.__annotations__ = annotations
            cls_dict["__init__"] = self._add_method_dunders(init)

        self._script_snippets.append((script, globs, _attach_init))

        return self

    def add_replace(self):
        self._cls_dict["__replace__"] = self._add_method_dunders(
            lambda self, **changes: evolve(self, **changes)
        )
        return self

    def add_match_args(self):
        self._cls_dict["__match_args__"] = tuple(
            field.name
            for field in self._attrs
            if field.init and not field.kw_only
        )

    def add_attrs_init(self):
        script, globs, annotations = _make_init_script(
            self._cls,
            self._attrs,
            self._has_pre_init,
            self._pre_init_has_args,
            self._has_post_init,
            self._frozen,
            self._slots,
            self._cache_hash,
            self._base_attr_map,
            self._is_exc,
            self._on_setattr,
            attrs_init=True,
        )

        def _attach_attrs_init(cls_dict, globs):
            init = globs["__attrs_init__"]
            init.__annotations__ = annotations
            cls_dict["__attrs_init__"] = self._add_method_dunders(init)

        self._script_snippets.append((script, globs, _attach_attrs_init))

        return self

    def add_eq(self):
        cd = self._cls_dict

        script, globs = _make_eq_script(self._attrs)

        def _attach_eq(cls_dict, globs):
            cls_dict["__eq__"] = self._add_method_dunders(globs["__eq__"])

        self._script_snippets.append((script, globs, _attach_eq))

        cd["__ne__"] = __ne__

        return self

    def add_order(self):
        cd = self._cls_dict

        cd["__lt__"], cd["__le__"], cd["__gt__"], cd["__ge__"] = (
            self._add_method_dunders(meth)
            for meth in _make_order(self._cls, self._attrs)
        )

        return self

    def add_setattr(self):
        sa_attrs = {}
        for a in self._attrs:
            on_setattr = a.on_setattr or self._on_setattr
            if on_setattr and on_setattr is not setters.NO_OP:
                sa_attrs[a.name] = a, on_setattr

        if not sa_attrs:
            return self

        if self._has_custom_setattr:
            # We need to write a __setattr__ but there already is one!
            msg = "Can't combine custom __setattr__ with on_setattr hooks."
            raise ValueError(msg)

        # docstring comes from _add_method_dunders
        def __setattr__(self, name, val):
            try:
                a, hook = sa_attrs[name]
            except KeyError:
                nval = val
            else:
                nval = hook(self, a, val)

            _OBJ_SETATTR(self, name, nval)

        self._cls_dict["__attrs_own_setattr__"] = True
        self._cls_dict["__setattr__"] = self._add_method_dunders(__setattr__)
        self._wrote_own_setattr = True

        return self

    def _add_method_dunders_unsafe(self, method: Callable) -> Callable:
        """
        Add __module__ and __qualname__ to a *method*.
        """
        method.__module__ = self._cls.__module__

        method.__qualname__ = f"{self._cls.__qualname__}.{method.__name__}"

        method.__doc__ = (
            f"Method generated by attrs for class {self._cls.__qualname__}."
        )

        return method

    def _add_method_dunders_safe(self, method: Callable) -> Callable:
        """
        Add __module__ and __qualname__ to a *method* if possible.
        """
        with contextlib.suppress(AttributeError):
            method.__module__ = self._cls.__module__

        with contextlib.suppress(AttributeError):
            method.__qualname__ = f"{self._cls.__qualname__}.{method.__name__}"

        with contextlib.suppress(AttributeError):
            method.__doc__ = f"Method generated by attrs for class {self._cls.__qualname__}."

        return method


def _determine_attrs_eq_order(cmp, eq, order, default_eq):
    """
    Validate the combination of *cmp*, *eq*, and *order*. Derive the effective
    values of eq and order.  If *eq* is None, set it to *default_eq*.
    """
    if cmp is not None and any((eq is not None, order is not None)):
        msg = "Don't mix `cmp` with `eq' and `order`."
        raise ValueError(msg)

    # cmp takes precedence due to bw-compatibility.
    if cmp is not None:
        return cmp, cmp

    # If left None, equality is set to the specified default and ordering
    # mirrors equality.
    if eq is None:
        eq = default_eq

    if order is None:
        order = eq

    if eq is False and order is True:
        msg = "`order` can only be True if `eq` is True too."
        raise ValueError(msg)

    return eq, order


def _determine_attrib_eq_order(cmp, eq, order, default_eq):
    """
    Validate the combination of *cmp*, *eq*, and *order*. Derive the effective
    values of eq and order.  If *eq* is None, set it to *default_eq*.
    """
    if cmp is not None and any((eq is not None, order is not None)):
        msg = "Don't mix `cmp` with `eq' and `order`."
        raise ValueError(msg)

    def decide_callable_or_boolean(value):
        """
        Decide whether a key function is used.
        """
        if callable(value):
            value, key = True, value
        else:
            key = None
        return value, key

    # cmp takes precedence due to bw-compatibility.
    if cmp is not None:
        cmp, cmp_key = decide_callable_or_boolean(cmp)
        return cmp, cmp_key, cmp, cmp_key

    # If left None, equality is set to the specified default and ordering
    # mirrors equality.
    if eq is None:
        eq, eq_key = default_eq, None
    else:
        eq, eq_key = decide_callable_or_boolean(eq)

    if order is None:
        order, order_key = eq, eq_key
    else:
        order, order_key = decide_callable_or_boolean(order)

    if eq is False and order is True:
        msg = "`order` can only be True if `eq` is True too."
        raise ValueError(msg)

    return eq, eq_key, order, order_key


def _determine_whether_to_implement(
    cls, flag, auto_detect, dunders, default=True
):
    """
    Check whether we should implement a set of methods for *cls*.

    *flag* is the argument passed into @attr.s like 'init', *auto_detect* the
    same as passed into @attr.s and *dunders* is a tuple of attribute names
    whose presence signal that the user has implemented it themselves.

    Return *default* if no reason for either for or against is found.
    """
    if flag is True or flag is False:
        return flag

    if flag is None and auto_detect is False:
        return default

    # Logically, flag is None and auto_detect is True here.
    for dunder in dunders:
        if _has_own_attribute(cls, dunder):
            return False

    return default


def attrs(
    maybe_cls=None,
    these=None,
    repr_ns=None,
    repr=None,
    cmp=None,
    hash=None,
    init=None,
    slots=False,
    frozen=False,
    weakref_slot=True,
    str=False,
    auto_attribs=False,
    kw_only=False,
    cache_hash=False,
    auto_exc=False,
    eq=None,
    order=None,
    auto_detect=False,
    collect_by_mro=False,
    getstate_setstate=None,
    on_setattr=None,
    field_transformer=None,
    match_args=True,
    unsafe_hash=None,
):
    r"""
    A class decorator that adds :term:`dunder methods` according to the
    specified attributes using `attr.ib` or the *these* argument.

    Consider using `attrs.define` / `attrs.frozen` in new code (``attr.s`` will
    *never* go away, though).

    Args:
        repr_ns (str):
            When using nested classes, there was no way in Python 2 to
            automatically detect that.  This argument allows to set a custom
            name for a more meaningful ``repr`` output.  This argument is
            pointless in Python 3 and is therefore deprecated.

    .. caution::
        Refer to `attrs.define` for the rest of the parameters, but note that they
        can have different defaults.

        Notably, leaving *on_setattr* as `None` will **not** add any hooks.

    .. versionadded:: 16.0.0 *slots*
    .. versionadded:: 16.1.0 *frozen*
    .. versionadded:: 16.3.0 *str*
    .. versionadded:: 16.3.0 Support for ``__attrs_post_init__``.
    .. versionchanged:: 17.1.0
       *hash* supports `None` as value which is also the default now.
    .. versionadded:: 17.3.0 *auto_attribs*
    .. versionchanged:: 18.1.0
       If *these* is passed, no attributes are deleted from the class body.
    .. versionchanged:: 18.1.0 If *these* is ordered, the order is retained.
    .. versionadded:: 18.2.0 *weakref_slot*
    .. deprecated:: 18.2.0
       ``__lt__``, ``__le__``, ``__gt__``, and ``__ge__`` now raise a
       `DeprecationWarning` if the classes compared are subclasses of
       each other. ``__eq`` and ``__ne__`` never tried to compared subclasses
       to each other.
    .. versionchanged:: 19.2.0
       ``__lt__``, ``__le__``, ``__gt__``, and ``__ge__`` now do not consider
       subclasses comparable anymore.
    .. versionadded:: 18.2.0 *kw_only*
    .. versionadded:: 18.2.0 *cache_hash*
    .. versionadded:: 19.1.0 *auto_exc*
    .. deprecated:: 19.2.0 *cmp* Removal on or after 2021-06-01.
    .. versionadded:: 19.2.0 *eq* and *order*
    .. versionadded:: 20.1.0 *auto_detect*
    .. versionadded:: 20.1.0 *collect_by_mro*
    .. versionadded:: 20.1.0 *getstate_setstate*
    .. versionadded:: 20.1.0 *on_setattr*
    .. versionadded:: 20.3.0 *field_transformer*
    .. versionchanged:: 21.1.0
       ``init=False`` injects ``__attrs_init__``
    .. versionchanged:: 21.1.0 Support for ``__attrs_pre_init__``
    .. versionchanged:: 21.1.0 *cmp* undeprecated
    .. versionadded:: 21.3.0 *match_args*
    .. versionadded:: 22.2.0
       *unsafe_hash* as an alias for *hash* (for :pep:`681` compliance).
    .. deprecated:: 24.1.0 *repr_ns*
    .. versionchanged:: 24.1.0
       Instances are not compared as tuples of attributes anymore, but using a
       big ``and`` condition. This is faster and has more correct behavior for
       uncomparable values like `math.nan`.
    .. versionadded:: 24.1.0
       If a class has an *inherited* classmethod called
       ``__attrs_init_subclass__``, it is executed after the class is created.
    .. deprecated:: 24.1.0 *hash* is deprecated in favor of *unsafe_hash*.
    """
    if repr_ns is not None:
        import warnings

        warnings.warn(
            DeprecationWarning(
                "The `repr_ns` argument is deprecated and will be removed in or after August 2025."
            ),
            stacklevel=2,
        )

    eq_, order_ = _determine_attrs_eq_order(cmp, eq, order, None)

    #  unsafe_hash takes precedence due to PEP 681.
    if unsafe_hash is not None:
        hash = unsafe_hash

    if isinstance(on_setattr, (list, tuple)):
        on_setattr = setters.pipe(*on_setattr)

    def wrap(cls):
        is_frozen = frozen or _has_frozen_base_class(cls)
        is_exc = auto_exc is True and issubclass(cls, BaseException)
        has_own_setattr = auto_detect and _has_own_attribute(
            cls, "__setattr__"
        )

        if has_own_setattr and is_frozen:
            msg = "Can't freeze a class with a custom __setattr__."
            raise ValueError(msg)

        builder = _ClassBuilder(
            cls,
            these,
            slots,
            is_frozen,
            weakref_slot,
            _determine_whether_to_implement(
                cls,
                getstate_setstate,
                auto_detect,
                ("__getstate__", "__setstate__"),
                default=slots,
            ),
            auto_attribs,
            kw_only,
            cache_hash,
            is_exc,
            collect_by_mro,
            on_setattr,
            has_own_setattr,
            field_transformer,
        )

        if _determine_whether_to_implement(
            cls, repr, auto_detect, ("__repr__",)
        ):
            builder.add_repr(repr_ns)

        if str is True:
            builder.add_str()

        eq = _determine_whether_to_implement(
            cls, eq_, auto_detect, ("__eq__", "__ne__")
        )
        if not is_exc and eq is True:
            builder.add_eq()
        if not is_exc and _determine_whether_to_implement(
            cls, order_, auto_detect, ("__lt__", "__le__", "__gt__", "__ge__")
        ):
            builder.add_order()

        if not frozen:
            builder.add_setattr()

        nonlocal hash
        if (
            hash is None
            and auto_detect is True
            and _has_own_attribute(cls, "__hash__")
        ):
            hash = False

        if hash is not True and hash is not False and hash is not None:
            # Can't use `hash in` because 1 == True for example.
            msg = "Invalid value for hash.  Must be True, False, or None."
            raise TypeError(msg)

        if hash is False or (hash is None and eq is False) or is_exc:
            # Don't do anything. Should fall back to __object__'s __hash__
            # which is by id.
            if cache_hash:
                msg = "Invalid value for cache_hash.  To use hash caching, hashing must be either explicitly or implicitly enabled."
                raise TypeError(msg)
        elif hash is True or (
            hash is None and eq is True and is_frozen is True
        ):
            # Build a __hash__ if told so, or if it's safe.
            builder.add_hash()
        else:
            # Raise TypeError on attempts to hash.
            if cache_hash:
                msg = "Invalid value for cache_hash.  To use hash caching, hashing must be either explicitly or implicitly enabled."
                raise TypeError(msg)
            builder.make_unhashable()

        if _determine_whether_to_implement(
            cls, init, auto_detect, ("__init__",)
        ):
            builder.add_init()
        else:
            builder.add_attrs_init()
            if cache_hash:
                msg = "Invalid value for cache_hash.  To use hash caching, init must be True."
                raise TypeError(msg)

        if PY_3_13_PLUS and not _has_own_attribute(cls, "__replace__"):
            builder.add_replace()

        if (
            PY_3_10_PLUS
            and match_args
            and not _has_own_attribute(cls, "__match_args__")
        ):
            builder.add_match_args()

        return builder.build_class()

    # maybe_cls's type depends on the usage of the decorator.  It's a class
    # if it's used as `@attrs` but `None` if used as `@attrs()`.
    if maybe_cls is None:
        return wrap

    return wrap(maybe_cls)


_attrs = attrs
"""
Internal alias so we can use it in functions that take an argument called
*attrs*.
"""


def _has_frozen_base_class(cls):
    """
    Check whether *cls* has a frozen ancestor by looking at its
    __setattr__.
    """
    return cls.__setattr__ is _frozen_setattrs


def _generate_unique_filename(cls: type, func_name: str) -> str:
    """
    Create a "filename" suitable for a function being generated.
    """
    return (
        f"<attrs generated {func_name} {cls.__module__}."
        f"{getattr(cls, '__qualname__', cls.__name__)}>"
    )


def _make_hash_script(
    cls: type, attrs: list[Attribute], frozen: bool, cache_hash: bool
) -> tuple[str, dict]:
    attrs = tuple(
        a for a in attrs if a.hash is True or (a.hash is None and a.eq is True)
    )

    tab = "        "

    type_hash = hash(_generate_unique_filename(cls, "hash"))
    # If eq is custom generated, we need to include the functions in globs
    globs = {}

    hash_def = "def __hash__(self"
    hash_func = "hash(("
    closing_braces = "))"
    if not cache_hash:
        hash_def += "):"
    else:
        hash_def += ", *"

        hash_def += ", _cache_wrapper=__import__('attr._make')._make._CacheHashWrapper):"
        hash_func = "_cache_wrapper(" + hash_func
        closing_braces += ")"

    method_lines = [hash_def]

    def append_hash_computation_lines(prefix, indent):
        """
        Generate the code for actually computing the hash code.
        Below this will either be returned directly or used to compute
        a value which is then cached, depending on the value of cache_hash
        """

        method_lines.extend(
            [
                indent + prefix + hash_func,
                indent + f"        {type_hash},",
            ]
        )

        for a in attrs:
            if a.eq_key:
                cmp_name = f"_{a.name}_key"
                globs[cmp_name] = a.eq_key
                method_lines.append(
                    indent + f"        {cmp_name}(self.{a.name}),"
                )
            else:
                method_lines.append(indent + f"        self.{a.name},")

        method_lines.append(indent + "    " + closing_braces)

    if cache_hash:
        method_lines.append(tab + f"if self.{_HASH_CACHE_FIELD} is None:")
        if frozen:
            append_hash_computation_lines(
                f"object.__setattr__(self, '{_HASH_CACHE_FIELD}', ", tab * 2
            )
            method_lines.append(tab * 2 + ")")  # close __setattr__
        else:
            append_hash_computation_lines(
                f"self.{_HASH_CACHE_FIELD} = ", tab * 2
            )
        method_lines.append(tab + f"return self.{_HASH_CACHE_FIELD}")
    else:
        append_hash_computation_lines("return ", tab)

    script = "\n".join(method_lines)
    return script, globs


def _add_hash(cls: type, attrs: list[Attribute]):
    """
    Add a hash method to *cls*.
    """
    script, globs = _make_hash_script(
        cls, attrs, frozen=False, cache_hash=False
    )
    _compile_and_eval(
        script, globs, filename=_generate_unique_filename(cls, "__hash__")
    )
    cls.__hash__ = globs["__hash__"]
    return cls


def __ne__(self, other):
    """
    Check equality and either forward a NotImplemented or
    return the result negated.
    """
    result = self.__eq__(other)
    if result is NotImplemented:
        return NotImplemented

    return not result


def _make_eq_script(attrs: list) -> tuple[str, dict]:
    """
    Create __eq__ method for *cls* with *attrs*.
    """
    attrs = [a for a in attrs if a.eq]

    lines = [
        "def __eq__(self, other):",
        "    if other.__class__ is not self.__class__:",
        "        return NotImplemented",
    ]

    globs = {}
    if attrs:
        lines.append("    return  (")
        for a in attrs:
            if a.eq_key:
                cmp_name = f"_{a.name}_key"
                # Add the key function to the global namespace
                # of the evaluated function.
                globs[cmp_name] = a.eq_key
                lines.append(
                    f"        {cmp_name}(self.{a.name}) == {cmp_name}(other.{a.name})"
                )
            else:
                lines.append(f"        self.{a.name} == other.{a.name}")
            if a is not attrs[-1]:
                lines[-1] = f"{lines[-1]} and"
        lines.append("    )")
    else:
        lines.append("    return True")

    script = "\n".join(lines)

    return script, globs


def _make_order(cls, attrs):
    """
    Create ordering methods for *cls* with *attrs*.
    """
    attrs = [a for a in attrs if a.order]

    def attrs_to_tuple(obj):
        """
        Save us some typing.
        """
        return tuple(
            key(value) if key else value
            for value, key in (
                (getattr(obj, a.name), a.order_key) for a in attrs
            )
        )

    def __lt__(self, other):
        """
        Automatically created by attrs.
        """
        if other.__class__ is self.__class__:
            return attrs_to_tuple(self) < attrs_to_tuple(other)

        return NotImplemented

    def __le__(self, other):
        """
        Automatically created by attrs.
        """
        if other.__class__ is self.__class__:
            return attrs_to_tuple(self) <= attrs_to_tuple(other)

        return NotImplemented

    def __gt__(self, other):
        """
        Automatically created by attrs.
        """
        if other.__class__ is self.__class__:
            return attrs_to_tuple(self) > attrs_to_tuple(other)

        return NotImplemented

    def __ge__(self, other):
        """
        Automatically created by attrs.
        """
        if other.__class__ is self.__class__:
            return attrs_to_tuple(self) >= attrs_to_tuple(other)

        return NotImplemented

    return __lt__, __le__, __gt__, __ge__


def _add_eq(cls, attrs=None):
    """
    Add equality methods to *cls* with *attrs*.
    """
    if attrs is None:
        attrs = cls.__attrs_attrs__

    script, globs = _make_eq_script(attrs)
    _compile_and_eval(
        script, globs, filename=_generate_unique_filename(cls, "__eq__")
    )
    cls.__eq__ = globs["__eq__"]
    cls.__ne__ = __ne__

    return cls


def _make_repr_script(attrs, ns) -> tuple[str, dict]:
    """
    Create the source and globs for a __repr__ and return it.
    """
    # Figure out which attributes to include, and which function to use to
    # format them. The a.repr value can be either bool or a custom
    # callable.
    attr_names_with_reprs = tuple(
        (a.name, (repr if a.repr is True else a.repr), a.init)
        for a in attrs
        if a.repr is not False
    )
    globs = {
        name + "_repr": r for name, r, _ in attr_names_with_reprs if r != repr
    }
    globs["_compat"] = _compat
    globs["AttributeError"] = AttributeError
    globs["NOTHING"] = NOTHING
    attribute_fragments = []
    for name, r, i in attr_names_with_reprs:
        accessor = (
            "self." + name if i else 'getattr(self, "' + name + '", NOTHING)'
        )
        fragment = (
            "%s={%s!r}" % (name, accessor)
            if r == repr
            else "%s={%s_repr(%s)}" % (name, name, accessor)
        )
        attribute_fragments.append(fragment)
    repr_fragment = ", ".join(attribute_fragments)

    if ns is None:
        cls_name_fragment = '{self.__class__.__qualname__.rsplit(">.", 1)[-1]}'
    else:
        cls_name_fragment = ns + ".{self.__class__.__name__}"

    lines = [
        "def __repr__(self):",
        "  try:",
        "    already_repring = _compat.repr_context.already_repring",
        "  except AttributeError:",
        "    already_repring = {id(self),}",
        "    _compat.repr_context.already_repring = already_repring",
        "  else:",
        "    if id(self) in already_repring:",
        "      return '...'",
        "    else:",
        "      already_repring.add(id(self))",
        "  try:",
        f"    return f'{cls_name_fragment}({repr_fragment})'",
        "  finally:",
        "    already_repring.remove(id(self))",
    ]

    return "\n".join(lines), globs


def _add_repr(cls, ns=None, attrs=None):
    """
    Add a repr method to *cls*.
    """
    if attrs is None:
        attrs = cls.__attrs_attrs__

    script, globs = _make_repr_script(attrs, ns)
    _compile_and_eval(
        script, globs, filename=_generate_unique_filename(cls, "__repr__")
    )
    cls.__repr__ = globs["__repr__"]
    return cls


def fields(cls):
    """
    Return the tuple of *attrs* attributes for a class.

    The tuple also allows accessing the fields by their names (see below for
    examples).

    Args:
        cls (type): Class to introspect.

    Raises:
        TypeError: If *cls* is not a class.

        attrs.exceptions.NotAnAttrsClassError:
            If *cls* is not an *attrs* class.

    Returns:
        tuple (with name accessors) of `attrs.Attribute`

    .. versionchanged:: 16.2.0 Returned tuple allows accessing the fields
       by name.
    .. versionchanged:: 23.1.0 Add support for generic classes.
    """
    generic_base = get_generic_base(cls)

    if generic_base is None and not isinstance(cls, type):
        msg = "Passed object must be a class."
        raise TypeError(msg)

    attrs = getattr(cls, "__attrs_attrs__", None)

    if attrs is None:
        if generic_base is not None:
            attrs = getattr(generic_base, "__attrs_attrs__", None)
            if attrs is not None:
                # Even though this is global state, stick it on here to speed
                # it up. We rely on `cls` being cached for this to be
                # efficient.
                cls.__attrs_attrs__ = attrs
                return attrs
        msg = f"{cls!r} is not an attrs-decorated class."
        raise NotAnAttrsClassError(msg)

    return attrs


def fields_dict(cls):
    """
    Return an ordered dictionary of *attrs* attributes for a class, whose keys
    are the attribute names.

    Args:
        cls (type): Class to introspect.

    Raises:
        TypeError: If *cls* is not a class.

        attrs.exceptions.NotAnAttrsClassError:
            If *cls* is not an *attrs* class.

    Returns:
        dict[str, attrs.Attribute]: Dict of attribute name to definition

    .. versionadded:: 18.1.0
    """
    if not isinstance(cls, type):
        msg = "Passed object must be a class."
        raise TypeError(msg)
    attrs = getattr(cls, "__attrs_attrs__", None)
    if attrs is None:
        msg = f"{cls!r} is not an attrs-decorated class."
        raise NotAnAttrsClassError(msg)
    return {a.name: a for a in attrs}


def validate(inst):
    """
    Validate all attributes on *inst* that have a validator.

    Leaves all exceptions through.

    Args:
        inst: Instance of a class with *attrs* attributes.
    """
    if _config._run_validators is False:
        return

    for a in fields(inst.__class__):
        v = a.validator
        if v is not None:
            v(inst, a, getattr(inst, a.name))


def _is_slot_attr(a_name, base_attr_map):
    """
    Check if the attribute name comes from a slot class.
    """
    cls = base_attr_map.get(a_name)
    return cls and "__slots__" in cls.__dict__


def _make_init_script(
    cls,
    attrs,
    pre_init,
    pre_init_has_args,
    post_init,
    frozen,
    slots,
    cache_hash,
    base_attr_map,
    is_exc,
    cls_on_setattr,
    attrs_init,
) -> tuple[str, dict, dict]:
    has_cls_on_setattr = (
        cls_on_setattr is not None and cls_on_setattr is not setters.NO_OP
    )

    if frozen and has_cls_on_setattr:
        msg = "Frozen classes can't use on_setattr."
        raise ValueError(msg)

    needs_cached_setattr = cache_hash or frozen
    filtered_attrs = []
    attr_dict = {}
    for a in attrs:
        if not a.init and a.default is NOTHING:
            continue

        filtered_attrs.append(a)
        attr_dict[a.name] = a

        if a.on_setattr is not None:
            if frozen is True:
                msg = "Frozen classes can't use on_setattr."
                raise ValueError(msg)

            needs_cached_setattr = True
        elif has_cls_on_setattr and a.on_setattr is not setters.NO_OP:
            needs_cached_setattr = True

    script, globs, annotations = _attrs_to_init_script(
        filtered_attrs,
        frozen,
        slots,
        pre_init,
        pre_init_has_args,
        post_init,
        cache_hash,
        base_attr_map,
        is_exc,
        needs_cached_setattr,
        has_cls_on_setattr,
        "__attrs_init__" if attrs_init else "__init__",
    )
    if cls.__module__ in sys.modules:
        # This makes typing.get_type_hints(CLS.__init__) resolve string types.
        globs.update(sys.modules[cls.__module__].__dict__)

    globs.update({"NOTHING": NOTHING, "attr_dict": attr_dict})

    if needs_cached_setattr:
        # Save the lookup overhead in __init__ if we need to circumvent
        # setattr hooks.
        globs["_cached_setattr_get"] = _OBJ_SETATTR.__get__

    return script, globs, annotations


def _setattr(attr_name: str, value_var: str, has_on_setattr: bool) -> str:
    """
    Use the cached object.setattr to set *attr_name* to *value_var*.
    """
    return f"_setattr('{attr_name}', {value_var})"


def _setattr_with_converter(
    attr_name: str, value_var: str, has_on_setattr: bool, converter: Converter
) -> str:
    """
    Use the cached object.setattr to set *attr_name* to *value_var*, but run
    its converter first.
    """
    return f"_setattr('{attr_name}', {converter._fmt_converter_call(attr_name, value_var)})"


def _assign(attr_name: str, value: str, has_on_setattr: bool) -> str:
    """
    Unless *attr_name* has an on_setattr hook, use normal assignment. Otherwise
    relegate to _setattr.
    """
    if has_on_setattr:
        return _setattr(attr_name, value, True)

    return f"self.{attr_name} = {value}"


def _assign_with_converter(
    attr_name: str, value_var: str, has_on_setattr: bool, converter: Converter
) -> str:
    """
    Unless *attr_name* has an on_setattr hook, use normal assignment after
    conversion. Otherwise relegate to _setattr_with_converter.
    """
    if has_on_setattr:
        return _setattr_with_converter(attr_name, value_var, True, converter)

    return f"self.{attr_name} = {converter._fmt_converter_call(attr_name, value_var)}"


def _determine_setters(
    frozen: bool, slots: bool, base_attr_map: dict[str, type]
):
    """
    Determine the correct setter functions based on whether a class is frozen
    and/or slotted.
    """
    if frozen is True:
        if slots is True:
            return (), _setattr, _setattr_with_converter

        # Dict frozen classes assign directly to __dict__.
        # But only if the attribute doesn't come from an ancestor slot
        # class.
        # Note _inst_dict will be used again below if cache_hash is True

        def fmt_setter(
            attr_name: str, value_var: str, has_on_setattr: bool
        ) -> str:
            if _is_slot_attr(attr_name, base_attr_map):
                return _setattr(attr_name, value_var, has_on_setattr)

            return f"_inst_dict['{attr_name}'] = {value_var}"

        def fmt_setter_with_converter(
            attr_name: str,
            value_var: str,
            has_on_setattr: bool,
            converter: Converter,
        ) -> str:
            if has_on_setattr or _is_slot_attr(attr_name, base_attr_map):
                return _setattr_with_converter(
                    attr_name, value_var, has_on_setattr, converter
                )

            return f"_inst_dict['{attr_name}'] = {converter._fmt_converter_call(attr_name, value_var)}"

        return (
            ("_inst_dict = self.__dict__",),
            fmt_setter,
            fmt_setter_with_converter,
        )

    # Not frozen -- we can just assign directly.
    return (), _assign, _assign_with_converter


def _attrs_to_init_script(
    attrs: list[Attribute],
    is_frozen: bool,
    is_slotted: bool,
    call_pre_init: bool,
    pre_init_has_args: bool,
    call_post_init: bool,
    does_cache_hash: bool,
    base_attr_map: dict[str, type],
    is_exc: bool,
    needs_cached_setattr: bool,
    has_cls_on_setattr: bool,
    method_name: str,
) -> tuple[str, dict, dict]:
    """
    Return a script of an initializer for *attrs*, a dict of globals, and
    annotations for the initializer.

    The globals are required by the generated script.
    """
    lines = ["self.__attrs_pre_init__()"] if call_pre_init else []

    if needs_cached_setattr:
        lines.append(
            # Circumvent the __setattr__ descriptor to save one lookup per
            # assignment. Note _setattr will be used again below if
            # does_cache_hash is True.
            "_setattr = _cached_setattr_get(self)"
        )

    extra_lines, fmt_setter, fmt_setter_with_converter = _determine_setters(
        is_frozen, is_slotted, base_attr_map
    )
    lines.extend(extra_lines)

    args = []
    kw_only_args = []
    attrs_to_validate = []

    # This is a dictionary of names to validator and converter callables.
    # Injecting this into __init__ globals lets us avoid lookups.
    names_for_globals = {}
    annotations = {"return": None}

    for a in attrs:
        if a.validator:
            attrs_to_validate.append(a)

        attr_name = a.name
        has_on_setattr = a.on_setattr is not None or (
            a.on_setattr is not setters.NO_OP and has_cls_on_setattr
        )
        # a.alias is set to maybe-mangled attr_name in _ClassBuilder if not
        # explicitly provided
        arg_name = a.alias

        has_factory = isinstance(a.default, Factory)
        maybe_self = "self" if has_factory and a.default.takes_self else ""

        if a.converter is not None and not isinstance(a.converter, Converter):
            converter = Converter(a.converter)
        else:
            converter = a.converter

        if a.init is False:
            if has_factory:
                init_factory_name = _INIT_FACTORY_PAT % (a.name,)
                if converter is not None:
                    lines.append(
                        fmt_setter_with_converter(
                            attr_name,
                            init_factory_name + f"({maybe_self})",
                            has_on_setattr,
                            converter,
                        )
                    )
                    names_for_globals[converter._get_global_name(a.name)] = (
                        converter.converter
                    )
                else:
                    lines.append(
                        fmt_setter(
                            attr_name,
                            init_factory_name + f"({maybe_self})",
                            has_on_setattr,
                        )
                    )
                names_for_globals[init_factory_name] = a.default.factory
            elif converter is not None:
                lines.append(
                    fmt_setter_with_converter(
                        attr_name,
                        f"attr_dict['{attr_name}'].default",
                        has_on_setattr,
                        converter,
                    )
                )
                names_for_globals[converter._get_global_name(a.name)] = (
                    converter.converter
                )
            else:
                lines.append(
                    fmt_setter(
                        attr_name,
                        f"attr_dict['{attr_name}'].default",
                        has_on_setattr,
                    )
                )
        elif a.default is not NOTHING and not has_factory:
            arg = f"{arg_name}=attr_dict['{attr_name}'].default"
            if a.kw_only:
                kw_only_args.append(arg)
            else:
                args.append(arg)

            if converter is not None:
                lines.append(
                    fmt_setter_with_converter(
                        attr_name, arg_name, has_on_setattr, converter
                    )
                )
                names_for_globals[converter._get_global_name(a.name)] = (
                    converter.converter
                )
            else:
                lines.append(fmt_setter(attr_name, arg_name, has_on_setattr))

        elif has_factory:
            arg = f"{arg_name}=NOTHING"
            if a.kw_only:
                kw_only_args.append(arg)
            else:
                args.append(arg)
            lines.append(f"if {arg_name} is not NOTHING:")

            init_factory_name = _INIT_FACTORY_PAT % (a.name,)
            if converter is not None:
                lines.append(
                    "    "
                    + fmt_setter_with_converter(
                        attr_name, arg_name, has_on_setattr, converter
                    )
                )
                lines.append("else:")
                lines.append(
                    "    "
                    + fmt_setter_with_converter(
                        attr_name,
                        init_factory_name + "(" + maybe_self + ")",
                        has_on_setattr,
                        converter,
                    )
                )
                names_for_globals[converter._get_global_name(a.name)] = (
                    converter.converter
                )
            else:
                lines.append(
                    "    " + fmt_setter(attr_name, arg_name, has_on_setattr)
                )
                lines.append("else:")
                lines.append(
                    "    "
                    + fmt_setter(
                        attr_name,
                        init_factory_name + "(" + maybe_self + ")",
                        has_on_setattr,
                    )
                )
            names_for_globals[init_factory_name] = a.default.factory
        else:
            if a.kw_only:
                kw_only_args.append(arg_name)
            else:
                args.append(arg_name)

            if converter is not None:
                lines.append(
                    fmt_setter_with_converter(
                        attr_name, arg_name, has_on_setattr, converter
                    )
                )
                names_for_globals[converter._get_global_name(a.name)] = (
                    converter.converter
                )
            else:
                lines.append(fmt_setter(attr_name, arg_name, has_on_setattr))

        if a.init is True:
            if a.type is not None and converter is None:
                annotations[arg_name] = a.type
            elif converter is not None and converter._first_param_type:
                # Use the type from the converter if present.
                annotations[arg_name] = converter._first_param_type

    if attrs_to_validate:  # we can skip this if there are no validators.
        names_for_globals["_config"] = _config
        lines.append("if _config._run_validators is True:")
        for a in attrs_to_validate:
            val_name = "__attr_validator_" + a.name
            attr_name = "__attr_" + a.name
            lines.append(f"    {val_name}(self, {attr_name}, self.{a.name})")
            names_for_globals[val_name] = a.validator
            names_for_globals[attr_name] = a

    if call_post_init:
        lines.append("self.__attrs_post_init__()")

    # Because this is set only after __attrs_post_init__ is called, a crash
    # will result if post-init tries to access the hash code.  This seemed
    # preferable to setting this beforehand, in which case alteration to field
    # values during post-init combined with post-init accessing the hash code
    # would result in silent bugs.
    if does_cache_hash:
        if is_frozen:
            if is_slotted:
                init_hash_cache = f"_setattr('{_HASH_CACHE_FIELD}', None)"
            else:
                init_hash_cache = f"_inst_dict['{_HASH_CACHE_FIELD}'] = None"
        else:
            init_hash_cache = f"self.{_HASH_CACHE_FIELD} = None"
        lines.append(init_hash_cache)

    # For exceptions we rely on BaseException.__init__ for proper
    # initialization.
    if is_exc:
        vals = ",".join(f"self.{a.name}" for a in attrs if a.init)

        lines.append(f"BaseException.__init__(self, {vals})")

    args = ", ".join(args)
    pre_init_args = args
    if kw_only_args:
        # leading comma & kw_only args
        args += f"{', ' if args else ''}*, {', '.join(kw_only_args)}"
        pre_init_kw_only_args = ", ".join(
            [
                f"{kw_arg_name}={kw_arg_name}"
                # We need to remove the defaults from the kw_only_args.
                for kw_arg_name in (kwa.split("=")[0] for kwa in kw_only_args)
            ]
        )
        pre_init_args += ", " if pre_init_args else ""
        pre_init_args += pre_init_kw_only_args

    if call_pre_init and pre_init_has_args:
        # If pre init method has arguments, pass same arguments as `__init__`.
        lines[0] = f"self.__attrs_pre_init__({pre_init_args})"

    # Python <3.12 doesn't allow backslashes in f-strings.
    NL = "\n    "
    return (
        f"""def {method_name}(self, {args}):
    {NL.join(lines) if lines else "pass"}
""",
        names_for_globals,
        annotations,
    )


def _default_init_alias_for(name: str) -> str:
    """
    The default __init__ parameter name for a field.

    This performs private-name adjustment via leading-unscore stripping,
    and is the default value of Attribute.alias if not provided.
    """

    return name.lstrip("_")


class Attribute:
    """
    *Read-only* representation of an attribute.

    .. warning::

       You should never instantiate this class yourself.

    The class has *all* arguments of `attr.ib` (except for ``factory`` which is
    only syntactic sugar for ``default=Factory(...)`` plus the following:

    - ``name`` (`str`): The name of the attribute.
    - ``alias`` (`str`): The __init__ parameter name of the attribute, after
      any explicit overrides and default private-attribute-name handling.
    - ``inherited`` (`bool`): Whether or not that attribute has been inherited
      from a base class.
    - ``eq_key`` and ``order_key`` (`typing.Callable` or `None`): The
      callables that are used for comparing and ordering objects by this
      attribute, respectively. These are set by passing a callable to
      `attr.ib`'s ``eq``, ``order``, or ``cmp`` arguments. See also
      :ref:`comparison customization <custom-comparison>`.

    Instances of this class are frequently used for introspection purposes
    like:

    - `fields` returns a tuple of them.
    - Validators get them passed as the first argument.
    - The :ref:`field transformer <transform-fields>` hook receives a list of
      them.
    - The ``alias`` property exposes the __init__ parameter name of the field,
      with any overrides and default private-attribute handling applied.


    .. versionadded:: 20.1.0 *inherited*
    .. versionadded:: 20.1.0 *on_setattr*
    .. versionchanged:: 20.2.0 *inherited* is not taken into account for
        equality checks and hashing anymore.
    .. versionadded:: 21.1.0 *eq_key* and *order_key*
    .. versionadded:: 22.2.0 *alias*

    For the full version history of the fields, see `attr.ib`.
    """

    # These slots must NOT be reordered because we use them later for
    # instantiation.
    __slots__ = (  # noqa: RUF023
        "name",
        "default",
        "validator",
        "repr",
        "eq",
        "eq_key",
        "order",
        "order_key",
        "hash",
        "init",
        "metadata",
        "type",
        "converter",
        "kw_only",
        "inherited",
        "on_setattr",
        "alias",
    )

    def __init__(
        self,
        name,
        default,
        validator,
        repr,
        cmp,  # XXX: unused, remove along with other cmp code.
        hash,
        init,
        inherited,
        metadata=None,
        type=None,
        converter=None,
        kw_only=False,
        eq=None,
        eq_key=None,
        order=None,
        order_key=None,
        on_setattr=None,
        alias=None,
    ):
        eq, eq_key, order, order_key = _determine_attrib_eq_order(
            cmp, eq_key or eq, order_key or order, True
        )

        # Cache this descriptor here to speed things up later.
        bound_setattr = _OBJ_SETATTR.__get__(self)

        # Despite the big red warning, people *do* instantiate `Attribute`
        # themselves.
        bound_setattr("name", name)
        bound_setattr("default", default)
        bound_setattr("validator", validator)
        bound_setattr("repr", repr)
        bound_setattr("eq", eq)
        bound_setattr("eq_key", eq_key)
        bound_setattr("order", order)
        bound_setattr("order_key", order_key)
        bound_setattr("hash", hash)
        bound_setattr("init", init)
        bound_setattr("converter", converter)
        bound_setattr(
            "metadata",
            (
                types.MappingProxyType(dict(metadata))  # Shallow copy
                if metadata
                else _EMPTY_METADATA_SINGLETON
            ),
        )
        bound_setattr("type", type)
        bound_setattr("kw_only", kw_only)
        bound_setattr("inherited", inherited)
        bound_setattr("on_setattr", on_setattr)
        bound_setattr("alias", alias)

    def __setattr__(self, name, value):
        raise FrozenInstanceError

    @classmethod
    def from_counting_attr(cls, name: str, ca: _CountingAttr, type=None):
        # type holds the annotated value. deal with conflicts:
        if type is None:
            type = ca.type
        elif ca.type is not None:
            msg = f"Type annotation and type argument cannot both be present for '{name}'."
            raise ValueError(msg)
        return cls(
            name,
            ca._default,
            ca._validator,
            ca.repr,
            None,
            ca.hash,
            ca.init,
            False,
            ca.metadata,
            type,
            ca.converter,
            ca.kw_only,
            ca.eq,
            ca.eq_key,
            ca.order,
            ca.order_key,
            ca.on_setattr,
            ca.alias,
        )

    # Don't use attrs.evolve since fields(Attribute) doesn't work
    def evolve(self, **changes):
        """
        Copy *self* and apply *changes*.

        This works similarly to `attrs.evolve` but that function does not work
        with :class:`attrs.Attribute`.

        It is mainly meant to be used for `transform-fields`.

        .. versionadded:: 20.3.0
        """
        new = copy.copy(self)

        new._setattrs(changes.items())

        return new

    # Don't use _add_pickle since fields(Attribute) doesn't work
    def __getstate__(self):
        """
        Play nice with pickle.
        """
        return tuple(
            getattr(self, name) if name != "metadata" else dict(self.metadata)
            for name in self.__slots__
        )

    def __setstate__(self, state):
        """
        Play nice with pickle.
        """
        self._setattrs(zip(self.__slots__, state))

    def _setattrs(self, name_values_pairs):
        bound_setattr = _OBJ_SETATTR.__get__(self)
        for name, value in name_values_pairs:
            if name != "metadata":
                bound_setattr(name, value)
            else:
                bound_setattr(
                    name,
                    (
                        types.MappingProxyType(dict(value))
                        if value
                        else _EMPTY_METADATA_SINGLETON
                    ),
                )


_a = [
    Attribute(
        name=name,
        default=NOTHING,
        validator=None,
        repr=True,
        cmp=None,
        eq=True,
        order=False,
        hash=(name != "metadata"),
        init=True,
        inherited=False,
        alias=_default_init_alias_for(name),
    )
    for name in Attribute.__slots__
]

Attribute = _add_hash(
    _add_eq(
        _add_repr(Attribute, attrs=_a),
        attrs=[a for a in _a if a.name != "inherited"],
    ),
    attrs=[a for a in _a if a.hash and a.name != "inherited"],
)


class _CountingAttr:
    """
    Intermediate representation of attributes that uses a counter to preserve
    the order in which the attributes have been defined.

    *Internal* data structure of the attrs library.  Running into is most
    likely the result of a bug like a forgotten `@attr.s` decorator.
    """

    __slots__ = (
        "_default",
        "_validator",
        "alias",
        "converter",
        "counter",
        "eq",
        "eq_key",
        "hash",
        "init",
        "kw_only",
        "metadata",
        "on_setattr",
        "order",
        "order_key",
        "repr",
        "type",
    )
    __attrs_attrs__ = (
        *tuple(
            Attribute(
                name=name,
                alias=_default_init_alias_for(name),
                default=NOTHING,
                validator=None,
                repr=True,
                cmp=None,
                hash=True,
                init=True,
                kw_only=False,
                eq=True,
                eq_key=None,
                order=False,
                order_key=None,
                inherited=False,
                on_setattr=None,
            )
            for name in (
                "counter",
                "_default",
                "repr",
                "eq",
                "order",
                "hash",
                "init",
                "on_setattr",
                "alias",
            )
        ),
        Attribute(
            name="metadata",
            alias="metadata",
            default=None,
            validator=None,
            repr=True,
            cmp=None,
            hash=False,
            init=True,
            kw_only=False,
            eq=True,
            eq_key=None,
            order=False,
            order_key=None,
            inherited=False,
            on_setattr=None,
        ),
    )
    cls_counter = 0

    def __init__(
        self,
        default,
        validator,
        repr,
        cmp,
        hash,
        init,
        converter,
        metadata,
        type,
        kw_only,
        eq,
        eq_key,
        order,
        order_key,
        on_setattr,
        alias,
    ):
        _CountingAttr.cls_counter += 1
        self.counter = _CountingAttr.cls_counter
        self._default = default
        self._validator = validator
        self.converter = converter
        self.repr = repr
        self.eq = eq
        self.eq_key = eq_key
        self.order = order
        self.order_key = order_key
        self.hash = hash
        self.init = init
        self.metadata = metadata
        self.type = type
        self.kw_only = kw_only
        self.on_setattr = on_setattr
        self.alias = alias

    def validator(self, meth):
        """
        Decorator that adds *meth* to the list of validators.

        Returns *meth* unchanged.

        .. versionadded:: 17.1.0
        """
        if self._validator is None:
            self._validator = meth
        else:
            self._validator = and_(self._validator, meth)
        return meth

    def default(self, meth):
        """
        Decorator that allows to set the default for an attribute.

        Returns *meth* unchanged.

        Raises:
            DefaultAlreadySetError: If default has been set before.

        .. versionadded:: 17.1.0
        """
        if self._default is not NOTHING:
            raise DefaultAlreadySetError

        self._default = Factory(meth, takes_self=True)

        return meth


_CountingAttr = _add_eq(_add_repr(_CountingAttr))


class Factory:
    """
    Stores a factory callable.

    If passed as the default value to `attrs.field`, the factory is used to
    generate a new value.

    Args:
        factory (typing.Callable):
            A callable that takes either none or exactly one mandatory
            positional argument depending on *takes_self*.

        takes_self (bool):
            Pass the partially initialized instance that is being initialized
            as a positional argument.

    .. versionadded:: 17.1.0  *takes_self*
    """

    __slots__ = ("factory", "takes_self")

    def __init__(self, factory, takes_self=False):
        self.factory = factory
        self.takes_self = takes_self

    def __getstate__(self):
        """
        Play nice with pickle.
        """
        return tuple(getattr(self, name) for name in self.__slots__)

    def __setstate__(self, state):
        """
        Play nice with pickle.
        """
        for name, value in zip(self.__slots__, state):
            setattr(self, name, value)


_f = [
    Attribute(
        name=name,
        default=NOTHING,
        validator=None,
        repr=True,
        cmp=None,
        eq=True,
        order=False,
        hash=True,
        init=True,
        inherited=False,
    )
    for name in Factory.__slots__
]

Factory = _add_hash(_add_eq(_add_repr(Factory, attrs=_f), attrs=_f), attrs=_f)


class Converter:
    """
    Stores a converter callable.

    Allows for the wrapped converter to take additional arguments. The
    arguments are passed in the order they are documented.

    Args:
        converter (Callable): A callable that converts the passed value.

        takes_self (bool):
            Pass the partially initialized instance that is being initialized
            as a positional argument. (default: `False`)

        takes_field (bool):
            Pass the field definition (an :class:`Attribute`) into the
            converter as a positional argument. (default: `False`)

    .. versionadded:: 24.1.0
    """

    __slots__ = (
        "__call__",
        "_first_param_type",
        "_global_name",
        "converter",
        "takes_field",
        "takes_self",
    )

    def __init__(self, converter, *, takes_self=False, takes_field=False):
        self.converter = converter
        self.takes_self = takes_self
        self.takes_field = takes_field

        ex = _AnnotationExtractor(converter)
        self._first_param_type = ex.get_first_param_type()

        if not (self.takes_self or self.takes_field):
            self.__call__ = lambda value, _, __: self.converter(value)
        elif self.takes_self and not self.takes_field:
            self.__call__ = lambda value, instance, __: self.converter(
                value, instance
            )
        elif not self.takes_self and self.takes_field:
            self.__call__ = lambda value, __, field: self.converter(
                value, field
            )
        else:
            self.__call__ = lambda value, instance, field: self.converter(
                value, instance, field
            )

        rt = ex.get_return_type()
        if rt is not None:
            self.__call__.__annotations__["return"] = rt

    @staticmethod
    def _get_global_name(attr_name: str) -> str:
        """
        Return the name that a converter for an attribute name *attr_name*
        would have.
        """
        return f"__attr_converter_{attr_name}"

    def _fmt_converter_call(self, attr_name: str, value_var: str) -> str:
        """
        Return a string that calls the converter for an attribute name
        *attr_name* and the value in variable named *value_var* according to
        `self.takes_self` and `self.takes_field`.
        """
        if not (self.takes_self or self.takes_field):
            return f"{self._get_global_name(attr_name)}({value_var})"

        if self.takes_self and self.takes_field:
            return f"{self._get_global_name(attr_name)}({value_var}, self, attr_dict['{attr_name}'])"

        if self.takes_self:
            return f"{self._get_global_name(attr_name)}({value_var}, self)"

        return f"{self._get_global_name(attr_name)}({value_var}, attr_dict['{attr_name}'])"

    def __getstate__(self):
        """
        Return a dict containing only converter and takes_self -- the rest gets
        computed when loading.
        """
        return {
            "converter": self.converter,
            "takes_self": self.takes_self,
            "takes_field": self.takes_field,
        }

    def __setstate__(self, state):
        """
        Load instance from state.
        """
        self.__init__(**state)


_f = [
    Attribute(
        name=name,
        default=NOTHING,
        validator=None,
        repr=True,
        cmp=None,
        eq=True,
        order=False,
        hash=True,
        init=True,
        inherited=False,
    )
    for name in ("converter", "takes_self", "takes_field")
]

Converter = _add_hash(
    _add_eq(_add_repr(Converter, attrs=_f), attrs=_f), attrs=_f
)


def make_class(
    name, attrs, bases=(object,), class_body=None, **attributes_arguments
):
    r"""
    A quick way to create a new class called *name* with *attrs*.

    .. note::

        ``make_class()`` is a thin wrapper around `attr.s`, not `attrs.define`
        which means that it doesn't come with some of the improved defaults.

        For example, if you want the same ``on_setattr`` behavior as in
        `attrs.define`, you have to pass the hooks yourself: ``make_class(...,
        on_setattr=setters.pipe(setters.convert, setters.validate)``

    .. warning::

        It is *your* duty to ensure that the class name and the attribute names
        are valid identifiers. ``make_class()`` will *not* validate them for
        you.

    Args:
        name (str): The name for the new class.

        attrs (list | dict):
            A list of names or a dictionary of mappings of names to `attr.ib`\
            s / `attrs.field`\ s.

            The order is deduced from the order of the names or attributes
            inside *attrs*.  Otherwise the order of the definition of the
            attributes is used.

        bases (tuple[type, ...]): Classes that the new class will subclass.

        class_body (dict):
            An optional dictionary of class attributes for the new class.

        attributes_arguments: Passed unmodified to `attr.s`.

    Returns:
        type: A new class with *attrs*.

    .. versionadded:: 17.1.0 *bases*
    .. versionchanged:: 18.1.0 If *attrs* is ordered, the order is retained.
    .. versionchanged:: 23.2.0 *class_body*
    .. versionchanged:: 25.2.0 Class names can now be unicode.
    """
    # Class identifiers are converted into the normal form NFKC while parsing
    name = unicodedata.normalize("NFKC", name)

    if isinstance(attrs, dict):
        cls_dict = attrs
    elif isinstance(attrs, (list, tuple)):
        cls_dict = {a: attrib() for a in attrs}
    else:
        msg = "attrs argument must be a dict or a list."
        raise TypeError(msg)

    pre_init = cls_dict.pop("__attrs_pre_init__", None)
    post_init = cls_dict.pop("__attrs_post_init__", None)
    user_init = cls_dict.pop("__init__", None)

    body = {}
    if class_body is not None:
        body.update(class_body)
    if pre_init is not None:
        body["__attrs_pre_init__"] = pre_init
    if post_init is not None:
        body["__attrs_post_init__"] = post_init
    if user_init is not None:
        body["__init__"] = user_init

    type_ = types.new_class(name, bases, {}, lambda ns: ns.update(body))

    # For pickling to work, the __module__ variable needs to be set to the
    # frame where the class is created.  Bypass this step in environments where
    # sys._getframe is not defined (Jython for example) or sys._getframe is not
    # defined for arguments greater than 0 (IronPython).
    with contextlib.suppress(AttributeError, ValueError):
        type_.__module__ = sys._getframe(1).f_globals.get(
            "__name__", "__main__"
        )

    # We do it here for proper warnings with meaningful stacklevel.
    cmp = attributes_arguments.pop("cmp", None)
    (
        attributes_arguments["eq"],
        attributes_arguments["order"],
    ) = _determine_attrs_eq_order(
        cmp,
        attributes_arguments.get("eq"),
        attributes_arguments.get("order"),
        True,
    )

    cls = _attrs(these=cls_dict, **attributes_arguments)(type_)
    # Only add type annotations now or "_attrs()" will complain:
    cls.__annotations__ = {
        k: v.type for k, v in cls_dict.items() if v.type is not None
    }
    return cls


# These are required by within this module so we define them here and merely
# import into .validators / .converters.


@attrs(slots=True, unsafe_hash=True)
class _AndValidator:
    """
    Compose many validators to a single one.
    """

    _validators = attrib()

    def __call__(self, inst, attr, value):
        for v in self._validators:
            v(inst, attr, value)


def and_(*validators):
    """
    A validator that composes multiple validators into one.

    When called on a value, it runs all wrapped validators.

    Args:
        validators (~collections.abc.Iterable[typing.Callable]):
            Arbitrary number of validators.

    .. versionadded:: 17.1.0
    """
    vals = []
    for validator in validators:
        vals.extend(
            validator._validators
            if isinstance(validator, _AndValidator)
            else [validator]
        )

    return _AndValidator(tuple(vals))


def pipe(*converters):
    """
    A converter that composes multiple converters into one.

    When called on a value, it runs all wrapped converters, returning the
    *last* value.

    Type annotations will be inferred from the wrapped converters', if they
    have any.

        converters (~collections.abc.Iterable[typing.Callable]):
            Arbitrary number of converters.

    .. versionadded:: 20.1.0
    """

    return_instance = any(isinstance(c, Converter) for c in converters)

    if return_instance:

        def pipe_converter(val, inst, field):
            for c in converters:
                val = (
                    c(val, inst, field) if isinstance(c, Converter) else c(val)
                )

            return val

    else:

        def pipe_converter(val):
            for c in converters:
                val = c(val)

            return val

    if not converters:
        # If the converter list is empty, pipe_converter is the identity.
        A = TypeVar("A")
        pipe_converter.__annotations__.update({"val": A, "return": A})
    else:
        # Get parameter type from first converter.
        t = _AnnotationExtractor(converters[0]).get_first_param_type()
        if t:
            pipe_converter.__annotations__["val"] = t

        last = converters[-1]
        if not PY_3_11_PLUS and isinstance(last, Converter):
            last = last.__call__

        # Get return type from last converter.
        rt = _AnnotationExtractor(last).get_return_type()
        if rt:
            pipe_converter.__annotations__["return"] = rt

    if return_instance:
        return Converter(pipe_converter, takes_self=True, takes_field=True)
    return pipe_converter
