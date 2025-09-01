"""
Recursions are the recipe of |jedi| to conquer Python code. However, someone
must stop recursions going mad. Some settings are here to make |jedi| stop at
the right time. You can read more about them :ref:`here <settings-recursion>`.

Next to the internal ``jedi.inference.cache`` this module also makes |jedi| not
thread-safe, because ``execution_recursion_decorator`` uses class variables to
count the function calls.

.. _settings-recursion:

Settings
~~~~~~~~~~

Recursion settings are important if you don't want extremely
recursive python code to go absolutely crazy.

The default values are based on experiments while completing the |jedi| library
itself (inception!). But I don't think there's any other Python library that
uses recursion in a similarly extreme way. Completion should also be fast and
therefore the quality might not always be maximal.

.. autodata:: recursion_limit
.. autodata:: total_function_execution_limit
.. autodata:: per_function_execution_limit
.. autodata:: per_function_recursion_limit
"""

from contextlib import contextmanager

from jedi import debug
from erdos._vendor.jedi.inference.base_value import NO_VALUES


recursion_limit = 15
"""
Like :func:`sys.getrecursionlimit()`, just for |jedi|.
"""
total_function_execution_limit = 200
"""
This is a hard limit of how many non-builtin functions can be executed.
"""
per_function_execution_limit = 6
"""
The maximal amount of times a specific function may be executed.
"""
per_function_recursion_limit = 2
"""
A function may not be executed more than this number of times recursively.
"""


class RecursionDetector:
    def __init__(self):
        self.pushed_nodes = []


@contextmanager
def execution_allowed(inference_state, node):
    """
    A decorator to detect recursions in statements. In a recursion a statement
    at the same place, in the same module may not be executed two times.
    """
    pushed_nodes = inference_state.recursion_detector.pushed_nodes

    if node in pushed_nodes:
        debug.warning('catched stmt recursion: %s @%s', node,
                      getattr(node, 'start_pos', None))
        yield False
    else:
        try:
            pushed_nodes.append(node)
            yield True
        finally:
            pushed_nodes.pop()


def execution_recursion_decorator(default=NO_VALUES):
    def decorator(func):
        def wrapper(self, **kwargs):
            detector = self.inference_state.execution_recursion_detector
            limit_reached = detector.push_execution(self)
            try:
                if limit_reached:
                    result = default
                else:
                    result = func(self, **kwargs)
            finally:
                detector.pop_execution()
            return result
        return wrapper
    return decorator


class ExecutionRecursionDetector:
    """
    Catches recursions of executions.
    """
    def __init__(self, inference_state):
        self._inference_state = inference_state

        self._recursion_level = 0
        self._parent_execution_funcs = []
        self._funcdef_execution_counts = {}
        self._execution_count = 0

    def pop_execution(self):
        self._parent_execution_funcs.pop()
        self._recursion_level -= 1

    def push_execution(self, execution):
        funcdef = execution.tree_node

        # These two will be undone in pop_execution.
        self._recursion_level += 1
        self._parent_execution_funcs.append(funcdef)

        module_context = execution.get_root_context()

        if module_context.is_builtins_module():
            # We have control over builtins so we know they are not recursing
            # like crazy. Therefore we just let them execute always, because
            # they usually just help a lot with getting good results.
            return False

        if self._recursion_level > recursion_limit:
            debug.warning('Recursion limit (%s) reached', recursion_limit)
            return True

        if self._execution_count >= total_function_execution_limit:
            debug.warning('Function execution limit (%s) reached', total_function_execution_limit)
            return True
        self._execution_count += 1

        if self._funcdef_execution_counts.setdefault(funcdef, 0) >= per_function_execution_limit:
            if module_context.py__name__() == 'typing':
                return False
            debug.warning(
                'Per function execution limit (%s) reached: %s',
                per_function_execution_limit,
                funcdef
            )
            return True
        self._funcdef_execution_counts[funcdef] += 1

        if self._parent_execution_funcs.count(funcdef) > per_function_recursion_limit:
            debug.warning(
                'Per function recursion limit (%s) reached: %s',
                per_function_recursion_limit,
                funcdef
            )
            return True
        return False
