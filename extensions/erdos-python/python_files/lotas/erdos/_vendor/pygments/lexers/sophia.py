"""
    pygments.lexers.sophia
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Sophia.

    Derived from pygments/lexers/reason.py.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, default, words
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text

__all__ = ['SophiaLexer']

class SophiaLexer(RegexLexer):
    """
    A Sophia lexer.
    """

    name = 'Sophia'
    aliases = ['sophia']
    filenames = ['*.aes']
    mimetypes = []
    url = 'https://docs.aeternity.com/aesophia'
    version_added = '2.11'

    keywords = (
        'contract', 'include', 'let', 'switch', 'type', 'record', 'datatype',
        'if', 'elif', 'else', 'function', 'stateful', 'payable', 'public',
        'entrypoint', 'private', 'indexed', 'namespace', 'interface', 'main',
        'using', 'as', 'for', 'hiding',
    )

    builtins = ('state', 'put', 'abort', 'require')

    word_operators = ('mod', 'band', 'bor', 'bxor', 'bnot')

    primitive_types = ('int', 'address', 'bool', 'bits', 'bytes', 'string',
                       'list', 'option', 'char', 'unit', 'map', 'event',
                       'hash', 'signature', 'oracle', 'oracle_query')

    tokens = {
        'escape-sequence': [
            (r'\\[\\"\'ntbr]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
        ],
        'root': [
            (r'\s+', Text.Whitespace),
            (r'(true|false)\b', Keyword.Constant),
            (r'\b([A-Z][\w\']*)(?=\s*\.)', Name.Class, 'dotted'),
            (r'\b([A-Z][\w\']*)', Name.Function),
            (r'//.*?\n', Comment.Single),
            (r'\/\*(?!/)', Comment.Multiline, 'comment'),

            (r'0[xX][\da-fA-F][\da-fA-F_]*', Number.Hex),
            (r'#[\da-fA-F][\da-fA-F_]*', Name.Label),
            (r'\d[\d_]*', Number.Integer),

            (words(keywords, suffix=r'\b'), Keyword),
            (words(builtins, suffix=r'\b'), Name.Builtin),
            (words(word_operators, prefix=r'\b', suffix=r'\b'), Operator.Word),
            (words(primitive_types, prefix=r'\b', suffix=r'\b'), Keyword.Type),

            (r'[=!<>+\\*/:&|?~@^-]', Operator.Word),
            (r'[.;:{}(),\[\]]', Punctuation),

            (r"(ak_|ok_|oq_|ct_)[\w']*", Name.Label),
            (r"[^\W\d][\w']*", Name),

            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2}))'",
             String.Char),
            (r"'.'", String.Char),
            (r"'[a-z][\w]*", Name.Variable),

            (r'"', String.Double, 'string')
        ],
        'comment': [
            (r'[^/*]+', Comment.Multiline),
            (r'\/\*', Comment.Multiline, '#push'),
            (r'\*\/', Comment.Multiline, '#pop'),
            (r'\*', Comment.Multiline),
        ],
        'string': [
            (r'[^\\"]+', String.Double),
            include('escape-sequence'),
            (r'\\\n', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'dotted': [
            (r'\s+', Text),
            (r'\.', Punctuation),
            (r'[A-Z][\w\']*(?=\s*\.)', Name.Function),
            (r'[A-Z][\w\']*', Name.Function, '#pop'),
            (r'[a-z_][\w\']*', Name, '#pop'),
            default('#pop'),
        ],
    }
