"""
    pygments.lexers.fortran
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Fortran languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, words, using, default
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic

__all__ = ['FortranLexer', 'FortranFixedLexer']


class FortranLexer(RegexLexer):
    """
    Lexer for FORTRAN 90 code.
    """
    name = 'Fortran'
    url = 'https://fortran-lang.org/'
    aliases = ['fortran', 'f90']
    filenames = ['*.f03', '*.f90', '*.F03', '*.F90']
    mimetypes = ['text/x-fortran']
    version_added = '0.10'
    flags = re.IGNORECASE | re.MULTILINE

    # Data Types: INTEGER, REAL, COMPLEX, LOGICAL, CHARACTER and DOUBLE PRECISION
    # Operators: **, *, +, -, /, <, >, <=, >=, ==, /=
    # Logical (?): NOT, AND, OR, EQV, NEQV

    # Builtins:
    # http://gcc.gnu.org/onlinedocs/gcc-3.4.6/g77/Table-of-Intrinsic-Functions.html

    tokens = {
        'root': [
            (r'^#.*\n', Comment.Preproc),
            (r'!.*\n', Comment),
            include('strings'),
            include('core'),
            (r'[a-z][\w$]*', Name),
            include('nums'),
            (r'[\s]+', Text.Whitespace),
        ],
        'core': [
            # Statements

            (r'\b(DO)(\s+)(CONCURRENT)\b', bygroups(Keyword, Text.Whitespace, Keyword)),
            (r'\b(GO)(\s*)(TO)\b', bygroups(Keyword, Text.Whitespace, Keyword)),

            (words((
                'ABSTRACT', 'ACCEPT', 'ALL', 'ALLSTOP', 'ALLOCATABLE', 'ALLOCATE',
                'ARRAY', 'ASSIGN', 'ASSOCIATE', 'ASYNCHRONOUS', 'BACKSPACE', 'BIND',
                'BLOCK', 'BLOCKDATA', 'BYTE', 'CALL', 'CASE', 'CLASS', 'CLOSE',
                'CODIMENSION', 'COMMON', 'CONTIGUOUS', 'CONTAINS',
                'CONTINUE', 'CRITICAL', 'CYCLE', 'DATA', 'DEALLOCATE', 'DECODE',
                'DEFERRED', 'DIMENSION', 'DO', 'ELEMENTAL', 'ELSE', 'ELSEIF', 'ENCODE',
                'END', 'ENDASSOCIATE', 'ENDBLOCK', 'ENDDO', 'ENDENUM', 'ENDFORALL',
                'ENDFUNCTION',  'ENDIF', 'ENDINTERFACE', 'ENDMODULE', 'ENDPROGRAM',
                'ENDSELECT', 'ENDSUBMODULE', 'ENDSUBROUTINE', 'ENDTYPE', 'ENDWHERE',
                'ENTRY', 'ENUM', 'ENUMERATOR', 'EQUIVALENCE', 'ERROR STOP', 'EXIT',
                'EXTENDS', 'EXTERNAL', 'EXTRINSIC', 'FILE', 'FINAL', 'FORALL', 'FORMAT',
                'FUNCTION', 'GENERIC', 'IF', 'IMAGES', 'IMPLICIT',
                'IMPORT', 'IMPURE', 'INCLUDE', 'INQUIRE', 'INTENT', 'INTERFACE',
                'INTRINSIC', 'IS', 'LOCK', 'MEMORY', 'MODULE', 'NAMELIST', 'NULLIFY',
                'NONE', 'NON_INTRINSIC', 'NON_OVERRIDABLE', 'NOPASS', 'ONLY', 'OPEN',
                'OPTIONAL', 'OPTIONS', 'PARAMETER', 'PASS', 'PAUSE', 'POINTER', 'PRINT',
                'PRIVATE', 'PROGRAM', 'PROCEDURE', 'PROTECTED', 'PUBLIC', 'PURE', 'READ',
                'RECURSIVE', 'RESULT', 'RETURN', 'REWIND', 'SAVE', 'SELECT', 'SEQUENCE',
                'STOP', 'SUBMODULE', 'SUBROUTINE', 'SYNC', 'SYNCALL', 'SYNCIMAGES',
                'SYNCMEMORY', 'TARGET', 'THEN', 'TYPE', 'UNLOCK', 'USE', 'VALUE',
                'VOLATILE', 'WHERE', 'WRITE', 'WHILE'), prefix=r'\b', suffix=r'\s*\b'),
             Keyword),

            # Data Types
            (words((
                'CHARACTER', 'COMPLEX', 'DOUBLE PRECISION', 'DOUBLE COMPLEX', 'INTEGER',
                'LOGICAL', 'REAL', 'C_INT', 'C_SHORT', 'C_LONG', 'C_LONG_LONG',
                'C_SIGNED_CHAR', 'C_SIZE_T', 'C_INT8_T', 'C_INT16_T', 'C_INT32_T',
                'C_INT64_T', 'C_INT_LEAST8_T', 'C_INT_LEAST16_T', 'C_INT_LEAST32_T',
                'C_INT_LEAST64_T', 'C_INT_FAST8_T', 'C_INT_FAST16_T', 'C_INT_FAST32_T',
                'C_INT_FAST64_T', 'C_INTMAX_T', 'C_INTPTR_T', 'C_FLOAT', 'C_DOUBLE',
                'C_LONG_DOUBLE', 'C_FLOAT_COMPLEX', 'C_DOUBLE_COMPLEX',
                'C_LONG_DOUBLE_COMPLEX', 'C_BOOL', 'C_CHAR', 'C_PTR', 'C_FUNPTR'),
                   prefix=r'\b', suffix=r'\s*\b'),
             Keyword.Type),

            # Operators
            (r'(\*\*|\*|\+|-|\/|<|>|<=|>=|==|\/=|=)', Operator),

            (r'(::)', Keyword.Declaration),

            (r'[()\[\],:&%;.]', Punctuation),
            # Intrinsics
            (words((
                'Abort', 'Abs', 'Access', 'AChar', 'ACos', 'ACosH', 'AdjustL',
                'AdjustR', 'AImag', 'AInt', 'Alarm', 'All', 'Allocated', 'ALog',
                'AMax', 'AMin', 'AMod', 'And', 'ANInt', 'Any', 'ASin', 'ASinH',
                'Associated', 'ATan', 'ATanH', 'Atomic_Define', 'Atomic_Ref',
                'BesJ', 'BesJN', 'Bessel_J0', 'Bessel_J1', 'Bessel_JN', 'Bessel_Y0',
                'Bessel_Y1', 'Bessel_YN', 'BesY', 'BesYN', 'BGE', 'BGT', 'BLE',
                'BLT', 'Bit_Size', 'BTest', 'CAbs', 'CCos', 'Ceiling', 'CExp',
                'Char', 'ChDir', 'ChMod', 'CLog', 'Cmplx', 'Command_Argument_Count',
                'Complex', 'Conjg', 'Cos', 'CosH', 'Count', 'CPU_Time', 'CShift',
                'CSin', 'CSqRt', 'CTime', 'C_Loc', 'C_Associated',
                'C_Null_Ptr', 'C_Null_Funptr', 'C_F_Pointer', 'C_F_ProcPointer',
                'C_Null_Char', 'C_Alert', 'C_Backspace', 'C_Form_Feed', 'C_FunLoc',
                'C_Sizeof', 'C_New_Line', 'C_Carriage_Return',
                'C_Horizontal_Tab', 'C_Vertical_Tab', 'DAbs', 'DACos', 'DASin',
                'DATan', 'Date_and_Time', 'DbesJ', 'DbesJN', 'DbesY',
                'DbesYN', 'Dble', 'DCos', 'DCosH', 'DDiM', 'DErF',
                'DErFC', 'DExp', 'Digits', 'DiM', 'DInt', 'DLog', 'DMax',
                'DMin', 'DMod', 'DNInt', 'Dot_Product', 'DProd', 'DSign', 'DSinH',
                'DShiftL', 'DShiftR', 'DSin', 'DSqRt', 'DTanH', 'DTan', 'DTime',
                'EOShift', 'Epsilon', 'ErF', 'ErFC', 'ErFC_Scaled', 'ETime',
                'Execute_Command_Line', 'Exit', 'Exp', 'Exponent', 'Extends_Type_Of',
                'FDate', 'FGet', 'FGetC', 'FindLoc', 'Float', 'Floor', 'Flush',
                'FNum', 'FPutC', 'FPut', 'Fraction', 'FSeek', 'FStat', 'FTell',
                'Gamma', 'GError', 'GetArg', 'Get_Command', 'Get_Command_Argument',
                'Get_Environment_Variable', 'GetCWD', 'GetEnv', 'GetGId', 'GetLog',
                'GetPId', 'GetUId', 'GMTime', 'HostNm', 'Huge', 'Hypot', 'IAbs',
                'IAChar', 'IAll', 'IAnd', 'IAny', 'IArgC', 'IBClr', 'IBits',
                'IBSet', 'IChar', 'IDate', 'IDiM', 'IDInt', 'IDNInt', 'IEOr',
                'IErrNo', 'IFix', 'Imag', 'ImagPart', 'Image_Index', 'Index',
                'Int', 'IOr', 'IParity', 'IRand', 'IsaTty', 'IShft', 'IShftC',
                'ISign', 'Iso_C_Binding', 'Is_Contiguous', 'Is_Iostat_End',
                'Is_Iostat_Eor', 'ITime', 'Kill', 'Kind', 'LBound', 'LCoBound',
                'Len', 'Len_Trim', 'LGe', 'LGt', 'Link', 'LLe', 'LLt', 'LnBlnk',
                'Loc', 'Log', 'Log_Gamma', 'Logical', 'Long', 'LShift', 'LStat',
                'LTime', 'MaskL', 'MaskR', 'MatMul', 'Max', 'MaxExponent',
                'MaxLoc', 'MaxVal', 'MClock', 'Merge', 'Merge_Bits', 'Move_Alloc',
                'Min', 'MinExponent', 'MinLoc', 'MinVal', 'Mod', 'Modulo', 'MvBits',
                'Nearest', 'New_Line', 'NInt', 'Norm2', 'Not', 'Null', 'Num_Images',
                'Or', 'Pack', 'Parity', 'PError', 'Precision', 'Present', 'Product',
                'Radix', 'Rand', 'Random_Number', 'Random_Seed', 'Range', 'Real',
                'RealPart', 'Rename', 'Repeat', 'Reshape', 'RRSpacing', 'RShift',
                'Same_Type_As', 'Scale', 'Scan', 'Second', 'Selected_Char_Kind',
                'Selected_Int_Kind', 'Selected_Real_Kind', 'Set_Exponent', 'Shape',
                'ShiftA', 'ShiftL', 'ShiftR', 'Short', 'Sign', 'Signal', 'SinH',
                'Sin', 'Sleep', 'Sngl', 'Spacing', 'Spread', 'SqRt', 'SRand',
                'Stat', 'Storage_Size', 'Sum', 'SymLnk', 'System', 'System_Clock',
                'Tan', 'TanH', 'Time', 'This_Image', 'Tiny', 'TrailZ', 'Transfer',
                'Transpose', 'Trim', 'TtyNam', 'UBound', 'UCoBound', 'UMask',
                'Unlink', 'Unpack', 'Verify', 'XOr', 'ZAbs', 'ZCos', 'ZExp',
                'ZLog', 'ZSin', 'ZSqRt'), prefix=r'\b', suffix=r'\s*\b'),
             Name.Builtin),

            # Booleans
            (r'\.(true|false)\.', Name.Builtin),
            # Comparing Operators
            (r'\.(eq|ne|lt|le|gt|ge|not|and|or|eqv|neqv)\.', Operator.Word),
        ],

        'strings': [
            (r'"(\\[0-7]+|\\[^0-7]|[^"\\])*"', String.Double),
            (r"'(\\[0-7]+|\\[^0-7]|[^'\\])*'", String.Single),
        ],

        'nums': [
            (r'\d+(?![.e])(_([1-9]|[a-z]\w*))?', Number.Integer),
            (r'[+-]?\d*\.\d+([ed][-+]?\d+)?(_([1-9]|[a-z]\w*))?', Number.Float),
            (r'[+-]?\d+\.\d*([ed][-+]?\d+)?(_([1-9]|[a-z]\w*))?', Number.Float),
            (r'[+-]?\d+(\.\d*)?[ed][-+]?\d+(_([1-9]|[a-z]\w*))?', Number.Float),
        ],
    }


class FortranFixedLexer(RegexLexer):
    """
    Lexer for fixed format Fortran.
    """
    name = 'FortranFixed'
    aliases = ['fortranfixed']
    filenames = ['*.f', '*.F']
    url = 'https://fortran-lang.org/'
    version_added = '2.1'

    flags = re.IGNORECASE

    def _lex_fortran(self, match, ctx=None):
        """Lex a line just as free form fortran without line break."""
        lexer = FortranLexer()
        text = match.group(0) + "\n"
        for index, token, value in lexer.get_tokens_unprocessed(text):
            value = value.replace('\n', '')
            if value != '':
                yield index, token, value

    tokens = {
        'root': [
            (r'[C*].*\n', Comment),
            (r'#.*\n', Comment.Preproc),
            (r' {0,4}!.*\n', Comment),
            (r'(.{5})', Name.Label, 'cont-char'),
            (r'.*\n', using(FortranLexer)),
        ],
        'cont-char': [
            (' ', Text, 'code'),
            ('0', Comment, 'code'),
            ('.', Generic.Strong, 'code'),
        ],
        'code': [
            (r'(.{66})(.*)(\n)',
             bygroups(_lex_fortran, Comment, Text.Whitespace), 'root'),
            (r'(.*)(\n)', bygroups(_lex_fortran, Text.Whitespace), 'root'),
            default('root'),
        ]
    }
