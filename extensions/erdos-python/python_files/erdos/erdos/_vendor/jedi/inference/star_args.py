"""
This module is responsible for inferring *args and **kwargs for signatures.

This means for example in this case::

    def foo(a, b, c): ...

    def bar(*args):
        return foo(1, *args)

The signature here for bar should be `bar(b, c)` instead of bar(*args).
"""
from inspect import Parameter

from erdos.erdos._vendor.parso import tree

from erdos.erdos._vendor.jedi.inference.utils import to_list
from erdos.erdos._vendor.jedi.inference.names import ParamNameWrapper
from erdos.erdos._vendor.jedi.inference.helpers import is_big_annoying_library


def _iter_nodes_for_param(param_name):
    from erdos.erdos._vendor.parso.python.tree import search_ancestor
    from erdos.erdos._vendor.jedi.inference.arguments import TreeArguments

    execution_context = param_name.parent_context
    # Walk up the parso tree to get the FunctionNode we want. We use the parso
    # tree rather than going via the execution context so that we're agnostic of
    # the specific scope we're evaluating within (i.e: module or function,
    # etc.).
    function_node = tree.search_ancestor(param_name.tree_name, 'funcdef', 'lambdef')
    module_node = function_node.get_root_node()
    start = function_node.children[-1].start_pos
    end = function_node.children[-1].end_pos
    for name in module_node.get_used_names().get(param_name.string_name):
        if start <= name.start_pos < end:
            # Is used in the function
            argument = name.parent
            if argument.type == 'argument' \
                    and argument.children[0] == '*' * param_name.star_count:
                trailer = search_ancestor(argument, 'trailer')
                if trailer is not None:  # Make sure we're in a function
                    context = execution_context.create_context(trailer)
                    if _goes_to_param_name(param_name, context, name):
                        values = _to_callables(context, trailer)

                        args = TreeArguments.create_cached(
                            execution_context.inference_state,
                            context=context,
                            argument_node=trailer.children[1],
                            trailer=trailer,
                        )
                        for c in values:
                            yield c, args


def _goes_to_param_name(param_name, context, potential_name):
    if potential_name.type != 'name':
        return False
    from erdos.erdos._vendor.jedi.inference.names import TreeNameDefinition
    found = TreeNameDefinition(context, potential_name).goto()
    return any(param_name.parent_context == p.parent_context
               and param_name.start_pos == p.start_pos
               for p in found)


def _to_callables(context, trailer):
    from erdos.erdos._vendor.jedi.inference.syntax_tree import infer_trailer

    atom_expr = trailer.parent
    index = atom_expr.children[0] == 'await'
    # Infer atom first
    values = context.infer_node(atom_expr.children[index])
    for trailer2 in atom_expr.children[index + 1:]:
        if trailer == trailer2:
            break
        values = infer_trailer(context, values, trailer2)
    return values


def _remove_given_params(arguments, param_names):
    count = 0
    used_keys = set()
    for key, _ in arguments.unpack():
        if key is None:
            count += 1
        else:
            used_keys.add(key)

    for p in param_names:
        if count and p.maybe_positional_argument():
            count -= 1
            continue
        if p.string_name in used_keys and p.maybe_keyword_argument():
            continue
        yield p


@to_list
def process_params(param_names, star_count=3):  # default means both * and **
    if param_names:
        if is_big_annoying_library(param_names[0].parent_context):
            # At first this feature can look innocent, but it does a lot of
            # type inference in some cases, so we just ditch it.
            yield from param_names
            return

    used_names = set()
    arg_callables = []
    kwarg_callables = []

    kw_only_names = []
    kwarg_names = []
    arg_names = []
    original_arg_name = None
    original_kwarg_name = None
    for p in param_names:
        kind = p.get_kind()
        if kind == Parameter.VAR_POSITIONAL:
            if star_count & 1:
                arg_callables = _iter_nodes_for_param(p)
                original_arg_name = p
        elif p.get_kind() == Parameter.VAR_KEYWORD:
            if star_count & 2:
                kwarg_callables = list(_iter_nodes_for_param(p))
                original_kwarg_name = p
        elif kind == Parameter.KEYWORD_ONLY:
            if star_count & 2:
                kw_only_names.append(p)
        elif kind == Parameter.POSITIONAL_ONLY:
            if star_count & 1:
                yield p
        else:
            if star_count == 1:
                yield ParamNameFixedKind(p, Parameter.POSITIONAL_ONLY)
            elif star_count == 2:
                kw_only_names.append(ParamNameFixedKind(p, Parameter.KEYWORD_ONLY))
            else:
                used_names.add(p.string_name)
                yield p

    # First process *args
    longest_param_names = ()
    found_arg_signature = False
    found_kwarg_signature = False
    for func_and_argument in arg_callables:
        func, arguments = func_and_argument
        new_star_count = star_count
        if func_and_argument in kwarg_callables:
            kwarg_callables.remove(func_and_argument)
        else:
            new_star_count = 1

        for signature in func.get_signatures():
            found_arg_signature = True
            if new_star_count == 3:
                found_kwarg_signature = True
            args_for_this_func = []
            for p in process_params(
                    list(_remove_given_params(
                        arguments,
                        signature.get_param_names(resolve_stars=False)
                    )), new_star_count):
                if p.get_kind() == Parameter.VAR_KEYWORD:
                    kwarg_names.append(p)
                elif p.get_kind() == Parameter.VAR_POSITIONAL:
                    arg_names.append(p)
                elif p.get_kind() == Parameter.KEYWORD_ONLY:
                    kw_only_names.append(p)
                else:
                    args_for_this_func.append(p)
            if len(args_for_this_func) > len(longest_param_names):
                longest_param_names = args_for_this_func

    for p in longest_param_names:
        if star_count == 1 and p.get_kind() != Parameter.VAR_POSITIONAL:
            yield ParamNameFixedKind(p, Parameter.POSITIONAL_ONLY)
        else:
            if p.get_kind() == Parameter.POSITIONAL_OR_KEYWORD:
                used_names.add(p.string_name)
            yield p

    if not found_arg_signature and original_arg_name is not None:
        yield original_arg_name
    elif arg_names:
        yield arg_names[0]

    # Then process **kwargs
    for func, arguments in kwarg_callables:
        for signature in func.get_signatures():
            found_kwarg_signature = True
            for p in process_params(
                    list(_remove_given_params(
                        arguments,
                        signature.get_param_names(resolve_stars=False)
                    )), star_count=2):
                if p.get_kind() == Parameter.VAR_KEYWORD:
                    kwarg_names.append(p)
                elif p.get_kind() == Parameter.KEYWORD_ONLY:
                    kw_only_names.append(p)

    for p in kw_only_names:
        if p.string_name in used_names:
            continue
        yield p
        used_names.add(p.string_name)

    if not found_kwarg_signature and original_kwarg_name is not None:
        yield original_kwarg_name
    elif kwarg_names:
        yield kwarg_names[0]


class ParamNameFixedKind(ParamNameWrapper):
    def __init__(self, param_name, new_kind):
        super().__init__(param_name)
        self._new_kind = new_kind

    def get_kind(self):
        return self._new_kind
