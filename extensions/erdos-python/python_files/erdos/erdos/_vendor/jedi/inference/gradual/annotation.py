"""
PEP 0484 ( https://www.python.org/dev/peps/pep-0484/ ) describes type hints
through function annotations. There is a strong suggestion in this document
that only the type of type hinting defined in PEP0484 should be allowed
as annotations in future python versions.
"""

import re
from inspect import Parameter

from erdos.erdos._vendor.parso import ParserSyntaxError, parse

from erdos.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from erdos.erdos._vendor.jedi.inference.gradual.base import DefineGenericBaseClass, GenericClass
from erdos.erdos._vendor.jedi.inference.gradual.generics import TupleGenericManager
from erdos.erdos._vendor.jedi.inference.gradual.type_var import TypeVar
from erdos.erdos._vendor.jedi.inference.helpers import is_string
from erdos.erdos._vendor.jedi.inference.compiled import builtin_from_name
from erdos.erdos._vendor.jedi.inference.param import get_executed_param_names
from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi import parser_utils


def infer_annotation(context, annotation):
    """
    Inferes an annotation node. This means that it inferes the part of
    `int` here:

        foo: int = 3

    Also checks for forward references (strings)
    """
    value_set = context.infer_node(annotation)
    if len(value_set) != 1:
        debug.warning("Inferred typing index %s should lead to 1 object, "
                      " not %s" % (annotation, value_set))
        return value_set

    inferred_value = list(value_set)[0]
    if is_string(inferred_value):
        result = _get_forward_reference_node(context, inferred_value.get_safe_value())
        if result is not None:
            return context.infer_node(result)
    return value_set


def _infer_annotation_string(context, string, index=None):
    node = _get_forward_reference_node(context, string)
    if node is None:
        return NO_VALUES

    value_set = context.infer_node(node)
    if index is not None:
        value_set = value_set.filter(
            lambda value: (
                value.array_type == 'tuple'
                and len(list(value.py__iter__())) >= index
            )
        ).py__simple_getitem__(index)
    return value_set


def _get_forward_reference_node(context, string):
    try:
        new_node = context.inference_state.grammar.parse(
            string,
            start_symbol='eval_input',
            error_recovery=False
        )
    except ParserSyntaxError:
        debug.warning('Annotation not parsed: %s' % string)
        return None
    else:
        module = context.tree_node.get_root_node()
        parser_utils.move(new_node, module.end_pos[0])
        new_node.parent = context.tree_node
        return new_node


def _split_comment_param_declaration(decl_text):
    """
    Split decl_text on commas, but group generic expressions
    together.

    For example, given "foo, Bar[baz, biz]" we return
    ['foo', 'Bar[baz, biz]'].

    """
    try:
        node = parse(decl_text, error_recovery=False).children[0]
    except ParserSyntaxError:
        debug.warning('Comment annotation is not valid Python: %s' % decl_text)
        return []

    if node.type in ['name', 'atom_expr', 'power']:
        return [node.get_code().strip()]

    params = []
    try:
        children = node.children
    except AttributeError:
        return []
    else:
        for child in children:
            if child.type in ['name', 'atom_expr', 'power']:
                params.append(child.get_code().strip())

    return params


@inference_state_method_cache()
def infer_param(function_value, param, ignore_stars=False):
    values = _infer_param(function_value, param)
    if ignore_stars or not values:
        return values
    inference_state = function_value.inference_state
    if param.star_count == 1:
        tuple_ = builtin_from_name(inference_state, 'tuple')
        return ValueSet([GenericClass(
            tuple_,
            TupleGenericManager((values,)),
        )])
    elif param.star_count == 2:
        dct = builtin_from_name(inference_state, 'dict')
        generics = (
            ValueSet([builtin_from_name(inference_state, 'str')]),
            values
        )
        return ValueSet([GenericClass(
            dct,
            TupleGenericManager(generics),
        )])
    return values


def _infer_param(function_value, param):
    """
    Infers the type of a function parameter, using type annotations.
    """
    annotation = param.annotation
    if annotation is None:
        # If no Python 3-style annotation, look for a comment annotation.
        # Identify parameters to function in the same sequence as they would
        # appear in a type comment.
        all_params = [child for child in param.parent.children
                      if child.type == 'param']

        node = param.parent.parent
        comment = parser_utils.get_following_comment_same_line(node)
        if comment is None:
            return NO_VALUES

        match = re.match(r"^#\s*type:\s*\(([^#]*)\)\s*->", comment)
        if not match:
            return NO_VALUES
        params_comments = _split_comment_param_declaration(match.group(1))

        # Find the specific param being investigated
        index = all_params.index(param)
        # If the number of parameters doesn't match length of type comment,
        # ignore first parameter (assume it's self).
        if len(params_comments) != len(all_params):
            debug.warning(
                "Comments length != Params length %s %s",
                params_comments, all_params
            )
        if function_value.is_bound_method():
            if index == 0:
                # Assume it's self, which is already handled
                return NO_VALUES
            index -= 1
        if index >= len(params_comments):
            return NO_VALUES

        param_comment = params_comments[index]
        return _infer_annotation_string(
            function_value.get_default_param_context(),
            param_comment
        )
    # Annotations are like default params and resolve in the same way.
    context = function_value.get_default_param_context()
    return infer_annotation(context, annotation)


def py__annotations__(funcdef):
    dct = {}
    for function_param in funcdef.get_params():
        param_annotation = function_param.annotation
        if param_annotation is not None:
            dct[function_param.name.value] = param_annotation

    return_annotation = funcdef.annotation
    if return_annotation:
        dct['return'] = return_annotation
    return dct


def resolve_forward_references(context, all_annotations):
    def resolve(node):
        if node is None or node.type != 'string':
            return node

        node = _get_forward_reference_node(
            context,
            context.inference_state.compiled_subprocess.safe_literal_eval(
                node.value,
            ),
        )

        if node is None:
            # There was a string, but it's not a valid annotation
            return None

        # The forward reference tree has an additional root node ('eval_input')
        # that we don't want. Extract the node we do want, that is equivalent to
        # the nodes returned by `py__annotations__` for a non-quoted node.
        node = node.children[0]

        return node

    return {name: resolve(node) for name, node in all_annotations.items()}


@inference_state_method_cache()
def infer_return_types(function, arguments):
    """
    Infers the type of a function's return value,
    according to type annotations.
    """
    context = function.get_default_param_context()
    all_annotations = resolve_forward_references(
        context,
        py__annotations__(function.tree_node),
    )
    annotation = all_annotations.get("return", None)
    if annotation is None:
        # If there is no Python 3-type annotation, look for an annotation
        # comment.
        node = function.tree_node
        comment = parser_utils.get_following_comment_same_line(node)
        if comment is None:
            return NO_VALUES

        match = re.match(r"^#\s*type:\s*\([^#]*\)\s*->\s*([^#]*)", comment)
        if not match:
            return NO_VALUES

        return _infer_annotation_string(
            context,
            match.group(1).strip()
        ).execute_annotation()

    unknown_type_vars = find_unknown_type_vars(context, annotation)
    annotation_values = infer_annotation(context, annotation)
    if not unknown_type_vars:
        return annotation_values.execute_annotation()

    type_var_dict = infer_type_vars_for_execution(function, arguments, all_annotations)

    return ValueSet.from_sets(
        ann.define_generics(type_var_dict)
        if isinstance(ann, (DefineGenericBaseClass, TypeVar)) else ValueSet({ann})
        for ann in annotation_values
    ).execute_annotation()


def infer_type_vars_for_execution(function, arguments, annotation_dict):
    """
    Some functions use type vars that are not defined by the class, but rather
    only defined in the function. See for example `iter`. In those cases we
    want to:

    1. Search for undefined type vars.
    2. Infer type vars with the execution state we have.
    3. Return the union of all type vars that have been found.
    """
    context = function.get_default_param_context()

    annotation_variable_results = {}
    executed_param_names = get_executed_param_names(function, arguments)
    for executed_param_name in executed_param_names:
        try:
            annotation_node = annotation_dict[executed_param_name.string_name]
        except KeyError:
            continue

        annotation_variables = find_unknown_type_vars(context, annotation_node)
        if annotation_variables:
            # Infer unknown type var
            annotation_value_set = context.infer_node(annotation_node)
            kind = executed_param_name.get_kind()
            actual_value_set = executed_param_name.infer()
            if kind is Parameter.VAR_POSITIONAL:
                actual_value_set = actual_value_set.merge_types_of_iterate()
            elif kind is Parameter.VAR_KEYWORD:
                # TODO _dict_values is not public.
                actual_value_set = actual_value_set.try_merge('_dict_values')
            merge_type_var_dicts(
                annotation_variable_results,
                annotation_value_set.infer_type_vars(actual_value_set),
            )
    return annotation_variable_results


def infer_return_for_callable(arguments, param_values, result_values):
    all_type_vars = {}
    for pv in param_values:
        if pv.array_type == 'list':
            type_var_dict = _infer_type_vars_for_callable(arguments, pv.py__iter__())
            all_type_vars.update(type_var_dict)

    return ValueSet.from_sets(
        v.define_generics(all_type_vars)
        if isinstance(v, (DefineGenericBaseClass, TypeVar))
        else ValueSet({v})
        for v in result_values
    ).execute_annotation()


def _infer_type_vars_for_callable(arguments, lazy_params):
    """
    Infers type vars for the Calllable class:

        def x() -> Callable[[Callable[..., _T]], _T]: ...
    """
    annotation_variable_results = {}
    for (_, lazy_value), lazy_callable_param in zip(arguments.unpack(), lazy_params):
        callable_param_values = lazy_callable_param.infer()
        # Infer unknown type var
        actual_value_set = lazy_value.infer()
        merge_type_var_dicts(
            annotation_variable_results,
            callable_param_values.infer_type_vars(actual_value_set),
        )
    return annotation_variable_results


def merge_type_var_dicts(base_dict, new_dict):
    for type_var_name, values in new_dict.items():
        if values:
            try:
                base_dict[type_var_name] |= values
            except KeyError:
                base_dict[type_var_name] = values


def merge_pairwise_generics(annotation_value, annotated_argument_class):
    """
    Match up the generic parameters from the given argument class to the
    target annotation.

    This walks the generic parameters immediately within the annotation and
    argument's type, in order to determine the concrete values of the
    annotation's parameters for the current case.

    For example, given the following code:

        def values(mapping: Mapping[K, V]) -> List[V]: ...

        for val in values({1: 'a'}):
            val

    Then this function should be given representations of `Mapping[K, V]`
    and `Mapping[int, str]`, so that it can determine that `K` is `int and
    `V` is `str`.

    Note that it is responsibility of the caller to traverse the MRO of the
    argument type as needed in order to find the type matching the
    annotation (in this case finding `Mapping[int, str]` as a parent of
    `Dict[int, str]`).

    Parameters
    ----------

    `annotation_value`: represents the annotation to infer the concrete
        parameter types of.

    `annotated_argument_class`: represents the annotated class of the
        argument being passed to the object annotated by `annotation_value`.
    """

    type_var_dict = {}

    if not isinstance(annotated_argument_class, DefineGenericBaseClass):
        return type_var_dict

    annotation_generics = annotation_value.get_generics()
    actual_generics = annotated_argument_class.get_generics()

    for annotation_generics_set, actual_generic_set in zip(annotation_generics, actual_generics):
        merge_type_var_dicts(
            type_var_dict,
            annotation_generics_set.infer_type_vars(actual_generic_set.execute_annotation()),
        )

    return type_var_dict


def find_type_from_comment_hint_for(context, node, name):
    return _find_type_from_comment_hint(context, node, node.children[1], name)


def find_type_from_comment_hint_with(context, node, name):
    if len(node.children) > 4:
        # In case there are multiple with_items, we do not want a type hint for
        # now.
        return []
    assert len(node.children[1].children) == 3, \
        "Can only be here when children[1] is 'foo() as f'"
    varlist = node.children[1].children[2]
    return _find_type_from_comment_hint(context, node, varlist, name)


def find_type_from_comment_hint_assign(context, node, name):
    return _find_type_from_comment_hint(context, node, node.children[0], name)


def _find_type_from_comment_hint(context, node, varlist, name):
    index = None
    if varlist.type in ("testlist_star_expr", "exprlist", "testlist"):
        # something like "a, b = 1, 2"
        index = 0
        for child in varlist.children:
            if child == name:
                break
            if child.type == "operator":
                continue
            index += 1
        else:
            return []

    comment = parser_utils.get_following_comment_same_line(node)
    if comment is None:
        return []
    match = re.match(r"^#\s*type:\s*([^#]*)", comment)
    if match is None:
        return []
    return _infer_annotation_string(
        context, match.group(1).strip(), index
    ).execute_annotation()


def find_unknown_type_vars(context, node):
    def check_node(node):
        if node.type in ('atom_expr', 'power'):
            trailer = node.children[-1]
            if trailer.type == 'trailer' and trailer.children[0] == '[':
                for subscript_node in _unpack_subscriptlist(trailer.children[1]):
                    check_node(subscript_node)
        else:
            found[:] = _filter_type_vars(context.infer_node(node), found)

    found = []  # We're not using a set, because the order matters.
    check_node(node)
    return found


def _filter_type_vars(value_set, found=()):
    new_found = list(found)
    for type_var in value_set:
        if isinstance(type_var, TypeVar) and type_var not in found:
            new_found.append(type_var)
    return new_found


def _unpack_subscriptlist(subscriptlist):
    if subscriptlist.type == 'subscriptlist':
        for subscript in subscriptlist.children[::2]:
            if subscript.type != 'subscript':
                yield subscript
    else:
        if subscriptlist.type != 'subscript':
            yield subscriptlist
