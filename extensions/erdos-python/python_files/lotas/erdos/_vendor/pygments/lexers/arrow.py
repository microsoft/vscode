"""
    pygments.lexers.arrow
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Arrow.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default, include
from lotas.erdos._vendor.pygments.token import Text, Operator, Keyword, Punctuation, Name, \
    String, Number, Whitespace

__all__ = ['ArrowLexer']

TYPES = r'\b(int|bool|char)((?:\[\])*)(?=\s+)'
IDENT = r'([a-zA-Z_][a-zA-Z0-9_]*)'
DECL = TYPES + r'(\s+)' + IDENT


class ArrowLexer(RegexLexer):
    """
    Lexer for Arrow
    """

    name = 'Arrow'
    url = 'https://pypi.org/project/py-arrow-lang/'
    aliases = ['arrow']
    filenames = ['*.arw']
    version_added = '2.7'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'^[|\s]+', Punctuation),
            include('blocks'),
            include('statements'),
            include('expressions'),
        ],
        'blocks': [
            (r'(function)(\n+)(/-->)(\s*)' +
             DECL +  # 4 groups
             r'(\()', bygroups(
                 Keyword.Reserved, Whitespace, Punctuation,
                 Whitespace, Keyword.Type, Punctuation, Whitespace,
                 Name.Function, Punctuation
             ), 'fparams'),
            (r'/-->$|\\-->$|/--<|\\--<|\^', Punctuation),
        ],
        'statements': [
            (DECL, bygroups(Keyword.Type, Punctuation, Text, Name.Variable)),
            (r'\[', Punctuation, 'index'),
            (r'=', Operator),
            (r'require|main', Keyword.Reserved),
            (r'print', Keyword.Reserved, 'print'),
        ],
        'expressions': [
            (r'\s+', Whitespace),
            (r'[0-9]+', Number.Integer),
            (r'true|false', Keyword.Constant),
            (r"'", String.Char, 'char'),
            (r'"', String.Double, 'string'),
            (r'\{', Punctuation, 'array'),
            (r'==|!=|<|>|\+|-|\*|/|%', Operator),
            (r'and|or|not|length', Operator.Word),
            (r'(input)(\s+)(int|char\[\])', bygroups(
                Keyword.Reserved, Whitespace, Keyword.Type
            )),
            (IDENT + r'(\()', bygroups(
                Name.Function, Punctuation
            ), 'fargs'),
            (IDENT, Name.Variable),
            (r'\[', Punctuation, 'index'),
            (r'\(', Punctuation, 'expressions'),
            (r'\)', Punctuation, '#pop'),
        ],
        'print': [
            include('expressions'),
            (r',', Punctuation),
            default('#pop'),
        ],
        'fparams': [
            (DECL, bygroups(Keyword.Type, Punctuation, Whitespace, Name.Variable)),
            (r',', Punctuation),
            (r'\)', Punctuation, '#pop'),
        ],
        'escape': [
            (r'\\(["\\/abfnrtv]|[0-9]{1,3}|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})',
             String.Escape),
        ],
        'char': [
            (r"'", String.Char, '#pop'),
            include('escape'),
            (r"[^'\\]", String.Char),
        ],
        'string': [
            (r'"', String.Double, '#pop'),
            include('escape'),
            (r'[^"\\]+', String.Double),
        ],
        'array': [
            include('expressions'),
            (r'\}', Punctuation, '#pop'),
            (r',', Punctuation),
        ],
        'fargs': [
            include('expressions'),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation),
        ],
        'index': [
            include('expressions'),
            (r'\]', Punctuation, '#pop'),
        ],
    }
