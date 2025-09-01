"""
    pygments.lexers.func
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for FunC.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Whitespace, Punctuation

__all__ = ['FuncLexer']


class FuncLexer(RegexLexer):
    """
    For FunC source code.
    """

    name = 'FunC'
    aliases = ['func', 'fc']
    filenames = ['*.fc', '*.func']
    url = 'https://docs.ton.org/develop/func/overview'
    version_added = ''

    # 1. Does not start from "
    # 2. Can start from ` and end with `, containing any character
    # 3. Starts with underscore or { or } and have more than 1 character after it
    # 4. Starts with letter, contains letters, numbers and underscores
    identifier = r'(?!")(`([^`]+)`|((?=_)_|(?=\{)\{|(?=\})\}|(?![_`{}]))([^;,\[\]\(\)\s~.]+))'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),

            include('keywords'),
            include('strings'),
            include('directives'),
            include('numeric'),
            include('comments'),
            include('storage'),
            include('functions'),
            include('variables'),

            (r'[.;(),\[\]~{}]', Punctuation)
        ],
        'keywords': [
            (words((
                '<=>', '>=', '<=', '!=', '==', '^>>', '~>>',
                '>>', '<<', '/%', '^%', '~%', '^/', '~/', '+=',
                '-=', '*=', '/=', '~/=', '^/=', '%=', '^%=', '<<=',
                '>>=', '~>>=', '^>>=', '&=', '|=', '^=', '^', '=',
                '~', '/', '%', '-', '*', '+','>',
                '<', '&', '|', ':', '?'), prefix=r'(?<=\s)', suffix=r'(?=\s)'),
             Operator),
            (words((
                'if', 'ifnot',
                'else', 'elseif', 'elseifnot',
                'while', 'do', 'until', 'repeat',
                'return', 'impure', 'method_id',
                'forall', 'asm', 'inline', 'inline_ref'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words(('true', 'false'), prefix=r'\b', suffix=r'\b'), Keyword.Constant),
        ],
        'directives': [
            (r'#include|#pragma', Keyword, 'directive'),
        ],
        'directive': [
            include('strings'),
            (r'\s+', Whitespace),
            (r'version|not-version', Keyword),
            (r'(>=|<=|=|>|<|\^)?([0-9]+)(.[0-9]+)?(.[0-9]+)?', Number), # version
            (r';', Text, '#pop')
        ],
        'strings': [
            (r'\"([^\n\"]+)\"[Hhcusa]?', String),
        ],
        'numeric': [
            (r'\b(-?(?!_)([\d_]+|0x[\d_a-fA-F]+)|0b[1_0]+)(?<!_)(?=[\s\)\],;])', Number)
        ],
        'comments': [
            (r';;([^\n]*)', Comment.Singleline),
            (r'\{-', Comment.Multiline, 'comment'),
        ],
        'comment': [
            (r'[^-}{]+', Comment.Multiline),
            (r'\{-', Comment.Multiline, '#push'),
            (r'-\}', Comment.Multiline, '#pop'),
            (r'[-}{]', Comment.Multiline),
        ],
        'storage': [
            (words((
                'var', 'int', 'slice', 'tuple',
                'cell', 'builder', 'cont', '_'),
                prefix=r'\b', suffix=r'(?=[\s\(\),\[\]])'),
             Keyword.Type),
            (words(('global', 'const'), prefix=r'\b', suffix=r'\b'), Keyword.Constant),
        ],
        'variables': [
            (identifier, Name.Variable),
        ],
        'functions': [
            # identifier followed by (
            (identifier + r'(?=[\(])', Name.Function),
        ]
    }
