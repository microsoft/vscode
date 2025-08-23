"""
    pygments.lexers.pointless
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Pointless.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, Operator, \
    Punctuation, String, Text

__all__ = ['PointlessLexer']


class PointlessLexer(RegexLexer):
    """
    For Pointless source code.
    """

    name = 'Pointless'
    url = 'https://ptls.dev'
    aliases = ['pointless']
    filenames = ['*.ptls']
    version_added = '2.7'

    ops = words([
        "+", "-", "*", "/", "**", "%", "+=", "-=", "*=",
        "/=", "**=", "%=", "|>", "=", "==", "!=", "<", ">",
        "<=", ">=", "=>", "$", "++",
    ])

    keywords = words([
        "if", "then", "else", "where", "with", "cond",
        "case", "and", "or", "not", "in", "as", "for",
        "requires", "throw", "try", "catch", "when",
        "yield", "upval",
    ], suffix=r'\b')

    tokens = {
        'root': [
            (r'[ \n\r]+', Text),
            (r'--.*$', Comment.Single),
            (r'"""', String, 'multiString'),
            (r'"', String, 'string'),
            (r'[\[\](){}:;,.]', Punctuation),
            (ops, Operator),
            (keywords, Keyword),
            (r'\d+|\d*\.\d+', Number),
            (r'(true|false)\b', Name.Builtin),
            (r'[A-Z][a-zA-Z0-9]*\b', String.Symbol),
            (r'output\b', Name.Variable.Magic),
            (r'(export|import)\b', Keyword.Namespace),
            (r'[a-z][a-zA-Z0-9]*\b', Name.Variable)
        ],
        'multiString': [
            (r'\\.', String.Escape),
            (r'"""', String, '#pop'),
            (r'"', String),
            (r'[^\\"]+', String),
        ],
        'string': [
            (r'\\.', String.Escape),
            (r'"', String, '#pop'),
            (r'\n', Error),
            (r'[^\\"]+', String),
        ],
    }
