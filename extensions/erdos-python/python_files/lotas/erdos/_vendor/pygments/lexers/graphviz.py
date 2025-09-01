"""
    pygments.lexers.graphviz
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the DOT language (graphviz).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos._vendor.pygments.token import Comment, Keyword, Operator, Name, String, Number, \
    Punctuation, Whitespace


__all__ = ['GraphvizLexer']


class GraphvizLexer(RegexLexer):
    """
    For graphviz DOT graph description language.
    """
    name = 'Graphviz'
    url = 'https://www.graphviz.org/doc/info/lang.html'
    aliases = ['graphviz', 'dot']
    filenames = ['*.gv', '*.dot']
    mimetypes = ['text/x-graphviz', 'text/vnd.graphviz']
    version_added = '2.8'
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(#|//).*?$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'(?i)(node|edge|graph|digraph|subgraph|strict)\b', Keyword),
            (r'--|->', Operator),
            (r'[{}[\]:;,]', Punctuation),
            (r'(\b\D\w*)(\s*)(=)(\s*)',
                bygroups(Name.Attribute, Whitespace, Punctuation, Whitespace),
                'attr_id'),
            (r'\b(n|ne|e|se|s|sw|w|nw|c|_)\b', Name.Builtin),
            (r'\b\D\w*', Name.Tag),  # node
            (r'[-]?((\.[0-9]+)|([0-9]+(\.[0-9]*)?))', Number),
            (r'"(\\"|[^"])*?"', Name.Tag),  # quoted node
            (r'<', Punctuation, 'xml'),
        ],
        'attr_id': [
            (r'\b\D\w*', String, '#pop'),
            (r'[-]?((\.[0-9]+)|([0-9]+(\.[0-9]*)?))', Number, '#pop'),
            (r'"(\\"|[^"])*?"', String.Double, '#pop'),
            (r'<', Punctuation, ('#pop', 'xml')),
        ],
        'xml': [
            (r'<', Punctuation, '#push'),
            (r'>', Punctuation, '#pop'),
            (r'\s+', Whitespace),
            (r'[^<>\s]', Name.Tag),
        ]
    }
