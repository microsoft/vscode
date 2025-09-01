"""
    pygments.lexers.gleam
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Gleam programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words, bygroups
from erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['GleamLexer']


class GleamLexer(RegexLexer):
    """
    Lexer for the Gleam programming language (version 1.0.0).
    """

    name = 'Gleam'
    url = 'https://gleam.run/'
    filenames = ['*.gleam']
    aliases = ['gleam']
    mimetypes = ['text/x-gleam']
    version_added = '2.19'

    keywords = words((
        'as', 'assert', 'auto', 'case', 'const', 'delegate', 'derive', 'echo',
        'else', 'fn', 'if', 'implement', 'import', 'let', 'macro', 'opaque',
        'panic', 'pub', 'test', 'todo', 'type', 'use',
    ), suffix=r'\b')

    tokens = {
        'root': [
            # Comments
            (r'(///.*?)(\n)', bygroups(String.Doc, Whitespace)),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),

            # Keywords
            (keywords, Keyword),
            (r'([a-zA-Z_]+)(\.)', bygroups(Keyword, Punctuation)),

            # Punctuation
            (r'[()\[\]{}:;,@]+', Punctuation),
            (r'(#|!=|!|==|\|>|\|\||\||\->|<\-|&&|<<|>>|\.\.|\.|=)', Punctuation),

            # Operators
            (r'(<>|\+\.?|\-\.?|\*\.?|/\.?|%\.?|<=\.?|>=\.?|<\.?|>\.?|=)', Operator),

            # Strings
            (r'"(\\"|[^"])*"', String),

            # Identifiers
            (r'\b(let)(\s+)(\w+)', bygroups(Keyword, Whitespace, Name.Variable)),
            (r'\b(fn)(\s+)(\w+)', bygroups(Keyword, Whitespace, Name.Function)),
            (r'[a-zA-Z_/]\w*', Name),

            # numbers
            (r'(\d+(_\d+)*\.(?!\.)(\d+(_\d+)*)?|\.\d+(_\d+)*)([eEf][+-]?[0-9]+)?', Number.Float),
            (r'\d+(_\d+)*[eEf][+-]?[0-9]+', Number.Float),
            (r'0[xX][a-fA-F0-9]+(_[a-fA-F0-9]+)*(\.([a-fA-F0-9]+(_[a-fA-F0-9]+)*)?)?p[+-]?\d+', Number.Float),
            (r'0[bB][01]+(_[01]+)*', Number.Bin),
            (r'0[oO][0-7]+(_[0-7]+)*', Number.Oct),
            (r'0[xX][a-fA-F0-9]+(_[a-fA-F0-9]+)*', Number.Hex),
            (r'\d+(_\d+)*', Number.Integer),

            # Whitespace
            (r'\s+', Whitespace),

        ],
    }
