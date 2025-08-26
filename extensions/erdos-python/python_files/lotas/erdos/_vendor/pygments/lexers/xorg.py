"""
    pygments.lexers.xorg
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Xorg configs.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from lotas.erdos._vendor.pygments.token import Comment, String, Name, Text

__all__ = ['XorgLexer']


class XorgLexer(RegexLexer):
    """Lexer for xorg.conf files."""
    name = 'Xorg'
    url = 'https://www.x.org/wiki/'
    aliases = ['xorg.conf']
    filenames = ['xorg.conf']
    mimetypes = []
    version_added = ''

    tokens = {
        'root': [
            (r'\s+', Text),
            (r'#.*$', Comment),

            (r'((?:Sub)?Section)(\s+)("\w+")',
             bygroups(String.Escape, Text, String.Escape)),
            (r'(End(?:Sub)?Section)', String.Escape),

            (r'(\w+)(\s+)([^\n#]+)',
             bygroups(Name.Builtin, Text, Name.Constant)),
        ],
    }
