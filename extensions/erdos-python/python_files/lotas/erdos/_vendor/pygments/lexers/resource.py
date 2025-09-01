"""
    pygments.lexers.resource
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for resource definition files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos._vendor.pygments.token import Comment, String, Number, Operator, Text, \
    Keyword, Name

__all__ = ['ResourceLexer']


class ResourceLexer(RegexLexer):
    """Lexer for ICU Resource bundles.
    """
    name = 'ResourceBundle'
    aliases = ['resourcebundle', 'resource']
    filenames = []
    url = 'https://unicode-org.github.io/icu/userguide/locale/resources.html'
    version_added = '2.0'

    _types = (':table', ':array', ':string', ':bin', ':import', ':intvector',
              ':int', ':alias')

    flags = re.MULTILINE | re.IGNORECASE
    tokens = {
        'root': [
            (r'//.*?$', Comment),
            (r'"', String, 'string'),
            (r'-?\d+', Number.Integer),
            (r'[,{}]', Operator),
            (r'([^\s{{:]+)(\s*)({}?)'.format('|'.join(_types)),
             bygroups(Name, Text, Keyword)),
            (r'\s+', Text),
            (words(_types), Keyword),
        ],
        'string': [
            (r'(\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|\\U00[0-9a-f]{6}|'
             r'\\[0-7]{1,3}|\\c.|\\[abtnvfre\'"?\\]|\\\{|[^"{\\])+', String),
            (r'\{', String.Escape, 'msgname'),
            (r'"', String, '#pop')
        ],
        'msgname': [
            (r'([^{},]+)(\s*)', bygroups(Name, String.Escape), ('#pop', 'message'))
        ],
        'message': [
            (r'\{', String.Escape, 'msgname'),
            (r'\}', String.Escape, '#pop'),
            (r'(,)(\s*)([a-z]+)(\s*\})',
             bygroups(Operator, String.Escape, Keyword, String.Escape), '#pop'),
            (r'(,)(\s*)([a-z]+)(\s*)(,)(\s*)(offset)(\s*)(:)(\s*)(-?\d+)(\s*)',
             bygroups(Operator, String.Escape, Keyword, String.Escape, Operator,
                      String.Escape, Operator.Word, String.Escape, Operator,
                      String.Escape, Number.Integer, String.Escape), 'choice'),
            (r'(,)(\s*)([a-z]+)(\s*)(,)(\s*)',
             bygroups(Operator, String.Escape, Keyword, String.Escape, Operator,
                      String.Escape), 'choice'),
            (r'\s+', String.Escape)
        ],
        'choice': [
            (r'(=|<|>|<=|>=|!=)(-?\d+)(\s*\{)',
             bygroups(Operator, Number.Integer, String.Escape), 'message'),
            (r'([a-z]+)(\s*\{)', bygroups(Keyword.Type, String.Escape), 'str'),
            (r'\}', String.Escape, ('#pop', '#pop')),
            (r'\s+', String.Escape)
        ],
        'str': [
            (r'\}', String.Escape, '#pop'),
            (r'\{', String.Escape, 'msgname'),
            (r'[^{}]+', String)
        ]
    }

    def analyse_text(text):
        if text.startswith('root:table'):
            return 1.0
