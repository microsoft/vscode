"""
    pygments.lexers.gcodelexer
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the G Code Language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos.erdos._vendor.pygments.token import Comment, Name, Text, Keyword, Number

__all__ = ['GcodeLexer']


class GcodeLexer(RegexLexer):
    """
    For gcode source code.
    """
    name = 'g-code'
    aliases = ['gcode']
    filenames = ['*.gcode']
    url = 'https://en.wikipedia.org/wiki/G-code'
    version_added = '2.9'

    tokens = {
        'root': [
            (r';.*\n', Comment),
            (r'^[gmGM]\d{1,4}\s', Name.Builtin),  # M or G commands
            (r'([^gGmM])([+-]?\d*[.]?\d+)', bygroups(Keyword, Number)),
            (r'\s', Text.Whitespace),
            (r'.*\n', Text),
        ]
    }
