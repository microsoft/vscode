"""
    pygments.lexers.tablegen
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for LLVM's TableGen DSL.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, words, using
from erdos._vendor.pygments.lexers.c_cpp import CppLexer
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text, Whitespace, Error

__all__ = ['TableGenLexer']

KEYWORDS = (
    'assert',
    'class',
    'code',
    'def',
    'dump',
    'else',
    'foreach',
    'defm',
    'defset',
    'defvar',
    'field',
    'if',
    'in',
    'include',
    'let',
    'multiclass',
    'then',
)

KEYWORDS_CONST = (
    'false',
    'true',
)
KEYWORDS_TYPE = (
    'bit',
    'bits',
    'dag',
    'int',
    'list',
    'string',
)

BANG_OPERATORS = (
    'add',
    'and',
    'cast',
    'con',
    'cond',
    'dag',
    'div',
    'empty',
    'eq',
    'exists',
    'filter',
    'find',
    'foldl',
    'foreach',
    'ge',
    'getdagarg',
    'getdagname',
    'getdagop',
    'gt',
    'head',
    'if',
    'interleave',
    'isa',
    'le',
    'listconcat',
    'listremove',
    'listsplat',
    'logtwo',
    'lt',
    'mul',
    'ne',
    'not',
    'or',
    'range',
    'repr',
    'setdagarg',
    'setdagname',
    'setdagop',
    'shl',
    'size',
    'sra',
    'srl',
    'strconcat',
    'sub',
    'subst',
    'substr',
    'tail',
    'tolower',
    'toupper',
    'xor',
)

class TableGenLexer(RegexLexer):
    """
    Lexer for TableGen
    """

    name = 'TableGen'
    url = 'https://llvm.org/docs/TableGen/ProgRef.html'
    aliases = ['tablegen', 'td']
    filenames = ['*.td']

    version_added = '2.19'

    tokens = {
        'root': [
            (r'\s+', Whitespace),

            (r'/\*', Comment.Multiline, 'comment'),
            (r'//.*?$', Comment.SingleLine),
            (r'#(define|ifdef|ifndef|else|endif)', Comment.Preproc),

            # Binary/hex numbers. Note that these take priority over names,
            # which may begin with numbers.
            (r'0b[10]+', Number.Bin),
            (r'0x[0-9a-fA-F]+', Number.Hex),

            # Keywords
            (words(KEYWORDS, suffix=r'\b'), Keyword),
            (words(KEYWORDS_CONST, suffix=r'\b'), Keyword.Constant),
            (words(KEYWORDS_TYPE, suffix=r'\b'), Keyword.Type),

            # Bang operators
            (words(BANG_OPERATORS, prefix=r'\!', suffix=r'\b'), Operator),
            # Unknown bang operators are an error
            (r'![a-zA-Z]+', Error),

            # Names and identifiers
            (r'[0-9]*[a-zA-Z_][a-zA-Z_0-9]*', Name),
            (r'\$[a-zA-Z_][a-zA-Z_0-9]*', Name.Variable),

            # Place numbers after keywords. Names/identifiers may begin with
            # numbers, and we want to parse 1X as one name token as opposed to
            # a number and a name.
            (r'[-\+]?[0-9]+', Number.Integer),

            # String literals
            (r'"', String, 'dqs'),
            (r'\[\{', Text, 'codeblock'),

            # Misc. punctuation
            (r'[-+\[\]{}()<>\.,;:=?#]+', Punctuation),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
        'strings': [
            (r'\\[\\\'"tn]', String.Escape),
            (r'[^\\"]+', String),
        ],
        # Double-quoted string, a la C
        'dqs': [
            (r'"', String, '#pop'),
            include('strings'),
        ],
        # No escaping inside a code block - everything is literal
        # Assume that the code inside a code block is C++. This isn't always
        # true in TableGen, but is the far most common scenario.
        'codeblock': [
            (r'\}\]', Text, '#pop'),
            (r'([^}]+|\}[^]])*', using(CppLexer)),
        ],
    }
