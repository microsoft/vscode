from __future__ import annotations

import re
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Final,
    Iterable,
    Literal,
    Mapping,
    Tuple,
    TypeVar,
)

from attrs import NOTHING, Attribute, Factory, resolve_types

from .._compat import (
    ANIES,
    TypeAlias,
    adapted_fields,
    get_args,
    get_origin,
    is_annotated,
    is_bare,
    is_bare_final,
    is_generic,
)
from .._generics import deep_copy_with
from ..dispatch import UnstructureHook
from ..errors import (
    AttributeValidationNote,
    ClassValidationError,
    ForbiddenExtraKeysError,
    IterableValidationError,
    IterableValidationNote,
    StructureHandlerNotFoundError,
)
from ..fns import identity
from ._consts import AttributeOverride, already_generating, neutral
from ._generics import generate_mapping
from ._lc import generate_unique_filename
from ._shared import find_structure_handler

if TYPE_CHECKING:
    from ..converters import BaseConverter

__all__ = [
    "make_dict_unstructure_fn",
    "make_dict_structure_fn",
    "make_iterable_unstructure_fn",
    "make_hetero_tuple_unstructure_fn",
    "make_mapping_unstructure_fn",
    "make_mapping_structure_fn",
    "make_dict_unstructure_fn_from_attrs",
    "make_dict_structure_fn_from_attrs",
]


def override(
    omit_if_default: bool | None = None,
    rename: str | None = None,
    omit: bool | None = None,
    struct_hook: Callable[[Any, Any], Any] | None = None,
    unstruct_hook: Callable[[Any], Any] | None = None,
) -> AttributeOverride:
    """Override how a particular field is handled.

    :param omit: Whether to skip the field or not. `None` means apply default handling.
    """
    return AttributeOverride(omit_if_default, rename, omit, struct_hook, unstruct_hook)


T = TypeVar("T")


def make_dict_unstructure_fn_from_attrs(
    attrs: list[Attribute],
    cl: type,
    converter: BaseConverter,
    typevar_map: dict[str, Any] = {},
    _cattrs_omit_if_default: bool = False,
    _cattrs_use_linecache: bool = True,
    _cattrs_use_alias: bool = False,
    _cattrs_include_init_false: bool = False,
    **kwargs: AttributeOverride,
) -> Callable[[T], dict[str, Any]]:
    """
    Generate a specialized dict unstructuring function for a list of attributes.

    Usually used as a building block by more specialized hook factories.

    Any provided overrides are attached to the generated function under the
    `overrides` attribute.

    :param cl: The class for which the function is generated; used mostly for its name,
        module name and qualname.
    :param _cattrs_omit_if_default: if true, attributes equal to their default values
        will be omitted in the result dictionary.
    :param _cattrs_use_alias: If true, the attribute alias will be used as the
        dictionary key by default.
    :param _cattrs_include_init_false: If true, _attrs_ fields marked as `init=False`
        will be included.

    ..  versionadded:: 24.1.0
    """

    fn_name = "unstructure_" + cl.__name__
    globs = {}
    lines = []
    invocation_lines = []
    internal_arg_parts = {}

    for a in attrs:
        attr_name = a.name
        override = kwargs.get(attr_name, neutral)
        if override.omit:
            continue
        if override.omit is None and not a.init and not _cattrs_include_init_false:
            continue
        if override.rename is None:
            kn = attr_name if not _cattrs_use_alias else a.alias
        else:
            kn = override.rename
        d = a.default

        # For each attribute, we try resolving the type here and now.
        # If a type is manually overwritten, this function should be
        # regenerated.
        handler = None
        if override.unstruct_hook is not None:
            handler = override.unstruct_hook
        else:
            if a.type is not None:
                t = a.type
                if isinstance(t, TypeVar):
                    if t.__name__ in typevar_map:
                        t = typevar_map[t.__name__]
                    else:
                        handler = converter.unstructure
                elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                    t = deep_copy_with(t, typevar_map)

                if handler is None:
                    if (
                        is_bare_final(t)
                        and a.default is not NOTHING
                        and not isinstance(a.default, Factory)
                    ):
                        # This is a special case where we can use the
                        # type of the default to dispatch on.
                        t = a.default.__class__
                    try:
                        handler = converter.get_unstructure_hook(t, cache_result=False)
                    except RecursionError:
                        # There's a circular reference somewhere down the line
                        handler = converter.unstructure
            else:
                handler = converter.unstructure

        is_identity = handler == identity

        if not is_identity:
            unstruct_handler_name = f"__c_unstr_{attr_name}"
            globs[unstruct_handler_name] = handler
            internal_arg_parts[unstruct_handler_name] = handler
            invoke = f"{unstruct_handler_name}(instance.{attr_name})"
        else:
            invoke = f"instance.{attr_name}"

        if d is not NOTHING and (
            (_cattrs_omit_if_default and override.omit_if_default is not False)
            or override.omit_if_default
        ):
            def_name = f"__c_def_{attr_name}"

            if isinstance(d, Factory):
                globs[def_name] = d.factory
                internal_arg_parts[def_name] = d.factory
                if d.takes_self:
                    lines.append(f"  if instance.{attr_name} != {def_name}(instance):")
                else:
                    lines.append(f"  if instance.{attr_name} != {def_name}():")
                lines.append(f"    res['{kn}'] = {invoke}")
            else:
                globs[def_name] = d
                internal_arg_parts[def_name] = d
                lines.append(f"  if instance.{attr_name} != {def_name}:")
                lines.append(f"    res['{kn}'] = {invoke}")

        else:
            # No default or no override.
            invocation_lines.append(f"'{kn}': {invoke},")

    internal_arg_line = ", ".join([f"{i}={i}" for i in internal_arg_parts])
    if internal_arg_line:
        internal_arg_line = f", {internal_arg_line}"
    for k, v in internal_arg_parts.items():
        globs[k] = v

    total_lines = (
        [f"def {fn_name}(instance{internal_arg_line}):"]
        + ["  res = {"]
        + [f"    {line}" for line in invocation_lines]
        + ["  }"]
        + lines
        + ["  return res"]
    )
    script = "\n".join(total_lines)
    fname = generate_unique_filename(
        cl, "unstructure", lines=total_lines if _cattrs_use_linecache else []
    )

    eval(compile(script, fname, "exec"), globs)

    res = globs[fn_name]
    res.overrides = kwargs

    return res


def make_dict_unstructure_fn(
    cl: type[T],
    converter: BaseConverter,
    _cattrs_omit_if_default: bool = False,
    _cattrs_use_linecache: bool = True,
    _cattrs_use_alias: bool = False,
    _cattrs_include_init_false: bool = False,
    **kwargs: AttributeOverride,
) -> Callable[[T], dict[str, Any]]:
    """
    Generate a specialized dict unstructuring function for an attrs class or a
    dataclass.

    Any provided overrides are attached to the generated function under the
    `overrides` attribute.

    :param _cattrs_omit_if_default: if true, attributes equal to their default values
        will be omitted in the result dictionary.
    :param _cattrs_use_alias: If true, the attribute alias will be used as the
        dictionary key by default.
    :param _cattrs_include_init_false: If true, _attrs_ fields marked as `init=False`
        will be included.

    ..  versionadded:: 23.2.0 *_cattrs_use_alias*
    ..  versionadded:: 23.2.0 *_cattrs_include_init_false*
    """
    origin = get_origin(cl)
    attrs = adapted_fields(origin or cl)  # type: ignore

    if any(isinstance(a.type, str) for a in attrs):
        # PEP 563 annotations - need to be resolved.
        resolve_types(cl)

    mapping = {}
    if is_generic(cl):
        mapping = generate_mapping(cl, mapping)

        for base in getattr(origin, "__orig_bases__", ()):
            if is_generic(base) and not str(base).startswith("typing.Generic"):
                mapping = generate_mapping(base, mapping)
                break
        if origin is not None:
            cl = origin

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
        return make_dict_unstructure_fn_from_attrs(
            attrs,
            cl,
            converter,
            mapping,
            _cattrs_omit_if_default=_cattrs_omit_if_default,
            _cattrs_use_linecache=_cattrs_use_linecache,
            _cattrs_use_alias=_cattrs_use_alias,
            _cattrs_include_init_false=_cattrs_include_init_false,
            **kwargs,
        )
    finally:
        working_set.remove(cl)
        if not working_set:
            del already_generating.working_set


DictStructureFn = Callable[[Mapping[str, Any], Any], T]


def make_dict_structure_fn_from_attrs(
    attrs: list[Attribute],
    cl: type,
    converter: BaseConverter,
    typevar_map: dict[str, Any] = {},
    _cattrs_forbid_extra_keys: bool | Literal["from_converter"] = "from_converter",
    _cattrs_use_linecache: bool = True,
    _cattrs_prefer_attrib_converters: (
        bool | Literal["from_converter"]
    ) = "from_converter",
    _cattrs_detailed_validation: bool | Literal["from_converter"] = "from_converter",
    _cattrs_use_alias: bool = False,
    _cattrs_include_init_false: bool = False,
    **kwargs: AttributeOverride,
) -> DictStructureFn[T]:
    """
    Generate a specialized dict structuring function for a list of attributes.

    Usually used as a building block by more specialized hook factories.

    Any provided overrides are attached to the generated function under the
    `overrides` attribute.

    :param _cattrs_forbid_extra_keys: Whether the structuring function should raise a
        `ForbiddenExtraKeysError` if unknown keys are encountered.
    :param _cattrs_use_linecache: Whether to store the source code in the Python
        linecache.
    :param _cattrs_prefer_attrib_converters: If an _attrs_ converter is present on a
        field, use it instead of processing the field normally.
    :param _cattrs_detailed_validation: Whether to use a slower mode that produces
        more detailed errors.
    :param _cattrs_use_alias: If true, the attribute alias will be used as the
        dictionary key by default.
    :param _cattrs_include_init_false: If true, _attrs_ fields marked as `init=False`
        will be included.

    ..  versionadded:: 24.1.0
    """

    cl_name = cl.__name__
    fn_name = "structure_" + cl_name

    # We have generic parameters and need to generate a unique name for the function
    for p in getattr(cl, "__parameters__", ()):
        # This is nasty, I am not sure how best to handle `typing.List[str]` or
        # `TClass[int, int]` as a parameter type here
        try:
            name_base = typevar_map[p.__name__]
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
    pi_lines = []  # post instantiation lines
    invocation_lines = []

    allowed_fields = set()
    if _cattrs_forbid_extra_keys == "from_converter":
        # BaseConverter doesn't have it so we're careful.
        _cattrs_forbid_extra_keys = getattr(converter, "forbid_extra_keys", False)
    if _cattrs_detailed_validation == "from_converter":
        _cattrs_detailed_validation = converter.detailed_validation
    if _cattrs_prefer_attrib_converters == "from_converter":
        _cattrs_prefer_attrib_converters = converter._prefer_attrib_converters

    if _cattrs_forbid_extra_keys:
        globs["__c_a"] = allowed_fields
        globs["__c_feke"] = ForbiddenExtraKeysError

    if _cattrs_detailed_validation:
        lines.append("  res = {}")
        lines.append("  errors = []")
        invocation_lines.append("**res,")
        internal_arg_parts["__c_cve"] = ClassValidationError
        internal_arg_parts["__c_avn"] = AttributeValidationNote
        for a in attrs:
            an = a.name
            override = kwargs.get(an, neutral)
            if override.omit:
                continue
            if override.omit is None and not a.init and not _cattrs_include_init_false:
                continue
            t = a.type
            if isinstance(t, TypeVar):
                t = typevar_map.get(t.__name__, t)
            elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, typevar_map)

            # For each attribute, we try resolving the type here and now.
            # If a type is manually overwritten, this function should be
            # regenerated.
            if override.struct_hook is not None:
                # If the user has requested an override, just use that.
                handler = override.struct_hook
            else:
                handler = find_structure_handler(
                    a, t, converter, _cattrs_prefer_attrib_converters
                )

            struct_handler_name = f"__c_structure_{an}"
            if handler is not None:
                internal_arg_parts[struct_handler_name] = handler

            ian = a.alias
            if override.rename is None:
                kn = an if not _cattrs_use_alias else a.alias
            else:
                kn = override.rename

            allowed_fields.add(kn)
            i = "  "

            if not a.init:
                if a.default is not NOTHING:
                    pi_lines.append(f"{i}if '{kn}' in o:")
                    i = f"{i}  "
                pi_lines.append(f"{i}try:")
                i = f"{i}  "
                type_name = f"__c_type_{an}"
                internal_arg_parts[type_name] = t
                if handler is not None:
                    if handler == converter._structure_call:
                        internal_arg_parts[struct_handler_name] = t
                        pi_lines.append(
                            f"{i}instance.{an} = {struct_handler_name}(o['{kn}'])"
                        )
                    else:
                        tn = f"__c_type_{an}"
                        internal_arg_parts[tn] = t
                        pi_lines.append(
                            f"{i}instance.{an} = {struct_handler_name}(o['{kn}'], {tn})"
                        )
                else:
                    pi_lines.append(f"{i}instance.{an} = o['{kn}']")
                i = i[:-2]
                pi_lines.append(f"{i}except Exception as e:")
                i = f"{i}  "
                pi_lines.append(
                    f'{i}e.__notes__ = getattr(e, \'__notes__\', []) + [__c_avn("Structuring class {cl.__qualname__} @ attribute {an}", "{an}", __c_type_{an})]'
                )
                pi_lines.append(f"{i}errors.append(e)")

            else:
                if a.default is not NOTHING:
                    lines.append(f"{i}if '{kn}' in o:")
                    i = f"{i}  "
                lines.append(f"{i}try:")
                i = f"{i}  "
                type_name = f"__c_type_{an}"
                internal_arg_parts[type_name] = t
                if handler:
                    if handler == converter._structure_call:
                        internal_arg_parts[struct_handler_name] = t
                        lines.append(
                            f"{i}res['{ian}'] = {struct_handler_name}(o['{kn}'])"
                        )
                    else:
                        tn = f"__c_type_{an}"
                        internal_arg_parts[tn] = t
                        lines.append(
                            f"{i}res['{ian}'] = {struct_handler_name}(o['{kn}'], {tn})"
                        )
                else:
                    lines.append(f"{i}res['{ian}'] = o['{kn}']")
                i = i[:-2]
                lines.append(f"{i}except Exception as e:")
                i = f"{i}  "
                lines.append(
                    f'{i}e.__notes__ = getattr(e, \'__notes__\', []) + [__c_avn("Structuring class {cl.__qualname__} @ attribute {an}", "{an}", __c_type_{an})]'
                )
                lines.append(f"{i}errors.append(e)")

        if _cattrs_forbid_extra_keys:
            post_lines += [
                "  unknown_fields = set(o.keys()) - __c_a",
                "  if unknown_fields:",
                "    errors.append(__c_feke('', __cl, unknown_fields))",
            ]

        post_lines.append(
            f"  if errors: raise __c_cve('While structuring ' + {cl_name!r}, errors, __cl)"
        )
        if not pi_lines:
            instantiation_lines = (
                ["  try:"]
                + ["    return __cl("]
                + [f"      {line}" for line in invocation_lines]
                + ["    )"]
                + [
                    f"  except Exception as exc: raise __c_cve('While structuring ' + {cl_name!r}, [exc], __cl)"
                ]
            )
        else:
            instantiation_lines = (
                ["  try:"]
                + ["    instance = __cl("]
                + [f"      {line}" for line in invocation_lines]
                + ["    )"]
                + [
                    f"  except Exception as exc: raise __c_cve('While structuring ' + {cl_name!r}, [exc], __cl)"
                ]
            )
            pi_lines.append("  return instance")
    else:
        non_required = []
        # The first loop deals with required args.
        for a in attrs:
            an = a.name
            override = kwargs.get(an, neutral)
            if override.omit:
                continue
            if override.omit is None and not a.init and not _cattrs_include_init_false:
                continue
            if a.default is not NOTHING:
                non_required.append(a)
                continue
            t = a.type
            if isinstance(t, TypeVar):
                t = typevar_map.get(t.__name__, t)
            elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                t = deep_copy_with(t, typevar_map)

            # For each attribute, we try resolving the type here and now.
            # If a type is manually overwritten, this function should be
            # regenerated.
            if override.struct_hook is not None:
                # If the user has requested an override, just use that.
                handler = override.struct_hook
            else:
                handler = find_structure_handler(
                    a, t, converter, _cattrs_prefer_attrib_converters
                )

            if override.rename is None:
                kn = an if not _cattrs_use_alias else a.alias
            else:
                kn = override.rename
            allowed_fields.add(kn)

            if not a.init:
                if handler is not None:
                    struct_handler_name = f"__c_structure_{an}"
                    internal_arg_parts[struct_handler_name] = handler
                    if handler == converter._structure_call:
                        internal_arg_parts[struct_handler_name] = t
                        pi_line = f"  instance.{an} = {struct_handler_name}(o['{kn}'])"
                    else:
                        tn = f"__c_type_{an}"
                        internal_arg_parts[tn] = t
                        pi_line = (
                            f"  instance.{an} = {struct_handler_name}(o['{kn}'], {tn})"
                        )
                else:
                    pi_line = f"  instance.{an} = o['{kn}']"

                pi_lines.append(pi_line)
            else:
                if handler:
                    struct_handler_name = f"__c_structure_{an}"
                    internal_arg_parts[struct_handler_name] = handler
                    if handler == converter._structure_call:
                        internal_arg_parts[struct_handler_name] = t
                        invocation_line = f"{struct_handler_name}(o['{kn}']),"
                    else:
                        tn = f"__c_type_{an}"
                        internal_arg_parts[tn] = t
                        invocation_line = f"{struct_handler_name}(o['{kn}'], {tn}),"
                else:
                    invocation_line = f"o['{kn}'],"

                if a.kw_only:
                    invocation_line = f"{a.alias}={invocation_line}"
                invocation_lines.append(invocation_line)

        # The second loop is for optional args.
        if non_required:
            invocation_lines.append("**res,")
            lines.append("  res = {}")

            for a in non_required:
                an = a.name
                override = kwargs.get(an, neutral)
                t = a.type
                if isinstance(t, TypeVar):
                    t = typevar_map.get(t.__name__, t)
                elif is_generic(t) and not is_bare(t) and not is_annotated(t):
                    t = deep_copy_with(t, typevar_map)

                # For each attribute, we try resolving the type here and now.
                # If a type is manually overwritten, this function should be
                # regenerated.
                if override.struct_hook is not None:
                    # If the user has requested an override, just use that.
                    handler = override.struct_hook
                else:
                    handler = find_structure_handler(
                        a, t, converter, _cattrs_prefer_attrib_converters
                    )

                struct_handler_name = f"__c_structure_{an}"
                internal_arg_parts[struct_handler_name] = handler

                if override.rename is None:
                    kn = an if not _cattrs_use_alias else a.alias
                else:
                    kn = override.rename
                allowed_fields.add(kn)
                if not a.init:
                    pi_lines.append(f"  if '{kn}' in o:")
                    if handler:
                        if handler == converter._structure_call:
                            internal_arg_parts[struct_handler_name] = t
                            pi_lines.append(
                                f"    instance.{an} = {struct_handler_name}(o['{kn}'])"
                            )
                        else:
                            tn = f"__c_type_{an}"
                            internal_arg_parts[tn] = t
                            pi_lines.append(
                                f"    instance.{an} = {struct_handler_name}(o['{kn}'], {tn})"
                            )
                    else:
                        pi_lines.append(f"    instance.{an} = o['{kn}']")
                else:
                    post_lines.append(f"  if '{kn}' in o:")
                    if handler:
                        if handler == converter._structure_call:
                            internal_arg_parts[struct_handler_name] = t
                            post_lines.append(
                                f"    res['{a.alias}'] = {struct_handler_name}(o['{kn}'])"
                            )
                        else:
                            tn = f"__c_type_{an}"
                            internal_arg_parts[tn] = t
                            post_lines.append(
                                f"    res['{a.alias}'] = {struct_handler_name}(o['{kn}'], {tn})"
                            )
                    else:
                        post_lines.append(f"    res['{a.alias}'] = o['{kn}']")
        if not pi_lines:
            instantiation_lines = (
                ["  return __cl("]
                + [f"    {line}" for line in invocation_lines]
                + ["  )"]
            )
        else:
            instantiation_lines = (
                ["  instance = __cl("]
                + [f"    {line}" for line in invocation_lines]
                + ["  )"]
            )
            pi_lines.append("  return instance")

        if _cattrs_forbid_extra_keys:
            post_lines += [
                "  unknown_fields = set(o.keys()) - __c_a",
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
        *instantiation_lines,
        *pi_lines,
    ]

    script = "\n".join(total_lines)
    fname = generate_unique_filename(
        cl, "structure", lines=total_lines if _cattrs_use_linecache else []
    )

    eval(compile(script, fname, "exec"), globs)

    res = globs[fn_name]
    res.overrides = kwargs

    return res


def make_dict_structure_fn(
    cl: type[T],
    converter: BaseConverter,
    _cattrs_forbid_extra_keys: bool | Literal["from_converter"] = "from_converter",
    _cattrs_use_linecache: bool = True,
    _cattrs_prefer_attrib_converters: (
        bool | Literal["from_converter"]
    ) = "from_converter",
    _cattrs_detailed_validation: bool | Literal["from_converter"] = "from_converter",
    _cattrs_use_alias: bool = False,
    _cattrs_include_init_false: bool = False,
    **kwargs: AttributeOverride,
) -> DictStructureFn[T]:
    """
    Generate a specialized dict structuring function for an attrs class or
    dataclass.

    Any provided overrides are attached to the generated function under the
    `overrides` attribute.

    :param _cattrs_forbid_extra_keys: Whether the structuring function should raise a
        `ForbiddenExtraKeysError` if unknown keys are encountered.
    :param _cattrs_use_linecache: Whether to store the source code in the Python
        linecache.
    :param _cattrs_prefer_attrib_converters: If an _attrs_ converter is present on a
        field, use it instead of processing the field normally.
    :param _cattrs_detailed_validation: Whether to use a slower mode that produces
        more detailed errors.
    :param _cattrs_use_alias: If true, the attribute alias will be used as the
        dictionary key by default.
    :param _cattrs_include_init_false: If true, _attrs_ fields marked as `init=False`
        will be included.

    ..  versionadded:: 23.2.0 *_cattrs_use_alias*
    ..  versionadded:: 23.2.0 *_cattrs_include_init_false*
    ..  versionchanged:: 23.2.0
        The `_cattrs_forbid_extra_keys` and `_cattrs_detailed_validation` parameters
        take their values from the given converter by default.
    ..  versionchanged:: 24.1.0
        The `_cattrs_prefer_attrib_converters` parameter takes its value from the given
        converter by default.
    """

    mapping = {}
    if is_generic(cl):
        base = get_origin(cl)
        mapping = generate_mapping(cl, mapping)
        if base is not None:
            cl = base

    for base in getattr(cl, "__orig_bases__", ()):
        if is_generic(base) and not str(base).startswith("typing.Generic"):
            mapping = generate_mapping(base, mapping)
            break

    attrs = adapted_fields(cl)

    if any(isinstance(a.type, str) for a in attrs):
        # PEP 563 annotations - need to be resolved.
        resolve_types(cl)

    # We keep track of what we're generating to help with recursive
    # class graphs.
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
            attrs,
            cl,
            converter,
            mapping,
            _cattrs_forbid_extra_keys=_cattrs_forbid_extra_keys,
            _cattrs_use_linecache=_cattrs_use_linecache,
            _cattrs_prefer_attrib_converters=_cattrs_prefer_attrib_converters,
            _cattrs_detailed_validation=_cattrs_detailed_validation,
            _cattrs_use_alias=_cattrs_use_alias,
            _cattrs_include_init_false=_cattrs_include_init_false,
            **kwargs,
        )
    finally:
        working_set.remove(cl)
        if not working_set:
            del already_generating.working_set


IterableUnstructureFn = Callable[[Iterable[Any]], Any]


#: A type alias for heterogeneous tuple unstructure hooks.
HeteroTupleUnstructureFn: TypeAlias = Callable[[Tuple[Any, ...]], Any]


def make_hetero_tuple_unstructure_fn(
    cl: Any,
    converter: BaseConverter,
    unstructure_to: Any = None,
    type_args: tuple | None = None,
) -> HeteroTupleUnstructureFn:
    """Generate a specialized unstructure function for a heterogenous tuple.

    :param type_args: If provided, override the type arguments.
    """
    fn_name = "unstructure_tuple"

    type_args = get_args(cl) if type_args is None else type_args

    # We can do the dispatch here and now.
    handlers = [converter.get_unstructure_hook(type_arg) for type_arg in type_args]

    globs = {f"__cattr_u_{i}": h for i, h in enumerate(handlers)}
    if unstructure_to is not tuple:
        globs["__cattr_seq_cl"] = unstructure_to or cl
    lines = []

    lines.append(f"def {fn_name}(tup):")
    if unstructure_to is not tuple:
        lines.append("    res = __cattr_seq_cl((")
    else:
        lines.append("    res = (")
    for i in range(len(handlers)):
        if handlers[i] == identity:
            lines.append(f"        tup[{i}],")
        else:
            lines.append(f"        __cattr_u_{i}(tup[{i}]),")

    if unstructure_to is not tuple:
        lines.append("    ))")
    else:
        lines.append("    )")

    total_lines = [*lines, "    return res"]

    eval(compile("\n".join(total_lines), "", "exec"), globs)

    return globs[fn_name]


MappingUnstructureFn = Callable[[Mapping[Any, Any]], Any]


def make_mapping_unstructure_fn(
    cl: Any,
    converter: BaseConverter,
    unstructure_to: Any = None,
    key_handler: Callable[[Any, Any | None], Any] | None = None,
) -> MappingUnstructureFn:
    """Generate a specialized unstructure function for a mapping."""
    kh = key_handler or converter.unstructure
    val_handler = converter.unstructure

    fn_name = "unstructure_mapping"

    # Let's try fishing out the type args.
    if getattr(cl, "__args__", None) is not None:
        args = get_args(cl)
        if len(args) == 2:
            key_arg, val_arg = args
        else:
            # Probably a Counter
            key_arg, val_arg = args, Any
        # We can do the dispatch here and now.
        kh = key_handler or converter.get_unstructure_hook(key_arg, cache_result=False)
        if kh == identity:
            kh = None

        val_handler = converter.get_unstructure_hook(val_arg, cache_result=False)
        if val_handler == identity:
            val_handler = None

    globs = {
        "__cattr_mapping_cl": unstructure_to or cl,
        "__cattr_k_u": kh,
        "__cattr_v_u": val_handler,
    }

    k_u = "__cattr_k_u(k)" if kh is not None else "k"
    v_u = "__cattr_v_u(v)" if val_handler is not None else "v"

    lines = []

    lines.append(f"def {fn_name}(mapping):")
    lines.append(
        f"    res = __cattr_mapping_cl(({k_u}, {v_u}) for k, v in mapping.items())"
    )

    total_lines = [*lines, "    return res"]

    eval(compile("\n".join(total_lines), "", "exec"), globs)

    return globs[fn_name]


MappingStructureFn = Callable[[Mapping[Any, Any], Any], T]


# This factory is here for backwards compatibility and circular imports.
def mapping_structure_factory(
    cl: type[T],
    converter: BaseConverter,
    structure_to: type = dict,
    key_type=NOTHING,
    val_type=NOTHING,
    detailed_validation: bool = True,
) -> MappingStructureFn[T]:
    """Generate a specialized structure function for a mapping."""
    fn_name = "structure_mapping"

    globs: dict[str, type] = {"__cattr_mapping_cl": structure_to}

    lines = []
    internal_arg_parts = {}

    # Let's try fishing out the type args.
    if not is_bare(cl):
        args = get_args(cl)
        if len(args) == 2:
            key_arg_cand, val_arg_cand = args
            if key_type is NOTHING:
                key_type = key_arg_cand
            if val_type is NOTHING:
                val_type = val_arg_cand
        else:
            if key_type is not NOTHING and val_type is NOTHING:
                (val_type,) = args
            elif key_type is NOTHING and val_type is not NOTHING:
                (key_type,) = args
            else:
                # Probably a Counter
                (key_type,) = args
                val_type = Any

        is_bare_dict = val_type in ANIES and key_type in ANIES
        if not is_bare_dict:
            # We can do the dispatch here and now.
            key_handler = converter.get_structure_hook(key_type, cache_result=False)
            if key_handler == converter._structure_call:
                key_handler = key_type

            val_handler = converter.get_structure_hook(val_type, cache_result=False)
            if val_handler == converter._structure_call:
                val_handler = val_type

            globs["__cattr_k_t"] = key_type
            globs["__cattr_v_t"] = val_type
            globs["__cattr_k_s"] = key_handler
            globs["__cattr_v_s"] = val_handler
            k_s = (
                "__cattr_k_s(k, __cattr_k_t)"
                if key_handler != key_type
                else "__cattr_k_s(k)"
            )
            v_s = (
                "__cattr_v_s(v, __cattr_v_t)"
                if val_handler != val_type
                else "__cattr_v_s(v)"
            )
    else:
        is_bare_dict = True

    if is_bare_dict:
        # No args, it's a bare dict.
        lines.append("  res = dict(mapping)")
    else:
        if detailed_validation:
            internal_arg_parts["IterableValidationError"] = IterableValidationError
            internal_arg_parts["IterableValidationNote"] = IterableValidationNote
            internal_arg_parts["val_type"] = (
                val_type if val_type is not NOTHING else Any
            )
            internal_arg_parts["key_type"] = (
                key_type if key_type is not NOTHING else Any
            )
            globs["enumerate"] = enumerate

            lines.append("  res = {}; errors = []")
            lines.append("  for k, v in mapping.items():")
            lines.append("    try:")
            lines.append(f"      value = {v_s}")
            lines.append("    except Exception as e:")
            lines.append(
                "      e.__notes__ = getattr(e, '__notes__', []) + [IterableValidationNote(f'Structuring mapping value @ key {k!r}', k, val_type)]"
            )
            lines.append("      errors.append(e)")
            lines.append("      continue")
            lines.append("    try:")
            lines.append(f"      key = {k_s}")
            lines.append("      res[key] = value")
            lines.append("    except Exception as e:")
            lines.append(
                "      e.__notes__ = getattr(e, '__notes__', []) + [IterableValidationNote(f'Structuring mapping key @ key {k!r}', k, key_type)]"
            )
            lines.append("      errors.append(e)")
            lines.append("  if errors:")
            lines.append(
                f"    raise IterableValidationError('While structuring ' + {repr(cl)!r}, errors, __cattr_mapping_cl)"
            )
        else:
            lines.append(f"  res = {{{k_s}: {v_s} for k, v in mapping.items()}}")
    if structure_to is not dict:
        lines.append("  res = __cattr_mapping_cl(res)")

    internal_arg_line = ", ".join([f"{i}={i}" for i in internal_arg_parts])
    if internal_arg_line:
        internal_arg_line = f", {internal_arg_line}"
    for k, v in internal_arg_parts.items():
        globs[k] = v

    def_line = f"def {fn_name}(mapping, _{internal_arg_line}):"
    total_lines = [def_line, *lines, "  return res"]
    script = "\n".join(total_lines)

    eval(compile(script, "", "exec"), globs)

    return globs[fn_name]


make_mapping_structure_fn: Final = mapping_structure_factory


# This factory is here for backwards compatibility and circular imports.
def iterable_unstructure_factory(
    cl: Any, converter: BaseConverter, unstructure_to: Any = None
) -> UnstructureHook:
    """A hook factory for unstructuring iterables.

    :param unstructure_to: Force unstructuring to this type, if provided.
    """
    handler = converter.unstructure

    # Let's try fishing out the type args
    # Unspecified tuples have `__args__` as empty tuples, so guard
    # against IndexError.
    if getattr(cl, "__args__", None) not in (None, ()):
        type_arg = cl.__args__[0]
        if isinstance(type_arg, TypeVar):
            type_arg = getattr(type_arg, "__default__", Any)
        handler = converter.get_unstructure_hook(type_arg, cache_result=False)
        if handler == identity:
            # Save ourselves the trouble of iterating over it all.
            return unstructure_to or cl

    def unstructure_iterable(iterable, _seq_cl=unstructure_to or cl, _hook=handler):
        return _seq_cl(_hook(i) for i in iterable)

    return unstructure_iterable


make_iterable_unstructure_fn: Final = iterable_unstructure_factory
