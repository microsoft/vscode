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
- execute these calls and check the input. This work with a ``ParamListener``.
"""
from itertools import chain

from jedi._compatibility import unicode
from jedi.parser import tree
from jedi import settings
from jedi import debug
from jedi.evaluate.cache import memoize_default
from jedi.evaluate import imports


class ParamListener(object):
    """
    This listener is used to get the params for a function.
    """
    def __init__(self):
        self.param_possibilities = []

    def execute(self, params):
        self.param_possibilities += params


@debug.increase_indent
def search_params(evaluator, param):
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
    if not settings.dynamic_params:
        return []

    func = param.get_parent_until(tree.Function)
    debug.dbg('Dynamic param search for %s in %s.', param, str(func.name))
    # Compare the param names.
    names = [n for n in search_function_call(evaluator, func)
             if n.value == param.name.value]
    # Evaluate the ExecutedParams to types.
    result = list(chain.from_iterable(n.parent.eval(evaluator) for n in names))
    debug.dbg('Dynamic param result %s', result)
    return result


@memoize_default([], evaluator_is_first_arg=True)
def search_function_call(evaluator, func):
    """
    Returns a list of param names.
    """
    from jedi.evaluate import representation as er

    def get_params_for_module(module):
        """
        Returns the values of a param, or an empty array.
        """
        @memoize_default([], evaluator_is_first_arg=True)
        def get_posibilities(evaluator, module, func_name):
            try:
                names = module.used_names[func_name]
            except KeyError:
                return []

            for name in names:
                parent = name.parent
                if tree.is_node(parent, 'trailer'):
                    parent = parent.parent

                trailer = None
                if tree.is_node(parent, 'power'):
                    for t in parent.children[1:]:
                        if t == '**':
                            break
                        if t.start_pos > name.start_pos and t.children[0] == '(':
                            trailer = t
                            break
                if trailer is not None:
                    types = evaluator.goto_definition(name)

                    # We have to remove decorators, because they are not the
                    # "original" functions, this way we can easily compare.
                    # At the same time we also have to remove InstanceElements.
                    undec = []
                    for escope in types:
                        if escope.isinstance(er.Function, er.Instance) \
                                and escope.decorates is not None:
                            undec.append(escope.decorates)
                        elif isinstance(escope, er.InstanceElement):
                            undec.append(escope.var)
                        else:
                            undec.append(escope)

                    if evaluator.wrap(compare) in undec:
                        # Only if we have the correct function we execute
                        # it, otherwise just ignore it.
                        evaluator.eval_trailer(types, trailer)
            return listener.param_possibilities
        return get_posibilities(evaluator, module, func_name)

    current_module = func.get_parent_until()
    func_name = unicode(func.name)
    compare = func
    if func_name == '__init__':
        cls = func.get_parent_scope()
        if isinstance(cls, tree.Class):
            func_name = unicode(cls.name)
            compare = cls

    # add the listener
    listener = ParamListener()
    func.listeners.add(listener)

    try:
        result = []
        # This is like backtracking: Get the first possible result.
        for mod in imports.get_modules_containing_name(evaluator, [current_module], func_name):
            result = get_params_for_module(mod)
            if result:
                break
    finally:
        # cleanup: remove the listener; important: should not stick.
        func.listeners.remove(listener)

    return result
