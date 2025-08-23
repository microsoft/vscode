"""
    pygments.lexers.tls
    ~~~~~~~~~~~~~~~~~~~

    Lexers for the TLS presentation language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""
import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['TlsLexer']


class TlsLexer(RegexLexer):
    """
    The TLS presentation language, described in RFC 8446.
    """
    name = 'TLS Presentation Language'
    url = 'https://www.rfc-editor.org/rfc/rfc8446#section-3'
    filenames = []
    aliases = ['tls']
    mimetypes = []
    version_added = '2.16'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            # comments
            (r'/[*].*?[*]/', Comment.Multiline),
            # Keywords
            (words(('struct', 'enum', 'select', 'case'), suffix=r'\b'),
             Keyword),
            (words(('uint8', 'uint16', 'uint24', 'uint32', 'uint64', 'opaque'),
                   suffix=r'\b'), Keyword.Type),
            # numeric literals
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            # string literal
            (r'"(\\.|[^"\\])*"', String),
            # tokens
            (r'[.]{2}', Operator),
            (r'[+\-*/&^]', Operator),
            (r'[|<>=!()\[\]{}.,;:\?]', Punctuation),
            # identifiers
            (r'[^\W\d]\w*', Name.Other),
        ]
    }
