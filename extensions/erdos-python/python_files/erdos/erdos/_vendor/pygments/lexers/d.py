"""
    pygments.lexers.d
    ~~~~~~~~~~~~~~~~~

    Lexers for D languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words, bygroups
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, String, Number, \
    Punctuation, Whitespace

__all__ = ['DLexer', 'CrocLexer', 'MiniDLexer']


class DLexer(RegexLexer):
    """
    For D source.
    """
    name = 'D'
    url = 'https://dlang.org/'
    filenames = ['*.d', '*.di']
    aliases = ['d']
    mimetypes = ['text/x-dsrc']
    version_added = '1.2'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            # (r'\\\n', Text), # line continuations
            # Comments
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'/\+', Comment.Multiline, 'nested_comment'),
            # Keywords
            (words((
                'abstract', 'alias', 'align', 'asm', 'assert', 'auto', 'body',
                'break', 'case', 'cast', 'catch', 'class', 'const', 'continue',
                'debug', 'default', 'delegate', 'delete', 'deprecated', 'do', 'else',
                'enum', 'export', 'extern', 'finally', 'final', 'foreach_reverse',
                'foreach', 'for', 'function', 'goto', 'if', 'immutable', 'import',
                'interface', 'invariant', 'inout', 'in', 'is', 'lazy', 'mixin',
                'module', 'new', 'nothrow', 'out', 'override', 'package', 'pragma',
                'private', 'protected', 'public', 'pure', 'ref', 'return', 'scope',
                'shared', 'static', 'struct', 'super', 'switch', 'synchronized',
                'template', 'this', 'throw', 'try', 'typeid', 'typeof',
                'union', 'unittest', 'version', 'volatile', 'while', 'with',
                '__gshared', '__traits', '__vector', '__parameters'),
                suffix=r'\b'),
             Keyword),
            (words((
                # Removed in 2.072
                'typedef', ),
                suffix=r'\b'),
             Keyword.Removed),
            (words((
                'bool', 'byte', 'cdouble', 'cent', 'cfloat', 'char', 'creal',
                'dchar', 'double', 'float', 'idouble', 'ifloat', 'int', 'ireal',
                'long', 'real', 'short', 'ubyte', 'ucent', 'uint', 'ulong',
                'ushort', 'void', 'wchar'), suffix=r'\b'),
             Keyword.Type),
            (r'(false|true|null)\b', Keyword.Constant),
            (words((
                '__FILE__', '__FILE_FULL_PATH__', '__MODULE__', '__LINE__', '__FUNCTION__',
                '__PRETTY_FUNCTION__', '__DATE__', '__EOF__', '__TIME__', '__TIMESTAMP__',
                '__VENDOR__', '__VERSION__'), suffix=r'\b'),
             Keyword.Pseudo),
            (r'macro\b', Keyword.Reserved),
            (r'(string|wstring|dstring|size_t|ptrdiff_t)\b', Name.Builtin),
            # FloatLiteral
            # -- HexFloat
            (r'0[xX]([0-9a-fA-F_]*\.[0-9a-fA-F_]+|[0-9a-fA-F_]+)'
             r'[pP][+\-]?[0-9_]+[fFL]?[i]?', Number.Float),
            # -- DecimalFloat
            (r'[0-9_]+(\.[0-9_]+[eE][+\-]?[0-9_]+|'
             r'\.[0-9_]*|[eE][+\-]?[0-9_]+)[fFL]?[i]?', Number.Float),
            (r'\.(0|[1-9][0-9_]*)([eE][+\-]?[0-9_]+)?[fFL]?[i]?', Number.Float),
            # IntegerLiteral
            # -- Binary
            (r'0[Bb][01_]+', Number.Bin),
            # -- Octal
            (r'0[0-7_]+', Number.Oct),
            # -- Hexadecimal
            (r'0[xX][0-9a-fA-F_]+', Number.Hex),
            # -- Decimal
            (r'(0|[1-9][0-9_]*)([LUu]|Lu|LU|uL|UL)?', Number.Integer),
            # CharacterLiteral
            (r"""'(\\['"?\\abfnrtv]|\\x[0-9a-fA-F]{2}|\\[0-7]{1,3}"""
             r"""|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|\\&\w+;|.)'""",
             String.Char),
            # StringLiteral
            # -- WysiwygString
            (r'r"[^"]*"[cwd]?', String),
            # -- AlternateWysiwygString
            (r'`[^`]*`[cwd]?', String),
            # -- DoubleQuotedString
            (r'"(\\\\|\\[^\\]|[^"\\])*"[cwd]?', String),
            # -- EscapeSequence
            (r"\\(['\"?\\abfnrtv]|x[0-9a-fA-F]{2}|[0-7]{1,3}"
             r"|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|&\w+;)",
             String),
            # -- HexString
            (r'x"[0-9a-fA-F_\s]*"[cwd]?', String),
            # -- DelimitedString
            (r'q"\[', String, 'delimited_bracket'),
            (r'q"\(', String, 'delimited_parenthesis'),
            (r'q"<', String, 'delimited_angle'),
            (r'q"\{', String, 'delimited_curly'),
            (r'q"([a-zA-Z_]\w*)\n.*?\n\1"', String),
            (r'q"(.).*?\1"', String),
            # -- TokenString
            (r'q\{', String, 'token_string'),
            # Attributes
            (r'@([a-zA-Z_]\w*)?', Name.Decorator),
            # Tokens
            (r'(~=|\^=|%=|\*=|==|!>=|!<=|!<>=|!<>|!<|!>|!=|>>>=|>>>|>>=|>>|>='
             r'|<>=|<>|<<=|<<|<=|\+\+|\+=|--|-=|\|\||\|=|&&|&=|\.\.\.|\.\.|/=)'
             r'|[/.&|\-+<>!()\[\]{}?,;:$=*%^~]', Punctuation),
            # Identifier
            (r'[a-zA-Z_]\w*', Name),
            # Line
            (r'(#line)(\s)(.*)(\n)', bygroups(Comment.Special, Whitespace,
                Comment.Special, Whitespace)),
        ],
        'nested_comment': [
            (r'[^+/]+', Comment.Multiline),
            (r'/\+', Comment.Multiline, '#push'),
            (r'\+/', Comment.Multiline, '#pop'),
            (r'[+/]', Comment.Multiline),
        ],
        'token_string': [
            (r'\{', Punctuation, 'token_string_nest'),
            (r'\}', String, '#pop'),
            include('root'),
        ],
        'token_string_nest': [
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
            include('root'),
        ],
        'delimited_bracket': [
            (r'[^\[\]]+', String),
            (r'\[', String, 'delimited_inside_bracket'),
            (r'\]"', String, '#pop'),
        ],
        'delimited_inside_bracket': [
            (r'[^\[\]]+', String),
            (r'\[', String, '#push'),
            (r'\]', String, '#pop'),
        ],
        'delimited_parenthesis': [
            (r'[^()]+', String),
            (r'\(', String, 'delimited_inside_parenthesis'),
            (r'\)"', String, '#pop'),
        ],
        'delimited_inside_parenthesis': [
            (r'[^()]+', String),
            (r'\(', String, '#push'),
            (r'\)', String, '#pop'),
        ],
        'delimited_angle': [
            (r'[^<>]+', String),
            (r'<', String, 'delimited_inside_angle'),
            (r'>"', String, '#pop'),
        ],
        'delimited_inside_angle': [
            (r'[^<>]+', String),
            (r'<', String, '#push'),
            (r'>', String, '#pop'),
        ],
        'delimited_curly': [
            (r'[^{}]+', String),
            (r'\{', String, 'delimited_inside_curly'),
            (r'\}"', String, '#pop'),
        ],
        'delimited_inside_curly': [
            (r'[^{}]+', String),
            (r'\{', String, '#push'),
            (r'\}', String, '#pop'),
        ],
    }


class CrocLexer(RegexLexer):
    """
    For Croc source.
    """
    name = 'Croc'
    url = 'http://jfbillingsley.com/croc'
    filenames = ['*.croc']
    aliases = ['croc']
    mimetypes = ['text/x-crocsrc']
    version_added = ''

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            # Comments
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'/\*', Comment.Multiline, 'nestedcomment'),
            # Keywords
            (words((
                'as', 'assert', 'break', 'case', 'catch', 'class', 'continue',
                'default', 'do', 'else', 'finally', 'for', 'foreach', 'function',
                'global', 'namespace', 'if', 'import', 'in', 'is', 'local',
                'module', 'return', 'scope', 'super', 'switch', 'this', 'throw',
                'try', 'vararg', 'while', 'with', 'yield'), suffix=r'\b'),
             Keyword),
            (r'(false|true|null)\b', Keyword.Constant),
            # FloatLiteral
            (r'([0-9][0-9_]*)(?=[.eE])(\.[0-9][0-9_]*)?([eE][+\-]?[0-9_]+)?',
             Number.Float),
            # IntegerLiteral
            # -- Binary
            (r'0[bB][01][01_]*', Number.Bin),
            # -- Hexadecimal
            (r'0[xX][0-9a-fA-F][0-9a-fA-F_]*', Number.Hex),
            # -- Decimal
            (r'([0-9][0-9_]*)(?![.eE])', Number.Integer),
            # CharacterLiteral
            (r"""'(\\['"\\nrt]|\\x[0-9a-fA-F]{2}|\\[0-9]{1,3}"""
             r"""|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|.)'""",
             String.Char),
            # StringLiteral
            # -- WysiwygString
            (r'@"(""|[^"])*"', String),
            (r'@`(``|[^`])*`', String),
            (r"@'(''|[^'])*'", String),
            # -- DoubleQuotedString
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # Tokens
            (r'(~=|\^=|%=|\*=|==|!=|>>>=|>>>|>>=|>>|>=|<=>|\?=|-\>'
             r'|<<=|<<|<=|\+\+|\+=|--|-=|\|\||\|=|&&|&=|\.\.|/=)'
             r'|[-/.&$@|\+<>!()\[\]{}?,;:=*%^~#\\]', Punctuation),
            # Identifier
            (r'[a-zA-Z_]\w*', Name),
        ],
        'nestedcomment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
    }


class MiniDLexer(CrocLexer):
    """
    For MiniD source. MiniD is now known as Croc.
    """
    name = 'MiniD'
    filenames = []  # don't lex .md as MiniD, reserve for Markdown
    aliases = ['minid']
    mimetypes = ['text/x-minidsrc']
    version_added = ''
