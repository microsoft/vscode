"""
    pygments.lexers.smithy
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Smithy IDL.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Keyword, Name, String, \
    Number, Whitespace, Punctuation

__all__ = ['SmithyLexer']


class SmithyLexer(RegexLexer):
    """
    For Smithy IDL
    """
    name = 'Smithy'
    url = 'https://awslabs.github.io/smithy/'
    filenames = ['*.smithy']
    aliases = ['smithy']
    version_added = '2.10'

    unquoted = r'[A-Za-z0-9_\.#$-]+'
    identifier = r"[A-Za-z0-9_\.#$-]+"

    simple_shapes = (
        'use', 'byte', 'short', 'integer', 'long', 'float', 'document',
        'double', 'bigInteger', 'bigDecimal', 'boolean', 'blob', 'string',
        'timestamp',
    )

    aggregate_shapes = (
       'apply', 'list', 'map', 'set', 'structure', 'union', 'resource',
       'operation', 'service', 'trait'
    )

    tokens = {
        'root': [
            (r'///.*$', Comment.Multiline),
            (r'//.*$', Comment),
            (r'@[0-9a-zA-Z\.#-]*', Name.Decorator),
            (r'(=)', Name.Decorator),
            (r'^(\$version)(:)(.+)',
                bygroups(Keyword.Declaration, Name.Decorator, Name.Class)),
            (r'^(namespace)(\s+' + identifier + r')\b',
                bygroups(Keyword.Declaration, Name.Class)),
            (words(simple_shapes,
                   prefix=r'^', suffix=r'(\s+' + identifier + r')\b'),
                bygroups(Keyword.Declaration, Name.Class)),
            (words(aggregate_shapes,
                   prefix=r'^', suffix=r'(\s+' + identifier + r')'),
                bygroups(Keyword.Declaration, Name.Class)),
            (r'^(metadata)(\s+)((?:\S+)|(?:\"[^"]+\"))(\s*)(=)',
                bygroups(Keyword.Declaration, Whitespace, Name.Class,
                         Whitespace, Name.Decorator)),
            (r"(true|false|null)", Keyword.Constant),
            (r"(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)", Number),
            (identifier + ":", Name.Label),
            (identifier, Name.Variable.Class),
            (r'\[', Text, "#push"),
            (r'\]', Text, "#pop"),
            (r'\(', Text, "#push"),
            (r'\)', Text, "#pop"),
            (r'\{', Text, "#push"),
            (r'\}', Text, "#pop"),
            (r'"{3}(\\\\|\n|\\")*"{3}', String.Doc),
            (r'"(\\\\|\n|\\"|[^"])*"', String.Double),
            (r"'(\\\\|\n|\\'|[^'])*'", String.Single),
            (r'[:,]+', Punctuation),
            (r'\s+', Whitespace),
        ]
    }
