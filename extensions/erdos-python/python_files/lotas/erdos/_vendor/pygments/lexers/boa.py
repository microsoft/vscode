"""
    pygments.lexers.boa
    ~~~~~~~~~~~~~~~~~~~

    Lexers for the Boa language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import String, Comment, Keyword, Name, Number, Operator, \
    Punctuation, Whitespace

__all__ = ['BoaLexer']


class BoaLexer(RegexLexer):
    """
    Lexer for the Boa language.
    """
    name = 'Boa'
    aliases = ['boa']
    filenames = ['*.boa']
    url = 'https://boa.cs.iastate.edu/docs'
    version_added = '2.4'

    reserved = words(
        ('input', 'output', 'of', 'weight', 'before', 'after', 'stop',
         'ifall', 'foreach', 'exists', 'function', 'break', 'switch', 'case',
         'visitor', 'default', 'return', 'visit', 'while', 'if', 'else'),
        suffix=r'\b', prefix=r'\b')
    keywords = words(
        ('bottom', 'collection', 'maximum', 'mean', 'minimum', 'set', 'sum',
         'top', 'string', 'int', 'bool', 'float', 'time', 'false', 'true',
         'array', 'map', 'stack', 'enum', 'type'), suffix=r'\b', prefix=r'\b')
    classes = words(
        ('Project', 'ForgeKind', 'CodeRepository', 'Revision', 'RepositoryKind',
         'ChangedFile', 'FileKind', 'ASTRoot', 'Namespace', 'Declaration', 'Type',
         'Method', 'Variable', 'Statement', 'Expression', 'Modifier',
         'StatementKind', 'ExpressionKind', 'ModifierKind', 'Visibility',
         'TypeKind', 'Person', 'ChangeKind'),
        suffix=r'\b', prefix=r'\b')
    operators = ('->', ':=', ':', '=', '<<', '!', '++', '||',
                 '&&', '+', '-', '*', ">", "<")
    string_sep = ('`', '\"')
    built_in_functions = words(
        (
            # Array functions
            'new', 'sort',
            # Date & Time functions
            'yearof', 'dayofyear', 'hourof', 'minuteof', 'secondof', 'now',
            'addday', 'addmonth', 'addweek', 'addyear', 'dayofmonth', 'dayofweek',
            'dayofyear', 'formattime', 'trunctoday', 'trunctohour', 'trunctominute',
            'trunctomonth', 'trunctosecond', 'trunctoyear',
            # Map functions
            'clear', 'haskey', 'keys', 'lookup', 'remove', 'values',
            # Math functions
            'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
            'ceil', 'cos', 'cosh', 'exp', 'floor', 'highbit', 'isfinite', 'isinf',
            'isnan', 'isnormal', 'log', 'log10', 'max', 'min', 'nrand', 'pow',
            'rand', 'round', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc',
            # Other functions
            'def', 'hash', 'len',
            # Set functions
            'add', 'contains', 'remove',
            # String functions
            'format', 'lowercase', 'match', 'matchposns', 'matchstrs', 'regex',
            'split', 'splitall', 'splitn', 'strfind', 'strreplace', 'strrfind',
            'substring', 'trim', 'uppercase',
            # Type Conversion functions
            'bool', 'float', 'int', 'string', 'time',
            # Domain-Specific functions
            'getast', 'getsnapshot', 'hasfiletype', 'isfixingrevision', 'iskind',
            'isliteral',
        ),
        prefix=r'\b',
        suffix=r'\(')

    tokens = {
        'root': [
            (r'#.*?$', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline),
            (reserved, Keyword.Reserved),
            (built_in_functions, Name.Function),
            (keywords, Keyword.Type),
            (classes, Name.Classes),
            (words(operators), Operator),
            (r'[][(),;{}\\.]', Punctuation),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"`(\\\\|\\[^\\]|[^`\\])*`", String.Backtick),
            (words(string_sep), String.Delimiter),
            (r'[a-zA-Z_]+', Name.Variable),
            (r'[0-9]+', Number.Integer),
            (r'\s+', Whitespace),  # Whitespace
        ]
    }
