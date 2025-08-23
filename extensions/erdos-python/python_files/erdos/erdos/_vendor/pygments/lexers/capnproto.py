"""
    pygments.lexers.capnproto
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Cap'n Proto schema language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, default
from erdos.erdos._vendor.pygments.token import Text, Comment, Keyword, Name, Literal, Whitespace

__all__ = ['CapnProtoLexer']


class CapnProtoLexer(RegexLexer):
    """
    For Cap'n Proto source.
    """
    name = 'Cap\'n Proto'
    url = 'https://capnproto.org'
    filenames = ['*.capnp']
    aliases = ['capnp']
    version_added = '2.2'

    tokens = {
        'root': [
            (r'#.*?$', Comment.Single),
            (r'@[0-9a-zA-Z]*', Name.Decorator),
            (r'=', Literal, 'expression'),
            (r':', Name.Class, 'type'),
            (r'\$', Name.Attribute, 'annotation'),
            (r'(struct|enum|interface|union|import|using|const|annotation|'
             r'extends|in|of|on|as|with|from|fixed)\b',
             Keyword),
            (r'[\w.]+', Name),
            (r'[^#@=:$\w\s]+', Text),
            (r'\s+', Whitespace),
        ],
        'type': [
            (r'[^][=;,(){}$]+', Name.Class),
            (r'[\[(]', Name.Class, 'parentype'),
            default('#pop'),
        ],
        'parentype': [
            (r'[^][;()]+', Name.Class),
            (r'[\[(]', Name.Class, '#push'),
            (r'[])]', Name.Class, '#pop'),
            default('#pop'),
        ],
        'expression': [
            (r'[^][;,(){}$]+', Literal),
            (r'[\[(]', Literal, 'parenexp'),
            default('#pop'),
        ],
        'parenexp': [
            (r'[^][;()]+', Literal),
            (r'[\[(]', Literal, '#push'),
            (r'[])]', Literal, '#pop'),
            default('#pop'),
        ],
        'annotation': [
            (r'[^][;,(){}=:]+', Name.Attribute),
            (r'[\[(]', Name.Attribute, 'annexp'),
            default('#pop'),
        ],
        'annexp': [
            (r'[^][;()]+', Name.Attribute),
            (r'[\[(]', Name.Attribute, '#push'),
            (r'[])]', Name.Attribute, '#pop'),
            default('#pop'),
        ],
    }
