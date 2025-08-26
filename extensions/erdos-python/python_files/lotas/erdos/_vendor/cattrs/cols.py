"""Utility functions for collections."""

from __future__ import annotations

from sys import version_info
from typing import (
    TYPE_CHECKING,
    Any,
    Iterable,
    Literal,
    NamedTuple,
    Tuple,
    TypeVar,
    get_type_hints,
)

from attrs import NOTHING, Attribute

from ._compat import ANIES, is_bare, is_frozenset, is_mapping, is_sequence, is_subclass
from ._compat import is_mutable_set as is_set
from .dispatch import StructureHook, UnstructureHook
from .errors import IterableValidationError, IterableValidationNote
from .fns import identity
from .gen import (
    AttributeOverride,
    already_generating,
    make_dict_structure_fn_from_attrs,
    make_dict_unstructure_fn_from_attrs,
    make_hetero_tuple_unstructure_fn,
    mapping_structure_factory,
)
from .gen import make_iterable_unstructure_fn as iterable_unstructure_factory

if TYPE_CHECKING:
    from .converters import BaseConverter

__all__ = [
    "is_any_set",
    "is_frozenset",
    "is_namedtuple",
    "is_mapping",
    "is_set",
    "is_sequence",
    "iterable_unstructure_factory",
    "list_structure_factory",
    "namedtuple_structure_factory",
    "namedtuple_unstructure_factory",
    "namedtuple_dict_structure_factory",
    "namedtuple_dict_unstructure_factory",
    "mapping_structure_factory",
]


def is_any_set(type) -> bool:
    """A predicate function for both mutable and frozensets."""
    return is_set(type) or is_frozenset(type)


if version_info[:2] >= (3, 9):

    def is_namedtuple(type: Any) -> bool:
        """A predicate function for named tuples."""

        if is_subclass(type, tuple):
            for cl in type.mro():
                orig_bases = cl.__dict__.get("__orig_bases__", ())
                if NamedTuple in orig_bases:
                    return True
        return False

else:

    def is_namedtuple(type: Any) -> bool:
        """A predicate function for named tuples."""
        # This is tricky. It may not be possible for this function to be 100%
        # accurate, since it doesn't seem like we can distinguish between tuple
        # subclasses and named tuples reliably.

        if is_subclass(type, tuple):
            for cl in type.mro():
                if cl is tuple:
                    # No point going further.
                    break
                if "_fields" in cl.__dict__:
                    return True
        return False


def _is_passthrough(type: type[tuple], converter: BaseConverter) -> bool:
    """If all fields would be passed through, this class should not be processed
    either.
    """
    return all(
        converter.get_unstructure_hook(t) == identity
        for t in type.__annotations__.values()
    )


T = TypeVar("T")


def list_structure_factory(type: type, converter: BaseConverter) -> StructureHook:
    """A hook factory for structuring lists.

    Converts any given iterable into a list.
    """

    if is_bare(type) or type.__args__[0] in ANIES:

        def structure_list(obj: Iterable[T], _: type = type) -> list[T]:
            return list(obj)

        return structure_list

    elem_type = type.__args__[0]

    try:
        handler = converter.get_structure_hook(elem_type)
    except RecursionError:
        # Break the cycle by using late binding.
        handler = converter.structure

    if converter.detailed_validation:

        def structure_list(
            obj: Iterable[T], _: type = type, _handler=handler, _elem_type=elem_type
        ) -> list[T]:
            errors = []
            res = []
            ix = 0  # Avoid `enumerate` for performance.
            for e in obj:
                try:
                    res.append(handler(e, _elem_type))
                except Exception as e:
                    msg = IterableValidationNote(
                        f"Structuring {type} @ index {ix}", ix, elem_type
                    )
                    e.__notes__ = [*getattr(e, "__notes__", []), msg]
                    errors.append(e)
                finally:
                    ix += 1
            if errors:
                raise IterableValidationError(
                    f"While structuring {type!r}", errors, type
                )

            return res

    else:

        def structure_list(
            obj: Iterable[T], _: type = type, _handler=handler, _elem_type=elem_type
        ) -> list[T]:
            return [_handler(e, _elem_type) for e in obj]

    return structure_list


def namedtuple_unstructure_factory(
    cl: type[tuple], converter: BaseConverter, unstructure_to: Any = None
) -> UnstructureHook:
    """A hook factory for unstructuring namedtuples.

    :param unstructure_to: Force unstructuring to this type, if provided.
    """

    if unstructure_to is None and _is_passthrough(cl, converter):
        return identity

    return make_hetero_tuple_unstructure_fn(
        cl,
        converter,
        unstructure_to=tuple if unstructure_to is None else unstructure_to,
        type_args=tuple(cl.__annotations__.values()),
    )


def namedtuple_structure_factory(
    cl: type[tuple], converter: BaseConverter
) -> StructureHook:
    """A hook factory for structuring namedtuples from iterables."""
    # We delegate to the existing infrastructure for heterogenous tuples.
    hetero_tuple_type = Tuple[tuple(cl.__annotations__.values())]
    base_hook = converter.get_structure_hook(hetero_tuple_type)
    return lambda v, _: cl(*base_hook(v, hetero_tuple_type))


def _namedtuple_to_attrs(cl: type[tuple]) -> list[Attribute]:
    """Generate pseudo attributes for a namedtuple."""
    return [
        Attribute(
            name,
            cl._field_defaults.get(name, NOTHING),
            None,
            False,
            False,
            False,
            True,
            False,
            type=a,
            alias=name,
        )
        for name, a in get_type_hints(cl).items()
    ]


def namedtuple_dict_structure_factory(
    cl: type[tuple],
    converter: BaseConverter,
    detailed_validation: bool | Literal["from_converter"] = "from_converter",
    forbid_extra_keys: bool = False,
    use_linecache: bool = True,
    /,
    **kwargs: AttributeOverride,
) -> StructureHook:
    """A hook factory for hooks structuring namedtuples from dictionaries.

    :param forbid_extra_keys: Whether the hook should raise a `ForbiddenExtraKeysError`
        if unknown keys are encountered.
    :param use_linecache: Whether to store the source code in the Python linecache.

    .. versionadded:: 24.1.0
    """
    try:
        working_set = already_generating.working_set
    except AttributeError:
        working_set = set()
        already_generating.working_set = working_set
    else:
        if cl in working_set:
            raise RecursionError()

    working_set.add(cl)

    try:
        return make_dict_structure_fn_from_attrs(
            _namedtuple_to_attrs(cl),
            cl,
            converter,
            _cattrs_forbid_extra_keys=forbid_extra_keys,
            _cattrs_use_detailed_validation=detailed_validation,
            _cattrs_use_linecache=use_linecache,
            **kwargs,
        )
    finally:
        working_set.remove(cl)
        if not working_set:
            del already_generating.working_set


def namedtuple_dict_unstructure_factory(
    cl: type[tuple],
    converter: BaseConverter,
    omit_if_default: bool = False,
    use_linecache: bool = True,
    /,
    **kwargs: AttributeOverride,
) -> UnstructureHook:
    """A hook factory for hooks unstructuring namedtuples to dictionaries.

    :param omit_if_default: When true, attributes equal to their default values
        will be omitted in the result dictionary.
    :param use_linecache: Whether to store the source code in the Python linecache.

    .. versionadded:: 24.1.0
    """
    try:
        working_set = already_generating.working_set
    except AttributeError:
        working_set = set()
        already_generating.working_set = working_set
    if cl in working_set:
        raise RecursionError()

    working_set.add(cl)

    try:
        return make_dict_unstructure_fn_from_attrs(
            _namedtuple_to_attrs(cl),
            cl,
            converter,
            _cattrs_omit_if_default=omit_if_default,
            _cattrs_use_linecache=use_linecache,
            **kwargs,
        )
    finally:
        working_set.remove(cl)
        if not working_set:
            del already_generating.working_set
