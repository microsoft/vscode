"""
    pygments.lexers.jmespath
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the JMESPath language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include
from erdos._vendor.pygments.token import String, Punctuation, Whitespace, Name, Operator, \
    Number, Literal, Keyword

__all__ = ['JMESPathLexer']


class JMESPathLexer(RegexLexer):
    """
    For JMESPath queries.
    """
    name = 'JMESPath'
    url = 'https://jmespath.org'
    filenames = ['*.jp']
    aliases = ['jmespath', 'jp']
    version_added = ''

    tokens = {
        'string': [
            (r"'(\\(.|\n)|[^'\\])*'", String),
        ],
        'punctuation': [
            (r'(\[\?|[\.\*\[\],:\(\)\{\}\|])', Punctuation),
        ],
        'ws': [
            (r" |\t|\n|\r", Whitespace)
        ],
        "dq-identifier": [
            (r'[^\\"]+', Name.Variable),
            (r'\\"', Name.Variable),
            (r'.', Punctuation, '#pop'),
        ],
        'identifier': [
            (r'(&)?(")', bygroups(Name.Variable, Punctuation), 'dq-identifier'),
            (r'(")?(&?[A-Za-z][A-Za-z0-9_-]*)(")?', bygroups(Punctuation, Name.Variable, Punctuation)),
        ],
        'root': [
            include('ws'),
            include('string'),
            (r'(==|!=|<=|>=|<|>|&&|\|\||!)', Operator),
            include('punctuation'),
            (r'@', Name.Variable.Global),
            (r'(&?[A-Za-z][A-Za-z0-9_]*)(\()', bygroups(Name.Function, Punctuation)),
            (r'(&)(\()', bygroups(Name.Variable, Punctuation)),
            include('identifier'),
            (r'-?\d+', Number),
            (r'`', Literal, 'literal'),
        ],
        'literal': [
            include('ws'),
            include('string'),
            include('punctuation'),
            (r'(false|true|null)\b', Keyword.Constant),
            include('identifier'),
            (r'-?\d+\.?\d*([eE][-+]\d+)?', Number),
            (r'\\`', Literal),
            (r'`', Literal, '#pop'),
        ]
    }
