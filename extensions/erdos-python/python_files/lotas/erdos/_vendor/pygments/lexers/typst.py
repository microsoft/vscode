"""
    pygments.lexers.typst
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for Typst language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words, bygroups, include
from erdos._vendor.pygments.token import Comment, Keyword, Name, String, Punctuation, \
    Whitespace, Generic, Operator, Number, Text
from erdos._vendor.pygments.util import get_choice_opt

__all__ = ['TypstLexer']


class TypstLexer(RegexLexer):
    """
    For Typst code.

    Additional options accepted:

    `start`
        Specifies the starting state of the lexer (one of 'markup', 'math',
        'code'). The default is 'markup'.
    """

    name = 'Typst'
    aliases = ['typst']
    filenames = ['*.typ']
    mimetypes = ['text/x-typst']
    url = 'https://typst.app'
    version_added = '2.18'

    MATH_SHORTHANDS = (
        '[|', '|]', '||', '*', ':=', '::=', '...', '\'', '-', '=:', '!=', '>>',
        '>=', '>>>', '<<', '<=', '<<<', '->', '|->', '=>', '|=>', '==>',
        '-->', '~~>', '~>', '>->', '->>', '<-', '<==', '<--', '<~~', '<~',
        '<-<','<<-','<->','<=>','<==>','<-->', '>', '<', '~', ':', '|'
    )

    tokens = {
        'root': [
            include('markup'),
        ],
        # common cases going from math/markup into code mode
        'into_code': [
            (words(('#let', '#set', '#show'), suffix=r'\b'), Keyword.Declaration, 'inline_code'),
            (words(('#import', '#include'), suffix=r'\b'), Keyword.Namespace, 'inline_code'),
            (words(('#if', '#for', '#while', '#export'), suffix=r'\b'), Keyword.Reserved, 'inline_code'),
            (r'#\{', Punctuation, 'code'),
            (r'#\(', Punctuation, 'code'),
            (r'(#[a-zA-Z_][a-zA-Z0-9_-]*)(\[)', bygroups(Name.Function, Punctuation), 'markup'),
            (r'(#[a-zA-Z_][a-zA-Z0-9_-]*)(\()', bygroups(Name.Function, Punctuation), 'code'),
            (words(('#true', '#false', '#none', '#auto'), suffix=r'\b'), Keyword.Constant),
            (r'#[a-zA-Z_][a-zA-Z0-9_]*', Name.Variable),
            (r'#0x[0-9a-fA-F]+', Number.Hex),
            (r'#0b[01]+', Number.Bin),
            (r'#0o[0-7]+', Number.Oct),
            (r'#[0-9]+[\.e][0-9]+', Number.Float),
            (r'#[0-9]+', Number.Integer),
        ],
        'markup': [
            include('comment'),
            (r'^\s*=+.*$', Generic.Heading),
            (r'[*][^*]*[*]', Generic.Strong),
            (r'_[^_]*_', Generic.Emph),
            (r'\$', Punctuation, 'math'),
            (r'`[^`]*`', String.Backtick),  # inline code
            (r'^(\s*)(-)(\s+)', bygroups(Whitespace, Punctuation, Whitespace)),  # unnumbered list
            (r'^(\s*)(\+)(\s+)', bygroups(Whitespace, Punctuation, Whitespace)),  # numbered list
            (r'^(\s*)([0-9]+\.)', bygroups(Whitespace, Punctuation)),  # numbered list variant
            (r'^(\s*)(/)(\s+)([^:]+)(:)', bygroups(Whitespace, Punctuation, Whitespace, Name.Variable, Punctuation)),  # definitions
            (r'<[a-zA-Z_][a-zA-Z0-9_-]*>', Name.Label),  # label
            (r'@[a-zA-Z_][a-zA-Z0-9_-]*', Name.Label),  # reference
            (r'\\#', Text), # escaped
            include('into_code'),
            (r'```(?:.|\n)*?```', String.Backtick),  # code block
            (r'https?://[0-9a-zA-Z~/%#&=\',;.+?]*', Generic.Emph),  # links
            (words(('---', '\\', '~', '--', '...'), suffix=r'\B'), Punctuation),  # special chars shorthand
            (r'\\\[', Punctuation),  # escaped
            (r'\\\]', Punctuation),  # escaped
            (r'\[', Punctuation, '#push'),
            (r'\]', Punctuation, '#pop'),
            (r'[ \t]+\n?|\n', Whitespace),
            (r'((?![*_$`<@\\#\] ]|https?://).)+', Text),
        ],
        'math': [
            include('comment'),
            (words(('\\_', '\\^', '\\&')), Text), # escapes
            (words(('_', '^', '&', ';')), Punctuation),
            (words(('+', '/', '=') + MATH_SHORTHANDS), Operator),
            (r'\\', Punctuation), # line break
            (r'\\\$', Punctuation),  # escaped
            (r'\$', Punctuation, '#pop'),  # end of math mode
            include('into_code'),
            (r'([a-zA-Z][a-zA-Z0-9-]*)(\s*)(\()', bygroups(Name.Function, Whitespace, Punctuation)),
            (r'([a-zA-Z][a-zA-Z0-9-]*)(:)', bygroups(Name.Variable, Punctuation)), # named arguments in math functions
            (r'([a-zA-Z][a-zA-Z0-9-]*)', Name.Variable), # both variables and symbols (_ isn't supported for variables)
            (r'[0-9]+(\.[0-9]+)?', Number),
            (r'\.{1,3}|\(|\)|,|\{|\}', Punctuation),
            (r'"[^"]*"', String.Double),
            (r'[ \t\n]+', Whitespace),
        ],
        'comment': [
            (r'//.*$', Comment.Single),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
        ],
        'code': [
            include('comment'),
            (r'\[', Punctuation, 'markup'),
            (r'\(|\{', Punctuation, 'code'),
            (r'\)|\}', Punctuation, '#pop'),
            (r'"[^"]*"', String.Double),
            (r',|\.{1,2}', Punctuation),
            (r'=', Operator),
            (words(('and', 'or', 'not'), suffix=r'\b'), Operator.Word),
            (r'=>|<=|==|!=|>|<|-=|\+=|\*=|/=|\+|-|\\|\*', Operator), # comparisons
            (r'([a-zA-Z_][a-zA-Z0-9_-]*)(:)', bygroups(Name.Variable, Punctuation)),
            (r'([a-zA-Z_][a-zA-Z0-9_-]*)(\()', bygroups(Name.Function, Punctuation), 'code'),
            (words(('as', 'break', 'export', 'continue', 'else', 'for', 'if',
                    'in', 'return', 'while'), suffix=r'\b'),
             Keyword.Reserved),
             (words(('import', 'include'), suffix=r'\b'), Keyword.Namespace),
            (words(('auto', 'none', 'true', 'false'), suffix=r'\b'), Keyword.Constant),
            (r'([0-9.]+)(mm|pt|cm|in|em|fr|%)', bygroups(Number, Keyword.Reserved)),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'0b[01]+', Number.Bin),
            (r'0o[0-7]+', Number.Oct),
            (r'[0-9]+[\.e][0-9]+', Number.Float),
            (r'[0-9]+', Number.Integer),
            (words(('let', 'set', 'show'), suffix=r'\b'), Keyword.Declaration),
            # FIXME: make this work
            ## (r'(import|include)( *)(")([^"])(")',
            ##  bygroups(Keyword.Reserved, Text, Punctuation, String.Double, Punctuation)),
            (r'([a-zA-Z_][a-zA-Z0-9_-]*)', Name.Variable),
            (r'[ \t\n]+', Whitespace),
            (r':', Punctuation), # from imports like "import a: b" or "show: text.with(..)"
        ],
        'inline_code': [
            (r';\b', Punctuation, '#pop'),
            (r'\n', Whitespace, '#pop'),
            include('code'),
        ],
    }

    def __init__(self, **options):
        self.start_state = get_choice_opt(
            options, 'start', ['markup', 'code', 'math'], 'markup', True)

        RegexLexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text):
        stack = ['root']
        if self.start_state != 'markup': # markup is equivalent to root
            stack.append(self.start_state)

        yield from RegexLexer.get_tokens_unprocessed(self, text, stack)
