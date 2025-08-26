"""
    pygments.lexers.spice
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Spice programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['SpiceLexer']


class SpiceLexer(RegexLexer):
    """
    For Spice source.
    """
    name = 'Spice'
    url = 'https://www.spicelang.com'
    filenames = ['*.spice']
    aliases = ['spice', 'spicelang']
    mimetypes = ['text/x-spice']
    version_added = '2.11'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'\\\n', Text),
            # comments
            (r'//(.*?)\n', Comment.Single),
            (r'/(\\\n)?[*]{2}(.|\n)*?[*](\\\n)?/', String.Doc),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            # keywords
            (r'(import|as)\b', Keyword.Namespace),
            (r'(f|p|type|struct|interface|enum|alias|operator)\b', Keyword.Declaration),
            (words(('if', 'else', 'switch', 'case', 'default', 'for', 'foreach', 'do',
                    'while', 'break', 'continue', 'fallthrough', 'return', 'assert',
                    'unsafe', 'ext'), suffix=r'\b'), Keyword),
            (words(('const', 'signed', 'unsigned', 'inline', 'public', 'heap', 'compose'),
                   suffix=r'\b'), Keyword.Pseudo),
            (words(('new', 'yield', 'stash', 'pick', 'sync', 'class'), suffix=r'\b'),
                   Keyword.Reserved),
            (r'(true|false|nil)\b', Keyword.Constant),
            (words(('double', 'int', 'short', 'long', 'byte', 'char', 'string',
                    'bool', 'dyn'), suffix=r'\b'), Keyword.Type),
            (words(('printf', 'sizeof', 'alignof', 'len', 'panic'), suffix=r'\b(\()'),
             bygroups(Name.Builtin, Punctuation)),
            # numeric literals
            (r'[-]?[0-9]*[.][0-9]+([eE][+-]?[0-9]+)?', Number.Double),
            (r'0[bB][01]+[slu]?', Number.Bin),
            (r'0[oO][0-7]+[slu]?', Number.Oct),
            (r'0[xXhH][0-9a-fA-F]+[slu]?', Number.Hex),
            (r'(0[dD])?[0-9]+[slu]?', Number.Integer),
            # string literal
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # char literal
            (r'\'(\\\\|\\[^\\]|[^\'\\])\'', String.Char),
            # tokens
            (r'<<=|>>=|<<|>>|<=|>=|\+=|-=|\*=|/=|\%=|\|=|&=|\^=|&&|\|\||&|\||'
             r'\+\+|--|\%|\^|\~|==|!=|->|::|[.]{3}|#!|#|[+\-*/&]', Operator),
            (r'[|<>=!()\[\]{}.,;:\?]', Punctuation),
            # identifiers
            (r'[^\W\d]\w*', Name.Other),
        ]
    }
