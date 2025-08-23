"""
    pygments.lexers.hare
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the Hare language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['HareLexer']

class HareLexer(RegexLexer):
    """
    Lexer for the Hare programming language.
    """
    name = 'Hare'
    url = 'https://harelang.org/'
    aliases = ['hare']
    filenames = ['*.ha']
    mimetypes = ['text/x-hare']
    version_added = '2.19'

    _ws = r'(?:\s|//.*?\n|/[*].*?[*]/)+'
    _ws1 = r'\s*(?:/[*].*?[*]/\s*)?'

    tokens = {
        'whitespace': [
            (r'^use.*;', Comment.Preproc),
            (r'@[a-z]+', Comment.Preproc),
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'//.*?$', Comment.Single),
        ],
        'statements': [
            (r'"', String, 'string'),
            (r'`[^`]*`', String),
            (r"'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[LlUu]*', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'0o[0-7]+[LlUu]*', Number.Oct),
            (r'\d+[zui]?(\d+)?', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (words(('as', 'is', '=>', '..', '...')), Operator),
            (r'[()\[\],.{};]+', Punctuation),
            (words(('abort', 'align', 'alloc', 'append', 'assert', 'case',
                'const', 'def', 'defer', 'delete', 'else', 'enum', 'export',
                'fn', 'for', 'free', 'if', 'let', 'len', 'match', 'offset',
                'return', 'static', 'struct', 'switch', 'type', 'union',
                'yield', 'vastart', 'vaarg', 'vaend'),
                suffix=r'\b'), Keyword),
            (r'(bool|int|uint|uintptr|u8|u16|u32|u64|i8|i16|i32|i64|f32|f64|null|done|never|void|nullable|rune|size|valist)\b',
             Keyword.Type),
            (r'(true|false|null)\b', Name.Builtin),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|'
             r'u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\', String),  # stray backslash
        ],
        'root': [
            include('whitespace'),
            include('statements'),
        ],
    }
