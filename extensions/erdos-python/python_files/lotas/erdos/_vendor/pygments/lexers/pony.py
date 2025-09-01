"""
    pygments.lexers.pony
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Pony and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['PonyLexer']


class PonyLexer(RegexLexer):
    """
    For Pony source code.
    """

    name = 'Pony'
    aliases = ['pony']
    filenames = ['*.pony']
    url = 'https://www.ponylang.io'
    version_added = '2.4'

    _caps = r'(iso|trn|ref|val|box|tag)'

    tokens = {
        'root': [
            (r'\n', Text),
            (r'[^\S\n]+', Text),
            (r'//.*\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'nested_comment'),
            (r'"""(?:.|\n)*?"""', String.Doc),
            (r'"', String, 'string'),
            (r'\'.*\'', String.Char),
            (r'=>|[]{}:().~;,|&!^?[]', Punctuation),
            (words((
                'addressof', 'and', 'as', 'consume', 'digestof', 'is', 'isnt',
                'not', 'or'),
                suffix=r'\b'),
             Operator.Word),
            (r'!=|==|<<|>>|[-+/*%=<>]', Operator),
            (words((
                'box', 'break', 'compile_error', 'compile_intrinsic',
                'continue', 'do', 'else', 'elseif', 'embed', 'end', 'error',
                'for', 'if', 'ifdef', 'in', 'iso', 'lambda', 'let', 'match',
                'object', 'recover', 'ref', 'repeat', 'return', 'tag', 'then',
                'this', 'trn', 'try', 'until', 'use', 'var', 'val', 'where',
                'while', 'with', '#any', '#read', '#send', '#share'),
                suffix=r'\b'),
             Keyword),
            (r'(actor|class|struct|primitive|interface|trait|type)((?:\s)+)',
             bygroups(Keyword, Text), 'typename'),
            (r'(new|fun|be)((?:\s)+)', bygroups(Keyword, Text), 'methodname'),
            (words((
                'I8', 'U8', 'I16', 'U16', 'I32', 'U32', 'I64', 'U64', 'I128',
                'U128', 'ILong', 'ULong', 'ISize', 'USize', 'F32', 'F64',
                'Bool', 'Pointer', 'None', 'Any', 'Array', 'String',
                'Iterator'),
                suffix=r'\b'),
             Name.Builtin.Type),
            (r'_?[A-Z]\w*', Name.Type),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            (r'(true|false)\b', Name.Builtin),
            (r'_\d*', Name),
            (r'_?[a-z][\w\']*', Name)
        ],
        'typename': [
            (_caps + r'?((?:\s)*)(_?[A-Z]\w*)',
             bygroups(Keyword, Text, Name.Class), '#pop')
        ],
        'methodname': [
            (_caps + r'?((?:\s)*)(_?[a-z]\w*)',
             bygroups(Keyword, Text, Name.Function), '#pop')
        ],
        'nested_comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\"', String),
            (r'[^\\"]+', String)
        ]
    }
