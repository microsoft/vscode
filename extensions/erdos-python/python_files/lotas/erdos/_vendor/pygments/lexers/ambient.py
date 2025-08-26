"""
    pygments.lexers.ambient
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for AmbientTalk language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words, bygroups
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['AmbientTalkLexer']


class AmbientTalkLexer(RegexLexer):
    """
    Lexer for AmbientTalk source code.
    """
    name = 'AmbientTalk'
    url = 'https://code.google.com/p/ambienttalk'
    filenames = ['*.at']
    aliases = ['ambienttalk', 'ambienttalk/2', 'at']
    mimetypes = ['text/x-ambienttalk']
    version_added = '2.0'

    flags = re.MULTILINE | re.DOTALL

    builtin = words(('if:', 'then:', 'else:', 'when:', 'whenever:', 'discovered:',
                     'disconnected:', 'reconnected:', 'takenOffline:', 'becomes:',
                     'export:', 'as:', 'object:', 'actor:', 'mirror:', 'taggedAs:',
                     'mirroredBy:', 'is:'))
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'//.*?\n', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'(def|deftype|import|alias|exclude)\b', Keyword),
            (builtin, Name.Builtin),
            (r'(true|false|nil)\b', Keyword.Constant),
            (r'(~|lobby|jlobby|/)\.', Keyword.Constant, 'namespace'),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r'\|', Punctuation, 'arglist'),
            (r'<:|[*^!%&<>+=,./?-]|:=', Operator),
            (r"`[a-zA-Z_]\w*", String.Symbol),
            (r"[a-zA-Z_]\w*:", Name.Function),
            (r"[{}()\[\];`]", Punctuation),
            (r'(self|super)\b', Name.Variable.Instance),
            (r"[a-zA-Z_]\w*", Name.Variable),
            (r"@[a-zA-Z_]\w*", Name.Class),
            (r"@\[", Name.Class, 'annotations'),
            include('numbers'),
        ],
        'numbers': [
            (r'(\d+\.\d*|\d*\.\d+)([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+', Number.Integer)
        ],
        'namespace': [
            (r'[a-zA-Z_]\w*\.', Name.Namespace),
            (r'[a-zA-Z_]\w*:', Name.Function, '#pop'),
            (r'[a-zA-Z_]\w*(?!\.)', Name.Function, '#pop')
        ],
        'annotations': [
            (r"(.*?)\]", Name.Class, '#pop')
        ],
        'arglist': [
            (r'\|', Punctuation, '#pop'),
            (r'(\s*)(,)(\s*)', bygroups(Whitespace, Punctuation, Whitespace)),
            (r'[a-zA-Z_]\w*', Name.Variable),
        ],
    }
