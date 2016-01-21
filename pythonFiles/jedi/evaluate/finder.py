"""
Searching for names with given scope and name. This is very central in Jedi and
Python. The name resolution is quite complicated with descripter,
``__getattribute__``, ``__getattr__``, ``global``, etc.

Flow checks
+++++++++++

Flow checks are not really mature. There's only a check for ``isinstance``.  It
would check whether a flow has the form of ``if isinstance(a, type_or_tuple)``.
Unfortunately every other thing is being ignored (e.g. a == '' would be easy to
check for -> a is a string). There's big potential in these checks.
"""
from itertools import chain

from jedi._compatibility import unicode, u
from jedi.parser import tree
from jedi import debug
from jedi import common
from jedi import settings
from jedi.evaluate import representation as er
from jedi.evaluate import dynamic
from jedi.evaluate import compiled
from jedi.evaluate import docstrings
from jedi.evaluate import iterable
from jedi.evaluate import imports
from jedi.evaluate import analysis
from jedi.evaluate import flow_analysis
from jedi.evaluate import param
from jedi.evaluate import helpers
from jedi.evaluate.cache import memoize_default


def filter_after_position(names, position):
    """
    Removes all names after a certain position. If position is None, just
    returns the names list.
    """
    if position is None:
        return names

    names_new = []
    for n in names:
        # Filter positions and also allow list comprehensions and lambdas.
        if n.start_pos[0] is not None and n.start_pos < position \
                or isinstance(n.get_definition(), (tree.CompFor, tree.Lambda)):
            names_new.append(n)
    return names_new


def filter_definition_names(names, origin, position=None):
    """
    Filter names that are actual definitions in a scope. Names that are just
    used will be ignored.
    """
    # Just calculate the scope from the first
    stmt = names[0].get_definition()
    scope = stmt.get_parent_scope()

    if not (isinstance(scope, er.FunctionExecution)
            and isinstance(scope.base, er.LambdaWrapper)):
        names = filter_after_position(names, position)
    names = [name for name in names if name.is_definition()]

    # Private name mangling (compile.c) disallows access on names
    # preceeded by two underscores `__` if used outside of the class. Names
    # that also end with two underscores (e.g. __id__) are not affected.
    for name in list(names):
        if name.value.startswith('__') and not name.value.endswith('__'):
            if filter_private_variable(scope, origin):
                names.remove(name)
    return names


class NameFinder(object):
    def __init__(self, evaluator, scope, name_str, position=None):
        self._evaluator = evaluator
        # Make sure that it's not just a syntax tree node.
        self.scope = evaluator.wrap(scope)
        self.name_str = name_str
        self.position = position

    @debug.increase_indent
    def find(self, scopes, search_global=False):
        # TODO rename scopes to names_dicts
        names = self.filter_name(scopes)
        types = self._names_to_types(names, search_global)

        if not names and not types \
                and not (isinstance(self.name_str, tree.Name)
                         and isinstance(self.name_str.parent.parent, tree.Param)):
            if not isinstance(self.name_str, (str, unicode)):  # TODO Remove?
                if search_global:
                    message = ("NameError: name '%s' is not defined."
                               % self.name_str)
                    analysis.add(self._evaluator, 'name-error', self.name_str,
                                 message)
                else:
                    analysis.add_attribute_error(self._evaluator,
                                                 self.scope, self.name_str)

        debug.dbg('finder._names_to_types: %s -> %s', names, types)
        return types

    def scopes(self, search_global=False):
        if search_global:
            return global_names_dict_generator(self._evaluator, self.scope, self.position)
        else:
            return ((n, None) for n in self.scope.names_dicts(search_global))

    def names_dict_lookup(self, names_dict, position):
        def get_param(scope, el):
            if isinstance(el.get_parent_until(tree.Param), tree.Param):
                return scope.param_by_name(str(el))
            return el

        search_str = str(self.name_str)
        try:
            names = names_dict[search_str]
            if not names:  # We want names, otherwise stop.
                return []
        except KeyError:
            return []

        names = filter_definition_names(names, self.name_str, position)

        name_scope = None
        # Only the names defined in the last position are valid definitions.
        last_names = []
        for name in reversed(sorted(names, key=lambda name: name.start_pos)):
            stmt = name.get_definition()
            name_scope = self._evaluator.wrap(stmt.get_parent_scope())

            if isinstance(self.scope, er.Instance) and not isinstance(name_scope, er.Instance):
                # Instances should not be checked for positioning, because we
                # don't know in which order the functions are called.
                last_names.append(name)
                continue

            if isinstance(name_scope, compiled.CompiledObject):
                # Let's test this. TODO need comment. shouldn't this be
                # filtered before?
                last_names.append(name)
                continue

            if isinstance(name, compiled.CompiledName) \
                    or isinstance(name, er.InstanceName) and isinstance(name._origin_name, compiled.CompiledName):
                last_names.append(name)
                continue

            if isinstance(self.name_str, tree.Name):
                origin_scope = self.name_str.get_parent_until(tree.Scope, reverse=True)
            else:
                origin_scope = None
            if isinstance(stmt.parent, compiled.CompiledObject):
                # TODO seriously? this is stupid.
                continue
            check = flow_analysis.break_check(self._evaluator, name_scope,
                                              stmt, origin_scope)
            if check is not flow_analysis.UNREACHABLE:
                last_names.append(name)
            if check is flow_analysis.REACHABLE:
                break

        if isinstance(name_scope, er.FunctionExecution):
            # Replace params
            return [get_param(name_scope, n) for n in last_names]
        return last_names

    def filter_name(self, names_dicts):
        """
        Searches names that are defined in a scope (the different
        `names_dicts`), until a name fits.
        """
        names = []
        for names_dict, position in names_dicts:
            names = self.names_dict_lookup(names_dict, position)
            if names:
                break

        debug.dbg('finder.filter_name "%s" in (%s): %s@%s', self.name_str,
                  self.scope, u(names), self.position)
        return list(self._clean_names(names))

    def _clean_names(self, names):
        """
        ``NameFinder.filter_name`` should only output names with correct
        wrapper parents. We don't want to see AST classes out in the
        evaluation, so remove them already here!
        """
        for n in names:
            definition = n.parent
            if isinstance(definition, (tree.Function, tree.Class, tree.Module)):
                yield self._evaluator.wrap(definition).name
            else:
                yield n

    def _check_getattr(self, inst):
        """Checks for both __getattr__ and __getattribute__ methods"""
        result = []
        # str is important, because it shouldn't be `Name`!
        name = compiled.create(self._evaluator, str(self.name_str))
        with common.ignored(KeyError):
            result = inst.execute_subscope_by_name('__getattr__', name)
        if not result:
            # this is a little bit special. `__getattribute__` is executed
            # before anything else. But: I know no use case, where this
            # could be practical and the jedi would return wrong types. If
            # you ever have something, let me know!
            with common.ignored(KeyError):
                result = inst.execute_subscope_by_name('__getattribute__', name)
        return result

    def _names_to_types(self, names, search_global):
        types = []

        # Add isinstance and other if/assert knowledge.
        if isinstance(self.name_str, tree.Name):
            # Ignore FunctionExecution parents for now.
            flow_scope = self.name_str
            until = flow_scope.get_parent_until(er.FunctionExecution)
            while not isinstance(until, er.FunctionExecution):
                flow_scope = flow_scope.get_parent_scope(include_flows=True)
                if flow_scope is None:
                    break
                # TODO check if result is in scope -> no evaluation necessary
                n = check_flow_information(self._evaluator, flow_scope,
                                           self.name_str, self.position)
                if n:
                    return n

        for name in names:
            new_types = _name_to_types(self._evaluator, name, self.scope)
            if isinstance(self.scope, (er.Class, er.Instance)) and not search_global:
                types += self._resolve_descriptors(name, new_types)
            else:
                types += new_types
        if not names and isinstance(self.scope, er.Instance):
            # handling __getattr__ / __getattribute__
            types = self._check_getattr(self.scope)

        return types

    def _resolve_descriptors(self, name, types):
        # The name must not be in the dictionary, but part of the class
        # definition. __get__ is only called if the descriptor is defined in
        # the class dictionary.
        name_scope = name.get_definition().get_parent_scope()
        if not isinstance(name_scope, (er.Instance, tree.Class)):
            return types

        result = []
        for r in types:
            try:
                desc_return = r.get_descriptor_returns
            except AttributeError:
                result.append(r)
            else:
                result += desc_return(self.scope)
        return result


@memoize_default([], evaluator_is_first_arg=True)
def _name_to_types(evaluator, name, scope):
    types = []
    typ = name.get_definition()
    if typ.isinstance(tree.ForStmt):
        for_types = evaluator.eval_element(typ.children[3])
        for_types = iterable.get_iterator_types(for_types)
        types += check_tuple_assignments(for_types, name)
    elif typ.isinstance(tree.CompFor):
        for_types = evaluator.eval_element(typ.children[3])
        for_types = iterable.get_iterator_types(for_types)
        types += check_tuple_assignments(for_types, name)
    elif isinstance(typ, tree.Param):
        types += _eval_param(evaluator, typ, scope)
    elif typ.isinstance(tree.ExprStmt):
        types += _remove_statements(evaluator, typ, name)
    elif typ.isinstance(tree.WithStmt):
        types += evaluator.eval_element(typ.node_from_name(name))
    elif isinstance(typ, tree.Import):
        types += imports.ImportWrapper(evaluator, name).follow()
    elif isinstance(typ, tree.GlobalStmt):
        # TODO theoretically we shouldn't be using search_global here, it
        # doesn't make sense, because it's a local search (for that name)!
        # However, globals are not that important and resolving them doesn't
        # guarantee correctness in any way, because we don't check for when
        # something is executed.
        types += evaluator.find_types(typ.get_parent_scope(), str(name),
                                      search_global=True)
    elif isinstance(typ, tree.TryStmt):
        # TODO an exception can also be a tuple. Check for those.
        # TODO check for types that are not classes and add it to
        # the static analysis report.
        exceptions = evaluator.eval_element(name.prev_sibling().prev_sibling())
        types = list(chain.from_iterable(
                     evaluator.execute(t) for t in exceptions))
    else:
        if typ.isinstance(er.Function):
            typ = typ.get_decorated_func()
        types.append(typ)
    return types


def _remove_statements(evaluator, stmt, name):
    """
    This is the part where statements are being stripped.

    Due to lazy evaluation, statements like a = func; b = a; b() have to be
    evaluated.
    """
    types = []
    # Remove the statement docstr stuff for now, that has to be
    # implemented with the evaluator class.
    #if stmt.docstr:
        #res_new.append(stmt)

    check_instance = None
    if isinstance(stmt, er.InstanceElement) and stmt.is_class_var:
        check_instance = stmt.instance
        stmt = stmt.var

    types += evaluator.eval_statement(stmt, seek_name=name)

    if check_instance is not None:
        # class renames
        types = [er.get_instance_el(evaluator, check_instance, a, True)
                 if isinstance(a, (er.Function, tree.Function))
                 else a for a in types]
    return types


def _eval_param(evaluator, param, scope):
    res_new = []
    func = param.get_parent_scope()

    cls = func.parent.get_parent_until((tree.Class, tree.Function))

    from jedi.evaluate.param import ExecutedParam, Arguments
    if isinstance(cls, tree.Class) and param.position_nr == 0 \
            and not isinstance(param, ExecutedParam):
        # This is where we add self - if it has never been
        # instantiated.
        if isinstance(scope, er.InstanceElement):
            res_new.append(scope.instance)
        else:
            inst = er.Instance(evaluator, evaluator.wrap(cls),
                               Arguments(evaluator, ()), is_generated=True)
            res_new.append(inst)
        return res_new

    # Instances are typically faked, if the instance is not called from
    # outside. Here we check it for __init__ functions and return.
    if isinstance(func, er.InstanceElement) \
            and func.instance.is_generated and str(func.name) == '__init__':
        param = func.var.params[param.position_nr]

    # Add docstring knowledge.
    doc_params = docstrings.follow_param(evaluator, param)
    if doc_params:
        return doc_params

    if isinstance(param, ExecutedParam):
        return res_new + param.eval(evaluator)
    else:
        # Param owns no information itself.
        res_new += dynamic.search_params(evaluator, param)
        if not res_new:
            if param.stars:
                t = 'tuple' if param.stars == 1 else 'dict'
                typ = evaluator.find_types(compiled.builtin, t)[0]
                res_new = evaluator.execute(typ)
        if param.default:
            res_new += evaluator.eval_element(param.default)
        return res_new


def check_flow_information(evaluator, flow, search_name, pos):
    """ Try to find out the type of a variable just with the information that
    is given by the flows: e.g. It is also responsible for assert checks.::

        if isinstance(k, str):
            k.  # <- completion here

    ensures that `k` is a string.
    """
    if not settings.dynamic_flow_information:
        return None

    result = []
    if flow.is_scope():
        # Check for asserts.
        try:
            names = reversed(flow.names_dict[search_name.value])
        except (KeyError, AttributeError):
            names = []

        for name in names:
            ass = name.get_parent_until(tree.AssertStmt)
            if isinstance(ass, tree.AssertStmt) and pos is not None and ass.start_pos < pos:
                result = _check_isinstance_type(evaluator, ass.assertion(), search_name)
                if result:
                    break

    if isinstance(flow, (tree.IfStmt, tree.WhileStmt)):
        element = flow.children[1]
        result = _check_isinstance_type(evaluator, element, search_name)
    return result


def _check_isinstance_type(evaluator, element, search_name):
    try:
        assert element.type == 'power'
        # this might be removed if we analyze and, etc
        assert len(element.children) == 2
        first, trailer = element.children
        assert isinstance(first, tree.Name) and first.value == 'isinstance'
        assert trailer.type == 'trailer' and trailer.children[0] == '('
        assert len(trailer.children) == 3

        # arglist stuff
        arglist = trailer.children[1]
        args = param.Arguments(evaluator, arglist, trailer)
        lst = list(args.unpack())
        # Disallow keyword arguments
        assert len(lst) == 2 and lst[0][0] is None and lst[1][0] is None
        name = lst[0][1][0]  # first argument, values, first value
        # Do a simple get_code comparison. They should just have the same code,
        # and everything will be all right.
        classes = lst[1][1][0]
        call = helpers.call_of_name(search_name)
        assert name.get_code() == call.get_code()
    except AssertionError:
        return []

    result = []
    for typ in evaluator.eval_element(classes):
        for typ in (typ.values() if isinstance(typ, iterable.Array) else [typ]):
            result += evaluator.execute(typ)
    return result


def global_names_dict_generator(evaluator, scope, position):
    """
    For global name lookups. Yields tuples of (names_dict, position). If the
    position is None, the position does not matter anymore in that scope.

    This function is used to include names from outer scopes. For example, when
    the current scope is function:

    >>> from jedi._compatibility import u, no_unicode_pprint
    >>> from jedi.parser import Parser, load_grammar
    >>> parser = Parser(load_grammar(), u('''
    ... x = ['a', 'b', 'c']
    ... def func():
    ...     y = None
    ... '''))
    >>> scope = parser.module.subscopes[0]
    >>> scope
    <Function: func@3-5>

    `global_names_dict_generator` is a generator.  First it yields names from
    most inner scope.

    >>> from jedi.evaluate import Evaluator
    >>> evaluator = Evaluator(load_grammar())
    >>> scope = evaluator.wrap(scope)
    >>> pairs = list(global_names_dict_generator(evaluator, scope, (4, 0)))
    >>> no_unicode_pprint(pairs[0])
    ({'func': [], 'y': [<Name: y@4,4>]}, (4, 0))

    Then it yields the names from one level "lower". In this example, this
    is the most outer scope. As you can see, the position in the tuple is now
    None, because typically the whole module is loaded before the function is
    called.

    >>> no_unicode_pprint(pairs[1])
    ({'func': [<Name: func@3,4>], 'x': [<Name: x@2,0>]}, None)

    After that we have a few underscore names that are part of the module.

    >>> sorted(pairs[2][0].keys())
    ['__doc__', '__file__', '__name__', '__package__']
    >>> pairs[3]  # global names -> there are none in our example.
    ({}, None)
    >>> pairs[4]  # package modules -> Also none.
    ({}, None)

    Finally, it yields names from builtin, if `include_builtin` is
    true (default).

    >>> pairs[5][0].values()                              #doctest: +ELLIPSIS
    [[<CompiledName: ...>], ...]
    """
    in_func = False
    while scope is not None:
        if not (scope.type == 'classdef' and in_func):
            # Names in methods cannot be resolved within the class.

            for names_dict in scope.names_dicts(True):
                yield names_dict, position
            if scope.type == 'funcdef':
                # The position should be reset if the current scope is a function.
                in_func = True
                position = None
        scope = evaluator.wrap(scope.get_parent_scope())

    # Add builtins to the global scope.
    for names_dict in compiled.builtin.names_dicts(True):
        yield names_dict, None


def check_tuple_assignments(types, name):
    """
    Checks if tuples are assigned.
    """
    for index in name.assignment_indexes():
        new_types = []
        for r in types:
            try:
                func = r.get_exact_index_types
            except AttributeError:
                debug.warning("Invalid tuple lookup #%s of result %s in %s",
                              index, types, name)
            else:
                try:
                    new_types += func(index)
                except IndexError:
                    pass
        types = new_types
    return types


def filter_private_variable(scope, origin_node):
    """Check if a variable is defined inside the same class or outside."""
    instance = scope.get_parent_scope()
    coming_from = origin_node
    while coming_from is not None \
            and not isinstance(coming_from, (tree.Class, compiled.CompiledObject)):
        coming_from = coming_from.get_parent_scope()

    # CompiledObjects don't have double underscore attributes, but Jedi abuses
    # those for fakes (builtins.pym -> list).
    if isinstance(instance, compiled.CompiledObject):
        return instance != coming_from
    else:
        return isinstance(instance, er.Instance) and instance.base.base != coming_from
