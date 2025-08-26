import sys
from collections import deque
from collections.abc import Mapping as AbcMapping
from collections.abc import MutableMapping as AbcMutableMapping
from collections.abc import MutableSet as AbcMutableSet
from collections.abc import Set as AbcSet
from dataclasses import MISSING, Field, is_dataclass
from dataclasses import fields as dataclass_fields
from functools import partial
from inspect import signature as _signature
from typing import AbstractSet as TypingAbstractSet
from typing import (
    Any,
    Deque,
    Dict,
    Final,
    FrozenSet,
    List,
    Literal,
    NewType,
    Optional,
    Protocol,
    Tuple,
    Type,
    Union,
    get_args,
    get_origin,
    get_type_hints,
)
from typing import Mapping as TypingMapping
from typing import MutableMapping as TypingMutableMapping
from typing import MutableSequence as TypingMutableSequence
from typing import MutableSet as TypingMutableSet
from typing import Sequence as TypingSequence
from typing import Set as TypingSet

from attrs import NOTHING, Attribute, Factory, resolve_types
from attrs import fields as attrs_fields
from attrs import fields_dict as attrs_fields_dict

__all__ = [
    "ANIES",
    "adapted_fields",
    "fields_dict",
    "ExceptionGroup",
    "ExtensionsTypedDict",
    "get_type_alias_base",
    "has",
    "is_type_alias",
    "is_typeddict",
    "TypeAlias",
    "TypedDict",
]

try:
    from typing_extensions import TypedDict as ExtensionsTypedDict
except ImportError:  # pragma: no cover
    ExtensionsTypedDict = None

if sys.version_info >= (3, 11):
    from builtins import ExceptionGroup
else:
    from exceptiongroup import ExceptionGroup

try:
    from typing_extensions import is_typeddict as _is_typeddict
except ImportError:  # pragma: no cover
    assert sys.version_info >= (3, 10)
    from typing import is_typeddict as _is_typeddict

try:
    from typing_extensions import TypeAlias
except ImportError:  # pragma: no cover
    assert sys.version_info >= (3, 11)
    from typing import TypeAlias

LITERALS = {Literal}
try:
    from typing_extensions import Literal as teLiteral

    LITERALS.add(teLiteral)
except ImportError:  # pragma: no cover
    pass

# On some Python versions, `typing_extensions.Any` is different than
# `typing.Any`.
try:
    from typing_extensions import Any as teAny

    ANIES = frozenset([Any, teAny])
except ImportError:  # pragma: no cover
    ANIES = frozenset([Any])

NoneType = type(None)


def is_optional(typ: Type) -> bool:
    return is_union_type(typ) and NoneType in typ.__args__ and len(typ.__args__) == 2


def is_typeddict(cls):
    """Thin wrapper around typing(_extensions).is_typeddict"""
    return _is_typeddict(getattr(cls, "__origin__", cls))


def is_type_alias(type: Any) -> bool:
    """Is this a PEP 695 type alias?"""
    return False


def get_type_alias_base(type: Any) -> Any:
    """
    What is this a type alias of?

    Works only on 3.12+.
    """
    return type.__value__


def has(cls):
    return hasattr(cls, "__attrs_attrs__") or hasattr(cls, "__dataclass_fields__")


def has_with_generic(cls):
    """Test whether the class if a normal or generic attrs or dataclass."""
    return has(cls) or has(get_origin(cls))


def fields(type):
    try:
        return type.__attrs_attrs__
    except AttributeError:
        return dataclass_fields(type)


def fields_dict(type) -> Dict[str, Union[Attribute, Field]]:
    """Return the fields_dict for attrs and dataclasses."""
    if is_dataclass(type):
        return {f.name: f for f in dataclass_fields(type)}
    return attrs_fields_dict(type)


def adapted_fields(cl) -> List[Attribute]:
    """Return the attrs format of `fields()` for attrs and dataclasses."""
    if is_dataclass(cl):
        attrs = dataclass_fields(cl)
        if any(isinstance(a.type, str) for a in attrs):
            # Do this conditionally in case `get_type_hints` fails, so
            # users can resolve on their own first.
            type_hints = get_type_hints(cl)
        else:
            type_hints = {}
        return [
            Attribute(
                attr.name,
                (
                    attr.default
                    if attr.default is not MISSING
                    else (
                        Factory(attr.default_factory)
                        if attr.default_factory is not MISSING
                        else NOTHING
                    )
                ),
                None,
                True,
                None,
                True,
                attr.init,
                True,
                type=type_hints.get(attr.name, attr.type),
                alias=attr.name,
            )
            for attr in attrs
        ]
    attribs = attrs_fields(cl)
    if any(isinstance(a.type, str) for a in attribs):
        # PEP 563 annotations - need to be resolved.
        resolve_types(cl)
        attribs = attrs_fields(cl)
    return attribs


def is_subclass(obj: type, bases) -> bool:
    """A safe version of issubclass (won't raise)."""
    try:
        return issubclass(obj, bases)
    except TypeError:
        return False


def is_hetero_tuple(type: Any) -> bool:
    origin = getattr(type, "__origin__", None)
    return origin is tuple and ... not in type.__args__


def is_protocol(type: Any) -> bool:
    return is_subclass(type, Protocol) and getattr(type, "_is_protocol", False)


def is_bare_final(type) -> bool:
    return type is Final


def get_final_base(type) -> Optional[type]:
    """Return the base of the Final annotation, if it is Final."""
    if type is Final:
        return Any
    if type.__class__ is _GenericAlias and type.__origin__ is Final:
        return type.__args__[0]
    return None


OriginAbstractSet = AbcSet
OriginMutableSet = AbcMutableSet

signature = _signature

if sys.version_info >= (3, 10):
    signature = partial(_signature, eval_str=True)

if sys.version_info >= (3, 9):
    from collections import Counter
    from collections.abc import MutableSequence as AbcMutableSequence
    from collections.abc import MutableSet as AbcMutableSet
    from collections.abc import Sequence as AbcSequence
    from collections.abc import Set as AbcSet
    from types import GenericAlias
    from typing import (
        Annotated,
        Generic,
        TypedDict,
        Union,
        _AnnotatedAlias,
        _GenericAlias,
        _SpecialGenericAlias,
        _UnionGenericAlias,
    )
    from typing import Counter as TypingCounter

    try:
        # Not present on 3.9.0, so we try carefully.
        from typing import _LiteralGenericAlias

        def is_literal(type) -> bool:
            return type in LITERALS or (
                isinstance(
                    type, (_GenericAlias, _LiteralGenericAlias, _SpecialGenericAlias)
                )
                and type.__origin__ in LITERALS
            )

    except ImportError:  # pragma: no cover

        def is_literal(_) -> bool:
            return False

    Set = AbcSet
    AbstractSet = AbcSet
    MutableSet = AbcMutableSet
    Sequence = AbcSequence
    MutableSequence = AbcMutableSequence
    MutableMapping = AbcMutableMapping
    Mapping = AbcMapping
    FrozenSetSubscriptable = frozenset
    TupleSubscriptable = tuple

    def is_annotated(type) -> bool:
        return getattr(type, "__class__", None) is _AnnotatedAlias

    def is_tuple(type):
        return (
            type in (Tuple, tuple)
            or (type.__class__ is _GenericAlias and is_subclass(type.__origin__, Tuple))
            or (getattr(type, "__origin__", None) is tuple)
        )

    if sys.version_info >= (3, 12):
        from typing import TypeAliasType

        def is_type_alias(type: Any) -> bool:
            """Is this a PEP 695 type alias?"""
            return isinstance(type, TypeAliasType)

    if sys.version_info >= (3, 10):

        def is_union_type(obj):
            from types import UnionType

            return (
                obj is Union
                or (isinstance(obj, _UnionGenericAlias) and obj.__origin__ is Union)
                or isinstance(obj, UnionType)
            )

        def get_newtype_base(typ: Any) -> Optional[type]:
            if typ is NewType or isinstance(typ, NewType):
                return typ.__supertype__
            return None

        if sys.version_info >= (3, 11):
            from typing import NotRequired, Required
        else:
            from typing_extensions import NotRequired, Required

    else:
        from typing_extensions import NotRequired, Required

        def is_union_type(obj):
            return (
                obj is Union
                or isinstance(obj, _UnionGenericAlias)
                and obj.__origin__ is Union
            )

        def get_newtype_base(typ: Any) -> Optional[type]:
            supertype = getattr(typ, "__supertype__", None)
            if (
                supertype is not None
                and getattr(typ, "__qualname__", "") == "NewType.<locals>.new_type"
                and typ.__module__ in ("typing", "typing_extensions")
            ):
                return supertype
            return None

    def get_notrequired_base(type) -> "Union[Any, Literal[NOTHING]]":
        if is_annotated(type):
            # Handle `Annotated[NotRequired[int]]`
            type = get_args(type)[0]
        if get_origin(type) in (NotRequired, Required):
            return get_args(type)[0]
        return NOTHING

    def is_sequence(type: Any) -> bool:
        """A predicate function for sequences.

        Matches lists, sequences, mutable sequences, deques and homogenous
        tuples.
        """
        origin = getattr(type, "__origin__", None)
        return (
            type
            in (
                List,
                list,
                TypingSequence,
                TypingMutableSequence,
                AbcMutableSequence,
                tuple,
                Tuple,
                deque,
                Deque,
            )
            or (
                type.__class__ is _GenericAlias
                and (
                    (origin is not tuple)
                    and is_subclass(origin, TypingSequence)
                    or origin is tuple
                    and type.__args__[1] is ...
                )
            )
            or (origin in (list, deque, AbcMutableSequence, AbcSequence))
            or (origin is tuple and type.__args__[1] is ...)
        )

    def is_deque(type):
        return (
            type in (deque, Deque)
            or (type.__class__ is _GenericAlias and is_subclass(type.__origin__, deque))
            or (getattr(type, "__origin__", None) is deque)
        )

    def is_mutable_set(type: Any) -> bool:
        """A predicate function for (mutable) sets.

        Matches built-in sets and sets from the typing module.
        """
        return (
            type in (TypingSet, TypingMutableSet, set)
            or (
                type.__class__ is _GenericAlias
                and is_subclass(type.__origin__, TypingMutableSet)
            )
            or (getattr(type, "__origin__", None) in (set, AbcMutableSet, AbcSet))
        )

    def is_frozenset(type: Any) -> bool:
        """A predicate function for frozensets.

        Matches built-in frozensets and frozensets from the typing module.
        """
        return (
            type in (FrozenSet, frozenset)
            or (
                type.__class__ is _GenericAlias
                and is_subclass(type.__origin__, FrozenSet)
            )
            or (getattr(type, "__origin__", None) is frozenset)
        )

    def is_bare(type):
        return isinstance(type, _SpecialGenericAlias) or (
            not hasattr(type, "__origin__") and not hasattr(type, "__args__")
        )

    def is_mapping(type: Any) -> bool:
        """A predicate function for mappings."""
        return (
            type in (dict, Dict, TypingMapping, TypingMutableMapping, AbcMutableMapping)
            or (
                type.__class__ is _GenericAlias
                and is_subclass(type.__origin__, TypingMapping)
            )
            or is_subclass(
                getattr(type, "__origin__", type), (dict, AbcMutableMapping, AbcMapping)
            )
        )

    def is_counter(type):
        return (
            type in (Counter, TypingCounter)
            or getattr(type, "__origin__", None) is Counter
        )

    def is_generic(type) -> bool:
        """Whether `type` is a generic type."""
        # Inheriting from protocol will inject `Generic` into the MRO
        # without `__orig_bases__`.
        return isinstance(type, (_GenericAlias, GenericAlias)) or (
            is_subclass(type, Generic) and hasattr(type, "__orig_bases__")
        )

    def copy_with(type, args):
        """Replace a generic type's arguments."""
        if is_annotated(type):
            # typing.Annotated requires a special case.
            return Annotated[args]
        if isinstance(args, tuple) and len(args) == 1:
            # Some annotations can't handle 1-tuples.
            args = args[0]
        return type.__origin__[args]

    def get_full_type_hints(obj, globalns=None, localns=None):
        return get_type_hints(obj, globalns, localns, include_extras=True)

else:
    # 3.8
    Set = TypingSet
    AbstractSet = TypingAbstractSet
    MutableSet = TypingMutableSet

    Sequence = TypingSequence
    MutableSequence = TypingMutableSequence
    MutableMapping = TypingMutableMapping
    Mapping = TypingMapping
    FrozenSetSubscriptable = FrozenSet
    TupleSubscriptable = Tuple

    from collections import Counter as ColCounter
    from typing import Counter, Generic, TypedDict, Union, _GenericAlias

    from typing_extensions import Annotated, NotRequired, Required
    from typing_extensions import get_origin as te_get_origin

    def is_annotated(type) -> bool:
        return te_get_origin(type) is Annotated

    def is_tuple(type):
        return type in (Tuple, tuple) or (
            type.__class__ is _GenericAlias and is_subclass(type.__origin__, Tuple)
        )

    def is_union_type(obj):
        return (
            obj is Union or isinstance(obj, _GenericAlias) and obj.__origin__ is Union
        )

    def get_newtype_base(typ: Any) -> Optional[type]:
        supertype = getattr(typ, "__supertype__", None)
        if (
            supertype is not None
            and getattr(typ, "__qualname__", "") == "NewType.<locals>.new_type"
            and typ.__module__ in ("typing", "typing_extensions")
        ):
            return supertype
        return None

    def is_sequence(type: Any) -> bool:
        return type in (List, list, Tuple, tuple) or (
            type.__class__ is _GenericAlias
            and (
                type.__origin__ not in (Union, Tuple, tuple)
                and is_subclass(type.__origin__, TypingSequence)
            )
            or (type.__origin__ in (Tuple, tuple) and type.__args__[1] is ...)
        )

    def is_deque(type: Any) -> bool:
        return (
            type in (deque, Deque)
            or (type.__class__ is _GenericAlias and is_subclass(type.__origin__, deque))
            or type.__origin__ is deque
        )

    def is_mutable_set(type) -> bool:
        return type in (set, TypingAbstractSet) or (
            type.__class__ is _GenericAlias
            and is_subclass(type.__origin__, (MutableSet, TypingAbstractSet))
        )

    def is_frozenset(type):
        return type is frozenset or (
            type.__class__ is _GenericAlias and is_subclass(type.__origin__, FrozenSet)
        )

    def is_mapping(type: Any) -> bool:
        """A predicate function for mappings."""
        return (
            type in (TypingMapping, dict)
            or (
                type.__class__ is _GenericAlias
                and is_subclass(type.__origin__, TypingMapping)
            )
            or is_subclass(
                getattr(type, "__origin__", type), (dict, AbcMutableMapping, AbcMapping)
            )
        )

    bare_generic_args = {
        List.__args__,
        TypingSequence.__args__,
        TypingMapping.__args__,
        Dict.__args__,
        TypingMutableSequence.__args__,
        Tuple.__args__,
        None,  # non-parametrized containers do not have `__args__ attribute in py3.7-8
    }

    def is_bare(type):
        return getattr(type, "__args__", None) in bare_generic_args

    def is_counter(type):
        return (
            type in (Counter, ColCounter)
            or getattr(type, "__origin__", None) is ColCounter
        )

    def is_literal(type) -> bool:
        return type in LITERALS or (
            isinstance(type, _GenericAlias) and type.__origin__ in LITERALS
        )

    def is_generic(obj):
        return isinstance(obj, _GenericAlias) or (
            is_subclass(obj, Generic) and hasattr(obj, "__orig_bases__")
        )

    def copy_with(type, args):
        """Replace a generic type's arguments."""
        return type.copy_with(args)

    def get_notrequired_base(type) -> "Union[Any, Literal[NOTHING]]":
        if is_annotated(type):
            # Handle `Annotated[NotRequired[int]]`
            type = get_origin(type)

        if get_origin(type) in (NotRequired, Required):
            return get_args(type)[0]
        return NOTHING

    def get_full_type_hints(obj, globalns=None, localns=None):
        return get_type_hints(obj, globalns, localns)


def is_generic_attrs(type) -> bool:
    """Return True for both specialized (A[int]) and unspecialized (A) generics."""
    return is_generic(type) and has(type.__origin__)
