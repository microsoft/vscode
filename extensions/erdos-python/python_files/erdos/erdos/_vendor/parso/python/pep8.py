import re
from contextlib import contextmanager
from typing import Tuple

from erdos.erdos._vendor.parso.python.errors import ErrorFinder, ErrorFinderConfig
from erdos.erdos._vendor.parso.normalizer import Rule
from erdos.erdos._vendor.parso.python.tree import Flow, Scope


_IMPORT_TYPES = ('import_name', 'import_from')
_SUITE_INTRODUCERS = ('classdef', 'funcdef', 'if_stmt', 'while_stmt',
                      'for_stmt', 'try_stmt', 'with_stmt')
_NON_STAR_TYPES = ('term', 'import_from', 'power')
_OPENING_BRACKETS = '(', '[', '{'
_CLOSING_BRACKETS = ')', ']', '}'
_FACTOR = '+', '-', '~'
_ALLOW_SPACE = '*', '+', '-', '**', '/', '//', '@'
_BITWISE_OPERATOR = '<<', '>>', '|', '&', '^'
_NEEDS_SPACE: Tuple[str, ...] = (
    '=', '%', '->',
    '<', '>', '==', '>=', '<=', '<>', '!=',
    '+=', '-=', '*=', '@=', '/=', '%=', '&=', '|=', '^=', '<<=',
    '>>=', '**=', '//=')
_NEEDS_SPACE += _BITWISE_OPERATOR
_IMPLICIT_INDENTATION_TYPES = ('dictorsetmaker', 'argument')
_POSSIBLE_SLICE_PARENTS = ('subscript', 'subscriptlist', 'sliceop')


class IndentationTypes:
    VERTICAL_BRACKET = object()
    HANGING_BRACKET = object()
    BACKSLASH = object()
    SUITE = object()
    IMPLICIT = object()


class IndentationNode(object):
    type = IndentationTypes.SUITE

    def __init__(self, config, indentation, parent=None):
        self.bracket_indentation = self.indentation = indentation
        self.parent = parent

    def __repr__(self):
        return '<%s>' % self.__class__.__name__

    def get_latest_suite_node(self):
        n = self
        while n is not None:
            if n.type == IndentationTypes.SUITE:
                return n

            n = n.parent


class BracketNode(IndentationNode):
    def __init__(self, config, leaf, parent, in_suite_introducer=False):
        self.leaf = leaf

        # Figure out here what the indentation is. For chained brackets
        # we can basically use the previous indentation.
        previous_leaf = leaf
        n = parent
        if n.type == IndentationTypes.IMPLICIT:
            n = n.parent
        while True:
            if hasattr(n, 'leaf') and previous_leaf.line != n.leaf.line:
                break

            previous_leaf = previous_leaf.get_previous_leaf()
            if not isinstance(n, BracketNode) or previous_leaf != n.leaf:
                break
            n = n.parent
        parent_indentation = n.indentation

        next_leaf = leaf.get_next_leaf()
        if '\n' in next_leaf.prefix or '\r' in next_leaf.prefix:
            # This implies code like:
            # foobarbaz(
            #     a,
            #     b,
            # )
            self.bracket_indentation = parent_indentation \
                + config.closing_bracket_hanging_indentation
            self.indentation = parent_indentation + config.indentation
            self.type = IndentationTypes.HANGING_BRACKET
        else:
            # Implies code like:
            # foobarbaz(
            #           a,
            #           b,
            #           )
            expected_end_indent = leaf.end_pos[1]
            if '\t' in config.indentation:
                self.indentation = None
            else:
                self.indentation = ' ' * expected_end_indent
            self.bracket_indentation = self.indentation
            self.type = IndentationTypes.VERTICAL_BRACKET

        if in_suite_introducer and parent.type == IndentationTypes.SUITE \
                and self.indentation == parent_indentation + config.indentation:
            self.indentation += config.indentation
            # The closing bracket should have the same indentation.
            self.bracket_indentation = self.indentation
        self.parent = parent


class ImplicitNode(BracketNode):
    """
    Implicit indentation after keyword arguments, default arguments,
    annotations and dict values.
    """
    def __init__(self, config, leaf, parent):
        super().__init__(config, leaf, parent)
        self.type = IndentationTypes.IMPLICIT

        next_leaf = leaf.get_next_leaf()
        if leaf == ':' and '\n' not in next_leaf.prefix and '\r' not in next_leaf.prefix:
            self.indentation += ' '


class BackslashNode(IndentationNode):
    type = IndentationTypes.BACKSLASH

    def __init__(self, config, parent_indentation, containing_leaf, spacing, parent=None):
        expr_stmt = containing_leaf.search_ancestor('expr_stmt')
        if expr_stmt is not None:
            equals = expr_stmt.children[-2]

            if '\t' in config.indentation:
                # TODO unite with the code of BracketNode
                self.indentation = None
            else:
                # If the backslash follows the equals, use normal indentation
                # otherwise it should align with the equals.
                if equals.end_pos == spacing.start_pos:
                    self.indentation = parent_indentation + config.indentation
                else:
                    # +1 because there is a space.
                    self.indentation = ' ' * (equals.end_pos[1] + 1)
        else:
            self.indentation = parent_indentation + config.indentation
        self.bracket_indentation = self.indentation
        self.parent = parent


def _is_magic_name(name):
    return name.value.startswith('__') and name.value.endswith('__')


class PEP8Normalizer(ErrorFinder):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._previous_part = None
        self._previous_leaf = None
        self._on_newline = True
        self._newline_count = 0
        self._wanted_newline_count = None
        self._max_new_lines_in_prefix = 0
        self._new_statement = True
        self._implicit_indentation_possible = False
        # The top of stack of the indentation nodes.
        self._indentation_tos = self._last_indentation_tos = \
            IndentationNode(self._config, indentation='')
        self._in_suite_introducer = False

        if ' ' in self._config.indentation:
            self._indentation_type = 'spaces'
            self._wrong_indentation_char = '\t'
        else:
            self._indentation_type = 'tabs'
            self._wrong_indentation_char = ' '

    @contextmanager
    def visit_node(self, node):
        with super().visit_node(node):
            with self._visit_node(node):
                yield

    @contextmanager
    def _visit_node(self, node):
        typ = node.type

        if typ in 'import_name':
            names = node.get_defined_names()
            if len(names) > 1:
                for name in names[:1]:
                    self.add_issue(name, 401, 'Multiple imports on one line')
        elif typ == 'lambdef':
            expr_stmt = node.parent
            # Check if it's simply defining a single name, not something like
            # foo.bar or x[1], where using a lambda could make more sense.
            if expr_stmt.type == 'expr_stmt' and any(n.type == 'name'
                                                     for n in expr_stmt.children[:-2:2]):
                self.add_issue(node, 731, 'Do not assign a lambda expression, use a def')
        elif typ == 'try_stmt':
            for child in node.children:
                # Here we can simply check if it's an except, because otherwise
                # it would be an except_clause.
                if child.type == 'keyword' and child.value == 'except':
                    self.add_issue(child, 722, 'Do not use bare except, specify exception instead')
        elif typ == 'comparison':
            for child in node.children:
                if child.type not in ('atom_expr', 'power'):
                    continue
                if len(child.children) > 2:
                    continue
                trailer = child.children[1]
                atom = child.children[0]
                if trailer.type == 'trailer' and atom.type == 'name' \
                        and atom.value == 'type':
                    self.add_issue(node, 721, "Do not compare types, use 'isinstance()")
                    break
        elif typ == 'file_input':
            endmarker = node.children[-1]
            prev = endmarker.get_previous_leaf()
            prefix = endmarker.prefix
            if (not prefix.endswith('\n') and not prefix.endswith('\r') and (
                    prefix or prev is None or prev.value not in {'\n', '\r\n', '\r'})):
                self.add_issue(endmarker, 292, "No newline at end of file")

        if typ in _IMPORT_TYPES:
            simple_stmt = node.parent
            module = simple_stmt.parent
            if module.type == 'file_input':
                index = module.children.index(simple_stmt)
                for child in module.children[:index]:
                    children = [child]
                    if child.type == 'simple_stmt':
                        # Remove the newline.
                        children = child.children[:-1]

                    found_docstring = False
                    for c in children:
                        if c.type == 'string' and not found_docstring:
                            continue
                        found_docstring = True

                        if c.type == 'expr_stmt' and \
                                all(_is_magic_name(n) for n in c.get_defined_names()):
                            continue

                        if c.type in _IMPORT_TYPES or isinstance(c, Flow):
                            continue

                        self.add_issue(node, 402, 'Module level import not at top of file')
                        break
                    else:
                        continue
                    break

        implicit_indentation_possible = typ in _IMPLICIT_INDENTATION_TYPES
        in_introducer = typ in _SUITE_INTRODUCERS
        if in_introducer:
            self._in_suite_introducer = True
        elif typ == 'suite':
            if self._indentation_tos.type == IndentationTypes.BACKSLASH:
                self._indentation_tos = self._indentation_tos.parent

            self._indentation_tos = IndentationNode(
                self._config,
                self._indentation_tos.indentation + self._config.indentation,
                parent=self._indentation_tos
            )
        elif implicit_indentation_possible:
            self._implicit_indentation_possible = True
        yield
        if typ == 'suite':
            assert self._indentation_tos.type == IndentationTypes.SUITE
            self._indentation_tos = self._indentation_tos.parent
            # If we dedent, no lines are needed anymore.
            self._wanted_newline_count = None
        elif implicit_indentation_possible:
            self._implicit_indentation_possible = False
            if self._indentation_tos.type == IndentationTypes.IMPLICIT:
                self._indentation_tos = self._indentation_tos.parent
        elif in_introducer:
            self._in_suite_introducer = False
            if typ in ('classdef', 'funcdef'):
                self._wanted_newline_count = self._get_wanted_blank_lines_count()

    def _check_tabs_spaces(self, spacing):
        if self._wrong_indentation_char in spacing.value:
            self.add_issue(spacing, 101, 'Indentation contains ' + self._indentation_type)
            return True
        return False

    def _get_wanted_blank_lines_count(self):
        suite_node = self._indentation_tos.get_latest_suite_node()
        return int(suite_node.parent is None) + 1

    def _reset_newlines(self, spacing, leaf, is_comment=False):
        self._max_new_lines_in_prefix = \
            max(self._max_new_lines_in_prefix, self._newline_count)

        wanted = self._wanted_newline_count
        if wanted is not None:
            # Need to substract one
            blank_lines = self._newline_count - 1
            if wanted > blank_lines and leaf.type != 'endmarker':
                # In case of a comment we don't need to add the issue, yet.
                if not is_comment:
                    # TODO end_pos wrong.
                    code = 302 if wanted == 2 else 301
                    message = "expected %s blank line, found %s" \
                        % (wanted, blank_lines)
                    self.add_issue(spacing, code, message)
                    self._wanted_newline_count = None
            else:
                self._wanted_newline_count = None

        if not is_comment:
            wanted = self._get_wanted_blank_lines_count()
            actual = self._max_new_lines_in_prefix - 1

            val = leaf.value
            needs_lines = (
                val == '@' and leaf.parent.type == 'decorator'
                or (
                    val == 'class'
                    or val == 'async' and leaf.get_next_leaf() == 'def'
                    or val == 'def' and self._previous_leaf != 'async'
                ) and leaf.parent.parent.type != 'decorated'
            )
            if needs_lines and actual < wanted:
                func_or_cls = leaf.parent
                suite = func_or_cls.parent
                if suite.type == 'decorated':
                    suite = suite.parent

                # The first leaf of a file or a suite should not need blank
                # lines.
                if suite.children[int(suite.type == 'suite')] != func_or_cls:
                    code = 302 if wanted == 2 else 301
                    message = "expected %s blank line, found %s" \
                        % (wanted, actual)
                    self.add_issue(spacing, code, message)

            self._max_new_lines_in_prefix = 0

        self._newline_count = 0

    def visit_leaf(self, leaf):
        super().visit_leaf(leaf)
        for part in leaf._split_prefix():
            if part.type == 'spacing':
                # This part is used for the part call after for.
                break
            self._visit_part(part, part.create_spacing_part(), leaf)

        self._analyse_non_prefix(leaf)
        self._visit_part(leaf, part, leaf)

        # Cleanup
        self._last_indentation_tos = self._indentation_tos

        self._new_statement = leaf.type == 'newline'

        # TODO does this work? with brackets and stuff?
        if leaf.type == 'newline' and \
                self._indentation_tos.type == IndentationTypes.BACKSLASH:
            self._indentation_tos = self._indentation_tos.parent

        if leaf.value == ':' and leaf.parent.type in _SUITE_INTRODUCERS:
            self._in_suite_introducer = False
        elif leaf.value == 'elif':
            self._in_suite_introducer = True

        if not self._new_statement:
            self._reset_newlines(part, leaf)
            self._max_blank_lines = 0

        self._previous_leaf = leaf

        return leaf.value

    def _visit_part(self, part, spacing, leaf):
        value = part.value
        type_ = part.type
        if type_ == 'error_leaf':
            return

        if value == ',' and part.parent.type == 'dictorsetmaker':
            self._indentation_tos = self._indentation_tos.parent

        node = self._indentation_tos

        if type_ == 'comment':
            if value.startswith('##'):
                # Whole blocks of # should not raise an error.
                if value.lstrip('#'):
                    self.add_issue(part, 266, "Too many leading '#' for block comment.")
            elif self._on_newline:
                if not re.match(r'#:? ', value) and not value == '#' \
                        and not (value.startswith('#!') and part.start_pos == (1, 0)):
                    self.add_issue(part, 265, "Block comment should start with '# '")
            else:
                if not re.match(r'#:? [^ ]', value):
                    self.add_issue(part, 262, "Inline comment should start with '# '")

            self._reset_newlines(spacing, leaf, is_comment=True)
        elif type_ == 'newline':
            if self._newline_count > self._get_wanted_blank_lines_count():
                self.add_issue(part, 303, "Too many blank lines (%s)" % self._newline_count)
            elif leaf in ('def', 'class') \
                    and leaf.parent.parent.type == 'decorated':
                self.add_issue(part, 304, "Blank lines found after function decorator")

            self._newline_count += 1

        if type_ == 'backslash':
            # TODO is this enough checking? What about ==?
            if node.type != IndentationTypes.BACKSLASH:
                if node.type != IndentationTypes.SUITE:
                    self.add_issue(part, 502, 'The backslash is redundant between brackets')
                else:
                    indentation = node.indentation
                    if self._in_suite_introducer and node.type == IndentationTypes.SUITE:
                        indentation += self._config.indentation

                    self._indentation_tos = BackslashNode(
                        self._config,
                        indentation,
                        part,
                        spacing,
                        parent=self._indentation_tos
                    )
        elif self._on_newline:
            indentation = spacing.value
            if node.type == IndentationTypes.BACKSLASH \
                    and self._previous_part.type == 'newline':
                self._indentation_tos = self._indentation_tos.parent

            if not self._check_tabs_spaces(spacing):
                should_be_indentation = node.indentation
                if type_ == 'comment':
                    # Comments can be dedented. So we have to care for that.
                    n = self._last_indentation_tos
                    while True:
                        if len(indentation) > len(n.indentation):
                            break

                        should_be_indentation = n.indentation

                        self._last_indentation_tos = n
                        if n == node:
                            break
                        n = n.parent

                if self._new_statement:
                    if type_ == 'newline':
                        if indentation:
                            self.add_issue(spacing, 291, 'Trailing whitespace')
                    elif indentation != should_be_indentation:
                        s = '%s %s' % (len(self._config.indentation), self._indentation_type)
                        self.add_issue(part, 111, 'Indentation is not a multiple of ' + s)
                else:
                    if value in '])}':
                        should_be_indentation = node.bracket_indentation
                    else:
                        should_be_indentation = node.indentation
                    if self._in_suite_introducer and indentation == \
                            node.get_latest_suite_node().indentation \
                            + self._config.indentation:
                        self.add_issue(part, 129, "Line with same indent as next logical block")
                    elif indentation != should_be_indentation:
                        if not self._check_tabs_spaces(spacing) and part.value not in \
                                {'\n', '\r\n', '\r'}:
                            if value in '])}':
                                if node.type == IndentationTypes.VERTICAL_BRACKET:
                                    self.add_issue(
                                        part,
                                        124,
                                        "Closing bracket does not match visual indentation"
                                    )
                                else:
                                    self.add_issue(
                                        part,
                                        123,
                                        "Losing bracket does not match "
                                        "indentation of opening bracket's line"
                                    )
                            else:
                                if len(indentation) < len(should_be_indentation):
                                    if node.type == IndentationTypes.VERTICAL_BRACKET:
                                        self.add_issue(
                                            part,
                                            128,
                                            'Continuation line under-indented for visual indent'
                                        )
                                    elif node.type == IndentationTypes.BACKSLASH:
                                        self.add_issue(
                                            part,
                                            122,
                                            'Continuation line missing indentation or outdented'
                                        )
                                    elif node.type == IndentationTypes.IMPLICIT:
                                        self.add_issue(part, 135, 'xxx')
                                    else:
                                        self.add_issue(
                                            part,
                                            121,
                                            'Continuation line under-indented for hanging indent'
                                        )
                                else:
                                    if node.type == IndentationTypes.VERTICAL_BRACKET:
                                        self.add_issue(
                                            part,
                                            127,
                                            'Continuation line over-indented for visual indent'
                                        )
                                    elif node.type == IndentationTypes.IMPLICIT:
                                        self.add_issue(part, 136, 'xxx')
                                    else:
                                        self.add_issue(
                                            part,
                                            126,
                                            'Continuation line over-indented for hanging indent'
                                        )
        else:
            self._check_spacing(part, spacing)

        self._check_line_length(part, spacing)
        # -------------------------------
        # Finalizing. Updating the state.
        # -------------------------------
        if value and value in '()[]{}' and type_ != 'error_leaf' \
                and part.parent.type != 'error_node':
            if value in _OPENING_BRACKETS:
                self._indentation_tos = BracketNode(
                    self._config, part,
                    parent=self._indentation_tos,
                    in_suite_introducer=self._in_suite_introducer
                )
            else:
                assert node.type != IndentationTypes.IMPLICIT
                self._indentation_tos = self._indentation_tos.parent
        elif value in ('=', ':') and self._implicit_indentation_possible \
                and part.parent.type in _IMPLICIT_INDENTATION_TYPES:
            indentation = node.indentation
            self._indentation_tos = ImplicitNode(
                self._config, part, parent=self._indentation_tos
            )

        self._on_newline = type_ in ('newline', 'backslash', 'bom')

        self._previous_part = part
        self._previous_spacing = spacing

    def _check_line_length(self, part, spacing):
        if part.type == 'backslash':
            last_column = part.start_pos[1] + 1
        else:
            last_column = part.end_pos[1]
        if last_column > self._config.max_characters \
                and spacing.start_pos[1] <= self._config.max_characters:
            # Special case for long URLs in multi-line docstrings or comments,
            # but still report the error when the 72 first chars are whitespaces.
            report = True
            if part.type == 'comment':
                splitted = part.value[1:].split()
                if len(splitted) == 1 \
                        and (part.end_pos[1] - len(splitted[0])) < 72:
                    report = False
            if report:
                self.add_issue(
                    part,
                    501,
                    'Line too long (%s > %s characters)' %
                    (last_column, self._config.max_characters),
                )

    def _check_spacing(self, part, spacing):
        def add_if_spaces(*args):
            if spaces:
                return self.add_issue(*args)

        def add_not_spaces(*args):
            if not spaces:
                return self.add_issue(*args)

        spaces = spacing.value
        prev = self._previous_part
        if prev is not None and prev.type == 'error_leaf' or part.type == 'error_leaf':
            return

        type_ = part.type
        if '\t' in spaces:
            self.add_issue(spacing, 223, 'Used tab to separate tokens')
        elif type_ == 'comment':
            if len(spaces) < self._config.spaces_before_comment:
                self.add_issue(spacing, 261, 'At least two spaces before inline comment')
        elif type_ == 'newline':
            add_if_spaces(spacing, 291, 'Trailing whitespace')
        elif len(spaces) > 1:
            self.add_issue(spacing, 221, 'Multiple spaces used')
        else:
            if prev in _OPENING_BRACKETS:
                message = "Whitespace after '%s'" % part.value
                add_if_spaces(spacing, 201, message)
            elif part in _CLOSING_BRACKETS:
                message = "Whitespace before '%s'" % part.value
                add_if_spaces(spacing, 202, message)
            elif part in (',', ';') or part == ':' \
                    and part.parent.type not in _POSSIBLE_SLICE_PARENTS:
                message = "Whitespace before '%s'" % part.value
                add_if_spaces(spacing, 203, message)
            elif prev == ':' and prev.parent.type in _POSSIBLE_SLICE_PARENTS:
                pass  # TODO
            elif prev in (',', ';', ':'):
                add_not_spaces(spacing, 231, "missing whitespace after '%s'")
            elif part == ':':  # Is a subscript
                # TODO
                pass
            elif part in ('*', '**') and part.parent.type not in _NON_STAR_TYPES \
                    or prev in ('*', '**') \
                    and prev.parent.type not in _NON_STAR_TYPES:
                # TODO
                pass
            elif prev in _FACTOR and prev.parent.type == 'factor':
                pass
            elif prev == '@' and prev.parent.type == 'decorator':
                pass  # TODO should probably raise an error if there's a space here
            elif part in _NEEDS_SPACE or prev in _NEEDS_SPACE:
                if part == '=' and part.parent.type in ('argument', 'param') \
                        or prev == '=' and prev.parent.type in ('argument', 'param'):
                    if part == '=':
                        param = part.parent
                    else:
                        param = prev.parent
                    if param.type == 'param' and param.annotation:
                        add_not_spaces(spacing, 252, 'Expected spaces around annotation equals')
                    else:
                        add_if_spaces(
                            spacing,
                            251,
                            'Unexpected spaces around keyword / parameter equals'
                        )
                elif part in _BITWISE_OPERATOR or prev in _BITWISE_OPERATOR:
                    add_not_spaces(
                        spacing,
                        227,
                        'Missing whitespace around bitwise or shift operator'
                    )
                elif part == '%' or prev == '%':
                    add_not_spaces(spacing, 228, 'Missing whitespace around modulo operator')
                else:
                    message_225 = 'Missing whitespace between tokens'
                    add_not_spaces(spacing, 225, message_225)
            elif type_ == 'keyword' or prev.type == 'keyword':
                add_not_spaces(spacing, 275, 'Missing whitespace around keyword')
            else:
                prev_spacing = self._previous_spacing
                if prev in _ALLOW_SPACE and spaces != prev_spacing.value \
                        and '\n' not in self._previous_leaf.prefix \
                        and '\r' not in self._previous_leaf.prefix:
                    message = "Whitespace before operator doesn't match with whitespace after"
                    self.add_issue(spacing, 229, message)

                if spaces and part not in _ALLOW_SPACE and prev not in _ALLOW_SPACE:
                    message_225 = 'Missing whitespace between tokens'
                    # self.add_issue(spacing, 225, message_225)
                    # TODO why only brackets?
                    if part in _OPENING_BRACKETS:
                        message = "Whitespace before '%s'" % part.value
                        add_if_spaces(spacing, 211, message)

    def _analyse_non_prefix(self, leaf):
        typ = leaf.type
        if typ == 'name' and leaf.value in ('l', 'O', 'I'):
            if leaf.is_definition():
                message = "Do not define %s named 'l', 'O', or 'I' one line"
                if leaf.parent.type == 'class' and leaf.parent.name == leaf:
                    self.add_issue(leaf, 742, message % 'classes')
                elif leaf.parent.type == 'function' and leaf.parent.name == leaf:
                    self.add_issue(leaf, 743, message % 'function')
                else:
                    self.add_issuadd_issue(741, message % 'variables', leaf)
        elif leaf.value == ':':
            if isinstance(leaf.parent, (Flow, Scope)) and leaf.parent.type != 'lambdef':
                next_leaf = leaf.get_next_leaf()
                if next_leaf.type != 'newline':
                    if leaf.parent.type == 'funcdef':
                        self.add_issue(next_leaf, 704, 'Multiple statements on one line (def)')
                    else:
                        self.add_issue(next_leaf, 701, 'Multiple statements on one line (colon)')
        elif leaf.value == ';':
            if leaf.get_next_leaf().type in ('newline', 'endmarker'):
                self.add_issue(leaf, 703, 'Statement ends with a semicolon')
            else:
                self.add_issue(leaf, 702, 'Multiple statements on one line (semicolon)')
        elif leaf.value in ('==', '!='):
            comparison = leaf.parent
            index = comparison.children.index(leaf)
            left = comparison.children[index - 1]
            right = comparison.children[index + 1]
            for node in left, right:
                if node.type == 'keyword' or node.type == 'name':
                    if node.value == 'None':
                        message = "comparison to None should be 'if cond is None:'"
                        self.add_issue(leaf, 711, message)
                        break
                    elif node.value in ('True', 'False'):
                        message = "comparison to False/True should be " \
                                  "'if cond is True:' or 'if cond:'"
                        self.add_issue(leaf, 712, message)
                        break
        elif leaf.value in ('in', 'is'):
            comparison = leaf.parent
            if comparison.type == 'comparison' and comparison.parent.type == 'not_test':
                if leaf.value == 'in':
                    self.add_issue(leaf, 713, "test for membership should be 'not in'")
                else:
                    self.add_issue(leaf, 714, "test for object identity should be 'is not'")
        elif typ == 'string':
            # Checking multiline strings
            for i, line in enumerate(leaf.value.splitlines()[1:]):
                indentation = re.match(r'[ \t]*', line).group(0)
                start_pos = leaf.line + i, len(indentation)
                # TODO check multiline indentation.
                start_pos
        elif typ == 'endmarker':
            if self._newline_count >= 2:
                self.add_issue(leaf, 391, 'Blank line at end of file')

    def add_issue(self, node, code, message):
        if self._previous_leaf is not None:
            if self._previous_leaf.search_ancestor('error_node') is not None:
                return
            if self._previous_leaf.type == 'error_leaf':
                return
        if node.search_ancestor('error_node') is not None:
            return
        if code in (901, 903):
            # 901 and 903 are raised by the ErrorFinder.
            super().add_issue(node, code, message)
        else:
            # Skip ErrorFinder here, because it has custom behavior.
            super(ErrorFinder, self).add_issue(node, code, message)


class PEP8NormalizerConfig(ErrorFinderConfig):
    normalizer_class = PEP8Normalizer
    """
    Normalizing to PEP8. Not really implemented, yet.
    """
    def __init__(self, indentation=' ' * 4, hanging_indentation=None,
                 max_characters=79, spaces_before_comment=2):
        self.indentation = indentation
        if hanging_indentation is None:
            hanging_indentation = indentation
        self.hanging_indentation = hanging_indentation
        self.closing_bracket_hanging_indentation = ''
        self.break_after_binary = False
        self.max_characters = max_characters
        self.spaces_before_comment = spaces_before_comment


# TODO this is not yet ready.
# @PEP8Normalizer.register_rule(type='endmarker')
class BlankLineAtEnd(Rule):
    code = 392
    message = 'Blank line at end of file'

    def is_issue(self, leaf):
        return self._newline_count >= 2
