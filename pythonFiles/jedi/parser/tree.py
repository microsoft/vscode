"""
If you know what an abstract syntax tree (AST) is, you'll see that this module
is pretty much that. The classes represent syntax elements like functions and
imports.

This is the "business logic" part of the parser. There's a lot of logic here
that makes it easier for Jedi (and other libraries to deal with a Python syntax
tree.

By using `get_code` on a module, you can get back the 1-to-1 representation of
the input given to the parser. This is important if you are using refactoring.

The easiest way to play with this module is to use :class:`parsing.Parser`.
:attr:`parsing.Parser.module` holds an instance of :class:`Module`:

>>> from jedi._compatibility import u
>>> from jedi.parser import Parser, load_grammar
>>> parser = Parser(load_grammar(), u('import os'), 'example.py')
>>> submodule = parser.module
>>> submodule
<Module: example.py@1-1>

Any subclasses of :class:`Scope`, including :class:`Module` has an attribute
:attr:`imports <Scope.imports>`:

>>> submodule.imports
[<ImportName: import os@1,0>]

See also :attr:`Scope.subscopes` and :attr:`Scope.statements`.
"""
import os
import re
from inspect import cleandoc
from itertools import chain
import textwrap

from jedi._compatibility import (Python3Method, encoding, is_py3, utf8_repr,
                                 literal_eval, use_metaclass, unicode)
from jedi import cache


def is_node(node, *symbol_names):
    try:
        type = node.type
    except AttributeError:
        return False
    else:
        return type in symbol_names


class PositionModifier(object):
    """A start_pos modifier for the fast parser."""
    def __init__(self):
        self.line = 0


zero_position_modifier = PositionModifier()


class DocstringMixin(object):
    __slots__ = ()

    @property
    def raw_doc(self):
        """ Returns a cleaned version of the docstring token. """
        if isinstance(self, Module):
            node = self.children[0]
        elif isinstance(self, ClassOrFunc):
            node = self.children[self.children.index(':') + 1]
            if is_node(node, 'suite'):  # Normally a suite
                node = node.children[2]  # -> NEWLINE INDENT stmt
        else:  # ExprStmt
            simple_stmt = self.parent
            c = simple_stmt.parent.children
            index = c.index(simple_stmt)
            if not index:
                return ''
            node = c[index - 1]

        if is_node(node, 'simple_stmt'):
            node = node.children[0]

        if node.type == 'string':
            # TODO We have to check next leaves until there are no new
            # leaves anymore that might be part of the docstring. A
            # docstring can also look like this: ``'foo' 'bar'
            # Returns a literal cleaned version of the ``Token``.
            cleaned = cleandoc(literal_eval(node.value))
            # Since we want the docstr output to be always unicode, just
            # force it.
            if is_py3 or isinstance(cleaned, unicode):
                return cleaned
            else:
                return unicode(cleaned, 'UTF-8', 'replace')
        return ''


class Base(object):
    """
    This is just here to have an isinstance check, which is also used on
    evaluate classes. But since they have sometimes a special type of
    delegation, it is important for those classes to override this method.

    I know that there is a chance to do such things with __instancecheck__, but
    since Python 2.5 doesn't support it, I decided to do it this way.
    """
    __slots__ = ()

    def isinstance(self, *cls):
        return isinstance(self, cls)

    @Python3Method
    def get_parent_until(self, classes=(), reverse=False,
                         include_current=True):
        """
        Searches the parent "chain" until the object is an instance of
        classes. If classes is empty return the last parent in the chain
        (is without a parent).
        """
        if type(classes) not in (tuple, list):
            classes = (classes,)
        scope = self if include_current else self.parent
        while scope.parent is not None:
            # TODO why if classes?
            if classes and reverse != scope.isinstance(*classes):
                break
            scope = scope.parent
        return scope

    def get_parent_scope(self, include_flows=False):
        """
        Returns the underlying scope.
        """
        scope = self.parent
        while scope is not None:
            if include_flows and isinstance(scope, Flow):
                return scope
            if scope.is_scope():
                break
            scope = scope.parent
        return scope

    def is_scope(self):
        # Default is not being a scope. Just inherit from Scope.
        return False


class Leaf(Base):
    __slots__ = ('position_modifier', 'value', 'parent', '_start_pos', 'prefix')

    def __init__(self, position_modifier, value, start_pos, prefix=''):
        self.position_modifier = position_modifier
        self.value = value
        self._start_pos = start_pos
        self.prefix = prefix
        self.parent = None

    @property
    def start_pos(self):
        return self._start_pos[0] + self.position_modifier.line, self._start_pos[1]

    @start_pos.setter
    def start_pos(self, value):
        self._start_pos = value[0] - self.position_modifier.line, value[1]

    @property
    def end_pos(self):
        return (self._start_pos[0] + self.position_modifier.line,
                self._start_pos[1] + len(self.value))

    def move(self, line_offset, column_offset):
        self._start_pos = (self._start_pos[0] + line_offset,
                           self._start_pos[1] + column_offset)

    def get_previous(self):
        """
        Returns the previous leaf in the parser tree.
        """
        node = self
        while True:
            c = node.parent.children
            i = c.index(self)
            if i == 0:
                node = node.parent
                if node.parent is None:
                    raise IndexError('Cannot access the previous element of the first one.')
            else:
                node = c[i - 1]
                break

        while True:
            try:
                node = node.children[-1]
            except AttributeError:  # A Leaf doesn't have children.
                return node

    def get_code(self):
        return self.prefix + self.value

    def next_sibling(self):
        """
        The node immediately following the invocant in their parent's children
        list. If the invocant does not have a next sibling, it is None
        """
        # Can't use index(); we need to test by identity
        for i, child in enumerate(self.parent.children):
            if child is self:
                try:
                    return self.parent.children[i + 1]
                except IndexError:
                    return None

    def prev_sibling(self):
        """
        The node/leaf immediately preceding the invocant in their parent's
        children list. If the invocant does not have a previous sibling, it is
        None.
        """
        # Can't use index(); we need to test by identity
        for i, child in enumerate(self.parent.children):
            if child is self:
                if i == 0:
                    return None
                return self.parent.children[i - 1]

    @utf8_repr
    def __repr__(self):
        return "<%s: %s>" % (type(self).__name__, self.value)


class LeafWithNewLines(Leaf):
    __slots__ = ()

    @property
    def end_pos(self):
        """
        Literals and whitespace end_pos are more complicated than normal
        end_pos, because the containing newlines may change the indexes.
        """
        end_pos_line, end_pos_col = self.start_pos
        lines = self.value.split('\n')
        end_pos_line += len(lines) - 1
        # Check for multiline token
        if self.start_pos[0] == end_pos_line:
            end_pos_col += len(lines[-1])
        else:
            end_pos_col = len(lines[-1])
        return end_pos_line, end_pos_col


    @utf8_repr
    def __repr__(self):
        return "<%s: %r>" % (type(self).__name__, self.value)

class Whitespace(LeafWithNewLines):
    """Contains NEWLINE and ENDMARKER tokens."""
    __slots__ = ()
    type = 'whitespace'


class Name(Leaf):
    """
    A string. Sometimes it is important to know if the string belongs to a name
    or not.
    """
    type = 'name'
    __slots__ = ()

    def __str__(self):
        return self.value

    def __unicode__(self):
        return self.value

    def __repr__(self):
        return "<%s: %s@%s,%s>" % (type(self).__name__, self.value,
                                   self.start_pos[0], self.start_pos[1])

    def get_definition(self):
        scope = self
        while scope.parent is not None:
            parent = scope.parent
            if scope.isinstance(Node, Name) and parent.type != 'simple_stmt':
                if scope.type == 'testlist_comp':
                    try:
                        if isinstance(scope.children[1], CompFor):
                            return scope.children[1]
                    except IndexError:
                        pass
                scope = parent
            else:
                break
        return scope

    def is_definition(self):
        stmt = self.get_definition()
        if stmt.type in ('funcdef', 'classdef', 'file_input', 'param'):
            return self == stmt.name
        elif stmt.type == 'for_stmt':
            return self.start_pos < stmt.children[2].start_pos
        elif stmt.type == 'try_stmt':
            return self.prev_sibling() == 'as'
        else:
            return stmt.type in ('expr_stmt', 'import_name', 'import_from',
                                 'comp_for', 'with_stmt') \
                and self in stmt.get_defined_names()

    def assignment_indexes(self):
        """
        Returns an array of ints of the indexes that are used in tuple
        assignments.

        For example if the name is ``y`` in the following code::

            x, (y, z) = 2, ''

        would result in ``[1, 0]``.
        """
        indexes = []
        node = self.parent
        compare = self
        while node is not None:
            if is_node(node, 'testlist_comp', 'testlist_star_expr', 'exprlist'):
                for i, child in enumerate(node.children):
                    if child == compare:
                        indexes.insert(0, int(i / 2))
                        break
                else:
                    raise LookupError("Couldn't find the assignment.")
            elif isinstance(node, (ExprStmt, CompFor)):
                break

            compare = node
            node = node.parent
        return indexes


class Literal(LeafWithNewLines):
    __slots__ = ()

    def eval(self):
        return literal_eval(self.value)


class Number(Literal):
    type = 'number'
    __slots__ = ()


class String(Literal):
    type = 'string'
    __slots__ = ()


class Operator(Leaf):
    type = 'operator'
    __slots__ = ()

    def __str__(self):
        return self.value

    def __eq__(self, other):
        """
        Make comparisons with strings easy.
        Improves the readability of the parser.
        """
        if isinstance(other, Operator):
            return self is other
        else:
            return self.value == other

    def __ne__(self, other):
        """Python 2 compatibility."""
        return self.value != other

    def __hash__(self):
        return hash(self.value)


class Keyword(Leaf):
    type = 'keyword'
    __slots__ = ()

    def __eq__(self, other):
        """
        Make comparisons with strings easy.
        Improves the readability of the parser.
        """
        if isinstance(other, Keyword):
            return self is other
        return self.value == other

    def __ne__(self, other):
        """Python 2 compatibility."""
        return not self.__eq__(other)

    def __hash__(self):
        return hash(self.value)


class BaseNode(Base):
    """
    The super class for Scope, Import, Name and Statement. Every object in
    the parser tree inherits from this class.
    """
    __slots__ = ('children', 'parent')
    type = None

    def __init__(self, children):
        """
        Initialize :class:`BaseNode`.

        :param children: The module in which this Python object locates.
        """
        for c in children:
            c.parent = self
        self.children = children
        self.parent = None

    def move(self, line_offset, column_offset):
        """
        Move the Node's start_pos.
        """
        for c in self.children:
            c.move(line_offset, column_offset)

    @property
    def start_pos(self):
        return self.children[0].start_pos

    @property
    def end_pos(self):
        return self.children[-1].end_pos

    def get_code(self):
        return "".join(c.get_code() for c in self.children)

    @Python3Method
    def name_for_position(self, position):
        for c in self.children:
            if isinstance(c, Leaf):
                if isinstance(c, Name) and c.start_pos <= position <= c.end_pos:
                    return c
            else:
                result = c.name_for_position(position)
                if result is not None:
                    return result
        return None

    @Python3Method
    def get_statement_for_position(self, pos):
        for c in self.children:
            if c.start_pos <= pos <= c.end_pos:
                if c.type not in ('decorated', 'simple_stmt', 'suite') \
                        and not isinstance(c, (Flow, ClassOrFunc)):
                    return c
                else:
                    try:
                        return c.get_statement_for_position(pos)
                    except AttributeError:
                        pass  # Must be a non-scope
        return None

    def first_leaf(self):
        try:
            return self.children[0].first_leaf()
        except AttributeError:
            return self.children[0]

    @utf8_repr
    def __repr__(self):
        code = self.get_code().replace('\n', ' ')
        if not is_py3:
            code = code.encode(encoding, 'replace')
        return "<%s: %s@%s,%s>" % \
            (type(self).__name__, code, self.start_pos[0], self.start_pos[1])


class Node(BaseNode):
    """Concrete implementation for interior nodes."""
    __slots__ = ('type',)

    def __init__(self, type, children):
        """
        Initializer.

        Takes a type constant (a symbol number >= 256), a sequence of
        child nodes, and an optional context keyword argument.

        As a side effect, the parent pointers of the children are updated.
        """
        super(Node, self).__init__(children)
        self.type = type

    def __repr__(self):
        return "%s(%s, %r)" % (self.__class__.__name__, self.type, self.children)


class IsScopeMeta(type):
    def __instancecheck__(self, other):
        return other.is_scope()


class IsScope(use_metaclass(IsScopeMeta)):
    pass


class Scope(BaseNode, DocstringMixin):
    """
    Super class for the parser tree, which represents the state of a python
    text file.
    A Scope manages and owns its subscopes, which are classes and functions, as
    well as variables and imports. It is used to access the structure of python
    files.

    :param start_pos: The position (line and column) of the scope.
    :type start_pos: tuple(int, int)
    """
    __slots__ = ('names_dict',)

    def __init__(self, children):
        super(Scope, self).__init__(children)

    @property
    def returns(self):
        # Needed here for fast_parser, because the fast_parser splits and
        # returns will be in "normal" modules.
        return self._search_in_scope(ReturnStmt)

    @property
    def subscopes(self):
        return self._search_in_scope(Scope)

    @property
    def flows(self):
        return self._search_in_scope(Flow)

    @property
    def imports(self):
        return self._search_in_scope(Import)

    @Python3Method
    def _search_in_scope(self, typ):
        def scan(children):
            elements = []
            for element in children:
                if isinstance(element, typ):
                    elements.append(element)
                if is_node(element, 'suite', 'simple_stmt', 'decorated') \
                        or isinstance(element, Flow):
                    elements += scan(element.children)
            return elements

        return scan(self.children)

    @property
    def statements(self):
        return self._search_in_scope((ExprStmt, KeywordStatement))

    def is_scope(self):
        return True

    def __repr__(self):
        try:
            name = self.path
        except AttributeError:
            try:
                name = self.name
            except AttributeError:
                name = self.command

        return "<%s: %s@%s-%s>" % (type(self).__name__, name,
                                   self.start_pos[0], self.end_pos[0])

    def walk(self):
        yield self
        for s in self.subscopes:
            for scope in s.walk():
                yield scope

        for r in self.statements:
            while isinstance(r, Flow):
                for scope in r.walk():
                    yield scope
                r = r.next


class Module(Scope):
    """
    The top scope, which is always a module.
    Depending on the underlying parser this may be a full module or just a part
    of a module.
    """
    __slots__ = ('path', 'global_names', 'used_names', '_name',
                 'error_statement_stacks')
    type = 'file_input'

    def __init__(self, children):
        """
        Initialize :class:`Module`.

        :type path: str
        :arg  path: File path to this module.

        .. todo:: Document `top_module`.
        """
        super(Module, self).__init__(children)
        self.path = None  # Set later.

    @property
    @cache.underscore_memoization
    def name(self):
        """ This is used for the goto functions. """
        if self.path is None:
            string = ''  # no path -> empty name
        else:
            sep = (re.escape(os.path.sep),) * 2
            r = re.search(r'([^%s]*?)(%s__init__)?(\.py|\.so)?$' % sep, self.path)
            # Remove PEP 3149 names
            string = re.sub('\.[a-z]+-\d{2}[mud]{0,3}$', '', r.group(1))
        # Positions are not real, but a module starts at (1, 0)
        p = (1, 0)
        name = Name(zero_position_modifier, string, p)
        name.parent = self
        return name

    @property
    def has_explicit_absolute_import(self):
        """
        Checks if imports in this module are explicitly absolute, i.e. there
        is a ``__future__`` import.
        """
        # TODO this is a strange scan and not fully correct. I think Python's
        # parser does it in a different way and scans for the first
        # statement/import with a tokenizer (to check for syntax changes like
        # the future print statement).
        for imp in self.imports:
            if imp.type == 'import_from' and imp.level == 0:
                for path in imp.paths():
                    if [str(name) for name in path] == ['__future__', 'absolute_import']:
                        return True
        return False


class Decorator(BaseNode):
    type = 'decorator'
    __slots__ = ()


class ClassOrFunc(Scope):
    __slots__ = ()

    @property
    def name(self):
        return self.children[1]

    def get_decorators(self):
        decorated = self.parent
        if is_node(decorated, 'decorated'):
            if is_node(decorated.children[0], 'decorators'):
                return decorated.children[0].children
            else:
                return decorated.children[:1]
        else:
            return []


class Class(ClassOrFunc):
    """
    Used to store the parsed contents of a python class.

    :param name: The Class name.
    :type name: str
    :param supers: The super classes of a Class.
    :type supers: list
    :param start_pos: The start position (line, column) of the class.
    :type start_pos: tuple(int, int)
    """
    type = 'classdef'
    __slots__ = ()

    def __init__(self, children):
        super(Class, self).__init__(children)

    def get_super_arglist(self):
        if self.children[2] != '(':  # Has no parentheses
            return None
        else:
            if self.children[3] == ')':  # Empty parentheses
                return None
            else:
                return self.children[3]

    @property
    def doc(self):
        """
        Return a document string including call signature of __init__.
        """
        docstr = self.raw_doc
        for sub in self.subscopes:
            if str(sub.name) == '__init__':
                return '%s\n\n%s' % (
                    sub.get_call_signature(func_name=self.name), docstr)
        return docstr


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
    def check_python2_nested_param(node):
        """
        Python 2 allows params to look like ``def x(a, (b, c))``, which is
        basically a way of unpacking tuples in params. Python 3 has ditched
        this behavior. Jedi currently just ignores those constructs.
        """
        return node.type == 'tfpdef' and node.children[0] == '('

    try:
        first = argslist_list[0]
    except IndexError:
        return []

    if first.type in ('name', 'tfpdef'):
        if check_python2_nested_param(first):
            return []
        else:
            return [Param([first], parent)]
    else:  # argslist is a `typedargslist` or a `varargslist`.
        children = first.children
        params = []
        start = 0
        # Start with offset 1, because the end is higher.
        for end, child in enumerate(children + [None], 1):
            if child is None or child == ',':
                new_children = children[start:end]
                if new_children:  # Could as well be comma and then end.
                    if check_python2_nested_param(new_children[0]):
                        continue
                    params.append(Param(new_children, parent))
                    start = end
        return params


class Function(ClassOrFunc):
    """
    Used to store the parsed contents of a python function.
    """
    __slots__ = ('listeners',)
    type = 'funcdef'

    def __init__(self, children):
        super(Function, self).__init__(children)
        self.listeners = set()  # not used here, but in evaluation.
        parameters = self.children[2]  # After `def foo`
        parameters.children[1:-1] = _create_params(parameters, parameters.children[1:-1])

    @property
    def params(self):
        return self.children[2].children[1:-1]

    @property
    def name(self):
        return self.children[1]  # First token after `def`

    @property
    def yields(self):
        # TODO This is incorrect, yields are also possible in a statement.
        return self._search_in_scope(YieldExpr)

    def is_generator(self):
        return bool(self.yields)

    def annotation(self):
        try:
            return self.children[6]  # 6th element: def foo(...) -> bar
        except IndexError:
            return None

    def get_call_signature(self, width=72, func_name=None):
        """
        Generate call signature of this function.

        :param width: Fold lines if a line is longer than this value.
        :type width: int
        :arg func_name: Override function name when given.
        :type func_name: str

        :rtype: str
        """
        func_name = func_name or self.children[1]
        code = unicode(func_name) + self.children[2].get_code()
        return '\n'.join(textwrap.wrap(code, width))

    @property
    def doc(self):
        """ Return a document string including call signature. """
        docstr = self.raw_doc
        return '%s\n\n%s' % (self.get_call_signature(), docstr)


class Lambda(Function):
    """
    Lambdas are basically trimmed functions, so give it the same interface.
    """
    type = 'lambda'
    __slots__ = ()

    def __init__(self, children):
        # We don't want to call the Function constructor, call its parent.
        super(Function, self).__init__(children)
        self.listeners = set()  # not used here, but in evaluation.
        lst = self.children[1:-2]  # After `def foo`
        self.children[1:-2] = _create_params(self, lst)

    @property
    def params(self):
        return self.children[1:-2]

    def is_generator(self):
        return False

    def yields(self):
        return []

    def __repr__(self):
        return "<%s@%s>" % (self.__class__.__name__, self.start_pos)


class Flow(BaseNode):
    __slots__ = ()


class IfStmt(Flow):
    type = 'if_stmt'
    __slots__ = ()

    def check_nodes(self):
        """
        Returns all the `test` nodes that are defined as x, here:

            if x:
                pass
            elif x:
                pass
        """
        for i, c in enumerate(self.children):
            if c in ('elif', 'if'):
                yield self.children[i + 1]

    def node_in_which_check_node(self, node):
        for check_node in reversed(list(self.check_nodes())):
            if check_node.start_pos < node.start_pos:
                return check_node

    def node_after_else(self, node):
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


class TryStmt(Flow):
    type = 'try_stmt'
    __slots__ = ()

    def except_clauses(self):
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

    def get_defined_names(self):
        names = []
        for with_item in self.children[1:-2:2]:
            # Check with items for 'as' names.
            if is_node(with_item, 'with_item'):
                names += _defined_names(with_item.children[2])
        return names

    def node_from_name(self, name):
        node = name
        while True:
            node = node.parent
            if is_node(node, 'with_item'):
                return node.children[0]


class Import(BaseNode):
    __slots__ = ()

    def path_for_name(self, name):
        try:
            # The name may be an alias. If it is, just map it back to the name.
            name = self.aliases()[name]
        except KeyError:
            pass

        for path in self.paths():
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

    def get_defined_names(self):
        return [alias or name for name, alias in self._as_name_tuples()]

    def aliases(self):
        """Mapping from alias to its corresponding name."""
        return dict((alias, name) for name, alias in self._as_name_tuples()
                    if alias is not None)

    def get_from_names(self):
        for n in self.children[1:]:
            if n not in ('.', '...'):
                break
        if is_node(n, 'dotted_name'):  # from x.y import
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

        if is_node(last, 'import_as_names'):
            as_names = last.children[::2]
        else:
            as_names = [last]
        for as_name in as_names:
            if as_name.type == 'name':
                yield as_name, None
            else:
                yield as_name.children[::2]  # yields x, y -> ``x as y``

    def star_import_name(self):
        """
        The last name defined in a star import.
        """
        return self.paths()[-1][-1]

    def paths(self):
        """
        The import paths defined in an import statement. Typically an array
        like this: ``[<Name: datetime>, <Name: date>]``.
        """
        dotted = self.get_from_names()

        if self.children[-1] == '*':
            return [dotted]
        return [dotted + [name] for name, alias in self._as_name_tuples()]


class ImportName(Import):
    """For ``import_name`` nodes. Covers normal imports without ``from``."""
    type = 'import_name'
    __slots__ = ()

    def get_defined_names(self):
        return [alias or path[0] for path, alias in self._dotted_as_names()]

    @property
    def level(self):
        """The level parameter of ``__import__``."""
        return 0  # Obviously 0 for imports without from.

    def paths(self):
        return [path for path, alias in self._dotted_as_names()]

    def _dotted_as_names(self):
        """Generator of (list(path), alias) where alias may be None."""
        dotted_as_names = self.children[1]
        if is_node(dotted_as_names, 'dotted_as_names'):
            as_names = dotted_as_names.children[::2]
        else:
            as_names = [dotted_as_names]

        for as_name in as_names:
            if is_node(as_name, 'dotted_as_name'):
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
        return [1 for path, alias in self._dotted_as_names()
                if alias is None and len(path) > 1]

    def aliases(self):
        return dict((alias, path[-1]) for path, alias in self._dotted_as_names()
                    if alias is not None)


class KeywordStatement(BaseNode):
    """
    For the following statements: `assert`, `del`, `global`, `nonlocal`,
    `raise`, `return`, `yield`, `pass`, `continue`, `break`, `return`, `yield`.
    """
    __slots__ = ()

    @property
    def keyword(self):
        return self.children[0].value


class AssertStmt(KeywordStatement):
    type = 'assert_stmt'
    __slots__ = ()

    def assertion(self):
        return self.children[1]


class GlobalStmt(KeywordStatement):
    type = 'global_stmt'
    __slots__ = ()

    def get_defined_names(self):
        return []

    def get_global_names(self):
        return self.children[1::2]


class ReturnStmt(KeywordStatement):
    type = 'return_stmt'
    __slots__ = ()


class YieldExpr(BaseNode):
    type = 'yield_expr'
    __slots__ = ()


def _defined_names(current):
    """
    A helper function to find the defined names in statements, for loops and
    list comprehensions.
    """
    names = []
    if is_node(current, 'testlist_star_expr', 'testlist_comp', 'exprlist'):
        for child in current.children[::2]:
            names += _defined_names(child)
    elif is_node(current, 'atom'):
        names += _defined_names(current.children[1])
    elif is_node(current, 'power'):
        if current.children[-2] != '**':  # Just if there's no operation
            trailer = current.children[-1]
            if trailer.children[0] == '.':
                names.append(trailer.children[1])
    else:
        names.append(current)
    return names


class ExprStmt(BaseNode, DocstringMixin):
    type = 'expr_stmt'
    __slots__ = ()

    def get_defined_names(self):
        return list(chain.from_iterable(_defined_names(self.children[i])
                                        for i in range(0, len(self.children) - 2, 2)
                                        if '=' in self.children[i + 1].value))

    def get_rhs(self):
        """Returns the right-hand-side of the equals."""
        return self.children[-1]

    def first_operation(self):
        """
        Returns `+=`, `=`, etc or None if there is no operation.
        """
        try:
            return self.children[1]
        except IndexError:
            return None


class Param(BaseNode):
    """
    It's a helper class that makes business logic with params much easier. The
    Python grammar defines no ``param`` node. It defines it in a different way
    that is not really suited to working with parameters.
    """
    type = 'param'

    def __init__(self, children, parent):
        super(Param, self).__init__(children)
        self.parent = parent
        for child in children:
            child.parent = self

    @property
    def stars(self):
        first = self.children[0]
        if first in ('*', '**'):
            return len(first.value)
        return 0

    @property
    def default(self):
        try:
            return self.children[int(self.children[0] in ('*', '**')) + 2]
        except IndexError:
            return None

    def annotation(self):
        # Generate from tfpdef.
        raise NotImplementedError

    def _tfpdef(self):
        """
        tfpdef: see grammar.txt.
        """
        offset = int(self.children[0] in ('*', '**'))
        return self.children[offset]

    @property
    def name(self):
        if is_node(self._tfpdef(), 'tfpdef'):
            return self._tfpdef().children[0]
        else:
            return self._tfpdef()

    @property
    def position_nr(self):
        return self.parent.children.index(self) - 1

    @property
    def parent_function(self):
        return self.get_parent_until(IsScope)

    def __repr__(self):
        default = '' if self.default is None else '=%s' % self.default
        return '<%s: %s>' % (type(self).__name__, str(self._tfpdef()) + default)


class CompFor(BaseNode):
    type = 'comp_for'
    __slots__ = ()

    def is_scope(self):
        return True

    @property
    def names_dict(self):
        dct = {}
        for name in self.get_defined_names():
            arr = dct.setdefault(name.value, [])
            arr.append(name)
        return dct

    def names_dicts(self, search_global):
        yield self.names_dict

    def get_defined_names(self):
        return _defined_names(self.children[1])
