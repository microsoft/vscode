"""
    pygments.lexers.roboconf
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Roboconf DSL.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words, re
from erdos.erdos._vendor.pygments.token import Text, Operator, Keyword, Name, Comment

__all__ = ['RoboconfGraphLexer', 'RoboconfInstancesLexer']


class RoboconfGraphLexer(RegexLexer):
    """
    Lexer for Roboconf graph files.
    """
    name = 'Roboconf Graph'
    aliases = ['roboconf-graph']
    filenames = ['*.graph']
    url = 'https://roboconf.github.io/en/user-guide/graph-definition.html'
    version_added = '2.1'

    flags = re.IGNORECASE | re.MULTILINE
    tokens = {
        'root': [
            # Skip white spaces
            (r'\s+', Text),

            # There is one operator
            (r'=', Operator),

            # Keywords
            (words(('facet', 'import'), suffix=r'\s*\b', prefix=r'\b'), Keyword),
            (words((
                'installer', 'extends', 'exports', 'imports', 'facets',
                'children'), suffix=r'\s*:?', prefix=r'\b'), Name),

            # Comments
            (r'#.*\n', Comment),

            # Default
            (r'[^#]', Text),
            (r'.*\n', Text)
        ]
    }


class RoboconfInstancesLexer(RegexLexer):
    """
    Lexer for Roboconf instances files.
    """
    name = 'Roboconf Instances'
    aliases = ['roboconf-instances']
    filenames = ['*.instances']
    url = 'https://roboconf.github.io'
    version_added = '2.1'

    flags = re.IGNORECASE | re.MULTILINE
    tokens = {
        'root': [

            # Skip white spaces
            (r'\s+', Text),

            # Keywords
            (words(('instance of', 'import'), suffix=r'\s*\b', prefix=r'\b'), Keyword),
            (words(('name', 'count'), suffix=r's*:?', prefix=r'\b'), Name),
            (r'\s*[\w.-]+\s*:', Name),

            # Comments
            (r'#.*\n', Comment),

            # Default
            (r'[^#]', Text),
            (r'.*\n', Text)
        ]
    }
