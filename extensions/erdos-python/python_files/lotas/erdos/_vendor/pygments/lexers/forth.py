"""
    pygments.lexers.forth
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Forth language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos._vendor.pygments.token import Text, Comment, Keyword, Name, String, Number, \
    Whitespace


__all__ = ['ForthLexer']


class ForthLexer(RegexLexer):
    """
    Lexer for Forth files.
    """
    name = 'Forth'
    url = 'https://www.forth.com/forth/'
    aliases = ['forth']
    filenames = ['*.frt', '*.fs']
    mimetypes = ['application/x-forth']
    version_added = '2.2'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            # All comment types
            (r'\\.*?$', Comment.Single),
            (r'\([\s].*?\)', Comment.Single),
            # defining words. The next word is a new command name
            (r'(:|variable|constant|value|buffer:)(\s+)',
             bygroups(Keyword.Namespace, Whitespace), 'worddef'),
            # strings are rather simple
            (r'([.sc]")(\s+?)', bygroups(String, Whitespace), 'stringdef'),
            # keywords from the various wordsets
            # *** Wordset BLOCK
            (r'(blk|block|buffer|evaluate|flush|load|save-buffers|update|'
             # *** Wordset BLOCK-EXT
             r'empty-buffers|list|refill|scr|thru|'
             # *** Wordset CORE
             r'\#s|\*\/mod|\+loop|\/mod|0<|0=|1\+|1-|2!|'
             r'2\*|2\/|2@|2drop|2dup|2over|2swap|>body|'
             r'>in|>number|>r|\?dup|abort|abort\"|abs|'
             r'accept|align|aligned|allot|and|base|begin|'
             r'bl|c!|c,|c@|cell\+|cells|char|char\+|'
             r'chars|constant|count|cr|create|decimal|'
             r'depth|do|does>|drop|dup|else|emit|environment\?|'
             r'evaluate|execute|exit|fill|find|fm\/mod|'
             r'here|hold|i|if|immediate|invert|j|key|'
             r'leave|literal|loop|lshift|m\*|max|min|'
             r'mod|move|negate|or|over|postpone|quit|'
             r'r>|r@|recurse|repeat|rot|rshift|s\"|s>d|'
             r'sign|sm\/rem|source|space|spaces|state|swap|'
             r'then|type|u\.|u\<|um\*|um\/mod|unloop|until|'
             r'variable|while|word|xor|\[char\]|\[\'\]|'
             r'@|!|\#|<\#|\#>|:|;|\+|-|\*|\/|,|<|>|\|1\+|1-|\.|'
             # *** Wordset CORE-EXT
             r'\.r|0<>|'
             r'0>|2>r|2r>|2r@|:noname|\?do|again|c\"|'
             r'case|compile,|endcase|endof|erase|false|'
             r'hex|marker|nip|of|pad|parse|pick|refill|'
             r'restore-input|roll|save-input|source-id|to|'
             r'true|tuck|u\.r|u>|unused|value|within|'
             r'\[compile\]|'
             # *** Wordset CORE-EXT-obsolescent
             r'\#tib|convert|expect|query|span|'
             r'tib|'
             # *** Wordset DOUBLE
             r'2constant|2literal|2variable|d\+|d-|'
             r'd\.|d\.r|d0<|d0=|d2\*|d2\/|d<|d=|d>s|'
             r'dabs|dmax|dmin|dnegate|m\*\/|m\+|'
             # *** Wordset DOUBLE-EXT
             r'2rot|du<|'
             # *** Wordset EXCEPTION
             r'catch|throw|'
             # *** Wordset EXCEPTION-EXT
             r'abort|abort\"|'
             # *** Wordset FACILITY
             r'at-xy|key\?|page|'
             # *** Wordset FACILITY-EXT
             r'ekey|ekey>char|ekey\?|emit\?|ms|time&date|'
             # *** Wordset FILE
             r'BIN|CLOSE-FILE|CREATE-FILE|DELETE-FILE|FILE-POSITION|'
             r'FILE-SIZE|INCLUDE-FILE|INCLUDED|OPEN-FILE|R\/O|'
             r'R\/W|READ-FILE|READ-LINE|REPOSITION-FILE|RESIZE-FILE|'
             r'S\"|SOURCE-ID|W/O|WRITE-FILE|WRITE-LINE|'
             # *** Wordset FILE-EXT
             r'FILE-STATUS|FLUSH-FILE|REFILL|RENAME-FILE|'
             # *** Wordset FLOAT
             r'>float|d>f|'
             r'f!|f\*|f\+|f-|f\/|f0<|f0=|f<|f>d|f@|'
             r'falign|faligned|fconstant|fdepth|fdrop|fdup|'
             r'fliteral|float\+|floats|floor|fmax|fmin|'
             r'fnegate|fover|frot|fround|fswap|fvariable|'
             r'represent|'
             # *** Wordset FLOAT-EXT
             r'df!|df@|dfalign|dfaligned|dfloat\+|'
             r'dfloats|f\*\*|f\.|fabs|facos|facosh|falog|'
             r'fasin|fasinh|fatan|fatan2|fatanh|fcos|fcosh|'
             r'fe\.|fexp|fexpm1|fln|flnp1|flog|fs\.|fsin|'
             r'fsincos|fsinh|fsqrt|ftan|ftanh|f~|precision|'
             r'set-precision|sf!|sf@|sfalign|sfaligned|sfloat\+|'
             r'sfloats|'
             # *** Wordset LOCAL
             r'\(local\)|to|'
             # *** Wordset LOCAL-EXT
             r'locals\||'
             # *** Wordset MEMORY
             r'allocate|free|resize|'
             # *** Wordset SEARCH
             r'definitions|find|forth-wordlist|get-current|'
             r'get-order|search-wordlist|set-current|set-order|'
             r'wordlist|'
             # *** Wordset SEARCH-EXT
             r'also|forth|only|order|previous|'
             # *** Wordset STRING
             r'-trailing|\/string|blank|cmove|cmove>|compare|'
             r'search|sliteral|'
             # *** Wordset TOOLS
             r'.s|dump|see|words|'
             # *** Wordset TOOLS-EXT
             r';code|'
             r'ahead|assembler|bye|code|cs-pick|cs-roll|'
             r'editor|state|\[else\]|\[if\]|\[then\]|'
             # *** Wordset TOOLS-EXT-obsolescent
             r'forget|'
             # Forth 2012
             r'defer|defer@|defer!|action-of|begin-structure|field:|buffer:|'
             r'parse-name|buffer:|traverse-wordlist|n>r|nr>|2value|fvalue|'
             r'name>interpret|name>compile|name>string|'
             r'cfield:|end-structure)(?!\S)', Keyword),

            # Numbers
            (r'(\$[0-9A-F]+)', Number.Hex),
            (r'(\#|%|&|\-|\+)?[0-9]+', Number.Integer),
            (r'(\#|%|&|\-|\+)?[0-9.]+', Keyword.Type),
            # amforth specific
            (r'(@i|!i|@e|!e|pause|noop|turnkey|sleep|'
             r'itype|icompare|sp@|sp!|rp@|rp!|up@|up!|'
             r'>a|a>|a@|a!|a@+|a@-|>b|b>|b@|b!|b@+|b@-|'
             r'find-name|1ms|'
             r'sp0|rp0|\(evaluate\)|int-trap|int!)(?!\S)',
             Name.Constant),
            # a proposal
            (r'(do-recognizer|r:fail|recognizer:|get-recognizers|'
             r'set-recognizers|r:float|r>comp|r>int|r>post|'
             r'r:name|r:word|r:dnum|r:num|recognizer|forth-recognizer|'
             r'rec:num|rec:float|rec:word)(?!\S)', Name.Decorator),
            # defining words. The next word is a new command name
            (r'(Evalue|Rvalue|Uvalue|Edefer|Rdefer|Udefer)(\s+)',
             bygroups(Keyword.Namespace, Text), 'worddef'),

            (r'\S+', Name.Function),      # Anything else is executed

        ],
        'worddef': [
            (r'\S+', Name.Class, '#pop'),
        ],
        'stringdef': [
            (r'[^"]+', String, '#pop'),
        ],
    }

    def analyse_text(text):
        """Forth uses : COMMAND ; quite a lot in a single line, so we're trying
        to find that."""
        if re.search('\n:[^\n]+;\n', text):
            return 0.3
