"""
    pygments.lexers.nimrod
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Nim language (formerly known as Nimrod).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, default, bygroups
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Error

__all__ = ['NimrodLexer']


class NimrodLexer(RegexLexer):
    """
    For Nim source code.
    """

    name = 'Nimrod'
    url = 'http://nim-lang.org/'
    aliases = ['nimrod', 'nim']
    filenames = ['*.nim', '*.nimrod']
    mimetypes = ['text/x-nim']
    version_added = '1.5'

    flags = re.MULTILINE | re.IGNORECASE

    def underscorize(words):
        newWords = []
        new = []
        for word in words:
            for ch in word:
                new.append(ch)
                new.append("_?")
            newWords.append(''.join(new))
            new = []
        return "|".join(newWords)

    keywords = [
        'addr', 'and', 'as', 'asm', 'bind', 'block', 'break', 'case',
        'cast', 'concept', 'const', 'continue', 'converter', 'defer', 'discard',
        'distinct', 'div', 'do', 'elif', 'else', 'end', 'enum', 'except',
        'export', 'finally', 'for', 'if', 'in', 'yield', 'interface',
        'is', 'isnot', 'iterator', 'let', 'mixin', 'mod',
        'not', 'notin', 'object', 'of', 'or', 'out', 'ptr', 'raise',
        'ref', 'return', 'shl', 'shr', 'static', 'try',
        'tuple', 'type', 'using', 'when', 'while', 'xor'
    ]

    keywordsPseudo = [
        'nil', 'true', 'false'
    ]

    opWords = [
        'and', 'or', 'not', 'xor', 'shl', 'shr', 'div', 'mod', 'in',
        'notin', 'is', 'isnot'
    ]

    types = [
        'int', 'int8', 'int16', 'int32', 'int64', 'float', 'float32', 'float64',
        'bool', 'char', 'range', 'array', 'seq', 'set', 'string'
    ]

    tokens = {
        'root': [
            # Comments
            (r'##\[', String.Doc, 'doccomment'),
            (r'##.*$', String.Doc),
            (r'#\[', Comment.Multiline, 'comment'),
            (r'#.*$', Comment),

            # Pragmas
            (r'\{\.', String.Other, 'pragma'),

            # Operators
            (r'[*=><+\-/@$~&%!?|\\\[\]]', Operator),
            (r'\.\.|\.|,|\[\.|\.\]|\{\.|\.\}|\(\.|\.\)|\{|\}|\(|\)|:|\^|`|;',
             Punctuation),

            # Case statement branch
            (r'(\n\s*)(of)(\s)', bygroups(Text.Whitespace, Keyword,
                                          Text.Whitespace), 'casebranch'),

            # Strings
            (r'(?:[\w]+)"', String, 'rdqs'),
            (r'"""', String.Double, 'tdqs'),
            ('"', String, 'dqs'),

            # Char
            ("'", String.Char, 'chars'),

            # Keywords
            (rf'({underscorize(opWords)})\b', Operator.Word),
            (r'(proc|func|method|macro|template)(\s)(?![(\[\]])',
             bygroups(Keyword, Text.Whitespace), 'funcname'),
            (rf'({underscorize(keywords)})\b', Keyword),
            (r'({})\b'.format(underscorize(['from', 'import', 'include', 'export'])),
             Keyword.Namespace),
            (r'(v_?a_?r)\b', Keyword.Declaration),
            (rf'({underscorize(types)})\b', Name.Builtin),
            (rf'({underscorize(keywordsPseudo)})\b', Keyword.Pseudo),

            # Identifiers
            (r'\b((?![_\d])\w)(((?!_)\w)|(_(?!_)\w))*', Name),

            # Numbers
            (r'[0-9][0-9_]*(?=([e.]|\'f(32|64)))',
             Number.Float, ('float-suffix', 'float-number')),
            (r'0x[a-f0-9][a-f0-9_]*', Number.Hex, 'int-suffix'),
            (r'0b[01][01_]*', Number.Bin, 'int-suffix'),
            (r'0o[0-7][0-7_]*', Number.Oct, 'int-suffix'),
            (r'[0-9][0-9_]*', Number.Integer, 'int-suffix'),

            # Whitespace
            (r'\s+', Text.Whitespace),
            (r'.+$', Error),
        ],
        'chars': [
            (r'\\([\\abcefnrtvl"\']|x[a-f0-9]{2}|[0-9]{1,3})', String.Escape),
            (r"'", String.Char, '#pop'),
            (r".", String.Char)
        ],
        'strings': [
            (r'(?<!\$)\$(\d+|#|\w+)+', String.Interpol),
            (r'[^\\\'"$\n]+', String),
            # quotes, dollars and backslashes must be parsed one at a time
            (r'[\'"\\]', String),
            # unhandled string formatting sign
            (r'\$', String)
            # newlines are an error (use "nl" state)
        ],
        'doccomment': [
            (r'[^\]#]+', String.Doc),
            (r'##\[', String.Doc, '#push'),
            (r'\]##', String.Doc, '#pop'),
            (r'[\]#]', String.Doc),
        ],
        'comment': [
            (r'[^\]#]+', Comment.Multiline),
            (r'#\[', Comment.Multiline, '#push'),
            (r'\]#', Comment.Multiline, '#pop'),
            (r'[\]#]', Comment.Multiline),
        ],
        'dqs': [
            (r'\\([\\abcefnrtvl"\']|\n|x[a-f0-9]{2}|[0-9]{1,3})',
             String.Escape),
            (r'"', String, '#pop'),
            include('strings')
        ],
        'rdqs': [
            (r'"(?!")', String, '#pop'),
            (r'""', String.Escape),
            include('strings')
        ],
        'tdqs': [
            (r'"""', String.Double, '#pop'),
            include('strings'),
            (r'\n', String.Double)
        ],
        'funcname': [
            (r'((?![\d_])\w)(((?!_)\w)|(_(?!_)\w))*', Name.Function, '#pop'),
            (r'`.+`', Name.Function, '#pop')
        ],
        'nl': [
            (r'\n', String)
        ],
        'float-number': [
            (r'\.(?!\.)[0-9_]*[f]*', Number.Float),
            (r'e[+-]?[0-9][0-9_]*', Number.Float),
            default('#pop')
        ],
        'float-suffix': [
            (r'\'f(32|64)', Number.Float),
            default('#pop')
        ],
        'int-suffix': [
            (r'\'i(32|64)', Number.Integer.Long),
            (r'\'i(8|16)', Number.Integer),
            default('#pop')
        ],
        'casebranch': [
            (r',', Punctuation),
            (r'[\n ]+', Text.Whitespace),
            (r':', Operator, '#pop'),
            (r'\w+|[^:]', Name.Label),
        ],
        'pragma': [
            (r'[:,]', Text),
            (r'[\n ]+', Text.Whitespace),
            (r'\.\}', String.Other, '#pop'),
            (r'\w+|\W+|[^.}]', String.Other),
        ],
    }
