"""
    pygments.lexers.json5
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Json5 file format.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import include, RegexLexer, words
from lotas.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Punctuation, \
    String, Whitespace

__all__ = ['Json5Lexer']


def string_rules(quote_mark):
    return [
        (rf"[^{quote_mark}\\]+", String),
        (r"\\.", String.Escape),
        (r"\\", Punctuation),
        (quote_mark, String, '#pop'),
    ]


def quoted_field_name(quote_mark):
    return [
        (rf'([^{quote_mark}\\]|\\.)*{quote_mark}',
         Name.Variable, ('#pop', 'object_value'))
    ]


class Json5Lexer(RegexLexer):
    """Lexer for JSON5 data structures."""

    name = 'JSON5'
    aliases = ['json5']
    filenames = ['*.json5']
    url = "https://json5.org"
    version_added = '2.19'
    tokens = {
        '_comments': [
            (r'(//|#).*\n', Comment.Single),
            (r'/\*\*([^/]|/(?!\*))*\*/', String.Doc),
            (r'/\*([^/]|/(?!\*))*\*/', Comment),
        ],
        'root': [
            include('_comments'),
            (r"'", String, 'singlestring'),
            (r'"', String, 'doublestring'),
            (r'[+-]?0[xX][0-9a-fA-F]+', Number.Hex),
            (r'[+-.]?[0-9]+[.]?[0-9]?([eE][-]?[0-9]+)?', Number.Float),
            (r'\{', Punctuation, 'object'),
            (r'\[', Punctuation, 'array'),
            (words(['false', 'Infinity', '+Infinity', '-Infinity', 'NaN',
                    'null', 'true',], suffix=r'\b'), Keyword),
            (r'\s+', Whitespace),
            (r':', Punctuation),
        ],
        'singlestring': string_rules("'"),
        'doublestring': string_rules('"'),
        'array': [
            (r',', Punctuation),
            (r'\]', Punctuation, '#pop'),
            include('root'),
        ],
        'object': [
            (r'\s+', Whitespace),
            (r'\}', Punctuation, '#pop'),
            (r'\b([^:]+)', Name.Variable, 'object_value'),
            (r'"', Name.Variable, 'double_field_name'),
            (r"'", Name.Variable, 'single_field_name'),
            include('_comments'),
        ],
        'double_field_name': quoted_field_name('"'),
        'single_field_name': quoted_field_name("'"),
        'object_value': [
            (r',', Punctuation, '#pop'),
            (r'\}', Punctuation, '#pop:2'),
            include('root'),
        ],
    }
