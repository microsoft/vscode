import sys
from typing import Dict

ENDMARKER: int
NAME: int
NUMBER: int
STRING: int
NEWLINE: int
INDENT: int
DEDENT: int
LPAR: int
RPAR: int
LSQB: int
RSQB: int
COLON: int
COMMA: int
SEMI: int
PLUS: int
MINUS: int
STAR: int
SLASH: int
VBAR: int
AMPER: int
LESS: int
GREATER: int
EQUAL: int
DOT: int
PERCENT: int
if sys.version_info < (3,):
    BACKQUOTE: int
LBRACE: int
RBRACE: int
EQEQUAL: int
NOTEQUAL: int
LESSEQUAL: int
GREATEREQUAL: int
TILDE: int
CIRCUMFLEX: int
LEFTSHIFT: int
RIGHTSHIFT: int
DOUBLESTAR: int
PLUSEQUAL: int
MINEQUAL: int
STAREQUAL: int
SLASHEQUAL: int
PERCENTEQUAL: int
AMPEREQUAL: int
VBAREQUAL: int
CIRCUMFLEXEQUAL: int
LEFTSHIFTEQUAL: int
RIGHTSHIFTEQUAL: int
DOUBLESTAREQUAL: int
DOUBLESLASH: int
DOUBLESLASHEQUAL: int
AT: int
if sys.version_info >= (3,):
    RARROW: int
    ELLIPSIS: int
if sys.version_info >= (3, 5):
    ATEQUAL: int
    if sys.version_info < (3, 7):
        # These were removed in Python 3.7 but added back in Python 3.8
        AWAIT: int
        ASYNC: int
if sys.version_info >= (3, 8):
    AWAIT: int
    ASYNC: int
OP: int
ERRORTOKEN: int
N_TOKENS: int
NT_OFFSET: int
tok_name: Dict[int, str]
if sys.version_info >= (3, 7):
    COMMENT: int
    NL: int
    ENCODING: int
if sys.version_info >= (3, 8):
    TYPE_COMMENT: int
    TYPE_IGNORE: int
    COLONEQUAL: int
    EXACT_TOKEN_TYPES: Dict[str, int]

def ISTERMINAL(x: int) -> bool: ...
def ISNONTERMINAL(x: int) -> bool: ...
def ISEOF(x: int) -> bool: ...
