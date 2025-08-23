"""
    pygments.lexers.jslt
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the JSLT language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, combined, words
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Whitespace


__all__ = ['JSLTLexer']


_WORD_END = r'(?=[^0-9A-Z_a-z-])'


class JSLTLexer(RegexLexer):
    """
    For JSLT source.
    """
    name = 'JSLT'
    url = 'https://github.com/schibsted/jslt'
    filenames = ['*.jslt']
    aliases = ['jslt']
    mimetypes = ['text/x-jslt']
    version_added = '2.10'

    tokens = {
        'root': [
            (r'[\t\n\f\r ]+', Whitespace),
            (r'//.*(\n|\Z)', Comment.Single),
            (r'-?(0|[1-9][0-9]*)', Number.Integer),
            (r'-?(0|[1-9][0-9]*)(.[0-9]+a)?([Ee][+-]?[0-9]+)', Number.Float),
            (r'"([^"\\]|\\.)*"', String.Double),
            (r'[(),:\[\]{}]', Punctuation),
            (r'(!=|[<=>]=?)', Operator),
            (r'[*+/|-]', Operator),
            (r'\.', Operator),
            (words(('import',), suffix=_WORD_END), Keyword.Namespace, combined('import-path', 'whitespace')),
            (words(('as',), suffix=_WORD_END), Keyword.Namespace, combined('import-alias', 'whitespace')),
            (words(('let',), suffix=_WORD_END), Keyword.Declaration, combined('constant', 'whitespace')),
            (words(('def',), suffix=_WORD_END), Keyword.Declaration, combined('function', 'whitespace')),
            (words(('false', 'null', 'true'), suffix=_WORD_END), Keyword.Constant),
            (words(('else', 'for', 'if'), suffix=_WORD_END), Keyword),
            (words(('and', 'or'), suffix=_WORD_END), Operator.Word),
            (words((
                'all', 'any', 'array', 'boolean', 'capture', 'ceiling',
                'contains', 'ends-with', 'error', 'flatten', 'floor',
                'format-time', 'from-json', 'get-key', 'hash-int', 'index-of',
                'is-array', 'is-boolean', 'is-decimal', 'is-integer',
                'is-number', 'is-object', 'is-string', 'join', 'lowercase',
                'max', 'min', 'mod', 'not', 'now', 'number', 'parse-time',
                'parse-url', 'random', 'replace', 'round', 'sha256-hex', 'size',
                'split', 'starts-with', 'string', 'sum', 'test', 'to-json',
                'trim', 'uppercase', 'zip', 'zip-with-index', 'fallback'), suffix=_WORD_END),
             Name.Builtin),
            (r'[A-Z_a-z][0-9A-Z_a-z-]*:[A-Z_a-z][0-9A-Z_a-z-]*', Name.Function),
            (r'[A-Z_a-z][0-9A-Z_a-z-]*', Name),
            (r'\$[A-Z_a-z][0-9A-Z_a-z-]*', Name.Variable),
        ],
        'constant': [
            (r'[A-Z_a-z][0-9A-Z_a-z-]*', Name.Variable, 'root'),
        ],
        'function': [
            (r'[A-Z_a-z][0-9A-Z_a-z-]*', Name.Function, combined('function-parameter-list', 'whitespace')),
        ],
        'function-parameter-list': [
            (r'\(', Punctuation, combined('function-parameters', 'whitespace')),
        ],
        'function-parameters': [
            (r',', Punctuation),
            (r'\)', Punctuation, 'root'),
            (r'[A-Z_a-z][0-9A-Z_a-z-]*', Name.Variable),
        ],
        'import-path': [
            (r'"([^"]|\\.)*"', String.Symbol, 'root'),
        ],
        'import-alias': [
            (r'[A-Z_a-z][0-9A-Z_a-z-]*', Name.Namespace, 'root'),
        ],
        'string': [
            (r'"', String.Double, '#pop'),
            (r'\\.', String.Escape),
        ],
        'whitespace': [
            (r'[\t\n\f\r ]+', Whitespace),
            (r'//.*(\n|\Z)', Comment.Single),
        ]
    }
