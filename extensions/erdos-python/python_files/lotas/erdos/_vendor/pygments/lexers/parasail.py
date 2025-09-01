"""
    pygments.lexers.parasail
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for ParaSail.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Literal

__all__ = ['ParaSailLexer']


class ParaSailLexer(RegexLexer):
    """
    For ParaSail source code.
    """

    name = 'ParaSail'
    url = 'http://www.parasail-lang.org'
    aliases = ['parasail']
    filenames = ['*.psi', '*.psl']
    mimetypes = ['text/x-parasail']
    version_added = '2.1'

    flags = re.MULTILINE

    tokens = {
        'root': [
            (r'[^\S\n]+', Text),
            (r'//.*?\n', Comment.Single),
            (r'\b(and|or|xor)=', Operator.Word),
            (r'\b(and(\s+then)?|or(\s+else)?|xor|rem|mod|'
             r'(is|not)\s+null)\b',
             Operator.Word),
            # Keywords
            (r'\b(abs|abstract|all|block|class|concurrent|const|continue|'
             r'each|end|exit|extends|exports|forward|func|global|implements|'
             r'import|in|interface|is|lambda|locked|new|not|null|of|op|'
             r'optional|private|queued|ref|return|reverse|separate|some|'
             r'type|until|var|with|'
             # Control flow
             r'if|then|else|elsif|case|for|while|loop)\b',
             Keyword.Reserved),
            (r'(abstract\s+)?(interface|class|op|func|type)',
             Keyword.Declaration),
            # Literals
            (r'"[^"]*"', String),
            (r'\\[\'ntrf"0]', String.Escape),
            (r'#[a-zA-Z]\w*', Literal),       # Enumeration
            include('numbers'),
            (r"'[^']'", String.Char),
            (r'[a-zA-Z]\w*', Name),
            # Operators and Punctuation
            (r'(<==|==>|<=>|\*\*=|<\|=|<<=|>>=|==|!=|=\?|<=|>=|'
             r'\*\*|<<|>>|=>|:=|\+=|-=|\*=|\|=|\||/=|\+|-|\*|/|'
             r'\.\.|<\.\.|\.\.<|<\.\.<)',
             Operator),
            (r'(<|>|\[|\]|\(|\)|\||:|;|,|.|\{|\}|->)',
             Punctuation),
            (r'\n+', Text),
        ],
        'numbers': [
            (r'\d[0-9_]*#[0-9a-fA-F][0-9a-fA-F_]*#', Number.Hex),  # any base
            (r'0[xX][0-9a-fA-F][0-9a-fA-F_]*', Number.Hex),        # C-like hex
            (r'0[bB][01][01_]*', Number.Bin),                      # C-like bin
            (r'\d[0-9_]*\.\d[0-9_]*[eE][+-]\d[0-9_]*',             # float exp
             Number.Float),
            (r'\d[0-9_]*\.\d[0-9_]*', Number.Float),               # float
            (r'\d[0-9_]*', Number.Integer),                        # integer
        ],
    }
