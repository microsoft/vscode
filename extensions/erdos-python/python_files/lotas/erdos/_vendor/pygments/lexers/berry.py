"""
    pygments.lexers.berry
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Berry.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words, include, bygroups
from erdos._vendor.pygments.token import Comment, Whitespace, Operator, Keyword, Name, \
    String, Number, Punctuation

__all__ = ['BerryLexer']


class BerryLexer(RegexLexer):
    """
    For Berry source code.
    """
    name = 'Berry'
    aliases = ['berry', 'be']
    filenames = ['*.be']
    mimetypes = ['text/x-berry', 'application/x-berry']
    url = 'https://berry-lang.github.io'
    version_added = '2.12'

    _name = r'\b[^\W\d]\w*'

    tokens = {
        'root': [
            include('whitespace'),
            include('numbers'),
            include('keywords'),
            (rf'(def)(\s+)({_name})',
             bygroups(Keyword.Declaration, Whitespace, Name.Function)),
            (rf'\b(class)(\s+)({_name})',
             bygroups(Keyword.Declaration, Whitespace, Name.Class)),
            (rf'\b(import)(\s+)({_name})',
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
            include('expr')
        ],
        'expr': [
            (r'[^\S\n]+', Whitespace),
            (r'\.\.|[~!%^&*+=|?:<>/-]', Operator),
            (r'[(){}\[\],.;]', Punctuation),
            include('controls'),
            include('builtins'),
            include('funccall'),
            include('member'),
            include('name'),
            include('strings')
        ],
        'whitespace': [
            (r'\s+', Whitespace),
            (r'#-(.|\n)*?-#', Comment.Multiline),
            (r'#.*?$', Comment.Single)
        ],
        'keywords': [
            (words((
                'as', 'break', 'continue', 'import', 'static', 'self', 'super'),
                suffix=r'\b'), Keyword.Reserved),
            (r'(true|false|nil)\b', Keyword.Constant),
            (r'(var|def)\b', Keyword.Declaration)
        ],
        'controls': [
            (words((
                'if', 'elif', 'else', 'for', 'while', 'do', 'end', 'break',
                'continue', 'return', 'try', 'except', 'raise'),
                suffix=r'\b'), Keyword)
        ],
        'builtins': [
            (words((
                'assert', 'bool', 'input', 'classname', 'classof', 'number', 'real',
                'bytes', 'compile', 'map', 'list', 'int', 'isinstance', 'print',
                'range', 'str', 'super', 'module', 'size', 'issubclass', 'open',
                'file', 'type', 'call'),
                suffix=r'\b'), Name.Builtin)
        ],
        'numbers': [
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (r'-?\d+', Number.Integer),
            (r'(-?\d+\.?|\.\d)\d*([eE][+-]?\d+)?', Number.Float)
        ],
        'name': [
            (_name, Name)
        ],
        'funccall': [
            (rf'{_name}(?=\s*\()', Name.Function, '#pop')
        ],
        'member': [
            (rf'(?<=\.){_name}\b(?!\()', Name.Attribute, '#pop')
        ],
        'strings': [
            (r'"([^\\]|\\.)*?"', String.Double, '#pop'),
            (r'\'([^\\]|\\.)*?\'', String.Single, '#pop')
        ]
    }
