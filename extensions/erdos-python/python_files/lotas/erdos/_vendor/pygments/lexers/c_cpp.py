"""
    pygments.lexers.c_cpp
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for C/C++ languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, \
    this, inherit, default, words
from lotas.erdos._vendor.pygments.util import get_bool_opt
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['CLexer', 'CppLexer']


class CFamilyLexer(RegexLexer):
    """
    For C family source code.  This is used as a base class to avoid repetitious
    definitions.
    """

    # The trailing ?, rather than *, avoids a geometric performance drop here.
    #: only one /* */ style comment
    _ws1 = r'\s*(?:/[*].*?[*]/\s*)?'

    # Hexadecimal part in an hexadecimal integer/floating-point literal.
    # This includes decimal separators matching.
    _hexpart = r'[0-9a-fA-F](\'?[0-9a-fA-F])*'
    # Decimal part in an decimal integer/floating-point literal.
    # This includes decimal separators matching.
    _decpart = r'\d(\'?\d)*'
    # Integer literal suffix (e.g. 'ull' or 'll').
    _intsuffix = r'(([uU][lL]{0,2})|[lL]{1,2}[uU]?)?'

    # Identifier regex with C and C++ Universal Character Name (UCN) support.
    _ident = r'(?!\d)(?:[\w$]|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8})+'
    _namespaced_ident = r'(?!\d)(?:[\w$]|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|::)+'

    # Single and multiline comment regexes
    # Beware not to use *? for the inner content! When these regexes
    # are embedded in larger regexes, that can cause the stuff*? to
    # match more than it would have if the regex had been used in
    # a standalone way ...
    _comment_single = r'//(?:.|(?<=\\)\n)*\n'
    _comment_multiline = r'/(?:\\\n)?[*](?:[^*]|[*](?!(?:\\\n)?/))*[*](?:\\\n)?/'

    # Regex to match optional comments
    _possible_comments = rf'\s*(?:(?:(?:{_comment_single})|(?:{_comment_multiline}))\s*)*'

    tokens = {
        'whitespace': [
            # preprocessor directives: without whitespace
            (r'^#if\s+0', Comment.Preproc, 'if0'),
            ('^#', Comment.Preproc, 'macro'),
            # or with whitespace
            ('^(' + _ws1 + r')(#if\s+0)',
             bygroups(using(this), Comment.Preproc), 'if0'),
            ('^(' + _ws1 + ')(#)',
             bygroups(using(this), Comment.Preproc), 'macro'),
            # Labels:
            # Line start and possible indentation.
            (r'(^[ \t]*)'
             # Not followed by keywords which can be mistaken as labels.
             r'(?!(?:public|private|protected|default)\b)'
             # Actual label, followed by a single colon.
             r'(' + _ident + r')(\s*)(:)(?!:)',
             bygroups(Whitespace, Name.Label, Whitespace, Punctuation)),
            (r'\n', Whitespace),
            (r'[^\S\n]+', Whitespace),
            (r'\\\n', Text),  # line continuation
            (_comment_single, Comment.Single),
            (_comment_multiline, Comment.Multiline),
            # Open until EOF, so no ending delimiter
            (r'/(\\\n)?[*][\w\W]*', Comment.Multiline),
        ],
        'statements': [
            include('keywords'),
            include('types'),
            (r'([LuU]|u8)?(")', bygroups(String.Affix, String), 'string'),
            (r"([LuU]|u8)?(')(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])(')",
             bygroups(String.Affix, String.Char, String.Char, String.Char)),

             # Hexadecimal floating-point literals (C11, C++17)
            (r'0[xX](' + _hexpart + r'\.' + _hexpart + r'|\.' + _hexpart +
             r'|' + _hexpart + r')[pP][+-]?' + _hexpart + r'[lL]?', Number.Float),

            (r'(-)?(' + _decpart + r'\.' + _decpart + r'|\.' + _decpart + r'|' +
             _decpart + r')[eE][+-]?' + _decpart + r'[fFlL]?', Number.Float),
            (r'(-)?((' + _decpart + r'\.(' + _decpart + r')?|\.' +
             _decpart + r')[fFlL]?)|(' + _decpart + r'[fFlL])', Number.Float),
            (r'(-)?0[xX]' + _hexpart + _intsuffix, Number.Hex),
            (r'(-)?0[bB][01](\'?[01])*' + _intsuffix, Number.Bin),
            (r'(-)?0(\'?[0-7])+' + _intsuffix, Number.Oct),
            (r'(-)?' + _decpart + _intsuffix, Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'[()\[\],.]', Punctuation),
            (r'(true|false|NULL)\b', Name.Builtin),
            (_ident, Name)
        ],
        'types': [
            (words(('int8', 'int16', 'int32', 'int64', 'wchar_t'), prefix=r'__',
                    suffix=r'\b'), Keyword.Reserved),
            (words(('bool', 'int', 'long', 'float', 'short', 'double', 'char',
                    'unsigned', 'signed', 'void', '_BitInt',
                    '__int128'), suffix=r'\b'), Keyword.Type)
        ],
        'keywords': [
            (r'(struct|union)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            (r'case\b', Keyword, 'case-value'),
            (words(('asm', 'auto', 'break', 'const', 'continue', 'default',
                    'do', 'else', 'enum', 'extern', 'for', 'goto', 'if',
                    'register', 'restricted', 'return', 'sizeof', 'struct',
                    'static', 'switch', 'typedef', 'volatile', 'while', 'union',
                    'thread_local', 'alignas', 'alignof', 'static_assert', '_Pragma'),
                   suffix=r'\b'), Keyword),
            (words(('inline', '_inline', '__inline', 'naked', 'restrict',
                    'thread'), suffix=r'\b'), Keyword.Reserved),
            # Vector intrinsics
            (r'(__m(128i|128d|128|64))\b', Keyword.Reserved),
            # Microsoft-isms
            (words((
                'asm', 'based', 'except', 'stdcall', 'cdecl',
                'fastcall', 'declspec', 'finally', 'try',
                'leave', 'w64', 'unaligned', 'raise', 'noop',
                'identifier', 'forceinline', 'assume'),
                prefix=r'__', suffix=r'\b'), Keyword.Reserved)
        ],
        'root': [
            include('whitespace'),
            include('keywords'),
            # functions
            (r'(' + _namespaced_ident + r'(?:[&*\s])+)'  # return arguments
             r'(' + _possible_comments + r')'
             r'(' + _namespaced_ident + r')'             # method name
             r'(' + _possible_comments + r')'
             r'(\([^;"\')]*?\))'                         # signature
             r'(' + _possible_comments + r')'
             r'([^;{/"\']*)(\{)',
             bygroups(using(this), using(this, state='whitespace'),
                      Name.Function, using(this, state='whitespace'),
                      using(this), using(this, state='whitespace'),
                      using(this), Punctuation),
             'function'),
            # function declarations
            (r'(' + _namespaced_ident + r'(?:[&*\s])+)'  # return arguments
             r'(' + _possible_comments + r')'
             r'(' + _namespaced_ident + r')'             # method name
             r'(' + _possible_comments + r')'
             r'(\([^;"\')]*?\))'                         # signature
             r'(' + _possible_comments + r')'
             r'([^;/"\']*)(;)',
             bygroups(using(this), using(this, state='whitespace'),
                      Name.Function, using(this, state='whitespace'),
                      using(this), using(this, state='whitespace'),
                      using(this), Punctuation)),
            include('types'),
            default('statement'),
        ],
        'statement': [
            include('whitespace'),
            include('statements'),
            (r'\}', Punctuation),
            (r'[{;]', Punctuation, '#pop'),
        ],
        'function': [
            include('whitespace'),
            include('statements'),
            (';', Punctuation),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|'
             r'u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),  # line continuation
            (r'\\', String),  # stray backslash
        ],
        'macro': [
            (r'('+_ws1+r')(include)('+_ws1+r')("[^"]+")([^\n]*)',
                bygroups(using(this), Comment.Preproc, using(this),
                         Comment.PreprocFile, Comment.Single)),
            (r'('+_ws1+r')(include)('+_ws1+r')(<[^>]+>)([^\n]*)',
                bygroups(using(this), Comment.Preproc, using(this),
                         Comment.PreprocFile, Comment.Single)),
            (r'[^/\n]+', Comment.Preproc),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (r'//.*?\n', Comment.Single, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Comment.Preproc, '#pop'),
        ],
        'if0': [
            (r'^\s*#if.*?(?<!\\)\n', Comment.Preproc, '#push'),
            (r'^\s*#el(?:se|if).*\n', Comment.Preproc, '#pop'),
            (r'^\s*#endif.*?(?<!\\)\n', Comment.Preproc, '#pop'),
            (r'.*?\n', Comment),
        ],
        'classname': [
            (_ident, Name.Class, '#pop'),
            # template specification
            (r'\s*(?=>)', Text, '#pop'),
            default('#pop')
        ],
        # Mark identifiers preceded by `case` keyword as constants.
        'case-value': [
            (r'(?<!:)(:)(?!:)', Punctuation, '#pop'),
            (_ident, Name.Constant),
            include('whitespace'),
            include('statements'),
        ]
    }

    stdlib_types = {
        'size_t', 'ssize_t', 'off_t', 'wchar_t', 'ptrdiff_t', 'sig_atomic_t', 'fpos_t',
        'clock_t', 'time_t', 'va_list', 'jmp_buf', 'FILE', 'DIR', 'div_t', 'ldiv_t',
        'mbstate_t', 'wctrans_t', 'wint_t', 'wctype_t'}
    c99_types = {
        'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t',
        'uint16_t', 'uint32_t', 'uint64_t', 'int_least8_t', 'int_least16_t',
        'int_least32_t', 'int_least64_t', 'uint_least8_t', 'uint_least16_t',
        'uint_least32_t', 'uint_least64_t', 'int_fast8_t', 'int_fast16_t', 'int_fast32_t',
        'int_fast64_t', 'uint_fast8_t', 'uint_fast16_t', 'uint_fast32_t', 'uint_fast64_t',
        'intptr_t', 'uintptr_t', 'intmax_t', 'uintmax_t'}
    linux_types = {
        'clockid_t', 'cpu_set_t', 'cpumask_t', 'dev_t', 'gid_t', 'id_t', 'ino_t', 'key_t',
        'mode_t', 'nfds_t', 'pid_t', 'rlim_t', 'sig_t', 'sighandler_t', 'siginfo_t',
        'sigset_t', 'sigval_t', 'socklen_t', 'timer_t', 'uid_t'}
    c11_atomic_types = {
        'atomic_bool', 'atomic_char', 'atomic_schar', 'atomic_uchar', 'atomic_short',
        'atomic_ushort', 'atomic_int', 'atomic_uint', 'atomic_long', 'atomic_ulong',
        'atomic_llong', 'atomic_ullong', 'atomic_char16_t', 'atomic_char32_t', 'atomic_wchar_t',
        'atomic_int_least8_t', 'atomic_uint_least8_t', 'atomic_int_least16_t',
        'atomic_uint_least16_t', 'atomic_int_least32_t', 'atomic_uint_least32_t',
        'atomic_int_least64_t', 'atomic_uint_least64_t', 'atomic_int_fast8_t',
        'atomic_uint_fast8_t', 'atomic_int_fast16_t', 'atomic_uint_fast16_t',
        'atomic_int_fast32_t', 'atomic_uint_fast32_t', 'atomic_int_fast64_t',
        'atomic_uint_fast64_t', 'atomic_intptr_t', 'atomic_uintptr_t', 'atomic_size_t',
        'atomic_ptrdiff_t', 'atomic_intmax_t', 'atomic_uintmax_t'}

    def __init__(self, **options):
        self.stdlibhighlighting = get_bool_opt(options, 'stdlibhighlighting', True)
        self.c99highlighting = get_bool_opt(options, 'c99highlighting', True)
        self.c11highlighting = get_bool_opt(options, 'c11highlighting', True)
        self.platformhighlighting = get_bool_opt(options, 'platformhighlighting', True)
        RegexLexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text, stack=('root',)):
        for index, token, value in \
                RegexLexer.get_tokens_unprocessed(self, text, stack):
            if token is Name:
                if self.stdlibhighlighting and value in self.stdlib_types:
                    token = Keyword.Type
                elif self.c99highlighting and value in self.c99_types:
                    token = Keyword.Type
                elif self.c11highlighting and value in self.c11_atomic_types:
                    token = Keyword.Type
                elif self.platformhighlighting and value in self.linux_types:
                    token = Keyword.Type
            yield index, token, value


class CLexer(CFamilyLexer):
    """
    For C source code with preprocessor directives.

    Additional options accepted:

    `stdlibhighlighting`
        Highlight common types found in the C/C++ standard library (e.g. `size_t`).
        (default: ``True``).

    `c99highlighting`
        Highlight common types found in the C99 standard library (e.g. `int8_t`).
        Actually, this includes all fixed-width integer types.
        (default: ``True``).

    `c11highlighting`
        Highlight atomic types found in the C11 standard library (e.g. `atomic_bool`).
        (default: ``True``).

    `platformhighlighting`
        Highlight common types found in the platform SDK headers (e.g. `clockid_t` on Linux).
        (default: ``True``).
    """
    name = 'C'
    aliases = ['c']
    filenames = ['*.c', '*.h', '*.idc', '*.x[bp]m']
    mimetypes = ['text/x-chdr', 'text/x-csrc', 'image/x-xbitmap', 'image/x-xpixmap']
    url = 'https://en.wikipedia.org/wiki/C_(programming_language)'
    version_added = ''
    priority = 0.1

    tokens = {
        'keywords': [
            (words((
                '_Alignas', '_Alignof', '_Noreturn', '_Generic', '_Thread_local',
                '_Static_assert', '_Imaginary', 'noreturn', 'imaginary', 'complex'),
                suffix=r'\b'), Keyword),
            inherit
        ],
        'types': [
            (words(('_Bool', '_Complex', '_Atomic'), suffix=r'\b'), Keyword.Type),
            inherit
        ]
    }

    def analyse_text(text):
        if re.search(r'^\s*#include [<"]', text, re.MULTILINE):
            return 0.1
        if re.search(r'^\s*#ifn?def ', text, re.MULTILINE):
            return 0.1


class CppLexer(CFamilyLexer):
    """
    For C++ source code with preprocessor directives.

    Additional options accepted:

    `stdlibhighlighting`
        Highlight common types found in the C/C++ standard library (e.g. `size_t`).
        (default: ``True``).

    `c99highlighting`
        Highlight common types found in the C99 standard library (e.g. `int8_t`).
        Actually, this includes all fixed-width integer types.
        (default: ``True``).

    `c11highlighting`
        Highlight atomic types found in the C11 standard library (e.g. `atomic_bool`).
        (default: ``True``).

    `platformhighlighting`
        Highlight common types found in the platform SDK headers (e.g. `clockid_t` on Linux).
        (default: ``True``).
    """
    name = 'C++'
    url = 'https://isocpp.org/'
    aliases = ['cpp', 'c++']
    filenames = ['*.cpp', '*.hpp', '*.c++', '*.h++',
                 '*.cc', '*.hh', '*.cxx', '*.hxx',
                 '*.C', '*.H', '*.cp', '*.CPP', '*.tpp']
    mimetypes = ['text/x-c++hdr', 'text/x-c++src']
    version_added = ''
    priority = 0.1

    tokens = {
        'statements': [
            # C++11 raw strings
            (r'((?:[LuU]|u8)?R)(")([^\\()\s]{,16})(\()((?:.|\n)*?)(\)\3)(")',
             bygroups(String.Affix, String, String.Delimiter, String.Delimiter,
                      String, String.Delimiter, String)),
            inherit,
        ],
        'root': [
            inherit,
            # C++ Microsoft-isms
            (words(('virtual_inheritance', 'uuidof', 'super', 'single_inheritance',
                    'multiple_inheritance', 'interface', 'event'),
                   prefix=r'__', suffix=r'\b'), Keyword.Reserved),
            # Offload C++ extensions, http://offload.codeplay.com/
            (r'__(offload|blockingoffload|outer)\b', Keyword.Pseudo),
        ],
        'enumname': [
            include('whitespace'),
            # 'enum class' and 'enum struct' C++11 support
            (words(('class', 'struct'), suffix=r'\b'), Keyword),
            (CFamilyLexer._ident, Name.Class, '#pop'),
            # template specification
            (r'\s*(?=>)', Text, '#pop'),
            default('#pop')
        ],
        'keywords': [
            (r'(class|concept|typename)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            (words((
                'catch', 'const_cast', 'delete', 'dynamic_cast', 'explicit',
                'export', 'friend', 'mutable', 'new', 'operator',
                'private', 'protected', 'public', 'reinterpret_cast', 'class',
                '__restrict', 'static_cast', 'template', 'this', 'throw', 'throws',
                'try', 'typeid', 'using', 'virtual', 'constexpr', 'nullptr', 'concept',
                'decltype', 'noexcept', 'override', 'final', 'constinit', 'consteval',
                'co_await', 'co_return', 'co_yield', 'requires', 'import', 'module',
                'typename', 'and', 'and_eq', 'bitand', 'bitor', 'compl', 'not',
                'not_eq', 'or', 'or_eq', 'xor', 'xor_eq'),
               suffix=r'\b'), Keyword),
            (r'namespace\b', Keyword, 'namespace'),
            (r'(enum)(\s+)', bygroups(Keyword, Whitespace), 'enumname'),
            inherit
        ],
        'types': [
            (r'char(16_t|32_t|8_t)\b', Keyword.Type),
            inherit
        ],
        'namespace': [
            (r'[;{]', Punctuation, ('#pop', 'root')),
            (r'inline\b', Keyword.Reserved),
            (CFamilyLexer._ident, Name.Namespace),
            include('statement')
        ]
    }

    def analyse_text(text):
        if re.search('#include <[a-z_]+>', text):
            return 0.2
        if re.search('using namespace ', text):
            return 0.4
