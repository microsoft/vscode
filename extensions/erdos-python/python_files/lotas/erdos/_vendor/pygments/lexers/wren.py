"""
    pygments.lexers.wren
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for Wren.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import include, RegexLexer, words
from erdos._vendor.pygments.token import Whitespace, Punctuation, Keyword, Name, Comment, \
    Operator, Number, String

__all__ = ['WrenLexer']

class WrenLexer(RegexLexer):
    """
    For Wren source code, version 0.4.0.
    """
    name = 'Wren'
    url = 'https://wren.io'
    aliases = ['wren']
    filenames = ['*.wren']
    version_added = '2.14'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            # Whitespace.
            (r'\s+', Whitespace),
            (r'[,\\\[\]{}]', Punctuation),

            # Really 'root', not '#push': in 'interpolation',
            # parentheses inside the interpolation expression are
            # Punctuation, not String.Interpol.
            (r'\(', Punctuation, 'root'),
            (r'\)', Punctuation, '#pop'),

            # Keywords.
            (words((
                'as', 'break', 'class', 'construct', 'continue', 'else',
                'for', 'foreign', 'if', 'import', 'return', 'static', 'super',
                'this', 'var', 'while'), prefix = r'(?<!\.)',
                suffix = r'\b'), Keyword),

            (words((
                'true', 'false', 'null'), prefix = r'(?<!\.)',
                suffix = r'\b'), Keyword.Constant),

            (words((
                'in', 'is'), prefix = r'(?<!\.)',
                suffix = r'\b'), Operator.Word),

            # Comments.
            (r'/\*', Comment.Multiline, 'comment'), # Multiline, can nest.
            (r'//.*?$', Comment.Single),            # Single line.
            (r'#.*?(\(.*?\))?$', Comment.Special),  # Attribute or shebang.

            # Names and operators.
            (r'[!%&*+\-./:<=>?\\^|~]+', Operator),
            (r'[a-z][a-zA-Z_0-9]*', Name),
            (r'[A-Z][a-zA-Z_0-9]*', Name.Class),
            (r'__[a-zA-Z_0-9]*', Name.Variable.Class),
            (r'_[a-zA-Z_0-9]*', Name.Variable.Instance),

            # Numbers.
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'\d+(\.\d+)?([eE][-+]?\d+)?', Number.Float),

            # Strings.
            (r'""".*?"""', String),   # Raw string
            (r'"', String, 'string'), # Other string
        ],
        'comment': [
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'([^*/]|\*(?!/)|/(?!\*))+', Comment.Multiline),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\[\\%"0abefnrtv]', String.Escape), # Escape.
            (r'\\x[a-fA-F0-9]{2}', String.Escape), # Byte escape.
            (r'\\u[a-fA-F0-9]{4}', String.Escape), # Unicode escape.
            (r'\\U[a-fA-F0-9]{8}', String.Escape), # Long Unicode escape.

            (r'%\(', String.Interpol, 'interpolation'),
            (r'[^\\"%]+', String), # All remaining characters.
        ],
        'interpolation': [
            # redefine closing paren to be String.Interpol
            (r'\)', String.Interpol, '#pop'),
            include('root'),
        ],
    }
