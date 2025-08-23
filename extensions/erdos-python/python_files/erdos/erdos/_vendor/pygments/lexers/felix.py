"""
    pygments.lexers.felix
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Felix language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, default, words, \
    combined
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['FelixLexer']


class FelixLexer(RegexLexer):
    """
    For Felix source code.
    """

    name = 'Felix'
    url = 'http://www.felix-lang.org'
    aliases = ['felix', 'flx']
    filenames = ['*.flx', '*.flxh']
    mimetypes = ['text/x-felix']
    version_added = '1.2'

    preproc = (
        'elif', 'else', 'endif', 'if', 'ifdef', 'ifndef',
    )

    keywords = (
        '_', '_deref', 'all', 'as',
        'assert', 'attempt', 'call', 'callback', 'case', 'caseno', 'cclass',
        'code', 'compound', 'ctypes', 'do', 'done', 'downto', 'elif', 'else',
        'endattempt', 'endcase', 'endif', 'endmatch', 'enum', 'except',
        'exceptions', 'expect', 'finally', 'for', 'forall', 'forget', 'fork',
        'functor', 'goto', 'ident', 'if', 'incomplete', 'inherit', 'instance',
        'interface', 'jump', 'lambda', 'loop', 'match', 'module', 'namespace',
        'new', 'noexpand', 'nonterm', 'obj', 'of', 'open', 'parse', 'raise',
        'regexp', 'reglex', 'regmatch', 'rename', 'return', 'the', 'then',
        'to', 'type', 'typecase', 'typedef', 'typematch', 'typeof', 'upto',
        'when', 'whilst', 'with', 'yield',
    )

    keyword_directives = (
        '_gc_pointer', '_gc_type', 'body', 'comment', 'const', 'export',
        'header', 'inline', 'lval', 'macro', 'noinline', 'noreturn',
        'package', 'private', 'pod', 'property', 'public', 'publish',
        'requires', 'todo', 'virtual', 'use',
    )

    keyword_declarations = (
        'def', 'let', 'ref', 'val', 'var',
    )

    keyword_types = (
        'unit', 'void', 'any', 'bool',
        'byte',  'offset',
        'address', 'caddress', 'cvaddress', 'vaddress',
        'tiny', 'short', 'int', 'long', 'vlong',
        'utiny', 'ushort', 'vshort', 'uint', 'ulong', 'uvlong',
        'int8', 'int16', 'int32', 'int64',
        'uint8', 'uint16', 'uint32', 'uint64',
        'float', 'double', 'ldouble',
        'complex', 'dcomplex', 'lcomplex',
        'imaginary', 'dimaginary', 'limaginary',
        'char', 'wchar', 'uchar',
        'charp', 'charcp', 'ucharp', 'ucharcp',
        'string', 'wstring', 'ustring',
        'cont',
        'array', 'varray', 'list',
        'lvalue', 'opt', 'slice',
    )

    keyword_constants = (
        'false', 'true',
    )

    operator_words = (
        'and', 'not', 'in', 'is', 'isin', 'or', 'xor',
    )

    name_builtins = (
        '_svc', 'while',
    )

    name_pseudo = (
        'root', 'self', 'this',
    )

    decimal_suffixes = '([tTsSiIlLvV]|ll|LL|([iIuU])(8|16|32|64))?'

    tokens = {
        'root': [
            include('whitespace'),

            # Keywords
            (words(('axiom', 'ctor', 'fun', 'gen', 'proc', 'reduce',
                    'union'), suffix=r'\b'),
             Keyword, 'funcname'),
            (words(('class', 'cclass', 'cstruct', 'obj', 'struct'), suffix=r'\b'),
             Keyword, 'classname'),
            (r'(instance|module|typeclass)\b', Keyword, 'modulename'),

            (words(keywords, suffix=r'\b'), Keyword),
            (words(keyword_directives, suffix=r'\b'), Name.Decorator),
            (words(keyword_declarations, suffix=r'\b'), Keyword.Declaration),
            (words(keyword_types, suffix=r'\b'), Keyword.Type),
            (words(keyword_constants, suffix=r'\b'), Keyword.Constant),

            # Operators
            include('operators'),

            # Float Literal
            # -- Hex Float
            (r'0[xX]([0-9a-fA-F_]*\.[0-9a-fA-F_]+|[0-9a-fA-F_]+)'
             r'[pP][+\-]?[0-9_]+[lLfFdD]?', Number.Float),
            # -- DecimalFloat
            (r'[0-9_]+(\.[0-9_]+[eE][+\-]?[0-9_]+|'
             r'\.[0-9_]*|[eE][+\-]?[0-9_]+)[lLfFdD]?', Number.Float),
            (r'\.(0|[1-9][0-9_]*)([eE][+\-]?[0-9_]+)?[lLfFdD]?',
             Number.Float),

            # IntegerLiteral
            # -- Binary
            (rf'0[Bb][01_]+{decimal_suffixes}', Number.Bin),
            # -- Octal
            (rf'0[0-7_]+{decimal_suffixes}', Number.Oct),
            # -- Hexadecimal
            (rf'0[xX][0-9a-fA-F_]+{decimal_suffixes}', Number.Hex),
            # -- Decimal
            (rf'(0|[1-9][0-9_]*){decimal_suffixes}', Number.Integer),

            # Strings
            ('([rR][cC]?|[cC][rR])"""', String, 'tdqs'),
            ("([rR][cC]?|[cC][rR])'''", String, 'tsqs'),
            ('([rR][cC]?|[cC][rR])"', String, 'dqs'),
            ("([rR][cC]?|[cC][rR])'", String, 'sqs'),
            ('[cCfFqQwWuU]?"""', String, combined('stringescape', 'tdqs')),
            ("[cCfFqQwWuU]?'''", String, combined('stringescape', 'tsqs')),
            ('[cCfFqQwWuU]?"', String, combined('stringescape', 'dqs')),
            ("[cCfFqQwWuU]?'", String, combined('stringescape', 'sqs')),

            # Punctuation
            (r'[\[\]{}:(),;?]', Punctuation),

            # Labels
            (r'[a-zA-Z_]\w*:>', Name.Label),

            # Identifiers
            (r'({})\b'.format('|'.join(name_builtins)), Name.Builtin),
            (r'({})\b'.format('|'.join(name_pseudo)), Name.Builtin.Pseudo),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'whitespace': [
            (r'\s+', Whitespace),

            include('comment'),

            # Preprocessor
            (r'(#)(\s*)(if)(\s+)(0)',
                bygroups(Comment.Preproc, Whitespace, Comment.Preproc,
                    Whitespace, Comment.Preproc), 'if0'),
            (r'#', Comment.Preproc, 'macro'),
        ],
        'operators': [
            (r'({})\b'.format('|'.join(operator_words)), Operator.Word),
            (r'!=|==|<<|>>|\|\||&&|[-~+/*%=<>&^|.$]', Operator),
        ],
        'comment': [
            (r'//(.*?)$', Comment.Single),
            (r'/[*]', Comment.Multiline, 'comment2'),
        ],
        'comment2': [
            (r'[^/*]', Comment.Multiline),
            (r'/[*]', Comment.Multiline, '#push'),
            (r'[*]/', Comment.Multiline, '#pop'),
            (r'[/*]', Comment.Multiline),
        ],
        'if0': [
            (r'^(\s*)(#if.*?(?<!\\))(\n)',
                bygroups(Whitespace, Comment, Whitespace), '#push'),
            (r'^(\s*)(#endif.*?(?<!\\))(\n)',
                bygroups(Whitespace, Comment, Whitespace), '#pop'),
            (r'(.*?)(\n)', bygroups(Comment, Whitespace)),
        ],
        'macro': [
            include('comment'),
            (r'(import|include)(\s+)(<[^>]*?>)',
             bygroups(Comment.Preproc, Whitespace, String), '#pop'),
            (r'(import|include)(\s+)("[^"]*?")',
             bygroups(Comment.Preproc, Whitespace, String), '#pop'),
            (r"(import|include)(\s+)('[^']*?')",
             bygroups(Comment.Preproc, Whitespace, String), '#pop'),
            (r'[^/\n]+', Comment.Preproc),
            # (r'/[*](.|\n)*?[*]/', Comment),
            # (r'//.*?\n', Comment, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Whitespace, '#pop'),
        ],
        'funcname': [
            include('whitespace'),
            (r'[a-zA-Z_]\w*', Name.Function, '#pop'),
            # anonymous functions
            (r'(?=\()', Text, '#pop'),
        ],
        'classname': [
            include('whitespace'),
            (r'[a-zA-Z_]\w*', Name.Class, '#pop'),
            # anonymous classes
            (r'(?=\{)', Text, '#pop'),
        ],
        'modulename': [
            include('whitespace'),
            (r'\[', Punctuation, ('modulename2', 'tvarlist')),
            default('modulename2'),
        ],
        'modulename2': [
            include('whitespace'),
            (r'([a-zA-Z_]\w*)', Name.Namespace, '#pop:2'),
        ],
        'tvarlist': [
            include('whitespace'),
            include('operators'),
            (r'\[', Punctuation, '#push'),
            (r'\]', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'(with|where)\b', Keyword),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'stringescape': [
            (r'\\([\\abfnrtv"\']|\n|N\{.*?\}|u[a-fA-F0-9]{4}|'
             r'U[a-fA-F0-9]{8}|x[a-fA-F0-9]{2}|[0-7]{1,3})', String.Escape)
        ],
        'strings': [
            (r'%(\([a-zA-Z0-9]+\))?[-#0 +]*([0-9]+|[*])?(\.([0-9]+|[*]))?'
             '[hlL]?[E-GXc-giorsux%]', String.Interpol),
            (r'[^\\\'"%\n]+', String),
            # quotes, percents and backslashes must be parsed one at a time
            (r'[\'"\\]', String),
            # unhandled string formatting sign
            (r'%', String)
            # newlines are an error (use "nl" state)
        ],
        'nl': [
            (r'\n', String)
        ],
        'dqs': [
            (r'"', String, '#pop'),
            # included here again for raw strings
            (r'\\\\|\\"|\\\n', String.Escape),
            include('strings')
        ],
        'sqs': [
            (r"'", String, '#pop'),
            # included here again for raw strings
            (r"\\\\|\\'|\\\n", String.Escape),
            include('strings')
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            include('strings'),
            include('nl')
        ],
        'tsqs': [
            (r"'''", String, '#pop'),
            include('strings'),
            include('nl')
        ],
    }
