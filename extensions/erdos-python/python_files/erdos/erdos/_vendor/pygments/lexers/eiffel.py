"""
    pygments.lexers.eiffel
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Eiffel language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words, bygroups
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, \
    Punctuation, Whitespace

__all__ = ['EiffelLexer']


class EiffelLexer(RegexLexer):
    """
    For Eiffel source code.
    """
    name = 'Eiffel'
    url = 'https://www.eiffel.com'
    aliases = ['eiffel']
    filenames = ['*.e']
    mimetypes = ['text/x-eiffel']
    version_added = '2.0'

    tokens = {
        'root': [
            (r'[^\S\n]+', Whitespace),
            (r'--.*?$', Comment.Single),
            (r'[^\S\n]+', Whitespace),
            # Please note that keyword and operator are case insensitive.
            (r'(?i)(true|false|void|current|result|precursor)\b', Keyword.Constant),
            (r'(?i)(not|xor|implies|or)\b', Operator.Word),
            (r'(?i)(and)(?:(\s+)(then))?\b',
             bygroups(Operator.Word, Whitespace, Operator.Word)),
            (r'(?i)(or)(?:(\s+)(else))?\b',
             bygroups(Operator.Word, Whitespace, Operator.Word)),
            (words((
                'across', 'agent', 'alias', 'all', 'as', 'assign', 'attached',
                'attribute', 'check', 'class', 'convert', 'create', 'debug',
                'deferred', 'detachable', 'do', 'else', 'elseif', 'end', 'ensure',
                'expanded', 'export', 'external', 'feature', 'from', 'frozen', 'if',
                'inherit', 'inspect', 'invariant', 'like', 'local', 'loop', 'none',
                'note', 'obsolete', 'old', 'once', 'only', 'redefine', 'rename',
                'require', 'rescue', 'retry', 'select', 'separate', 'then',
                'undefine', 'until', 'variant', 'when'), prefix=r'(?i)\b', suffix=r'\b'),
             Keyword.Reserved),
            (r'"\[([^\]%]|%(.|\n)|\][^"])*?\]"', String),
            (r'"([^"%\n]|%.)*?"', String),
            include('numbers'),
            (r"'([^'%]|%'|%%)'", String.Char),
            (r"(//|\\\\|>=|<=|:=|/=|~|/~|[\\?!#%&@|+/\-=>*$<^\[\]])", Operator),
            (r"([{}():;,.])", Punctuation),
            (r'([a-z]\w*)|([A-Z][A-Z0-9_]*[a-z]\w*)', Name),
            (r'([A-Z][A-Z0-9_]*)', Name.Class),
            (r'\n+', Whitespace),
        ],
        'numbers': [
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (r'0[bB][01]+', Number.Bin),
            (r'0[cC][0-7]+', Number.Oct),
            (r'([0-9]+\.[0-9]*)|([0-9]*\.[0-9]+)', Number.Float),
            (r'[0-9]+', Number.Integer),
        ],
    }
