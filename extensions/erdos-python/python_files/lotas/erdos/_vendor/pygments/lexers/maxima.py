"""
    pygments.lexers.maxima
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the computer algebra system Maxima.

    Derived from pygments/lexers/algebra.py.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['MaximaLexer']

class MaximaLexer(RegexLexer):
    """
    A Maxima lexer.
    Derived from pygments.lexers.MuPADLexer.
    """
    name = 'Maxima'
    url = 'http://maxima.sourceforge.net'
    aliases = ['maxima', 'macsyma']
    filenames = ['*.mac', '*.max']
    version_added = '2.11'

    keywords = ('if', 'then', 'else', 'elseif',
                'do', 'while', 'repeat', 'until',
                'for', 'from', 'to', 'downto', 'step', 'thru')

    constants = ('%pi', '%e', '%phi', '%gamma', '%i',
                 'und', 'ind', 'infinity', 'inf', 'minf',
                 'true', 'false', 'unknown', 'done')

    operators = (r'.', r':', r'=', r'#',
                 r'+', r'-', r'*', r'/', r'^',
                 r'@', r'>', r'<', r'|', r'!', r"'")

    operator_words = ('and', 'or', 'not')

    tokens = {
        'root': [
            (r'/\*', Comment.Multiline, 'comment'),
            (r'"(?:[^"\\]|\\.)*"', String),
            (r'\(|\)|\[|\]|\{|\}', Punctuation),
            (r'[,;$]', Punctuation),
            (words (constants), Name.Constant),
            (words (keywords), Keyword),
            (words (operators), Operator),
            (words (operator_words), Operator.Word),
            (r'''(?x)
              ((?:[a-zA-Z_#][\w#]*|`[^`]*`)
              (?:::[a-zA-Z_#][\w#]*|`[^`]*`)*)(\s*)([(])''',
             bygroups(Name.Function, Text.Whitespace, Punctuation)),
            (r'''(?x)
              (?:[a-zA-Z_#%][\w#%]*|`[^`]*`)
              (?:::[a-zA-Z_#%][\w#%]*|`[^`]*`)*''', Name.Variable),
            (r'[-+]?(\d*\.\d+([bdefls][-+]?\d+)?|\d+(\.\d*)?[bdefls][-+]?\d+)', Number.Float),
            (r'[-+]?\d+', Number.Integer),
            (r'\s+', Text.Whitespace),
            (r'.', Text)
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ]
    }

    def analyse_text (text):
        strength = 0.0
        # Input expression terminator.
        if re.search (r'\$\s*$', text, re.MULTILINE):
            strength += 0.05
        # Function definition operator.
        if ':=' in text:
            strength += 0.02
        return strength
