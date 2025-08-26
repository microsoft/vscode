"""
One of the really important features of |jedi| is to have an option to
understand code like this::

    def foo(bar):
        bar. # completion here
    foo(1)

There's no doubt wheter bar is an ``int`` or not, but if there's also a call
like ``foo('str')``, what would happen? Well, we'll just show both. Because
that's what a human would expect.

It works as follows:

- |Jedi| sees a param
- search for function calls named ``foo``
- execute these calls and check the input.
"""

from jedi import settings
from jedi import debug
from lotas.erdos._vendor.jedi.parser_utils import get_parent_scope
from lotas.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from lotas.erdos._vendor.jedi.inference.arguments import TreeArguments
from lotas.erdos._vendor.jedi.inference.param import get_executed_param_names
from lotas.erdos._vendor.jedi.inference.helpers import is_stdlib_path
from lotas.erdos._vendor.jedi.inference.utils import to_list
from lotas.erdos._vendor.jedi.inference.value import instance
from lotas.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from lotas.erdos._vendor.jedi.inference.references import get_module_contexts_containing_name
from lotas.erdos._vendor.jedi.inference import recursion


MAX_PARAM_SEARCHES = 20


def _avoid_recursions(func):
    def wrapper(function_value, param_index):
        inf = function_value.inference_state
        with recursion.execution_allowed(inf, function_value.tree_node) as allowed:
            # We need to catch recursions that may occur, because an
            # anonymous functions can create an anonymous parameter that is
            # more or less self referencing.
            if allowed:
                inf.dynamic_params_depth += 1
                try:
                    return func(function_value, param_index)
                finally:
                    inf.dynamic_params_depth -= 1
            return NO_VALUES
    return wrapper


@debug.increase_indent
@_avoid_recursions
def dynamic_param_lookup(function_value, param_index):
    """
    A dynamic search for param values. If you try to complete a type:

    >>> def func(foo):
    ...     foo
    >>> func(1)
    >>> func("")

    It is not known what the type ``foo`` without analysing the whole code. You
    have to look for all calls to ``func`` to find out what ``foo`` possibly
    is.
    """
    if not function_value.inference_state.do_dynamic_params_search:
        return NO_VALUES

    funcdef = function_value.tree_node

    path = function_value.get_root_context().py__file__()
    if path is not None and is_stdlib_path(path):
        # We don't want to search for references in the stdlib. Usually people
        # don't work with it (except if you are a core maintainer, sorry).
        # This makes everything slower. Just disable it and run the tests,
        # you will see the slowdown, especially in 3.6.
        return NO_VALUES

    if funcdef.type == 'lambdef':
        string_name = _get_lambda_name(funcdef)
        if string_name is None:
            return NO_VALUES
    else:
        string_name = funcdef.name.value
    debug.dbg('Dynamic param search in %s.', string_name, color='MAGENTA')

    module_context = function_value.get_root_context()
    arguments_list = _search_function_arguments(module_context, funcdef, string_name)
    values = ValueSet.from_sets(
        get_executed_param_names(
            function_value, arguments
        )[param_index].infer()
        for arguments in arguments_list
    )
    debug.dbg('Dynamic param result finished', color='MAGENTA')
    return values


@inference_state_method_cache(default=None)
@to_list
def _search_function_arguments(module_context, funcdef, string_name):
    """
    Returns a list of param names.
    """
    compare_node = funcdef
    if string_name == '__init__':
        cls = get_parent_scope(funcdef)
        if cls.type == 'classdef':
            string_name = cls.name.value
            compare_node = cls

    found_arguments = False
    i = 0
    inference_state = module_context.inference_state

    if settings.dynamic_params_for_other_modules:
        module_contexts = get_module_contexts_containing_name(
            inference_state, [module_context], string_name,
            # Limit the amounts of files to be opened massively.
            limit_reduction=5,
        )
    else:
        module_contexts = [module_context]

    for for_mod_context in module_contexts:
        for name, trailer in _get_potential_nodes(for_mod_context, string_name):
            i += 1

            # This is a simple way to stop Jedi's dynamic param recursion
            # from going wild: The deeper Jedi's in the recursion, the less
            # code should be inferred.
            if i * inference_state.dynamic_params_depth > MAX_PARAM_SEARCHES:
                return

            random_context = for_mod_context.create_context(name)
            for arguments in _check_name_for_execution(
                    inference_state, random_context, compare_node, name, trailer):
                found_arguments = True
                yield arguments

        # If there are results after processing a module, we're probably
        # good to process. This is a speed optimization.
        if found_arguments:
            return


def _get_lambda_name(node):
    stmt = node.parent
    if stmt.type == 'expr_stmt':
        first_operator = next(stmt.yield_operators(), None)
        if first_operator == '=':
            first = stmt.children[0]
            if first.type == 'name':
                return first.value

    return None


def _get_potential_nodes(module_value, func_string_name):
    try:
        names = module_value.tree_node.get_used_names()[func_string_name]
    except KeyError:
        return

    for name in names:
        bracket = name.get_next_leaf()
        trailer = bracket.parent
        if trailer.type == 'trailer' and bracket == '(':
            yield name, trailer


def _check_name_for_execution(inference_state, context, compare_node, name, trailer):
    from lotas.erdos._vendor.jedi.inference.value.function import BaseFunctionExecutionContext

    def create_args(value):
        arglist = trailer.children[1]
        if arglist == ')':
            arglist = None
        args = TreeArguments(inference_state, context, arglist, trailer)
        from lotas.erdos._vendor.jedi.inference.value.instance import InstanceArguments
        if value.tree_node.type == 'classdef':
            created_instance = instance.TreeInstance(
                inference_state,
                value.parent_context,
                value,
                args
            )
            return InstanceArguments(created_instance, args)
        else:
            if value.is_bound_method():
                args = InstanceArguments(value.instance, args)
            return args

    for value in inference_state.infer(context, name):
        value_node = value.tree_node
        if compare_node == value_node:
            yield create_args(value)
        elif isinstance(value.parent_context, BaseFunctionExecutionContext) \
                and compare_node.type == 'funcdef':
            # Here we're trying to find decorators by checking the first
            # parameter. It's not very generic though. Should find a better
            # solution that also applies to nested decorators.
            param_names = value.parent_context.get_param_names()
            if len(param_names) != 1:
                continue
            values = param_names[0].infer()
            if [v.tree_node for v in values] == [compare_node]:
                # Found a decorator.
                module_context = context.get_root_context()
                execution_context = value.as_context(create_args(value))
                potential_nodes = _get_potential_nodes(module_context, param_names[0].string_name)
                for name, trailer in potential_nodes:
                    if value_node.start_pos < name.start_pos < value_node.end_pos:
                        random_context = execution_context.create_context(name)
                        yield from _check_name_for_execution(
                            inference_state,
                            random_context,
                            compare_node,
                            name,
                            trailer
                        )
