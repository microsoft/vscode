"""
    pygments.lexers.arturo
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Arturo language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, do_insertions, include, \
    this, using, words
from lotas.erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, Operator, \
    Punctuation, String, Text

from lotas.erdos._vendor.pygments.util import ClassNotFound, get_bool_opt

__all__ = ['ArturoLexer']


class ArturoLexer(RegexLexer):
    """
    For Arturo source code.

    See `Arturo's Github <https://github.com/arturo-lang/arturo>`_
    and `Arturo's Website <https://arturo-lang.io/>`_.
    """

    name = 'Arturo'
    aliases = ['arturo', 'art']
    filenames = ['*.art']
    url = 'https://arturo-lang.io/'
    version_added = '2.14'

    def __init__(self, **options):
        self.handle_annotateds = get_bool_opt(options, 'handle_annotateds',
                                              True)
        RegexLexer.__init__(self, **options)

    def handle_annotated_strings(self, match):
        """Adds syntax from another languages inside annotated strings

        match args:
            1:open_string,
            2:exclamation_mark,
            3:lang_name,
            4:space_or_newline,
            5:code,
            6:close_string
        """
        from lotas.erdos._vendor.pygments.lexers import get_lexer_by_name

        # Header's section
        yield match.start(1), String.Double,   match.group(1)
        yield match.start(2), String.Interpol, match.group(2)
        yield match.start(3), String.Interpol, match.group(3)
        yield match.start(4), Text.Whitespace, match.group(4)

        lexer = None
        if self.handle_annotateds:
            try:
                lexer = get_lexer_by_name(match.group(3).strip())
            except ClassNotFound:
                pass
        code = match.group(5)

        if lexer is None:
            yield match.group(5), String, code
        else:
            yield from do_insertions([], lexer.get_tokens_unprocessed(code))

        yield match.start(6), String.Double, match.group(6)

    tokens = {
        'root': [
            (r';.*?$', Comment.Single),
            (r'^((\s#!)|(#!)).*?$', Comment.Hashbang),

            # Constants
            (words(('false', 'true', 'maybe'),      # boolean
                   suffix=r'\b'), Name.Constant),
            (words(('this', 'init'),                # class related keywords
                   prefix=r'\b', suffix=r'\b\??:?'), Name.Builtin.Pseudo),
            (r'`.`', String.Char),                  # character
            (r'\\\w+\b\??:?', Name.Property),       # array index
            (r'#\w+', Name.Constant),               # color
            (r'\b[0-9]+\.[0-9]+', Number.Float),    # float
            (r'\b[0-9]+', Number.Integer),          # integer
            (r'\w+\b\??:', Name.Label),             # label
            # Note: Literals can be labeled too
            (r'\'(?:\w+\b\??:?)', Keyword.Declaration),  # literal
            (r'\:\w+', Keyword.Type),               # type
            # Note: Attributes can be labeled too
            (r'\.\w+\??:?', Name.Attribute),        # attributes

            # Switch structure
            (r'(\()(.*?)(\)\?)',
             bygroups(Punctuation, using(this), Punctuation)),

            # Single Line Strings
            (r'"',   String.Double, 'inside-simple-string'),
            (r'»',   String.Single, 'inside-smart-string'),
            (r'«««', String.Double, 'inside-safe-string'),
            (r'\{\/', String.Single, 'inside-regex-string'),

            # Multi Line Strings
            (r'\{\:', String.Double, 'inside-curly-verb-string'),
            (r'(\{)(\!)(\w+)(\s|\n)([\w\W]*?)(^\})', handle_annotated_strings),
            (r'\{', String.Single, 'inside-curly-string'),
            (r'\-{3,}', String.Single, 'inside-eof-string'),

            include('builtin-functions'),

            # Operators
            (r'[()[\],]', Punctuation),
            (words(('->', '==>', '|', '::', '@', '#',  # sugar syntax
                    '$', '&', '!', '!!', './')), Name.Decorator),
            (words(('<:', ':>', ':<', '>:', '<\\', '<>', '<', '>',
                    'ø', '∞',
                    '+', '-', '*', '~', '=', '^', '%', '/', '//',
                    '==>', '<=>', '<==>',
                    '=>>', '<<=>>', '<<==>>',
                    '-->', '<->', '<-->',
                    '=|', '|=', '-:', ':-',
                    '_', '.', '..', '\\')), Operator),

            (r'\b\w+', Name),
            (r'\s+', Text.Whitespace),
            (r'.+$', Error),
        ],

        'inside-interpol': [
            (r'\|', String.Interpol, '#pop'),
            (r'[^|]+', using(this)),
        ],
        'inside-template': [
            (r'\|\|\>', String.Interpol, '#pop'),
            (r'[^|]+', using(this)),
        ],
        'string-escape': [
            (words(('\\\\', '\\n', '\\t', '\\"')), String.Escape),
        ],

        'inside-simple-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'"', String.Double, '#pop'),   # Closing Quote
            (r'[^|"]+', String)              # String Content
        ],
        'inside-smart-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'\n', String.Single, '#pop'),  # Closing Quote
            (r'[^|\n]+', String)             # String Content
        ],
        'inside-safe-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'»»»', String.Double, '#pop'),    # Closing Quote
            (r'[^|»]+', String)                 # String Content
        ],
        'inside-regex-string': [
            (r'\\[sSwWdDbBZApPxucItnvfr0]+', String.Escape),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'\/\}', String.Single, '#pop'),  # Closing Quote
            (r'[^|\/]+', String.Regex),        # String Content
        ],
        'inside-curly-verb-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'\:\}', String.Double, '#pop'),  # Closing Quote
            (r'[^|<:]+', String),              # String Content
        ],
        'inside-curly-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'\}', String.Single, '#pop'),   # Closing Quote
            (r'[^|<}]+', String),             # String Content
        ],
        'inside-eof-string': [
            include('string-escape'),
            (r'\|', String.Interpol, 'inside-interpol'),        # Interpolation
            (r'\<\|\|', String.Interpol, 'inside-template'),    # Templates
            (r'\Z', String.Single, '#pop'),   # Closing Quote
            (r'[^|<]+', String),              # String Content
        ],

        'builtin-functions': [
            (words((
                'all', 'and', 'any', 'ascii', 'attr', 'attribute',
                'attributeLabel', 'binary', 'block' 'char', 'contains',
                'database', 'date', 'dictionary', 'empty', 'equal', 'even',
                'every', 'exists', 'false', 'floatin', 'function', 'greater',
                'greaterOrEqual', 'if', 'in', 'inline', 'integer', 'is',
                'key', 'label', 'leap', 'less', 'lessOrEqual', 'literal',
                'logical', 'lower', 'nand', 'negative', 'nor', 'not',
                'notEqual', 'null', 'numeric', 'odd', 'or', 'path',
                'pathLabel', 'positive', 'prefix', 'prime', 'set', 'some',
                'sorted', 'standalone', 'string', 'subset', 'suffix',
                'superset', 'ymbol', 'true', 'try', 'type', 'unless', 'upper',
                'when', 'whitespace', 'word', 'xnor', 'xor', 'zero',
            ), prefix=r'\b', suffix=r'\b\?'), Name.Builtin),
            (words((
                'abs', 'acos', 'acosh', 'acsec', 'acsech', 'actan', 'actanh',
                'add', 'after', 'alphabet', 'and', 'angle', 'append', 'arg',
                'args', 'arity', 'array', 'as', 'asec', 'asech', 'asin',
                'asinh', 'atan', 'atan2', 'atanh', 'attr', 'attrs', 'average',
                'before', 'benchmark', 'blend', 'break', 'builtins1',
                'builtins2', 'call', 'capitalize', 'case', 'ceil', 'chop',
                'chunk', 'clear', 'close', 'cluster', 'color', 'combine',
                'conj', 'continue', 'copy', 'cos', 'cosh', 'couple', 'csec',
                'csech', 'ctan', 'ctanh', 'cursor', 'darken', 'dec', 'decode',
                'decouple', 'define', 'delete', 'desaturate', 'deviation',
                'dictionary', 'difference', 'digest', 'digits', 'div', 'do',
                'download', 'drop', 'dup', 'e', 'else', 'empty', 'encode',
                'ensure', 'env', 'epsilon', 'escape', 'execute', 'exit', 'exp',
                'extend', 'extract', 'factors', 'false', 'fdiv', 'filter',
                'first', 'flatten', 'floor', 'fold', 'from', 'function',
                'gamma', 'gcd', 'get', 'goto', 'hash', 'help', 'hypot', 'if',
                'in', 'inc', 'indent', 'index', 'infinity', 'info', 'input',
                'insert', 'inspect', 'intersection', 'invert', 'join', 'keys',
                'kurtosis', 'last', 'let', 'levenshtein', 'lighten', 'list',
                'ln', 'log', 'loop', 'lower', 'mail', 'map', 'match', 'max',
                'maybe', 'median', 'min', 'mod', 'module', 'mul', 'nand',
                'neg', 'new', 'nor', 'normalize', 'not', 'now', 'null', 'open',
                'or', 'outdent', 'pad', 'panic', 'path', 'pause',
                'permissions', 'permutate', 'pi', 'pop', 'pow', 'powerset',
                'powmod', 'prefix', 'print', 'prints', 'process', 'product',
                'query', 'random', 'range', 'read', 'relative', 'remove',
                'rename', 'render', 'repeat', 'replace', 'request', 'return',
                'reverse', 'round', 'sample', 'saturate', 'script', 'sec',
                'sech', 'select', 'serve', 'set', 'shl', 'shr', 'shuffle',
                'sin', 'sinh', 'size', 'skewness', 'slice', 'sort', 'split',
                'sqrt', 'squeeze', 'stack', 'strip', 'sub', 'suffix', 'sum',
                'switch', 'symbols', 'symlink', 'sys', 'take', 'tan', 'tanh',
                'terminal', 'to', 'true', 'truncate', 'try', 'type', 'union',
                'unique', 'unless', 'until', 'unzip', 'upper', 'values', 'var',
                'variance', 'volume', 'webview', 'while', 'with', 'wordwrap',
                'write', 'xnor', 'xor', 'zip'
            ), prefix=r'\b', suffix=r'\b'), Name.Builtin)
        ],

    }
