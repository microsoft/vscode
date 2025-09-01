"""
    pygments.lexers.x10
    ~~~~~~~~~~~~~~~~~~~

    Lexers for the X10 programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer
from erdos._vendor.pygments.token import Text, Comment, Keyword, String

__all__ = ['X10Lexer']


class X10Lexer(RegexLexer):
    """
    For the X10 language.
    """

    name = 'X10'
    url = 'http://x10-lang.org/'
    aliases = ['x10', 'xten']
    filenames = ['*.x10']
    mimetypes = ['text/x-x10']
    version_added = '2.2'

    keywords = (
        'as', 'assert', 'async', 'at', 'athome', 'ateach', 'atomic',
        'break', 'case', 'catch', 'class', 'clocked', 'continue',
        'def', 'default', 'do', 'else', 'final', 'finally', 'finish',
        'for', 'goto', 'haszero', 'here', 'if', 'import', 'in',
        'instanceof', 'interface', 'isref', 'new', 'offer',
        'operator', 'package', 'return', 'struct', 'switch', 'throw',
        'try', 'type', 'val', 'var', 'when', 'while'
    )

    types = (
        'void'
    )

    values = (
        'false', 'null', 'self', 'super', 'this', 'true'
    )

    modifiers = (
        'abstract', 'extends', 'implements', 'native', 'offers',
        'private', 'property', 'protected', 'public', 'static',
        'throws', 'transient'
    )

    tokens = {
        'root': [
            (r'[^\S\n]+', Text),
            (r'//.*?\n', Comment.Single),
            (r'/\*(.|\n)*?\*/', Comment.Multiline),
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
            (r'\b({})\b'.format('|'.join(types)), Keyword.Type),
            (r'\b({})\b'.format('|'.join(values)), Keyword.Constant),
            (r'\b({})\b'.format('|'.join(modifiers)), Keyword.Declaration),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r"'\\.'|'[^\\]'|'\\u[0-9a-fA-F]{4}'", String.Char),
            (r'.', Text)
        ],
    }
