"""
    pygments.lexers.snobol
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the SNOBOL language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['SnobolLexer']


class SnobolLexer(RegexLexer):
    """
    Lexer for the SNOBOL4 programming language.

    Recognizes the common ASCII equivalents of the original SNOBOL4 operators.
    Does not require spaces around binary operators.
    """

    name = "Snobol"
    aliases = ["snobol"]
    filenames = ['*.snobol']
    mimetypes = ['text/x-snobol']
    url = 'https://www.regressive.org/snobol4'
    version_added = '1.5'

    tokens = {
        # root state, start of line
        # comments, continuation lines, and directives start in column 1
        # as do labels
        'root': [
            (r'\*.*\n', Comment),
            (r'[+.] ', Punctuation, 'statement'),
            (r'-.*\n', Comment),
            (r'END\s*\n', Name.Label, 'heredoc'),
            (r'[A-Za-z$][\w$]*', Name.Label, 'statement'),
            (r'\s+', Text, 'statement'),
        ],
        # statement state, line after continuation or label
        'statement': [
            (r'\s*\n', Text, '#pop'),
            (r'\s+', Text),
            (r'(?<=[^\w.])(LT|LE|EQ|NE|GE|GT|INTEGER|IDENT|DIFFER|LGT|SIZE|'
             r'REPLACE|TRIM|DUPL|REMDR|DATE|TIME|EVAL|APPLY|OPSYN|LOAD|UNLOAD|'
             r'LEN|SPAN|BREAK|ANY|NOTANY|TAB|RTAB|REM|POS|RPOS|FAIL|FENCE|'
             r'ABORT|ARB|ARBNO|BAL|SUCCEED|INPUT|OUTPUT|TERMINAL)(?=[^\w.])',
             Name.Builtin),
            (r'[A-Za-z][\w.]*', Name),
            # ASCII equivalents of original operators
            # | for the EBCDIC equivalent, ! likewise
            # \ for EBCDIC negation
            (r'\*\*|[?$.!%*/#+\-@|&\\=]', Operator),
            (r'"[^"]*"', String),
            (r"'[^']*'", String),
            # Accept SPITBOL syntax for real numbers
            # as well as Macro SNOBOL4
            (r'[0-9]+(?=[^.EeDd])', Number.Integer),
            (r'[0-9]+(\.[0-9]*)?([EDed][-+]?[0-9]+)?', Number.Float),
            # Goto
            (r':', Punctuation, 'goto'),
            (r'[()<>,;]', Punctuation),
        ],
        # Goto block
        'goto': [
            (r'\s*\n', Text, "#pop:2"),
            (r'\s+', Text),
            (r'F|S', Keyword),
            (r'(\()([A-Za-z][\w.]*)(\))',
             bygroups(Punctuation, Name.Label, Punctuation))
        ],
        # everything after the END statement is basically one
        # big heredoc.
        'heredoc': [
            (r'.*\n', String.Heredoc)
        ]
    }
