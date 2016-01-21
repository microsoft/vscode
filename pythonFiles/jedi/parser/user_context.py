import re
import os
import keyword

from jedi import cache
from jedi import common
from jedi.parser import tokenize, Parser
from jedi._compatibility import u
from jedi.parser.fast import FastParser
from jedi.parser import tree
from jedi import debug
from jedi.common import PushBackIterator


REPLACE_STR = r"[bBuU]?[rR]?" + (r"(?:(')[^\n'\\]*(?:\\.[^\n'\\]*)*(?:'|$)" +
                                 '|' +
                                 r'(")[^\n"\\]*(?:\\.[^\n"\\]*)*(?:"|$))')
REPLACE_STR = re.compile(REPLACE_STR)


class UserContext(object):
    """
    :param source: The source code of the file.
    :param position: The position, the user is currently in. Only important \
    for the main file.
    """
    def __init__(self, source, position):
        self.source = source
        self.position = position
        self._line_cache = None

        self._relevant_temp = None

    @cache.underscore_memoization
    def get_path_until_cursor(self):
        """ Get the path under the cursor. """
        path, self._start_cursor_pos = self._calc_path_until_cursor(self.position)
        return path

    def _backwards_line_generator(self, start_pos):
        self._line_temp, self._column_temp = start_pos
        first_line = self.get_line(start_pos[0])[:self._column_temp]

        self._line_length = self._column_temp
        yield first_line[::-1] + '\n'

        while True:
            self._line_temp -= 1
            line = self.get_line(self._line_temp)
            self._line_length = len(line)
            yield line[::-1] + '\n'

    def _get_backwards_tokenizer(self, start_pos, line_gen=None):
        if line_gen is None:
            line_gen = self._backwards_line_generator(start_pos)
        token_gen = tokenize.generate_tokens(lambda: next(line_gen))
        for typ, tok_str, tok_start_pos, prefix in token_gen:
            line = self.get_line(self._line_temp)
            # Calculate the real start_pos of the token.
            if tok_start_pos[0] == 1:
                # We are in the first checked line
                column = start_pos[1] - tok_start_pos[1]
            else:
                column = len(line) - tok_start_pos[1]
            # Multi-line docstrings must be accounted for.
            first_line = common.splitlines(tok_str)[0]
            column -= len(first_line)
            # Reverse the token again, so that it is in normal order again.
            yield typ, tok_str[::-1], (self._line_temp, column), prefix[::-1]

    def _calc_path_until_cursor(self, start_pos):
        """
        Something like a reverse tokenizer that tokenizes the reversed strings.
        """
        open_brackets = ['(', '[', '{']
        close_brackets = [')', ']', '}']

        start_cursor = start_pos
        gen = PushBackIterator(self._get_backwards_tokenizer(start_pos))
        string = u('')
        level = 0
        force_point = False
        last_type = None
        is_first = True
        for tok_type, tok_str, tok_start_pos, prefix in gen:
            if is_first:
                if prefix:  # whitespace is not a path
                    return u(''), start_cursor
                is_first = False

            if last_type == tok_type == tokenize.NAME:
                string = ' ' + string

            if level:
                if tok_str in close_brackets:
                    level += 1
                elif tok_str in open_brackets:
                    level -= 1
            elif tok_str == '.':
                force_point = False
            elif force_point:
                # Reversed tokenizing, therefore a number is recognized as a
                # floating point number.
                # The same is true for string prefixes -> represented as a
                # combination of string and name.
                if tok_type == tokenize.NUMBER and tok_str[-1] == '.' \
                        or tok_type == tokenize.NAME and last_type == tokenize.STRING \
                        and tok_str.lower() in ('b', 'u', 'r', 'br', 'ur'):
                    force_point = False
                else:
                    break
            elif tok_str in close_brackets:
                level += 1
            elif tok_type in [tokenize.NAME, tokenize.STRING]:
                if keyword.iskeyword(tok_str) and string:
                    # If there's already something in the string, a keyword
                    # never adds any meaning to the current statement.
                    break
                force_point = True
            elif tok_type == tokenize.NUMBER:
                pass
            else:
                if tok_str == '-':
                    next_tok = next(gen)
                    if next_tok[1] == 'e':
                        gen.push_back(next_tok)
                    else:
                        break
                else:
                    break

            start_cursor = tok_start_pos
            string = tok_str + prefix + string
            last_type = tok_type

        # Don't need whitespace around a statement.
        return string.strip(), start_cursor

    def get_path_under_cursor(self):
        """
        Return the path under the cursor. If there is a rest of the path left,
        it will be added to the stuff before it.
        """
        return self.get_path_until_cursor() + self.get_path_after_cursor()

    def get_path_after_cursor(self):
        line = self.get_line(self.position[0])
        return re.search("[\w\d]*", line[self.position[1]:]).group(0)

    def get_operator_under_cursor(self):
        line = self.get_line(self.position[0])
        after = re.match("[^\w\s]+", line[self.position[1]:])
        before = re.match("[^\w\s]+", line[:self.position[1]][::-1])
        return (before.group(0) if before is not None else '') \
            + (after.group(0) if after is not None else '')

    def call_signature(self):
        """
        :return: Tuple of string of the call and the index of the cursor.
        """
        def get_line(pos):
            def simplify_str(match):
                """
                To avoid having strings without end marks (error tokens) and
                strings that just screw up all the call signatures, just
                simplify everything.
                """
                mark = match.group(1) or match.group(2)
                return mark + ' ' * (len(match.group(0)) - 2) + mark

            line_gen = self._backwards_line_generator(pos)
            for line in line_gen:
                # We have to switch the already backwards lines twice, because
                # we scan them from start.
                line = line[::-1]
                modified = re.sub(REPLACE_STR, simplify_str, line)
                yield modified[::-1]

        index = 0
        level = 0
        next_must_be_name = False
        next_is_key = False
        key_name = None
        generator = self._get_backwards_tokenizer(self.position, get_line(self.position))
        for tok_type, tok_str, start_pos, prefix in generator:
            if tok_str in tokenize.ALWAYS_BREAK_TOKENS:
                break
            elif next_must_be_name:
                if tok_type == tokenize.NUMBER:
                    # If there's a number at the end of the string, it will be
                    # tokenized as a number. So add it to the name.
                    tok_type, t, _, _ = next(generator)
                if tok_type == tokenize.NAME:
                    end_pos = start_pos[0], start_pos[1] + len(tok_str)
                    call, start_pos = self._calc_path_until_cursor(start_pos=end_pos)
                    return call, index, key_name, start_pos
                index = 0
                next_must_be_name = False
            elif next_is_key:
                if tok_type == tokenize.NAME:
                    key_name = tok_str
                next_is_key = False

            if tok_str == '(':
                level += 1
                if level == 1:
                    next_must_be_name = True
                    level = 0
            elif tok_str == ')':
                level -= 1
            elif tok_str == ',':
                index += 1
            elif tok_str == '=':
                next_is_key = True
        return None, 0, None, (0, 0)

    def get_context(self, yield_positions=False):
        self.get_path_until_cursor()  # In case _start_cursor_pos is undefined.
        pos = self._start_cursor_pos
        while True:
            # remove non important white space
            line = self.get_line(pos[0])
            while True:
                if pos[1] == 0:
                    line = self.get_line(pos[0] - 1)
                    if line and line[-1] == '\\':
                        pos = pos[0] - 1, len(line) - 1
                        continue
                    else:
                        break

                if line[pos[1] - 1].isspace():
                    pos = pos[0], pos[1] - 1
                else:
                    break

            try:
                result, pos = self._calc_path_until_cursor(start_pos=pos)
                if yield_positions:
                    yield pos
                else:
                    yield result
            except StopIteration:
                if yield_positions:
                    yield None
                else:
                    yield ''

    def get_line(self, line_nr):
        if not self._line_cache:
            self._line_cache = common.splitlines(self.source)

        if line_nr == 0:
            # This is a fix for the zeroth line. We need a newline there, for
            # the backwards parser.
            return u('')
        if line_nr < 0:
            raise StopIteration()
        try:
            return self._line_cache[line_nr - 1]
        except IndexError:
            raise StopIteration()

    def get_position_line(self):
        return self.get_line(self.position[0])[:self.position[1]]


class UserContextParser(object):
    def __init__(self, grammar, source, path, position, user_context,
                 parser_done_callback, use_fast_parser=True):
        self._grammar = grammar
        self._source = source
        self._path = path and os.path.abspath(path)
        self._position = position
        self._user_context = user_context
        self._use_fast_parser = use_fast_parser
        self._parser_done_callback = parser_done_callback

    @cache.underscore_memoization
    def _parser(self):
        cache.invalidate_star_import_cache(self._path)
        if self._use_fast_parser:
            parser = FastParser(self._grammar, self._source, self._path)
            # Don't pickle that module, because the main module is changing quickly
            cache.save_parser(self._path, parser, pickling=False)
        else:
            parser = Parser(self._grammar, self._source, self._path)
        self._parser_done_callback(parser)
        return parser

    @cache.underscore_memoization
    def user_stmt(self):
        module = self.module()
        debug.speed('parsed')
        return module.get_statement_for_position(self._position)

    @cache.underscore_memoization
    def user_stmt_with_whitespace(self):
        """
        Returns the statement under the cursor even if the statement lies
        before the cursor.
        """
        user_stmt = self.user_stmt()

        if not user_stmt:
            # for statements like `from x import ` (cursor not in statement)
            # or `abs( ` where the cursor is out in the whitespace.
            if self._user_context.get_path_under_cursor():
                # We really should have a user_stmt, but the parser couldn't
                # process it - probably a Syntax Error (or in a comment).
                debug.warning('No statement under the cursor.')
                return
            pos = next(self._user_context.get_context(yield_positions=True))
            user_stmt = self.module().get_statement_for_position(pos)
        return user_stmt

    @cache.underscore_memoization
    def user_scope(self):
        """
        Returns the scope in which the user resides. This includes flows.
        """
        user_stmt = self.user_stmt()
        if user_stmt is None:
            def scan(scope):
                for s in scope.children:
                    if s.start_pos <= self._position <= s.end_pos:
                        if isinstance(s, (tree.Scope, tree.Flow)):
                                if isinstance(s, tree.Flow):
                                    return s
                                return scan(s) or s
                        elif s.type in ('suite', 'decorated'):
                            return scan(s)

            return scan(self.module()) or self.module()
        else:
            return user_stmt.get_parent_scope(include_flows=True)

    def module(self):
        return self._parser().module
