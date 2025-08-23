"""
    pygments.lexers.dotnet
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for .net languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""
import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, DelegatingLexer, bygroups, include, \
    using, this, default, words
from erdos.erdos._vendor.pygments.token import Punctuation, Text, Comment, Operator, Keyword, \
    Name, String, Number, Literal, Other, Whitespace
from erdos.erdos._vendor.pygments.util import get_choice_opt
from erdos.erdos._vendor.pygments import unistring as uni

from erdos.erdos._vendor.pygments.lexers.html import XmlLexer

__all__ = ['CSharpLexer', 'NemerleLexer', 'BooLexer', 'VbNetLexer',
           'CSharpAspxLexer', 'VbNetAspxLexer', 'FSharpLexer', 'XppLexer']


class CSharpLexer(RegexLexer):
    """
    For C# source code.

    Additional options accepted:

    `unicodelevel`
      Determines which Unicode characters this lexer allows for identifiers.
      The possible values are:

      * ``none`` -- only the ASCII letters and numbers are allowed. This
        is the fastest selection.
      * ``basic`` -- all Unicode characters from the specification except
        category ``Lo`` are allowed.
      * ``full`` -- all Unicode characters as specified in the C# specs
        are allowed.  Note that this means a considerable slowdown since the
        ``Lo`` category has more than 40,000 characters in it!

      The default value is ``basic``.

      .. versionadded:: 0.8
    """

    name = 'C#'
    url = 'https://docs.microsoft.com/en-us/dotnet/csharp/'
    aliases = ['csharp', 'c#', 'cs']
    filenames = ['*.cs']
    mimetypes = ['text/x-csharp']  # inferred
    version_added = ''

    flags = re.MULTILINE | re.DOTALL

    # for the range of allowed unicode characters in identifiers, see
    # http://www.ecma-international.org/publications/files/ECMA-ST/Ecma-334.pdf

    levels = {
        'none': r'@?[_a-zA-Z]\w*',
        'basic': ('@?[_' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Nl') + ']' +
                  '[' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Nl', 'Nd', 'Pc',
                                    'Cf', 'Mn', 'Mc') + ']*'),
        'full': ('@?(?:_|[^' +
                 uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl') + '])' +
                 '[^' + uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl',
                                      'Nd', 'Pc', 'Cf', 'Mn', 'Mc') + ']*'),
    }

    tokens = {}
    token_variants = True

    for levelname, cs_ident in levels.items():
        tokens[levelname] = {
            'root': [
                include('numbers'),
                # method names
                (r'^([ \t]*)((?:' + cs_ident + r'(?:\[\])?\s+)+?)'  # return type
                 r'(' + cs_ident + ')'                            # method name
                 r'(\s*)(\()',                               # signature start
                 bygroups(Whitespace, using(this), Name.Function, Whitespace,
                          Punctuation)),
                (r'^(\s*)(\[.*?\])', bygroups(Whitespace, Name.Attribute)),
                (r'[^\S\n]+', Whitespace),
                (r'(\\)(\n)', bygroups(Text, Whitespace)),  # line continuation
                (r'//.*?\n', Comment.Single),
                (r'/[*].*?[*]/', Comment.Multiline),
                (r'\n', Whitespace),
                (words((
                    '>>>=', '>>=', '<<=', '<=', '>=', '+=', '-=', '*=', '/=',
                    '%=', '&=', '|=', '^=', '??=', '=>', '??', '?.', '!=', '==',
                    '&&', '||', '>>>', '>>', '<<', '++', '--', '+', '-', '*',
                    '/', '%', '&', '|', '^', '<', '>', '?', '!', '~', '=',
                )), Operator),
                (r'=~|!=|==|<<|>>|[-+/*%=<>&^|]', Operator),
                (r'[()\[\];:,.]', Punctuation),
                (r'[{}]', Punctuation),
                (r'@"(""|[^"])*"', String),
                (r'\$?"(\\\\|\\[^\\]|[^"\\\n])*["\n]', String),
                (r"'\\.'|'[^\\]'", String.Char),
                (r"[0-9]+(\.[0-9]*)?([eE][+-][0-9]+)?"
                 r"[flFLdD]?|0[xX][0-9a-fA-F]+[Ll]?", Number),
                (r'(#)([ \t]*)(if|endif|else|elif|define|undef|'
                 r'line|error|warning|region|endregion|pragma)\b(.*?)(\n)',
                 bygroups(Comment.Preproc, Whitespace, Comment.Preproc,
                          Comment.Preproc, Whitespace)),
                (r'\b(extern)(\s+)(alias)\b', bygroups(Keyword, Whitespace,
                 Keyword)),
                (words((
                    'abstract', 'as', 'async', 'await', 'base', 'break', 'by',
                    'case', 'catch', 'checked', 'const', 'continue', 'default',
                    'delegate', 'do', 'else', 'enum', 'event', 'explicit',
                    'extern', 'false', 'finally', 'fixed', 'for', 'foreach',
                    'goto', 'if', 'implicit', 'in', 'interface', 'internal',
                    'is', 'let', 'lock', 'new', 'null', 'on', 'operator',
                    'out', 'override', 'params', 'private', 'protected',
                    'public', 'readonly', 'ref', 'return', 'sealed', 'sizeof',
                    'stackalloc', 'static', 'switch', 'this', 'throw', 'true',
                    'try', 'typeof', 'unchecked', 'unsafe', 'virtual', 'void',
                    'while', 'get', 'set', 'new', 'partial', 'yield', 'add',
                    'remove', 'value', 'alias', 'ascending', 'descending',
                    'from', 'group', 'into', 'orderby', 'select', 'thenby',
                    'where', 'join', 'equals', 'record', 'allows',
                    'and', 'init', 'managed', 'nameof', 'nint', 'not',
                    'notnull', 'nuint', 'or', 'scoped', 'unmanaged', 'when',
                    'with'
                ), suffix=r'\b'), Keyword),
                # version 1: assumes that 'file' is the only contextual keyword
                # that is a class modifier
                (r'(file)(\s+)(record|class|abstract|enum|new|sealed|static)\b',
                   bygroups(Keyword, Whitespace, Keyword)),
                (r'(global)(::)', bygroups(Keyword, Punctuation)),
                (r'(bool|byte|char|decimal|double|dynamic|float|int|long|object|'
                 r'sbyte|short|string|uint|ulong|ushort|var)\b\??', Keyword.Type),
                (r'(class|struct)(\s+)', bygroups(Keyword, Whitespace), 'class'),
                (r'(namespace|using)(\s+)', bygroups(Keyword, Whitespace), 'namespace'),
                (cs_ident, Name),
            ],
            'numbers_int': [
                (r"0[xX][0-9a-fA-F]+(([uU][lL]?)|[lL][uU]?)?", Number.Hex),
                (r"0[bB][01]+(([uU][lL]?)|[lL][uU]?)?", Number.Bin),
                (r"[0-9]+(([uU][lL]?)|[lL][uU]?)?", Number.Integer),
            ],
            'numbers_float': [
                (r"([0-9]+\.[0-9]+([eE][+-]?[0-9]+)?[fFdDmM]?)|"
                 r"(\.[0-9]+([eE][+-]?[0-9]+)?[fFdDmM]?)|"
                 r"([0-9]+([eE][+-]?[0-9]+)[fFdDmM]?)|"
                 r"([0-9]+[fFdDmM])", Number.Float),
            ],
            'numbers': [
                include('numbers_float'),
                include('numbers_int'),
            ],
            'class': [
                (cs_ident, Name.Class, '#pop'),
                default('#pop'),
            ],
            'namespace': [
                (r'(?=\()', Text, '#pop'),  # using (resource)
                ('(' + cs_ident + r'|\.)+', Name.Namespace, '#pop'),
            ]
        }

    def __init__(self, **options):
        level = get_choice_opt(options, 'unicodelevel', list(self.tokens), 'basic')
        if level not in self._all_tokens:
            # compile the regexes now
            self._tokens = self.__class__.process_tokendef(level)
        else:
            self._tokens = self._all_tokens[level]

        RegexLexer.__init__(self, **options)


class NemerleLexer(RegexLexer):
    """
    For Nemerle source code.

    Additional options accepted:

    `unicodelevel`
      Determines which Unicode characters this lexer allows for identifiers.
      The possible values are:

      * ``none`` -- only the ASCII letters and numbers are allowed. This
        is the fastest selection.
      * ``basic`` -- all Unicode characters from the specification except
        category ``Lo`` are allowed.
      * ``full`` -- all Unicode characters as specified in the C# specs
        are allowed.  Note that this means a considerable slowdown since the
        ``Lo`` category has more than 40,000 characters in it!

      The default value is ``basic``.
    """

    name = 'Nemerle'
    url = 'http://nemerle.org'
    aliases = ['nemerle']
    filenames = ['*.n']
    mimetypes = ['text/x-nemerle']  # inferred
    version_added = '1.5'

    flags = re.MULTILINE | re.DOTALL

    # for the range of allowed unicode characters in identifiers, see
    # http://www.ecma-international.org/publications/files/ECMA-ST/Ecma-334.pdf

    levels = {
        'none': r'@?[_a-zA-Z]\w*',
        'basic': ('@?[_' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Nl') + ']' +
                  '[' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Nl', 'Nd', 'Pc',
                                    'Cf', 'Mn', 'Mc') + ']*'),
        'full': ('@?(?:_|[^' +
                 uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl') + '])' +
                 '[^' + uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl',
                                      'Nd', 'Pc', 'Cf', 'Mn', 'Mc') + ']*'),
    }

    tokens = {}
    token_variants = True

    for levelname, cs_ident in levels.items():
        tokens[levelname] = {
            'root': [
                # method names
                (r'^([ \t]*)((?:' + cs_ident + r'(?:\[\])?\s+)+?)'  # return type
                 r'(' + cs_ident + ')'                            # method name
                 r'(\s*)(\()',                               # signature start
                 bygroups(Whitespace, using(this), Name.Function, Whitespace, \
                          Punctuation)),
                (r'^(\s*)(\[.*?\])', bygroups(Whitespace, Name.Attribute)),
                (r'[^\S\n]+', Whitespace),
                (r'(\\)(\n)', bygroups(Text, Whitespace)),  # line continuation
                (r'//.*?\n', Comment.Single),
                (r'/[*].*?[*]/', Comment.Multiline),
                (r'\n', Whitespace),
                (r'(\$)(\s*)(")', bygroups(String, Whitespace, String),
                    'splice-string'),
                (r'(\$)(\s*)(<#)', bygroups(String, Whitespace, String),
                    'splice-string2'),
                (r'<#', String, 'recursive-string'),

                (r'(<\[)(\s*)(' + cs_ident + ':)?',
                 bygroups(Keyword, Whitespace, Keyword)),
                (r'\]\>', Keyword),

                # quasiquotation only
                (r'\$' + cs_ident, Name),
                (r'(\$)(\()', bygroups(Name, Punctuation),
                 'splice-string-content'),

                (r'[~!%^&*()+=|\[\]:;,.<>/?-]', Punctuation),
                (r'[{}]', Punctuation),
                (r'@"(""|[^"])*"', String),
                (r'"(\\\\|\\[^\\]|[^"\\\n])*["\n]', String),
                (r"'\\.'|'[^\\]'", String.Char),
                (r"0[xX][0-9a-fA-F]+[Ll]?", Number),
                (r"[0-9](\.[0-9]*)?([eE][+-][0-9]+)?[flFLdD]?", Number),
                (r'(#)([ \t]*)(if|endif|else|elif|define|undef|'
                 r'line|error|warning|region|endregion|pragma)\b',
                 bygroups(Comment.Preproc, Whitespace, Comment.Preproc), 'preproc'),
                (r'\b(extern)(\s+)(alias)\b', bygroups(Keyword, Whitespace, Keyword)),
                (r'(abstract|and|as|base|catch|def|delegate|'
                 r'enum|event|extern|false|finally|'
                 r'fun|implements|interface|internal|'
                 r'is|macro|match|matches|module|mutable|new|'
                 r'null|out|override|params|partial|private|'
                 r'protected|public|ref|sealed|static|'
                 r'syntax|this|throw|true|try|type|typeof|'
                 r'virtual|volatile|when|where|with|'
                 r'assert|assert2|async|break|checked|continue|do|else|'
                 r'ensures|for|foreach|if|late|lock|new|nolate|'
                 r'otherwise|regexp|repeat|requires|return|surroundwith|'
                 r'unchecked|unless|using|while|yield)\b', Keyword),
                (r'(global)(::)', bygroups(Keyword, Punctuation)),
                (r'(bool|byte|char|decimal|double|float|int|long|object|sbyte|'
                 r'short|string|uint|ulong|ushort|void|array|list)\b\??',
                 Keyword.Type),
                (r'(:>?)(\s*)(' + cs_ident + r'\??)',
                 bygroups(Punctuation, Whitespace, Keyword.Type)),
                (r'(class|struct|variant|module)(\s+)',
                 bygroups(Keyword, Whitespace), 'class'),
                (r'(namespace|using)(\s+)', bygroups(Keyword, Whitespace),
                 'namespace'),
                (cs_ident, Name),
            ],
            'class': [
                (cs_ident, Name.Class, '#pop')
            ],
            'preproc': [
                (r'\w+', Comment.Preproc),
                (r'[ \t]+', Whitespace),
                (r'\n', Whitespace, '#pop')
            ],
            'namespace': [
                (r'(?=\()', Text, '#pop'),  # using (resource)
                ('(' + cs_ident + r'|\.)+', Name.Namespace, '#pop')
            ],
            'splice-string': [
                (r'[^"$]',  String),
                (r'\$' + cs_ident, Name),
                (r'(\$)(\()', bygroups(Name, Punctuation),
                 'splice-string-content'),
                (r'\\"',  String),
                (r'"',  String, '#pop')
            ],
            'splice-string2': [
                (r'[^#<>$]',  String),
                (r'\$' + cs_ident, Name),
                (r'(\$)(\()', bygroups(Name, Punctuation),
                 'splice-string-content'),
                (r'<#',  String, '#push'),
                (r'#>',  String, '#pop')
            ],
            'recursive-string': [
                (r'[^#<>]',  String),
                (r'<#',  String, '#push'),
                (r'#>',  String, '#pop')
            ],
            'splice-string-content': [
                (r'if|match', Keyword),
                (r'[~!%^&*+=|\[\]:;,.<>/?-\\"$ ]', Punctuation),
                (cs_ident, Name),
                (r'\d+', Number),
                (r'\(', Punctuation, '#push'),
                (r'\)', Punctuation, '#pop')
            ]
        }

    def __init__(self, **options):
        level = get_choice_opt(options, 'unicodelevel', list(self.tokens),
                               'basic')
        if level not in self._all_tokens:
            # compile the regexes now
            self._tokens = self.__class__.process_tokendef(level)
        else:
            self._tokens = self._all_tokens[level]

        RegexLexer.__init__(self, **options)

    def analyse_text(text):
        """Nemerle is quite similar to Python, but @if is relatively uncommon
        elsewhere."""
        result = 0

        if '@if' in text:
            result += 0.1

        return result


class BooLexer(RegexLexer):
    """
    For Boo source code.
    """

    name = 'Boo'
    url = 'https://github.com/boo-lang/boo'
    aliases = ['boo']
    filenames = ['*.boo']
    mimetypes = ['text/x-boo']
    version_added = ''

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(#|//).*$', Comment.Single),
            (r'/[*]', Comment.Multiline, 'comment'),
            (r'[]{}:(),.;[]', Punctuation),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),
            (r'\\', Text),
            (r'(in|is|and|or|not)\b', Operator.Word),
            (r'/(\\\\|\\[^\\]|[^/\\\s])/', String.Regex),
            (r'@/(\\\\|\\[^\\]|[^/\\])*/', String.Regex),
            (r'=~|!=|==|<<|>>|[-+/*%=<>&^|]', Operator),
            (r'(as|abstract|callable|constructor|destructor|do|import|'
             r'enum|event|final|get|interface|internal|of|override|'
             r'partial|private|protected|public|return|set|static|'
             r'struct|transient|virtual|yield|super|and|break|cast|'
             r'continue|elif|else|ensure|except|for|given|goto|if|in|'
             r'is|isa|not|or|otherwise|pass|raise|ref|try|unless|when|'
             r'while|from|as)\b', Keyword),
            (r'def(?=\s+\(.*?\))', Keyword),
            (r'(def)(\s+)', bygroups(Keyword, Whitespace), 'funcname'),
            (r'(class)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            (r'(namespace)(\s+)', bygroups(Keyword, Whitespace), 'namespace'),
            (r'(?<!\.)(true|false|null|self|__eval__|__switch__|array|'
             r'assert|checked|enumerate|filter|getter|len|lock|map|'
             r'matrix|max|min|normalArrayIndexing|print|property|range|'
             r'rawArrayIndexing|required|typeof|unchecked|using|'
             r'yieldAll|zip)\b', Name.Builtin),
            (r'"""(\\\\|\\"|.*?)"""', String.Double),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'[a-zA-Z_]\w*', Name),
            (r'(\d+\.\d*|\d*\.\d+)([fF][+-]?[0-9]+)?', Number.Float),
            (r'[0-9][0-9.]*(ms?|d|h|s)', Number),
            (r'0\d+', Number.Oct),
            (r'0x[a-fA-F0-9]+', Number.Hex),
            (r'\d+L', Number.Integer.Long),
            (r'\d+', Number.Integer),
        ],
        'comment': [
            ('/[*]', Comment.Multiline, '#push'),
            ('[*]/', Comment.Multiline, '#pop'),
            ('[^/*]', Comment.Multiline),
            ('[*/]', Comment.Multiline)
        ],
        'funcname': [
            (r'[a-zA-Z_]\w*', Name.Function, '#pop')
        ],
        'classname': [
            (r'[a-zA-Z_]\w*', Name.Class, '#pop')
        ],
        'namespace': [
            (r'[a-zA-Z_][\w.]*', Name.Namespace, '#pop')
        ]
    }


class VbNetLexer(RegexLexer):
    """
    For Visual Basic.NET source code.
    Also LibreOffice Basic, OpenOffice Basic, and StarOffice Basic.
    """

    name = 'VB.net'
    url = 'https://docs.microsoft.com/en-us/dotnet/visual-basic/'
    aliases = ['vb.net', 'vbnet', 'lobas', 'oobas', 'sobas', 'visual-basic', 'visualbasic']
    filenames = ['*.vb', '*.bas']
    mimetypes = ['text/x-vbnet', 'text/x-vba']  # (?)
    version_added = ''

    uni_name = '[_' + uni.combine('Ll', 'Lt', 'Lm', 'Nl') + ']' + \
               '[' + uni.combine('Ll', 'Lt', 'Lm', 'Nl', 'Nd', 'Pc',
                                 'Cf', 'Mn', 'Mc') + ']*'

    flags = re.MULTILINE | re.IGNORECASE
    tokens = {
        'root': [
            (r'^\s*<.*?>', Name.Attribute),
            (r'\s+', Whitespace),
            (r'\n', Whitespace),
            (r'(rem\b.*?)(\n)', bygroups(Comment, Whitespace)),
            (r"('.*?)(\n)", bygroups(Comment, Whitespace)),
            (r'#If\s.*?\sThen|#ElseIf\s.*?\sThen|#Else|#End\s+If|#Const|'
             r'#ExternalSource.*?\n|#End\s+ExternalSource|'
             r'#Region.*?\n|#End\s+Region|#ExternalChecksum',
             Comment.Preproc),
            (r'[(){}!#,.:]', Punctuation),
            (r'(Option)(\s+)(Strict|Explicit|Compare)(\s+)'
             r'(On|Off|Binary|Text)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration,
                      Whitespace, Keyword.Declaration)),
            (words((
                'AddHandler', 'Alias', 'ByRef', 'ByVal', 'Call', 'Case',
                'Catch', 'CBool', 'CByte', 'CChar', 'CDate', 'CDec', 'CDbl',
                'CInt', 'CLng', 'CObj', 'Continue', 'CSByte', 'CShort', 'CSng',
                'CStr', 'CType', 'CUInt', 'CULng', 'CUShort', 'Declare',
                'Default', 'Delegate', 'DirectCast', 'Do', 'Each', 'Else',
                'ElseIf', 'EndIf', 'Erase', 'Error', 'Event', 'Exit', 'False',
                'Finally', 'For', 'Friend', 'Get', 'Global', 'GoSub', 'GoTo',
                'Handles', 'If', 'Implements', 'Inherits', 'Interface', 'Let',
                'Lib', 'Loop', 'Me', 'MustInherit', 'MustOverride', 'MyBase',
                'MyClass', 'Narrowing', 'New', 'Next', 'Not', 'Nothing',
                'NotInheritable', 'NotOverridable', 'Of', 'On', 'Operator',
                'Option', 'Optional', 'Overloads', 'Overridable', 'Overrides',
                'ParamArray', 'Partial', 'Private', 'Protected', 'Public',
                'RaiseEvent', 'ReadOnly', 'ReDim', 'RemoveHandler', 'Resume',
                'Return', 'Select', 'Set', 'Shadows', 'Shared', 'Single',
                'Static', 'Step', 'Stop', 'SyncLock', 'Then', 'Throw', 'To',
                'True', 'Try', 'TryCast', 'Wend', 'Using', 'When', 'While',
                'Widening', 'With', 'WithEvents', 'WriteOnly'),
                   prefix=r'(?<!\.)', suffix=r'\b'), Keyword),
            (r'(?<!\.)End\b', Keyword, 'end'),
            (r'(?<!\.)(Dim|Const)\b', Keyword, 'dim'),
            (r'(?<!\.)(Function|Sub|Property)(\s+)',
             bygroups(Keyword, Whitespace), 'funcname'),
            (r'(?<!\.)(Class|Structure|Enum)(\s+)',
             bygroups(Keyword, Whitespace), 'classname'),
            (r'(?<!\.)(Module|Namespace|Imports)(\s+)',
             bygroups(Keyword, Whitespace), 'namespace'),
            (r'(?<!\.)(Boolean|Byte|Char|Date|Decimal|Double|Integer|Long|'
             r'Object|SByte|Short|Single|String|Variant|UInteger|ULong|'
             r'UShort)\b', Keyword.Type),
            (r'(?<!\.)(AddressOf|And|AndAlso|As|GetType|In|Is|IsNot|Like|Mod|'
             r'Or|OrElse|TypeOf|Xor)\b', Operator.Word),
            (r'&=|[*]=|/=|\\=|\^=|\+=|-=|<<=|>>=|<<|>>|:=|'
             r'<=|>=|<>|[-&*/\\^+=<>\[\]]',
             Operator),
            ('"', String, 'string'),
            (r'(_)(\n)', bygroups(Text, Whitespace)),  # Line continuation  (must be before Name)
            (uni_name + '[%&@!#$]?', Name),
            ('#.*?#', Literal.Date),
            (r'(\d+\.\d*|\d*\.\d+)(F[+-]?[0-9]+)?', Number.Float),
            (r'\d+([SILDFR]|US|UI|UL)?', Number.Integer),
            (r'&H[0-9a-f]+([SILDFR]|US|UI|UL)?', Number.Integer),
            (r'&O[0-7]+([SILDFR]|US|UI|UL)?', Number.Integer),
        ],
        'string': [
            (r'""', String),
            (r'"C?', String, '#pop'),
            (r'[^"]+', String),
        ],
        'dim': [
            (uni_name, Name.Variable, '#pop'),
            default('#pop'),  # any other syntax
        ],
        'funcname': [
            (uni_name, Name.Function, '#pop'),
        ],
        'classname': [
            (uni_name, Name.Class, '#pop'),
        ],
        'namespace': [
            (uni_name, Name.Namespace),
            (r'\.', Name.Namespace),
            default('#pop'),
        ],
        'end': [
            (r'\s+', Whitespace),
            (r'(Function|Sub|Property|Class|Structure|Enum|Module|Namespace)\b',
             Keyword, '#pop'),
            default('#pop'),
        ]
    }

    def analyse_text(text):
        if re.search(r'^\s*(#If|Module|Namespace)', text, re.MULTILINE):
            return 0.5


class GenericAspxLexer(RegexLexer):
    """
    Lexer for ASP.NET pages.
    """

    name = 'aspx-gen'
    filenames = []
    mimetypes = []
    url = 'https://dotnet.microsoft.com/en-us/apps/aspnet'

    flags = re.DOTALL

    tokens = {
        'root': [
            (r'(<%[@=#]?)(.*?)(%>)', bygroups(Name.Tag, Other, Name.Tag)),
            (r'(<script.*?>)(.*?)(</script>)', bygroups(using(XmlLexer),
                                                        Other,
                                                        using(XmlLexer))),
            (r'(.+?)(?=<)', using(XmlLexer)),
            (r'.+', using(XmlLexer)),
        ],
    }


# TODO support multiple languages within the same source file
class CSharpAspxLexer(DelegatingLexer):
    """
    Lexer for highlighting C# within ASP.NET pages.
    """

    name = 'aspx-cs'
    aliases = ['aspx-cs']
    filenames = ['*.aspx', '*.asax', '*.ascx', '*.ashx', '*.asmx', '*.axd']
    mimetypes = []
    url = 'https://dotnet.microsoft.com/en-us/apps/aspnet'
    version_added = ''

    def __init__(self, **options):
        super().__init__(CSharpLexer, GenericAspxLexer, **options)

    def analyse_text(text):
        if re.search(r'Page\s*Language="C#"', text, re.I) is not None:
            return 0.2
        elif re.search(r'script[^>]+language=["\']C#', text, re.I) is not None:
            return 0.15


class VbNetAspxLexer(DelegatingLexer):
    """
    Lexer for highlighting Visual Basic.net within ASP.NET pages.
    """

    name = 'aspx-vb'
    aliases = ['aspx-vb']
    filenames = ['*.aspx', '*.asax', '*.ascx', '*.ashx', '*.asmx', '*.axd']
    mimetypes = []
    url = 'https://dotnet.microsoft.com/en-us/apps/aspnet'
    version_added = ''

    def __init__(self, **options):
        super().__init__(VbNetLexer, GenericAspxLexer, **options)

    def analyse_text(text):
        if re.search(r'Page\s*Language="Vb"', text, re.I) is not None:
            return 0.2
        elif re.search(r'script[^>]+language=["\']vb', text, re.I) is not None:
            return 0.15


# Very close to functional.OcamlLexer
class FSharpLexer(RegexLexer):
    """
    For the F# language (version 3.0).
    """

    name = 'F#'
    url = 'https://fsharp.org/'
    aliases = ['fsharp', 'f#']
    filenames = ['*.fs', '*.fsi', '*.fsx']
    mimetypes = ['text/x-fsharp']
    version_added = '1.5'

    keywords = [
        'abstract', 'as', 'assert', 'base', 'begin', 'class', 'default',
        'delegate', 'do!', 'do', 'done', 'downcast', 'downto', 'elif', 'else',
        'end', 'exception', 'extern', 'false', 'finally', 'for', 'function',
        'fun', 'global', 'if', 'inherit', 'inline', 'interface', 'internal',
        'in', 'lazy', 'let!', 'let', 'match', 'member', 'module', 'mutable',
        'namespace', 'new', 'null', 'of', 'open', 'override', 'private', 'public',
        'rec', 'return!', 'return', 'select', 'static', 'struct', 'then', 'to',
        'true', 'try', 'type', 'upcast', 'use!', 'use', 'val', 'void', 'when',
        'while', 'with', 'yield!', 'yield',
    ]
    # Reserved words; cannot hurt to color them as keywords too.
    keywords += [
        'atomic', 'break', 'checked', 'component', 'const', 'constraint',
        'constructor', 'continue', 'eager', 'event', 'external', 'fixed',
        'functor', 'include', 'method', 'mixin', 'object', 'parallel',
        'process', 'protected', 'pure', 'sealed', 'tailcall', 'trait',
        'virtual', 'volatile',
    ]
    keyopts = [
        '!=', '#', '&&', '&', r'\(', r'\)', r'\*', r'\+', ',', r'-\.',
        '->', '-', r'\.\.', r'\.', '::', ':=', ':>', ':', ';;', ';', '<-',
        r'<\]', '<', r'>\]', '>', r'\?\?', r'\?', r'\[<', r'\[\|', r'\[', r'\]',
        '_', '`', r'\{', r'\|\]', r'\|', r'\}', '~', '<@@', '<@', '=', '@>', '@@>',
    ]

    operators = r'[!$%&*+\./:<=>?@^|~-]'
    word_operators = ['and', 'or', 'not']
    prefix_syms = r'[!?~]'
    infix_syms = r'[=<>@^|&+\*/$%-]'
    primitives = [
        'sbyte', 'byte', 'char', 'nativeint', 'unativeint', 'float32', 'single',
        'float', 'double', 'int8', 'uint8', 'int16', 'uint16', 'int32',
        'uint32', 'int64', 'uint64', 'decimal', 'unit', 'bool', 'string',
        'list', 'exn', 'obj', 'enum',
    ]

    # See http://msdn.microsoft.com/en-us/library/dd233181.aspx and/or
    # http://fsharp.org/about/files/spec.pdf for reference.  Good luck.

    tokens = {
        'escape-sequence': [
            (r'\\[\\"\'ntbrafv]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\U[0-9a-fA-F]{8}', String.Escape),
        ],
        'root': [
            (r'\s+', Whitespace),
            (r'\(\)|\[\]', Name.Builtin.Pseudo),
            (r'\b(?<!\.)([A-Z][\w\']*)(?=\s*\.)',
             Name.Namespace, 'dotted'),
            (r'\b([A-Z][\w\']*)', Name),
            (r'(///.*?)(\n)', bygroups(String.Doc, Whitespace)),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'\(\*(?!\))', Comment, 'comment'),

            (r'@"', String, 'lstring'),
            (r'"""', String, 'tqs'),
            (r'"', String, 'string'),

            (r'\b(open|module)(\s+)([\w.]+)',
             bygroups(Keyword, Whitespace, Name.Namespace)),
            (r'\b(let!?)(\s+)(\w+)',
             bygroups(Keyword, Whitespace, Name.Variable)),
            (r'\b(type)(\s+)(\w+)',
             bygroups(Keyword, Whitespace, Name.Class)),
            (r'\b(member|override)(\s+)(\w+)(\.)(\w+)',
             bygroups(Keyword, Whitespace, Name, Punctuation, Name.Function)),
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
            (r'``([^`\n\r\t]|`[^`\n\r\t])+``', Name),
            (r'({})'.format('|'.join(keyopts)), Operator),
            (rf'({infix_syms}|{prefix_syms})?{operators}', Operator),
            (r'\b({})\b'.format('|'.join(word_operators)), Operator.Word),
            (r'\b({})\b'.format('|'.join(primitives)), Keyword.Type),
            (r'(#)([ \t]*)(if|endif|else|line|nowarn|light|\d+)\b(.*?)(\n)',
             bygroups(Comment.Preproc, Whitespace, Comment.Preproc,
                      Comment.Preproc, Whitespace)),

            (r"[^\W\d][\w']*", Name),

            (r'\d[\d_]*[uU]?[yslLnQRZINGmM]?', Number.Integer),
            (r'0[xX][\da-fA-F][\da-fA-F_]*[uU]?[yslLn]?[fF]?', Number.Hex),
            (r'0[oO][0-7][0-7_]*[uU]?[yslLn]?', Number.Oct),
            (r'0[bB][01][01_]*[uU]?[yslLn]?', Number.Bin),
            (r'-?\d[\d_]*(.[\d_]*)?([eE][+\-]?\d[\d_]*)[fFmM]?',
             Number.Float),

            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2}))'B?",
             String.Char),
            (r"'.'", String.Char),
            (r"'", Keyword),  # a stray quote is another syntax element

            (r'@?"', String.Double, 'string'),

            (r'[~?][a-z][\w\']*:', Name.Variable),
        ],
        'dotted': [
            (r'\s+', Whitespace),
            (r'\.', Punctuation),
            (r'[A-Z][\w\']*(?=\s*\.)', Name.Namespace),
            (r'[A-Z][\w\']*', Name, '#pop'),
            (r'[a-z_][\w\']*', Name, '#pop'),
            # e.g. dictionary index access
            default('#pop'),
        ],
        'comment': [
            (r'[^(*)@"]+', Comment),
            (r'\(\*', Comment, '#push'),
            (r'\*\)', Comment, '#pop'),
            # comments cannot be closed within strings in comments
            (r'@"', String, 'lstring'),
            (r'"""', String, 'tqs'),
            (r'"', String, 'string'),
            (r'[(*)@]', Comment),
        ],
        'string': [
            (r'[^\\"]+', String),
            include('escape-sequence'),
            (r'\\\n', String),
            (r'\n', String),  # newlines are allowed in any string
            (r'"B?', String, '#pop'),
        ],
        'lstring': [
            (r'[^"]+', String),
            (r'\n', String),
            (r'""', String),
            (r'"B?', String, '#pop'),
        ],
        'tqs': [
            (r'[^"]+', String),
            (r'\n', String),
            (r'"""B?', String, '#pop'),
            (r'"', String),
        ],
    }

    def analyse_text(text):
        """F# doesn't have that many unique features -- |> and <| are weak
        indicators."""
        result = 0
        if '|>' in text:
            result += 0.05
        if '<|' in text:
            result += 0.05

        return result


class XppLexer(RegexLexer):

    """
    For X++ source code. This is based loosely on the CSharpLexer
    """

    name = 'X++'
    url = 'https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/dev-ref/xpp-language-reference'
    aliases = ['xpp', 'x++']
    filenames = ['*.xpp']
    version_added = '2.15'

    flags = re.MULTILINE

    XPP_CHARS = ('@?(?:_|[^' +
                 uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl') + '])' +
                 '[^' + uni.allexcept('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl',
                                      'Nd', 'Pc', 'Cf', 'Mn', 'Mc') + ']*')
    # Temporary, see
    # https://github.com/thatch/regexlint/pull/49
    XPP_CHARS = XPP_CHARS.replace('\x00', '\x01')

    OPERATORS = (
                    '<=', '>=', '+=', '-=', '*=', '/=', '!=', '==',
                    '&&', '||', '>>', '<<', '++', '--', '+', '-', '*',
                    '/', '%', '&', '|', '^', '<', '>', '?', '!', '~', '=',
                )
    KEYWORDS = ('abstract','anytype','as','async','asc','at','avg','break','breakpoint','by','byref','case','catch',
                 'changecompany','client','container','continue','count','crosscompany','default','delegate',
                 'delete_from','desc','display','div','do','edit','else','element','eventhandler','exists','false','final',
                 'firstfast','firstonly','firstonly10','firstonly100','firstonly1000','flush','for','forceliterals',
                 'forcenestedloop','forceplaceholders','forceselectorder','forupdate','from','group','if','insert_recordset',
                 'interface','is','join','like','maxof','minof','mod','new','next','nofetch','notexists','null','optimisticlock','order',
                 'outer','pause','pessimisticlock','print','private','protected','public','repeatableread','retry','return',
                 'reverse','select','server','setting','static','sum','super','switch','tablelock','this','throw','true','try','ttsabort','ttsbegin',
                 'ttscommit','update_recordset','validtimestate','void','where','while','window')
    RUNTIME_FUNCTIONS = ('_duration','abs','acos','any2Date','any2Enum','any2Guid','any2Int','any2Int64','any2Real','any2Str','anytodate',
                 'anytoenum','anytoguid','anytoint','anytoint64','anytoreal','anytostr','asin','atan','beep','cTerm','char2Num','classIdGet',
                 'corrFlagGet','corrFlagSet','cos','cosh','curExt','curUserId','date2Num','date2Str','datetime2Str','dayName','dayOfMth',
                 'dayOfWk','dayOfYr','ddb','decRound','dg','dimOf','endMth','enum2str','exp','exp10','fV','fieldId2Name','fieldId2PName',
                 'fieldName2Id','frac','funcName','getCurrentPartition','getCurrentPartitionRecId','getPrefix','guid2Str','idg','indexId2Name',
                 'indexName2Id','int2Str','int642Str','intvMax','intvName','intvNo','intvNorm','log10','logN','match','max','min','mkDate','mthName',
                 'mthOfYr','newGuid','nextMth','nextQtr','nextYr','num2Char','num2Date','num2Str','pmt','power','prevMth','prevQtr','prevYr',
                 'prmIsDefault','pt','pv','rate','refPrintAll','round','runAs','sessionId','setPrefix','sin','sinh','sleep','sln','str2Date',
                 'str2Datetime','str2Enum','str2Guid','str2Int','str2Int64','str2Num','str2Time','strAlpha','strCmp','strColSeq','strDel',
                 'strFind','strFmt','strIns','strKeep','strLTrim','strLen','strLine','strLwr','strNFind','strPoke','strPrompt','strRTrim',
                 'strRem','strRep','strScan','strUpr','subStr','syd','systemDateGet','systemDateSet','tableId2Name',
                 'tableId2PName','tableName2Id','tan','tanh','term','time2Str','timeNow','today','trunc','typeOf','uint2Str','wkOfYr','year')
    COMPILE_FUNCTIONS = ('attributeStr','classNum','classStr','configurationKeyNum','configurationKeyStr','dataEntityDataSourceStr','delegateStr',
                 'dimensionHierarchyLevelStr','dimensionHierarchyStr','dimensionReferenceStr','dutyStr','enumCnt','enumLiteralStr','enumNum','enumStr',
                 'extendedTypeNum','extendedTypeStr','fieldNum','fieldPName','fieldStr','formControlStr','formDataFieldStr','formDataSourceStr',
                 'formMethodStr','formStr','identifierStr','indexNum','indexStr','licenseCodeNum','licenseCodeStr','literalStr','maxDate','maxInt',
                 'measureStr','measurementStr','menuItemActionStr','menuItemDisplayStr','menuItemOutputStr','menuStr','methodStr','minInt','privilegeStr',
                 'queryDatasourceStr','queryMethodStr','queryStr','reportStr','resourceStr','roleStr','ssrsReportStr','staticDelegateStr','staticMethodStr',
                 'tableCollectionStr','tableFieldGroupStr','tableMethodStr','tableNum','tablePName','tableStaticMethodStr','tableStr','tileStr','varStr',
                 'webActionItemStr','webDisplayContentItemStr','webFormStr','webMenuStr','webOutputContentItemStr','webReportStr','webSiteTempStr',
                 'webStaticFileStr','webUrlItemStr','webWebPartStr','webletItemStr','webpageDefStr','websiteDefStr','workflowApprovalStr',
                 'workflowCategoryStr','workflowTaskStr','workflowTypeStr')

    tokens = {}

    tokens = {
        'root': [
            # method names
            (r'(\s*)\b(else|if)\b([^\n])', bygroups(Whitespace, Keyword, using(this))), # ensure that if is not treated like a function
            (r'^([ \t]*)((?:' + XPP_CHARS + r'(?:\[\])?\s+)+?)'  # return type
                r'(' + XPP_CHARS + ')'                            # method name
                r'(\s*)(\()',                               # signature start
                bygroups(Whitespace, using(this), Name.Function, Whitespace,
                        Punctuation)),
            (r'^(\s*)(\[)([^\n]*?)(\])', bygroups(Whitespace, Name.Attribute, Name.Variable.Class, Name.Attribute)),
            (r'[^\S\n]+', Whitespace),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),  # line continuation
            (r'//[^\n]*?\n', Comment.Single),
            (r'/[*][^\n]*?[*]/', Comment.Multiline),
            (r'\n', Whitespace),
            (words(OPERATORS), Operator),
            (r'=~|!=|==|<<|>>|[-+/*%=<>&^|]', Operator),
            (r'[()\[\];:,.#@]', Punctuation),
            (r'[{}]', Punctuation),
            (r'@"(""|[^"])*"', String),
            (r'\$?"(\\\\|\\[^\\]|[^"\\\n])*["\n]', String),
            (r"'\\.'|'[^\\]'", String.Char),
            (r"[0-9]+(\.[0-9]*)?([eE][+-][0-9]+)?"
                r"[flFLdD]?|0[xX][0-9a-fA-F]+[Ll]?", Number),
            (words(KEYWORDS, suffix=r'\b'), Keyword),
            (r'(boolean|int|int64|str|real|guid|date)\b\??', Keyword.Type),
            (r'(class|struct|extends|implements)(\s+)', bygroups(Keyword, Whitespace), 'class'),
            (r'('+XPP_CHARS+')(::)', bygroups(Name.Variable.Class, Punctuation)),
            (r'(\s*)(\w+)(\s+\w+(,|=)?[^\n]*;)', bygroups(Whitespace, Name.Variable.Class, using(this))), # declaration
            # x++ specific function to get field should highlight the classname
            (r'(fieldNum\()('+XPP_CHARS+r')(\s*,\s*)('+XPP_CHARS+r')(\s*\))',
                bygroups(using(this), Name.Variable.Class, using(this), Name.Property, using(this))),
            # x++ specific function to get table should highlight the classname
            (r'(tableNum\()('+XPP_CHARS+r')(\s*\))',
                bygroups(using(this), Name.Variable.Class, using(this))),
            (words(RUNTIME_FUNCTIONS, suffix=r'(?=\()'), Name.Function.Magic),
            (words(COMPILE_FUNCTIONS, suffix=r'(?=\()'), Name.Function.Magic),
            (XPP_CHARS, Name),
        ],
        'class': [
            (XPP_CHARS, Name.Class, '#pop'),
            default('#pop'),
        ],
        'namespace': [
            (r'(?=\()', Text, '#pop'),  # using (resource)
            ('(' + XPP_CHARS + r'|\.)+', Name.Namespace, '#pop'),
        ]
    }
