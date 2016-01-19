from __future__ import absolute_import

from jedi._compatibility import is_py3
from token import *


COMMENT = N_TOKENS
tok_name[COMMENT] = 'COMMENT'
N_TOKENS += 1

NL = N_TOKENS
tok_name[NL] = 'NL'
N_TOKENS += 1

if is_py3:
    BACKQUOTE = N_TOKENS
    tok_name[BACKQUOTE] = 'BACKQUOTE'
    N_TOKENS += 1
else:
    RARROW = N_TOKENS
    tok_name[RARROW] = 'RARROW'
    N_TOKENS += 1
    ELLIPSIS = N_TOKENS
    tok_name[ELLIPSIS] = 'ELLIPSIS'
    N_TOKENS += 1



# Map from operator to number (since tokenize doesn't do this)

opmap_raw = """\
( LPAR
) RPAR
[ LSQB
] RSQB
: COLON
, COMMA
; SEMI
+ PLUS
- MINUS
* STAR
/ SLASH
| VBAR
& AMPER
< LESS
> GREATER
= EQUAL
. DOT
% PERCENT
` BACKQUOTE
{ LBRACE
} RBRACE
@ AT
== EQEQUAL
!= NOTEQUAL
<> NOTEQUAL
<= LESSEQUAL
>= GREATEREQUAL
~ TILDE
^ CIRCUMFLEX
<< LEFTSHIFT
>> RIGHTSHIFT
** DOUBLESTAR
+= PLUSEQUAL
-= MINEQUAL
*= STAREQUAL
/= SLASHEQUAL
%= PERCENTEQUAL
&= AMPEREQUAL
|= VBAREQUAL
^= CIRCUMFLEXEQUAL
<<= LEFTSHIFTEQUAL
>>= RIGHTSHIFTEQUAL
**= DOUBLESTAREQUAL
// DOUBLESLASH
//= DOUBLESLASHEQUAL
-> RARROW
... ELLIPSIS
"""

opmap = {}
for line in opmap_raw.splitlines():
    op, name = line.split()
    opmap[op] = globals()[name]
