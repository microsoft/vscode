"""
    pygments.lexers.iolang
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Io language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, \
    Whitespace

__all__ = ['IoLexer']


class IoLexer(RegexLexer):
    """
    For Io (a small, prototype-based programming language) source.
    """
    name = 'Io'
    url = 'http://iolanguage.com/'
    filenames = ['*.io']
    aliases = ['io']
    mimetypes = ['text/x-iosrc']
    version_added = '0.10'
    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            # Comments
            (r'//(.*?)$', Comment.Single),
            (r'#(.*?)$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'/\+', Comment.Multiline, 'nestedcomment'),
            # DoubleQuotedString
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # Operators
            (r'::=|:=|=|\(|\)|;|,|\*|-|\+|>|<|@|!|/|\||\^|\.|%|&|\[|\]|\{|\}',
             Operator),
            # keywords
            (r'(clone|do|doFile|doString|method|for|if|else|elseif|then)\b',
             Keyword),
            # constants
            (r'(nil|false|true)\b', Name.Constant),
            # names
            (r'(Object|list|List|Map|args|Sequence|Coroutine|File)\b',
             Name.Builtin),
            (r'[a-zA-Z_]\w*', Name),
            # numbers
            (r'(\d+\.?\d*|\d*\.\d+)([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+', Number.Integer)
        ],
        'nestedcomment': [
            (r'[^+/]+', Comment.Multiline),
            (r'/\+', Comment.Multiline, '#push'),
            (r'\+/', Comment.Multiline, '#pop'),
            (r'[+/]', Comment.Multiline),
        ]
    }
