"""
    pygments.lexers.zig
    ~~~~~~~~~~~~~~~~~~~

    Lexers for Zig.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['ZigLexer']


class ZigLexer(RegexLexer):
    """
    Lexer for the Zig language.

    grammar: https://ziglang.org/documentation/master/#Grammar
    """
    name = 'Zig'
    url = 'http://www.ziglang.org'
    aliases = ['zig']
    filenames = ['*.zig']
    mimetypes = ['text/zig']
    version_added = ''

    type_keywords = (
        words(('bool', 'f16', 'f32', 'f64', 'f128', 'void', 'noreturn', 'type',
               'anyerror', 'promise', 'i0', 'u0', 'isize',  'usize', 'comptime_int',
               'comptime_float', 'c_short', 'c_ushort', 'c_int', 'c_uint', 'c_long',
               'c_ulong', 'c_longlong', 'c_ulonglong', 'c_longdouble', 'c_void'
               'i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'i128',
               'u128'), suffix=r'\b'),
        Keyword.Type)

    storage_keywords = (
        words(('const', 'var', 'extern', 'packed', 'export', 'pub', 'noalias',
               'inline', 'comptime', 'nakedcc', 'stdcallcc', 'volatile', 'allowzero',
               'align', 'linksection', 'threadlocal'), suffix=r'\b'),
        Keyword.Reserved)

    structure_keywords = (
        words(('struct', 'enum', 'union', 'error'), suffix=r'\b'),
        Keyword)

    statement_keywords = (
        words(('break', 'return', 'continue', 'asm', 'defer', 'errdefer',
               'unreachable', 'try', 'catch', 'async', 'await', 'suspend',
               'resume', 'cancel'), suffix=r'\b'),
        Keyword)

    conditional_keywords = (
        words(('if', 'else', 'switch', 'and', 'or', 'orelse'), suffix=r'\b'),
        Keyword)

    repeat_keywords = (
        words(('while', 'for'), suffix=r'\b'),
        Keyword)

    other_keywords = (
        words(('fn', 'usingnamespace', 'test'), suffix=r'\b'),
        Keyword)

    constant_keywords = (
        words(('true', 'false', 'null', 'undefined'), suffix=r'\b'),
        Keyword.Constant)

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'//.*?\n', Comment.Single),

            # Keywords
            statement_keywords,
            storage_keywords,
            structure_keywords,
            repeat_keywords,
            type_keywords,
            constant_keywords,
            conditional_keywords,
            other_keywords,

            # Floats
            (r'0x[0-9a-fA-F]+\.[0-9a-fA-F]+([pP][\-+]?[0-9a-fA-F]+)?', Number.Float),
            (r'0x[0-9a-fA-F]+\.?[pP][\-+]?[0-9a-fA-F]+', Number.Float),
            (r'[0-9]+\.[0-9]+([eE][-+]?[0-9]+)?', Number.Float),
            (r'[0-9]+\.?[eE][-+]?[0-9]+', Number.Float),

            # Integers
            (r'0b[01]+', Number.Bin),
            (r'0o[0-7]+', Number.Oct),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),

            # Identifier
            (r'@[a-zA-Z_]\w*', Name.Builtin),
            (r'[a-zA-Z_]\w*', Name),

            # Characters
            (r'\'\\\'\'', String.Escape),
            (r'\'\\(x[a-fA-F0-9]{2}|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{6}|[nr\\t\'"])\'',
             String.Escape),
            (r'\'[^\\\']\'', String),

            # Strings
            (r'\\\\[^\n]*', String.Heredoc),
            (r'c\\\\[^\n]*', String.Heredoc),
            (r'c?"', String, 'string'),

            # Operators, Punctuation
            (r'[+%=><|^!?/\-*&~:]', Operator),
            (r'[{}()\[\],.;]', Punctuation)
        ],
        'string': [
            (r'\\(x[a-fA-F0-9]{2}|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{6}|[nr\\t\'"])',
             String.Escape),
            (r'[^\\"\n]+', String),
            (r'"', String, '#pop')
        ]
    }
