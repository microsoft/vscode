"""
    pygments.lexers.business
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for "business-oriented" languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include, words, bygroups
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Error, Whitespace

from erdos._vendor.pygments.lexers._openedge_builtins import OPENEDGEKEYWORDS

__all__ = ['CobolLexer', 'CobolFreeformatLexer', 'ABAPLexer', 'OpenEdgeLexer',
           'GoodDataCLLexer', 'MaqlLexer']


class CobolLexer(RegexLexer):
    """
    Lexer for OpenCOBOL code.
    """
    name = 'COBOL'
    aliases = ['cobol']
    filenames = ['*.cob', '*.COB', '*.cpy', '*.CPY']
    mimetypes = ['text/x-cobol']
    url = 'https://en.wikipedia.org/wiki/COBOL'
    version_added = '1.6'

    flags = re.IGNORECASE | re.MULTILINE

    # Data Types: by PICTURE and USAGE
    # Operators: **, *, +, -, /, <, >, <=, >=, =, <>
    # Logical (?): NOT, AND, OR

    # Reserved words:
    # http://opencobol.add1tocobol.com/#reserved-words
    # Intrinsics:
    # http://opencobol.add1tocobol.com/#does-opencobol-implement-any-intrinsic-functions

    tokens = {
        'root': [
            include('comment'),
            include('strings'),
            include('core'),
            include('nums'),
            (r'[a-z0-9]([\w\-]*[a-z0-9]+)?', Name.Variable),
            # (r'[\s]+', Text),
            (r'[ \t]+', Whitespace),
        ],
        'comment': [
            (r'(^.{6}[*/].*\n|^.{6}|\*>.*\n)', Comment),
        ],
        'core': [
            # Figurative constants
            (r'(^|(?<=[^\w\-]))(ALL\s+)?'
             r'((ZEROES)|(HIGH-VALUE|LOW-VALUE|QUOTE|SPACE|ZERO)(S)?)'
             r'\s*($|(?=[^\w\-]))',
             Name.Constant),

            # Reserved words STATEMENTS and other bolds
            (words((
                'ACCEPT', 'ADD', 'ALLOCATE', 'CALL', 'CANCEL', 'CLOSE', 'COMPUTE',
                'CONFIGURATION', 'CONTINUE', 'DATA', 'DELETE', 'DISPLAY', 'DIVIDE',
                'DIVISION', 'ELSE', 'END', 'END-ACCEPT',
                'END-ADD', 'END-CALL', 'END-COMPUTE', 'END-DELETE', 'END-DISPLAY',
                'END-DIVIDE', 'END-EVALUATE', 'END-IF', 'END-MULTIPLY', 'END-OF-PAGE',
                'END-PERFORM', 'END-READ', 'END-RETURN', 'END-REWRITE', 'END-SEARCH',
                'END-START', 'END-STRING', 'END-SUBTRACT', 'END-UNSTRING', 'END-WRITE',
                'ENVIRONMENT', 'EVALUATE', 'EXIT', 'FD', 'FILE', 'FILE-CONTROL', 'FOREVER',
                'FREE', 'GENERATE', 'GO', 'GOBACK', 'IDENTIFICATION', 'IF', 'INITIALIZE',
                'INITIATE', 'INPUT-OUTPUT', 'INSPECT', 'INVOKE', 'I-O-CONTROL', 'LINKAGE',
                'LOCAL-STORAGE', 'MERGE', 'MOVE', 'MULTIPLY', 'OPEN', 'PERFORM',
                'PROCEDURE', 'PROGRAM-ID', 'RAISE', 'READ', 'RELEASE', 'RESUME',
                'RETURN', 'REWRITE', 'SCREEN', 'SD', 'SEARCH', 'SECTION', 'SET',
                'SORT', 'START', 'STOP', 'STRING', 'SUBTRACT', 'SUPPRESS',
                'TERMINATE', 'THEN', 'UNLOCK', 'UNSTRING', 'USE', 'VALIDATE',
                'WORKING-STORAGE', 'WRITE'), prefix=r'(^|(?<=[^\w\-]))',
                suffix=r'\s*($|(?=[^\w\-]))'),
             Keyword.Reserved),

            # Reserved words
            (words((
                'ACCESS', 'ADDRESS', 'ADVANCING', 'AFTER', 'ALL',
                'ALPHABET', 'ALPHABETIC', 'ALPHABETIC-LOWER', 'ALPHABETIC-UPPER',
                'ALPHANUMERIC', 'ALPHANUMERIC-EDITED', 'ALSO', 'ALTER', 'ALTERNATE'
                'ANY', 'ARE', 'AREA', 'AREAS', 'ARGUMENT-NUMBER', 'ARGUMENT-VALUE', 'AS',
                'ASCENDING', 'ASSIGN', 'AT', 'AUTO', 'AUTO-SKIP', 'AUTOMATIC',
                'AUTOTERMINATE', 'BACKGROUND-COLOR', 'BASED', 'BEEP', 'BEFORE', 'BELL',
                'BLANK', 'BLINK', 'BLOCK', 'BOTTOM', 'BY', 'BYTE-LENGTH', 'CHAINING',
                'CHARACTER', 'CHARACTERS', 'CLASS', 'CODE', 'CODE-SET', 'COL',
                'COLLATING', 'COLS', 'COLUMN', 'COLUMNS', 'COMMA', 'COMMAND-LINE',
                'COMMIT', 'COMMON', 'CONSTANT', 'CONTAINS', 'CONTENT', 'CONTROL',
                'CONTROLS', 'CONVERTING', 'COPY', 'CORR', 'CORRESPONDING', 'COUNT', 'CRT',
                'CURRENCY', 'CURSOR', 'CYCLE', 'DATE', 'DAY', 'DAY-OF-WEEK', 'DE',
                'DEBUGGING', 'DECIMAL-POINT', 'DECLARATIVES', 'DEFAULT', 'DELIMITED',
                'DELIMITER', 'DEPENDING', 'DESCENDING', 'DETAIL', 'DISK',
                'DOWN', 'DUPLICATES', 'DYNAMIC', 'EBCDIC',
                'ENTRY', 'ENVIRONMENT-NAME', 'ENVIRONMENT-VALUE', 'EOL', 'EOP',
                'EOS', 'ERASE', 'ERROR', 'ESCAPE', 'EXCEPTION',
                'EXCLUSIVE', 'EXTEND', 'EXTERNAL', 'FILE-ID', 'FILLER', 'FINAL',
                'FIRST', 'FIXED', 'FLOAT-LONG', 'FLOAT-SHORT',
                'FOOTING', 'FOR', 'FOREGROUND-COLOR', 'FORMAT', 'FROM', 'FULL',
                'FUNCTION', 'FUNCTION-ID', 'GIVING', 'GLOBAL', 'GROUP',
                'HEADING', 'HIGHLIGHT', 'I-O', 'ID',
                'IGNORE', 'IGNORING', 'IN', 'INDEX', 'INDEXED', 'INDICATE',
                'INITIAL', 'INITIALIZED', 'INPUT', 'INTO', 'INTRINSIC', 'INVALID',
                'IS', 'JUST', 'JUSTIFIED', 'KEY', 'LABEL',
                'LAST', 'LEADING', 'LEFT', 'LENGTH', 'LIMIT', 'LIMITS', 'LINAGE',
                'LINAGE-COUNTER', 'LINE', 'LINES', 'LOCALE', 'LOCK',
                'LOWLIGHT', 'MANUAL', 'MEMORY', 'MINUS', 'MODE', 'MULTIPLE',
                'NATIONAL', 'NATIONAL-EDITED', 'NATIVE', 'NEGATIVE', 'NEXT', 'NO',
                'NULL', 'NULLS', 'NUMBER', 'NUMBERS', 'NUMERIC', 'NUMERIC-EDITED',
                'OBJECT-COMPUTER', 'OCCURS', 'OF', 'OFF', 'OMITTED', 'ON', 'ONLY',
                'OPTIONAL', 'ORDER', 'ORGANIZATION', 'OTHER', 'OUTPUT', 'OVERFLOW',
                'OVERLINE', 'PACKED-DECIMAL', 'PADDING', 'PAGE', 'PARAGRAPH',
                'PLUS', 'POINTER', 'POSITION', 'POSITIVE', 'PRESENT', 'PREVIOUS',
                'PRINTER', 'PRINTING', 'PROCEDURE-POINTER', 'PROCEDURES',
                'PROCEED', 'PROGRAM', 'PROGRAM-POINTER', 'PROMPT', 'QUOTE',
                'QUOTES', 'RANDOM', 'RD', 'RECORD', 'RECORDING', 'RECORDS', 'RECURSIVE',
                'REDEFINES', 'REEL', 'REFERENCE', 'RELATIVE', 'REMAINDER', 'REMOVAL',
                'RENAMES', 'REPLACING', 'REPORT', 'REPORTING', 'REPORTS', 'REPOSITORY',
                'REQUIRED', 'RESERVE', 'RETURNING', 'REVERSE-VIDEO', 'REWIND',
                'RIGHT', 'ROLLBACK', 'ROUNDED', 'RUN', 'SAME', 'SCROLL',
                'SECURE', 'SEGMENT-LIMIT', 'SELECT', 'SENTENCE', 'SEPARATE',
                'SEQUENCE', 'SEQUENTIAL', 'SHARING', 'SIGN', 'SIGNED', 'SIGNED-INT',
                'SIGNED-LONG', 'SIGNED-SHORT', 'SIZE', 'SORT-MERGE', 'SOURCE',
                'SOURCE-COMPUTER', 'SPECIAL-NAMES', 'STANDARD',
                'STANDARD-1', 'STANDARD-2', 'STATUS', 'SUBKEY', 'SUM',
                'SYMBOLIC', 'SYNC', 'SYNCHRONIZED', 'TALLYING', 'TAPE',
                'TEST', 'THROUGH', 'THRU', 'TIME', 'TIMES', 'TO', 'TOP', 'TRAILING',
                'TRANSFORM', 'TYPE', 'UNDERLINE', 'UNIT', 'UNSIGNED',
                'UNSIGNED-INT', 'UNSIGNED-LONG', 'UNSIGNED-SHORT', 'UNTIL', 'UP',
                'UPDATE', 'UPON', 'USAGE', 'USING', 'VALUE', 'VALUES', 'VARYING',
                'WAIT', 'WHEN', 'WITH', 'WORDS', 'YYYYDDD', 'YYYYMMDD'),
                prefix=r'(^|(?<=[^\w\-]))', suffix=r'\s*($|(?=[^\w\-]))'),
             Keyword.Pseudo),

            # inactive reserved words
            (words((
                'ACTIVE-CLASS', 'ALIGNED', 'ANYCASE', 'ARITHMETIC', 'ATTRIBUTE',
                'B-AND', 'B-NOT', 'B-OR', 'B-XOR', 'BIT', 'BOOLEAN', 'CD', 'CENTER',
                'CF', 'CH', 'CHAIN', 'CLASS-ID', 'CLASSIFICATION', 'COMMUNICATION',
                'CONDITION', 'DATA-POINTER', 'DESTINATION', 'DISABLE', 'EC', 'EGI',
                'EMI', 'ENABLE', 'END-RECEIVE', 'ENTRY-CONVENTION', 'EO', 'ESI',
                'EXCEPTION-OBJECT', 'EXPANDS', 'FACTORY', 'FLOAT-BINARY-16',
                'FLOAT-BINARY-34', 'FLOAT-BINARY-7', 'FLOAT-DECIMAL-16',
                'FLOAT-DECIMAL-34', 'FLOAT-EXTENDED', 'FORMAT', 'FUNCTION-POINTER',
                'GET', 'GROUP-USAGE', 'IMPLEMENTS', 'INFINITY', 'INHERITS',
                'INTERFACE', 'INTERFACE-ID', 'INVOKE', 'LC_ALL', 'LC_COLLATE',
                'LC_CTYPE', 'LC_MESSAGES', 'LC_MONETARY', 'LC_NUMERIC', 'LC_TIME',
                'LINE-COUNTER', 'MESSAGE', 'METHOD', 'METHOD-ID', 'NESTED', 'NONE',
                'NORMAL', 'OBJECT', 'OBJECT-REFERENCE', 'OPTIONS', 'OVERRIDE',
                'PAGE-COUNTER', 'PF', 'PH', 'PROPERTY', 'PROTOTYPE', 'PURGE',
                'QUEUE', 'RAISE', 'RAISING', 'RECEIVE', 'RELATION', 'REPLACE',
                'REPRESENTS-NOT-A-NUMBER', 'RESET', 'RESUME', 'RETRY', 'RF', 'RH',
                'SECONDS', 'SEGMENT', 'SELF', 'SEND', 'SOURCES', 'STATEMENT',
                'STEP', 'STRONG', 'SUB-QUEUE-1', 'SUB-QUEUE-2', 'SUB-QUEUE-3',
                'SUPER', 'SYMBOL', 'SYSTEM-DEFAULT', 'TABLE', 'TERMINAL', 'TEXT',
                'TYPEDEF', 'UCS-4', 'UNIVERSAL', 'USER-DEFAULT', 'UTF-16', 'UTF-8',
                'VAL-STATUS', 'VALID', 'VALIDATE', 'VALIDATE-STATUS'),
                   prefix=r'(^|(?<=[^\w\-]))', suffix=r'\s*($|(?=[^\w\-]))'),
             Error),

            # Data Types
            (r'(^|(?<=[^\w\-]))'
             r'(PIC\s+.+?(?=(\s|\.\s))|PICTURE\s+.+?(?=(\s|\.\s))|'
             r'(COMPUTATIONAL)(-[1-5X])?|(COMP)(-[1-5X])?|'
             r'BINARY-C-LONG|'
             r'BINARY-CHAR|BINARY-DOUBLE|BINARY-LONG|BINARY-SHORT|'
             r'BINARY)\s*($|(?=[^\w\-]))', Keyword.Type),

            # Operators
            (r'(\*\*|\*|\+|-|/|<=|>=|<|>|==|/=|=)', Operator),

            # (r'(::)', Keyword.Declaration),

            (r'([(),;:&%.])', Punctuation),

            # Intrinsics
            (r'(^|(?<=[^\w\-]))(ABS|ACOS|ANNUITY|ASIN|ATAN|BYTE-LENGTH|'
             r'CHAR|COMBINED-DATETIME|CONCATENATE|COS|CURRENT-DATE|'
             r'DATE-OF-INTEGER|DATE-TO-YYYYMMDD|DAY-OF-INTEGER|DAY-TO-YYYYDDD|'
             r'EXCEPTION-(?:FILE|LOCATION|STATEMENT|STATUS)|EXP10|EXP|E|'
             r'FACTORIAL|FRACTION-PART|INTEGER-OF-(?:DATE|DAY|PART)|INTEGER|'
             r'LENGTH|LOCALE-(?:DATE|TIME(?:-FROM-SECONDS)?)|LOG(?:10)?|'
             r'LOWER-CASE|MAX|MEAN|MEDIAN|MIDRANGE|MIN|MOD|NUMVAL(?:-C)?|'
             r'ORD(?:-MAX|-MIN)?|PI|PRESENT-VALUE|RANDOM|RANGE|REM|REVERSE|'
             r'SECONDS-FROM-FORMATTED-TIME|SECONDS-PAST-MIDNIGHT|SIGN|SIN|SQRT|'
             r'STANDARD-DEVIATION|STORED-CHAR-LENGTH|SUBSTITUTE(?:-CASE)?|'
             r'SUM|TAN|TEST-DATE-YYYYMMDD|TEST-DAY-YYYYDDD|TRIM|'
             r'UPPER-CASE|VARIANCE|WHEN-COMPILED|YEAR-TO-YYYY)\s*'
             r'($|(?=[^\w\-]))', Name.Function),

            # Booleans
            (r'(^|(?<=[^\w\-]))(true|false)\s*($|(?=[^\w\-]))', Name.Builtin),
            # Comparing Operators
            (r'(^|(?<=[^\w\-]))(equal|equals|ne|lt|le|gt|ge|'
             r'greater|less|than|not|and|or)\s*($|(?=[^\w\-]))', Operator.Word),
        ],

        # \"[^\"\n]*\"|\'[^\'\n]*\'
        'strings': [
            # apparently strings can be delimited by EOL if they are continued
            # in the next line
            (r'"[^"\n]*("|\n)', String.Double),
            (r"'[^'\n]*('|\n)", String.Single),
        ],

        'nums': [
            (r'\d+(\s*|\.$|$)', Number.Integer),
            (r'[+-]?\d*\.\d+(E[-+]?\d+)?', Number.Float),
            (r'[+-]?\d+\.\d*(E[-+]?\d+)?', Number.Float),
        ],
    }


class CobolFreeformatLexer(CobolLexer):
    """
    Lexer for Free format OpenCOBOL code.
    """
    name = 'COBOLFree'
    aliases = ['cobolfree']
    filenames = ['*.cbl', '*.CBL']
    mimetypes = []
    url = 'https://opencobol.add1tocobol.com'
    version_added = '1.6'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'comment': [
            (r'(\*>.*\n|^\w*\*.*$)', Comment),
        ],
    }


class ABAPLexer(RegexLexer):
    """
    Lexer for ABAP, SAP's integrated language.
    """
    name = 'ABAP'
    aliases = ['abap']
    filenames = ['*.abap', '*.ABAP']
    mimetypes = ['text/x-abap']
    url = 'https://community.sap.com/topics/abap'
    version_added = '1.1'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'common': [
            (r'\s+', Whitespace),
            (r'^\*.*$', Comment.Single),
            (r'\".*?\n', Comment.Single),
            (r'##\w+', Comment.Special),
        ],
        'variable-names': [
            (r'<\S+>', Name.Variable),
            (r'\w[\w~]*(?:(\[\])|->\*)?', Name.Variable),
        ],
        'root': [
            include('common'),
            # function calls
            (r'CALL\s+(?:BADI|CUSTOMER-FUNCTION|FUNCTION)',
             Keyword),
            (r'(CALL\s+(?:DIALOG|SCREEN|SUBSCREEN|SELECTION-SCREEN|'
             r'TRANSACTION|TRANSFORMATION))\b',
             Keyword),
            (r'(FORM|PERFORM)(\s+)(\w+)',
             bygroups(Keyword, Whitespace, Name.Function)),
            (r'(PERFORM)(\s+)(\()(\w+)(\))',
             bygroups(Keyword, Whitespace, Punctuation, Name.Variable, Punctuation)),
            (r'(MODULE)(\s+)(\S+)(\s+)(INPUT|OUTPUT)',
             bygroups(Keyword, Whitespace, Name.Function, Whitespace, Keyword)),

            # method implementation
            (r'(METHOD)(\s+)([\w~]+)',
             bygroups(Keyword, Whitespace, Name.Function)),
            # method calls
            (r'(\s+)([\w\-]+)([=\-]>)([\w\-~]+)',
             bygroups(Whitespace, Name.Variable, Operator, Name.Function)),
            # call methodnames returning style
            (r'(?<=(=|-)>)([\w\-~]+)(?=\()', Name.Function),

            # text elements
            (r'(TEXT)(-)(\d{3})',
             bygroups(Keyword, Punctuation, Number.Integer)),
            (r'(TEXT)(-)(\w{3})',
             bygroups(Keyword, Punctuation, Name.Variable)),

            # keywords with dashes in them.
            # these need to be first, because for instance the -ID part
            # of MESSAGE-ID wouldn't get highlighted if MESSAGE was
            # first in the list of keywords.
            (r'(ADD-CORRESPONDING|AUTHORITY-CHECK|'
             r'CLASS-DATA|CLASS-EVENTS|CLASS-METHODS|CLASS-POOL|'
             r'DELETE-ADJACENT|DIVIDE-CORRESPONDING|'
             r'EDITOR-CALL|ENHANCEMENT-POINT|ENHANCEMENT-SECTION|EXIT-COMMAND|'
             r'FIELD-GROUPS|FIELD-SYMBOLS|FIELD-SYMBOL|FUNCTION-POOL|'
             r'INTERFACE-POOL|INVERTED-DATE|'
             r'LOAD-OF-PROGRAM|LOG-POINT|'
             r'MESSAGE-ID|MOVE-CORRESPONDING|MULTIPLY-CORRESPONDING|'
             r'NEW-LINE|NEW-PAGE|NEW-SECTION|NO-EXTENSION|'
             r'OUTPUT-LENGTH|PRINT-CONTROL|'
             r'SELECT-OPTIONS|START-OF-SELECTION|SUBTRACT-CORRESPONDING|'
             r'SYNTAX-CHECK|SYSTEM-EXCEPTIONS|'
             r'TYPE-POOL|TYPE-POOLS|NO-DISPLAY'
             r')\b', Keyword),

            # keyword kombinations
            (r'(?<![-\>])(CREATE\s+(PUBLIC|PRIVATE|DATA|OBJECT)|'
             r'(PUBLIC|PRIVATE|PROTECTED)\s+SECTION|'
             r'(TYPE|LIKE)\s+((LINE\s+OF|REF\s+TO|'
             r'(SORTED|STANDARD|HASHED)\s+TABLE\s+OF))?|'
             r'FROM\s+(DATABASE|MEMORY)|CALL\s+METHOD|'
             r'(GROUP|ORDER) BY|HAVING|SEPARATED BY|'
             r'GET\s+(BADI|BIT|CURSOR|DATASET|LOCALE|PARAMETER|'
             r'PF-STATUS|(PROPERTY|REFERENCE)\s+OF|'
             r'RUN\s+TIME|TIME\s+(STAMP)?)?|'
             r'SET\s+(BIT|BLANK\s+LINES|COUNTRY|CURSOR|DATASET|EXTENDED\s+CHECK|'
             r'HANDLER|HOLD\s+DATA|LANGUAGE|LEFT\s+SCROLL-BOUNDARY|'
             r'LOCALE|MARGIN|PARAMETER|PF-STATUS|PROPERTY\s+OF|'
             r'RUN\s+TIME\s+(ANALYZER|CLOCK\s+RESOLUTION)|SCREEN|'
             r'TITLEBAR|UPADTE\s+TASK\s+LOCAL|USER-COMMAND)|'
             r'CONVERT\s+((INVERTED-)?DATE|TIME|TIME\s+STAMP|TEXT)|'
             r'(CLOSE|OPEN)\s+(DATASET|CURSOR)|'
             r'(TO|FROM)\s+(DATA BUFFER|INTERNAL TABLE|MEMORY ID|'
             r'DATABASE|SHARED\s+(MEMORY|BUFFER))|'
             r'DESCRIBE\s+(DISTANCE\s+BETWEEN|FIELD|LIST|TABLE)|'
             r'FREE\s(MEMORY|OBJECT)?|'
             r'PROCESS\s+(BEFORE\s+OUTPUT|AFTER\s+INPUT|'
             r'ON\s+(VALUE-REQUEST|HELP-REQUEST))|'
             r'AT\s+(LINE-SELECTION|USER-COMMAND|END\s+OF|NEW)|'
             r'AT\s+SELECTION-SCREEN(\s+(ON(\s+(BLOCK|(HELP|VALUE)-REQUEST\s+FOR|'
             r'END\s+OF|RADIOBUTTON\s+GROUP))?|OUTPUT))?|'
             r'SELECTION-SCREEN:?\s+((BEGIN|END)\s+OF\s+((TABBED\s+)?BLOCK|LINE|'
             r'SCREEN)|COMMENT|FUNCTION\s+KEY|'
             r'INCLUDE\s+BLOCKS|POSITION|PUSHBUTTON|'
             r'SKIP|ULINE)|'
             r'LEAVE\s+(LIST-PROCESSING|PROGRAM|SCREEN|'
             r'TO LIST-PROCESSING|TO TRANSACTION)'
             r'(ENDING|STARTING)\s+AT|'
             r'FORMAT\s+(COLOR|INTENSIFIED|INVERSE|HOTSPOT|INPUT|FRAMES|RESET)|'
             r'AS\s+(CHECKBOX|SUBSCREEN|WINDOW)|'
             r'WITH\s+(((NON-)?UNIQUE)?\s+KEY|FRAME)|'
             r'(BEGIN|END)\s+OF|'
             r'DELETE(\s+ADJACENT\s+DUPLICATES\sFROM)?|'
             r'COMPARING(\s+ALL\s+FIELDS)?|'
             r'(INSERT|APPEND)(\s+INITIAL\s+LINE\s+(IN)?TO|\s+LINES\s+OF)?|'
             r'IN\s+((BYTE|CHARACTER)\s+MODE|PROGRAM)|'
             r'END-OF-(DEFINITION|PAGE|SELECTION)|'
             r'WITH\s+FRAME(\s+TITLE)|'
             r'(REPLACE|FIND)\s+((FIRST|ALL)\s+OCCURRENCES?\s+OF\s+)?(SUBSTRING|REGEX)?|'
             r'MATCH\s+(LENGTH|COUNT|LINE|OFFSET)|'
             r'(RESPECTING|IGNORING)\s+CASE|'
             r'IN\s+UPDATE\s+TASK|'
             r'(SOURCE|RESULT)\s+(XML)?|'
             r'REFERENCE\s+INTO|'

             # simple kombinations
             r'AND\s+(MARK|RETURN)|CLIENT\s+SPECIFIED|CORRESPONDING\s+FIELDS\s+OF|'
             r'IF\s+FOUND|FOR\s+EVENT|INHERITING\s+FROM|LEAVE\s+TO\s+SCREEN|'
             r'LOOP\s+AT\s+(SCREEN)?|LOWER\s+CASE|MATCHCODE\s+OBJECT|MODIF\s+ID|'
             r'MODIFY\s+SCREEN|NESTING\s+LEVEL|NO\s+INTERVALS|OF\s+STRUCTURE|'
             r'RADIOBUTTON\s+GROUP|RANGE\s+OF|REF\s+TO|SUPPRESS DIALOG|'
             r'TABLE\s+OF|UPPER\s+CASE|TRANSPORTING\s+NO\s+FIELDS|'
             r'VALUE\s+CHECK|VISIBLE\s+LENGTH|HEADER\s+LINE|COMMON\s+PART)\b', Keyword),

            # single word keywords.
            (r'(^|(?<=(\s|\.)))(ABBREVIATED|ABSTRACT|ADD|ALIASES|ALIGN|ALPHA|'
             r'ASSERT|AS|ASSIGN(ING)?|AT(\s+FIRST)?|'
             r'BACK|BLOCK|BREAK-POINT|'
             r'CASE|CAST|CATCH|CHANGING|CHECK|CLASS|CLEAR|COLLECT|COLOR|COMMIT|COND|CONV|'
             r'CREATE|COMMUNICATION|COMPONENTS?|COMPUTE|CONCATENATE|CONDENSE|'
             r'CONSTANTS|CONTEXTS|CONTINUE|CONTROLS|COUNTRY|CURRENCY|'
             r'DATA|DATE|DECIMALS|DEFAULT|DEFINE|DEFINITION|DEFERRED|DEMAND|'
             r'DETAIL|DIRECTORY|DIVIDE|DO|DUMMY|'
             r'ELSE(IF)?|ENDAT|ENDCASE|ENDCATCH|ENDCLASS|ENDDO|ENDFORM|ENDFUNCTION|'
             r'ENDIF|ENDINTERFACE|ENDLOOP|ENDMETHOD|ENDMODULE|ENDSELECT|ENDTRY|ENDWHILE|'
             r'ENHANCEMENT|EVENTS|EXACT|EXCEPTIONS?|EXIT|EXPONENT|EXPORT|EXPORTING|EXTRACT|'
             r'FETCH|FIELDS?|FOR|FORM|FORMAT|FREE|FROM|FUNCTION|'
             r'HIDE|'
             r'ID|IF|IMPORT|IMPLEMENTATION|IMPORTING|IN|INCLUDE|INCLUDING|'
             r'INDEX|INFOTYPES|INITIALIZATION|INTERFACE|INTERFACES|INTO|'
             r'LANGUAGE|LEAVE|LENGTH|LINES|LOAD|LOCAL|'
             r'JOIN|'
             r'KEY|'
             r'NEW|NEXT|'
             r'MAXIMUM|MESSAGE|METHOD[S]?|MINIMUM|MODULE|MODIFIER|MODIFY|MOVE|MULTIPLY|'
             r'NODES|NUMBER|'
             r'OBLIGATORY|OBJECT|OF|OFF|ON|OTHERS|OVERLAY|'
             r'PACK|PAD|PARAMETERS|PERCENTAGE|POSITION|PROGRAM|PROVIDE|PUBLIC|PUT|PF\d\d|'
             r'RAISE|RAISING|RANGES?|READ|RECEIVE|REDEFINITION|REFRESH|REJECT|REPORT|RESERVE|'
             r'REF|RESUME|RETRY|RETURN|RETURNING|RIGHT|ROLLBACK|REPLACE|'
             r'SCROLL|SEARCH|SELECT|SHIFT|SIGN|SINGLE|SIZE|SKIP|SORT|SPLIT|STATICS|STOP|'
             r'STYLE|SUBMATCHES|SUBMIT|SUBTRACT|SUM(?!\()|SUMMARY|SUMMING|SUPPLY|SWITCH|'
             r'TABLE|TABLES|TIMESTAMP|TIMES?|TIMEZONE|TITLE|\??TO|'
             r'TOP-OF-PAGE|TRANSFER|TRANSLATE|TRY|TYPES|'
             r'ULINE|UNDER|UNPACK|UPDATE|USING|'
             r'VALUE|VALUES|VIA|VARYING|VARY|'
             r'WAIT|WHEN|WHERE|WIDTH|WHILE|WITH|WINDOW|WRITE|XSD|ZERO)\b', Keyword),

            # builtins
            (r'(abs|acos|asin|atan|'
             r'boolc|boolx|bit_set|'
             r'char_off|charlen|ceil|cmax|cmin|condense|contains|'
             r'contains_any_of|contains_any_not_of|concat_lines_of|cos|cosh|'
             r'count|count_any_of|count_any_not_of|'
             r'dbmaxlen|distance|'
             r'escape|exp|'
             r'find|find_end|find_any_of|find_any_not_of|floor|frac|from_mixed|'
             r'insert|'
             r'lines|log|log10|'
             r'match|matches|'
             r'nmax|nmin|numofchar|'
             r'repeat|replace|rescale|reverse|round|'
             r'segment|shift_left|shift_right|sign|sin|sinh|sqrt|strlen|'
             r'substring|substring_after|substring_from|substring_before|substring_to|'
             r'tan|tanh|to_upper|to_lower|to_mixed|translate|trunc|'
             r'xstrlen)(\()\b', bygroups(Name.Builtin, Punctuation)),

            (r'&[0-9]', Name),
            (r'[0-9]+', Number.Integer),

            # operators which look like variable names before
            # parsing variable names.
            (r'(?<=(\s|.))(AND|OR|EQ|NE|GT|LT|GE|LE|CO|CN|CA|NA|CS|NOT|NS|CP|NP|'
             r'BYTE-CO|BYTE-CN|BYTE-CA|BYTE-NA|BYTE-CS|BYTE-NS|'
             r'IS\s+(NOT\s+)?(INITIAL|ASSIGNED|REQUESTED|BOUND))\b', Operator.Word),

            include('variable-names'),

            # standard operators after variable names,
            # because < and > are part of field symbols.
            (r'[?*<>=\-+&]', Operator),
            (r"'(''|[^'])*'", String.Single),
            (r"`([^`])*`", String.Single),
            (r"([|}])([^{}|]*?)([|{])",
             bygroups(Punctuation, String.Single, Punctuation)),
            (r'[/;:()\[\],.]', Punctuation),
            (r'(!)(\w+)', bygroups(Operator, Name)),
        ],
    }


class OpenEdgeLexer(RegexLexer):
    """
    Lexer for OpenEdge ABL (formerly Progress) source code.
    """
    name = 'OpenEdge ABL'
    aliases = ['openedge', 'abl', 'progress']
    filenames = ['*.p', '*.cls']
    mimetypes = ['text/x-openedge', 'application/x-openedge']
    url = 'https://www.progress.com/openedge/features/abl'
    version_added = '1.5'

    types = (r'(?i)(^|(?<=[^\w\-]))(CHARACTER|CHAR|CHARA|CHARAC|CHARACT|CHARACTE|'
             r'COM-HANDLE|DATE|DATETIME|DATETIME-TZ|'
             r'DECIMAL|DEC|DECI|DECIM|DECIMA|HANDLE|'
             r'INT64|INTEGER|INT|INTE|INTEG|INTEGE|'
             r'LOGICAL|LONGCHAR|MEMPTR|RAW|RECID|ROWID)\s*($|(?=[^\w\-]))')

    keywords = words(OPENEDGEKEYWORDS,
                     prefix=r'(?i)(^|(?<=[^\w\-]))',
                     suffix=r'\s*($|(?=[^\w\-]))')

    tokens = {
        'root': [
            (r'/\*', Comment.Multiline, 'comment'),
            (r'\{', Comment.Preproc, 'preprocessor'),
            (r'\s*&.*', Comment.Preproc),
            (r'0[xX][0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'(?i)(DEFINE|DEF|DEFI|DEFIN)\b', Keyword.Declaration),
            (types, Keyword.Type),
            (keywords, Name.Builtin),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'\s+', Whitespace),
            (r'[+*/=-]', Operator),
            (r'[.:()]', Punctuation),
            (r'.', Name.Variable),  # Lazy catch-all
        ],
        'comment': [
            (r'[^*/]', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
        'preprocessor': [
            (r'[^{}]', Comment.Preproc),
            (r'\{', Comment.Preproc, '#push'),
            (r'\}', Comment.Preproc, '#pop'),
        ],
    }

    def analyse_text(text):
        """Try to identify OpenEdge ABL based on a few common constructs."""
        result = 0

        if 'END.' in text:
            result += 0.05

        if 'END PROCEDURE.' in text:
            result += 0.05

        if 'ELSE DO:' in text:
            result += 0.05

        return result


class GoodDataCLLexer(RegexLexer):
    """
    Lexer for GoodData-CL script files.
    """

    name = 'GoodData-CL'
    aliases = ['gooddata-cl']
    filenames = ['*.gdc']
    mimetypes = ['text/x-gooddata-cl']
    url = 'https://github.com/gooddata/GoodData-CL'
    version_added = '1.4'

    flags = re.IGNORECASE

    # Syntax:
    # https://github.com/gooddata/GoodData-CL/raw/master/cli/src/main/resources/com/gooddata/processor/COMMANDS.txt
    tokens = {
        'root': [
            # Comments
            (r'#.*', Comment.Single),
            # Function call
            (r'[a-z]\w*', Name.Function),
            # Argument list
            (r'\(', Punctuation, 'args-list'),
            # Punctuation
            (r';', Punctuation),
            # Space is not significant
            (r'\s+', Text)
        ],
        'args-list': [
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'[a-z]\w*', Name.Variable),
            (r'=', Operator),
            (r'"', String, 'string-literal'),
            (r'[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]{1,3})?', Number),
            # Space is not significant
            (r'\s', Whitespace)
        ],
        'string-literal': [
            (r'\\[tnrfbae"\\]', String.Escape),
            (r'"', String, '#pop'),
            (r'[^\\"]+', String)
        ]
    }


class MaqlLexer(RegexLexer):
    """
    Lexer for GoodData MAQL scripts.
    """

    name = 'MAQL'
    aliases = ['maql']
    filenames = ['*.maql']
    mimetypes = ['text/x-gooddata-maql', 'application/x-gooddata-maql']
    url = 'https://help.gooddata.com/doc/enterprise/en/dashboards-and-insights/maql-analytical-query-language'
    version_added = '1.4'

    flags = re.IGNORECASE
    tokens = {
        'root': [
            # IDENTITY
            (r'IDENTIFIER\b', Name.Builtin),
            # IDENTIFIER
            (r'\{[^}]+\}', Name.Variable),
            # NUMBER
            (r'[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]{1,3})?', Number),
            # STRING
            (r'"', String, 'string-literal'),
            #  RELATION
            (r'\<\>|\!\=', Operator),
            (r'\=|\>\=|\>|\<\=|\<', Operator),
            # :=
            (r'\:\=', Operator),
            # OBJECT
            (r'\[[^]]+\]', Name.Variable.Class),
            # keywords
            (words((
                'DIMENSION', 'DIMENSIONS', 'BOTTOM', 'METRIC', 'COUNT', 'OTHER',
                'FACT', 'WITH', 'TOP', 'OR', 'ATTRIBUTE', 'CREATE', 'PARENT',
                'FALSE', 'ROW', 'ROWS', 'FROM', 'ALL', 'AS', 'PF', 'COLUMN',
                'COLUMNS', 'DEFINE', 'REPORT', 'LIMIT', 'TABLE', 'LIKE', 'AND',
                'BY', 'BETWEEN', 'EXCEPT', 'SELECT', 'MATCH', 'WHERE', 'TRUE',
                'FOR', 'IN', 'WITHOUT', 'FILTER', 'ALIAS', 'WHEN', 'NOT', 'ON',
                'KEYS', 'KEY', 'FULLSET', 'PRIMARY', 'LABELS', 'LABEL',
                'VISUAL', 'TITLE', 'DESCRIPTION', 'FOLDER', 'ALTER', 'DROP',
                'ADD', 'DATASET', 'DATATYPE', 'INT', 'BIGINT', 'DOUBLE', 'DATE',
                'VARCHAR', 'DECIMAL', 'SYNCHRONIZE', 'TYPE', 'DEFAULT', 'ORDER',
                'ASC', 'DESC', 'HYPERLINK', 'INCLUDE', 'TEMPLATE', 'MODIFY'),
                suffix=r'\b'),
             Keyword),
            # FUNCNAME
            (r'[a-z]\w*\b', Name.Function),
            # Comments
            (r'#.*', Comment.Single),
            # Punctuation
            (r'[,;()]', Punctuation),
            # Space is not significant
            (r'\s+', Whitespace)
        ],
        'string-literal': [
            (r'\\[tnrfbae"\\]', String.Escape),
            (r'"', String, '#pop'),
            (r'[^\\"]+', String)
        ],
    }
