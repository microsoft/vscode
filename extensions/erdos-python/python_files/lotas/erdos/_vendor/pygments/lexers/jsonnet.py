"""
    pygments.lexers.jsonnet
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Jsonnet data templating language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import include, RegexLexer, words
from lotas.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text, Whitespace

__all__ = ['JsonnetLexer']

jsonnet_token = r'[^\W\d]\w*'
jsonnet_function_token = jsonnet_token + r'(?=\()'


def string_rules(quote_mark):
    return [
        (rf"[^{quote_mark}\\]", String),
        (r"\\.", String.Escape),
        (quote_mark, String, '#pop'),
    ]


def quoted_field_name(quote_mark):
    return [
        (rf'([^{quote_mark}\\]|\\.)*{quote_mark}',
         Name.Variable, 'field_separator')
    ]


class JsonnetLexer(RegexLexer):
    """Lexer for Jsonnet source code."""

    name = 'Jsonnet'
    aliases = ['jsonnet']
    filenames = ['*.jsonnet', '*.libsonnet']
    url = "https://jsonnet.org"
    version_added = ''
    tokens = {
        # Not used by itself
        '_comments': [
            (r'(//|#).*\n', Comment.Single),
            (r'/\*\*([^/]|/(?!\*))*\*/', String.Doc),
            (r'/\*([^/]|/(?!\*))*\*/', Comment),
        ],
        'root': [
            include('_comments'),
            (r"@'.*'", String),
            (r'@".*"', String),
            (r"'", String, 'singlestring'),
            (r'"', String, 'doublestring'),
            (r'\|\|\|(.|\n)*\|\|\|', String),
            # Jsonnet has no integers, only an IEEE754 64-bit float
            (r'[+-]?[0-9]+(.[0-9])?', Number.Float),
            # Omit : despite spec because it appears to be used as a field
            # separator
            (r'[!$~+\-&|^=<>*/%]', Operator),
            (r'\{', Punctuation, 'object'),
            (r'\[', Punctuation, 'array'),
            (r'local\b', Keyword, ('local_name')),
            (r'assert\b', Keyword, 'assert'),
            (words([
                'assert', 'else', 'error', 'false', 'for', 'if', 'import',
                'importstr', 'in', 'null', 'tailstrict', 'then', 'self',
                'super', 'true',
             ], suffix=r'\b'), Keyword),
            (r'\s+', Whitespace),
            (r'function(?=\()', Keyword, 'function_params'),
            (r'std\.' + jsonnet_function_token, Name.Builtin, 'function_args'),
            (jsonnet_function_token, Name.Function, 'function_args'),
            (jsonnet_token, Name.Variable),
            (r'[\.()]', Punctuation),
        ],
        'singlestring': string_rules("'"),
        'doublestring': string_rules('"'),
        'array': [
            (r',', Punctuation),
            (r'\]', Punctuation, '#pop'),
            include('root'),
        ],
        'local_name': [
            (jsonnet_function_token, Name.Function, 'function_params'),
            (jsonnet_token, Name.Variable),
            (r'\s+', Whitespace),
            ('(?==)', Whitespace, ('#pop', 'local_value')),
        ],
        'local_value': [
            (r'=', Operator),
            (r';', Punctuation, '#pop'),
            include('root'),
        ],
        'assert': [
            (r':', Punctuation),
            (r';', Punctuation, '#pop'),
            include('root'),
        ],
        'function_params': [
            (jsonnet_token, Name.Variable),
            (r'\(', Punctuation),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'\s+', Whitespace),
            (r'=', Operator, 'function_param_default'),
        ],
        'function_args': [
            (r'\(', Punctuation),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'\s+', Whitespace),
            include('root'),
        ],
        'object': [
            (r'\s+', Whitespace),
            (r'local\b', Keyword, 'object_local_name'),
            (r'assert\b', Keyword, 'object_assert'),
            (r'\[', Operator, 'field_name_expr'),
            (fr'(?={jsonnet_token})', Text, 'field_name'),
            (r'\}', Punctuation, '#pop'),
            (r'"', Name.Variable, 'double_field_name'),
            (r"'", Name.Variable, 'single_field_name'),
            include('_comments'),
        ],
        'field_name': [
            (jsonnet_function_token, Name.Function,
                ('field_separator', 'function_params')
             ),
            (jsonnet_token, Name.Variable, 'field_separator'),
        ],
        'double_field_name': quoted_field_name('"'),
        'single_field_name': quoted_field_name("'"),
        'field_name_expr': [
            (r'\]', Operator, 'field_separator'),
            include('root'),
        ],
        'function_param_default': [
            (r'(?=[,\)])', Whitespace, '#pop'),
            include('root'),
        ],
        'field_separator': [
            (r'\s+', Whitespace),
            (r'\+?::?:?', Punctuation, ('#pop', '#pop', 'field_value')),
            include('_comments'),
        ],
        'field_value': [
            (r',', Punctuation, '#pop'),
            (r'\}', Punctuation, '#pop:2'),
            include('root'),
        ],
        'object_assert': [
            (r':', Punctuation),
            (r',', Punctuation, '#pop'),
            include('root'),
        ],
        'object_local_name': [
            (jsonnet_token, Name.Variable, ('#pop', 'object_local_value')),
            (r'\s+', Whitespace),
        ],
        'object_local_value': [
            (r'=', Operator),
            (r',', Punctuation, '#pop'),
            (r'\}', Punctuation, '#pop:2'),
            include('root'),
        ],
    }
