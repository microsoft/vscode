"""
    pygments.lexers.go
    ~~~~~~~~~~~~~~~~~~

    Lexers for the Google Go language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['GoLexer']


class GoLexer(RegexLexer):
    """
    For Go source.
    """
    name = 'Go'
    url = 'https://go.dev/'
    filenames = ['*.go']
    aliases = ['go', 'golang']
    mimetypes = ['text/x-gosrc']
    version_added = '1.2'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),  # line continuations
            (r'//(.*?)$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'(import|package)\b', Keyword.Namespace),
            (r'(var|func|struct|map|chan|type|interface|const)\b',
             Keyword.Declaration),
            (words((
                'break', 'default', 'select', 'case', 'defer', 'go',
                'else', 'goto', 'switch', 'fallthrough', 'if', 'range',
                'continue', 'for', 'return'), suffix=r'\b'),
             Keyword),
            (r'(true|false|iota|nil)\b', Keyword.Constant),
            # It seems the builtin types aren't actually keywords, but
            # can be used as functions. So we need two declarations.
            (words((
                'uint', 'uint8', 'uint16', 'uint32', 'uint64',
                'int', 'int8', 'int16', 'int32', 'int64',
                'float', 'float32', 'float64',
                'complex64', 'complex128', 'byte', 'rune',
                'string', 'bool', 'error', 'uintptr', 'any', 'comparable',
                'print', 'println', 'panic', 'recover', 'close', 'complex',
                'real', 'imag', 'len', 'cap', 'append', 'copy', 'delete',
                'new', 'make', 'min', 'max', 'clear'), suffix=r'\b(\()'),
             bygroups(Name.Builtin, Punctuation)),
            (words((
                'uint', 'uint8', 'uint16', 'uint32', 'uint64',
                'int', 'int8', 'int16', 'int32', 'int64',
                'float', 'float32', 'float64',
                'complex64', 'complex128', 'byte', 'rune',
                'string', 'bool', 'error', 'uintptr', 'any', 'comparable'), suffix=r'\b'),
             Keyword.Type),
            # imaginary_lit
            (r'\d+i', Number),
            (r'\d+\.\d*([Ee][-+]\d+)?i', Number),
            (r'\.\d+([Ee][-+]\d+)?i', Number),
            (r'\d+[Ee][-+]\d+i', Number),
            # float_lit
            (r'\d+(\.\d+[eE][+\-]?\d+|'
             r'\.\d*|[eE][+\-]?\d+)', Number.Float),
            (r'\.\d+([eE][+\-]?\d+)?', Number.Float),
            # int_lit
            # -- octal_lit
            (r'0[0-7]+', Number.Oct),
            # -- hex_lit
            (r'0[xX][0-9a-fA-F]+', Number.Hex),
            # -- decimal_lit
            (r'(0|[1-9][0-9]*)', Number.Integer),
            # char_lit
            (r"""'(\\['"\\abfnrtv]|\\x[0-9a-fA-F]{2}|\\[0-7]{1,3}"""
             r"""|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|[^\\])'""",
             String.Char),
            # StringLiteral
            # -- raw_string_lit
            (r'`[^`]*`', String),
            # -- interpreted_string_lit
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # Tokens
            (r'(<<=|>>=|<<|>>|<=|>=|&\^=|&\^|\+=|-=|\*=|/=|%=|&=|\|=|&&|\|\|'
             r'|<-|\+\+|--|==|!=|:=|\.\.\.|[+\-*/%&]'
             r'|~|\|)', Operator),
            (r'[|^<>=!()\[\]{}.,;:]', Punctuation),
            # identifier
            (r'[^\W\d]\w*', Name.Other),
        ]
    }
