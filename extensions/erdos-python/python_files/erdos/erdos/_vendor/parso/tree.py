from abc import abstractmethod, abstractproperty
from typing import List, Optional, Tuple, Union

from erdos.erdos._vendor.parso.utils import split_lines


def search_ancestor(node: 'NodeOrLeaf', *node_types: str) -> 'Optional[BaseNode]':
    """
    Recursively looks at the parents of a node and returns the first found node
    that matches ``node_types``. Returns ``None`` if no matching node is found.

    This function is deprecated, use :meth:`NodeOrLeaf.search_ancestor` instead.

    :param node: The ancestors of this node will be checked.
    :param node_types: type names that are searched for.
    """
    n = node.parent
    while n is not None:
        if n.type in node_types:
            return n
        n = n.parent
    return None


class NodeOrLeaf:
    """
    The base class for nodes and leaves.
    """
    __slots__ = ('parent',)
    type: str
    '''
    The type is a string that typically matches the types of the grammar file.
    '''
    parent: 'Optional[BaseNode]'
    '''
    The parent :class:`BaseNode` of this node or leaf.
    None if this is the root node.
    '''

    def get_root_node(self):
        """
        Returns the root node of a parser tree. The returned node doesn't have
        a parent node like all the other nodes/leaves.
        """
        scope = self
        while scope.parent is not None:
            scope = scope.parent
        return scope

    def get_next_sibling(self):
        """
        Returns the node immediately following this node in this parent's
        children list. If this node does not have a next sibling, it is None
        """
        parent = self.parent
        if parent is None:
            return None

        # Can't use index(); we need to test by identity
        for i, child in enumerate(parent.children):
            if child is self:
                try:
                    return self.parent.children[i + 1]
                except IndexError:
                    return None

    def get_previous_sibling(self):
        """
        Returns the node immediately preceding this node in this parent's
        children list. If this node does not have a previous sibling, it is
        None.
        """
        parent = self.parent
        if parent is None:
            return None

        # Can't use index(); we need to test by identity
        for i, child in enumerate(parent.children):
            if child is self:
                if i == 0:
                    return None
                return self.parent.children[i - 1]

    def get_previous_leaf(self):
        """
        Returns the previous leaf in the parser tree.
        Returns `None` if this is the first element in the parser tree.
        """
        if self.parent is None:
            return None

        node = self
        while True:
            c = node.parent.children
            i = c.index(node)
            if i == 0:
                node = node.parent
                if node.parent is None:
                    return None
            else:
                node = c[i - 1]
                break

        while True:
            try:
                node = node.children[-1]
            except AttributeError:  # A Leaf doesn't have children.
                return node

    def get_next_leaf(self):
        """
        Returns the next leaf in the parser tree.
        Returns None if this is the last element in the parser tree.
        """
        if self.parent is None:
            return None

        node = self
        while True:
            c = node.parent.children
            i = c.index(node)
            if i == len(c) - 1:
                node = node.parent
                if node.parent is None:
                    return None
            else:
                node = c[i + 1]
                break

        while True:
            try:
                node = node.children[0]
            except AttributeError:  # A Leaf doesn't have children.
                return node

    @abstractproperty
    def start_pos(self) -> Tuple[int, int]:
        """
        Returns the starting position of the prefix as a tuple, e.g. `(3, 4)`.

        :return tuple of int: (line, column)
        """

    @abstractproperty
    def end_pos(self) -> Tuple[int, int]:
        """
        Returns the end position of the prefix as a tuple, e.g. `(3, 4)`.

        :return tuple of int: (line, column)
        """

    @abstractmethod
    def get_start_pos_of_prefix(self):
        """
        Returns the start_pos of the prefix. This means basically it returns
        the end_pos of the last prefix. The `get_start_pos_of_prefix()` of the
        prefix `+` in `2 + 1` would be `(1, 1)`, while the start_pos is
        `(1, 2)`.

        :return tuple of int: (line, column)
        """

    @abstractmethod
    def get_first_leaf(self):
        """
        Returns the first leaf of a node or itself if this is a leaf.
        """

    @abstractmethod
    def get_last_leaf(self):
        """
        Returns the last leaf of a node or itself if this is a leaf.
        """

    @abstractmethod
    def get_code(self, include_prefix=True):
        """
        Returns the code that was the input for the parser for this node.

        :param include_prefix: Removes the prefix (whitespace and comments) of
            e.g. a statement.
        """

    def search_ancestor(self, *node_types: str) -> 'Optional[BaseNode]':
        """
        Recursively looks at the parents of this node or leaf and returns the
        first found node that matches ``node_types``. Returns ``None`` if no
        matching node is found.

        :param node_types: type names that are searched for.
        """
        node = self.parent
        while node is not None:
            if node.type in node_types:
                return node
            node = node.parent
        return None

    def dump(self, *, indent: Optional[Union[int, str]] = 4) -> str:
        """
        Returns a formatted dump of the parser tree rooted at this node or leaf. This is
        mainly useful for debugging purposes.

        The ``indent`` parameter is interpreted in a similar way as :py:func:`ast.dump`.
        If ``indent`` is a non-negative integer or string, then the tree will be
        pretty-printed with that indent level. An indent level of 0, negative, or ``""``
        will only insert newlines. ``None`` selects the single line representation.
        Using a positive integer indent indents that many spaces per level. If
        ``indent`` is a string (such as ``"\\t"``), that string is used to indent each
        level.

        :param indent: Indentation style as described above. The default indentation is
            4 spaces, which yields a pretty-printed dump.

        >>> import parso
        >>> print(parso.parse("lambda x, y: x + y").dump())
        Module([
            Lambda([
                Keyword('lambda', (1, 0)),
                Param([
                    Name('x', (1, 7), prefix=' '),
                    Operator(',', (1, 8)),
                ]),
                Param([
                    Name('y', (1, 10), prefix=' '),
                ]),
                Operator(':', (1, 11)),
                PythonNode('arith_expr', [
                    Name('x', (1, 13), prefix=' '),
                    Operator('+', (1, 15), prefix=' '),
                    Name('y', (1, 17), prefix=' '),
                ]),
            ]),
            EndMarker('', (1, 18)),
        ])
        """
        if indent is None:
            newline = False
            indent_string = ''
        elif isinstance(indent, int):
            newline = True
            indent_string = ' ' * indent
        elif isinstance(indent, str):
            newline = True
            indent_string = indent
        else:
            raise TypeError(f"expect 'indent' to be int, str or None, got {indent!r}")

        def _format_dump(node: NodeOrLeaf, indent: str = '', top_level: bool = True) -> str:
            result = ''
            node_type = type(node).__name__
            if isinstance(node, Leaf):
                result += f'{indent}{node_type}('
                if isinstance(node, ErrorLeaf):
                    result += f'{node.token_type!r}, '
                elif isinstance(node, TypedLeaf):
                    result += f'{node.type!r}, '
                result += f'{node.value!r}, {node.start_pos!r}'
                if node.prefix:
                    result += f', prefix={node.prefix!r}'
                result += ')'
            elif isinstance(node, BaseNode):
                result += f'{indent}{node_type}('
                if isinstance(node, Node):
                    result += f'{node.type!r}, '
                result += '['
                if newline:
                    result += '\n'
                for child in node.children:
                    result += _format_dump(child, indent=indent + indent_string, top_level=False)
                result += f'{indent}])'
            else:  # pragma: no cover
                # We shouldn't ever reach here, unless:
                # - `NodeOrLeaf` is incorrectly subclassed else where
                # - or a node's children list contains invalid nodes or leafs
                # Both are unexpected internal errors.
                raise TypeError(f'unsupported node encountered: {node!r}')
            if not top_level:
                if newline:
                    result += ',\n'
                else:
                    result += ', '
            return result

        return _format_dump(self)


class Leaf(NodeOrLeaf):
    '''
    Leafs are basically tokens with a better API. Leafs exactly know where they
    were defined and what text preceeds them.
    '''
    __slots__ = ('value', 'line', 'column', 'prefix')
    prefix: str

    def __init__(self, value: str, start_pos: Tuple[int, int], prefix: str = '') -> None:
        self.value = value
        '''
        :py:func:`str` The value of the current token.
        '''
        self.start_pos = start_pos
        self.prefix = prefix
        '''
        :py:func:`str` Typically a mixture of whitespace and comments. Stuff
        that is syntactically irrelevant for the syntax tree.
        '''
        self.parent: Optional[BaseNode] = None
        '''
        The parent :class:`BaseNode` of this leaf.
        '''

    @property
    def start_pos(self) -> Tuple[int, int]:
        return self.line, self.column

    @start_pos.setter
    def start_pos(self, value: Tuple[int, int]) -> None:
        self.line = value[0]
        self.column = value[1]

    def get_start_pos_of_prefix(self):
        previous_leaf = self.get_previous_leaf()
        if previous_leaf is None:
            lines = split_lines(self.prefix)
            # + 1 is needed because split_lines always returns at least [''].
            return self.line - len(lines) + 1, 0  # It's the first leaf.
        return previous_leaf.end_pos

    def get_first_leaf(self):
        return self

    def get_last_leaf(self):
        return self

    def get_code(self, include_prefix=True):
        if include_prefix:
            return self.prefix + self.value
        else:
            return self.value

    @property
    def end_pos(self) -> Tuple[int, int]:
        lines = split_lines(self.value)
        end_pos_line = self.line + len(lines) - 1
        # Check for multiline token
        if self.line == end_pos_line:
            end_pos_column = self.column + len(lines[-1])
        else:
            end_pos_column = len(lines[-1])
        return end_pos_line, end_pos_column

    def __repr__(self):
        value = self.value
        if not value:
            value = self.type
        return "<%s: %s>" % (type(self).__name__, value)


class TypedLeaf(Leaf):
    __slots__ = ('type',)

    def __init__(self, type, value, start_pos, prefix=''):
        super().__init__(value, start_pos, prefix)
        self.type = type


class BaseNode(NodeOrLeaf):
    """
    The super class for all nodes.
    A node has children, a type and possibly a parent node.
    """
    __slots__ = ('children',)

    def __init__(self, children: List[NodeOrLeaf]) -> None:
        self.children = children
        """
        A list of :class:`NodeOrLeaf` child nodes.
        """
        self.parent: Optional[BaseNode] = None
        '''
        The parent :class:`BaseNode` of this node.
        None if this is the root node.
        '''
        for child in children:
            child.parent = self

    @property
    def start_pos(self) -> Tuple[int, int]:
        return self.children[0].start_pos

    def get_start_pos_of_prefix(self):
        return self.children[0].get_start_pos_of_prefix()

    @property
    def end_pos(self) -> Tuple[int, int]:
        return self.children[-1].end_pos

    def _get_code_for_children(self, children, include_prefix):
        if include_prefix:
            return "".join(c.get_code() for c in children)
        else:
            first = children[0].get_code(include_prefix=False)
            return first + "".join(c.get_code() for c in children[1:])

    def get_code(self, include_prefix=True):
        return self._get_code_for_children(self.children, include_prefix)

    def get_leaf_for_position(self, position, include_prefixes=False):
        """
        Get the :py:class:`parso.tree.Leaf` at ``position``

        :param tuple position: A position tuple, row, column. Rows start from 1
        :param bool include_prefixes: If ``False``, ``None`` will be returned if ``position`` falls
            on whitespace or comments before a leaf
        :return: :py:class:`parso.tree.Leaf` at ``position``, or ``None``
        """
        def binary_search(lower, upper):
            if lower == upper:
                element = self.children[lower]
                if not include_prefixes and position < element.start_pos:
                    # We're on a prefix.
                    return None
                # In case we have prefixes, a leaf always matches
                try:
                    return element.get_leaf_for_position(position, include_prefixes)
                except AttributeError:
                    return element

            index = int((lower + upper) / 2)
            element = self.children[index]
            if position <= element.end_pos:
                return binary_search(lower, index)
            else:
                return binary_search(index + 1, upper)

        if not ((1, 0) <= position <= self.children[-1].end_pos):
            raise ValueError('Please provide a position that exists within this node.')
        return binary_search(0, len(self.children) - 1)

    def get_first_leaf(self):
        return self.children[0].get_first_leaf()

    def get_last_leaf(self):
        return self.children[-1].get_last_leaf()

    def __repr__(self):
        code = self.get_code().replace('\n', ' ').replace('\r', ' ').strip()
        return "<%s: %s@%s,%s>" % \
            (type(self).__name__, code, self.start_pos[0], self.start_pos[1])


class Node(BaseNode):
    """Concrete implementation for interior nodes."""
    __slots__ = ('type',)

    def __init__(self, type, children):
        super().__init__(children)
        self.type = type

    def __repr__(self):
        return "%s(%s, %r)" % (self.__class__.__name__, self.type, self.children)


class ErrorNode(BaseNode):
    """
    A node that contains valid nodes/leaves that we're follow by a token that
    was invalid. This basically means that the leaf after this node is where
    Python would mark a syntax error.
    """
    __slots__ = ()
    type = 'error_node'


class ErrorLeaf(Leaf):
    """
    A leaf that is either completely invalid in a language (like `$` in Python)
    or is invalid at that position. Like the star in `1 +* 1`.
    """
    __slots__ = ('token_type',)
    type = 'error_leaf'

    def __init__(self, token_type, value, start_pos, prefix=''):
        super().__init__(value, start_pos, prefix)
        self.token_type = token_type

    def __repr__(self):
        return "<%s: %s:%s, %s>" % \
            (type(self).__name__, self.token_type, repr(self.value), self.start_pos)
