"""
    pygments.lexers.yara
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for YARA.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Comment, String, Name, Text, Punctuation, \
    Operator, Keyword, Whitespace, Number

__all__ = ['YaraLexer']


class YaraLexer(RegexLexer):
    """
    For YARA rules
    """

    name = 'YARA'
    url = 'https://virustotal.github.io/yara/'
    aliases = ['yara', 'yar']
    filenames = ['*.yar']
    mimetypes = ['text/x-yara']
    version_added = '2.16'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'//.*?$', Comment.Single),
            (r'\#.*?$', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),
            (words(('rule', 'private', 'global', 'import', 'include'),
                   prefix=r'\b', suffix=r'\b'),
             Keyword.Declaration),
            (words(('strings', 'condition', 'meta'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words(('ascii', 'at', 'base64', 'base64wide', 'condition',
                    'contains', 'endswith', 'entrypoint', 'filesize', 'for',
                    'fullword', 'icontains', 'iendswith', 'iequals', 'in',
                    'include', 'int16', 'int16be', 'int32', 'int32be', 'int8',
                    'int8be', 'istartswith', 'matches', 'meta', 'nocase',
                    'none', 'of', 'startswith', 'strings', 'them', 'uint16',
                    'uint16be', 'uint32', 'uint32be', 'uint8', 'uint8be',
                    'wide', 'xor', 'defined'),
                   prefix=r'\b', suffix=r'\b'),
             Name.Builtin),
            (r'(true|false)\b', Keyword.Constant),
            (r'(and|or|not|any|all)\b', Operator.Word),
            (r'(\$\w+)', Name.Variable),
            (r'"[^"]*"', String.Double),
            (r'\'[^\']*\'', String.Single),
            (r'\{.*?\}$', Number.Hex),
            (r'(/.*?/)', String.Regex),
            (r'[a-z_]\w*', Name),
            (r'[$(){}[\].?+*|]', Punctuation),
            (r'[:=,;]', Punctuation),
            (r'.', Text)
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ]
    }
