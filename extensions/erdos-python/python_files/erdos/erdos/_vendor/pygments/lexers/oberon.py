"""
    pygments.lexers.oberon
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Oberon family languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['ComponentPascalLexer']


class ComponentPascalLexer(RegexLexer):
    """
    For Component Pascal source code.
    """
    name = 'Component Pascal'
    aliases = ['componentpascal', 'cp']
    filenames = ['*.cp', '*.cps']
    mimetypes = ['text/x-component-pascal']
    url = 'https://blackboxframework.org'
    version_added = '2.1'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            include('whitespace'),
            include('comments'),
            include('punctuation'),
            include('numliterals'),
            include('strings'),
            include('operators'),
            include('builtins'),
            include('identifiers'),
        ],
        'whitespace': [
            (r'\n+', Text),  # blank lines
            (r'\s+', Text),  # whitespace
        ],
        'comments': [
            (r'\(\*([^$].*?)\*\)', Comment.Multiline),
            # TODO: nested comments (* (* ... *) ... (* ... *) *) not supported!
        ],
        'punctuation': [
            (r'[()\[\]{},.:;|]', Punctuation),
        ],
        'numliterals': [
            (r'[0-9A-F]+X\b', Number.Hex),                 # char code
            (r'[0-9A-F]+[HL]\b', Number.Hex),              # hexadecimal number
            (r'[0-9]+\.[0-9]+E[+-][0-9]+', Number.Float),  # real number
            (r'[0-9]+\.[0-9]+', Number.Float),             # real number
            (r'[0-9]+', Number.Integer),                   # decimal whole number
        ],
        'strings': [
            (r"'[^\n']*'", String),  # single quoted string
            (r'"[^\n"]*"', String),  # double quoted string
        ],
        'operators': [
            # Arithmetic Operators
            (r'[+-]', Operator),
            (r'[*/]', Operator),
            # Relational Operators
            (r'[=#<>]', Operator),
            # Dereferencing Operator
            (r'\^', Operator),
            # Logical AND Operator
            (r'&', Operator),
            # Logical NOT Operator
            (r'~', Operator),
            # Assignment Symbol
            (r':=', Operator),
            # Range Constructor
            (r'\.\.', Operator),
            (r'\$', Operator),
        ],
        'identifiers': [
            (r'([a-zA-Z_$][\w$]*)', Name),
        ],
        'builtins': [
            (words((
                'ANYPTR', 'ANYREC', 'BOOLEAN', 'BYTE', 'CHAR', 'INTEGER', 'LONGINT',
                'REAL', 'SET', 'SHORTCHAR', 'SHORTINT', 'SHORTREAL'
                ), suffix=r'\b'), Keyword.Type),
            (words((
                'ABS', 'ABSTRACT', 'ARRAY', 'ASH', 'ASSERT', 'BEGIN', 'BITS', 'BY',
                'CAP', 'CASE', 'CHR', 'CLOSE', 'CONST', 'DEC', 'DIV', 'DO', 'ELSE',
                'ELSIF', 'EMPTY', 'END', 'ENTIER', 'EXCL', 'EXIT', 'EXTENSIBLE', 'FOR',
                'HALT', 'IF', 'IMPORT', 'IN', 'INC', 'INCL', 'IS', 'LEN', 'LIMITED',
                'LONG', 'LOOP', 'MAX', 'MIN', 'MOD', 'MODULE', 'NEW', 'ODD', 'OF',
                'OR', 'ORD', 'OUT', 'POINTER', 'PROCEDURE', 'RECORD', 'REPEAT', 'RETURN',
                'SHORT', 'SHORTCHAR', 'SHORTINT', 'SIZE', 'THEN', 'TYPE', 'TO', 'UNTIL',
                'VAR', 'WHILE', 'WITH'
                ), suffix=r'\b'), Keyword.Reserved),
            (r'(TRUE|FALSE|NIL|INF)\b', Keyword.Constant),
        ]
    }

    def analyse_text(text):
        """The only other lexer using .cp is the C++ one, so we check if for
        a few common Pascal keywords here. Those are unfortunately quite
        common across various business languages as well."""
        result = 0
        if 'BEGIN' in text:
            result += 0.01
        if 'END' in text:
            result += 0.01
        if 'PROCEDURE' in text:
            result += 0.01
        if 'END' in text:
            result += 0.01

        return result
