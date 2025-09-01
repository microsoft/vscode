"""
    pygments.lexers.basic
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for BASIC like languages (other than VB.net).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, default, words, include
from erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, \
    Punctuation, Operator, String, Text, Whitespace
from erdos._vendor.pygments.lexers import _vbscript_builtins


__all__ = ['BlitzBasicLexer', 'BlitzMaxLexer', 'MonkeyLexer', 'CbmBasicV2Lexer',
           'QBasicLexer', 'VBScriptLexer', 'BBCBasicLexer']


class BlitzMaxLexer(RegexLexer):
    """
    For BlitzMax source code.
    """

    name = 'BlitzMax'
    url = 'http://blitzbasic.com'
    aliases = ['blitzmax', 'bmax']
    filenames = ['*.bmx']
    mimetypes = ['text/x-bmx']
    version_added = '1.4'

    bmax_vopwords = r'\b(Shl|Shr|Sar|Mod)\b'
    bmax_sktypes = r'@{1,2}|[!#$%]'
    bmax_lktypes = r'\b(Int|Byte|Short|Float|Double|Long)\b'
    bmax_name = r'[a-z_]\w*'
    bmax_var = (rf'({bmax_name})(?:(?:([ \t]*)({bmax_sktypes})|([ \t]*:[ \t]*\b(?:Shl|Shr|Sar|Mod)\b)'
                rf'|([ \t]*)(:)([ \t]*)(?:{bmax_lktypes}|({bmax_name})))(?:([ \t]*)(Ptr))?)')
    bmax_func = bmax_var + r'?((?:[ \t]|\.\.\n)*)([(])'

    flags = re.MULTILINE | re.IGNORECASE
    tokens = {
        'root': [
            # Text
            (r'\s+', Whitespace),
            (r'(\.\.)(\n)', bygroups(Text, Whitespace)),  # Line continuation
            # Comments
            (r"'.*?\n", Comment.Single),
            (r'([ \t]*)\bRem\n(\n|.)*?\s*\bEnd([ \t]*)Rem', Comment.Multiline),
            # Data types
            ('"', String.Double, 'string'),
            # Numbers
            (r'[0-9]+\.[0-9]*(?!\.)', Number.Float),
            (r'\.[0-9]*(?!\.)', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'\$[0-9a-f]+', Number.Hex),
            (r'\%[10]+', Number.Bin),
            # Other
            (rf'(?:(?:(:)?([ \t]*)(:?{bmax_vopwords}|([+\-*/&|~]))|Or|And|Not|[=<>^]))', Operator),
            (r'[(),.:\[\]]', Punctuation),
            (r'(?:#[\w \t]*)', Name.Label),
            (r'(?:\?[\w \t]*)', Comment.Preproc),
            # Identifiers
            (rf'\b(New)\b([ \t]?)([(]?)({bmax_name})',
             bygroups(Keyword.Reserved, Whitespace, Punctuation, Name.Class)),
            (rf'\b(Import|Framework|Module)([ \t]+)({bmax_name}\.{bmax_name})',
             bygroups(Keyword.Reserved, Whitespace, Keyword.Namespace)),
            (bmax_func, bygroups(Name.Function, Whitespace, Keyword.Type,
                                 Operator, Whitespace, Punctuation, Whitespace,
                                 Keyword.Type, Name.Class, Whitespace,
                                 Keyword.Type, Whitespace, Punctuation)),
            (bmax_var, bygroups(Name.Variable, Whitespace, Keyword.Type, Operator,
                                Whitespace, Punctuation, Whitespace, Keyword.Type,
                                Name.Class, Whitespace, Keyword.Type)),
            (rf'\b(Type|Extends)([ \t]+)({bmax_name})',
             bygroups(Keyword.Reserved, Whitespace, Name.Class)),
            # Keywords
            (r'\b(Ptr)\b', Keyword.Type),
            (r'\b(Pi|True|False|Null|Self|Super)\b', Keyword.Constant),
            (r'\b(Local|Global|Const|Field)\b', Keyword.Declaration),
            (words((
                'TNullMethodException', 'TNullFunctionException',
                'TNullObjectException', 'TArrayBoundsException',
                'TRuntimeException'), prefix=r'\b', suffix=r'\b'), Name.Exception),
            (words((
                'Strict', 'SuperStrict', 'Module', 'ModuleInfo',
                'End', 'Return', 'Continue', 'Exit', 'Public', 'Private',
                'Var', 'VarPtr', 'Chr', 'Len', 'Asc', 'SizeOf', 'Sgn', 'Abs', 'Min', 'Max',
                'New', 'Release', 'Delete', 'Incbin', 'IncbinPtr', 'IncbinLen',
                'Framework', 'Include', 'Import', 'Extern', 'EndExtern',
                'Function', 'EndFunction', 'Type', 'EndType', 'Extends', 'Method', 'EndMethod',
                'Abstract', 'Final', 'If', 'Then', 'Else', 'ElseIf', 'EndIf',
                'For', 'To', 'Next', 'Step', 'EachIn', 'While', 'Wend', 'EndWhile',
                'Repeat', 'Until', 'Forever', 'Select', 'Case', 'Default', 'EndSelect',
                'Try', 'Catch', 'EndTry', 'Throw', 'Assert', 'Goto', 'DefData', 'ReadData',
                'RestoreData'), prefix=r'\b', suffix=r'\b'),
             Keyword.Reserved),
            # Final resolve (for variable names and such)
            (rf'({bmax_name})', Name.Variable),
        ],
        'string': [
            (r'""', String.Double),
            (r'"C?', String.Double, '#pop'),
            (r'[^"]+', String.Double),
        ],
    }


class BlitzBasicLexer(RegexLexer):
    """
    For BlitzBasic source code.
    """

    name = 'BlitzBasic'
    url = 'http://blitzbasic.com'
    aliases = ['blitzbasic', 'b3d', 'bplus']
    filenames = ['*.bb', '*.decls']
    mimetypes = ['text/x-bb']
    version_added = '2.0'

    bb_sktypes = r'@{1,2}|[#$%]'
    bb_name = r'[a-z]\w*'
    bb_var = (rf'({bb_name})(?:([ \t]*)({bb_sktypes})|([ \t]*)([.])([ \t]*)(?:({bb_name})))?')

    flags = re.MULTILINE | re.IGNORECASE
    tokens = {
        'root': [
            # Text
            (r'\s+', Whitespace),
            # Comments
            (r";.*?\n", Comment.Single),
            # Data types
            ('"', String.Double, 'string'),
            # Numbers
            (r'[0-9]+\.[0-9]*(?!\.)', Number.Float),
            (r'\.[0-9]+(?!\.)', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'\$[0-9a-f]+', Number.Hex),
            (r'\%[10]+', Number.Bin),
            # Other
            (words(('Shl', 'Shr', 'Sar', 'Mod', 'Or', 'And', 'Not',
                    'Abs', 'Sgn', 'Handle', 'Int', 'Float', 'Str',
                    'First', 'Last', 'Before', 'After'),
                   prefix=r'\b', suffix=r'\b'),
             Operator),
            (r'([+\-*/~=<>^])', Operator),
            (r'[(),:\[\]\\]', Punctuation),
            (rf'\.([ \t]*)({bb_name})', Name.Label),
            # Identifiers
            (rf'\b(New)\b([ \t]+)({bb_name})',
             bygroups(Keyword.Reserved, Whitespace, Name.Class)),
            (rf'\b(Gosub|Goto)\b([ \t]+)({bb_name})',
             bygroups(Keyword.Reserved, Whitespace, Name.Label)),
            (rf'\b(Object)\b([ \t]*)([.])([ \t]*)({bb_name})\b',
             bygroups(Operator, Whitespace, Punctuation, Whitespace, Name.Class)),
            (rf'\b{bb_var}\b([ \t]*)(\()',
             bygroups(Name.Function, Whitespace, Keyword.Type, Whitespace, Punctuation,
                      Whitespace, Name.Class, Whitespace, Punctuation)),
            (rf'\b(Function)\b([ \t]+){bb_var}',
             bygroups(Keyword.Reserved, Whitespace, Name.Function, Whitespace, Keyword.Type,
                      Whitespace, Punctuation, Whitespace, Name.Class)),
            (rf'\b(Type)([ \t]+)({bb_name})',
             bygroups(Keyword.Reserved, Whitespace, Name.Class)),
            # Keywords
            (r'\b(Pi|True|False|Null)\b', Keyword.Constant),
            (r'\b(Local|Global|Const|Field|Dim)\b', Keyword.Declaration),
            (words((
                'End', 'Return', 'Exit', 'Chr', 'Len', 'Asc', 'New', 'Delete', 'Insert',
                'Include', 'Function', 'Type', 'If', 'Then', 'Else', 'ElseIf', 'EndIf',
                'For', 'To', 'Next', 'Step', 'Each', 'While', 'Wend',
                'Repeat', 'Until', 'Forever', 'Select', 'Case', 'Default',
                'Goto', 'Gosub', 'Data', 'Read', 'Restore'), prefix=r'\b', suffix=r'\b'),
             Keyword.Reserved),
            # Final resolve (for variable names and such)
            # (r'(%s)' % (bb_name), Name.Variable),
            (bb_var, bygroups(Name.Variable, Whitespace, Keyword.Type,
                              Whitespace, Punctuation, Whitespace, Name.Class)),
        ],
        'string': [
            (r'""', String.Double),
            (r'"C?', String.Double, '#pop'),
            (r'[^"\n]+', String.Double),
        ],
    }


class MonkeyLexer(RegexLexer):
    """
    For Monkey source code.
    """

    name = 'Monkey'
    aliases = ['monkey']
    filenames = ['*.monkey']
    mimetypes = ['text/x-monkey']
    url = 'https://blitzresearch.itch.io/monkeyx'
    version_added = '1.6'

    name_variable = r'[a-z_]\w*'
    name_function = r'[A-Z]\w*'
    name_constant = r'[A-Z_][A-Z0-9_]*'
    name_class = r'[A-Z]\w*'
    name_module = r'[a-z0-9_]*'

    keyword_type = r'(?:Int|Float|String|Bool|Object|Array|Void)'
    # ? == Bool // % == Int // # == Float // $ == String
    keyword_type_special = r'[?%#$]'

    flags = re.MULTILINE

    tokens = {
        'root': [
            # Text
            (r'\s+', Whitespace),
            # Comments
            (r"'.*", Comment),
            (r'(?i)^#rem\b', Comment.Multiline, 'comment'),
            # preprocessor directives
            (r'(?i)^(?:#If|#ElseIf|#Else|#EndIf|#End|#Print|#Error)\b', Comment.Preproc),
            # preprocessor variable (any line starting with '#' that is not a directive)
            (r'^#', Comment.Preproc, 'variables'),
            # String
            ('"', String.Double, 'string'),
            # Numbers
            (r'[0-9]+\.[0-9]*(?!\.)', Number.Float),
            (r'\.[0-9]+(?!\.)', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'\$[0-9a-fA-Z]+', Number.Hex),
            (r'\%[10]+', Number.Bin),
            # Native data types
            (rf'\b{keyword_type}\b', Keyword.Type),
            # Exception handling
            (r'(?i)\b(?:Try|Catch|Throw)\b', Keyword.Reserved),
            (r'Throwable', Name.Exception),
            # Builtins
            (r'(?i)\b(?:Null|True|False)\b', Name.Builtin),
            (r'(?i)\b(?:Self|Super)\b', Name.Builtin.Pseudo),
            (r'\b(?:HOST|LANG|TARGET|CONFIG)\b', Name.Constant),
            # Keywords
            (r'(?i)^(Import)(\s+)(.*)(\n)',
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace, Whitespace)),
            (r'(?i)^Strict\b.*\n', Keyword.Reserved),
            (r'(?i)(Const|Local|Global|Field)(\s+)',
             bygroups(Keyword.Declaration, Whitespace), 'variables'),
            (r'(?i)(New|Class|Interface|Extends|Implements)(\s+)',
             bygroups(Keyword.Reserved, Whitespace), 'classname'),
            (r'(?i)(Function|Method)(\s+)',
             bygroups(Keyword.Reserved, Whitespace), 'funcname'),
            (r'(?i)(?:End|Return|Public|Private|Extern|Property|'
             r'Final|Abstract)\b', Keyword.Reserved),
            # Flow Control stuff
            (r'(?i)(?:If|Then|Else|ElseIf|EndIf|'
             r'Select|Case|Default|'
             r'While|Wend|'
             r'Repeat|Until|Forever|'
             r'For|To|Until|Step|EachIn|Next|'
             r'Exit|Continue)(?=\s)', Keyword.Reserved),
            # not used yet
            (r'(?i)\b(?:Module|Inline)\b', Keyword.Reserved),
            # Array
            (r'[\[\]]', Punctuation),
            # Other
            (r'<=|>=|<>|\*=|/=|\+=|-=|&=|~=|\|=|[-&*/^+=<>|~]', Operator),
            (r'(?i)(?:Not|Mod|Shl|Shr|And|Or)', Operator.Word),
            (r'[(){}!#,.:]', Punctuation),
            # catch the rest
            (rf'{name_constant}\b', Name.Constant),
            (rf'{name_function}\b', Name.Function),
            (rf'{name_variable}\b', Name.Variable),
        ],
        'funcname': [
            (rf'(?i){name_function}\b', Name.Function),
            (r':', Punctuation, 'classname'),
            (r'\s+', Whitespace),
            (r'\(', Punctuation, 'variables'),
            (r'\)', Punctuation, '#pop')
        ],
        'classname': [
            (rf'{name_module}\.', Name.Namespace),
            (rf'{keyword_type}\b', Keyword.Type),
            (rf'{name_class}\b', Name.Class),
            # array (of given size)
            (r'(\[)(\s*)(\d*)(\s*)(\])',
             bygroups(Punctuation, Whitespace, Number.Integer, Whitespace, Punctuation)),
            # generics
            (r'\s+(?!<)', Whitespace, '#pop'),
            (r'<', Punctuation, '#push'),
            (r'>', Punctuation, '#pop'),
            (r'\n', Whitespace, '#pop'),
            default('#pop')
        ],
        'variables': [
            (rf'{name_constant}\b', Name.Constant),
            (rf'{name_variable}\b', Name.Variable),
            (rf'{keyword_type_special}', Keyword.Type),
            (r'\s+', Whitespace),
            (r':', Punctuation, 'classname'),
            (r',', Punctuation, '#push'),
            default('#pop')
        ],
        'string': [
            (r'[^"~]+', String.Double),
            (r'~q|~n|~r|~t|~z|~~', String.Escape),
            (r'"', String.Double, '#pop'),
        ],
        'comment': [
            (r'(?i)^#rem.*?', Comment.Multiline, "#push"),
            (r'(?i)^#end.*?', Comment.Multiline, "#pop"),
            (r'\n', Comment.Multiline),
            (r'.+', Comment.Multiline),
        ],
    }


class CbmBasicV2Lexer(RegexLexer):
    """
    For CBM BASIC V2 sources.
    """
    name = 'CBM BASIC V2'
    aliases = ['cbmbas']
    filenames = ['*.bas']
    url = 'https://en.wikipedia.org/wiki/Commodore_BASIC'
    version_added = '1.6'

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r'rem.*\n', Comment.Single),
            (r'\s+', Whitespace),
            (r'new|run|end|for|to|next|step|go(to|sub)?|on|return|stop|cont'
             r'|if|then|input#?|read|wait|load|save|verify|poke|sys|print#?'
             r'|list|clr|cmd|open|close|get#?', Keyword.Reserved),
            (r'data|restore|dim|let|def|fn', Keyword.Declaration),
            (r'tab|spc|sgn|int|abs|usr|fre|pos|sqr|rnd|log|exp|cos|sin|tan|atn'
             r'|peek|len|val|asc|(str|chr|left|right|mid)\$', Name.Builtin),
            (r'[-+*/^<>=]', Operator),
            (r'not|and|or', Operator.Word),
            (r'"[^"\n]*.', String),
            (r'\d+|[-+]?\d*\.\d*(e[-+]?\d+)?', Number.Float),
            (r'[(),:;]', Punctuation),
            (r'\w+[$%]?', Name),
        ]
    }

    def analyse_text(text):
        # if it starts with a line number, it shouldn't be a "modern" Basic
        # like VB.net
        if re.match(r'^\d+', text):
            return 0.2


class QBasicLexer(RegexLexer):
    """
    For QBasic source code.
    """

    name = 'QBasic'
    aliases = ['qbasic', 'basic']
    filenames = ['*.BAS', '*.bas']
    mimetypes = ['text/basic']
    url = 'https://en.wikipedia.org/wiki/QBasic'
    version_added = '2.0'

    declarations = ('DATA', 'LET')

    functions = (
        'ABS', 'ASC', 'ATN', 'CDBL', 'CHR$', 'CINT', 'CLNG',
        'COMMAND$', 'COS', 'CSNG', 'CSRLIN', 'CVD', 'CVDMBF', 'CVI',
        'CVL', 'CVS', 'CVSMBF', 'DATE$', 'ENVIRON$', 'EOF', 'ERDEV',
        'ERDEV$', 'ERL', 'ERR', 'EXP', 'FILEATTR', 'FIX', 'FRE',
        'FREEFILE', 'HEX$', 'INKEY$', 'INP', 'INPUT$', 'INSTR', 'INT',
        'IOCTL$', 'LBOUND', 'LCASE$', 'LEFT$', 'LEN', 'LOC', 'LOF',
        'LOG', 'LPOS', 'LTRIM$', 'MID$', 'MKD$', 'MKDMBF$', 'MKI$',
        'MKL$', 'MKS$', 'MKSMBF$', 'OCT$', 'PEEK', 'PEN', 'PLAY',
        'PMAP', 'POINT', 'POS', 'RIGHT$', 'RND', 'RTRIM$', 'SADD',
        'SCREEN', 'SEEK', 'SETMEM', 'SGN', 'SIN', 'SPACE$', 'SPC',
        'SQR', 'STICK', 'STR$', 'STRIG', 'STRING$', 'TAB', 'TAN',
        'TIME$', 'TIMER', 'UBOUND', 'UCASE$', 'VAL', 'VARPTR',
        'VARPTR$', 'VARSEG'
    )

    metacommands = ('$DYNAMIC', '$INCLUDE', '$STATIC')

    operators = ('AND', 'EQV', 'IMP', 'NOT', 'OR', 'XOR')

    statements = (
        'BEEP', 'BLOAD', 'BSAVE', 'CALL', 'CALL ABSOLUTE',
        'CALL INTERRUPT', 'CALLS', 'CHAIN', 'CHDIR', 'CIRCLE', 'CLEAR',
        'CLOSE', 'CLS', 'COLOR', 'COM', 'COMMON', 'CONST', 'DATA',
        'DATE$', 'DECLARE', 'DEF FN', 'DEF SEG', 'DEFDBL', 'DEFINT',
        'DEFLNG', 'DEFSNG', 'DEFSTR', 'DEF', 'DIM', 'DO', 'LOOP',
        'DRAW', 'END', 'ENVIRON', 'ERASE', 'ERROR', 'EXIT', 'FIELD',
        'FILES', 'FOR', 'NEXT', 'FUNCTION', 'GET', 'GOSUB', 'GOTO',
        'IF', 'THEN', 'INPUT', 'INPUT #', 'IOCTL', 'KEY', 'KEY',
        'KILL', 'LET', 'LINE', 'LINE INPUT', 'LINE INPUT #', 'LOCATE',
        'LOCK', 'UNLOCK', 'LPRINT', 'LSET', 'MID$', 'MKDIR', 'NAME',
        'ON COM', 'ON ERROR', 'ON KEY', 'ON PEN', 'ON PLAY',
        'ON STRIG', 'ON TIMER', 'ON UEVENT', 'ON', 'OPEN', 'OPEN COM',
        'OPTION BASE', 'OUT', 'PAINT', 'PALETTE', 'PCOPY', 'PEN',
        'PLAY', 'POKE', 'PRESET', 'PRINT', 'PRINT #', 'PRINT USING',
        'PSET', 'PUT', 'PUT', 'RANDOMIZE', 'READ', 'REDIM', 'REM',
        'RESET', 'RESTORE', 'RESUME', 'RETURN', 'RMDIR', 'RSET', 'RUN',
        'SCREEN', 'SEEK', 'SELECT CASE', 'SHARED', 'SHELL', 'SLEEP',
        'SOUND', 'STATIC', 'STOP', 'STRIG', 'SUB', 'SWAP', 'SYSTEM',
        'TIME$', 'TIMER', 'TROFF', 'TRON', 'TYPE', 'UEVENT', 'UNLOCK',
        'VIEW', 'WAIT', 'WHILE', 'WEND', 'WIDTH', 'WINDOW', 'WRITE'
    )

    keywords = (
        'ACCESS', 'ALIAS', 'ANY', 'APPEND', 'AS', 'BASE', 'BINARY',
        'BYVAL', 'CASE', 'CDECL', 'DOUBLE', 'ELSE', 'ELSEIF', 'ENDIF',
        'INTEGER', 'IS', 'LIST', 'LOCAL', 'LONG', 'LOOP', 'MOD',
        'NEXT', 'OFF', 'ON', 'OUTPUT', 'RANDOM', 'SIGNAL', 'SINGLE',
        'STEP', 'STRING', 'THEN', 'TO', 'UNTIL', 'USING', 'WEND'
    )

    tokens = {
        'root': [
            (r'\n+', Text),
            (r'\s+', Text.Whitespace),
            (r'^(\s*)(\d*)(\s*)(REM .*)$',
             bygroups(Text.Whitespace, Name.Label, Text.Whitespace,
                      Comment.Single)),
            (r'^(\s*)(\d+)(\s*)',
             bygroups(Text.Whitespace, Name.Label, Text.Whitespace)),
            (r'(?=[\s]*)(\w+)(?=[\s]*=)', Name.Variable.Global),
            (r'(?=[^"]*)\'.*$', Comment.Single),
            (r'"[^\n"]*"', String.Double),
            (r'(END)(\s+)(FUNCTION|IF|SELECT|SUB)',
             bygroups(Keyword.Reserved, Text.Whitespace, Keyword.Reserved)),
            (r'(DECLARE)(\s+)([A-Z]+)(\s+)(\S+)',
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Variable,
                      Text.Whitespace, Name)),
            (r'(DIM)(\s+)(SHARED)(\s+)([^\s(]+)',
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Variable,
                      Text.Whitespace, Name.Variable.Global)),
            (r'(DIM)(\s+)([^\s(]+)',
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Variable.Global)),
            (r'^(\s*)([a-zA-Z_]+)(\s*)(\=)',
             bygroups(Text.Whitespace, Name.Variable.Global, Text.Whitespace,
                      Operator)),
            (r'(GOTO|GOSUB)(\s+)(\w+\:?)',
             bygroups(Keyword.Reserved, Text.Whitespace, Name.Label)),
            (r'(SUB)(\s+)(\w+\:?)',
             bygroups(Keyword.Reserved, Text.Whitespace, Name.Label)),
            include('declarations'),
            include('functions'),
            include('metacommands'),
            include('operators'),
            include('statements'),
            include('keywords'),
            (r'[a-zA-Z_]\w*[$@#&!]', Name.Variable.Global),
            (r'[a-zA-Z_]\w*\:', Name.Label),
            (r'\-?\d*\.\d+[@|#]?', Number.Float),
            (r'\-?\d+[@|#]', Number.Float),
            (r'\-?\d+#?', Number.Integer.Long),
            (r'\-?\d+#?', Number.Integer),
            (r'!=|==|:=|\.=|<<|>>|[-~+/\\*%=<>&^|?:!.]', Operator),
            (r'[\[\]{}(),;]', Punctuation),
            (r'[\w]+', Name.Variable.Global),
        ],
        # can't use regular \b because of X$()
        # XXX: use words() here
        'declarations': [
            (r'\b({})(?=\(|\b)'.format('|'.join(map(re.escape, declarations))),
             Keyword.Declaration),
        ],
        'functions': [
            (r'\b({})(?=\(|\b)'.format('|'.join(map(re.escape, functions))),
             Keyword.Reserved),
        ],
        'metacommands': [
            (r'\b({})(?=\(|\b)'.format('|'.join(map(re.escape, metacommands))),
             Keyword.Constant),
        ],
        'operators': [
            (r'\b({})(?=\(|\b)'.format('|'.join(map(re.escape, operators))), Operator.Word),
        ],
        'statements': [
            (r'\b({})\b'.format('|'.join(map(re.escape, statements))),
             Keyword.Reserved),
        ],
        'keywords': [
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
        ],
    }

    def analyse_text(text):
        if '$DYNAMIC' in text or '$STATIC' in text:
            return 0.9


class VBScriptLexer(RegexLexer):
    """
    VBScript is scripting language that is modeled on Visual Basic.
    """
    name = 'VBScript'
    aliases = ['vbscript']
    filenames = ['*.vbs', '*.VBS']
    url = 'https://learn.microsoft.com/en-us/previous-versions/t0aew7h6(v=vs.85)'
    version_added = '2.4'

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r"'[^\n]*", Comment.Single),
            (r'\s+', Whitespace),
            ('"', String.Double, 'string'),
            ('&h[0-9a-f]+', Number.Hex),
            # Float variant 1, for example: 1., 1.e2, 1.2e3
            (r'[0-9]+\.[0-9]*(e[+-]?[0-9]+)?', Number.Float),
            (r'\.[0-9]+(e[+-]?[0-9]+)?', Number.Float),  # Float variant 2, for example: .1, .1e2
            (r'[0-9]+e[+-]?[0-9]+', Number.Float),  # Float variant 3, for example: 123e45
            (r'[0-9]+', Number.Integer),
            ('#.+#', String),  # date or time value
            (r'(dim)(\s+)([a-z_][a-z0-9_]*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Variable), 'dim_more'),
            (r'(function|sub)(\s+)([a-z_][a-z0-9_]*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Function)),
            (r'(class)(\s+)([a-z_][a-z0-9_]*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Class)),
            (r'(const)(\s+)([a-z_][a-z0-9_]*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Constant)),
            (r'(end)(\s+)(class|function|if|property|sub|with)',
             bygroups(Keyword, Whitespace, Keyword)),
            (r'(on)(\s+)(error)(\s+)(goto)(\s+)(0)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword, Whitespace, Number.Integer)),
            (r'(on)(\s+)(error)(\s+)(resume)(\s+)(next)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(option)(\s+)(explicit)', bygroups(Keyword, Whitespace, Keyword)),
            (r'(property)(\s+)(get|let|set)(\s+)([a-z_][a-z0-9_]*)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration, Whitespace, Name.Property)),
            (r'rem\s.*[^\n]*', Comment.Single),
            (words(_vbscript_builtins.KEYWORDS, suffix=r'\b'), Keyword),
            (words(_vbscript_builtins.OPERATORS), Operator),
            (words(_vbscript_builtins.OPERATOR_WORDS, suffix=r'\b'), Operator.Word),
            (words(_vbscript_builtins.BUILTIN_CONSTANTS, suffix=r'\b'), Name.Constant),
            (words(_vbscript_builtins.BUILTIN_FUNCTIONS, suffix=r'\b'), Name.Builtin),
            (words(_vbscript_builtins.BUILTIN_VARIABLES, suffix=r'\b'), Name.Builtin),
            (r'[a-z_][a-z0-9_]*', Name),
            (r'\b_\n', Operator),
            (words(r'(),.:'), Punctuation),
            (r'.+(\n)?', Error)
        ],
        'dim_more': [
            (r'(\s*)(,)(\s*)([a-z_][a-z0-9]*)',
             bygroups(Whitespace, Punctuation, Whitespace, Name.Variable)),
            default('#pop'),
        ],
        'string': [
            (r'[^"\n]+', String.Double),
            (r'\"\"', String.Double),
            (r'"', String.Double, '#pop'),
            (r'\n', Error, '#pop'),  # Unterminated string
        ],
    }


class BBCBasicLexer(RegexLexer):
    """
    BBC Basic was supplied on the BBC Micro, and later Acorn RISC OS.
    It is also used by BBC Basic For Windows.
    """
    base_keywords = ['OTHERWISE', 'AND', 'DIV', 'EOR', 'MOD', 'OR', 'ERROR',
                     'LINE', 'OFF', 'STEP', 'SPC', 'TAB', 'ELSE', 'THEN',
                     'OPENIN', 'PTR', 'PAGE', 'TIME', 'LOMEM', 'HIMEM', 'ABS',
                     'ACS', 'ADVAL', 'ASC', 'ASN', 'ATN', 'BGET', 'COS', 'COUNT',
                     'DEG', 'ERL', 'ERR', 'EVAL', 'EXP', 'EXT', 'FALSE', 'FN',
                     'GET', 'INKEY', 'INSTR', 'INT', 'LEN', 'LN', 'LOG', 'NOT',
                     'OPENUP', 'OPENOUT', 'PI', 'POINT', 'POS', 'RAD', 'RND',
                     'SGN', 'SIN', 'SQR', 'TAN', 'TO', 'TRUE', 'USR', 'VAL',
                     'VPOS', 'CHR$', 'GET$', 'INKEY$', 'LEFT$', 'MID$',
                     'RIGHT$', 'STR$', 'STRING$', 'EOF', 'PTR', 'PAGE', 'TIME',
                     'LOMEM', 'HIMEM', 'SOUND', 'BPUT', 'CALL', 'CHAIN', 'CLEAR',
                     'CLOSE', 'CLG', 'CLS', 'DATA', 'DEF', 'DIM', 'DRAW', 'END',
                     'ENDPROC', 'ENVELOPE', 'FOR', 'GOSUB', 'GOTO', 'GCOL', 'IF',
                     'INPUT', 'LET', 'LOCAL', 'MODE', 'MOVE', 'NEXT', 'ON',
                     'VDU', 'PLOT', 'PRINT', 'PROC', 'READ', 'REM', 'REPEAT',
                     'REPORT', 'RESTORE', 'RETURN', 'RUN', 'STOP', 'COLOUR',
                     'TRACE', 'UNTIL', 'WIDTH', 'OSCLI']

    basic5_keywords = ['WHEN', 'OF', 'ENDCASE', 'ENDIF', 'ENDWHILE', 'CASE',
                       'CIRCLE', 'FILL', 'ORIGIN', 'POINT', 'RECTANGLE', 'SWAP',
                       'WHILE', 'WAIT', 'MOUSE', 'QUIT', 'SYS', 'INSTALL',
                       'LIBRARY', 'TINT', 'ELLIPSE', 'BEATS', 'TEMPO', 'VOICES',
                       'VOICE', 'STEREO', 'OVERLAY', 'APPEND', 'AUTO', 'CRUNCH',
                       'DELETE', 'EDIT', 'HELP', 'LIST', 'LOAD', 'LVAR', 'NEW',
                       'OLD', 'RENUMBER', 'SAVE', 'TEXTLOAD', 'TEXTSAVE',
                       'TWIN', 'TWINO', 'INSTALL', 'SUM', 'BEAT']


    name = 'BBC Basic'
    aliases = ['bbcbasic']
    filenames = ['*.bbc']
    url = 'https://www.bbcbasic.co.uk/bbcbasic.html'
    version_added = '2.4'

    tokens = {
        'root': [
            (r"[0-9]+", Name.Label),
            (r"(\*)([^\n]*)",
             bygroups(Keyword.Pseudo, Comment.Special)),
            default('code'),
        ],

        'code': [
            (r"(REM)([^\n]*)",
             bygroups(Keyword.Declaration, Comment.Single)),
            (r'\n', Whitespace, 'root'),
            (r'\s+', Whitespace),
            (r':', Comment.Preproc),

            # Some special cases to make functions come out nicer
            (r'(DEF)(\s*)(FN|PROC)([A-Za-z_@][\w@]*)',
             bygroups(Keyword.Declaration, Whitespace,
                      Keyword.Declaration, Name.Function)),
            (r'(FN|PROC)([A-Za-z_@][\w@]*)',
             bygroups(Keyword, Name.Function)),

            (r'(GOTO|GOSUB|THEN|RESTORE)(\s*)(\d+)',
             bygroups(Keyword, Whitespace, Name.Label)),

            (r'(TRUE|FALSE)', Keyword.Constant),
            (r'(PAGE|LOMEM|HIMEM|TIME|WIDTH|ERL|ERR|REPORT\$|POS|VPOS|VOICES)',
             Keyword.Pseudo),

            (words(base_keywords), Keyword),
            (words(basic5_keywords), Keyword),

            ('"', String.Double, 'string'),

            ('%[01]{1,32}', Number.Bin),
            ('&[0-9a-f]{1,8}', Number.Hex),

            (r'[+-]?[0-9]+\.[0-9]*(E[+-]?[0-9]+)?', Number.Float),
            (r'[+-]?\.[0-9]+(E[+-]?[0-9]+)?', Number.Float),
            (r'[+-]?[0-9]+E[+-]?[0-9]+', Number.Float),
            (r'[+-]?\d+', Number.Integer),

            (r'([A-Za-z_@][\w@]*[%$]?)', Name.Variable),
            (r'([+\-]=|[$!|?+\-*/%^=><();]|>=|<=|<>|<<|>>|>>>|,)', Operator),
        ],
        'string': [
            (r'[^"\n]+', String.Double),
            (r'"', String.Double, '#pop'),
            (r'\n', Error, 'root'),  # Unterminated string
        ],
    }

    def analyse_text(text):
        if text.startswith('10REM >') or text.startswith('REM >'):
            return 0.9
