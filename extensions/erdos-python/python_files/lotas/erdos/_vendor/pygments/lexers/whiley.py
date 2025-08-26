"""
    pygments.lexers.whiley
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Whiley language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from lotas.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text

__all__ = ['WhileyLexer']


class WhileyLexer(RegexLexer):
    """
    Lexer for the Whiley programming language.
    """
    name = 'Whiley'
    url = 'http://whiley.org/'
    filenames = ['*.whiley']
    aliases = ['whiley']
    mimetypes = ['text/x-whiley']
    version_added = '2.2'

    # See the language specification:
    # http://whiley.org/download/WhileyLanguageSpec.pdf

    tokens = {
        'root': [
            # Whitespace
            (r'\s+', Text),

            # Comments
            (r'//.*', Comment.Single),
            # don't parse empty comment as doc comment
            (r'/\*\*/', Comment.Multiline),
            (r'(?s)/\*\*.*?\*/', String.Doc),
            (r'(?s)/\*.*?\*/', Comment.Multiline),

            # Keywords
            (words((
                'if', 'else', 'while', 'for', 'do', 'return',
                'switch', 'case', 'default', 'break', 'continue',
                'requires', 'ensures', 'where', 'assert', 'assume',
                'all', 'no', 'some', 'in', 'is', 'new',
                'throw', 'try', 'catch', 'debug', 'skip', 'fail',
                'finite', 'total'), suffix=r'\b'), Keyword.Reserved),
            (words((
                'function', 'method', 'public', 'private', 'protected',
                'export', 'native'), suffix=r'\b'), Keyword.Declaration),
            # "constant" & "type" are not keywords unless used in declarations
            (r'(constant|type)(\s+)([a-zA-Z_]\w*)(\s+)(is)\b',
             bygroups(Keyword.Declaration, Text, Name, Text, Keyword.Reserved)),
            (r'(true|false|null)\b', Keyword.Constant),
            (r'(bool|byte|int|real|any|void)\b', Keyword.Type),
            # "from" is not a keyword unless used with import
            (r'(import)(\s+)(\*)([^\S\n]+)(from)\b',
             bygroups(Keyword.Namespace, Text, Punctuation, Text, Keyword.Namespace)),
            (r'(import)(\s+)([a-zA-Z_]\w*)([^\S\n]+)(from)\b',
             bygroups(Keyword.Namespace, Text, Name, Text, Keyword.Namespace)),
            (r'(package|import)\b', Keyword.Namespace),

            # standard library: https://github.com/Whiley/WhileyLibs/
            (words((
                # types defined in whiley.lang.Int
                'i8', 'i16', 'i32', 'i64',
                'u8', 'u16', 'u32', 'u64',
                'uint', 'nat',

                # whiley.lang.Any
                'toString'), suffix=r'\b'), Name.Builtin),

            # byte literal
            (r'[01]+b', Number.Bin),

            # decimal literal
            (r'[0-9]+\.[0-9]+', Number.Float),
            # match "1." but not ranges like "3..5"
            (r'[0-9]+\.(?!\.)', Number.Float),

            # integer literal
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),

            # character literal
            (r"""'[^\\]'""", String.Char),
            (r"""(')(\\['"\\btnfr])(')""",
             bygroups(String.Char, String.Escape, String.Char)),

            # string literal
            (r'"', String, 'string'),

            # operators and punctuation
            (r'[{}()\[\],.;]', Punctuation),
            (r'[+\-*/%&|<>^!~@=:?'
             # unicode operators
             r'\u2200\u2203\u2205\u2282\u2286\u2283\u2287'
             r'\u222A\u2229\u2264\u2265\u2208\u2227\u2228'
             r']', Operator),

            # identifier
            (r'[a-zA-Z_]\w*', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\[btnfr]', String.Escape),
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\.', String),
            (r'[^\\"]+', String),
        ],
    }
