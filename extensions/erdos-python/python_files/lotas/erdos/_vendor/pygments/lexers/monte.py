"""
    pygments.lexers.monte
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Monte programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, Operator, \
    Punctuation, String, Whitespace
from erdos._vendor.pygments.lexer import RegexLexer, include, words

__all__ = ['MonteLexer']


# `var` handled separately
# `interface` handled separately
_declarations = ['bind', 'def', 'fn', 'object']
_methods = ['method', 'to']
_keywords = [
    'as', 'break', 'catch', 'continue', 'else', 'escape', 'exit', 'exports',
    'extends', 'finally', 'for', 'guards', 'if', 'implements', 'import',
    'in', 'match', 'meta', 'pass', 'return', 'switch', 'try', 'via', 'when',
    'while',
]
_operators = [
    # Unary
    '~', '!',
    # Binary
    '+', '-', '*', '/', '%', '**', '&', '|', '^', '<<', '>>',
    # Binary augmented
    '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=',
    # Comparison
    '==', '!=', '<', '<=', '>', '>=', '<=>',
    # Patterns and assignment
    ':=', '?', '=~', '!~', '=>',
    # Calls and sends
    '.', '<-', '->',
]
_escape_pattern = (
    r'(?:\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|'
    r'\\["\'\\bftnr])')
# _char = _escape_chars + [('.', String.Char)]
_identifier = r'[_a-zA-Z]\w*'

_constants = [
    # Void constants
    'null',
    # Bool constants
    'false', 'true',
    # Double constants
    'Infinity', 'NaN',
    # Special objects
    'M', 'Ref', 'throw', 'traceln',
]

_guards = [
    'Any', 'Binding', 'Bool', 'Bytes', 'Char', 'DeepFrozen', 'Double',
    'Empty', 'Int', 'List', 'Map', 'Near', 'NullOk', 'Same', 'Selfless',
    'Set', 'Str', 'SubrangeGuard', 'Transparent', 'Void',
]

_safeScope = [
    '_accumulateList', '_accumulateMap', '_auditedBy', '_bind',
    '_booleanFlow', '_comparer', '_equalizer', '_iterForever', '_loop',
    '_makeBytes', '_makeDouble', '_makeFinalSlot', '_makeInt', '_makeList',
    '_makeMap', '_makeMessageDesc', '_makeOrderedSpace', '_makeParamDesc',
    '_makeProtocolDesc', '_makeSourceSpan', '_makeString', '_makeVarSlot',
    '_makeVerbFacet', '_mapExtract', '_matchSame', '_quasiMatcher',
    '_slotToBinding', '_splitList', '_suchThat', '_switchFailed',
    '_validateFor', 'b__quasiParser', 'eval', 'import', 'm__quasiParser',
    'makeBrandPair', 'makeLazySlot', 'safeScope', 'simple__quasiParser',
]


class MonteLexer(RegexLexer):
    """
    Lexer for the Monte programming language.
    """
    name = 'Monte'
    url = 'https://monte.readthedocs.io/'
    aliases = ['monte']
    filenames = ['*.mt']
    version_added = '2.2'

    tokens = {
        'root': [
            # Comments
            (r'#[^\n]*\n', Comment),

            # Docstrings
            # Apologies for the non-greedy matcher here.
            (r'/\*\*.*?\*/', String.Doc),

            # `var` declarations
            (r'\bvar\b', Keyword.Declaration, 'var'),

            # `interface` declarations
            (r'\binterface\b', Keyword.Declaration, 'interface'),

            # method declarations
            (words(_methods, prefix='\\b', suffix='\\b'),
             Keyword, 'method'),

            # All other declarations
            (words(_declarations, prefix='\\b', suffix='\\b'),
             Keyword.Declaration),

            # Keywords
            (words(_keywords, prefix='\\b', suffix='\\b'), Keyword),

            # Literals
            ('[+-]?0x[_0-9a-fA-F]+', Number.Hex),
            (r'[+-]?[_0-9]+\.[_0-9]*([eE][+-]?[_0-9]+)?', Number.Float),
            ('[+-]?[_0-9]+', Number.Integer),
            ("'", String.Double, 'char'),
            ('"', String.Double, 'string'),

            # Quasiliterals
            ('`', String.Backtick, 'ql'),

            # Operators
            (words(_operators), Operator),

            # Verb operators
            (_identifier + '=', Operator.Word),

            # Safe scope constants
            (words(_constants, prefix='\\b', suffix='\\b'),
             Keyword.Pseudo),

            # Safe scope guards
            (words(_guards, prefix='\\b', suffix='\\b'), Keyword.Type),

            # All other safe scope names
            (words(_safeScope, prefix='\\b', suffix='\\b'),
             Name.Builtin),

            # Identifiers
            (_identifier, Name),

            # Punctuation
            (r'\(|\)|\{|\}|\[|\]|:|,', Punctuation),

            # Whitespace
            (' +', Whitespace),

            # Definite lexer errors
            ('=', Error),
        ],
        'char': [
            # It is definitely an error to have a char of width == 0.
            ("'", Error, 'root'),
            (_escape_pattern, String.Escape, 'charEnd'),
            ('.', String.Char, 'charEnd'),
        ],
        'charEnd': [
            ("'", String.Char, '#pop:2'),
            # It is definitely an error to have a char of width > 1.
            ('.', Error),
        ],
        # The state of things coming into an interface.
        'interface': [
            (' +', Whitespace),
            (_identifier, Name.Class, '#pop'),
            include('root'),
        ],
        # The state of things coming into a method.
        'method': [
            (' +', Whitespace),
            (_identifier, Name.Function, '#pop'),
            include('root'),
        ],
        'string': [
            ('"', String.Double, 'root'),
            (_escape_pattern, String.Escape),
            (r'\n', String.Double),
            ('.', String.Double),
        ],
        'ql': [
            ('`', String.Backtick, 'root'),
            (r'\$' + _escape_pattern, String.Escape),
            (r'\$\$', String.Escape),
            (r'@@', String.Escape),
            (r'\$\{', String.Interpol, 'qlNest'),
            (r'@\{', String.Interpol, 'qlNest'),
            (r'\$' + _identifier, Name),
            ('@' + _identifier, Name),
            ('.', String.Backtick),
        ],
        'qlNest': [
            (r'\}', String.Interpol, '#pop'),
            include('root'),
        ],
        # The state of things immediately following `var`.
        'var': [
            (' +', Whitespace),
            (_identifier, Name.Variable, '#pop'),
            include('root'),
        ],
    }
