"""
    pygments.lexers.tnt
    ~~~~~~~~~~~~~~~~~~~

    Lexer for Typographic Number Theory.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import Lexer
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, Number, \
    Punctuation, Error

__all__ = ['TNTLexer']


class TNTLexer(Lexer):
    """
    Lexer for Typographic Number Theory, as described in the book
    Gödel, Escher, Bach, by Douglas R. Hofstadter
    """

    name = 'Typographic Number Theory'
    url = 'https://github.com/Kenny2github/language-tnt'
    aliases = ['tnt']
    filenames = ['*.tnt']
    version_added = '2.7'

    cur = []

    LOGIC = set('⊃→]&∧^|∨Vv')
    OPERATORS = set('+.⋅*')
    VARIABLES = set('abcde')
    PRIMES = set("'′")
    NEGATORS = set('~!')
    QUANTIFIERS = set('AE∀∃')
    NUMBERS = set('0123456789')
    WHITESPACE = set('\t \v\n')

    RULES = re.compile('''(?xi)
        joining | separation | double-tilde | fantasy\\ rule
        | carry[- ]over(?:\\ of)?(?:\\ line)?\\ ([0-9]+) | detachment
        | contrapositive | De\\ Morgan | switcheroo
        | specification | generalization | interchange
        | existence | symmetry | transitivity
        | add\\ S | drop\\ S | induction
        | axiom\\ ([1-5]) | premise | push | pop
    ''')
    LINENOS = re.compile(r'(?:[0-9]+)(?:(?:, ?|,? and )(?:[0-9]+))*')
    COMMENT = re.compile(r'\[[^\n\]]+\]')

    def __init__(self, *args, **kwargs):
        Lexer.__init__(self, *args, **kwargs)
        self.cur = []

    def whitespace(self, start, text, required=False):
        """Tokenize whitespace."""
        end = start
        try:
            while text[end] in self.WHITESPACE:
                end += 1
        except IndexError:
            end = len(text)
        if required and end == start:
            raise AssertionError
        if end != start:
            self.cur.append((start, Text, text[start:end]))
        return end

    def variable(self, start, text):
        """Tokenize a variable."""
        if text[start] not in self.VARIABLES:
            raise AssertionError
        end = start+1
        while text[end] in self.PRIMES:
            end += 1
        self.cur.append((start, Name.Variable, text[start:end]))
        return end

    def term(self, start, text):
        """Tokenize a term."""
        if text[start] == 'S':  # S...S(...) or S...0
            end = start+1
            while text[end] == 'S':
                end += 1
            self.cur.append((start, Number.Integer, text[start:end]))
            return self.term(end, text)
        if text[start] == '0':  # the singleton 0
            self.cur.append((start, Number.Integer, text[start]))
            return start+1
        if text[start] in self.VARIABLES:  # a''...
            return self.variable(start, text)
        if text[start] == '(':  # (...+...)
            self.cur.append((start, Punctuation, text[start]))
            start = self.term(start+1, text)
            if text[start] not in self.OPERATORS:
                raise AssertionError
            self.cur.append((start, Operator, text[start]))
            start = self.term(start+1, text)
            if text[start] != ')':
                raise AssertionError
            self.cur.append((start, Punctuation, text[start]))
            return start+1
        raise AssertionError  # no matches

    def formula(self, start, text):
        """Tokenize a formula."""
        if text[start] in self.NEGATORS:  # ~<...>
            end = start+1
            while text[end] in self.NEGATORS:
                end += 1
            self.cur.append((start, Operator, text[start:end]))
            return self.formula(end, text)
        if text[start] in self.QUANTIFIERS:  # Aa:<...>
            self.cur.append((start, Keyword.Declaration, text[start]))
            start = self.variable(start+1, text)
            if text[start] != ':':
                raise AssertionError
            self.cur.append((start, Punctuation, text[start]))
            return self.formula(start+1, text)
        if text[start] == '<':  # <...&...>
            self.cur.append((start, Punctuation, text[start]))
            start = self.formula(start+1, text)
            if text[start] not in self.LOGIC:
                raise AssertionError
            self.cur.append((start, Operator, text[start]))
            start = self.formula(start+1, text)
            if text[start] != '>':
                raise AssertionError
            self.cur.append((start, Punctuation, text[start]))
            return start+1
        # ...=...
        start = self.term(start, text)
        if text[start] != '=':
            raise AssertionError
        self.cur.append((start, Operator, text[start]))
        start = self.term(start+1, text)
        return start

    def rule(self, start, text):
        """Tokenize a rule."""
        match = self.RULES.match(text, start)
        if match is None:
            raise AssertionError
        groups = sorted(match.regs[1:])  # exclude whole match
        for group in groups:
            if group[0] >= 0:  # this group matched
                self.cur.append((start, Keyword, text[start:group[0]]))
                self.cur.append((group[0], Number.Integer,
                                 text[group[0]:group[1]]))
                if group[1] != match.end():
                    self.cur.append((group[1], Keyword,
                                     text[group[1]:match.end()]))
                break
        else:
            self.cur.append((start, Keyword, text[start:match.end()]))
        return match.end()

    def lineno(self, start, text):
        """Tokenize a line referral."""
        end = start
        while text[end] not in self.NUMBERS:
            end += 1
        self.cur.append((start, Punctuation, text[start]))
        self.cur.append((start+1, Text, text[start+1:end]))
        start = end
        match = self.LINENOS.match(text, start)
        if match is None:
            raise AssertionError
        if text[match.end()] != ')':
            raise AssertionError
        self.cur.append((match.start(), Number.Integer, match.group(0)))
        self.cur.append((match.end(), Punctuation, text[match.end()]))
        return match.end() + 1

    def error_till_line_end(self, start, text):
        """Mark everything from ``start`` to the end of the line as Error."""
        end = start
        try:
            while text[end] != '\n':  # there's whitespace in rules
                end += 1
        except IndexError:
            end = len(text)
        if end != start:
            self.cur.append((start, Error, text[start:end]))
        end = self.whitespace(end, text)
        return end

    def get_tokens_unprocessed(self, text):
        """Returns a list of TNT tokens."""
        self.cur = []
        start = end = self.whitespace(0, text)
        while start <= end < len(text):
            try:
                # try line number
                while text[end] in self.NUMBERS:
                    end += 1
                if end != start:  # actual number present
                    self.cur.append((start, Number.Integer, text[start:end]))
                    # whitespace is required after a line number
                    orig = len(self.cur)
                    try:
                        start = end = self.whitespace(end, text, True)
                    except AssertionError:
                        del self.cur[orig:]
                        start = end = self.error_till_line_end(end, text)
                        continue
                # at this point it could be a comment
                match = self.COMMENT.match(text, start)
                if match is not None:
                    self.cur.append((start, Comment, text[start:match.end()]))
                    start = end = match.end()
                    # anything after the closing bracket is invalid
                    start = end = self.error_till_line_end(start, text)
                    # do not attempt to process the rest
                    continue
                del match
                if text[start] in '[]':  # fantasy push or pop
                    self.cur.append((start, Keyword, text[start]))
                    start += 1
                    end += 1
                else:
                    # one formula, possibly containing subformulae
                    orig = len(self.cur)
                    try:
                        start = end = self.formula(start, text)
                    except (AssertionError, RecursionError):  # not well-formed
                        del self.cur[orig:]
                        while text[end] not in self.WHITESPACE:
                            end += 1
                        self.cur.append((start, Error, text[start:end]))
                        start = end
                # skip whitespace after formula
                orig = len(self.cur)
                try:
                    start = end = self.whitespace(end, text, True)
                except AssertionError:
                    del self.cur[orig:]
                    start = end = self.error_till_line_end(start, text)
                    continue
                # rule proving this formula a theorem
                orig = len(self.cur)
                try:
                    start = end = self.rule(start, text)
                except AssertionError:
                    del self.cur[orig:]
                    start = end = self.error_till_line_end(start, text)
                    continue
                # skip whitespace after rule
                start = end = self.whitespace(end, text)
                # line marker
                if text[start] == '(':
                    orig = len(self.cur)
                    try:
                        start = end = self.lineno(start, text)
                    except AssertionError:
                        del self.cur[orig:]
                        start = end = self.error_till_line_end(start, text)
                        continue
                    start = end = self.whitespace(start, text)
            except IndexError:
                try:
                    del self.cur[orig:]
                except NameError:
                    pass  # if orig was never defined, fine
                self.error_till_line_end(start, text)
        return self.cur
