"""
    pygments.lexers.modula2
    ~~~~~~~~~~~~~~~~~~~~~~~

    Multi-Dialect Lexer for Modula-2.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include
from erdos.erdos._vendor.pygments.util import get_bool_opt, get_list_opt
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, \
    String, Number, Punctuation, Error

__all__ = ['Modula2Lexer']


# Multi-Dialect Modula-2 Lexer
class Modula2Lexer(RegexLexer):
    """
    For Modula-2 source code.

    The Modula-2 lexer supports several dialects.  By default, it operates in
    fallback mode, recognising the *combined* literals, punctuation symbols
    and operators of all supported dialects, and the *combined* reserved words
    and builtins of PIM Modula-2, ISO Modula-2 and Modula-2 R10, while not
    differentiating between library defined identifiers.

    To select a specific dialect, a dialect option may be passed
    or a dialect tag may be embedded into a source file.

    Dialect Options:

    `m2pim`
        Select PIM Modula-2 dialect.
    `m2iso`
        Select ISO Modula-2 dialect.
    `m2r10`
        Select Modula-2 R10 dialect.
    `objm2`
        Select Objective Modula-2 dialect.

    The PIM and ISO dialect options may be qualified with a language extension.

    Language Extensions:

    `+aglet`
        Select Aglet Modula-2 extensions, available with m2iso.
    `+gm2`
        Select GNU Modula-2 extensions, available with m2pim.
    `+p1`
        Select p1 Modula-2 extensions, available with m2iso.
    `+xds`
        Select XDS Modula-2 extensions, available with m2iso.


    Passing a Dialect Option via Unix Commandline Interface

    Dialect options may be passed to the lexer using the `dialect` key.
    Only one such option should be passed. If multiple dialect options are
    passed, the first valid option is used, any subsequent options are ignored.

    Examples:

    `$ pygmentize -O full,dialect=m2iso -f html -o /path/to/output /path/to/input`
        Use ISO dialect to render input to HTML output
    `$ pygmentize -O full,dialect=m2iso+p1 -f rtf -o /path/to/output /path/to/input`
        Use ISO dialect with p1 extensions to render input to RTF output


    Embedding a Dialect Option within a source file

    A dialect option may be embedded in a source file in form of a dialect
    tag, a specially formatted comment that specifies a dialect option.

    Dialect Tag EBNF::

       dialectTag :
           OpeningCommentDelim Prefix dialectOption ClosingCommentDelim ;

       dialectOption :
           'm2pim' | 'm2iso' | 'm2r10' | 'objm2' |
           'm2iso+aglet' | 'm2pim+gm2' | 'm2iso+p1' | 'm2iso+xds' ;

       Prefix : '!' ;

       OpeningCommentDelim : '(*' ;

       ClosingCommentDelim : '*)' ;

    No whitespace is permitted between the tokens of a dialect tag.

    In the event that a source file contains multiple dialect tags, the first
    tag that contains a valid dialect option will be used and any subsequent
    dialect tags will be ignored.  Ideally, a dialect tag should be placed
    at the beginning of a source file.

    An embedded dialect tag overrides a dialect option set via command line.

    Examples:

    ``(*!m2r10*) DEFINITION MODULE Foobar; ...``
        Use Modula2 R10 dialect to render this source file.
    ``(*!m2pim+gm2*) DEFINITION MODULE Bazbam; ...``
        Use PIM dialect with GNU extensions to render this source file.


    Algol Publication Mode:

    In Algol publication mode, source text is rendered for publication of
    algorithms in scientific papers and academic texts, following the format
    of the Revised Algol-60 Language Report.  It is activated by passing
    one of two corresponding styles as an option:

    `algol`
        render reserved words lowercase underline boldface
        and builtins lowercase boldface italic
    `algol_nu`
        render reserved words lowercase boldface (no underlining)
        and builtins lowercase boldface italic

    The lexer automatically performs the required lowercase conversion when
    this mode is activated.

    Example:

    ``$ pygmentize -O full,style=algol -f latex -o /path/to/output /path/to/input``
        Render input file in Algol publication mode to LaTeX output.


    Rendering Mode of First Class ADT Identifiers:

    The rendering of standard library first class ADT identifiers is controlled
    by option flag "treat_stdlib_adts_as_builtins".

    When this option is turned on, standard library ADT identifiers are rendered
    as builtins.  When it is turned off, they are rendered as ordinary library
    identifiers.

    `treat_stdlib_adts_as_builtins` (default: On)

    The option is useful for dialects that support ADTs as first class objects
    and provide ADTs in the standard library that would otherwise be built-in.

    At present, only Modula-2 R10 supports library ADTs as first class objects
    and therefore, no ADT identifiers are defined for any other dialects.

    Example:

    ``$ pygmentize -O full,dialect=m2r10,treat_stdlib_adts_as_builtins=Off ...``
        Render standard library ADTs as ordinary library types.

    .. versionchanged:: 2.1
       Added multi-dialect support.
    """
    name = 'Modula-2'
    url = 'http://www.modula2.org/'
    aliases = ['modula2', 'm2']
    filenames = ['*.def', '*.mod']
    mimetypes = ['text/x-modula2']
    version_added = '1.3'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'whitespace': [
            (r'\n+', Text),  # blank lines
            (r'\s+', Text),  # whitespace
        ],
        'dialecttags': [
            # PIM Dialect Tag
            (r'\(\*!m2pim\*\)', Comment.Special),
            # ISO Dialect Tag
            (r'\(\*!m2iso\*\)', Comment.Special),
            # M2R10 Dialect Tag
            (r'\(\*!m2r10\*\)', Comment.Special),
            # ObjM2 Dialect Tag
            (r'\(\*!objm2\*\)', Comment.Special),
            # Aglet Extensions Dialect Tag
            (r'\(\*!m2iso\+aglet\*\)', Comment.Special),
            # GNU Extensions Dialect Tag
            (r'\(\*!m2pim\+gm2\*\)', Comment.Special),
            # p1 Extensions Dialect Tag
            (r'\(\*!m2iso\+p1\*\)', Comment.Special),
            # XDS Extensions Dialect Tag
            (r'\(\*!m2iso\+xds\*\)', Comment.Special),
        ],
        'identifiers': [
            (r'([a-zA-Z_$][\w$]*)', Name),
        ],
        'prefixed_number_literals': [
            #
            # Base-2, whole number
            (r'0b[01]+(\'[01]+)*', Number.Bin),
            #
            # Base-16, whole number
            (r'0[ux][0-9A-F]+(\'[0-9A-F]+)*', Number.Hex),
        ],
        'plain_number_literals': [
            #
            # Base-10, real number with exponent
            (r'[0-9]+(\'[0-9]+)*'  # integral part
             r'\.[0-9]+(\'[0-9]+)*'  # fractional part
             r'[eE][+-]?[0-9]+(\'[0-9]+)*',  # exponent
             Number.Float),
            #
            # Base-10, real number without exponent
            (r'[0-9]+(\'[0-9]+)*'  # integral part
             r'\.[0-9]+(\'[0-9]+)*',  # fractional part
             Number.Float),
            #
            # Base-10, whole number
            (r'[0-9]+(\'[0-9]+)*', Number.Integer),
        ],
        'suffixed_number_literals': [
            #
            # Base-8, whole number
            (r'[0-7]+B', Number.Oct),
            #
            # Base-8, character code
            (r'[0-7]+C', Number.Oct),
            #
            # Base-16, number
            (r'[0-9A-F]+H', Number.Hex),
        ],
        'string_literals': [
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
        ],
        'digraph_operators': [
            # Dot Product Operator
            (r'\*\.', Operator),
            # Array Concatenation Operator
            (r'\+>', Operator),  # M2R10 + ObjM2
            # Inequality Operator
            (r'<>', Operator),  # ISO + PIM
            # Less-Or-Equal, Subset
            (r'<=', Operator),
            # Greater-Or-Equal, Superset
            (r'>=', Operator),
            # Identity Operator
            (r'==', Operator),  # M2R10 + ObjM2
            # Type Conversion Operator
            (r'::', Operator),  # M2R10 + ObjM2
            # Assignment Symbol
            (r':=', Operator),
            # Postfix Increment Mutator
            (r'\+\+', Operator),  # M2R10 + ObjM2
            # Postfix Decrement Mutator
            (r'--', Operator),  # M2R10 + ObjM2
        ],
        'unigraph_operators': [
            # Arithmetic Operators
            (r'[+-]', Operator),
            (r'[*/]', Operator),
            # ISO 80000-2 compliant Set Difference Operator
            (r'\\', Operator),  # M2R10 + ObjM2
            # Relational Operators
            (r'[=#<>]', Operator),
            # Dereferencing Operator
            (r'\^', Operator),
            # Dereferencing Operator Synonym
            (r'@', Operator),  # ISO
            # Logical AND Operator Synonym
            (r'&', Operator),  # PIM + ISO
            # Logical NOT Operator Synonym
            (r'~', Operator),  # PIM + ISO
            # Smalltalk Message Prefix
            (r'`', Operator),  # ObjM2
        ],
        'digraph_punctuation': [
            # Range Constructor
            (r'\.\.', Punctuation),
            # Opening Chevron Bracket
            (r'<<', Punctuation),  # M2R10 + ISO
            # Closing Chevron Bracket
            (r'>>', Punctuation),  # M2R10 + ISO
            # Blueprint Punctuation
            (r'->', Punctuation),  # M2R10 + ISO
            # Distinguish |# and # in M2 R10
            (r'\|#', Punctuation),
            # Distinguish ## and # in M2 R10
            (r'##', Punctuation),
            # Distinguish |* and * in M2 R10
            (r'\|\*', Punctuation),
        ],
        'unigraph_punctuation': [
            # Common Punctuation
            (r'[()\[\]{},.:;|]', Punctuation),
            # Case Label Separator Synonym
            (r'!', Punctuation),  # ISO
            # Blueprint Punctuation
            (r'\?', Punctuation),  # M2R10 + ObjM2
        ],
        'comments': [
            # Single Line Comment
            (r'^//.*?\n', Comment.Single),  # M2R10 + ObjM2
            # Block Comment
            (r'\(\*([^$].*?)\*\)', Comment.Multiline),
            # Template Block Comment
            (r'/\*(.*?)\*/', Comment.Multiline),  # M2R10 + ObjM2
        ],
        'pragmas': [
            # ISO Style Pragmas
            (r'<\*.*?\*>', Comment.Preproc),  # ISO, M2R10 + ObjM2
            # Pascal Style Pragmas
            (r'\(\*\$.*?\*\)', Comment.Preproc),  # PIM
        ],
        'root': [
            include('whitespace'),
            include('dialecttags'),
            include('pragmas'),
            include('comments'),
            include('identifiers'),
            include('suffixed_number_literals'),  # PIM + ISO
            include('prefixed_number_literals'),  # M2R10 + ObjM2
            include('plain_number_literals'),
            include('string_literals'),
            include('digraph_punctuation'),
            include('digraph_operators'),
            include('unigraph_punctuation'),
            include('unigraph_operators'),
        ]
    }

#  C o m m o n   D a t a s e t s

    # Common Reserved Words Dataset
    common_reserved_words = (
        # 37 common reserved words
        'AND', 'ARRAY', 'BEGIN', 'BY', 'CASE', 'CONST', 'DEFINITION', 'DIV',
        'DO', 'ELSE', 'ELSIF', 'END', 'EXIT', 'FOR', 'FROM', 'IF',
        'IMPLEMENTATION', 'IMPORT', 'IN', 'LOOP', 'MOD', 'MODULE', 'NOT',
        'OF', 'OR', 'POINTER', 'PROCEDURE', 'RECORD', 'REPEAT', 'RETURN',
        'SET', 'THEN', 'TO', 'TYPE', 'UNTIL', 'VAR', 'WHILE',
    )

    # Common Builtins Dataset
    common_builtins = (
        # 16 common builtins
        'ABS', 'BOOLEAN', 'CARDINAL', 'CHAR', 'CHR', 'FALSE', 'INTEGER',
        'LONGINT', 'LONGREAL', 'MAX', 'MIN', 'NIL', 'ODD', 'ORD', 'REAL',
        'TRUE',
    )

    # Common Pseudo-Module Builtins Dataset
    common_pseudo_builtins = (
        # 4 common pseudo builtins
        'ADDRESS', 'BYTE', 'WORD', 'ADR'
    )

#  P I M   M o d u l a - 2   D a t a s e t s

    # Lexemes to Mark as Error Tokens for PIM Modula-2
    pim_lexemes_to_reject = (
        '!', '`', '@', '$', '%', '?', '\\', '==', '++', '--', '::', '*.',
        '+>', '->', '<<', '>>', '|#', '##',
    )

    # PIM Modula-2 Additional Reserved Words Dataset
    pim_additional_reserved_words = (
        # 3 additional reserved words
        'EXPORT', 'QUALIFIED', 'WITH',
    )

    # PIM Modula-2 Additional Builtins Dataset
    pim_additional_builtins = (
        # 16 additional builtins
        'BITSET', 'CAP', 'DEC', 'DISPOSE', 'EXCL', 'FLOAT', 'HALT', 'HIGH',
        'INC', 'INCL', 'NEW', 'NIL', 'PROC', 'SIZE', 'TRUNC', 'VAL',
    )

    # PIM Modula-2 Additional Pseudo-Module Builtins Dataset
    pim_additional_pseudo_builtins = (
        # 5 additional pseudo builtins
        'SYSTEM', 'PROCESS', 'TSIZE', 'NEWPROCESS', 'TRANSFER',
    )

#  I S O   M o d u l a - 2   D a t a s e t s

    # Lexemes to Mark as Error Tokens for ISO Modula-2
    iso_lexemes_to_reject = (
        '`', '$', '%', '?', '\\', '==', '++', '--', '::', '*.', '+>', '->',
        '<<', '>>', '|#', '##',
    )

    # ISO Modula-2 Additional Reserved Words Dataset
    iso_additional_reserved_words = (
        # 9 additional reserved words (ISO 10514-1)
        'EXCEPT', 'EXPORT', 'FINALLY', 'FORWARD', 'PACKEDSET', 'QUALIFIED',
        'REM', 'RETRY', 'WITH',
        # 10 additional reserved words (ISO 10514-2 & ISO 10514-3)
        'ABSTRACT', 'AS', 'CLASS', 'GUARD', 'INHERIT', 'OVERRIDE', 'READONLY',
        'REVEAL', 'TRACED', 'UNSAFEGUARDED',
    )

    # ISO Modula-2 Additional Builtins Dataset
    iso_additional_builtins = (
        # 26 additional builtins (ISO 10514-1)
        'BITSET', 'CAP', 'CMPLX', 'COMPLEX', 'DEC', 'DISPOSE', 'EXCL', 'FLOAT',
        'HALT', 'HIGH', 'IM', 'INC', 'INCL', 'INT', 'INTERRUPTIBLE',  'LENGTH',
        'LFLOAT', 'LONGCOMPLEX', 'NEW', 'PROC', 'PROTECTION', 'RE', 'SIZE',
        'TRUNC', 'UNINTERRUBTIBLE', 'VAL',
        # 5 additional builtins (ISO 10514-2 & ISO 10514-3)
        'CREATE', 'DESTROY', 'EMPTY', 'ISMEMBER', 'SELF',
    )

    # ISO Modula-2 Additional Pseudo-Module Builtins Dataset
    iso_additional_pseudo_builtins = (
        # 14 additional builtins (SYSTEM)
        'SYSTEM', 'BITSPERLOC', 'LOCSPERBYTE', 'LOCSPERWORD', 'LOC',
        'ADDADR', 'SUBADR', 'DIFADR', 'MAKEADR', 'ADR',
        'ROTATE', 'SHIFT', 'CAST', 'TSIZE',
        # 13 additional builtins (COROUTINES)
        'COROUTINES', 'ATTACH', 'COROUTINE', 'CURRENT', 'DETACH', 'HANDLER',
        'INTERRUPTSOURCE', 'IOTRANSFER', 'IsATTACHED', 'LISTEN',
        'NEWCOROUTINE', 'PROT', 'TRANSFER',
        # 9 additional builtins (EXCEPTIONS)
        'EXCEPTIONS', 'AllocateSource', 'CurrentNumber', 'ExceptionNumber',
        'ExceptionSource', 'GetMessage', 'IsCurrentSource',
        'IsExceptionalExecution', 'RAISE',
        # 3 additional builtins (TERMINATION)
        'TERMINATION', 'IsTerminating', 'HasHalted',
        # 4 additional builtins (M2EXCEPTION)
        'M2EXCEPTION', 'M2Exceptions', 'M2Exception', 'IsM2Exception',
        'indexException', 'rangeException', 'caseSelectException',
        'invalidLocation', 'functionException', 'wholeValueException',
        'wholeDivException', 'realValueException', 'realDivException',
        'complexValueException', 'complexDivException', 'protException',
        'sysException', 'coException', 'exException',
    )

#  M o d u l a - 2   R 1 0   D a t a s e t s

    # Lexemes to Mark as Error Tokens for Modula-2 R10
    m2r10_lexemes_to_reject = (
        '!', '`', '@', '$', '%', '&', '<>',
    )

    # Modula-2 R10 reserved words in addition to the common set
    m2r10_additional_reserved_words = (
        # 12 additional reserved words
        'ALIAS', 'ARGLIST', 'BLUEPRINT', 'COPY', 'GENLIB', 'INDETERMINATE',
        'NEW', 'NONE', 'OPAQUE', 'REFERENTIAL', 'RELEASE', 'RETAIN',
        # 2 additional reserved words with symbolic assembly option
        'ASM', 'REG',
    )

    # Modula-2 R10 builtins in addition to the common set
    m2r10_additional_builtins = (
        # 26 additional builtins
        'CARDINAL', 'COUNT', 'EMPTY', 'EXISTS', 'INSERT', 'LENGTH', 'LONGCARD',
        'OCTET', 'PTR', 'PRED', 'READ', 'READNEW', 'REMOVE', 'RETRIEVE', 'SORT',
        'STORE', 'SUBSET', 'SUCC', 'TLIMIT', 'TMAX', 'TMIN', 'TRUE', 'TSIZE',
        'UNICHAR', 'WRITE', 'WRITEF',
    )

    # Modula-2 R10 Additional Pseudo-Module Builtins Dataset
    m2r10_additional_pseudo_builtins = (
        # 13 additional builtins (TPROPERTIES)
        'TPROPERTIES', 'PROPERTY', 'LITERAL', 'TPROPERTY', 'TLITERAL',
        'TBUILTIN', 'TDYN', 'TREFC', 'TNIL', 'TBASE', 'TPRECISION',
        'TMAXEXP', 'TMINEXP',
        # 4 additional builtins (CONVERSION)
        'CONVERSION', 'TSXFSIZE', 'SXF', 'VAL',
        # 35 additional builtins (UNSAFE)
        'UNSAFE', 'CAST', 'INTRINSIC', 'AVAIL', 'ADD', 'SUB', 'ADDC', 'SUBC',
        'FETCHADD', 'FETCHSUB', 'SHL', 'SHR', 'ASHR', 'ROTL', 'ROTR', 'ROTLC',
        'ROTRC', 'BWNOT', 'BWAND', 'BWOR', 'BWXOR', 'BWNAND', 'BWNOR',
        'SETBIT', 'TESTBIT', 'LSBIT', 'MSBIT', 'CSBITS', 'BAIL', 'HALT',
        'TODO', 'FFI', 'ADDR', 'VARGLIST', 'VARGC',
        # 11 additional builtins (ATOMIC)
        'ATOMIC', 'INTRINSIC', 'AVAIL', 'SWAP', 'CAS', 'INC', 'DEC', 'BWAND',
        'BWNAND', 'BWOR', 'BWXOR',
        # 7 additional builtins (COMPILER)
        'COMPILER', 'DEBUG', 'MODNAME', 'PROCNAME', 'LINENUM', 'DEFAULT',
        'HASH',
        # 5 additional builtins (ASSEMBLER)
        'ASSEMBLER', 'REGISTER', 'SETREG', 'GETREG', 'CODE',
    )

#  O b j e c t i v e   M o d u l a - 2   D a t a s e t s

    # Lexemes to Mark as Error Tokens for Objective Modula-2
    objm2_lexemes_to_reject = (
        '!', '$', '%', '&', '<>',
    )

    # Objective Modula-2 Extensions
    # reserved words in addition to Modula-2 R10
    objm2_additional_reserved_words = (
        # 16 additional reserved words
        'BYCOPY', 'BYREF', 'CLASS', 'CONTINUE', 'CRITICAL', 'INOUT', 'METHOD',
        'ON', 'OPTIONAL', 'OUT', 'PRIVATE', 'PROTECTED', 'PROTOCOL', 'PUBLIC',
        'SUPER', 'TRY',
    )

    # Objective Modula-2 Extensions
    # builtins in addition to Modula-2 R10
    objm2_additional_builtins = (
        # 3 additional builtins
        'OBJECT', 'NO', 'YES',
    )

    # Objective Modula-2 Extensions
    # pseudo-module builtins in addition to Modula-2 R10
    objm2_additional_pseudo_builtins = (
        # None
    )

#  A g l e t   M o d u l a - 2   D a t a s e t s

    # Aglet Extensions
    # reserved words in addition to ISO Modula-2
    aglet_additional_reserved_words = (
        # None
    )

    # Aglet Extensions
    # builtins in addition to ISO Modula-2
    aglet_additional_builtins = (
        # 9 additional builtins
        'BITSET8', 'BITSET16', 'BITSET32', 'CARDINAL8', 'CARDINAL16',
        'CARDINAL32', 'INTEGER8', 'INTEGER16', 'INTEGER32',
    )

    # Aglet Modula-2 Extensions
    # pseudo-module builtins in addition to ISO Modula-2
    aglet_additional_pseudo_builtins = (
        # None
    )

#  G N U   M o d u l a - 2   D a t a s e t s

    # GNU Extensions
    # reserved words in addition to PIM Modula-2
    gm2_additional_reserved_words = (
        # 10 additional reserved words
        'ASM', '__ATTRIBUTE__', '__BUILTIN__', '__COLUMN__', '__DATE__',
        '__FILE__', '__FUNCTION__', '__LINE__', '__MODULE__', 'VOLATILE',
    )

    # GNU Extensions
    # builtins in addition to PIM Modula-2
    gm2_additional_builtins = (
        # 21 additional builtins
        'BITSET8', 'BITSET16', 'BITSET32', 'CARDINAL8', 'CARDINAL16',
        'CARDINAL32', 'CARDINAL64', 'COMPLEX32', 'COMPLEX64', 'COMPLEX96',
        'COMPLEX128', 'INTEGER8', 'INTEGER16', 'INTEGER32', 'INTEGER64',
        'REAL8', 'REAL16', 'REAL32', 'REAL96', 'REAL128', 'THROW',
    )

    # GNU Extensions
    # pseudo-module builtins in addition to PIM Modula-2
    gm2_additional_pseudo_builtins = (
        # None
    )

#  p 1   M o d u l a - 2   D a t a s e t s

    # p1 Extensions
    # reserved words in addition to ISO Modula-2
    p1_additional_reserved_words = (
        # None
    )

    # p1 Extensions
    # builtins in addition to ISO Modula-2
    p1_additional_builtins = (
        # None
    )

    # p1 Modula-2 Extensions
    # pseudo-module builtins in addition to ISO Modula-2
    p1_additional_pseudo_builtins = (
        # 1 additional builtin
        'BCD',
    )

#  X D S   M o d u l a - 2   D a t a s e t s

    # XDS Extensions
    # reserved words in addition to ISO Modula-2
    xds_additional_reserved_words = (
        # 1 additional reserved word
        'SEQ',
    )

    # XDS Extensions
    # builtins in addition to ISO Modula-2
    xds_additional_builtins = (
        # 9 additional builtins
        'ASH', 'ASSERT', 'DIFFADR_TYPE', 'ENTIER', 'INDEX', 'LEN',
        'LONGCARD', 'SHORTCARD', 'SHORTINT',
    )

    # XDS Modula-2 Extensions
    # pseudo-module builtins in addition to ISO Modula-2
    xds_additional_pseudo_builtins = (
        # 22 additional builtins (SYSTEM)
        'PROCESS', 'NEWPROCESS', 'BOOL8', 'BOOL16', 'BOOL32', 'CARD8',
        'CARD16', 'CARD32', 'INT8', 'INT16', 'INT32', 'REF', 'MOVE',
        'FILL', 'GET', 'PUT', 'CC', 'int', 'unsigned', 'size_t', 'void'
        # 3 additional builtins (COMPILER)
        'COMPILER', 'OPTION', 'EQUATION'
    )

#  P I M   S t a n d a r d   L i b r a r y   D a t a s e t s

    # PIM Modula-2 Standard Library Modules Dataset
    pim_stdlib_module_identifiers = (
        'Terminal', 'FileSystem', 'InOut', 'RealInOut', 'MathLib0', 'Storage',
    )

    # PIM Modula-2 Standard Library Types Dataset
    pim_stdlib_type_identifiers = (
        'Flag', 'FlagSet', 'Response', 'Command', 'Lock', 'Permission',
        'MediumType', 'File', 'FileProc', 'DirectoryProc', 'FileCommand',
        'DirectoryCommand',
    )

    # PIM Modula-2 Standard Library Procedures Dataset
    pim_stdlib_proc_identifiers = (
        'Read', 'BusyRead', 'ReadAgain', 'Write', 'WriteString', 'WriteLn',
        'Create', 'Lookup', 'Close', 'Delete', 'Rename', 'SetRead', 'SetWrite',
        'SetModify', 'SetOpen', 'Doio', 'SetPos', 'GetPos', 'Length', 'Reset',
        'Again', 'ReadWord', 'WriteWord', 'ReadChar', 'WriteChar',
        'CreateMedium', 'DeleteMedium', 'AssignName', 'DeassignName',
        'ReadMedium', 'LookupMedium', 'OpenInput', 'OpenOutput', 'CloseInput',
        'CloseOutput', 'ReadString', 'ReadInt', 'ReadCard', 'ReadWrd',
        'WriteInt', 'WriteCard', 'WriteOct', 'WriteHex', 'WriteWrd',
        'ReadReal', 'WriteReal', 'WriteFixPt', 'WriteRealOct', 'sqrt', 'exp',
        'ln', 'sin', 'cos', 'arctan', 'entier', 'ALLOCATE', 'DEALLOCATE',
    )

    # PIM Modula-2 Standard Library Variables Dataset
    pim_stdlib_var_identifiers = (
        'Done', 'termCH', 'in', 'out'
    )

    # PIM Modula-2 Standard Library Constants Dataset
    pim_stdlib_const_identifiers = (
        'EOL',
    )

#  I S O   S t a n d a r d   L i b r a r y   D a t a s e t s

    # ISO Modula-2 Standard Library Modules Dataset
    iso_stdlib_module_identifiers = (
        # TO DO
    )

    # ISO Modula-2 Standard Library Types Dataset
    iso_stdlib_type_identifiers = (
        # TO DO
    )

    # ISO Modula-2 Standard Library Procedures Dataset
    iso_stdlib_proc_identifiers = (
        # TO DO
    )

    # ISO Modula-2 Standard Library Variables Dataset
    iso_stdlib_var_identifiers = (
        # TO DO
    )

    # ISO Modula-2 Standard Library Constants Dataset
    iso_stdlib_const_identifiers = (
        # TO DO
    )

#  M 2   R 1 0   S t a n d a r d   L i b r a r y   D a t a s e t s

    # Modula-2 R10 Standard Library ADTs Dataset
    m2r10_stdlib_adt_identifiers = (
        'BCD', 'LONGBCD', 'BITSET', 'SHORTBITSET', 'LONGBITSET',
        'LONGLONGBITSET', 'COMPLEX', 'LONGCOMPLEX', 'SHORTCARD', 'LONGLONGCARD',
        'SHORTINT', 'LONGLONGINT', 'POSINT', 'SHORTPOSINT', 'LONGPOSINT',
        'LONGLONGPOSINT', 'BITSET8', 'BITSET16', 'BITSET32', 'BITSET64',
        'BITSET128', 'BS8', 'BS16', 'BS32', 'BS64', 'BS128', 'CARDINAL8',
        'CARDINAL16', 'CARDINAL32', 'CARDINAL64', 'CARDINAL128', 'CARD8',
        'CARD16', 'CARD32', 'CARD64', 'CARD128', 'INTEGER8', 'INTEGER16',
        'INTEGER32', 'INTEGER64', 'INTEGER128', 'INT8', 'INT16', 'INT32',
        'INT64', 'INT128', 'STRING', 'UNISTRING',
    )

    # Modula-2 R10 Standard Library Blueprints Dataset
    m2r10_stdlib_blueprint_identifiers = (
        'ProtoRoot', 'ProtoComputational', 'ProtoNumeric', 'ProtoScalar',
        'ProtoNonScalar', 'ProtoCardinal', 'ProtoInteger', 'ProtoReal',
        'ProtoComplex', 'ProtoVector', 'ProtoTuple', 'ProtoCompArray',
        'ProtoCollection', 'ProtoStaticArray', 'ProtoStaticSet',
        'ProtoStaticString', 'ProtoArray', 'ProtoString', 'ProtoSet',
        'ProtoMultiSet', 'ProtoDictionary', 'ProtoMultiDict', 'ProtoExtension',
        'ProtoIO', 'ProtoCardMath', 'ProtoIntMath', 'ProtoRealMath',
    )

    # Modula-2 R10 Standard Library Modules Dataset
    m2r10_stdlib_module_identifiers = (
        'ASCII', 'BooleanIO', 'CharIO', 'UnicharIO', 'OctetIO',
        'CardinalIO', 'LongCardIO', 'IntegerIO', 'LongIntIO', 'RealIO',
        'LongRealIO', 'BCDIO', 'LongBCDIO', 'CardMath', 'LongCardMath',
        'IntMath', 'LongIntMath', 'RealMath', 'LongRealMath', 'BCDMath',
        'LongBCDMath', 'FileIO', 'FileSystem', 'Storage', 'IOSupport',
    )

    # Modula-2 R10 Standard Library Types Dataset
    m2r10_stdlib_type_identifiers = (
        'File', 'Status',
        # TO BE COMPLETED
    )

    # Modula-2 R10 Standard Library Procedures Dataset
    m2r10_stdlib_proc_identifiers = (
        'ALLOCATE', 'DEALLOCATE', 'SIZE',
        # TO BE COMPLETED
    )

    # Modula-2 R10 Standard Library Variables Dataset
    m2r10_stdlib_var_identifiers = (
        'stdIn', 'stdOut', 'stdErr',
    )

    # Modula-2 R10 Standard Library Constants Dataset
    m2r10_stdlib_const_identifiers = (
        'pi', 'tau',
    )

#  D i a l e c t s

    # Dialect modes
    dialects = (
        'unknown',
        'm2pim', 'm2iso', 'm2r10', 'objm2',
        'm2iso+aglet', 'm2pim+gm2', 'm2iso+p1', 'm2iso+xds',
    )

#   D a t a b a s e s

    # Lexemes to Mark as Errors Database
    lexemes_to_reject_db = {
        # Lexemes to reject for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Lexemes to reject for PIM Modula-2
        'm2pim': (
            pim_lexemes_to_reject,
        ),
        # Lexemes to reject for ISO Modula-2
        'm2iso': (
            iso_lexemes_to_reject,
        ),
        # Lexemes to reject for Modula-2 R10
        'm2r10': (
            m2r10_lexemes_to_reject,
        ),
        # Lexemes to reject for Objective Modula-2
        'objm2': (
            objm2_lexemes_to_reject,
        ),
        # Lexemes to reject for Aglet Modula-2
        'm2iso+aglet': (
            iso_lexemes_to_reject,
        ),
        # Lexemes to reject for GNU Modula-2
        'm2pim+gm2': (
            pim_lexemes_to_reject,
        ),
        # Lexemes to reject for p1 Modula-2
        'm2iso+p1': (
            iso_lexemes_to_reject,
        ),
        # Lexemes to reject for XDS Modula-2
        'm2iso+xds': (
            iso_lexemes_to_reject,
        ),
    }

    # Reserved Words Database
    reserved_words_db = {
        # Reserved words for unknown dialect
        'unknown': (
            common_reserved_words,
            pim_additional_reserved_words,
            iso_additional_reserved_words,
            m2r10_additional_reserved_words,
        ),

        # Reserved words for PIM Modula-2
        'm2pim': (
            common_reserved_words,
            pim_additional_reserved_words,
        ),

        # Reserved words for Modula-2 R10
        'm2iso': (
            common_reserved_words,
            iso_additional_reserved_words,
        ),

        # Reserved words for ISO Modula-2
        'm2r10': (
            common_reserved_words,
            m2r10_additional_reserved_words,
        ),

        # Reserved words for Objective Modula-2
        'objm2': (
            common_reserved_words,
            m2r10_additional_reserved_words,
            objm2_additional_reserved_words,
        ),

        # Reserved words for Aglet Modula-2 Extensions
        'm2iso+aglet': (
            common_reserved_words,
            iso_additional_reserved_words,
            aglet_additional_reserved_words,
        ),

        # Reserved words for GNU Modula-2 Extensions
        'm2pim+gm2': (
            common_reserved_words,
            pim_additional_reserved_words,
            gm2_additional_reserved_words,
        ),

        # Reserved words for p1 Modula-2 Extensions
        'm2iso+p1': (
            common_reserved_words,
            iso_additional_reserved_words,
            p1_additional_reserved_words,
        ),

        # Reserved words for XDS Modula-2 Extensions
        'm2iso+xds': (
            common_reserved_words,
            iso_additional_reserved_words,
            xds_additional_reserved_words,
        ),
    }

    # Builtins Database
    builtins_db = {
        # Builtins for unknown dialect
        'unknown': (
            common_builtins,
            pim_additional_builtins,
            iso_additional_builtins,
            m2r10_additional_builtins,
        ),

        # Builtins for PIM Modula-2
        'm2pim': (
            common_builtins,
            pim_additional_builtins,
        ),

        # Builtins for ISO Modula-2
        'm2iso': (
            common_builtins,
            iso_additional_builtins,
        ),

        # Builtins for ISO Modula-2
        'm2r10': (
            common_builtins,
            m2r10_additional_builtins,
        ),

        # Builtins for Objective Modula-2
        'objm2': (
            common_builtins,
            m2r10_additional_builtins,
            objm2_additional_builtins,
        ),

        # Builtins for Aglet Modula-2 Extensions
        'm2iso+aglet': (
            common_builtins,
            iso_additional_builtins,
            aglet_additional_builtins,
        ),

        # Builtins for GNU Modula-2 Extensions
        'm2pim+gm2': (
            common_builtins,
            pim_additional_builtins,
            gm2_additional_builtins,
        ),

        # Builtins for p1 Modula-2 Extensions
        'm2iso+p1': (
            common_builtins,
            iso_additional_builtins,
            p1_additional_builtins,
        ),

        # Builtins for XDS Modula-2 Extensions
        'm2iso+xds': (
            common_builtins,
            iso_additional_builtins,
            xds_additional_builtins,
        ),
    }

    # Pseudo-Module Builtins Database
    pseudo_builtins_db = {
        # Builtins for unknown dialect
        'unknown': (
            common_pseudo_builtins,
            pim_additional_pseudo_builtins,
            iso_additional_pseudo_builtins,
            m2r10_additional_pseudo_builtins,
        ),

        # Builtins for PIM Modula-2
        'm2pim': (
            common_pseudo_builtins,
            pim_additional_pseudo_builtins,
        ),

        # Builtins for ISO Modula-2
        'm2iso': (
            common_pseudo_builtins,
            iso_additional_pseudo_builtins,
        ),

        # Builtins for ISO Modula-2
        'm2r10': (
            common_pseudo_builtins,
            m2r10_additional_pseudo_builtins,
        ),

        # Builtins for Objective Modula-2
        'objm2': (
            common_pseudo_builtins,
            m2r10_additional_pseudo_builtins,
            objm2_additional_pseudo_builtins,
        ),

        # Builtins for Aglet Modula-2 Extensions
        'm2iso+aglet': (
            common_pseudo_builtins,
            iso_additional_pseudo_builtins,
            aglet_additional_pseudo_builtins,
        ),

        # Builtins for GNU Modula-2 Extensions
        'm2pim+gm2': (
            common_pseudo_builtins,
            pim_additional_pseudo_builtins,
            gm2_additional_pseudo_builtins,
        ),

        # Builtins for p1 Modula-2 Extensions
        'm2iso+p1': (
            common_pseudo_builtins,
            iso_additional_pseudo_builtins,
            p1_additional_pseudo_builtins,
        ),

        # Builtins for XDS Modula-2 Extensions
        'm2iso+xds': (
            common_pseudo_builtins,
            iso_additional_pseudo_builtins,
            xds_additional_pseudo_builtins,
        ),
    }

    # Standard Library ADTs Database
    stdlib_adts_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library ADTs for PIM Modula-2
        'm2pim': (
            # No first class library types
        ),

        # Standard Library ADTs for ISO Modula-2
        'm2iso': (
            # No first class library types
        ),

        # Standard Library ADTs for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_adt_identifiers,
        ),

        # Standard Library ADTs for Objective Modula-2
        'objm2': (
            m2r10_stdlib_adt_identifiers,
        ),

        # Standard Library ADTs for Aglet Modula-2
        'm2iso+aglet': (
            # No first class library types
        ),

        # Standard Library ADTs for GNU Modula-2
        'm2pim+gm2': (
            # No first class library types
        ),

        # Standard Library ADTs for p1 Modula-2
        'm2iso+p1': (
            # No first class library types
        ),

        # Standard Library ADTs for XDS Modula-2
        'm2iso+xds': (
            # No first class library types
        ),
    }

    # Standard Library Modules Database
    stdlib_modules_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library Modules for PIM Modula-2
        'm2pim': (
            pim_stdlib_module_identifiers,
        ),

        # Standard Library Modules for ISO Modula-2
        'm2iso': (
            iso_stdlib_module_identifiers,
        ),

        # Standard Library Modules for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_blueprint_identifiers,
            m2r10_stdlib_module_identifiers,
            m2r10_stdlib_adt_identifiers,
        ),

        # Standard Library Modules for Objective Modula-2
        'objm2': (
            m2r10_stdlib_blueprint_identifiers,
            m2r10_stdlib_module_identifiers,
        ),

        # Standard Library Modules for Aglet Modula-2
        'm2iso+aglet': (
            iso_stdlib_module_identifiers,
        ),

        # Standard Library Modules for GNU Modula-2
        'm2pim+gm2': (
            pim_stdlib_module_identifiers,
        ),

        # Standard Library Modules for p1 Modula-2
        'm2iso+p1': (
            iso_stdlib_module_identifiers,
        ),

        # Standard Library Modules for XDS Modula-2
        'm2iso+xds': (
            iso_stdlib_module_identifiers,
        ),
    }

    # Standard Library Types Database
    stdlib_types_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library Types for PIM Modula-2
        'm2pim': (
            pim_stdlib_type_identifiers,
        ),

        # Standard Library Types for ISO Modula-2
        'm2iso': (
            iso_stdlib_type_identifiers,
        ),

        # Standard Library Types for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_type_identifiers,
        ),

        # Standard Library Types for Objective Modula-2
        'objm2': (
            m2r10_stdlib_type_identifiers,
        ),

        # Standard Library Types for Aglet Modula-2
        'm2iso+aglet': (
            iso_stdlib_type_identifiers,
        ),

        # Standard Library Types for GNU Modula-2
        'm2pim+gm2': (
            pim_stdlib_type_identifiers,
        ),

        # Standard Library Types for p1 Modula-2
        'm2iso+p1': (
            iso_stdlib_type_identifiers,
        ),

        # Standard Library Types for XDS Modula-2
        'm2iso+xds': (
            iso_stdlib_type_identifiers,
        ),
    }

    # Standard Library Procedures Database
    stdlib_procedures_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library Procedures for PIM Modula-2
        'm2pim': (
            pim_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for ISO Modula-2
        'm2iso': (
            iso_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for Objective Modula-2
        'objm2': (
            m2r10_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for Aglet Modula-2
        'm2iso+aglet': (
            iso_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for GNU Modula-2
        'm2pim+gm2': (
            pim_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for p1 Modula-2
        'm2iso+p1': (
            iso_stdlib_proc_identifiers,
        ),

        # Standard Library Procedures for XDS Modula-2
        'm2iso+xds': (
            iso_stdlib_proc_identifiers,
        ),
    }

    # Standard Library Variables Database
    stdlib_variables_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library Variables for PIM Modula-2
        'm2pim': (
            pim_stdlib_var_identifiers,
        ),

        # Standard Library Variables for ISO Modula-2
        'm2iso': (
            iso_stdlib_var_identifiers,
        ),

        # Standard Library Variables for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_var_identifiers,
        ),

        # Standard Library Variables for Objective Modula-2
        'objm2': (
            m2r10_stdlib_var_identifiers,
        ),

        # Standard Library Variables for Aglet Modula-2
        'm2iso+aglet': (
            iso_stdlib_var_identifiers,
        ),

        # Standard Library Variables for GNU Modula-2
        'm2pim+gm2': (
            pim_stdlib_var_identifiers,
        ),

        # Standard Library Variables for p1 Modula-2
        'm2iso+p1': (
            iso_stdlib_var_identifiers,
        ),

        # Standard Library Variables for XDS Modula-2
        'm2iso+xds': (
            iso_stdlib_var_identifiers,
        ),
    }

    # Standard Library Constants Database
    stdlib_constants_db = {
        # Empty entry for unknown dialect
        'unknown': (
            # LEAVE THIS EMPTY
        ),
        # Standard Library Constants for PIM Modula-2
        'm2pim': (
            pim_stdlib_const_identifiers,
        ),

        # Standard Library Constants for ISO Modula-2
        'm2iso': (
            iso_stdlib_const_identifiers,
        ),

        # Standard Library Constants for Modula-2 R10
        'm2r10': (
            m2r10_stdlib_const_identifiers,
        ),

        # Standard Library Constants for Objective Modula-2
        'objm2': (
            m2r10_stdlib_const_identifiers,
        ),

        # Standard Library Constants for Aglet Modula-2
        'm2iso+aglet': (
            iso_stdlib_const_identifiers,
        ),

        # Standard Library Constants for GNU Modula-2
        'm2pim+gm2': (
            pim_stdlib_const_identifiers,
        ),

        # Standard Library Constants for p1 Modula-2
        'm2iso+p1': (
            iso_stdlib_const_identifiers,
        ),

        # Standard Library Constants for XDS Modula-2
        'm2iso+xds': (
            iso_stdlib_const_identifiers,
        ),
    }

#   M e t h o d s

    # initialise a lexer instance
    def __init__(self, **options):
        #
        # check dialect options
        #
        dialects = get_list_opt(options, 'dialect', [])
        #
        for dialect_option in dialects:
            if dialect_option in self.dialects[1:-1]:
                # valid dialect option found
                self.set_dialect(dialect_option)
                break
        #
        # Fallback Mode (DEFAULT)
        else:
            # no valid dialect option
            self.set_dialect('unknown')
        #
        self.dialect_set_by_tag = False
        #
        # check style options
        #
        styles = get_list_opt(options, 'style', [])
        #
        # use lowercase mode for Algol style
        if 'algol' in styles or 'algol_nu' in styles:
            self.algol_publication_mode = True
        else:
            self.algol_publication_mode = False
        #
        # Check option flags
        #
        self.treat_stdlib_adts_as_builtins = get_bool_opt(
            options, 'treat_stdlib_adts_as_builtins', True)
        #
        # call superclass initialiser
        RegexLexer.__init__(self, **options)

    # Set lexer to a specified dialect
    def set_dialect(self, dialect_id):
        #
        # if __debug__:
        #    print 'entered set_dialect with arg: ', dialect_id
        #
        # check dialect name against known dialects
        if dialect_id not in self.dialects:
            dialect = 'unknown'  # default
        else:
            dialect = dialect_id
        #
        # compose lexemes to reject set
        lexemes_to_reject_set = set()
        # add each list of reject lexemes for this dialect
        for list in self.lexemes_to_reject_db[dialect]:
            lexemes_to_reject_set.update(set(list))
        #
        # compose reserved words set
        reswords_set = set()
        # add each list of reserved words for this dialect
        for list in self.reserved_words_db[dialect]:
            reswords_set.update(set(list))
        #
        # compose builtins set
        builtins_set = set()
        # add each list of builtins for this dialect excluding reserved words
        for list in self.builtins_db[dialect]:
            builtins_set.update(set(list).difference(reswords_set))
        #
        # compose pseudo-builtins set
        pseudo_builtins_set = set()
        # add each list of builtins for this dialect excluding reserved words
        for list in self.pseudo_builtins_db[dialect]:
            pseudo_builtins_set.update(set(list).difference(reswords_set))
        #
        # compose ADTs set
        adts_set = set()
        # add each list of ADTs for this dialect excluding reserved words
        for list in self.stdlib_adts_db[dialect]:
            adts_set.update(set(list).difference(reswords_set))
        #
        # compose modules set
        modules_set = set()
        # add each list of builtins for this dialect excluding builtins
        for list in self.stdlib_modules_db[dialect]:
            modules_set.update(set(list).difference(builtins_set))
        #
        # compose types set
        types_set = set()
        # add each list of types for this dialect excluding builtins
        for list in self.stdlib_types_db[dialect]:
            types_set.update(set(list).difference(builtins_set))
        #
        # compose procedures set
        procedures_set = set()
        # add each list of procedures for this dialect excluding builtins
        for list in self.stdlib_procedures_db[dialect]:
            procedures_set.update(set(list).difference(builtins_set))
        #
        # compose variables set
        variables_set = set()
        # add each list of variables for this dialect excluding builtins
        for list in self.stdlib_variables_db[dialect]:
            variables_set.update(set(list).difference(builtins_set))
        #
        # compose constants set
        constants_set = set()
        # add each list of constants for this dialect excluding builtins
        for list in self.stdlib_constants_db[dialect]:
            constants_set.update(set(list).difference(builtins_set))
        #
        # update lexer state
        self.dialect = dialect
        self.lexemes_to_reject = lexemes_to_reject_set
        self.reserved_words = reswords_set
        self.builtins = builtins_set
        self.pseudo_builtins = pseudo_builtins_set
        self.adts = adts_set
        self.modules = modules_set
        self.types = types_set
        self.procedures = procedures_set
        self.variables = variables_set
        self.constants = constants_set
        #
        # if __debug__:
        #    print 'exiting set_dialect'
        #    print ' self.dialect: ', self.dialect
        #    print ' self.lexemes_to_reject: ', self.lexemes_to_reject
        #    print ' self.reserved_words: ', self.reserved_words
        #    print ' self.builtins: ', self.builtins
        #    print ' self.pseudo_builtins: ', self.pseudo_builtins
        #    print ' self.adts: ', self.adts
        #    print ' self.modules: ', self.modules
        #    print ' self.types: ', self.types
        #    print ' self.procedures: ', self.procedures
        #    print ' self.variables: ', self.variables
        #    print ' self.types: ', self.types
        #    print ' self.constants: ', self.constants

    # Extracts a dialect name from a dialect tag comment string  and checks
    # the extracted name against known dialects.  If a match is found,  the
    # matching name is returned, otherwise dialect id 'unknown' is returned
    def get_dialect_from_dialect_tag(self, dialect_tag):
        #
        # if __debug__:
        #    print 'entered get_dialect_from_dialect_tag with arg: ', dialect_tag
        #
        # constants
        left_tag_delim = '(*!'
        right_tag_delim = '*)'
        left_tag_delim_len = len(left_tag_delim)
        right_tag_delim_len = len(right_tag_delim)
        indicator_start = left_tag_delim_len
        indicator_end = -(right_tag_delim_len)
        #
        # check comment string for dialect indicator
        if len(dialect_tag) > (left_tag_delim_len + right_tag_delim_len) \
           and dialect_tag.startswith(left_tag_delim) \
           and dialect_tag.endswith(right_tag_delim):
            #
            # if __debug__:
            #    print 'dialect tag found'
            #
            # extract dialect indicator
            indicator = dialect_tag[indicator_start:indicator_end]
            #
            # if __debug__:
            #    print 'extracted: ', indicator
            #
            # check against known dialects
            for index in range(1, len(self.dialects)):
                #
                # if __debug__:
                #    print 'dialects[', index, ']: ', self.dialects[index]
                #
                if indicator == self.dialects[index]:
                    #
                    # if __debug__:
                    #    print 'matching dialect found'
                    #
                    # indicator matches known dialect
                    return indicator
            else:
                # indicator does not match any dialect
                return 'unknown'  # default
        else:
            # invalid indicator string
            return 'unknown'  # default

    # intercept the token stream, modify token attributes and return them
    def get_tokens_unprocessed(self, text):
        for index, token, value in RegexLexer.get_tokens_unprocessed(self, text):
            #
            # check for dialect tag if dialect has not been set by tag
            if not self.dialect_set_by_tag and token == Comment.Special:
                indicated_dialect = self.get_dialect_from_dialect_tag(value)
                if indicated_dialect != 'unknown':
                    # token is a dialect indicator
                    # reset reserved words and builtins
                    self.set_dialect(indicated_dialect)
                    self.dialect_set_by_tag = True
            #
            # check for reserved words, predefined and stdlib identifiers
            if token is Name:
                if value in self.reserved_words:
                    token = Keyword.Reserved
                    if self.algol_publication_mode:
                        value = value.lower()
                #
                elif value in self.builtins:
                    token = Name.Builtin
                    if self.algol_publication_mode:
                        value = value.lower()
                #
                elif value in self.pseudo_builtins:
                    token = Name.Builtin.Pseudo
                    if self.algol_publication_mode:
                        value = value.lower()
                #
                elif value in self.adts:
                    if not self.treat_stdlib_adts_as_builtins:
                        token = Name.Namespace
                    else:
                        token = Name.Builtin.Pseudo
                        if self.algol_publication_mode:
                            value = value.lower()
                #
                elif value in self.modules:
                    token = Name.Namespace
                #
                elif value in self.types:
                    token = Name.Class
                #
                elif value in self.procedures:
                    token = Name.Function
                #
                elif value in self.variables:
                    token = Name.Variable
                #
                elif value in self.constants:
                    token = Name.Constant
            #
            elif token in Number:
                #
                # mark prefix number literals as error for PIM and ISO dialects
                if self.dialect not in ('unknown', 'm2r10', 'objm2'):
                    if "'" in value or value[0:2] in ('0b', '0x', '0u'):
                        token = Error
                #
                elif self.dialect in ('m2r10', 'objm2'):
                    # mark base-8 number literals as errors for M2 R10 and ObjM2
                    if token is Number.Oct:
                        token = Error
                    # mark suffix base-16 literals as errors for M2 R10 and ObjM2
                    elif token is Number.Hex and 'H' in value:
                        token = Error
                    # mark real numbers with E as errors for M2 R10 and ObjM2
                    elif token is Number.Float and 'E' in value:
                        token = Error
            #
            elif token in Comment:
                #
                # mark single line comment as error for PIM and ISO dialects
                if token is Comment.Single:
                    if self.dialect not in ('unknown', 'm2r10', 'objm2'):
                        token = Error
                #
                if token is Comment.Preproc:
                    # mark ISO pragma as error for PIM dialects
                    if value.startswith('<*') and \
                       self.dialect.startswith('m2pim'):
                        token = Error
                    # mark PIM pragma as comment for other dialects
                    elif value.startswith('(*$') and \
                            self.dialect != 'unknown' and \
                            not self.dialect.startswith('m2pim'):
                        token = Comment.Multiline
            #
            else:  # token is neither Name nor Comment
                #
                # mark lexemes matching the dialect's error token set as errors
                if value in self.lexemes_to_reject:
                    token = Error
                #
                # substitute lexemes when in Algol mode
                if self.algol_publication_mode:
                    if value == '#':
                        value = '≠'
                    elif value == '<=':
                        value = '≤'
                    elif value == '>=':
                        value = '≥'
                    elif value == '==':
                        value = '≡'
                    elif value == '*.':
                        value = '•'

            # return result
            yield index, token, value

    def analyse_text(text):
        """It's Pascal-like, but does not use FUNCTION -- uses PROCEDURE
        instead."""

        # Check if this looks like Pascal, if not, bail out early
        if not ('(*' in text and '*)' in text and ':=' in text):
            return

        result = 0
        # Procedure is in Modula2
        if re.search(r'\bPROCEDURE\b', text):
            result += 0.6

        # FUNCTION is only valid in Pascal, but not in Modula2
        if re.search(r'\bFUNCTION\b', text):
            result = 0.0

        return result
