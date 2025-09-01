"""
This is the syntax tree for Python 3 syntaxes. The classes represent
syntax elements like functions and imports.

All of the nodes can be traced back to the `Python grammar file
<https://docs.python.org/3/reference/grammar.html>`_. If you want to know how
a tree is structured, just analyse that file (for each Python version it's a
bit different).

There's a lot of logic here that makes it easier for Jedi (and other libraries)
to deal with a Python syntax tree.

By using :py:meth:`parso.tree.NodeOrLeaf.get_code` on a module, you can get
back the 1-to-1 representation of the input given to the parser. This is
important if you want to refactor a parser tree.

>>> from parso import parse
>>> parser = parse('import os')
>>> module = parser.get_root_node()
>>> module
<Module: @1-1>

Any subclasses of :class:`Scope`, including :class:`Module` has an attribute
:attr:`iter_imports <Scope.iter_imports>`:

>>> list(module.iter_imports())
[<ImportName: import os@1,0>]

Changes to the Python Grammar
-----------------------------

A few things have changed when looking at Python grammar files:

- :class:`Param` does not exist in Python grammar files. It is essentially a
  part of a ``parameters`` node.  |parso| splits it up to make it easier to
  analyse parameters. However this just makes it easier to deal with the syntax
  tree, it doesn't actually change the valid syntax.
- A few nodes like `lambdef` and `lambdef_nocond` have been merged in the
  syntax tree to make it easier to do deal with them.

Parser Tree Classes
-------------------
"""

import re
try:
    from collections.abc import Mapping
except ImportError:
    from collections import Mapping
from typing import Tuple

from erdos._vendor.parso.tree import Node, BaseNode, Leaf, ErrorNode, ErrorLeaf, search_ancestor  # noqa
from erdos._vendor.parso.python.prefix import split_prefix
from erdos._vendor.parso.utils import split_lines

_FLOW_CONTAINERS = set(['if_stmt', 'while_stmt', 'for_stmt', 'try_stmt',
                        'with_stmt', 'async_stmt', 'suite'])
_RETURN_STMT_CONTAINERS = set(['suite', 'simple_stmt']) | _FLOW_CONTAINERS

_FUNC_CONTAINERS = set(
    ['suite', 'simple_stmt', 'decorated', 'async_funcdef']
) | _FLOW_CONTAINERS

_GET_DEFINITION_TYPES = set([
    'expr_stmt', 'sync_comp_for', 'with_stmt', 'for_stmt', 'import_name',
    'import_from', 'param', 'del_stmt', 'namedexpr_test',
])
_IMPORTS = set(['import_name', 'import_from'])


class DocstringMixin:
    __slots__ = ()

    def get_doc_node(self):
        """
        Returns the string leaf of a docstring. e.g. ``r'''foo'''``.
        """
        if self.type == 'file_input':
            node = self.children[0]
        elif self.type in ('funcdef', 'classdef'):
            node = self.children[self.children.index(':') + 1]
            if node.type == 'suite':  # Normally a suite
                node = node.children[1]  # -> NEWLINE stmt
        else:  # ExprStmt
            simple_stmt = self.parent
            c = simple_stmt.parent.children
            index = c.index(simple_stmt)
            if not index:
                return None
            node = c[index - 1]

        if node.type == 'simple_stmt':
            node = node.children[0]
        if node.type == 'string':
            return node
        return None


class PythonMixin:
    """
    Some Python specific utilities.
    """
    __slots__ = ()

    def get_name_of_position(self, position):
        """
        Given a (line, column) tuple, returns a :py:class:`Name` or ``None`` if
        there is no name at that position.
        """
        for c in self.children:
            if isinstance(c, Leaf):
                if c.type == 'name' and c.start_pos <= position <= c.end_pos:
                    return c
            else:
                result = c.get_name_of_position(position)
                if result is not None:
                    return result
        return None


class PythonLeaf(PythonMixin, Leaf):
    __slots__ = ()

    def _split_prefix(self):
        return split_prefix(self, self.get_start_pos_of_prefix())

    def get_start_pos_of_prefix(self):
        """
        Basically calls :py:meth:`parso.tree.NodeOrLeaf.get_start_pos_of_prefix`.
        """
        # TODO it is really ugly that we have to override it. Maybe change
        #   indent error leafs somehow? No idea how, though.
        previous_leaf = self.get_previous_leaf()
        if previous_leaf is not None and previous_leaf.type == 'error_leaf' \
                and previous_leaf.token_type in ('INDENT', 'DEDENT', 'ERROR_DEDENT'):
            previous_leaf = previous_leaf.get_previous_leaf()

        if previous_leaf is None:  # It's the first leaf.
            lines = split_lines(self.prefix)
            # + 1 is needed because split_lines always returns at least [''].
            return self.line - len(lines) + 1, 0  # It's the first leaf.
        return previous_leaf.end_pos


class _LeafWithoutNewlines(PythonLeaf):
    """
    Simply here to optimize performance.
    """
    __slots__ = ()

    @property
    def end_pos(self) -> Tuple[int, int]:
        return self.line, self.column + len(self.value)


# Python base classes
class PythonBaseNode(PythonMixin, BaseNode):
    __slots__ = ()


class PythonNode(PythonMixin, Node):
    __slots__ = ()


class PythonErrorNode(PythonMixin, ErrorNode):
    __slots__ = ()


class PythonErrorLeaf(ErrorLeaf, PythonLeaf):
    __slots__ = ()


class EndMarker(_LeafWithoutNewlines):
    __slots__ = ()
    type = 'endmarker'

    def __repr__(self):
        return "<%s: prefix=%s end_pos=%s>" % (
            type(self).__name__, repr(self.prefix), self.end_pos
        )


class Newline(PythonLeaf):
    """Contains NEWLINE and ENDMARKER tokens."""
    __slots__ = ()
    type = 'newline'

    def __repr__(self):
        return "<%s: %s>" % (type(self).__name__, repr(self.value))


class Name(_LeafWithoutNewlines):
    """
    A string. Sometimes it is important to know if the string belongs to a name
    or not.
    """
    type = 'name'
    __slots__ = ()

    def __repr__(self):
        return "<%s: %s@%s,%s>" % (type(self).__name__, self.value,
                                   self.line, self.column)

    def is_definition(self, include_setitem=False):
        """
        Returns True if the name is being defined.
        """
        return self.get_definition(include_setitem=include_setitem) is not None

    def get_definition(self, import_name_always=False, include_setitem=False):
        """
        Returns None if there's no definition for a name.

        :param import_name_always: Specifies if an import name is always a
            definition. Normally foo in `from foo import bar` is not a
            definition.
        """
        node = self.parent
        type_ = node.type

        if type_ in ('funcdef', 'classdef'):
            if self == node.name:
                return node
            return None

        if type_ == 'except_clause':
            if self.get_previous_sibling() == 'as':
                return node.parent  # The try_stmt.
            return None

        while node is not None:
            if node.type == 'suite':
                return None
            if node.type in _GET_DEFINITION_TYPES:
                if self in node.get_defined_names(include_setitem):
                    return node
                if import_name_always and node.type in _IMPORTS:
                    return node
                return None
            node = node.parent
        return None


class Literal(PythonLeaf):
    __slots__ = ()


class Number(Literal):
    type = 'number'
    __slots__ = ()


class String(Literal):
    type = 'string'
    __slots__ = ()

    @property
    def string_prefix(self):
        return re.match(r'\w*(?=[\'"])', self.value).group(0)

    def _get_payload(self):
        match = re.search(
            r'''('{3}|"{3}|'|")(.*)$''',
            self.value,
            flags=re.DOTALL
        )
        return match.group(2)[:-len(match.group(1))]


class FStringString(PythonLeaf):
    """
    f-strings contain f-string expressions and normal python strings. These are
    the string parts of f-strings.
    """
    type = 'fstring_string'
    __slots__ = ()


class FStringStart(PythonLeaf):
    """
    f-strings contain f-string expressions and normal python strings. These are
    the string parts of f-strings.
    """
    type = 'fstring_start'
    __slots__ = ()


class FStringEnd(PythonLeaf):
    """
    f-strings contain f-string expressions and normal python strings. These are
    the string parts of f-strings.
    """
    type = 'fstring_end'
    __slots__ = ()


class _StringComparisonMixin:
    __slots__ = ()

    def __eq__(self, other):
        """
        Make comparisons with strings easy.
        Improves the readability of the parser.
        """
        if isinstance(other, str):
            return self.value == other

        return self is other

    def __hash__(self):
        return hash(self.value)


class Operator(_LeafWithoutNewlines, _StringComparisonMixin):
    type = 'operator'
    __slots__ = ()


class Keyword(_LeafWithoutNewlines, _StringComparisonMixin):
    type = 'keyword'
    __slots__ = ()


class Scope(PythonBaseNode, DocstringMixin):
    """
    Super class for the parser tree, which represents the state of a python
    text file.
    A Scope is either a function, class or lambda.
    """
    __slots__ = ()

    def __init__(self, children):
        super().__init__(children)

    def iter_funcdefs(self):
        """
        Returns a generator of `funcdef` nodes.
        """
        return self._search_in_scope('funcdef')

    def iter_classdefs(self):
        """
        Returns a generator of `classdef` nodes.
        """
        return self._search_in_scope('classdef')

    def iter_imports(self):
        """
        Returns a generator of `import_name` and `import_from` nodes.
        """
        return self._search_in_scope('import_name', 'import_from')

    def _search_in_scope(self, *names):
        def scan(children):
            for element in children:
                if element.type in names:
                    yield element
                if element.type in _FUNC_CONTAINERS:
                    yield from scan(element.children)

        return scan(self.children)

    def get_suite(self):
        """
        Returns the part that is executed by the function.
        """
        return self.children[-1]

    def __repr__(self):
        try:
            name = self.name.value
        except AttributeError:
            name = ''

        return "<%s: %s@%s-%s>" % (type(self).__name__, name,
                                   self.start_pos[0], self.end_pos[0])


class Module(Scope):
    """
    The top scope, which is always a module.
    Depending on the underlying parser this may be a full module or just a part
    of a module.
    """
    __slots__ = ('_used_names',)
    type = 'file_input'

    def __init__(self, children):
        super().__init__(children)
        self._used_names = None

    def _iter_future_import_names(self):
        """
        :return: A list of future import names.
        :rtype: list of str
        """
        # In Python it's not allowed to use future imports after the first
        # actual (non-future) statement. However this is not a linter here,
        # just return all future imports. If people want to scan for issues
        # they should use the API.
        for imp in self.iter_imports():
            if imp.type == 'import_from' and imp.level == 0:
                for path in imp.get_paths():
                    names = [name.value for name in path]
                    if len(names) == 2 and names[0] == '__future__':
                        yield names[1]

    def get_used_names(self):
        """
        Returns all the :class:`Name` leafs that exist in this module. This
        includes both definitions and references of names.
        """
        if self._used_names is None:
            # Don't directly use self._used_names to eliminate a lookup.
            dct = {}

            def recurse(node):
                try:
                    children = node.children
                except AttributeError:
                    if node.type == 'name':
                        arr = dct.setdefault(node.value, [])
                        arr.append(node)
                else:
                    for child in children:
                        recurse(child)

            recurse(self)
            self._used_names = UsedNamesMapping(dct)
        return self._used_names


class Decorator(PythonBaseNode):
    type = 'decorator'
    __slots__ = ()


class ClassOrFunc(Scope):
    __slots__ = ()

    @property
    def name(self):
        """
        Returns the `Name` leaf that defines the function or class name.
        """
        return self.children[1]

    def get_decorators(self):
        """
        :rtype: list of :class:`Decorator`
        """
        decorated = self.parent
        if decorated.type == 'async_funcdef':
            decorated = decorated.parent

        if decorated.type == 'decorated':
            if decorated.children[0].type == 'decorators':
                return decorated.children[0].children
            else:
                return decorated.children[:1]
        else:
            return []


class Class(ClassOrFunc):
    """
    Used to store the parsed contents of a python class.
    """
    type = 'classdef'
    __slots__ = ()

    def __init__(self, children):
        super().__init__(children)

    def get_super_arglist(self):
        """
        Returns the `arglist` node that defines the super classes. It returns
        None if there are no arguments.
        """
        if self.children[2] != '(':  # Has no parentheses
            return None
        else:
            if self.children[3] == ')':  # Empty parentheses
                return None
            else:
                return self.children[3]


def _create_params(parent, argslist_list):
    """
    `argslist_list` is a list that can contain an argslist as a first item, but
    most not. It's basically the items between the parameter brackets (which is
    at most one item).
    This function modifies the parser structure. It generates `Param` objects
    from the normal ast. Those param objects do not exist in a normal ast, but
    make the evaluation of the ast tree so much easier.
    You could also say that this function replaces the argslist node with a
    list of Param objects.
    """
    try:
        first = argslist_list[0]
    except IndexError:
        return []

    if first.type in ('name', 'fpdef'):
        return [Param([first], parent)]
    elif first == '*':
        return [first]
    else:  # argslist is a `typedargslist` or a `varargslist`.
        if first.type == 'tfpdef':
            children = [first]
        else:
            children = first.children
        new_children = []
        start = 0
        # Start with offset 1, because the end is higher.
        for end, child in enumerate(children + [None], 1):
            if child is None or child == ',':
                param_children = children[start:end]
                if param_children:  # Could as well be comma and then end.
                    if param_children[0] == '*' \
                            and (len(param_children) == 1
                                 or param_children[1] == ',') \
                            or param_children[0] == '/':
                        for p in param_children:
                            p.parent = parent
                        new_children += param_children
                    else:
                        new_children.append(Param(param_children, parent))
                    start = end
        return new_children


class Function(ClassOrFunc):
    """
    Used to store the parsed contents of a python function.

    Children::

        0. <Keyword: def>
        1. <Name>
        2. parameter list (including open-paren and close-paren <Operator>s)
        3. or 5. <Operator: :>
        4. or 6. Node() representing function body
        3. -> (if annotation is also present)
        4. annotation (if present)
    """
    type = 'funcdef'
    __slots__ = ()

    def __init__(self, children):
        super().__init__(children)
        parameters = self.children[2]  # After `def foo`
        parameters_children = parameters.children[1:-1]
        # If input parameters list already has Param objects, keep it as is;
        # otherwise, convert it to a list of Param objects.
        if not any(isinstance(child, Param) for child in parameters_children):
            parameters.children[1:-1] = _create_params(parameters, parameters_children)

    def _get_param_nodes(self):
        return self.children[2].children

    def get_params(self):
        """
        Returns a list of `Param()`.
        """
        return [p for p in self._get_param_nodes() if p.type == 'param']

    @property
    def name(self):
        return self.children[1]  # First token after `def`

    def iter_yield_exprs(self):
        """
        Returns a generator of `yield_expr`.
        """
        def scan(children):
            for element in children:
                if element.type in ('classdef', 'funcdef', 'lambdef'):
                    continue

                try:
                    nested_children = element.children
                except AttributeError:
                    if element.value == 'yield':
                        if element.parent.type == 'yield_expr':
                            yield element.parent
                        else:
                            yield element
                else:
                    yield from scan(nested_children)

        return scan(self.children)

    def iter_return_stmts(self):
        """
        Returns a generator of `return_stmt`.
        """
        def scan(children):
            for element in children:
                if element.type == 'return_stmt' \
                        or element.type == 'keyword' and element.value == 'return':
                    yield element
                if element.type in _RETURN_STMT_CONTAINERS:
                    yield from scan(element.children)

        return scan(self.children)

    def iter_raise_stmts(self):
        """
        Returns a generator of `raise_stmt`. Includes raise statements inside try-except blocks
        """
        def scan(children):
            for element in children:
                if element.type == 'raise_stmt' \
                        or element.type == 'keyword' and element.value == 'raise':
                    yield element
                if element.type in _RETURN_STMT_CONTAINERS:
                    yield from scan(element.children)

        return scan(self.children)

    def is_generator(self):
        """
        :return bool: Checks if a function is a generator or not.
        """
        return next(self.iter_yield_exprs(), None) is not None

    @property
    def annotation(self):
        """
        Returns the test node after `->` or `None` if there is no annotation.
        """
        try:
            if self.children[3] == "->":
                return self.children[4]
            assert self.children[3] == ":"
            return None
        except IndexError:
            return None


class Lambda(Function):
    """
    Lambdas are basically trimmed functions, so give it the same interface.

    Children::

         0. <Keyword: lambda>
         *. <Param x> for each argument x
        -2. <Operator: :>
        -1. Node() representing body
    """
    type = 'lambdef'
    __slots__ = ()

    def __init__(self, children):
        # We don't want to call the Function constructor, call its parent.
        super(Function, self).__init__(children)
        # Everything between `lambda` and the `:` operator is a parameter.
        parameters_children = self.children[1:-2]
        # If input children list already has Param objects, keep it as is;
        # otherwise, convert it to a list of Param objects.
        if not any(isinstance(child, Param) for child in parameters_children):
            self.children[1:-2] = _create_params(self, parameters_children)

    @property
    def name(self):
        """
        Raises an AttributeError. Lambdas don't have a defined name.
        """
        raise AttributeError("lambda is not named.")

    def _get_param_nodes(self):
        return self.children[1:-2]

    @property
    def annotation(self):
        """
        Returns `None`, lambdas don't have annotations.
        """
        return None

    def __repr__(self):
        return "<%s@%s>" % (self.__class__.__name__, self.start_pos)


class Flow(PythonBaseNode):
    __slots__ = ()


class IfStmt(Flow):
    type = 'if_stmt'
    __slots__ = ()

    def get_test_nodes(self):
        """
        E.g. returns all the `test` nodes that are named as x, below:

            if x:
                pass
            elif x:
                pass
        """
        for i, c in enumerate(self.children):
            if c in ('elif', 'if'):
                yield self.children[i + 1]

    def get_corresponding_test_node(self, node):
        """
        Searches for the branch in which the node is and returns the
        corresponding test node (see function above). However if the node is in
        the test node itself and not in the suite return None.
        """
        start_pos = node.start_pos
        for check_node in reversed(list(self.get_test_nodes())):
            if check_node.start_pos < start_pos:
                if start_pos < check_node.end_pos:
                    return None
                    # In this case the node is within the check_node itself,
                    # not in the suite
                else:
                    return check_node

    def is_node_after_else(self, node):
        """
        Checks if a node is defined after `else`.
        """
        for c in self.children:
            if c == 'else':
                if node.start_pos > c.start_pos:
                    return True
        else:
            return False


class WhileStmt(Flow):
    type = 'while_stmt'
    __slots__ = ()


class ForStmt(Flow):
    type = 'for_stmt'
    __slots__ = ()

    def get_testlist(self):
        """
        Returns the input node ``y`` from: ``for x in y:``.
        """
        return self.children[3]

    def get_defined_names(self, include_setitem=False):
        return _defined_names(self.children[1], include_setitem)


class TryStmt(Flow):
    type = 'try_stmt'
    __slots__ = ()

    def get_except_clause_tests(self):
        """
        Returns the ``test`` nodes found in ``except_clause`` nodes.
        Returns ``[None]`` for except clauses without an exception given.
        """
        for node in self.children:
            if node.type == 'except_clause':
                yield node.children[1]
            elif node == 'except':
                yield None


class WithStmt(Flow):
    type = 'with_stmt'
    __slots__ = ()

    def get_defined_names(self, include_setitem=False):
        """
        Returns the a list of `Name` that the with statement defines. The
        defined names are set after `as`.
        """
        names = []
        for with_item in self.children[1:-2:2]:
            # Check with items for 'as' names.
            if with_item.type == 'with_item':
                names += _defined_names(with_item.children[2], include_setitem)
        return names

    def get_test_node_from_name(self, name):
        node = name.search_ancestor("with_item")
        if node is None:
            raise ValueError('The name is not actually part of a with statement.')
        return node.children[0]


class Import(PythonBaseNode):
    __slots__ = ()

    def get_path_for_name(self, name):
        """
        The path is the list of names that leads to the searched name.

        :return list of Name:
        """
        try:
            # The name may be an alias. If it is, just map it back to the name.
            name = self._aliases()[name]
        except KeyError:
            pass

        for path in self.get_paths():
            if name in path:
                return path[:path.index(name) + 1]
        raise ValueError('Name should be defined in the import itself')

    def is_nested(self):
        return False  # By default, sub classes may overwrite this behavior

    def is_star_import(self):
        return self.children[-1] == '*'


class ImportFrom(Import):
    type = 'import_from'
    __slots__ = ()

    def get_defined_names(self, include_setitem=False):
        """
        Returns the a list of `Name` that the import defines. The
        defined names are set after `import` or in case an alias - `as` - is
        present that name is returned.
        """
        return [alias or name for name, alias in self._as_name_tuples()]

    def _aliases(self):
        """Mapping from alias to its corresponding name."""
        return dict((alias, name) for name, alias in self._as_name_tuples()
                    if alias is not None)

    def get_from_names(self):
        for n in self.children[1:]:
            if n not in ('.', '...'):
                break
        if n.type == 'dotted_name':  # from x.y import
            return n.children[::2]
        elif n == 'import':  # from . import
            return []
        else:  # from x import
            return [n]

    @property
    def level(self):
        """The level parameter of ``__import__``."""
        level = 0
        for n in self.children[1:]:
            if n in ('.', '...'):
                level += len(n.value)
            else:
                break
        return level

    def _as_name_tuples(self):
        last = self.children[-1]
        if last == ')':
            last = self.children[-2]
        elif last == '*':
            return  # No names defined directly.

        if last.type == 'import_as_names':
            as_names = last.children[::2]
        else:
            as_names = [last]
        for as_name in as_names:
            if as_name.type == 'name':
                yield as_name, None
            else:
                yield as_name.children[::2]  # yields x, y -> ``x as y``

    def get_paths(self):
        """
        The import paths defined in an import statement. Typically an array
        like this: ``[<Name: datetime>, <Name: date>]``.

        :return list of list of Name:
        """
        dotted = self.get_from_names()

        if self.children[-1] == '*':
            return [dotted]
        return [dotted + [name] for name, alias in self._as_name_tuples()]


class ImportName(Import):
    """For ``import_name`` nodes. Covers normal imports without ``from``."""
    type = 'import_name'
    __slots__ = ()

    def get_defined_names(self, include_setitem=False):
        """
        Returns the a list of `Name` that the import defines. The defined names
        is always the first name after `import` or in case an alias - `as` - is
        present that name is returned.
        """
        return [alias or path[0] for path, alias in self._dotted_as_names()]

    @property
    def level(self):
        """The level parameter of ``__import__``."""
        return 0  # Obviously 0 for imports without from.

    def get_paths(self):
        return [path for path, alias in self._dotted_as_names()]

    def _dotted_as_names(self):
        """Generator of (list(path), alias) where alias may be None."""
        dotted_as_names = self.children[1]
        if dotted_as_names.type == 'dotted_as_names':
            as_names = dotted_as_names.children[::2]
        else:
            as_names = [dotted_as_names]

        for as_name in as_names:
            if as_name.type == 'dotted_as_name':
                alias = as_name.children[2]
                as_name = as_name.children[0]
            else:
                alias = None
            if as_name.type == 'name':
                yield [as_name], alias
            else:
                # dotted_names
                yield as_name.children[::2], alias

    def is_nested(self):
        """
        This checks for the special case of nested imports, without aliases and
        from statement::

            import foo.bar
        """
        return bool([1 for path, alias in self._dotted_as_names()
                    if alias is None and len(path) > 1])

    def _aliases(self):
        """
        :return list of Name: Returns all the alias
        """
        return dict((alias, path[-1]) for path, alias in self._dotted_as_names()
                    if alias is not None)


class KeywordStatement(PythonBaseNode):
    """
    For the following statements: `assert`, `del`, `global`, `nonlocal`,
    `raise`, `return`, `yield`.

    `pass`, `continue` and `break` are not in there, because they are just
    simple keywords and the parser reduces it to a keyword.
    """
    __slots__ = ()

    @property
    def type(self):
        """
        Keyword statements start with the keyword and end with `_stmt`. You can
        crosscheck this with the Python grammar.
        """
        return '%s_stmt' % self.keyword

    @property
    def keyword(self):
        return self.children[0].value

    def get_defined_names(self, include_setitem=False):
        keyword = self.keyword
        if keyword == 'del':
            return _defined_names(self.children[1], include_setitem)
        if keyword in ('global', 'nonlocal'):
            return self.children[1::2]
        return []


class AssertStmt(KeywordStatement):
    __slots__ = ()

    @property
    def assertion(self):
        return self.children[1]


class GlobalStmt(KeywordStatement):
    __slots__ = ()

    def get_global_names(self):
        return self.children[1::2]


class ReturnStmt(KeywordStatement):
    __slots__ = ()


class YieldExpr(PythonBaseNode):
    type = 'yield_expr'
    __slots__ = ()


def _defined_names(current, include_setitem):
    """
    A helper function to find the defined names in statements, for loops and
    list comprehensions.
    """
    names = []
    if current.type in ('testlist_star_expr', 'testlist_comp', 'exprlist', 'testlist'):
        for child in current.children[::2]:
            names += _defined_names(child, include_setitem)
    elif current.type in ('atom', 'star_expr'):
        names += _defined_names(current.children[1], include_setitem)
    elif current.type in ('power', 'atom_expr'):
        if current.children[-2] != '**':  # Just if there's no operation
            trailer = current.children[-1]
            if trailer.children[0] == '.':
                names.append(trailer.children[1])
            elif trailer.children[0] == '[' and include_setitem:
                for node in current.children[-2::-1]:
                    if node.type == 'trailer':
                        names.append(node.children[1])
                        break
                    if node.type == 'name':
                        names.append(node)
                        break
    else:
        names.append(current)
    return names


class ExprStmt(PythonBaseNode, DocstringMixin):
    type = 'expr_stmt'
    __slots__ = ()

    def get_defined_names(self, include_setitem=False):
        """
        Returns a list of `Name` defined before the `=` sign.
        """
        names = []
        if self.children[1].type == 'annassign':
            names = _defined_names(self.children[0], include_setitem)
        return [
            name
            for i in range(0, len(self.children) - 2, 2)
            if '=' in self.children[i + 1].value
            for name in _defined_names(self.children[i], include_setitem)
        ] + names

    def get_rhs(self):
        """Returns the right-hand-side of the equals."""
        node = self.children[-1]
        if node.type == 'annassign':
            if len(node.children) == 4:
                node = node.children[3]
            else:
                node = node.children[1]
        return node

    def yield_operators(self):
        """
        Returns a generator of `+=`, `=`, etc. or None if there is no operation.
        """
        first = self.children[1]
        if first.type == 'annassign':
            if len(first.children) <= 2:
                return  # No operator is available, it's just PEP 484.

            first = first.children[2]
        yield first

        yield from self.children[3::2]


class NamedExpr(PythonBaseNode):
    type = 'namedexpr_test'

    def get_defined_names(self, include_setitem=False):
        return _defined_names(self.children[0], include_setitem)


class Param(PythonBaseNode):
    """
    It's a helper class that makes business logic with params much easier. The
    Python grammar defines no ``param`` node. It defines it in a different way
    that is not really suited to working with parameters.
    """
    type = 'param'

    def __init__(self, children, parent=None):
        super().__init__(children)
        self.parent = parent

    @property
    def star_count(self):
        """
        Is `0` in case of `foo`, `1` in case of `*foo` or `2` in case of
        `**foo`.
        """
        first = self.children[0]
        if first in ('*', '**'):
            return len(first.value)
        return 0

    @property
    def default(self):
        """
        The default is the test node that appears after the `=`. Is `None` in
        case no default is present.
        """
        has_comma = self.children[-1] == ','
        try:
            if self.children[-2 - int(has_comma)] == '=':
                return self.children[-1 - int(has_comma)]
        except IndexError:
            return None

    @property
    def annotation(self):
        """
        The default is the test node that appears after `:`. Is `None` in case
        no annotation is present.
        """
        tfpdef = self._tfpdef()
        if tfpdef.type == 'tfpdef':
            assert tfpdef.children[1] == ":"
            assert len(tfpdef.children) == 3
            annotation = tfpdef.children[2]
            return annotation
        else:
            return None

    def _tfpdef(self):
        """
        tfpdef: see e.g. grammar36.txt.
        """
        offset = int(self.children[0] in ('*', '**'))
        return self.children[offset]

    @property
    def name(self):
        """
        The `Name` leaf of the param.
        """
        if self._tfpdef().type == 'tfpdef':
            return self._tfpdef().children[0]
        else:
            return self._tfpdef()

    def get_defined_names(self, include_setitem=False):
        return [self.name]

    @property
    def position_index(self):
        """
        Property for the positional index of a paramter.
        """
        index = self.parent.children.index(self)
        try:
            keyword_only_index = self.parent.children.index('*')
            if index > keyword_only_index:
                # Skip the ` *, `
                index -= 2
        except ValueError:
            pass
        try:
            keyword_only_index = self.parent.children.index('/')
            if index > keyword_only_index:
                # Skip the ` /, `
                index -= 2
        except ValueError:
            pass
        return index - 1

    def get_parent_function(self):
        """
        Returns the function/lambda of a parameter.
        """
        return self.search_ancestor('funcdef', 'lambdef')

    def get_code(self, include_prefix=True, include_comma=True):
        """
        Like all the other get_code functions, but includes the param
        `include_comma`.

        :param include_comma bool: If enabled includes the comma in the string output.
        """
        if include_comma:
            return super().get_code(include_prefix)

        children = self.children
        if children[-1] == ',':
            children = children[:-1]
        return self._get_code_for_children(
            children,
            include_prefix=include_prefix
        )

    def __repr__(self):
        default = '' if self.default is None else '=%s' % self.default.get_code()
        return '<%s: %s>' % (type(self).__name__, str(self._tfpdef()) + default)


class SyncCompFor(PythonBaseNode):
    type = 'sync_comp_for'
    __slots__ = ()

    def get_defined_names(self, include_setitem=False):
        """
        Returns the a list of `Name` that the comprehension defines.
        """
        # allow async for
        return _defined_names(self.children[1], include_setitem)


# This is simply here so an older Jedi version can work with this new parso
# version. Can be deleted in the next release.
CompFor = SyncCompFor


class UsedNamesMapping(Mapping):
    """
    This class exists for the sole purpose of creating an immutable dict.
    """
    def __init__(self, dct):
        self._dict = dct

    def __getitem__(self, key):
        return self._dict[key]

    def __len__(self):
        return len(self._dict)

    def __iter__(self):
        return iter(self._dict)

    def __hash__(self):
        return id(self)

    def __eq__(self, other):
        # Comparing these dicts does not make sense.
        return self is other
