"""
    pygments.lexers.codeql
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for CodeQL query language.

    The grammar is originating from:
    https://github.com/github/vscode-codeql/blob/main/syntaxes/README.md

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

__all__ = ['CodeQLLexer']

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

class CodeQLLexer(RegexLexer):
    name = 'CodeQL'
    aliases = ['codeql', 'ql']
    filenames = ['*.ql', '*.qll']
    mimetypes = []
    url = 'https://github.com/github/codeql'
    version_added = '2.19'

    flags = re.MULTILINE | re.UNICODE

    tokens = {
        'root': [
            # Whitespace and comments
            (r'\s+', Whitespace),
            (r'//.*?\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'multiline-comments'),

             # Keywords
            (words((
                'module', 'import', 'class', 'extends', 'implements',
                'predicate', 'select', 'where', 'from', 'as', 'and', 'or', 'not',
                'in', 'if', 'then', 'else', 'exists', 'forall', 'instanceof',
                'private', 'predicate', 'abstract', 'cached', 'external',
                'final', 'library', 'override', 'query'
            ), suffix=r'\b'), Keyword.Builtin),

            # Special Keywords
            (words(('this'),                # class related keywords
                   prefix=r'\b', suffix=r'\b\??:?'), Name.Builtin.Pseudo),

            # Types
            (words((
                'boolean', 'date', 'float', 'int', 'string'
            ), suffix=r'\b'), Keyword.Type),

            # Literals
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r'[0-9]+\.[0-9]+', Number.Float),
            (r'[0-9]+', Number.Integer),
            
            # Operators
            (r'<=|>=|<|>|=|!=|\+|-|\*|/', Operator),

            # Punctuation
            (r'[.,;:\[\]{}()]+', Punctuation),

            # Identifiers
            (r'@[a-zA-Z_]\w*', Name.Variable),  # Variables with @ prefix
            (r'[A-Z][a-zA-Z0-9_]*', Name.Class),  # Types and classes
            (r'[a-z][a-zA-Z0-9_]*', Name.Variable),  # Variables and predicates
        ],
        'multiline-comments': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],

    }