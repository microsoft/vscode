"""
TODO Some parts of this module are still not well documented.
"""
import inspect
import re

from jedi._compatibility import builtins
from jedi import debug
from jedi.common import source_to_unicode
from jedi.cache import underscore_memoization
from jedi.evaluate import compiled
from jedi.evaluate.compiled.fake import get_module
from jedi.parser import tree as pt
from jedi.parser import load_grammar
from jedi.parser.fast import FastParser
from jedi.evaluate import helpers
from jedi.evaluate import iterable
from jedi.evaluate import representation as er


def add_namespaces_to_parser(evaluator, namespaces, parser_module):
    for namespace in namespaces:
        for key, value in namespace.items():
            # Name lookups in an ast tree work by checking names_dict.
            # Therefore we just add fake names to that and we're done.
            arr = parser_module.names_dict.setdefault(key, [])
            arr.append(LazyName(evaluator, parser_module, key, value))


class LazyName(helpers.FakeName):
    def __init__(self, evaluator, module, name, value):
        super(LazyName, self).__init__(name)
        self._module = module
        self._evaluator = evaluator
        self._value = value
        self._name = name

    def is_definition(self):
        return True

    @property
    @underscore_memoization
    def parent(self):
        """
        Creating fake statements for the interpreter.
        """
        obj = self._value
        parser_path = []
        if inspect.ismodule(obj):
            module = obj
        else:
            names = []
            try:
                o = obj.__objclass__
                names.append(obj.__name__)
                obj = o
            except AttributeError:
                pass

            try:
                module_name = obj.__module__
                names.insert(0, obj.__name__)
            except AttributeError:
                # Unfortunately in some cases like `int` there's no __module__
                module = builtins
            else:
                # TODO this import is wrong. Yields x for x.y.z instead of z
                module = __import__(module_name)
            parser_path = names
        raw_module = get_module(self._value)

        found = []
        try:
            path = module.__file__
        except AttributeError:
            pass
        else:
            path = re.sub('c$', '', path)
            if path.endswith('.py'):
                # cut the `c` from `.pyc`
                with open(path) as f:
                    source = source_to_unicode(f.read())
                mod = FastParser(load_grammar(), source, path[:-1]).module
                if parser_path:
                    assert len(parser_path) == 1
                    found = self._evaluator.find_types(mod, parser_path[0], search_global=True)
                else:
                    found = [self._evaluator.wrap(mod)]

                if not found:
                    debug.warning('Possibly an interpreter lookup for Python code failed %s',
                                  parser_path)

        if not found:
            evaluated = compiled.CompiledObject(obj)
            if evaluated == builtins:
                # The builtins module is special and always cached.
                evaluated = compiled.builtin
            found = [evaluated]

        content = iterable.AlreadyEvaluated(found)
        stmt = pt.ExprStmt([self, pt.Operator(pt.zero_position_modifier,
                                              '=', (0, 0), ''), content])
        stmt.parent = self._module
        return stmt

    @parent.setter
    def parent(self, value):
        """Needed because the super class tries to set parent."""
