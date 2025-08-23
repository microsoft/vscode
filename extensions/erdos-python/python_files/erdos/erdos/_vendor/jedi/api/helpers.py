"""
Helpers for the API
"""
import re
from collections import namedtuple
from textwrap import dedent
from itertools import chain
from functools import wraps
from inspect import Parameter

from erdos.erdos._vendor.parso.python.parser import Parser
from erdos.erdos._vendor.parso.python import tree

from erdos.erdos._vendor.jedi.inference.base_value import NO_VALUES
from erdos.erdos._vendor.jedi.inference.syntax_tree import infer_atom
from erdos.erdos._vendor.jedi.inference.helpers import infer_call_of_leaf
from erdos.erdos._vendor.jedi.inference.compiled import get_string_value_set
from erdos.erdos._vendor.jedi.cache import signature_time_cache, memoize_method
from erdos.erdos._vendor.jedi.parser_utils import get_parent_scope


CompletionParts = namedtuple('CompletionParts', ['path', 'has_dot', 'name'])


def _start_match(string, like_name):
    return string.startswith(like_name)


def _fuzzy_match(string, like_name):
    if len(like_name) <= 1:
        return like_name in string
    pos = string.find(like_name[0])
    if pos >= 0:
        return _fuzzy_match(string[pos + 1:], like_name[1:])
    return False


def match(string, like_name, fuzzy=False):
    if fuzzy:
        return _fuzzy_match(string, like_name)
    else:
        return _start_match(string, like_name)


def sorted_definitions(defs):
    # Note: `or ''` below is required because `module_path` could be
    return sorted(defs, key=lambda x: (str(x.module_path or ''),
                                       x.line or 0,
                                       x.column or 0,
                                       x.name))


def get_on_completion_name(module_node, lines, position):
    leaf = module_node.get_leaf_for_position(position)
    if leaf is None or leaf.type in ('string', 'error_leaf'):
        # Completions inside strings are a bit special, we need to parse the
        # string. The same is true for comments and error_leafs.
        line = lines[position[0] - 1]
        # The first step of completions is to get the name
        return re.search(r'(?!\d)\w+$|$', line[:position[1]]).group(0)
    elif leaf.type not in ('name', 'keyword'):
        return ''

    return leaf.value[:position[1] - leaf.start_pos[1]]


def _get_code(code_lines, start_pos, end_pos):
    # Get relevant lines.
    lines = code_lines[start_pos[0] - 1:end_pos[0]]
    # Remove the parts at the end of the line.
    lines[-1] = lines[-1][:end_pos[1]]
    # Remove first line indentation.
    lines[0] = lines[0][start_pos[1]:]
    return ''.join(lines)


class OnErrorLeaf(Exception):
    @property
    def error_leaf(self):
        return self.args[0]


def _get_code_for_stack(code_lines, leaf, position):
    # It might happen that we're on whitespace or on a comment. This means
    # that we would not get the right leaf.
    if leaf.start_pos >= position:
        # If we're not on a comment simply get the previous leaf and proceed.
        leaf = leaf.get_previous_leaf()
        if leaf is None:
            return ''  # At the beginning of the file.

    is_after_newline = leaf.type == 'newline'
    while leaf.type == 'newline':
        leaf = leaf.get_previous_leaf()
        if leaf is None:
            return ''

    if leaf.type == 'error_leaf' or leaf.type == 'string':
        if leaf.start_pos[0] < position[0]:
            # On a different line, we just begin anew.
            return ''

        # Error leafs cannot be parsed, completion in strings is also
        # impossible.
        raise OnErrorLeaf(leaf)
    else:
        user_stmt = leaf
        while True:
            if user_stmt.parent.type in ('file_input', 'suite', 'simple_stmt'):
                break
            user_stmt = user_stmt.parent

        if is_after_newline:
            if user_stmt.start_pos[1] > position[1]:
                # This means that it's actually a dedent and that means that we
                # start without value (part of a suite).
                return ''

        # This is basically getting the relevant lines.
        return _get_code(code_lines, user_stmt.get_start_pos_of_prefix(), position)


def get_stack_at_position(grammar, code_lines, leaf, pos):
    """
    Returns the possible node names (e.g. import_from, xor_test or yield_stmt).
    """
    class EndMarkerReached(Exception):
        pass

    def tokenize_without_endmarker(code):
        # TODO This is for now not an official parso API that exists purely
        #   for Jedi.
        tokens = grammar._tokenize(code)
        for token in tokens:
            if token.string == safeword:
                raise EndMarkerReached()
            elif token.prefix.endswith(safeword):
                # This happens with comments.
                raise EndMarkerReached()
            elif token.string.endswith(safeword):
                yield token  # Probably an f-string literal that was not finished.
                raise EndMarkerReached()
            else:
                yield token

    # The code might be indedented, just remove it.
    code = dedent(_get_code_for_stack(code_lines, leaf, pos))
    # We use a word to tell Jedi when we have reached the start of the
    # completion.
    # Use Z as a prefix because it's not part of a number suffix.
    safeword = 'ZZZ_USER_WANTS_TO_COMPLETE_HERE_WITH_JEDI'
    code = code + ' ' + safeword

    p = Parser(grammar._pgen_grammar, error_recovery=True)
    try:
        p.parse(tokens=tokenize_without_endmarker(code))
    except EndMarkerReached:
        return p.stack
    raise SystemError(
        "This really shouldn't happen. There's a bug in Jedi:\n%s"
        % list(tokenize_without_endmarker(code))
    )


def infer(inference_state, context, leaf):
    if leaf.type == 'name':
        return inference_state.infer(context, leaf)

    parent = leaf.parent
    definitions = NO_VALUES
    if parent.type == 'atom':
        # e.g. `(a + b)`
        definitions = context.infer_node(leaf.parent)
    elif parent.type == 'trailer':
        # e.g. `a()`
        definitions = infer_call_of_leaf(context, leaf)
    elif isinstance(leaf, tree.Literal):
        # e.g. `"foo"` or `1.0`
        return infer_atom(context, leaf)
    elif leaf.type in ('fstring_string', 'fstring_start', 'fstring_end'):
        return get_string_value_set(inference_state)
    return definitions


def filter_follow_imports(names, follow_builtin_imports=False):
    for name in names:
        if name.is_import():
            new_names = list(filter_follow_imports(
                name.goto(),
                follow_builtin_imports=follow_builtin_imports,
            ))
            found_builtin = False
            if follow_builtin_imports:
                for new_name in new_names:
                    if new_name.start_pos is None:
                        found_builtin = True

            if found_builtin:
                yield name
            else:
                yield from new_names
        else:
            yield name


class CallDetails:
    def __init__(self, bracket_leaf, children, position):
        self.bracket_leaf = bracket_leaf
        self._children = children
        self._position = position

    @property
    def index(self):
        return _get_index_and_key(self._children, self._position)[0]

    @property
    def keyword_name_str(self):
        return _get_index_and_key(self._children, self._position)[1]

    @memoize_method
    def _list_arguments(self):
        return list(_iter_arguments(self._children, self._position))

    def calculate_index(self, param_names):
        positional_count = 0
        used_names = set()
        star_count = -1
        args = self._list_arguments()
        if not args:
            if param_names:
                return 0
            else:
                return None

        is_kwarg = False
        for i, (star_count, key_start, had_equal) in enumerate(args):
            is_kwarg |= had_equal | (star_count == 2)
            if star_count:
                pass  # For now do nothing, we don't know what's in there here.
            else:
                if i + 1 != len(args):  # Not last
                    if had_equal:
                        used_names.add(key_start)
                    else:
                        positional_count += 1

        for i, param_name in enumerate(param_names):
            kind = param_name.get_kind()

            if not is_kwarg:
                if kind == Parameter.VAR_POSITIONAL:
                    return i
                if kind in (Parameter.POSITIONAL_OR_KEYWORD, Parameter.POSITIONAL_ONLY):
                    if i == positional_count:
                        return i

            if key_start is not None and not star_count == 1 or star_count == 2:
                if param_name.string_name not in used_names \
                        and (kind == Parameter.KEYWORD_ONLY
                             or kind == Parameter.POSITIONAL_OR_KEYWORD
                             and positional_count <= i):
                    if star_count:
                        return i
                    if had_equal:
                        if param_name.string_name == key_start:
                            return i
                    else:
                        if param_name.string_name.startswith(key_start):
                            return i

                if kind == Parameter.VAR_KEYWORD:
                    return i
        return None

    def iter_used_keyword_arguments(self):
        for star_count, key_start, had_equal in list(self._list_arguments()):
            if had_equal and key_start:
                yield key_start

    def count_positional_arguments(self):
        count = 0
        for star_count, key_start, had_equal in self._list_arguments()[:-1]:
            if star_count or key_start:
                break
            count += 1
        return count


def _iter_arguments(nodes, position):
    def remove_after_pos(name):
        if name.type != 'name':
            return None
        return name.value[:position[1] - name.start_pos[1]]

    # Returns Generator[Tuple[star_count, Optional[key_start: str], had_equal]]
    nodes_before = [c for c in nodes if c.start_pos < position]
    if nodes_before[-1].type == 'arglist':
        yield from _iter_arguments(nodes_before[-1].children, position)
        return

    previous_node_yielded = False
    stars_seen = 0
    for i, node in enumerate(nodes_before):
        if node.type == 'argument':
            previous_node_yielded = True
            first = node.children[0]
            second = node.children[1]
            if second == '=':
                if second.start_pos < position and first.type == 'name':
                    yield 0, first.value, True
                else:
                    yield 0, remove_after_pos(first), False
            elif first in ('*', '**'):
                yield len(first.value), remove_after_pos(second), False
            else:
                # Must be a Comprehension
                first_leaf = node.get_first_leaf()
                if first_leaf.type == 'name' and first_leaf.start_pos >= position:
                    yield 0, remove_after_pos(first_leaf), False
                else:
                    yield 0, None, False
            stars_seen = 0
        elif node.type == 'testlist_star_expr':
            for n in node.children[::2]:
                if n.type == 'star_expr':
                    stars_seen = 1
                    n = n.children[1]
                yield stars_seen, remove_after_pos(n), False
                stars_seen = 0
            # The count of children is even if there's a comma at the end.
            previous_node_yielded = bool(len(node.children) % 2)
        elif isinstance(node, tree.PythonLeaf) and node.value == ',':
            if not previous_node_yielded:
                yield stars_seen, '', False
                stars_seen = 0
            previous_node_yielded = False
        elif isinstance(node, tree.PythonLeaf) and node.value in ('*', '**'):
            stars_seen = len(node.value)
        elif node == '=' and nodes_before[-1]:
            previous_node_yielded = True
            before = nodes_before[i - 1]
            if before.type == 'name':
                yield 0, before.value, True
            else:
                yield 0, None, False
            # Just ignore the star that is probably a syntax error.
            stars_seen = 0

    if not previous_node_yielded:
        if nodes_before[-1].type == 'name':
            yield stars_seen, remove_after_pos(nodes_before[-1]), False
        else:
            yield stars_seen, '', False


def _get_index_and_key(nodes, position):
    """
    Returns the amount of commas and the keyword argument string.
    """
    nodes_before = [c for c in nodes if c.start_pos < position]
    if nodes_before[-1].type == 'arglist':
        return _get_index_and_key(nodes_before[-1].children, position)

    key_str = None

    last = nodes_before[-1]
    if last.type == 'argument' and last.children[1] == '=' \
            and last.children[1].end_pos <= position:
        # Checked if the argument
        key_str = last.children[0].value
    elif last == '=':
        key_str = nodes_before[-2].value

    return nodes_before.count(','), key_str


def _get_signature_details_from_error_node(node, additional_children, position):
    for index, element in reversed(list(enumerate(node.children))):
        # `index > 0` means that it's a trailer and not an atom.
        if element == '(' and element.end_pos <= position and index > 0:
            # It's an error node, we don't want to match too much, just
            # until the parentheses is enough.
            children = node.children[index:]
            name = element.get_previous_leaf()
            if name is None:
                continue
            if name.type == 'name' or name.parent.type in ('trailer', 'atom'):
                return CallDetails(element, children + additional_children, position)


def get_signature_details(module, position):
    leaf = module.get_leaf_for_position(position, include_prefixes=True)
    # It's easier to deal with the previous token than the next one in this
    # case.
    if leaf.start_pos >= position:
        # Whitespace / comments after the leaf count towards the previous leaf.
        leaf = leaf.get_previous_leaf()
        if leaf is None:
            return None

    # Now that we know where we are in the syntax tree, we start to look at
    # parents for possible function definitions.
    node = leaf.parent
    while node is not None:
        if node.type in ('funcdef', 'classdef', 'decorated', 'async_stmt'):
            # Don't show signatures if there's stuff before it that just
            # makes it feel strange to have a signature.
            return None

        additional_children = []
        for n in reversed(node.children):
            if n.start_pos < position:
                if n.type == 'error_node':
                    result = _get_signature_details_from_error_node(
                        n, additional_children, position
                    )
                    if result is not None:
                        return result

                    additional_children[0:0] = n.children
                    continue
                additional_children.insert(0, n)

        # Find a valid trailer
        if node.type == 'trailer' and node.children[0] == '(' \
                or node.type == 'decorator' and node.children[2] == '(':
            # Additionally we have to check that an ending parenthesis isn't
            # interpreted wrong. There are two cases:
            # 1. Cursor before paren -> The current signature is good
            # 2. Cursor after paren -> We need to skip the current signature
            if not (leaf is node.children[-1] and position >= leaf.end_pos):
                leaf = node.get_previous_leaf()
                if leaf is None:
                    return None
                return CallDetails(
                    node.children[0] if node.type == 'trailer' else node.children[2],
                    node.children,
                    position
                )

        node = node.parent

    return None


@signature_time_cache("call_signatures_validity")
def cache_signatures(inference_state, context, bracket_leaf, code_lines, user_pos):
    """This function calculates the cache key."""
    line_index = user_pos[0] - 1

    before_cursor = code_lines[line_index][:user_pos[1]]
    other_lines = code_lines[bracket_leaf.start_pos[0]:line_index]
    whole = ''.join(other_lines + [before_cursor])
    before_bracket = re.match(r'.*\(', whole, re.DOTALL)

    module_path = context.get_root_context().py__file__()
    if module_path is None:
        yield None  # Don't cache!
    else:
        yield (module_path, before_bracket, bracket_leaf.start_pos)
    yield infer(
        inference_state,
        context,
        bracket_leaf.get_previous_leaf(),
    )


def validate_line_column(func):
    @wraps(func)
    def wrapper(self, line=None, column=None, *args, **kwargs):
        line = max(len(self._code_lines), 1) if line is None else line
        if not (0 < line <= len(self._code_lines)):
            raise ValueError('`line` parameter is not in a valid range.')

        line_string = self._code_lines[line - 1]
        line_len = len(line_string)
        if line_string.endswith('\r\n'):
            line_len -= 2
        elif line_string.endswith('\n'):
            line_len -= 1

        column = line_len if column is None else column
        if not (0 <= column <= line_len):
            raise ValueError('`column` parameter (%d) is not in a valid range '
                             '(0-%d) for line %d (%r).' % (
                                 column, line_len, line, line_string))
        return func(self, line, column, *args, **kwargs)
    return wrapper


def get_module_names(module, all_scopes, definitions=True, references=False):
    """
    Returns a dictionary with name parts as keys and their call paths as
    values.
    """
    def def_ref_filter(name):
        is_def = name.is_definition()
        return definitions and is_def or references and not is_def

    names = list(chain.from_iterable(module.get_used_names().values()))
    if not all_scopes:
        # We have to filter all the names that don't have the module as a
        # parent_scope. There's None as a parent, because nodes in the module
        # node have the parent module and not suite as all the others.
        # Therefore it's important to catch that case.

        def is_module_scope_name(name):
            parent_scope = get_parent_scope(name)
            # async functions have an extra wrapper. Strip it.
            if parent_scope and parent_scope.type == 'async_stmt':
                parent_scope = parent_scope.parent
            return parent_scope in (module, None)

        names = [n for n in names if is_module_scope_name(n)]
    return filter(def_ref_filter, names)


def split_search_string(name):
    type, _, dotted_names = name.rpartition(' ')
    if type == 'def':
        type = 'function'
    return type, dotted_names.split('.')
