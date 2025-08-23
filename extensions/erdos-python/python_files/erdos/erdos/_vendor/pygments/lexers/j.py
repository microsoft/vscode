"""
    pygments.lexers.j
    ~~~~~~~~~~~~~~~~~

    Lexer for the J programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words, include, bygroups
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Whitespace

__all__ = ['JLexer']


class JLexer(RegexLexer):
    """
    For J source code.
    """

    name = 'J'
    url = 'http://jsoftware.com/'
    aliases = ['j']
    filenames = ['*.ijs']
    mimetypes = ['text/x-j']
    version_added = '2.1'

    validName = r'\b[a-zA-Z]\w*'

    tokens = {
        'root': [
            # Shebang script
            (r'#!.*$', Comment.Preproc),

            # Comments
            (r'NB\..*', Comment.Single),
            (r'(\n+\s*)(Note)', bygroups(Whitespace, Comment.Multiline),
                'comment'),
            (r'(\s*)(Note.*)', bygroups(Whitespace, Comment.Single)),

            # Whitespace
            (r'\s+', Whitespace),

            # Strings
            (r"'", String, 'singlequote'),

            # Definitions
            (r'0\s+:\s*0', Name.Entity, 'nounDefinition'),
            (r'(noun)(\s+)(define)(\s*)$', bygroups(Name.Entity, Whitespace,
                Name.Entity, Whitespace), 'nounDefinition'),
            (r'([1-4]|13)\s+:\s*0\b',
                Name.Function, 'explicitDefinition'),
            (r'(adverb|conjunction|dyad|monad|verb)(\s+)(define)\b',
                bygroups(Name.Function, Whitespace, Name.Function),
                'explicitDefinition'),

            # Flow Control
            (words(('for_', 'goto_', 'label_'), suffix=validName+r'\.'), Name.Label),
            (words((
                'assert', 'break', 'case', 'catch', 'catchd',
                'catcht', 'continue', 'do', 'else', 'elseif',
                'end', 'fcase', 'for', 'if', 'return',
                'select', 'throw', 'try', 'while', 'whilst',
                ), suffix=r'\.'), Name.Label),

            # Variable Names
            (validName, Name.Variable),

            # Standard Library
            (words((
                'ARGV', 'CR', 'CRLF', 'DEL', 'Debug',
                'EAV', 'EMPTY', 'FF', 'JVERSION', 'LF',
                'LF2', 'Note', 'TAB', 'alpha17', 'alpha27',
                'apply', 'bind', 'boxopen', 'boxxopen', 'bx',
                'clear', 'cutLF', 'cutopen', 'datatype', 'def',
                'dfh', 'drop', 'each', 'echo', 'empty',
                'erase', 'every', 'evtloop', 'exit', 'expand',
                'fetch', 'file2url', 'fixdotdot', 'fliprgb', 'getargs',
                'getenv', 'hfd', 'inv', 'inverse', 'iospath',
                'isatty', 'isutf8', 'items', 'leaf', 'list',
                'nameclass', 'namelist', 'names', 'nc',
                'nl', 'on', 'pick', 'rows',
                'script', 'scriptd', 'sign', 'sminfo', 'smoutput',
                'sort', 'split', 'stderr', 'stdin', 'stdout',
                'table', 'take', 'timespacex', 'timex', 'tmoutput',
                'toCRLF', 'toHOST', 'toJ', 'tolower', 'toupper',
                'type', 'ucp', 'ucpcount', 'usleep', 'utf8',
                'uucp',
                )), Name.Function),

            # Copula
            (r'=[.:]', Operator),

            # Builtins
            (r'[-=+*#$%@!~`^&";:.,<>{}\[\]\\|/?]', Operator),

            # Short Keywords
            (r'[abCdDeEfHiIjLMoprtT]\.',  Keyword.Reserved),
            (r'[aDiLpqsStux]\:', Keyword.Reserved),
            (r'(_[0-9])\:', Keyword.Constant),

            # Parens
            (r'\(', Punctuation, 'parentheses'),

            # Numbers
            include('numbers'),
        ],

        'comment': [
            (r'[^)]', Comment.Multiline),
            (r'^\)', Comment.Multiline, '#pop'),
            (r'[)]', Comment.Multiline),
        ],

        'explicitDefinition': [
            (r'\b[nmuvxy]\b', Name.Decorator),
            include('root'),
            (r'[^)]', Name),
            (r'^\)', Name.Label, '#pop'),
            (r'[)]', Name),
        ],

        'numbers': [
            (r'\b_{1,2}\b', Number),
            (r'_?\d+(\.\d+)?(\s*[ejr]\s*)_?\d+(\.?=\d+)?', Number),
            (r'_?\d+\.(?=\d+)', Number.Float),
            (r'_?\d+x', Number.Integer.Long),
            (r'_?\d+', Number.Integer),
        ],

        'nounDefinition': [
            (r'[^)]+', String),
            (r'^\)', Name.Label, '#pop'),
            (r'[)]', String),
        ],

        'parentheses': [
            (r'\)', Punctuation, '#pop'),
            # include('nounDefinition'),
            include('explicitDefinition'),
            include('root'),
        ],

        'singlequote': [
            (r"[^']+", String),
            (r"''", String),
            (r"'", String, '#pop'),
        ],
    }
