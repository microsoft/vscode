"""
Recursions are the recipe of |jedi| to conquer Python code. However, someone
must stop recursions going mad. Some settings are here to make |jedi| stop at
the right time. You can read more about them :ref:`here <settings-recursion>`.

Next to :mod:`jedi.evaluate.cache` this module also makes |jedi| not
thread-safe. Why?  ``execution_recursion_decorator`` uses class variables to
count the function calls.
"""
from jedi import debug
from jedi import settings
from jedi.evaluate import compiled
from jedi.evaluate import iterable


def recursion_decorator(func):
    def run(evaluator, stmt, *args, **kwargs):
        rec_detect = evaluator.recursion_detector
        # print stmt, len(self.node_statements())
        if rec_detect.push_stmt(stmt):
            return []
        else:
            result = func(evaluator, stmt, *args, **kwargs)
            rec_detect.pop_stmt()
        return result
    return run


class RecursionDetector(object):
    """
    A decorator to detect recursions in statements. In a recursion a statement
    at the same place, in the same module may not be executed two times.
    """
    def __init__(self):
        self.top = None
        self.current = None

    def push_stmt(self, stmt):
        self.current = _RecursionNode(stmt, self.current)
        check = self._check_recursion()
        if check:
            debug.warning('catched stmt recursion: %s against %s @%s', stmt,
                          check.stmt, stmt.start_pos)
            self.pop_stmt()
            return True
        return False

    def pop_stmt(self):
        if self.current is not None:
            # I don't know how current can be None, but sometimes it happens
            # with Python3.
            self.current = self.current.parent

    def _check_recursion(self):
        test = self.current
        while True:
            test = test.parent
            if self.current == test:
                return test
            if not test:
                return False

    def node_statements(self):
        result = []
        n = self.current
        while n:
            result.insert(0, n.stmt)
            n = n.parent
        return result


class _RecursionNode(object):
    """ A node of the RecursionDecorator. """
    def __init__(self, stmt, parent):
        self.script = stmt.get_parent_until()
        self.position = stmt.start_pos
        self.parent = parent
        self.stmt = stmt

        # Don't check param instances, they are not causing recursions
        # The same's true for the builtins, because the builtins are really
        # simple.
        self.is_ignored = self.script == compiled.builtin

    def __eq__(self, other):
        if not other:
            return None

        return self.script == other.script \
            and self.position == other.position \
            and not self.is_ignored and not other.is_ignored


def execution_recursion_decorator(func):
    def run(execution, **kwargs):
        detector = execution._evaluator.execution_recursion_detector
        if detector.push_execution(execution):
            result = []
        else:
            result = func(execution, **kwargs)
        detector.pop_execution()
        return result

    return run


class ExecutionRecursionDetector(object):
    """
    Catches recursions of executions.
    It is designed like a Singelton. Only one instance should exist.
    """
    def __init__(self):
        self.recursion_level = 0
        self.parent_execution_funcs = []
        self.execution_funcs = set()
        self.execution_count = 0

    def __call__(self, execution):
        debug.dbg('Execution recursions: %s', execution, self.recursion_level,
                  self.execution_count, len(self.execution_funcs))
        if self.check_recursion(execution):
            result = []
        else:
            result = self.func(execution)
        self.pop_execution()
        return result

    def pop_execution(cls):
        cls.parent_execution_funcs.pop()
        cls.recursion_level -= 1

    def push_execution(cls, execution):
        in_par_execution_funcs = execution.base in cls.parent_execution_funcs
        in_execution_funcs = execution.base in cls.execution_funcs
        cls.recursion_level += 1
        cls.execution_count += 1
        cls.execution_funcs.add(execution.base)
        cls.parent_execution_funcs.append(execution.base)

        if cls.execution_count > settings.max_executions:
            return True

        if isinstance(execution.base, (iterable.Array, iterable.Generator)):
            return False
        module = execution.get_parent_until()
        if module == compiled.builtin:
            return False

        if in_par_execution_funcs:
            if cls.recursion_level > settings.max_function_recursion_level:
                return True
        if in_execution_funcs and \
                len(cls.execution_funcs) > settings.max_until_execution_unique:
            return True
        if cls.execution_count > settings.max_executions_without_builtins:
            return True
        return False
