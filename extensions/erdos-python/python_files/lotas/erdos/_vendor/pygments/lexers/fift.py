"""
    pygments.lexers.fift
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for fift.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include
from erdos._vendor.pygments.token import Literal, Comment, Name, String, Number, Whitespace

__all__ = ['FiftLexer']


class FiftLexer(RegexLexer):
    """
    For Fift source code.
    """

    name = 'Fift'
    aliases = ['fift', 'fif']
    filenames = ['*.fif']
    url = 'https://ton-blockchain.github.io/docs/fiftbase.pdf'
    version_added = ''

    tokens = {
        'root': [
            (r'\s+', Whitespace),

            include('comments'),

            (r'[\.+]?\"', String, 'string'),

            # numbers
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'0b[01]+', Number.Bin),
            (r'-?[0-9]+("/"-?[0-9]+)?', Number.Decimal),

            # slices
            (r'b\{[01]+\}', Literal),
            (r'x\{[0-9a-fA-F_]+\}', Literal),

            # byte literal
            (r'B\{[0-9a-fA-F_]+\}', Literal),

            # treat anything as word
            (r'\S+', Name)
        ],

        'string': [
            (r'\\.', String.Escape),
            (r'\"', String, '#pop'),
            (r'[^\"\r\n\\]+', String)
        ],

        'comments': [
            (r'//.*', Comment.Singleline),
            (r'/\*', Comment.Multiline, 'comment'),
        ],
        'comment': [
            (r'[^/*]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
    }
