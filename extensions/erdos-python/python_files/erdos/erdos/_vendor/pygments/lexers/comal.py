"""
    pygments.lexers.comal
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for COMAL-80.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Comment, Whitespace, Operator, Keyword, String, \
    Number, Name, Punctuation

__all__ = ["Comal80Lexer"]


class Comal80Lexer(RegexLexer):
    """
    For COMAL-80 source code.
    """

    name = 'COMAL-80'
    url = 'https://en.wikipedia.org/wiki/COMAL'
    aliases = ['comal', 'comal80']
    filenames = ['*.cml', '*.comal']
    version_added = ''
    flags = re.IGNORECASE
    #
    # COMAL allows for some strange characters in names which we list here so
    # keywords and word operators will not be recognized at the start of an
    # identifier.
    #
    _suffix = r"\b(?!['\[\]←£\\])"
    _identifier = r"[a-z]['\[\]←£\\\w]*"

    tokens = {
        'root': [
            (r'//.*\n', Comment.Single),
            (r'\s+', Whitespace),
            (r':[=+-]|\<\>|[-+*/^↑<>=]', Operator),
            (r'(and +then|or +else)' + _suffix, Operator.Word),
            (words([
                'and', 'bitand', 'bitor', 'bitxor', 'div', 'in', 'mod', 'not',
                'or'], suffix=_suffix,), Operator.Word),
            (words([
                'append', 'at', 'case', 'chain', 'close', 'copy', 'create', 'cursor',
                'data', 'delete', 'dir', 'do', 'elif', 'else', 'end', 'endcase', 'endif',
                'endfor', 'endloop', 'endtrap', 'endwhile', 'exec', 'exit', 'file',
                'for', 'goto', 'handler', 'if', 'input', 'let', 'loop', 'mount', 'null',
                'of', 'open', 'otherwise', 'output', 'page', 'pass', 'poke', 'print',
                'random', 'read', 'repeat', 'report', 'return', 'rename', 'restore',
                'select', 'step', 'stop', 'sys', 'then', 'to', 'trap', 'unit', 'unit$',
                'until', 'using', 'when', 'while', 'write', 'zone'], suffix=_suffix),
                Keyword.Reserved),
            (words([
                'closed', 'dim', 'endfunc', 'endproc', 'external', 'func', 'import',
                'proc', 'ref', 'use'], suffix=_suffix), Keyword.Declaration),
            (words([
                'abs', 'atn', 'chr$', 'cos', 'eod', 'eof', 'err', 'errfile', 'errtext',
                'esc', 'exp', 'int', 'key$', 'len', 'log', 'ord', 'peek', 'randomize',
                'rnd', 'sgn', 'sin', 'spc$', 'sqr', 'status$', 'str$', 'tab', 'tan',
                'time', 'val'], suffix=_suffix), Name.Builtin),
            (words(['false', 'pi', 'true'], suffix=_suffix), Keyword.Constant),
            (r'"', String, 'string'),
            (_identifier + r":(?=[ \n/])", Name.Label),
            (_identifier + r"[$#]?", Name),
            (r'%[01]+', Number.Bin),
            (r'\$[0-9a-f]+', Number.Hex),
            (r'\d*\.\d*(e[-+]?\d+)?', Number.Float),
            (r'\d+', Number.Integer),
            (r'[(),:;]', Punctuation),
        ],
        'string': [
            (r'[^"]+', String),
            (r'"[0-9]*"', String.Escape),
            (r'"', String, '#pop'),
        ],
    }
