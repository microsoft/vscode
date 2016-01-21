"""
Evaluation of Python code in |jedi| is based on three assumptions:

* The code uses as least side effects as possible. Jedi understands certain
  list/tuple/set modifications, but there's no guarantee that Jedi detects
  everything (list.append in different modules for example).
* No magic is being used:

  - metaclasses
  - ``setattr()`` / ``__import__()``
  - writing to ``globals()``, ``locals()``, ``object.__dict__``
* The programmer is not a total dick, e.g. like `this
  <https://github.com/davidhalter/jedi/issues/24>`_ :-)

The actual algorithm is based on a principle called lazy evaluation. If you
don't know about it, google it.  That said, the typical entry point for static
analysis is calling ``eval_statement``. There's separate logic for
autocompletion in the API, the evaluator is all about evaluating an expression.

Now you need to understand what follows after ``eval_statement``. Let's
make an example::

    import datetime
    datetime.date.toda# <-- cursor here

First of all, this module doesn't care about completion. It really just cares
about ``datetime.date``. At the end of the procedure ``eval_statement`` will
return the ``date`` class.

To *visualize* this (simplified):

- ``Evaluator.eval_statement`` doesn't do much, because there's no assignment.
- ``Evaluator.eval_element`` cares for resolving the dotted path
- ``Evaluator.find_types`` searches for global definitions of datetime, which
  it finds in the definition of an import, by scanning the syntax tree.
- Using the import logic, the datetime module is found.
- Now ``find_types`` is called again by ``eval_element`` to find ``date``
  inside the datetime module.

Now what would happen if we wanted ``datetime.date.foo.bar``? Two more
calls to ``find_types``. However the second call would be ignored, because the
first one would return nothing (there's no foo attribute in ``date``).

What if the import would contain another ``ExprStmt`` like this::

    from foo import bar
    Date = bar.baz

Well... You get it. Just another ``eval_statement`` recursion. It's really
easy. Python can obviously get way more complicated then this. To understand
tuple assignments, list comprehensions and everything else, a lot more code had
to be written.

Jedi has been tested very well, so you can just start modifying code. It's best
to write your own test first for your "new" feature. Don't be scared of
breaking stuff. As long as the tests pass, you're most likely to be fine.

I need to mention now that lazy evaluation is really good because it
only *evaluates* what needs to be *evaluated*. All the statements and modules
that are not used are just being ignored.
"""

import copy
from itertools import chain

from jedi.parser import tree
from jedi import debug
from jedi.evaluate import representation as er
from jedi.evaluate import imports
from jedi.evaluate import recursion
from jedi.evaluate import iterable
from jedi.evaluate.cache import memoize_default
from jedi.evaluate import stdlib
from jedi.evaluate import finder
from jedi.evaluate import compiled
from jedi.evaluate import precedence
from jedi.evaluate import param
from jedi.evaluate import helpers


class Evaluator(object):
    def __init__(self, grammar):
        self.grammar = grammar
        self.memoize_cache = {}  # for memoize decorators
        # To memorize modules -> equals `sys.modules`.
        self.modules = {}  # like `sys.modules`.
        self.compiled_cache = {}  # see `compiled.create()`
        self.recursion_detector = recursion.RecursionDetector()
        self.execution_recursion_detector = recursion.ExecutionRecursionDetector()
        self.analysis = []

    def wrap(self, element):
        if isinstance(element, tree.Class):
            return er.Class(self, element)
        elif isinstance(element, tree.Function):
            if isinstance(element, tree.Lambda):
                return er.LambdaWrapper(self, element)
            else:
                return er.Function(self, element)
        elif isinstance(element, (tree.Module)) \
                and not isinstance(element, er.ModuleWrapper):
            return er.ModuleWrapper(self, element)
        else:
            return element

    def find_types(self, scope, name_str, position=None, search_global=False,
                   is_goto=False):
        """
        This is the search function. The most important part to debug.
        `remove_statements` and `filter_statements` really are the core part of
        this completion.

        :param position: Position of the last statement -> tuple of line, column
        :return: List of Names. Their parents are the types.
        """
        f = finder.NameFinder(self, scope, name_str, position)
        scopes = f.scopes(search_global)
        if is_goto:
            return f.filter_name(scopes)
        return f.find(scopes, search_global)

    @memoize_default(default=[], evaluator_is_first_arg=True)
    @recursion.recursion_decorator
    @debug.increase_indent
    def eval_statement(self, stmt, seek_name=None):
        """
        The starting point of the completion. A statement always owns a call
        list, which are the calls, that a statement does. In case multiple
        names are defined in the statement, `seek_name` returns the result for
        this name.

        :param stmt: A `tree.ExprStmt`.
        """
        debug.dbg('eval_statement %s (%s)', stmt, seek_name)
        types = self.eval_element(stmt.get_rhs())

        if seek_name:
            types = finder.check_tuple_assignments(types, seek_name)

        first_operation = stmt.first_operation()
        if first_operation not in ('=', None) and not isinstance(stmt, er.InstanceElement):  # TODO don't check for this.
            # `=` is always the last character in aug assignments -> -1
            operator = copy.copy(first_operation)
            operator.value = operator.value[:-1]
            name = str(stmt.get_defined_names()[0])
            parent = self.wrap(stmt.get_parent_scope())
            left = self.find_types(parent, name, stmt.start_pos, search_global=True)
            if isinstance(stmt.get_parent_until(tree.ForStmt), tree.ForStmt):
                # Iterate through result and add the values, that's possible
                # only in for loops without clutter, because they are
                # predictable.
                for r in types:
                    left = precedence.calculate(self, left, operator, [r])
                types = left
            else:
                types = precedence.calculate(self, left, operator, types)
        debug.dbg('eval_statement result %s', types)
        return types

    @memoize_default(evaluator_is_first_arg=True)
    def eval_element(self, element):
        if isinstance(element, iterable.AlreadyEvaluated):
            return list(element)
        elif isinstance(element, iterable.MergedNodes):
            return iterable.unite(self.eval_element(e) for e in element)

        debug.dbg('eval_element %s@%s', element, element.start_pos)
        if isinstance(element, (tree.Name, tree.Literal)) or tree.is_node(element, 'atom'):
            return self._eval_atom(element)
        elif isinstance(element, tree.Keyword):
            # For False/True/None
            if element.value in ('False', 'True', 'None'):
                return [compiled.builtin.get_by_name(element.value)]
            else:
                return []
        elif element.isinstance(tree.Lambda):
            return [er.LambdaWrapper(self, element)]
        elif element.isinstance(er.LambdaWrapper):
            return [element]  # TODO this is no real evaluation.
        elif element.type == 'expr_stmt':
            return self.eval_statement(element)
        elif element.type == 'power':
            types = self._eval_atom(element.children[0])
            for trailer in element.children[1:]:
                if trailer == '**':  # has a power operation.
                    raise NotImplementedError
                types = self.eval_trailer(types, trailer)

            return types
        elif element.type in ('testlist_star_expr', 'testlist',):
            # The implicit tuple in statements.
            return [iterable.ImplicitTuple(self, element)]
        elif element.type in ('not_test', 'factor'):
            types = self.eval_element(element.children[-1])
            for operator in element.children[:-1]:
                types = list(precedence.factor_calculate(self, types, operator))
            return types
        elif element.type == 'test':
            # `x if foo else y` case.
            return (self.eval_element(element.children[0]) +
                    self.eval_element(element.children[-1]))
        elif element.type == 'operator':
            # Must be an ellipsis, other operators are not evaluated.
            return []  # Ignore for now.
        elif element.type == 'dotted_name':
            types = self._eval_atom(element.children[0])
            for next_name in element.children[2::2]:
                types = list(chain.from_iterable(self.find_types(typ, next_name)
                                                 for typ in types))
            return types
        else:
            return precedence.calculate_children(self, element.children)

    def _eval_atom(self, atom):
        """
        Basically to process ``atom`` nodes. The parser sometimes doesn't
        generate the node (because it has just one child). In that case an atom
        might be a name or a literal as well.
        """
        if isinstance(atom, tree.Name):
            # This is the first global lookup.
            stmt = atom.get_definition()
            scope = stmt.get_parent_until(tree.IsScope, include_current=True)
            if isinstance(stmt, tree.CompFor):
                stmt = stmt.get_parent_until((tree.ClassOrFunc, tree.ExprStmt))
            if stmt.type != 'expr_stmt':
                # We only need to adjust the start_pos for statements, because
                # there the name cannot be used.
                stmt = atom
            return self.find_types(scope, atom, stmt.start_pos, search_global=True)
        elif isinstance(atom, tree.Literal):
            return [compiled.create(self, atom.eval())]
        else:
            c = atom.children
            # Parentheses without commas are not tuples.
            if c[0] == '(' and not len(c) == 2 \
                    and not(tree.is_node(c[1], 'testlist_comp')
                            and len(c[1].children) > 1):
                return self.eval_element(c[1])
            try:
                comp_for = c[1].children[1]
            except (IndexError, AttributeError):
                pass
            else:
                if isinstance(comp_for, tree.CompFor) and c[0] != '{':
                    return [iterable.Comprehension.from_atom(self, atom)]
            return [iterable.Array(self, atom)]

    def eval_trailer(self, types, trailer):
        trailer_op, node = trailer.children[:2]
        if node == ')':  # `arglist` is optional.
            node = ()
        new_types = []
        for typ in types:
            debug.dbg('eval_trailer: %s in scope %s', trailer, typ)
            if trailer_op == '.':
                new_types += self.find_types(typ, node)
            elif trailer_op == '(':
                new_types += self.execute(typ, node, trailer)
            elif trailer_op == '[':
                try:
                    get = typ.get_index_types
                except AttributeError:
                    debug.warning("TypeError: '%s' object is not subscriptable"
                                  % typ)
                else:
                    new_types += get(self, node)
        return new_types

    def execute_evaluated(self, obj, *args):
        """
        Execute a function with already executed arguments.
        """
        args = [iterable.AlreadyEvaluated([arg]) for arg in args]
        return self.execute(obj, args)

    @debug.increase_indent
    def execute(self, obj, arguments=(), trailer=None):
        if not isinstance(arguments, param.Arguments):
            arguments = param.Arguments(self, arguments, trailer)

        if obj.isinstance(er.Function):
            obj = obj.get_decorated_func()

        debug.dbg('execute: %s %s', obj, arguments)
        try:
            # Some stdlib functions like super(), namedtuple(), etc. have been
            # hard-coded in Jedi to support them.
            return stdlib.execute(self, obj, arguments)
        except stdlib.NotInStdLib:
            pass

        try:
            func = obj.py__call__
        except AttributeError:
            debug.warning("no execution possible %s", obj)
            return []
        else:
            types = func(self, arguments)
            debug.dbg('execute result: %s in %s', types, obj)
            return types

    def goto_definition(self, name):
        def_ = name.get_definition()
        if def_.type == 'expr_stmt' and name in def_.get_defined_names():
            return self.eval_statement(def_, name)
        call = helpers.call_of_name(name)
        return self.eval_element(call)

    def goto(self, name):
        def resolve_implicit_imports(names):
            for name in names:
                if isinstance(name.parent, helpers.FakeImport):
                    # Those are implicit imports.
                    s = imports.ImportWrapper(self, name)
                    for n in s.follow(is_goto=True):
                        yield n
                else:
                    yield name

        stmt = name.get_definition()
        par = name.parent
        if par.type == 'argument' and par.children[1] == '=' and par.children[0] == name:
            # Named param goto.
            trailer = par.parent
            if trailer.type == 'arglist':
                trailer = trailer.parent
            if trailer.type != 'classdef':
                if trailer.type == 'decorator':
                    types = self.eval_element(trailer.children[1])
                else:
                    i = trailer.parent.children.index(trailer)
                    to_evaluate = trailer.parent.children[:i]
                    types = self.eval_element(to_evaluate[0])
                    for trailer in to_evaluate[1:]:
                        types = self.eval_trailer(types, trailer)
                param_names = []
                for typ in types:
                    try:
                        params = typ.params
                    except AttributeError:
                        pass
                    else:
                        param_names += [param.name for param in params
                                        if param.name.value == name.value]
                return param_names
        elif isinstance(par, tree.ExprStmt) and name in par.get_defined_names():
            # Only take the parent, because if it's more complicated than just
            # a name it's something you can "goto" again.
            return [name]
        elif isinstance(par, (tree.Param, tree.Function, tree.Class)) and par.name is name:
            return [name]
        elif isinstance(stmt, tree.Import):
            modules = imports.ImportWrapper(self, name).follow(is_goto=True)
            return list(resolve_implicit_imports(modules))
        elif par.type == 'dotted_name':  # Is a decorator.
            index = par.children.index(name)
            if index > 0:
                new_dotted = helpers.deep_ast_copy(par)
                new_dotted.children[index - 1:] = []
                types = self.eval_element(new_dotted)
                return resolve_implicit_imports(iterable.unite(
                    self.find_types(typ, name, is_goto=True) for typ in types
                ))

        scope = name.get_parent_scope()
        if tree.is_node(name.parent, 'trailer'):
            call = helpers.call_of_name(name, cut_own_trailer=True)
            types = self.eval_element(call)
            return resolve_implicit_imports(iterable.unite(
                self.find_types(typ, name, is_goto=True) for typ in types
            ))
        else:
            if stmt.type != 'expr_stmt':
                # We only need to adjust the start_pos for statements, because
                # there the name cannot be used.
                stmt = name
            return self.find_types(scope, name, stmt.start_pos,
                                   search_global=True, is_goto=True)
