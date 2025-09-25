from collections import defaultdict
from typing import Any, Callable, Dict, Literal, Type, Union

from erdos._vendor.attrs import NOTHING

from erdos._vendor.cattrs import BaseConverter
from erdos._vendor.cattrs._compat import get_newtype_base, is_literal, is_subclass, is_union_type

__all__ = [
    "default_tag_generator",
    "configure_tagged_union",
    "configure_union_passthrough",
]


def default_tag_generator(typ: Type) -> str:
    """Return the class name."""
    return typ.__name__


def configure_tagged_union(
    union: Any,
    converter: BaseConverter,
    tag_generator: Callable[[Type], str] = default_tag_generator,
    tag_name: str = "_type",
    default: Union[Type, Literal[NOTHING]] = NOTHING,
) -> None:
    """
    Configure the converter so that `union` (which should be a union) is
    un/structured with the help of an additional piece of data in the
    unstructured payload, the tag.

    :param converter: The converter to apply the strategy to.
    :param tag_generator: A `tag_generator` function is used to map each
        member of the union to a tag, which is then included in the
        unstructured payload. The default tag generator returns the name of
        the class.
    :param tag_name: The key under which the tag will be set in the
        unstructured payload. By default, `'_type'`.
    :param default: An optional class to be used if the tag information
        is not present when structuring.

    The tagged union strategy currently only works with the dict
    un/structuring base strategy.

    .. versionadded:: 23.1.0
    """
    args = union.__args__
    tag_to_hook = {}
    exact_cl_unstruct_hooks = {}
    for cl in args:
        tag = tag_generator(cl)
        struct_handler = converter.get_structure_hook(cl)
        unstruct_handler = converter.get_unstructure_hook(cl)

        def structure_union_member(val: dict, _cl=cl, _h=struct_handler) -> cl:
            return _h(val, _cl)

        def unstructure_union_member(val: union, _h=unstruct_handler) -> dict:
            return _h(val)

        tag_to_hook[tag] = structure_union_member
        exact_cl_unstruct_hooks[cl] = unstructure_union_member

    cl_to_tag = {cl: tag_generator(cl) for cl in args}

    if default is not NOTHING:
        default_handler = converter.get_structure_hook(default)

        def structure_default(val: dict, _cl=default, _h=default_handler):
            return _h(val, _cl)

        tag_to_hook = defaultdict(lambda: structure_default, tag_to_hook)
        cl_to_tag = defaultdict(lambda: default, cl_to_tag)

    def unstructure_tagged_union(
        val: union,
        _exact_cl_unstruct_hooks=exact_cl_unstruct_hooks,
        _cl_to_tag=cl_to_tag,
        _tag_name=tag_name,
    ) -> Dict:
        res = _exact_cl_unstruct_hooks[val.__class__](val)
        res[_tag_name] = _cl_to_tag[val.__class__]
        return res

    if default is NOTHING:
        if getattr(converter, "forbid_extra_keys", False):

            def structure_tagged_union(
                val: dict, _, _tag_to_cl=tag_to_hook, _tag_name=tag_name
            ) -> union:
                val = val.copy()
                return _tag_to_cl[val.pop(_tag_name)](val)

        else:

            def structure_tagged_union(
                val: dict, _, _tag_to_cl=tag_to_hook, _tag_name=tag_name
            ) -> union:
                return _tag_to_cl[val[_tag_name]](val)

    else:
        if getattr(converter, "forbid_extra_keys", False):

            def structure_tagged_union(
                val: dict,
                _,
                _tag_to_hook=tag_to_hook,
                _tag_name=tag_name,
                _dh=default_handler,
                _default=default,
            ) -> union:
                if _tag_name in val:
                    val = val.copy()
                    return _tag_to_hook[val.pop(_tag_name)](val)
                return _dh(val, _default)

        else:

            def structure_tagged_union(
                val: dict,
                _,
                _tag_to_hook=tag_to_hook,
                _tag_name=tag_name,
                _dh=default_handler,
                _default=default,
            ) -> union:
                if _tag_name in val:
                    return _tag_to_hook[val[_tag_name]](val)
                return _dh(val, _default)

    converter.register_unstructure_hook(union, unstructure_tagged_union)
    converter.register_structure_hook(union, structure_tagged_union)


def configure_union_passthrough(union: Any, converter: BaseConverter) -> None:
    """
    Configure the converter to support validating and passing through unions of the
    provided types and their subsets.

    For example, all mature JSON libraries natively support producing unions of ints,
    floats, Nones, and strings. Using this strategy, a converter can be configured
    to efficiently validate and pass through unions containing these types.

    The most important point is that another library (in this example the JSON
    library) handles producing the union, and the converter is configured to just
    validate it.

    Literals of provided types are also supported, and are checked by value.

    NewTypes of provided types are also supported.

    The strategy is designed to be O(1) in execution time, and independent of the
    ordering of types in the union.

    If the union contains a class and one or more of its subclasses, the subclasses
    will also be included when validating the superclass.

    .. versionadded:: 23.2.0
    """
    args = set(union.__args__)

    def make_structure_native_union(exact_type: Any) -> Callable:
        # `exact_type` is likely to be a subset of the entire configured union (`args`).
        literal_values = {
            v for t in exact_type.__args__ if is_literal(t) for v in t.__args__
        }

        # We have no idea what the actual type of `val` will be, so we can't
        # use it blindly with an `in` check since it might not be hashable.
        # So we do an additional check when handling literals.
        # Note: do no use `literal_values` here, since {0, False} gets reduced to {0}
        literal_classes = {
            v.__class__
            for t in exact_type.__args__
            if is_literal(t)
            for v in t.__args__
        }

        non_literal_classes = {
            get_newtype_base(t) or t
            for t in exact_type.__args__
            if not is_literal(t) and ((get_newtype_base(t) or t) in args)
        }

        # We augment the set of allowed classes with any configured subclasses of
        # the exact subclasses.
        non_literal_classes |= {
            a for a in args if any(is_subclass(a, c) for c in non_literal_classes)
        }

        # We check for spillover - union types not handled by the strategy.
        # If spillover exists and we fail to validate our types, we call
        # further into the converter with the rest.
        spillover = {
            a
            for a in exact_type.__args__
            if (get_newtype_base(a) or a) not in non_literal_classes
            and not is_literal(a)
        }

        if spillover:
            spillover_type = (
                Union[tuple(spillover)] if len(spillover) > 1 else next(iter(spillover))
            )

            def structure_native_union(
                val: Any,
                _: Any,
                classes=non_literal_classes,
                vals=literal_values,
                converter=converter,
                spillover=spillover_type,
            ) -> exact_type:
                if val.__class__ in literal_classes and val in vals:
                    return val
                if val.__class__ in classes:
                    return val
                return converter.structure(val, spillover)

        else:

            def structure_native_union(
                val: Any, _: Any, classes=non_literal_classes, vals=literal_values
            ) -> exact_type:
                if val.__class__ in literal_classes and val in vals:
                    return val
                if val.__class__ in classes:
                    return val
                raise TypeError(f"{val} ({val.__class__}) not part of {_}")

        return structure_native_union

    def contains_native_union(exact_type: Any) -> bool:
        """Can we handle this type?"""
        if is_union_type(exact_type):
            type_args = set(exact_type.__args__)
            # We special case optionals, since they are very common
            # and are handled a little more efficiently by default.
            if len(type_args) == 2 and type(None) in type_args:
                return False

            literal_classes = {
                lit_arg.__class__
                for t in type_args
                if is_literal(t)
                for lit_arg in t.__args__
            }
            non_literal_types = {
                get_newtype_base(t) or t for t in type_args if not is_literal(t)
            }

            return (literal_classes | non_literal_types) & args
        return False

    converter.register_structure_hook_factory(
        contains_native_union, make_structure_native_union
    )
