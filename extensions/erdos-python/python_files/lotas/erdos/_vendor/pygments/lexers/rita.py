"""
    pygments.lexers.rita
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for RITA language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, Literal, \
    Punctuation, Whitespace

__all__ = ['RitaLexer']


class RitaLexer(RegexLexer):
    """
    Lexer for RITA.
    """
    name = 'Rita'
    url = 'https://github.com/zaibacu/rita-dsl'
    filenames = ['*.rita']
    aliases = ['rita']
    mimetypes = ['text/rita']
    version_added = '2.11'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'#(.*?)\n', Comment.Single),
            (r'@(.*?)\n', Operator),  # Yes, whole line as an operator
            (r'"(\w|\d|\s|(\\")|[\'_\-./,\?\!])+?"', Literal),
            (r'\'(\w|\d|\s|(\\\')|["_\-./,\?\!])+?\'', Literal),
            (r'([A-Z_]+)', Keyword),
            (r'([a-z0-9_]+)', Name),
            (r'((->)|[!?+*|=])', Operator),
            (r'[\(\),\{\}]', Punctuation)
        ]
    }
