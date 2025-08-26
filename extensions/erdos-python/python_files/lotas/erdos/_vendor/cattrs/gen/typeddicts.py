from __future__ import annotations

import re
import sys
from typing import TYPE_CHECKING, Any, Callable, Literal, TypeVar

from attrs import NOTHING, Attribute

try:
    from inspect import get_annotations

    def get_annots(cl) -> dict[str, Any]:
        return get_annotations(cl, eval_str=True)

except ImportError:
    # https://docs.python.org/3/howto/annotations.html#accessing-the-annotations-dict-of-an-object-in-python-3-9-and-older
    def get_annots(cl) -> dict[str, Any]:
        if isinstance(cl, type):
            ann = cl.__dict__.get("__annotations__", {})
        else:
            ann = getattr(cl, "__annotations__", {})
        return ann


try:
    from typing_extensions import _TypedDictMeta
except ImportError:
    _TypedDictMeta = None

from .._compat import (
    TypedDict,
    get_full_type_hints,
    get_notrequired_base,
    get_origin,
    is_annotated,
    is_bare,
    is_generic,
)
from .._generics import deep_copy_with
from ..errors import (
    AttributeValidationNote,
    ClassValidationError,
    ForbiddenExtraKeysError,
    StructureHandlerNotFoundError,
)
from ..fns import identity
from . import AttributeOverride
from ._consts import already_generating, neutral
from ._generics import generate_mapping
from ._lc import generate_unique_filename
from ._shared import find_structure_handler

if TYPE_CHECKING:
    from ..converters import BaseConverter

__all__ = ["make_dict_unstructure_fn", "make_dict_structure_fn"]

T = TypeVar("T", bound=TypedDict)


def make_dict_unstructure_fn(
    cl: type[T],
    converter: BaseConverter,
    _cattrs_use_linecache: bool = True,
    **kwargs: AttributeOverride,
) -> Callable[[T], dict[str, Any]]:
    """
    Generate a specialized dict unstructuring function for a TypedDict.

    :param cl: A `TypedDict` class.
    :param converter: A Converter instance to use for unstructuring nested fields.
    :param kwargs: A mapping of field names to an `AttributeOverride`, for
        customization.
    :param _cattrs_detailed_validation: Whether to store the generated code in the
        _linecache_, for easier debugging and better stack traces.
    """
    origin = get_origin(cl)
    attrs = _adapted_fields(origin or cl)  # type: ignore
    req_keys = _required_keys(origin or cl)

    mapping = {}
    if is_generic(cl):
        mapping = generate_mapping(cl, mapping)

        for base in getattr(origin, "__orig_bases__", ()):
            if is_generic(base) and not str(base).startswith("typing.Generic"):
                mapping = generate_mapping(base, mapping)
                break

        # It's possible for origin to be None if this is a subclass
        # of a generic class.
        if origin is not None:
            cl = origin

    cl_name = cl.__name__
    fn_name = "unstructure_typeddict_" + cl_name
    globs = {}
    lines = []
    internal_arg_parts = {}

    # We keep track of what we're generating to help with recursive
    # class graphs.
    try:
        working_set = already_generating.working_set
    except AttributeError:
        working_set = set()
        already_generating.working_set = working_set
    if cl in working_set:
        raise RecursionError()
    working_set.add(cl)

    try:
        # We want to short-circuit in certain cases and return the identity
        # function.
        # We short-circuit if all of these are true:
        # * no attributes have been overridden
        # * all attributes resolve to `converter._unstructure_identity`
        for a in attrs:
            attr_name = a.name
            override = kwargs.get(attr_name, neutral)
            if override != neutral:
                break
            handler = None
            t = a.type

            if isinstance(t, TypeVar):
                if t.__name__ in mapping:
                    t = mapping[t.__name__]
                else:
                    # Unbound typevars use late binding.
                    handler = converter.unstructure
            elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, mapping)

            if handler is None:
                nrb = get_notrequired_base(t)
                if nrb is not NOTHING:
                    t = nrb
                try:
                    handler = converter.get_unstructure_hook(t)
                except RecursionError:
                    # There's a circular reference somewhere down the line
                    handler = converter.unstructure
            is_identity = handler == identity
            if not is_identity:
                break
        else:
            # We've not broken the loop.
            return identity

        for ix, a in enumerate(attrs):
            attr_name = a.name
            override = kwargs.get(attr_name, neutral)
            if override.omit:
                lines.append(f"  res.pop('{attr_name}', None)")
                continue
            if override.rename is not None:
                # We also need to pop when renaming, since we're copying
                # the original.
                lines.append(f"  res.pop('{attr_name}', None)")
            kn = attr_name if override.rename is None else override.rename
            attr_required = attr_name in req_keys

            # For each attribute, we try resolving the type here and now.
            # If a type is manually overwritten, this function should be
            # regenerated.
            handler = None
            if override.unstruct_hook is not None:
                handler = override.unstruct_hook
            else:
                t = a.type

                if isinstance(t, TypeVar):
                    if t.__name__ in mapping:
                        t = mapping[t.__name__]
                    else:
                        handler = converter.unstructure
                elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                    t = deep_copy_with(t, mapping)

                if handler is None:
                    nrb = get_notrequired_base(t)
                    if nrb is not NOTHING:
                        t = nrb
                    try:
                        handler = converter.get_unstructure_hook(t)
                    except RecursionError:
                        # There's a circular reference somewhere down the line
                        handler = converter.unstructure

            is_identity = handler == identity

            if not is_identity:
                unstruct_handler_name = f"__c_unstr_{ix}"
                globs[unstruct_handler_name] = handler
                internal_arg_parts[unstruct_handler_name] = handler
                invoke = f"{unstruct_handler_name}(instance['{attr_name}'])"
            elif override.rename is None:
                # We're not doing anything to this attribute, so
                # it'll already be present in the input dict.
                continue
            else:
                # Probably renamed, we just fetch it.
                invoke = f"instance['{attr_name}']"

            if attr_required:
                # No default or no override.
                lines.append(f"  res['{kn}'] = {invoke}")
            else:
                lines.append(f"  if '{attr_name}' in instance: res['{kn}'] = {invoke}")

        internal_arg_line = ", ".join([f"{i}={i}" for i in internal_arg_parts])
        if internal_arg_line:
            internal_arg_line = f", {internal_arg_line}"
        for k, v in internal_arg_parts.items():
            globs[k] = v

        total_lines = [
            f"def {fn_name}(instance{internal_arg_line}):",
            "  res = instance.copy()",
            *lines,
            "  return res",
        ]
        script = "\n".join(total_lines)

        fname = generate_unique_filename(
            cl, "unstructure", lines=total_lines if _cattrs_use_linecache else []
        )

        eval(compile(script, fname, "exec"), globs)
    finally:
        working_set.remove(cl)
        if not working_set:
            del already_generating.working_set

    return globs[fn_name]


def make_dict_structure_fn(
    cl: Any,
    converter: BaseConverter,
    _cattrs_forbid_extra_keys: bool | Literal["from_converter"] = "from_converter",
    _cattrs_use_linecache: bool = True,
    _cattrs_detailed_validation: bool | Literal["from_converter"] = "from_converter",
    **kwargs: AttributeOverride,
) -> Callable[[dict, Any], Any]:
    """Generate a specialized dict structuring function for typed dicts.

    :param cl: A `TypedDict` class.
    :param converter: A Converter instance to use for structuring nested fields.
    :param kwargs: A mapping of field names to an `AttributeOverride`, for
        customization.
    :param _cattrs_detailed_validation: Whether to use a slower mode that produces
        more detailed errors.
    :param _cattrs_forbid_extra_keys: Whether the structuring function should raise a
        `ForbiddenExtraKeysError` if unknown keys are encountered.
    :param _cattrs_detailed_validation: Whether to store the generated code in the
        _linecache_, for easier debugging and better stack traces.

    ..  versionchanged:: 23.2.0
        The `_cattrs_forbid_extra_keys` and `_cattrs_detailed_validation` parameters
        take their values from the given converter by default.
    """

    mapping = {}
    if is_generic(cl):
        base = get_origin(cl)
        mapping = generate_mapping(cl, mapping)
        if base is not None:
            # It's possible for this to be a subclass of a generic,
            # so no origin.
            cl = base

    for base in getattr(cl, "__orig_bases__", ()):
        if is_generic(base) and not str(base).startswith("typing.Generic"):
            mapping = generate_mapping(base, mapping)
            break

    cl_name = cl.__name__
    fn_name = "structure_" + cl_name

    # We have generic parameters and need to generate a unique name for the function
    for p in getattr(cl, "__parameters__", ()):
        try:
            name_base = mapping[p.__name__]
        except KeyError:
            pn = p.__name__
            raise StructureHandlerNotFoundError(
                f"Missing type for generic argument {pn}, specify it when structuring.",
                p,
            ) from None
        name = getattr(name_base, "__name__", None) or str(name_base)
        # `<>` can be present in lambdas
        # `|` can be present in unions
        name = re.sub(r"[\[\.\] ,<>]", "_", name)
        name = re.sub(r"\|", "u", name)
        fn_name += f"_{name}"

    internal_arg_parts = {"__cl": cl}
    globs = {}
    lines = []
    post_lines = []

    attrs = _adapted_fields(cl)
    req_keys = _required_keys(cl)

    allowed_fields = set()
    if _cattrs_forbid_extra_keys == "from_converter":
        # BaseConverter doesn't have it so we're careful.
        _cattrs_forbid_extra_keys = getattr(converter, "forbid_extra_keys", False)
    if _cattrs_detailed_validation == "from_converter":
        _cattrs_detailed_validation = converter.detailed_validation

    if _cattrs_forbid_extra_keys:
        globs["__c_a"] = allowed_fields
        globs["__c_feke"] = ForbiddenExtraKeysError

    lines.append("  res = o.copy()")

    if _cattrs_detailed_validation:
        lines.append("  errors = []")
        internal_arg_parts["__c_cve"] = ClassValidationError
        internal_arg_parts["__c_avn"] = AttributeValidationNote
        for ix, a in enumerate(attrs):
            an = a.name
            attr_required = an in req_keys
            override = kwargs.get(an, neutral)
            if override.omit:
                continue
            t = a.type

            if isinstance(t, TypeVar):
                t = mapping.get(t.__name__, t)
            elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, mapping)

            nrb = get_notrequired_base(t)
            if nrb is not NOTHING:
                t = nrb

            if is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, mapping)

            # For each attribute, we try resolving the type here and now.
            # If a type is manually overwritten, this function should be
            # regenerated.
            if override.struct_hook is not None:
                # If the user has requested an override, just use that.
                handler = override.struct_hook
            else:
                handler = find_structure_handler(a, t, converter)

            struct_handler_name = f"__c_structure_{ix}"
            internal_arg_parts[struct_handler_name] = handler

            kn = an if override.rename is None else override.rename
            allowed_fields.add(kn)
            i = "  "
            if not attr_required:
                lines.append(f"{i}if '{kn}' in o:")
                i = f"{i}  "
            lines.append(f"{i}try:")
            i = f"{i}  "

            tn = f"__c_type_{ix}"
            internal_arg_parts[tn] = t

            if handler == converter._structure_call:
                internal_arg_parts[struct_handler_name] = t
                lines.append(f"{i}res['{an}'] = {struct_handler_name}(o['{kn}'])")
            else:
                lines.append(f"{i}res['{an}'] = {struct_handler_name}(o['{kn}'], {tn})")
            if override.rename is not None:
                lines.append(f"{i}del res['{kn}']")
            i = i[:-2]
            lines.append(f"{i}except Exception as e:")
            i = f"{i}  "
            lines.append(
                f'{i}e.__notes__ = [*getattr(e, \'__notes__\', []), __c_avn("Structuring typeddict {cl.__qualname__} @ attribute {an}", "{an}", {tn})]'
            )
            lines.append(f"{i}errors.append(e)")

        if _cattrs_forbid_extra_keys:
            post_lines += [
                "  unknown_fields = o.keys() - __c_a",
                "  if unknown_fields:",
                "    errors.append(__c_feke('', __cl, unknown_fields))",
            ]

        post_lines.append(
            f"  if errors: raise __c_cve('While structuring ' + {cl.__name__!r}, errors, __cl)"
        )
    else:
        non_required = []

        # The first loop deals with required args.
        for ix, a in enumerate(attrs):
            an = a.name
            attr_required = an in req_keys
            override = kwargs.get(an, neutral)
            if override.omit:
                continue
            if not attr_required:
                non_required.append((ix, a))
                continue

            t = a.type

            if isinstance(t, TypeVar):
                t = mapping.get(t.__name__, t)
            elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, mapping)

            nrb = get_notrequired_base(t)
            if nrb is not NOTHING:
                t = nrb

            if override.struct_hook is not None:
                handler = override.struct_hook
            else:
                # For each attribute, we try resolving the type here and now.
                # If a type is manually overwritten, this function should be
                # regenerated.
                handler = converter.get_structure_hook(t)

            kn = an if override.rename is None else override.rename
            allowed_fields.add(kn)

            struct_handler_name = f"__c_structure_{ix}"
            internal_arg_parts[struct_handler_name] = handler
            if handler == converter._structure_call:
                internal_arg_parts[struct_handler_name] = t
                invocation_line = f"  res['{an}'] = {struct_handler_name}(o['{kn}'])"
            else:
                tn = f"__c_type_{ix}"
                internal_arg_parts[tn] = t
                invocation_line = (
                    f"  res['{an}'] = {struct_handler_name}(o['{kn}'], {tn})"
                )

            lines.append(invocation_line)
            if override.rename is not None:
                lines.append(f"  del res['{override.rename}']")

        # The second loop is for optional args.
        if non_required:
            for ix, a in non_required:
                an = a.name
                override = kwargs.get(an, neutral)
                t = a.type

                nrb = get_notrequired_base(t)
                if nrb is not NOTHING:
                    t = nrb

                if isinstance(t, TypeVar):
                    t = mapping.get(t.__name__, t)
                elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                    t = deep_copy_with(t, mapping)

                if override.struct_hook is not None:
                    handler = override.struct_hook
                else:
                    # For each attribute, we try resolving the type here and now.
                    # If a type is manually overwritten, this function should be
                    # regenerated.
                    handler = converter.get_structure_hook(t)

                struct_handler_name = f"__c_structure_{ix}"
                internal_arg_parts[struct_handler_name] = handler

                ian = an
                kn = an if override.rename is None else override.rename
                allowed_fields.add(kn)
                post_lines.append(f"  if '{kn}' in o:")
                if handler == converter._structure_call:
                    internal_arg_parts[struct_handler_name] = t
                    post_lines.append(
                        f"    res['{ian}'] = {struct_handler_name}(o['{kn}'])"
                    )
                else:
                    tn = f"__c_type_{ix}"
                    internal_arg_parts[tn] = t
                    post_lines.append(
                        f"    res['{ian}'] = {struct_handler_name}(o['{kn}'], {tn})"
                    )
                if override.rename is not None:
                    lines.append(f"  res.pop('{override.rename}', None)")

        if _cattrs_forbid_extra_keys:
            post_lines += [
                "  unknown_fields = o.keys() - __c_a",
                "  if unknown_fields:",
                "    raise __c_feke('', __cl, unknown_fields)",
            ]

    # At the end, we create the function header.
    internal_arg_line = ", ".join([f"{i}={i}" for i in internal_arg_parts])
    for k, v in internal_arg_parts.items():
        globs[k] = v

    total_lines = [
        f"def {fn_name}(o, _, {internal_arg_line}):",
        *lines,
        *post_lines,
        "  return res",
    ]

    script = "\n".join(total_lines)
    fname = generate_unique_filename(
        cl, "structure", lines=total_lines if _cattrs_use_linecache else []
    )

    eval(compile(script, fname, "exec"), globs)
    return globs[fn_name]


def _adapted_fields(cls: Any) -> list[Attribute]:
    annotations = get_annots(cls)
    hints = get_full_type_hints(cls)
    return [
        Attribute(
            n,
            NOTHING,
            None,
            False,
            False,
            False,
            False,
            False,
            type=hints[n] if n in hints else annotations[n],
        )
        for n, a in annotations.items()
    ]


def _is_extensions_typeddict(cls) -> bool:
    if _TypedDictMeta is None:
        return False
    return cls.__class__ is _TypedDictMeta or (
        is_generic(cls) and (cls.__origin__.__class__ is _TypedDictMeta)
    )


if sys.version_info >= (3, 11):

    def _required_keys(cls: type) -> set[str]:
        return cls.__required_keys__

elif sys.version_info >= (3, 9):
    from typing_extensions import Annotated, NotRequired, Required, get_args

    # Note that there is no `typing.Required` on 3.9 and 3.10, only in
    # `typing_extensions`. Therefore, `typing.TypedDict` will not honor this
    # annotation, only `typing_extensions.TypedDict`.

    def _required_keys(cls: type) -> set[str]:
        """Our own processor for required keys."""
        if _is_extensions_typeddict(cls):
            return cls.__required_keys__

        # We vendor a part of the typing_extensions logic for
        # gathering required keys. *sigh*
        own_annotations = cls.__dict__.get("__annotations__", {})
        required_keys = set()
        # On 3.8 - 3.10, typing.TypedDict doesn't put typeddict superclasses
        # in the MRO, therefore we cannot handle non-required keys properly
        # in some situations. Oh well.
        for key in getattr(cls, "__required_keys__", []):
            annotation_type = own_annotations[key]
            annotation_origin = get_origin(annotation_type)
            if annotation_origin is Annotated:
                annotation_args = get_args(annotation_type)
                if annotation_args:
                    annotation_type = annotation_args[0]
                    annotation_origin = get_origin(annotation_type)

            if annotation_origin is NotRequired:
                pass
            elif cls.__total__:
                required_keys.add(key)
        return required_keys

else:
    from typing_extensions import Annotated, NotRequired, Required, get_args

    # On 3.8, typing.TypedDicts do not have __required_keys__.

    def _required_keys(cls: type) -> set[str]:
        """Our own processor for required keys."""
        if _is_extensions_typeddict(cls):
            return cls.__required_keys__

        own_annotations = cls.__dict__.get("__annotations__", {})
        required_keys = set()
        for key in own_annotations:
            annotation_type = own_annotations[key]

            if is_annotated(annotation_type):
                # If this is `Annotated`, we need to get the origin twice.
                annotation_type = get_origin(annotation_type)

            annotation_origin = get_origin(annotation_type)

            if annotation_origin is Required:
                required_keys.add(key)
            elif annotation_origin is NotRequired:
                pass
            elif cls.__total__:
                required_keys.add(key)
        return required_keys
