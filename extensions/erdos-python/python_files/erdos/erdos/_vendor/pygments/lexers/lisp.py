"""
    pygments.lexers.lisp
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Lispy languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, words, default
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Literal, Error, Whitespace

from erdos.erdos._vendor.pygments.lexers.python import PythonLexer

from erdos.erdos._vendor.pygments.lexers._scheme_builtins import scheme_keywords, scheme_builtins

__all__ = ['SchemeLexer', 'CommonLispLexer', 'HyLexer', 'RacketLexer',
           'NewLispLexer', 'EmacsLispLexer', 'ShenLexer', 'CPSALexer',
           'XtlangLexer', 'FennelLexer', 'JanetLexer']


class SchemeLexer(RegexLexer):
    """
    A Scheme lexer.

    This parser is checked with pastes from the LISP pastebin
    at http://paste.lisp.org/ to cover as much syntax as possible.

    It supports the full Scheme syntax as defined in R5RS.
    """
    name = 'Scheme'
    url = 'http://www.scheme-reports.org/'
    aliases = ['scheme', 'scm']
    filenames = ['*.scm', '*.ss']
    mimetypes = ['text/x-scheme', 'application/x-scheme']
    version_added = '0.6'

    flags = re.DOTALL | re.MULTILINE

    # valid names for identifiers
    # well, names can only not consist fully of numbers
    # but this should be good enough for now
    valid_name = r'[\w!$%&*+,/:<=>?@^~|-]+'

    # Use within verbose regexes
    token_end = r'''
      (?=
        \s         # whitespace
        | ;        # comment
        | \#[;|!] # fancy comments
        | [)\]]    # end delimiters
        | $        # end of file
      )
    '''

    # Recognizing builtins.
    def get_tokens_unprocessed(self, text):
        for index, token, value in super().get_tokens_unprocessed(text):
            if token is Name.Function or token is Name.Variable:
                if value in scheme_keywords:
                    yield index, Keyword, value
                elif value in scheme_builtins:
                    yield index, Name.Builtin, value
                else:
                    yield index, token, value
            else:
                yield index, token, value

    # Scheme has funky syntactic rules for numbers. These are all
    # valid number literals: 5.0e55|14, 14/13, -1+5j, +1@5, #b110,
    # #o#Iinf.0-nan.0i.  This is adapted from the formal grammar given
    # in http://www.r6rs.org/final/r6rs.pdf, section 4.2.1.  Take a
    # deep breath ...

    # It would be simpler if we could just not bother about invalid
    # numbers like #b35. But we cannot parse 'abcdef' without #x as a
    # number.

    number_rules = {}
    for base in (2, 8, 10, 16):
        if base == 2:
            digit = r'[01]'
            radix = r'( \#[bB] )'
        elif base == 8:
            digit = r'[0-7]'
            radix = r'( \#[oO] )'
        elif base == 10:
            digit = r'[0-9]'
            radix = r'( (\#[dD])? )'
        elif base == 16:
            digit = r'[0-9a-fA-F]'
            radix = r'( \#[xX] )'

        # Radix, optional exactness indicator.
        prefix = rf'''
          (
            {radix} (\#[iIeE])?
            | \#[iIeE] {radix}
          )
        '''

        # Simple unsigned number or fraction.
        ureal = rf'''
          (
            {digit}+
            ( / {digit}+ )?
          )
        '''

        # Add decimal numbers.
        if base == 10:
            decimal = r'''
              (
                # Decimal part
                (
                  [0-9]+ ([.][0-9]*)?
                  | [.][0-9]+
                )

                # Optional exponent
                (
                  [eEsSfFdDlL] [+-]? [0-9]+
                )?

                # Optional mantissa width
                (
                  \|[0-9]+
                )?
              )
            '''
            ureal = rf'''
              (
                {decimal} (?!/)
                | {ureal}
              )
            '''

        naninf = r'(nan.0|inf.0)'

        real = rf'''
          (
            [+-] {naninf}  # Sign mandatory
            | [+-]? {ureal}    # Sign optional
          )
        '''

        complex_ = rf'''
          (
            {real}?  [+-]  ({naninf}|{ureal})?  i
            | {real} (@ {real})?

          )
        '''

        num = rf'''(?x)
          (
            {prefix}
            {complex_}
          )
          # Need to ensure we have a full token. 1+ is not a
          # number followed by something else, but a function
          # name.
          {token_end}
        '''

        number_rules[base] = num

    # If you have a headache now, say thanks to RnRS editors.

    # Doing it this way is simpler than splitting the number(10)
    # regex in a floating-point and a no-floating-point version.
    def decimal_cb(self, match):
        if '.' in match.group():
            token_type = Number.Float # includes [+-](inf|nan).0
        else:
            token_type = Number.Integer
        yield match.start(), token_type, match.group()

    # --

    # The 'scheme-root' state parses as many expressions as needed, always
    # delegating to the 'scheme-value' state. The latter parses one complete
    # expression and immediately pops back. This is needed for the LilyPondLexer.
    # When LilyPond encounters a #, it starts parsing embedded Scheme code, and
    # returns to normal syntax after one expression. We implement this
    # by letting the LilyPondLexer subclass the SchemeLexer. When it finds
    # the #, the LilyPondLexer goes to the 'value' state, which then pops back
    # to LilyPondLexer. The 'root' state of the SchemeLexer merely delegates the
    # work to 'scheme-root'; this is so that LilyPondLexer can inherit
    # 'scheme-root' and redefine 'root'.

    tokens = {
        'root': [
            default('scheme-root'),
        ],
        'scheme-root': [
            default('value'),
        ],
        'value': [
            # the comments
            # and going to the end of the line
            (r';.*?$', Comment.Single),
            # multi-line comment
            (r'#\|', Comment.Multiline, 'multiline-comment'),
            # commented form (entire sexpr following)
            (r'#;[([]', Comment, 'commented-form'),
            # commented datum
            (r'#;', Comment, 'commented-datum'),
            # signifies that the program text that follows is written with the
            # lexical and datum syntax described in r6rs
            (r'#!r6rs', Comment),

            # whitespaces - usually not relevant
            (r'\s+', Whitespace),

            # numbers
            (number_rules[2], Number.Bin, '#pop'),
            (number_rules[8], Number.Oct, '#pop'),
            (number_rules[10], decimal_cb, '#pop'),
            (number_rules[16], Number.Hex, '#pop'),

            # strings, symbols, keywords and characters
            (r'"', String, 'string'),
            (r"'" + valid_name, String.Symbol, "#pop"),
            (r'#:' + valid_name, Keyword.Declaration, '#pop'),
            (r"#\\([()/'\"._!§$%& ?=+-]|[a-zA-Z0-9]+)", String.Char, "#pop"),

            # constants
            (r'(#t|#f)', Name.Constant, '#pop'),

            # special operators
            (r"('|#|`|,@|,|\.)", Operator),

            # first variable in a quoted string like
            # '(this is syntactic sugar)
            (r"(?<='\()" + valid_name, Name.Variable, '#pop'),
            (r"(?<=#\()" + valid_name, Name.Variable, '#pop'),

            # Functions -- note that this also catches variables
            # defined in let/let*, but there is little that can
            # be done about it.
            (r'(?<=\()' + valid_name, Name.Function, '#pop'),

            # find the remaining variables
            (valid_name, Name.Variable, '#pop'),

            # the famous parentheses!

            # Push scheme-root to enter a state that will parse as many things
            # as needed in the parentheses.
            (r'[([]', Punctuation, 'scheme-root'),
            # Pop one 'value', one 'scheme-root', and yet another 'value', so
            # we get back to a state parsing expressions as needed in the
            # enclosing context.
            (r'[)\]]', Punctuation, '#pop:3'),
        ],
        'multiline-comment': [
            (r'#\|', Comment.Multiline, '#push'),
            (r'\|#', Comment.Multiline, '#pop'),
            (r'[^|#]+', Comment.Multiline),
            (r'[|#]', Comment.Multiline),
        ],
        'commented-form': [
            (r'[([]', Comment, '#push'),
            (r'[)\]]', Comment, '#pop'),
            (r'[^()[\]]+', Comment),
        ],
        'commented-datum': [
            (rf'(?x).*?{token_end}', Comment, '#pop'),
        ],
        'string': [
            # Pops back from 'string', and pops 'value' as well.
            ('"', String, '#pop:2'),
            # Hex escape sequences, R6RS-style.
            (r'\\x[0-9a-fA-F]+;', String.Escape),
            # We try R6RS style first, but fall back to Guile-style.
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
            # Other special escape sequences implemented by Guile.
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\U[0-9a-fA-F]{6}', String.Escape),
            # Escape sequences are not overly standardized. Recognizing
            # a single character after the backslash should be good enough.
            # NB: we have DOTALL.
            (r'\\.', String.Escape),
            # The rest
            (r'[^\\"]+', String),
        ]
    }


class CommonLispLexer(RegexLexer):
    """
    A Common Lisp lexer.
    """
    name = 'Common Lisp'
    url = 'https://lisp-lang.org/'
    aliases = ['common-lisp', 'cl', 'lisp']
    filenames = ['*.cl', '*.lisp']
    mimetypes = ['text/x-common-lisp']
    version_added = '0.9'

    flags = re.IGNORECASE | re.MULTILINE

    # couple of useful regexes

    # characters that are not macro-characters and can be used to begin a symbol
    nonmacro = r'\\.|[\w!$%&*+-/<=>?@\[\]^{}~]'
    constituent = nonmacro + '|[#.:]'
    terminated = r'(?=[ "()\'\n,;`])'  # whitespace or terminating macro characters

    # symbol token, reverse-engineered from hyperspec
    # Take a deep breath...
    symbol = rf'(\|[^|]+\||(?:{nonmacro})(?:{constituent})*)'

    def __init__(self, **options):
        from erdos.erdos._vendor.pygments.lexers._cl_builtins import BUILTIN_FUNCTIONS, \
            SPECIAL_FORMS, MACROS, LAMBDA_LIST_KEYWORDS, DECLARATIONS, \
            BUILTIN_TYPES, BUILTIN_CLASSES
        self.builtin_function = BUILTIN_FUNCTIONS
        self.special_forms = SPECIAL_FORMS
        self.macros = MACROS
        self.lambda_list_keywords = LAMBDA_LIST_KEYWORDS
        self.declarations = DECLARATIONS
        self.builtin_types = BUILTIN_TYPES
        self.builtin_classes = BUILTIN_CLASSES
        RegexLexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text):
        stack = ['root']
        for index, token, value in RegexLexer.get_tokens_unprocessed(self, text, stack):
            if token is Name.Variable:
                if value in self.builtin_function:
                    yield index, Name.Builtin, value
                    continue
                if value in self.special_forms:
                    yield index, Keyword, value
                    continue
                if value in self.macros:
                    yield index, Name.Builtin, value
                    continue
                if value in self.lambda_list_keywords:
                    yield index, Keyword, value
                    continue
                if value in self.declarations:
                    yield index, Keyword, value
                    continue
                if value in self.builtin_types:
                    yield index, Keyword.Type, value
                    continue
                if value in self.builtin_classes:
                    yield index, Name.Class, value
                    continue
            yield index, token, value

    tokens = {
        'root': [
            default('body'),
        ],
        'multiline-comment': [
            (r'#\|', Comment.Multiline, '#push'),  # (cf. Hyperspec 2.4.8.19)
            (r'\|#', Comment.Multiline, '#pop'),
            (r'[^|#]+', Comment.Multiline),
            (r'[|#]', Comment.Multiline),
        ],
        'commented-form': [
            (r'\(', Comment.Preproc, '#push'),
            (r'\)', Comment.Preproc, '#pop'),
            (r'[^()]+', Comment.Preproc),
        ],
        'body': [
            # whitespace
            (r'\s+', Whitespace),

            # single-line comment
            (r';.*$', Comment.Single),

            # multi-line comment
            (r'#\|', Comment.Multiline, 'multiline-comment'),

            # encoding comment (?)
            (r'#\d*Y.*$', Comment.Special),

            # strings and characters
            (r'"(\\.|\\\n|[^"\\])*"', String),
            # quoting
            (r":" + symbol, String.Symbol),
            (r"::" + symbol, String.Symbol),
            (r":#" + symbol, String.Symbol),
            (r"'" + symbol, String.Symbol),
            (r"'", Operator),
            (r"`", Operator),

            # decimal numbers
            (r'[-+]?\d+\.?' + terminated, Number.Integer),
            (r'[-+]?\d+/\d+' + terminated, Number),
            (r'[-+]?(\d*\.\d+([defls][-+]?\d+)?|\d+(\.\d*)?[defls][-+]?\d+)' +
             terminated, Number.Float),

            # sharpsign strings and characters
            (r"#\\." + terminated, String.Char),
            (r"#\\" + symbol, String.Char),

            # vector
            (r'#\(', Operator, 'body'),

            # bitstring
            (r'#\d*\*[01]*', Literal.Other),

            # uninterned symbol
            (r'#:' + symbol, String.Symbol),

            # read-time and load-time evaluation
            (r'#[.,]', Operator),

            # function shorthand
            (r'#\'', Name.Function),

            # binary rational
            (r'#b[+-]?[01]+(/[01]+)?', Number.Bin),

            # octal rational
            (r'#o[+-]?[0-7]+(/[0-7]+)?', Number.Oct),

            # hex rational
            (r'#x[+-]?[0-9a-f]+(/[0-9a-f]+)?', Number.Hex),

            # radix rational
            (r'#\d+r[+-]?[0-9a-z]+(/[0-9a-z]+)?', Number),

            # complex
            (r'(#c)(\()', bygroups(Number, Punctuation), 'body'),

            # array
            (r'(#\d+a)(\()', bygroups(Literal.Other, Punctuation), 'body'),

            # structure
            (r'(#s)(\()', bygroups(Literal.Other, Punctuation), 'body'),

            # path
            (r'#p?"(\\.|[^"])*"', Literal.Other),

            # reference
            (r'#\d+=', Operator),
            (r'#\d+#', Operator),

            # read-time comment
            (r'#+nil' + terminated + r'\s*\(', Comment.Preproc, 'commented-form'),

            # read-time conditional
            (r'#[+-]', Operator),

            # special operators that should have been parsed already
            (r'(,@|,|\.)', Operator),

            # special constants
            (r'(t|nil)' + terminated, Name.Constant),

            # functions and variables
            (r'\*' + symbol + r'\*', Name.Variable.Global),
            (symbol, Name.Variable),

            # parentheses
            (r'\(', Punctuation, 'body'),
            (r'\)', Punctuation, '#pop'),
        ],
    }

    def analyse_text(text):
        """Competes with Visual Prolog on *.cl"""
        # This is a *really* good indicator (and not conflicting with Visual Prolog)
        # '(defun ' first on a line
        # section keyword alone on line e.g. 'clauses'
        if re.search(r'^\s*\(defun\s', text):
            return 0.8
        else:
            return 0


class HyLexer(RegexLexer):
    """
    Lexer for Hy source code.
    """
    name = 'Hy'
    url = 'http://hylang.org/'
    aliases = ['hylang', 'hy']
    filenames = ['*.hy']
    mimetypes = ['text/x-hy', 'application/x-hy']
    version_added = '2.0'

    special_forms = (
        'cond', 'for', '->', '->>', 'car',
        'cdr', 'first', 'rest', 'let', 'when', 'unless',
        'import', 'do', 'progn', 'get', 'slice', 'assoc', 'with-decorator',
        ',', 'list_comp', 'kwapply', '~', 'is', 'in', 'is-not', 'not-in',
        'quasiquote', 'unquote', 'unquote-splice', 'quote', '|', '<<=', '>>=',
        'foreach', 'while',
        'eval-and-compile', 'eval-when-compile'
    )

    declarations = (
        'def', 'defn', 'defun', 'defmacro', 'defclass', 'lambda', 'fn', 'setv'
    )

    hy_builtins = ()

    hy_core = (
        'cycle', 'dec', 'distinct', 'drop', 'even?', 'filter', 'inc',
        'instance?', 'iterable?', 'iterate', 'iterator?', 'neg?',
        'none?', 'nth', 'numeric?', 'odd?', 'pos?', 'remove', 'repeat',
        'repeatedly', 'take', 'take_nth', 'take_while', 'zero?'
    )

    builtins = hy_builtins + hy_core

    # valid names for identifiers
    # well, names can only not consist fully of numbers
    # but this should be good enough for now
    valid_name = r"[^ \t\n\r\f\v()[\]{};\"'`~]+"

    def _multi_escape(entries):
        return words(entries, suffix=' ')

    tokens = {
        'root': [
            # the comments - always starting with semicolon
            # and going to the end of the line
            (r';.*$', Comment.Single),

            # whitespaces - usually not relevant
            (r'[ \t\n\r\f\v]+', Whitespace),

            # numbers
            (r'-?\d+\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),
            (r'0[0-7]+j?', Number.Oct),
            (r'0[xX][a-fA-F0-9]+', Number.Hex),

            # strings, symbols and characters
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r"'" + valid_name, String.Symbol),
            (r"\\(.|[a-z]+)", String.Char),
            (r'^(\s*)([rRuU]{,2}"""(?:.|\n)*?""")', bygroups(Text, String.Doc)),
            (r"^(\s*)([rRuU]{,2}'''(?:.|\n)*?''')", bygroups(Text, String.Doc)),

            # keywords
            (r'::?' + valid_name, String.Symbol),

            # special operators
            (r'~@|[`\'#^~&@]', Operator),

            include('py-keywords'),
            include('py-builtins'),

            # highlight the special forms
            (_multi_escape(special_forms), Keyword),

            # Technically, only the special forms are 'keywords'. The problem
            # is that only treating them as keywords means that things like
            # 'defn' and 'ns' need to be highlighted as builtins. This is ugly
            # and weird for most styles. So, as a compromise we're going to
            # highlight them as Keyword.Declarations.
            (_multi_escape(declarations), Keyword.Declaration),

            # highlight the builtins
            (_multi_escape(builtins), Name.Builtin),

            # the remaining functions
            (r'(?<=\()' + valid_name, Name.Function),

            # find the remaining variables
            (valid_name, Name.Variable),

            # Hy accepts vector notation
            (r'(\[|\])', Punctuation),

            # Hy accepts map notation
            (r'(\{|\})', Punctuation),

            # the famous parentheses!
            (r'(\(|\))', Punctuation),

        ],
        'py-keywords': PythonLexer.tokens['keywords'],
        'py-builtins': PythonLexer.tokens['builtins'],
    }

    def analyse_text(text):
        if '(import ' in text or '(defn ' in text:
            return 0.9


class RacketLexer(RegexLexer):
    """
    Lexer for Racket source code (formerly
    known as PLT Scheme).
    """

    name = 'Racket'
    url = 'http://racket-lang.org/'
    aliases = ['racket', 'rkt']
    filenames = ['*.rkt', '*.rktd', '*.rktl']
    mimetypes = ['text/x-racket', 'application/x-racket']
    version_added = '1.6'

    # Generated by example.rkt
    _keywords = (
        '#%app', '#%datum', '#%declare', '#%expression', '#%module-begin',
        '#%plain-app', '#%plain-lambda', '#%plain-module-begin',
        '#%printing-module-begin', '#%provide', '#%require',
        '#%stratified-body', '#%top', '#%top-interaction',
        '#%variable-reference', '->', '->*', '->*m', '->d', '->dm', '->i',
        '->m', '...', ':do-in', '==', '=>', '_', 'absent', 'abstract',
        'all-defined-out', 'all-from-out', 'and', 'any', 'augment', 'augment*',
        'augment-final', 'augment-final*', 'augride', 'augride*', 'begin',
        'begin-for-syntax', 'begin0', 'case', 'case->', 'case->m',
        'case-lambda', 'class', 'class*', 'class-field-accessor',
        'class-field-mutator', 'class/c', 'class/derived', 'combine-in',
        'combine-out', 'command-line', 'compound-unit', 'compound-unit/infer',
        'cond', 'cons/dc', 'contract', 'contract-out', 'contract-struct',
        'contracted', 'define', 'define-compound-unit',
        'define-compound-unit/infer', 'define-contract-struct',
        'define-custom-hash-types', 'define-custom-set-types',
        'define-for-syntax', 'define-local-member-name', 'define-logger',
        'define-match-expander', 'define-member-name',
        'define-module-boundary-contract', 'define-namespace-anchor',
        'define-opt/c', 'define-sequence-syntax', 'define-serializable-class',
        'define-serializable-class*', 'define-signature',
        'define-signature-form', 'define-struct', 'define-struct/contract',
        'define-struct/derived', 'define-syntax', 'define-syntax-rule',
        'define-syntaxes', 'define-unit', 'define-unit-binding',
        'define-unit-from-context', 'define-unit/contract',
        'define-unit/new-import-export', 'define-unit/s', 'define-values',
        'define-values-for-export', 'define-values-for-syntax',
        'define-values/invoke-unit', 'define-values/invoke-unit/infer',
        'define/augment', 'define/augment-final', 'define/augride',
        'define/contract', 'define/final-prop', 'define/match',
        'define/overment', 'define/override', 'define/override-final',
        'define/private', 'define/public', 'define/public-final',
        'define/pubment', 'define/subexpression-pos-prop',
        'define/subexpression-pos-prop/name', 'delay', 'delay/idle',
        'delay/name', 'delay/strict', 'delay/sync', 'delay/thread', 'do',
        'else', 'except', 'except-in', 'except-out', 'export', 'extends',
        'failure-cont', 'false', 'false/c', 'field', 'field-bound?', 'file',
        'flat-murec-contract', 'flat-rec-contract', 'for', 'for*', 'for*/and',
        'for*/async', 'for*/first', 'for*/fold', 'for*/fold/derived',
        'for*/hash', 'for*/hasheq', 'for*/hasheqv', 'for*/last', 'for*/list',
        'for*/lists', 'for*/mutable-set', 'for*/mutable-seteq',
        'for*/mutable-seteqv', 'for*/or', 'for*/product', 'for*/set',
        'for*/seteq', 'for*/seteqv', 'for*/stream', 'for*/sum', 'for*/vector',
        'for*/weak-set', 'for*/weak-seteq', 'for*/weak-seteqv', 'for-label',
        'for-meta', 'for-syntax', 'for-template', 'for/and', 'for/async',
        'for/first', 'for/fold', 'for/fold/derived', 'for/hash', 'for/hasheq',
        'for/hasheqv', 'for/last', 'for/list', 'for/lists', 'for/mutable-set',
        'for/mutable-seteq', 'for/mutable-seteqv', 'for/or', 'for/product',
        'for/set', 'for/seteq', 'for/seteqv', 'for/stream', 'for/sum',
        'for/vector', 'for/weak-set', 'for/weak-seteq', 'for/weak-seteqv',
        'gen:custom-write', 'gen:dict', 'gen:equal+hash', 'gen:set',
        'gen:stream', 'generic', 'get-field', 'hash/dc', 'if', 'implies',
        'import', 'include', 'include-at/relative-to',
        'include-at/relative-to/reader', 'include/reader', 'inherit',
        'inherit-field', 'inherit/inner', 'inherit/super', 'init',
        'init-depend', 'init-field', 'init-rest', 'inner', 'inspect',
        'instantiate', 'interface', 'interface*', 'invariant-assertion',
        'invoke-unit', 'invoke-unit/infer', 'lambda', 'lazy', 'let', 'let*',
        'let*-values', 'let-syntax', 'let-syntaxes', 'let-values', 'let/cc',
        'let/ec', 'letrec', 'letrec-syntax', 'letrec-syntaxes',
        'letrec-syntaxes+values', 'letrec-values', 'lib', 'link', 'local',
        'local-require', 'log-debug', 'log-error', 'log-fatal', 'log-info',
        'log-warning', 'match', 'match*', 'match*/derived', 'match-define',
        'match-define-values', 'match-lambda', 'match-lambda*',
        'match-lambda**', 'match-let', 'match-let*', 'match-let*-values',
        'match-let-values', 'match-letrec', 'match-letrec-values',
        'match/derived', 'match/values', 'member-name-key', 'mixin', 'module',
        'module*', 'module+', 'nand', 'new', 'nor', 'object-contract',
        'object/c', 'only', 'only-in', 'only-meta-in', 'open', 'opt/c', 'or',
        'overment', 'overment*', 'override', 'override*', 'override-final',
        'override-final*', 'parameterize', 'parameterize*',
        'parameterize-break', 'parametric->/c', 'place', 'place*',
        'place/context', 'planet', 'prefix', 'prefix-in', 'prefix-out',
        'private', 'private*', 'prompt-tag/c', 'protect-out', 'provide',
        'provide-signature-elements', 'provide/contract', 'public', 'public*',
        'public-final', 'public-final*', 'pubment', 'pubment*', 'quasiquote',
        'quasisyntax', 'quasisyntax/loc', 'quote', 'quote-syntax',
        'quote-syntax/prune', 'recontract-out', 'recursive-contract',
        'relative-in', 'rename', 'rename-in', 'rename-inner', 'rename-out',
        'rename-super', 'require', 'send', 'send*', 'send+', 'send-generic',
        'send/apply', 'send/keyword-apply', 'set!', 'set!-values',
        'set-field!', 'shared', 'stream', 'stream*', 'stream-cons', 'struct',
        'struct*', 'struct-copy', 'struct-field-index', 'struct-out',
        'struct/c', 'struct/ctc', 'struct/dc', 'submod', 'super',
        'super-instantiate', 'super-make-object', 'super-new', 'syntax',
        'syntax-case', 'syntax-case*', 'syntax-id-rules', 'syntax-rules',
        'syntax/loc', 'tag', 'this', 'this%', 'thunk', 'thunk*', 'time',
        'unconstrained-domain->', 'unit', 'unit-from-context', 'unit/c',
        'unit/new-import-export', 'unit/s', 'unless', 'unquote',
        'unquote-splicing', 'unsyntax', 'unsyntax-splicing', 'values/drop',
        'when', 'with-continuation-mark', 'with-contract',
        'with-contract-continuation-mark', 'with-handlers', 'with-handlers*',
        'with-method', 'with-syntax', 'λ'
    )

    # Generated by example.rkt
    _builtins = (
        '*', '*list/c', '+', '-', '/', '<', '</c', '<=', '<=/c', '=', '=/c',
        '>', '>/c', '>=', '>=/c', 'abort-current-continuation', 'abs',
        'absolute-path?', 'acos', 'add-between', 'add1', 'alarm-evt',
        'always-evt', 'and/c', 'andmap', 'angle', 'any/c', 'append', 'append*',
        'append-map', 'apply', 'argmax', 'argmin', 'arithmetic-shift',
        'arity-at-least', 'arity-at-least-value', 'arity-at-least?',
        'arity-checking-wrapper', 'arity-includes?', 'arity=?',
        'arrow-contract-info', 'arrow-contract-info-accepts-arglist',
        'arrow-contract-info-chaperone-procedure',
        'arrow-contract-info-check-first-order', 'arrow-contract-info?',
        'asin', 'assf', 'assoc', 'assq', 'assv', 'atan',
        'bad-number-of-results', 'banner', 'base->-doms/c', 'base->-rngs/c',
        'base->?', 'between/c', 'bitwise-and', 'bitwise-bit-field',
        'bitwise-bit-set?', 'bitwise-ior', 'bitwise-not', 'bitwise-xor',
        'blame-add-car-context', 'blame-add-cdr-context', 'blame-add-context',
        'blame-add-missing-party', 'blame-add-nth-arg-context',
        'blame-add-range-context', 'blame-add-unknown-context',
        'blame-context', 'blame-contract', 'blame-fmt->-string',
        'blame-missing-party?', 'blame-negative', 'blame-original?',
        'blame-positive', 'blame-replace-negative', 'blame-source',
        'blame-swap', 'blame-swapped?', 'blame-update', 'blame-value',
        'blame?', 'boolean=?', 'boolean?', 'bound-identifier=?', 'box',
        'box-cas!', 'box-immutable', 'box-immutable/c', 'box/c', 'box?',
        'break-enabled', 'break-parameterization?', 'break-thread',
        'build-chaperone-contract-property', 'build-compound-type-name',
        'build-contract-property', 'build-flat-contract-property',
        'build-list', 'build-path', 'build-path/convention-type',
        'build-string', 'build-vector', 'byte-pregexp', 'byte-pregexp?',
        'byte-ready?', 'byte-regexp', 'byte-regexp?', 'byte?', 'bytes',
        'bytes->immutable-bytes', 'bytes->list', 'bytes->path',
        'bytes->path-element', 'bytes->string/latin-1', 'bytes->string/locale',
        'bytes->string/utf-8', 'bytes-append', 'bytes-append*',
        'bytes-close-converter', 'bytes-convert', 'bytes-convert-end',
        'bytes-converter?', 'bytes-copy', 'bytes-copy!',
        'bytes-environment-variable-name?', 'bytes-fill!', 'bytes-join',
        'bytes-length', 'bytes-no-nuls?', 'bytes-open-converter', 'bytes-ref',
        'bytes-set!', 'bytes-utf-8-index', 'bytes-utf-8-length',
        'bytes-utf-8-ref', 'bytes<?', 'bytes=?', 'bytes>?', 'bytes?', 'caaaar',
        'caaadr', 'caaar', 'caadar', 'caaddr', 'caadr', 'caar', 'cadaar',
        'cadadr', 'cadar', 'caddar', 'cadddr', 'caddr', 'cadr',
        'call-in-nested-thread', 'call-with-atomic-output-file',
        'call-with-break-parameterization',
        'call-with-composable-continuation', 'call-with-continuation-barrier',
        'call-with-continuation-prompt', 'call-with-current-continuation',
        'call-with-default-reading-parameterization',
        'call-with-escape-continuation', 'call-with-exception-handler',
        'call-with-file-lock/timeout', 'call-with-immediate-continuation-mark',
        'call-with-input-bytes', 'call-with-input-file',
        'call-with-input-file*', 'call-with-input-string',
        'call-with-output-bytes', 'call-with-output-file',
        'call-with-output-file*', 'call-with-output-string',
        'call-with-parameterization', 'call-with-semaphore',
        'call-with-semaphore/enable-break', 'call-with-values', 'call/cc',
        'call/ec', 'car', 'cartesian-product', 'cdaaar', 'cdaadr', 'cdaar',
        'cdadar', 'cdaddr', 'cdadr', 'cdar', 'cddaar', 'cddadr', 'cddar',
        'cdddar', 'cddddr', 'cdddr', 'cddr', 'cdr', 'ceiling', 'channel-get',
        'channel-put', 'channel-put-evt', 'channel-put-evt?',
        'channel-try-get', 'channel/c', 'channel?', 'chaperone-box',
        'chaperone-channel', 'chaperone-continuation-mark-key',
        'chaperone-contract-property?', 'chaperone-contract?', 'chaperone-evt',
        'chaperone-hash', 'chaperone-hash-set', 'chaperone-of?',
        'chaperone-procedure', 'chaperone-procedure*', 'chaperone-prompt-tag',
        'chaperone-struct', 'chaperone-struct-type', 'chaperone-vector',
        'chaperone?', 'char->integer', 'char-alphabetic?', 'char-blank?',
        'char-ci<=?', 'char-ci<?', 'char-ci=?', 'char-ci>=?', 'char-ci>?',
        'char-downcase', 'char-foldcase', 'char-general-category',
        'char-graphic?', 'char-in', 'char-in/c', 'char-iso-control?',
        'char-lower-case?', 'char-numeric?', 'char-punctuation?',
        'char-ready?', 'char-symbolic?', 'char-title-case?', 'char-titlecase',
        'char-upcase', 'char-upper-case?', 'char-utf-8-length',
        'char-whitespace?', 'char<=?', 'char<?', 'char=?', 'char>=?', 'char>?',
        'char?', 'check-duplicate-identifier', 'check-duplicates',
        'checked-procedure-check-and-extract', 'choice-evt',
        'class->interface', 'class-info', 'class-seal', 'class-unseal',
        'class?', 'cleanse-path', 'close-input-port', 'close-output-port',
        'coerce-chaperone-contract', 'coerce-chaperone-contracts',
        'coerce-contract', 'coerce-contract/f', 'coerce-contracts',
        'coerce-flat-contract', 'coerce-flat-contracts', 'collect-garbage',
        'collection-file-path', 'collection-path', 'combinations', 'compile',
        'compile-allow-set!-undefined', 'compile-context-preservation-enabled',
        'compile-enforce-module-constants', 'compile-syntax',
        'compiled-expression-recompile', 'compiled-expression?',
        'compiled-module-expression?', 'complete-path?', 'complex?', 'compose',
        'compose1', 'conjoin', 'conjugate', 'cons', 'cons/c', 'cons?', 'const',
        'continuation-mark-key/c', 'continuation-mark-key?',
        'continuation-mark-set->context', 'continuation-mark-set->list',
        'continuation-mark-set->list*', 'continuation-mark-set-first',
        'continuation-mark-set?', 'continuation-marks',
        'continuation-prompt-available?', 'continuation-prompt-tag?',
        'continuation?', 'contract-continuation-mark-key',
        'contract-custom-write-property-proc', 'contract-exercise',
        'contract-first-order', 'contract-first-order-passes?',
        'contract-late-neg-projection', 'contract-name', 'contract-proc',
        'contract-projection', 'contract-property?',
        'contract-random-generate', 'contract-random-generate-fail',
        'contract-random-generate-fail?',
        'contract-random-generate-get-current-environment',
        'contract-random-generate-stash', 'contract-random-generate/choose',
        'contract-stronger?', 'contract-struct-exercise',
        'contract-struct-generate', 'contract-struct-late-neg-projection',
        'contract-struct-list-contract?', 'contract-val-first-projection',
        'contract?', 'convert-stream', 'copy-directory/files', 'copy-file',
        'copy-port', 'cos', 'cosh', 'count', 'current-blame-format',
        'current-break-parameterization', 'current-code-inspector',
        'current-command-line-arguments', 'current-compile',
        'current-compiled-file-roots', 'current-continuation-marks',
        'current-contract-region', 'current-custodian', 'current-directory',
        'current-directory-for-user', 'current-drive',
        'current-environment-variables', 'current-error-port', 'current-eval',
        'current-evt-pseudo-random-generator',
        'current-force-delete-permissions', 'current-future',
        'current-gc-milliseconds', 'current-get-interaction-input-port',
        'current-inexact-milliseconds', 'current-input-port',
        'current-inspector', 'current-library-collection-links',
        'current-library-collection-paths', 'current-load',
        'current-load-extension', 'current-load-relative-directory',
        'current-load/use-compiled', 'current-locale', 'current-logger',
        'current-memory-use', 'current-milliseconds',
        'current-module-declare-name', 'current-module-declare-source',
        'current-module-name-resolver', 'current-module-path-for-load',
        'current-namespace', 'current-output-port', 'current-parameterization',
        'current-plumber', 'current-preserved-thread-cell-values',
        'current-print', 'current-process-milliseconds', 'current-prompt-read',
        'current-pseudo-random-generator', 'current-read-interaction',
        'current-reader-guard', 'current-readtable', 'current-seconds',
        'current-security-guard', 'current-subprocess-custodian-mode',
        'current-thread', 'current-thread-group',
        'current-thread-initial-stack-size',
        'current-write-relative-directory', 'curry', 'curryr',
        'custodian-box-value', 'custodian-box?', 'custodian-limit-memory',
        'custodian-managed-list', 'custodian-memory-accounting-available?',
        'custodian-require-memory', 'custodian-shutdown-all', 'custodian?',
        'custom-print-quotable-accessor', 'custom-print-quotable?',
        'custom-write-accessor', 'custom-write-property-proc', 'custom-write?',
        'date', 'date*', 'date*-nanosecond', 'date*-time-zone-name', 'date*?',
        'date-day', 'date-dst?', 'date-hour', 'date-minute', 'date-month',
        'date-second', 'date-time-zone-offset', 'date-week-day', 'date-year',
        'date-year-day', 'date?', 'datum->syntax', 'datum-intern-literal',
        'default-continuation-prompt-tag', 'degrees->radians',
        'delete-directory', 'delete-directory/files', 'delete-file',
        'denominator', 'dict->list', 'dict-can-functional-set?',
        'dict-can-remove-keys?', 'dict-clear', 'dict-clear!', 'dict-copy',
        'dict-count', 'dict-empty?', 'dict-for-each', 'dict-has-key?',
        'dict-implements/c', 'dict-implements?', 'dict-iter-contract',
        'dict-iterate-first', 'dict-iterate-key', 'dict-iterate-next',
        'dict-iterate-value', 'dict-key-contract', 'dict-keys', 'dict-map',
        'dict-mutable?', 'dict-ref', 'dict-ref!', 'dict-remove',
        'dict-remove!', 'dict-set', 'dict-set!', 'dict-set*', 'dict-set*!',
        'dict-update', 'dict-update!', 'dict-value-contract', 'dict-values',
        'dict?', 'directory-exists?', 'directory-list', 'disjoin', 'display',
        'display-lines', 'display-lines-to-file', 'display-to-file',
        'displayln', 'double-flonum?', 'drop', 'drop-common-prefix',
        'drop-right', 'dropf', 'dropf-right', 'dump-memory-stats',
        'dup-input-port', 'dup-output-port', 'dynamic->*', 'dynamic-get-field',
        'dynamic-object/c', 'dynamic-place', 'dynamic-place*',
        'dynamic-require', 'dynamic-require-for-syntax', 'dynamic-send',
        'dynamic-set-field!', 'dynamic-wind', 'eighth', 'empty',
        'empty-sequence', 'empty-stream', 'empty?',
        'environment-variables-copy', 'environment-variables-names',
        'environment-variables-ref', 'environment-variables-set!',
        'environment-variables?', 'eof', 'eof-evt', 'eof-object?',
        'ephemeron-value', 'ephemeron?', 'eprintf', 'eq-contract-val',
        'eq-contract?', 'eq-hash-code', 'eq?', 'equal-contract-val',
        'equal-contract?', 'equal-hash-code', 'equal-secondary-hash-code',
        'equal<%>', 'equal?', 'equal?/recur', 'eqv-hash-code', 'eqv?', 'error',
        'error-display-handler', 'error-escape-handler',
        'error-print-context-length', 'error-print-source-location',
        'error-print-width', 'error-value->string-handler', 'eval',
        'eval-jit-enabled', 'eval-syntax', 'even?', 'evt/c', 'evt?',
        'exact->inexact', 'exact-ceiling', 'exact-floor', 'exact-integer?',
        'exact-nonnegative-integer?', 'exact-positive-integer?', 'exact-round',
        'exact-truncate', 'exact?', 'executable-yield-handler', 'exit',
        'exit-handler', 'exn', 'exn-continuation-marks', 'exn-message',
        'exn:break', 'exn:break-continuation', 'exn:break:hang-up',
        'exn:break:hang-up?', 'exn:break:terminate', 'exn:break:terminate?',
        'exn:break?', 'exn:fail', 'exn:fail:contract',
        'exn:fail:contract:arity', 'exn:fail:contract:arity?',
        'exn:fail:contract:blame', 'exn:fail:contract:blame-object',
        'exn:fail:contract:blame?', 'exn:fail:contract:continuation',
        'exn:fail:contract:continuation?', 'exn:fail:contract:divide-by-zero',
        'exn:fail:contract:divide-by-zero?',
        'exn:fail:contract:non-fixnum-result',
        'exn:fail:contract:non-fixnum-result?', 'exn:fail:contract:variable',
        'exn:fail:contract:variable-id', 'exn:fail:contract:variable?',
        'exn:fail:contract?', 'exn:fail:filesystem',
        'exn:fail:filesystem:errno', 'exn:fail:filesystem:errno-errno',
        'exn:fail:filesystem:errno?', 'exn:fail:filesystem:exists',
        'exn:fail:filesystem:exists?', 'exn:fail:filesystem:missing-module',
        'exn:fail:filesystem:missing-module-path',
        'exn:fail:filesystem:missing-module?', 'exn:fail:filesystem:version',
        'exn:fail:filesystem:version?', 'exn:fail:filesystem?',
        'exn:fail:network', 'exn:fail:network:errno',
        'exn:fail:network:errno-errno', 'exn:fail:network:errno?',
        'exn:fail:network?', 'exn:fail:object', 'exn:fail:object?',
        'exn:fail:out-of-memory', 'exn:fail:out-of-memory?', 'exn:fail:read',
        'exn:fail:read-srclocs', 'exn:fail:read:eof', 'exn:fail:read:eof?',
        'exn:fail:read:non-char', 'exn:fail:read:non-char?', 'exn:fail:read?',
        'exn:fail:syntax', 'exn:fail:syntax-exprs',
        'exn:fail:syntax:missing-module',
        'exn:fail:syntax:missing-module-path',
        'exn:fail:syntax:missing-module?', 'exn:fail:syntax:unbound',
        'exn:fail:syntax:unbound?', 'exn:fail:syntax?', 'exn:fail:unsupported',
        'exn:fail:unsupported?', 'exn:fail:user', 'exn:fail:user?',
        'exn:fail?', 'exn:misc:match?', 'exn:missing-module-accessor',
        'exn:missing-module?', 'exn:srclocs-accessor', 'exn:srclocs?', 'exn?',
        'exp', 'expand', 'expand-once', 'expand-syntax', 'expand-syntax-once',
        'expand-syntax-to-top-form', 'expand-to-top-form', 'expand-user-path',
        'explode-path', 'expt', 'externalizable<%>', 'failure-result/c',
        'false?', 'field-names', 'fifth', 'file->bytes', 'file->bytes-lines',
        'file->lines', 'file->list', 'file->string', 'file->value',
        'file-exists?', 'file-name-from-path', 'file-or-directory-identity',
        'file-or-directory-modify-seconds', 'file-or-directory-permissions',
        'file-position', 'file-position*', 'file-size',
        'file-stream-buffer-mode', 'file-stream-port?', 'file-truncate',
        'filename-extension', 'filesystem-change-evt',
        'filesystem-change-evt-cancel', 'filesystem-change-evt?',
        'filesystem-root-list', 'filter', 'filter-map', 'filter-not',
        'filter-read-input-port', 'find-executable-path', 'find-files',
        'find-library-collection-links', 'find-library-collection-paths',
        'find-relative-path', 'find-system-path', 'findf', 'first',
        'first-or/c', 'fixnum?', 'flat-contract', 'flat-contract-predicate',
        'flat-contract-property?', 'flat-contract?', 'flat-named-contract',
        'flatten', 'floating-point-bytes->real', 'flonum?', 'floor',
        'flush-output', 'fold-files', 'foldl', 'foldr', 'for-each', 'force',
        'format', 'fourth', 'fprintf', 'free-identifier=?',
        'free-label-identifier=?', 'free-template-identifier=?',
        'free-transformer-identifier=?', 'fsemaphore-count', 'fsemaphore-post',
        'fsemaphore-try-wait?', 'fsemaphore-wait', 'fsemaphore?', 'future',
        'future?', 'futures-enabled?', 'gcd', 'generate-member-key',
        'generate-temporaries', 'generic-set?', 'generic?', 'gensym',
        'get-output-bytes', 'get-output-string', 'get-preference',
        'get/build-late-neg-projection', 'get/build-val-first-projection',
        'getenv', 'global-port-print-handler', 'group-by', 'group-execute-bit',
        'group-read-bit', 'group-write-bit', 'guard-evt', 'handle-evt',
        'handle-evt?', 'has-blame?', 'has-contract?', 'hash', 'hash->list',
        'hash-clear', 'hash-clear!', 'hash-copy', 'hash-copy-clear',
        'hash-count', 'hash-empty?', 'hash-eq?', 'hash-equal?', 'hash-eqv?',
        'hash-for-each', 'hash-has-key?', 'hash-iterate-first',
        'hash-iterate-key', 'hash-iterate-key+value', 'hash-iterate-next',
        'hash-iterate-pair', 'hash-iterate-value', 'hash-keys', 'hash-map',
        'hash-placeholder?', 'hash-ref', 'hash-ref!', 'hash-remove',
        'hash-remove!', 'hash-set', 'hash-set!', 'hash-set*', 'hash-set*!',
        'hash-update', 'hash-update!', 'hash-values', 'hash-weak?', 'hash/c',
        'hash?', 'hasheq', 'hasheqv', 'identifier-binding',
        'identifier-binding-symbol', 'identifier-label-binding',
        'identifier-prune-lexical-context',
        'identifier-prune-to-source-module',
        'identifier-remove-from-definition-context',
        'identifier-template-binding', 'identifier-transformer-binding',
        'identifier?', 'identity', 'if/c', 'imag-part', 'immutable?',
        'impersonate-box', 'impersonate-channel',
        'impersonate-continuation-mark-key', 'impersonate-hash',
        'impersonate-hash-set', 'impersonate-procedure',
        'impersonate-procedure*', 'impersonate-prompt-tag',
        'impersonate-struct', 'impersonate-vector', 'impersonator-contract?',
        'impersonator-ephemeron', 'impersonator-of?',
        'impersonator-prop:application-mark', 'impersonator-prop:blame',
        'impersonator-prop:contracted',
        'impersonator-property-accessor-procedure?', 'impersonator-property?',
        'impersonator?', 'implementation?', 'implementation?/c', 'in-bytes',
        'in-bytes-lines', 'in-combinations', 'in-cycle', 'in-dict',
        'in-dict-keys', 'in-dict-pairs', 'in-dict-values', 'in-directory',
        'in-hash', 'in-hash-keys', 'in-hash-pairs', 'in-hash-values',
        'in-immutable-hash', 'in-immutable-hash-keys',
        'in-immutable-hash-pairs', 'in-immutable-hash-values',
        'in-immutable-set', 'in-indexed', 'in-input-port-bytes',
        'in-input-port-chars', 'in-lines', 'in-list', 'in-mlist',
        'in-mutable-hash', 'in-mutable-hash-keys', 'in-mutable-hash-pairs',
        'in-mutable-hash-values', 'in-mutable-set', 'in-naturals',
        'in-parallel', 'in-permutations', 'in-port', 'in-producer', 'in-range',
        'in-sequences', 'in-set', 'in-slice', 'in-stream', 'in-string',
        'in-syntax', 'in-value', 'in-values*-sequence', 'in-values-sequence',
        'in-vector', 'in-weak-hash', 'in-weak-hash-keys', 'in-weak-hash-pairs',
        'in-weak-hash-values', 'in-weak-set', 'inexact->exact',
        'inexact-real?', 'inexact?', 'infinite?', 'input-port-append',
        'input-port?', 'inspector?', 'instanceof/c', 'integer->char',
        'integer->integer-bytes', 'integer-bytes->integer', 'integer-in',
        'integer-length', 'integer-sqrt', 'integer-sqrt/remainder', 'integer?',
        'interface->method-names', 'interface-extension?', 'interface?',
        'internal-definition-context-binding-identifiers',
        'internal-definition-context-introduce',
        'internal-definition-context-seal', 'internal-definition-context?',
        'is-a?', 'is-a?/c', 'keyword->string', 'keyword-apply', 'keyword<?',
        'keyword?', 'keywords-match', 'kill-thread', 'last', 'last-pair',
        'lcm', 'length', 'liberal-define-context?', 'link-exists?', 'list',
        'list*', 'list*of', 'list->bytes', 'list->mutable-set',
        'list->mutable-seteq', 'list->mutable-seteqv', 'list->set',
        'list->seteq', 'list->seteqv', 'list->string', 'list->vector',
        'list->weak-set', 'list->weak-seteq', 'list->weak-seteqv',
        'list-contract?', 'list-prefix?', 'list-ref', 'list-set', 'list-tail',
        'list-update', 'list/c', 'list?', 'listen-port-number?', 'listof',
        'load', 'load-extension', 'load-on-demand-enabled', 'load-relative',
        'load-relative-extension', 'load/cd', 'load/use-compiled',
        'local-expand', 'local-expand/capture-lifts',
        'local-transformer-expand', 'local-transformer-expand/capture-lifts',
        'locale-string-encoding', 'log', 'log-all-levels', 'log-level-evt',
        'log-level?', 'log-max-level', 'log-message', 'log-receiver?',
        'logger-name', 'logger?', 'magnitude', 'make-arity-at-least',
        'make-base-empty-namespace', 'make-base-namespace', 'make-bytes',
        'make-channel', 'make-chaperone-contract',
        'make-continuation-mark-key', 'make-continuation-prompt-tag',
        'make-contract', 'make-custodian', 'make-custodian-box',
        'make-custom-hash', 'make-custom-hash-types', 'make-custom-set',
        'make-custom-set-types', 'make-date', 'make-date*',
        'make-derived-parameter', 'make-directory', 'make-directory*',
        'make-do-sequence', 'make-empty-namespace',
        'make-environment-variables', 'make-ephemeron', 'make-exn',
        'make-exn:break', 'make-exn:break:hang-up', 'make-exn:break:terminate',
        'make-exn:fail', 'make-exn:fail:contract',
        'make-exn:fail:contract:arity', 'make-exn:fail:contract:blame',
        'make-exn:fail:contract:continuation',
        'make-exn:fail:contract:divide-by-zero',
        'make-exn:fail:contract:non-fixnum-result',
        'make-exn:fail:contract:variable', 'make-exn:fail:filesystem',
        'make-exn:fail:filesystem:errno', 'make-exn:fail:filesystem:exists',
        'make-exn:fail:filesystem:missing-module',
        'make-exn:fail:filesystem:version', 'make-exn:fail:network',
        'make-exn:fail:network:errno', 'make-exn:fail:object',
        'make-exn:fail:out-of-memory', 'make-exn:fail:read',
        'make-exn:fail:read:eof', 'make-exn:fail:read:non-char',
        'make-exn:fail:syntax', 'make-exn:fail:syntax:missing-module',
        'make-exn:fail:syntax:unbound', 'make-exn:fail:unsupported',
        'make-exn:fail:user', 'make-file-or-directory-link',
        'make-flat-contract', 'make-fsemaphore', 'make-generic',
        'make-handle-get-preference-locked', 'make-hash',
        'make-hash-placeholder', 'make-hasheq', 'make-hasheq-placeholder',
        'make-hasheqv', 'make-hasheqv-placeholder',
        'make-immutable-custom-hash', 'make-immutable-hash',
        'make-immutable-hasheq', 'make-immutable-hasheqv',
        'make-impersonator-property', 'make-input-port',
        'make-input-port/read-to-peek', 'make-inspector',
        'make-keyword-procedure', 'make-known-char-range-list',
        'make-limited-input-port', 'make-list', 'make-lock-file-name',
        'make-log-receiver', 'make-logger', 'make-mixin-contract',
        'make-mutable-custom-set', 'make-none/c', 'make-object',
        'make-output-port', 'make-parameter', 'make-parent-directory*',
        'make-phantom-bytes', 'make-pipe', 'make-pipe-with-specials',
        'make-placeholder', 'make-plumber', 'make-polar', 'make-prefab-struct',
        'make-primitive-class', 'make-proj-contract',
        'make-pseudo-random-generator', 'make-reader-graph', 'make-readtable',
        'make-rectangular', 'make-rename-transformer',
        'make-resolved-module-path', 'make-security-guard', 'make-semaphore',
        'make-set!-transformer', 'make-shared-bytes', 'make-sibling-inspector',
        'make-special-comment', 'make-srcloc', 'make-string',
        'make-struct-field-accessor', 'make-struct-field-mutator',
        'make-struct-type', 'make-struct-type-property',
        'make-syntax-delta-introducer', 'make-syntax-introducer',
        'make-temporary-file', 'make-tentative-pretty-print-output-port',
        'make-thread-cell', 'make-thread-group', 'make-vector',
        'make-weak-box', 'make-weak-custom-hash', 'make-weak-custom-set',
        'make-weak-hash', 'make-weak-hasheq', 'make-weak-hasheqv',
        'make-will-executor', 'map', 'match-equality-test',
        'matches-arity-exactly?', 'max', 'mcar', 'mcdr', 'mcons', 'member',
        'member-name-key-hash-code', 'member-name-key=?', 'member-name-key?',
        'memf', 'memq', 'memv', 'merge-input', 'method-in-interface?', 'min',
        'mixin-contract', 'module->exports', 'module->imports',
        'module->language-info', 'module->namespace',
        'module-compiled-cross-phase-persistent?', 'module-compiled-exports',
        'module-compiled-imports', 'module-compiled-language-info',
        'module-compiled-name', 'module-compiled-submodules',
        'module-declared?', 'module-path-index-join',
        'module-path-index-resolve', 'module-path-index-split',
        'module-path-index-submodule', 'module-path-index?', 'module-path?',
        'module-predefined?', 'module-provide-protected?', 'modulo', 'mpair?',
        'mutable-set', 'mutable-seteq', 'mutable-seteqv', 'n->th',
        'nack-guard-evt', 'namespace-anchor->empty-namespace',
        'namespace-anchor->namespace', 'namespace-anchor?',
        'namespace-attach-module', 'namespace-attach-module-declaration',
        'namespace-base-phase', 'namespace-mapped-symbols',
        'namespace-module-identifier', 'namespace-module-registry',
        'namespace-require', 'namespace-require/constant',
        'namespace-require/copy', 'namespace-require/expansion-time',
        'namespace-set-variable-value!', 'namespace-symbol->identifier',
        'namespace-syntax-introduce', 'namespace-undefine-variable!',
        'namespace-unprotect-module', 'namespace-variable-value', 'namespace?',
        'nan?', 'natural-number/c', 'negate', 'negative?', 'never-evt',
        'new-∀/c', 'new-∃/c', 'newline', 'ninth', 'non-empty-listof',
        'non-empty-string?', 'none/c', 'normal-case-path', 'normalize-arity',
        'normalize-path', 'normalized-arity?', 'not', 'not/c', 'null', 'null?',
        'number->string', 'number?', 'numerator', 'object%', 'object->vector',
        'object-info', 'object-interface', 'object-method-arity-includes?',
        'object-name', 'object-or-false=?', 'object=?', 'object?', 'odd?',
        'one-of/c', 'open-input-bytes', 'open-input-file',
        'open-input-output-file', 'open-input-string', 'open-output-bytes',
        'open-output-file', 'open-output-nowhere', 'open-output-string',
        'or/c', 'order-of-magnitude', 'ormap', 'other-execute-bit',
        'other-read-bit', 'other-write-bit', 'output-port?', 'pair?',
        'parameter-procedure=?', 'parameter/c', 'parameter?',
        'parameterization?', 'parse-command-line', 'partition', 'path->bytes',
        'path->complete-path', 'path->directory-path', 'path->string',
        'path-add-suffix', 'path-convention-type', 'path-element->bytes',
        'path-element->string', 'path-element?', 'path-for-some-system?',
        'path-list-string->path-list', 'path-only', 'path-replace-suffix',
        'path-string?', 'path<?', 'path?', 'pathlist-closure', 'peek-byte',
        'peek-byte-or-special', 'peek-bytes', 'peek-bytes!', 'peek-bytes!-evt',
        'peek-bytes-avail!', 'peek-bytes-avail!*', 'peek-bytes-avail!-evt',
        'peek-bytes-avail!/enable-break', 'peek-bytes-evt', 'peek-char',
        'peek-char-or-special', 'peek-string', 'peek-string!',
        'peek-string!-evt', 'peek-string-evt', 'peeking-input-port',
        'permutations', 'phantom-bytes?', 'pi', 'pi.f', 'pipe-content-length',
        'place-break', 'place-channel', 'place-channel-get',
        'place-channel-put', 'place-channel-put/get', 'place-channel?',
        'place-dead-evt', 'place-enabled?', 'place-kill', 'place-location?',
        'place-message-allowed?', 'place-sleep', 'place-wait', 'place?',
        'placeholder-get', 'placeholder-set!', 'placeholder?',
        'plumber-add-flush!', 'plumber-flush-all',
        'plumber-flush-handle-remove!', 'plumber-flush-handle?', 'plumber?',
        'poll-guard-evt', 'port->bytes', 'port->bytes-lines', 'port->lines',
        'port->list', 'port->string', 'port-closed-evt', 'port-closed?',
        'port-commit-peeked', 'port-count-lines!', 'port-count-lines-enabled',
        'port-counts-lines?', 'port-display-handler', 'port-file-identity',
        'port-file-unlock', 'port-next-location', 'port-number?',
        'port-print-handler', 'port-progress-evt',
        'port-provides-progress-evts?', 'port-read-handler',
        'port-try-file-lock?', 'port-write-handler', 'port-writes-atomic?',
        'port-writes-special?', 'port?', 'positive?', 'predicate/c',
        'prefab-key->struct-type', 'prefab-key?', 'prefab-struct-key',
        'preferences-lock-file-mode', 'pregexp', 'pregexp?', 'pretty-display',
        'pretty-format', 'pretty-print', 'pretty-print-.-symbol-without-bars',
        'pretty-print-abbreviate-read-macros', 'pretty-print-columns',
        'pretty-print-current-style-table', 'pretty-print-depth',
        'pretty-print-exact-as-decimal', 'pretty-print-extend-style-table',
        'pretty-print-handler', 'pretty-print-newline',
        'pretty-print-post-print-hook', 'pretty-print-pre-print-hook',
        'pretty-print-print-hook', 'pretty-print-print-line',
        'pretty-print-remap-stylable', 'pretty-print-show-inexactness',
        'pretty-print-size-hook', 'pretty-print-style-table?',
        'pretty-printing', 'pretty-write', 'primitive-closure?',
        'primitive-result-arity', 'primitive?', 'print', 'print-as-expression',
        'print-boolean-long-form', 'print-box', 'print-graph',
        'print-hash-table', 'print-mpair-curly-braces',
        'print-pair-curly-braces', 'print-reader-abbreviations',
        'print-struct', 'print-syntax-width', 'print-unreadable',
        'print-vector-length', 'printable/c', 'printable<%>', 'printf',
        'println', 'procedure->method', 'procedure-arity',
        'procedure-arity-includes/c', 'procedure-arity-includes?',
        'procedure-arity?', 'procedure-closure-contents-eq?',
        'procedure-extract-target', 'procedure-keywords',
        'procedure-reduce-arity', 'procedure-reduce-keyword-arity',
        'procedure-rename', 'procedure-result-arity', 'procedure-specialize',
        'procedure-struct-type?', 'procedure?', 'process', 'process*',
        'process*/ports', 'process/ports', 'processor-count', 'progress-evt?',
        'promise-forced?', 'promise-running?', 'promise/c', 'promise/name?',
        'promise?', 'prop:arity-string', 'prop:arrow-contract',
        'prop:arrow-contract-get-info', 'prop:arrow-contract?', 'prop:blame',
        'prop:chaperone-contract', 'prop:checked-procedure', 'prop:contract',
        'prop:contracted', 'prop:custom-print-quotable', 'prop:custom-write',
        'prop:dict', 'prop:dict/contract', 'prop:equal+hash', 'prop:evt',
        'prop:exn:missing-module', 'prop:exn:srclocs',
        'prop:expansion-contexts', 'prop:flat-contract',
        'prop:impersonator-of', 'prop:input-port',
        'prop:liberal-define-context', 'prop:object-name',
        'prop:opt-chaperone-contract', 'prop:opt-chaperone-contract-get-test',
        'prop:opt-chaperone-contract?', 'prop:orc-contract',
        'prop:orc-contract-get-subcontracts', 'prop:orc-contract?',
        'prop:output-port', 'prop:place-location', 'prop:procedure',
        'prop:recursive-contract', 'prop:recursive-contract-unroll',
        'prop:recursive-contract?', 'prop:rename-transformer', 'prop:sequence',
        'prop:set!-transformer', 'prop:stream', 'proper-subset?',
        'pseudo-random-generator->vector', 'pseudo-random-generator-vector?',
        'pseudo-random-generator?', 'put-preferences', 'putenv', 'quotient',
        'quotient/remainder', 'radians->degrees', 'raise',
        'raise-argument-error', 'raise-arguments-error', 'raise-arity-error',
        'raise-blame-error', 'raise-contract-error', 'raise-mismatch-error',
        'raise-not-cons-blame-error', 'raise-range-error',
        'raise-result-error', 'raise-syntax-error', 'raise-type-error',
        'raise-user-error', 'random', 'random-seed', 'range', 'rational?',
        'rationalize', 'read', 'read-accept-bar-quote', 'read-accept-box',
        'read-accept-compiled', 'read-accept-dot', 'read-accept-graph',
        'read-accept-infix-dot', 'read-accept-lang', 'read-accept-quasiquote',
        'read-accept-reader', 'read-byte', 'read-byte-or-special',
        'read-bytes', 'read-bytes!', 'read-bytes!-evt', 'read-bytes-avail!',
        'read-bytes-avail!*', 'read-bytes-avail!-evt',
        'read-bytes-avail!/enable-break', 'read-bytes-evt', 'read-bytes-line',
        'read-bytes-line-evt', 'read-case-sensitive', 'read-cdot', 'read-char',
        'read-char-or-special', 'read-curly-brace-as-paren',
        'read-curly-brace-with-tag', 'read-decimal-as-inexact',
        'read-eval-print-loop', 'read-language', 'read-line', 'read-line-evt',
        'read-on-demand-source', 'read-square-bracket-as-paren',
        'read-square-bracket-with-tag', 'read-string', 'read-string!',
        'read-string!-evt', 'read-string-evt', 'read-syntax',
        'read-syntax/recursive', 'read/recursive', 'readtable-mapping',
        'readtable?', 'real->decimal-string', 'real->double-flonum',
        'real->floating-point-bytes', 'real->single-flonum', 'real-in',
        'real-part', 'real?', 'reencode-input-port', 'reencode-output-port',
        'regexp', 'regexp-match', 'regexp-match*', 'regexp-match-evt',
        'regexp-match-exact?', 'regexp-match-peek',
        'regexp-match-peek-immediate', 'regexp-match-peek-positions',
        'regexp-match-peek-positions*',
        'regexp-match-peek-positions-immediate',
        'regexp-match-peek-positions-immediate/end',
        'regexp-match-peek-positions/end', 'regexp-match-positions',
        'regexp-match-positions*', 'regexp-match-positions/end',
        'regexp-match/end', 'regexp-match?', 'regexp-max-lookbehind',
        'regexp-quote', 'regexp-replace', 'regexp-replace*',
        'regexp-replace-quote', 'regexp-replaces', 'regexp-split',
        'regexp-try-match', 'regexp?', 'relative-path?', 'relocate-input-port',
        'relocate-output-port', 'remainder', 'remf', 'remf*', 'remove',
        'remove*', 'remove-duplicates', 'remq', 'remq*', 'remv', 'remv*',
        'rename-contract', 'rename-file-or-directory',
        'rename-transformer-target', 'rename-transformer?', 'replace-evt',
        'reroot-path', 'resolve-path', 'resolved-module-path-name',
        'resolved-module-path?', 'rest', 'reverse', 'round', 'second',
        'seconds->date', 'security-guard?', 'semaphore-peek-evt',
        'semaphore-peek-evt?', 'semaphore-post', 'semaphore-try-wait?',
        'semaphore-wait', 'semaphore-wait/enable-break', 'semaphore?',
        'sequence->list', 'sequence->stream', 'sequence-add-between',
        'sequence-andmap', 'sequence-append', 'sequence-count',
        'sequence-filter', 'sequence-fold', 'sequence-for-each',
        'sequence-generate', 'sequence-generate*', 'sequence-length',
        'sequence-map', 'sequence-ormap', 'sequence-ref', 'sequence-tail',
        'sequence/c', 'sequence?', 'set', 'set!-transformer-procedure',
        'set!-transformer?', 'set->list', 'set->stream', 'set-add', 'set-add!',
        'set-box!', 'set-clear', 'set-clear!', 'set-copy', 'set-copy-clear',
        'set-count', 'set-empty?', 'set-eq?', 'set-equal?', 'set-eqv?',
        'set-first', 'set-for-each', 'set-implements/c', 'set-implements?',
        'set-intersect', 'set-intersect!', 'set-map', 'set-mcar!', 'set-mcdr!',
        'set-member?', 'set-mutable?', 'set-phantom-bytes!',
        'set-port-next-location!', 'set-remove', 'set-remove!', 'set-rest',
        'set-some-basic-contracts!', 'set-subtract', 'set-subtract!',
        'set-symmetric-difference', 'set-symmetric-difference!', 'set-union',
        'set-union!', 'set-weak?', 'set/c', 'set=?', 'set?', 'seteq', 'seteqv',
        'seventh', 'sgn', 'shared-bytes', 'shell-execute', 'shrink-path-wrt',
        'shuffle', 'simple-form-path', 'simplify-path', 'sin',
        'single-flonum?', 'sinh', 'sixth', 'skip-projection-wrapper?', 'sleep',
        'some-system-path->string', 'sort', 'special-comment-value',
        'special-comment?', 'special-filter-input-port', 'split-at',
        'split-at-right', 'split-common-prefix', 'split-path', 'splitf-at',
        'splitf-at-right', 'sqr', 'sqrt', 'srcloc', 'srcloc->string',
        'srcloc-column', 'srcloc-line', 'srcloc-position', 'srcloc-source',
        'srcloc-span', 'srcloc?', 'stop-after', 'stop-before', 'stream->list',
        'stream-add-between', 'stream-andmap', 'stream-append', 'stream-count',
        'stream-empty?', 'stream-filter', 'stream-first', 'stream-fold',
        'stream-for-each', 'stream-length', 'stream-map', 'stream-ormap',
        'stream-ref', 'stream-rest', 'stream-tail', 'stream/c', 'stream?',
        'string', 'string->bytes/latin-1', 'string->bytes/locale',
        'string->bytes/utf-8', 'string->immutable-string', 'string->keyword',
        'string->list', 'string->number', 'string->path',
        'string->path-element', 'string->some-system-path', 'string->symbol',
        'string->uninterned-symbol', 'string->unreadable-symbol',
        'string-append', 'string-append*', 'string-ci<=?', 'string-ci<?',
        'string-ci=?', 'string-ci>=?', 'string-ci>?', 'string-contains?',
        'string-copy', 'string-copy!', 'string-downcase',
        'string-environment-variable-name?', 'string-fill!', 'string-foldcase',
        'string-join', 'string-len/c', 'string-length', 'string-locale-ci<?',
        'string-locale-ci=?', 'string-locale-ci>?', 'string-locale-downcase',
        'string-locale-upcase', 'string-locale<?', 'string-locale=?',
        'string-locale>?', 'string-no-nuls?', 'string-normalize-nfc',
        'string-normalize-nfd', 'string-normalize-nfkc',
        'string-normalize-nfkd', 'string-normalize-spaces', 'string-port?',
        'string-prefix?', 'string-ref', 'string-replace', 'string-set!',
        'string-split', 'string-suffix?', 'string-titlecase', 'string-trim',
        'string-upcase', 'string-utf-8-length', 'string<=?', 'string<?',
        'string=?', 'string>=?', 'string>?', 'string?', 'struct->vector',
        'struct-accessor-procedure?', 'struct-constructor-procedure?',
        'struct-info', 'struct-mutator-procedure?',
        'struct-predicate-procedure?', 'struct-type-info',
        'struct-type-make-constructor', 'struct-type-make-predicate',
        'struct-type-property-accessor-procedure?', 'struct-type-property/c',
        'struct-type-property?', 'struct-type?', 'struct:arity-at-least',
        'struct:arrow-contract-info', 'struct:date', 'struct:date*',
        'struct:exn', 'struct:exn:break', 'struct:exn:break:hang-up',
        'struct:exn:break:terminate', 'struct:exn:fail',
        'struct:exn:fail:contract', 'struct:exn:fail:contract:arity',
        'struct:exn:fail:contract:blame',
        'struct:exn:fail:contract:continuation',
        'struct:exn:fail:contract:divide-by-zero',
        'struct:exn:fail:contract:non-fixnum-result',
        'struct:exn:fail:contract:variable', 'struct:exn:fail:filesystem',
        'struct:exn:fail:filesystem:errno',
        'struct:exn:fail:filesystem:exists',
        'struct:exn:fail:filesystem:missing-module',
        'struct:exn:fail:filesystem:version', 'struct:exn:fail:network',
        'struct:exn:fail:network:errno', 'struct:exn:fail:object',
        'struct:exn:fail:out-of-memory', 'struct:exn:fail:read',
        'struct:exn:fail:read:eof', 'struct:exn:fail:read:non-char',
        'struct:exn:fail:syntax', 'struct:exn:fail:syntax:missing-module',
        'struct:exn:fail:syntax:unbound', 'struct:exn:fail:unsupported',
        'struct:exn:fail:user', 'struct:srcloc',
        'struct:wrapped-extra-arg-arrow', 'struct?', 'sub1', 'subbytes',
        'subclass?', 'subclass?/c', 'subprocess', 'subprocess-group-enabled',
        'subprocess-kill', 'subprocess-pid', 'subprocess-status',
        'subprocess-wait', 'subprocess?', 'subset?', 'substring', 'suggest/c',
        'symbol->string', 'symbol-interned?', 'symbol-unreadable?', 'symbol<?',
        'symbol=?', 'symbol?', 'symbols', 'sync', 'sync/enable-break',
        'sync/timeout', 'sync/timeout/enable-break', 'syntax->datum',
        'syntax->list', 'syntax-arm', 'syntax-column', 'syntax-debug-info',
        'syntax-disarm', 'syntax-e', 'syntax-line',
        'syntax-local-bind-syntaxes', 'syntax-local-certifier',
        'syntax-local-context', 'syntax-local-expand-expression',
        'syntax-local-get-shadower', 'syntax-local-identifier-as-binding',
        'syntax-local-introduce', 'syntax-local-lift-context',
        'syntax-local-lift-expression', 'syntax-local-lift-module',
        'syntax-local-lift-module-end-declaration',
        'syntax-local-lift-provide', 'syntax-local-lift-require',
        'syntax-local-lift-values-expression',
        'syntax-local-make-definition-context',
        'syntax-local-make-delta-introducer',
        'syntax-local-module-defined-identifiers',
        'syntax-local-module-exports',
        'syntax-local-module-required-identifiers', 'syntax-local-name',
        'syntax-local-phase-level', 'syntax-local-submodules',
        'syntax-local-transforming-module-provides?', 'syntax-local-value',
        'syntax-local-value/immediate', 'syntax-original?', 'syntax-position',
        'syntax-property', 'syntax-property-preserved?',
        'syntax-property-symbol-keys', 'syntax-protect', 'syntax-rearm',
        'syntax-recertify', 'syntax-shift-phase-level', 'syntax-source',
        'syntax-source-module', 'syntax-span', 'syntax-taint',
        'syntax-tainted?', 'syntax-track-origin',
        'syntax-transforming-module-expression?',
        'syntax-transforming-with-lifts?', 'syntax-transforming?', 'syntax/c',
        'syntax?', 'system', 'system*', 'system*/exit-code',
        'system-big-endian?', 'system-idle-evt', 'system-language+country',
        'system-library-subpath', 'system-path-convention-type', 'system-type',
        'system/exit-code', 'tail-marks-match?', 'take', 'take-common-prefix',
        'take-right', 'takef', 'takef-right', 'tan', 'tanh',
        'tcp-abandon-port', 'tcp-accept', 'tcp-accept-evt',
        'tcp-accept-ready?', 'tcp-accept/enable-break', 'tcp-addresses',
        'tcp-close', 'tcp-connect', 'tcp-connect/enable-break', 'tcp-listen',
        'tcp-listener?', 'tcp-port?', 'tentative-pretty-print-port-cancel',
        'tentative-pretty-print-port-transfer', 'tenth', 'terminal-port?',
        'the-unsupplied-arg', 'third', 'thread', 'thread-cell-ref',
        'thread-cell-set!', 'thread-cell-values?', 'thread-cell?',
        'thread-dead-evt', 'thread-dead?', 'thread-group?', 'thread-receive',
        'thread-receive-evt', 'thread-resume', 'thread-resume-evt',
        'thread-rewind-receive', 'thread-running?', 'thread-send',
        'thread-suspend', 'thread-suspend-evt', 'thread-try-receive',
        'thread-wait', 'thread/suspend-to-kill', 'thread?', 'time-apply',
        'touch', 'transplant-input-port', 'transplant-output-port', 'true',
        'truncate', 'udp-addresses', 'udp-bind!', 'udp-bound?', 'udp-close',
        'udp-connect!', 'udp-connected?', 'udp-multicast-interface',
        'udp-multicast-join-group!', 'udp-multicast-leave-group!',
        'udp-multicast-loopback?', 'udp-multicast-set-interface!',
        'udp-multicast-set-loopback!', 'udp-multicast-set-ttl!',
        'udp-multicast-ttl', 'udp-open-socket', 'udp-receive!',
        'udp-receive!*', 'udp-receive!-evt', 'udp-receive!/enable-break',
        'udp-receive-ready-evt', 'udp-send', 'udp-send*', 'udp-send-evt',
        'udp-send-ready-evt', 'udp-send-to', 'udp-send-to*', 'udp-send-to-evt',
        'udp-send-to/enable-break', 'udp-send/enable-break', 'udp?', 'unbox',
        'uncaught-exception-handler', 'unit?', 'unspecified-dom',
        'unsupplied-arg?', 'use-collection-link-paths',
        'use-compiled-file-paths', 'use-user-specific-search-paths',
        'user-execute-bit', 'user-read-bit', 'user-write-bit', 'value-blame',
        'value-contract', 'values', 'variable-reference->empty-namespace',
        'variable-reference->module-base-phase',
        'variable-reference->module-declaration-inspector',
        'variable-reference->module-path-index',
        'variable-reference->module-source', 'variable-reference->namespace',
        'variable-reference->phase',
        'variable-reference->resolved-module-path',
        'variable-reference-constant?', 'variable-reference?', 'vector',
        'vector->immutable-vector', 'vector->list',
        'vector->pseudo-random-generator', 'vector->pseudo-random-generator!',
        'vector->values', 'vector-append', 'vector-argmax', 'vector-argmin',
        'vector-copy', 'vector-copy!', 'vector-count', 'vector-drop',
        'vector-drop-right', 'vector-fill!', 'vector-filter',
        'vector-filter-not', 'vector-immutable', 'vector-immutable/c',
        'vector-immutableof', 'vector-length', 'vector-map', 'vector-map!',
        'vector-member', 'vector-memq', 'vector-memv', 'vector-ref',
        'vector-set!', 'vector-set*!', 'vector-set-performance-stats!',
        'vector-split-at', 'vector-split-at-right', 'vector-take',
        'vector-take-right', 'vector/c', 'vector?', 'vectorof', 'version',
        'void', 'void?', 'weak-box-value', 'weak-box?', 'weak-set',
        'weak-seteq', 'weak-seteqv', 'will-execute', 'will-executor?',
        'will-register', 'will-try-execute', 'with-input-from-bytes',
        'with-input-from-file', 'with-input-from-string',
        'with-output-to-bytes', 'with-output-to-file', 'with-output-to-string',
        'would-be-future', 'wrap-evt', 'wrapped-extra-arg-arrow',
        'wrapped-extra-arg-arrow-extra-neg-party-argument',
        'wrapped-extra-arg-arrow-real-func', 'wrapped-extra-arg-arrow?',
        'writable<%>', 'write', 'write-byte', 'write-bytes',
        'write-bytes-avail', 'write-bytes-avail*', 'write-bytes-avail-evt',
        'write-bytes-avail/enable-break', 'write-char', 'write-special',
        'write-special-avail*', 'write-special-evt', 'write-string',
        'write-to-file', 'writeln', 'xor', 'zero?', '~.a', '~.s', '~.v', '~a',
        '~e', '~r', '~s', '~v'
    )

    _opening_parenthesis = r'[([{]'
    _closing_parenthesis = r'[)\]}]'
    _delimiters = r'()[\]{}",\'`;\s'
    _symbol = rf'(?:\|[^|]*\||\\[\w\W]|[^|\\{_delimiters}]+)+'
    _exact_decimal_prefix = r'(?:#e)?(?:#d)?(?:#e)?'
    _exponent = r'(?:[defls][-+]?\d+)'
    _inexact_simple_no_hashes = r'(?:\d+(?:/\d+|\.\d*)?|\.\d+)'
    _inexact_simple = (rf'(?:{_inexact_simple_no_hashes}|(?:\d+#+(?:\.#*|/\d+#*)?|\.\d+#+|'
                       r'\d+(?:\.\d*#+|/\d+#+)))')
    _inexact_normal_no_hashes = rf'(?:{_inexact_simple_no_hashes}{_exponent}?)'
    _inexact_normal = rf'(?:{_inexact_simple}{_exponent}?)'
    _inexact_special = r'(?:(?:inf|nan)\.[0f])'
    _inexact_real = rf'(?:[-+]?{_inexact_normal}|[-+]{_inexact_special})'
    _inexact_unsigned = rf'(?:{_inexact_normal}|{_inexact_special})'

    tokens = {
        'root': [
            (_closing_parenthesis, Error),
            (r'(?!\Z)', Text, 'unquoted-datum')
        ],
        'datum': [
            (r'(?s)#;|#![ /]([^\\\n]|\\.)*', Comment),
            (r';[^\n\r\x85\u2028\u2029]*', Comment.Single),
            (r'#\|', Comment.Multiline, 'block-comment'),

            # Whitespaces
            (r'(?u)\s+', Whitespace),

            # Numbers: Keep in mind Racket reader hash prefixes, which
            # can denote the base or the type. These don't map neatly
            # onto Pygments token types; some judgment calls here.

            # #d or no prefix
            (rf'(?i){_exact_decimal_prefix}[-+]?\d+(?=[{_delimiters}])',
             Number.Integer, '#pop'),
            (rf'(?i){_exact_decimal_prefix}[-+]?(\d+(\.\d*)?|\.\d+)([deflst][-+]?\d+)?(?=[{_delimiters}])', Number.Float, '#pop'),
            (rf'(?i){_exact_decimal_prefix}[-+]?({_inexact_normal_no_hashes}([-+]{_inexact_normal_no_hashes}?i)?|[-+]{_inexact_normal_no_hashes}?i)(?=[{_delimiters}])', Number, '#pop'),

            # Inexact without explicit #i
            (rf'(?i)(#d)?({_inexact_real}([-+]{_inexact_unsigned}?i)?|[-+]{_inexact_unsigned}?i|{_inexact_real}@{_inexact_real})(?=[{_delimiters}])', Number.Float,
             '#pop'),

            # The remaining extflonums
            (rf'(?i)(([-+]?{_inexact_simple}t[-+]?\d+)|[-+](inf|nan)\.t)(?=[{_delimiters}])', Number.Float, '#pop'),

            # #b
            (rf'(?iu)(#[ei])?#b{_symbol}', Number.Bin, '#pop'),

            # #o
            (rf'(?iu)(#[ei])?#o{_symbol}', Number.Oct, '#pop'),

            # #x
            (rf'(?iu)(#[ei])?#x{_symbol}', Number.Hex, '#pop'),

            # #i is always inexact, i.e. float
            (rf'(?iu)(#d)?#i{_symbol}', Number.Float, '#pop'),

            # Strings and characters
            (r'#?"', String.Double, ('#pop', 'string')),
            (r'#<<(.+)\n(^(?!\1$).*$\n)*^\1$', String.Heredoc, '#pop'),
            (r'#\\(u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8})', String.Char, '#pop'),
            (r'(?is)#\\([0-7]{3}|[a-z]+|.)', String.Char, '#pop'),
            (r'(?s)#[pr]x#?"(\\?.)*?"', String.Regex, '#pop'),

            # Constants
            (r'#(true|false|[tTfF])', Name.Constant, '#pop'),

            # Keyword argument names (e.g. #:keyword)
            (rf'#:{_symbol}', Keyword.Declaration, '#pop'),

            # Reader extensions
            (r'(#lang |#!)(\S+)',
             bygroups(Keyword.Namespace, Name.Namespace)),
            (r'#reader', Keyword.Namespace, 'quoted-datum'),

            # Other syntax
            (rf"(?i)\.(?=[{_delimiters}])|#c[is]|#['`]|#,@?", Operator),
            (rf"'|#[s&]|#hash(eqv?)?|#\d*(?={_opening_parenthesis})",
             Operator, ('#pop', 'quoted-datum'))
        ],
        'datum*': [
            (r'`|,@?', Operator),
            (_symbol, String.Symbol, '#pop'),
            (r'[|\\]', Error),
            default('#pop')
        ],
        'list': [
            (_closing_parenthesis, Punctuation, '#pop')
        ],
        'unquoted-datum': [
            include('datum'),
            (rf'quote(?=[{_delimiters}])', Keyword,
             ('#pop', 'quoted-datum')),
            (r'`', Operator, ('#pop', 'quasiquoted-datum')),
            (rf'quasiquote(?=[{_delimiters}])', Keyword,
             ('#pop', 'quasiquoted-datum')),
            (_opening_parenthesis, Punctuation, ('#pop', 'unquoted-list')),
            (words(_keywords, suffix=f'(?=[{_delimiters}])'),
             Keyword, '#pop'),
            (words(_builtins, suffix=f'(?=[{_delimiters}])'),
             Name.Builtin, '#pop'),
            (_symbol, Name, '#pop'),
            include('datum*')
        ],
        'unquoted-list': [
            include('list'),
            (r'(?!\Z)', Text, 'unquoted-datum')
        ],
        'quasiquoted-datum': [
            include('datum'),
            (r',@?', Operator, ('#pop', 'unquoted-datum')),
            (rf'unquote(-splicing)?(?=[{_delimiters}])', Keyword,
             ('#pop', 'unquoted-datum')),
            (_opening_parenthesis, Punctuation, ('#pop', 'quasiquoted-list')),
            include('datum*')
        ],
        'quasiquoted-list': [
            include('list'),
            (r'(?!\Z)', Text, 'quasiquoted-datum')
        ],
        'quoted-datum': [
            include('datum'),
            (_opening_parenthesis, Punctuation, ('#pop', 'quoted-list')),
            include('datum*')
        ],
        'quoted-list': [
            include('list'),
            (r'(?!\Z)', Text, 'quoted-datum')
        ],
        'block-comment': [
            (r'#\|', Comment.Multiline, '#push'),
            (r'\|#', Comment.Multiline, '#pop'),
            (r'[^#|]+|.', Comment.Multiline)
        ],
        'string': [
            (r'"', String.Double, '#pop'),
            (r'(?s)\\([0-7]{1,3}|x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|'
             r'U[\da-fA-F]{1,8}|.)', String.Escape),
            (r'[^\\"]+', String.Double)
        ]
    }


class NewLispLexer(RegexLexer):
    """
    For newLISP source code (version 10.3.0).
    """

    name = 'NewLisp'
    url = 'http://www.newlisp.org/'
    aliases = ['newlisp']
    filenames = ['*.lsp', '*.nl', '*.kif']
    mimetypes = ['text/x-newlisp', 'application/x-newlisp']
    version_added = '1.5'

    flags = re.IGNORECASE | re.MULTILINE

    # list of built-in functions for newLISP version 10.3
    builtins = (
        '^', '--', '-', ':', '!', '!=', '?', '@', '*', '/', '&', '%', '+', '++',
        '<', '<<', '<=', '=', '>', '>=', '>>', '|', '~', '$', '$0', '$1', '$10',
        '$11', '$12', '$13', '$14', '$15', '$2', '$3', '$4', '$5', '$6', '$7',
        '$8', '$9', '$args', '$idx', '$it', '$main-args', 'abort', 'abs',
        'acos', 'acosh', 'add', 'address', 'amb', 'and',  'append-file',
        'append', 'apply', 'args', 'array-list', 'array?', 'array', 'asin',
        'asinh', 'assoc', 'atan', 'atan2', 'atanh', 'atom?', 'base64-dec',
        'base64-enc', 'bayes-query', 'bayes-train', 'begin',
        'beta', 'betai', 'bind', 'binomial', 'bits', 'callback',
        'case', 'catch', 'ceil', 'change-dir', 'char', 'chop', 'Class', 'clean',
        'close', 'command-event', 'cond', 'cons', 'constant',
        'context?', 'context', 'copy-file', 'copy', 'cos', 'cosh', 'count',
        'cpymem', 'crc32', 'crit-chi2', 'crit-z', 'current-line', 'curry',
        'date-list', 'date-parse', 'date-value', 'date', 'debug', 'dec',
        'def-new', 'default', 'define-macro', 'define',
        'delete-file', 'delete-url', 'delete', 'destroy', 'det', 'device',
        'difference', 'directory?', 'directory', 'div', 'do-until', 'do-while',
        'doargs',  'dolist',  'dostring', 'dotimes',  'dotree', 'dump', 'dup',
        'empty?', 'encrypt', 'ends-with', 'env', 'erf', 'error-event',
        'eval-string', 'eval', 'exec', 'exists', 'exit', 'exp', 'expand',
        'explode', 'extend', 'factor', 'fft', 'file-info', 'file?', 'filter',
        'find-all', 'find', 'first', 'flat', 'float?', 'float', 'floor', 'flt',
        'fn', 'for-all', 'for', 'fork', 'format', 'fv', 'gammai', 'gammaln',
        'gcd', 'get-char', 'get-float', 'get-int', 'get-long', 'get-string',
        'get-url', 'global?', 'global', 'if-not', 'if', 'ifft', 'import', 'inc',
        'index', 'inf?', 'int', 'integer?', 'integer', 'intersect', 'invert',
        'irr', 'join', 'lambda-macro', 'lambda?', 'lambda', 'last-error',
        'last', 'legal?', 'length', 'let', 'letex', 'letn',
        'list?', 'list', 'load', 'local', 'log', 'lookup',
        'lower-case', 'macro?', 'main-args', 'MAIN', 'make-dir', 'map', 'mat',
        'match', 'max', 'member', 'min', 'mod', 'module', 'mul', 'multiply',
        'NaN?', 'net-accept', 'net-close', 'net-connect', 'net-error',
        'net-eval', 'net-interface', 'net-ipv', 'net-listen', 'net-local',
        'net-lookup', 'net-packet', 'net-peek', 'net-peer', 'net-ping',
        'net-receive-from', 'net-receive-udp', 'net-receive', 'net-select',
        'net-send-to', 'net-send-udp', 'net-send', 'net-service',
        'net-sessions', 'new', 'nil?', 'nil', 'normal', 'not', 'now', 'nper',
        'npv', 'nth', 'null?', 'number?', 'open', 'or', 'ostype', 'pack',
        'parse-date', 'parse', 'peek', 'pipe', 'pmt', 'pop-assoc', 'pop',
        'post-url', 'pow', 'prefix', 'pretty-print', 'primitive?', 'print',
        'println', 'prob-chi2', 'prob-z', 'process', 'prompt-event',
        'protected?', 'push', 'put-url', 'pv', 'quote?', 'quote', 'rand',
        'random', 'randomize', 'read', 'read-char', 'read-expr', 'read-file',
        'read-key', 'read-line', 'read-utf8', 'reader-event',
        'real-path', 'receive', 'ref-all', 'ref', 'regex-comp', 'regex',
        'remove-dir', 'rename-file', 'replace', 'reset', 'rest', 'reverse',
        'rotate', 'round', 'save', 'search', 'seed', 'seek', 'select', 'self',
        'semaphore', 'send', 'sequence', 'series', 'set-locale', 'set-ref-all',
        'set-ref', 'set', 'setf',  'setq', 'sgn', 'share', 'signal', 'silent',
        'sin', 'sinh', 'sleep', 'slice', 'sort', 'source', 'spawn', 'sqrt',
        'starts-with', 'string?', 'string', 'sub', 'swap', 'sym', 'symbol?',
        'symbols', 'sync', 'sys-error', 'sys-info', 'tan', 'tanh', 'term',
        'throw-error', 'throw', 'time-of-day', 'time', 'timer', 'title-case',
        'trace-highlight', 'trace', 'transpose', 'Tree', 'trim', 'true?',
        'true', 'unicode', 'unify', 'unique', 'unless', 'unpack', 'until',
        'upper-case', 'utf8', 'utf8len', 'uuid', 'wait-pid', 'when', 'while',
        'write', 'write-char', 'write-file', 'write-line',
        'xfer-event', 'xml-error', 'xml-parse', 'xml-type-tags', 'zero?',
    )

    # valid names
    valid_name = r'([\w!$%&*+.,/<=>?@^~|-])+|(\[.*?\])+'

    tokens = {
        'root': [
            # shebang
            (r'#!(.*?)$', Comment.Preproc),
            # comments starting with semicolon
            (r';.*$', Comment.Single),
            # comments starting with #
            (r'#.*$', Comment.Single),

            # whitespace
            (r'\s+', Whitespace),

            # strings, symbols and characters
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),

            # braces
            (r'\{', String, "bracestring"),

            # [text] ... [/text] delimited strings
            (r'\[text\]*', String, "tagstring"),

            # 'special' operators...
            (r"('|:)", Operator),

            # highlight the builtins
            (words(builtins, suffix=r'\b'),
             Keyword),

            # the remaining functions
            (r'(?<=\()' + valid_name, Name.Variable),

            # the remaining variables
            (valid_name, String.Symbol),

            # parentheses
            (r'(\(|\))', Punctuation),
        ],

        # braced strings...
        'bracestring': [
            (r'\{', String, "#push"),
            (r'\}', String, "#pop"),
            ('[^{}]+', String),
        ],

        # tagged [text]...[/text] delimited strings...
        'tagstring': [
            (r'(?s)(.*?)(\[/text\])', String, '#pop'),
        ],
    }


class EmacsLispLexer(RegexLexer):
    """
    An ELisp lexer, parsing a stream and outputting the tokens
    needed to highlight elisp code.
    """
    name = 'EmacsLisp'
    aliases = ['emacs-lisp', 'elisp', 'emacs']
    filenames = ['*.el']
    mimetypes = ['text/x-elisp', 'application/x-elisp']
    url = 'https://www.gnu.org/software/emacs'
    version_added = '2.1'

    flags = re.MULTILINE

    # couple of useful regexes

    # characters that are not macro-characters and can be used to begin a symbol
    nonmacro = r'\\.|[\w!$%&*+-/<=>?@^{}~|]'
    constituent = nonmacro + '|[#.:]'
    terminated = r'(?=[ "()\]\'\n,;`])'  # whitespace or terminating macro characters

    # symbol token, reverse-engineered from hyperspec
    # Take a deep breath...
    symbol = rf'((?:{nonmacro})(?:{constituent})*)'

    macros = {
        'atomic-change-group', 'case', 'block', 'cl-block', 'cl-callf', 'cl-callf2',
        'cl-case', 'cl-decf', 'cl-declaim', 'cl-declare',
        'cl-define-compiler-macro', 'cl-defmacro', 'cl-defstruct',
        'cl-defsubst', 'cl-deftype', 'cl-defun', 'cl-destructuring-bind',
        'cl-do', 'cl-do*', 'cl-do-all-symbols', 'cl-do-symbols', 'cl-dolist',
        'cl-dotimes', 'cl-ecase', 'cl-etypecase', 'eval-when', 'cl-eval-when', 'cl-flet',
        'cl-flet*', 'cl-function', 'cl-incf', 'cl-labels', 'cl-letf',
        'cl-letf*', 'cl-load-time-value', 'cl-locally', 'cl-loop',
        'cl-macrolet', 'cl-multiple-value-bind', 'cl-multiple-value-setq',
        'cl-progv', 'cl-psetf', 'cl-psetq', 'cl-pushnew', 'cl-remf',
        'cl-return', 'cl-return-from', 'cl-rotatef', 'cl-shiftf',
        'cl-symbol-macrolet', 'cl-tagbody', 'cl-the', 'cl-typecase',
        'combine-after-change-calls', 'condition-case-unless-debug', 'decf',
        'declaim', 'declare', 'declare-function', 'def-edebug-spec',
        'defadvice', 'defclass', 'defcustom', 'defface', 'defgeneric',
        'defgroup', 'define-advice', 'define-alternatives',
        'define-compiler-macro', 'define-derived-mode', 'define-generic-mode',
        'define-global-minor-mode', 'define-globalized-minor-mode',
        'define-minor-mode', 'define-modify-macro',
        'define-obsolete-face-alias', 'define-obsolete-function-alias',
        'define-obsolete-variable-alias', 'define-setf-expander',
        'define-skeleton', 'defmacro', 'defmethod', 'defsetf', 'defstruct',
        'defsubst', 'deftheme', 'deftype', 'defun', 'defvar-local',
        'delay-mode-hooks', 'destructuring-bind', 'do', 'do*',
        'do-all-symbols', 'do-symbols', 'dolist', 'dont-compile', 'dotimes',
        'dotimes-with-progress-reporter', 'ecase', 'ert-deftest', 'etypecase',
        'eval-and-compile', 'eval-when-compile', 'flet', 'ignore-errors',
        'incf', 'labels', 'lambda', 'letrec', 'lexical-let', 'lexical-let*',
        'loop', 'multiple-value-bind', 'multiple-value-setq', 'noreturn',
        'oref', 'oref-default', 'oset', 'oset-default', 'pcase',
        'pcase-defmacro', 'pcase-dolist', 'pcase-exhaustive', 'pcase-let',
        'pcase-let*', 'pop', 'psetf', 'psetq', 'push', 'pushnew', 'remf',
        'return', 'rotatef', 'rx', 'save-match-data', 'save-selected-window',
        'save-window-excursion', 'setf', 'setq-local', 'shiftf',
        'track-mouse', 'typecase', 'unless', 'use-package', 'when',
        'while-no-input', 'with-case-table', 'with-category-table',
        'with-coding-priority', 'with-current-buffer', 'with-demoted-errors',
        'with-eval-after-load', 'with-file-modes', 'with-local-quit',
        'with-output-to-string', 'with-output-to-temp-buffer',
        'with-parsed-tramp-file-name', 'with-selected-frame',
        'with-selected-window', 'with-silent-modifications', 'with-slots',
        'with-syntax-table', 'with-temp-buffer', 'with-temp-file',
        'with-temp-message', 'with-timeout', 'with-tramp-connection-property',
        'with-tramp-file-property', 'with-tramp-progress-reporter',
        'with-wrapper-hook', 'load-time-value', 'locally', 'macrolet', 'progv',
        'return-from',
    }

    special_forms = {
        'and', 'catch', 'cond', 'condition-case', 'defconst', 'defvar',
        'function', 'if', 'interactive', 'let', 'let*', 'or', 'prog1',
        'prog2', 'progn', 'quote', 'save-current-buffer', 'save-excursion',
        'save-restriction', 'setq', 'setq-default', 'subr-arity',
        'unwind-protect', 'while',
    }

    builtin_function = {
        '%', '*', '+', '-', '/', '/=', '1+', '1-', '<', '<=', '=', '>', '>=',
        'Snarf-documentation', 'abort-recursive-edit', 'abs',
        'accept-process-output', 'access-file', 'accessible-keymaps', 'acos',
        'active-minibuffer-window', 'add-face-text-property',
        'add-name-to-file', 'add-text-properties', 'all-completions',
        'append', 'apply', 'apropos-internal', 'aref', 'arrayp', 'aset',
        'ash', 'asin', 'assoc', 'assoc-string', 'assq', 'atan', 'atom',
        'autoload', 'autoload-do-load', 'backtrace', 'backtrace--locals',
        'backtrace-debug', 'backtrace-eval', 'backtrace-frame',
        'backward-char', 'backward-prefix-chars', 'barf-if-buffer-read-only',
        'base64-decode-region', 'base64-decode-string',
        'base64-encode-region', 'base64-encode-string', 'beginning-of-line',
        'bidi-find-overridden-directionality', 'bidi-resolved-levels',
        'bitmap-spec-p', 'bobp', 'bolp', 'bool-vector',
        'bool-vector-count-consecutive', 'bool-vector-count-population',
        'bool-vector-exclusive-or', 'bool-vector-intersection',
        'bool-vector-not', 'bool-vector-p', 'bool-vector-set-difference',
        'bool-vector-subsetp', 'bool-vector-union', 'boundp',
        'buffer-base-buffer', 'buffer-chars-modified-tick',
        'buffer-enable-undo', 'buffer-file-name', 'buffer-has-markers-at',
        'buffer-list', 'buffer-live-p', 'buffer-local-value',
        'buffer-local-variables', 'buffer-modified-p', 'buffer-modified-tick',
        'buffer-name', 'buffer-size', 'buffer-string', 'buffer-substring',
        'buffer-substring-no-properties', 'buffer-swap-text', 'bufferp',
        'bury-buffer-internal', 'byte-code', 'byte-code-function-p',
        'byte-to-position', 'byte-to-string', 'byteorder',
        'call-interactively', 'call-last-kbd-macro', 'call-process',
        'call-process-region', 'cancel-kbd-macro-events', 'capitalize',
        'capitalize-region', 'capitalize-word', 'car', 'car-less-than-car',
        'car-safe', 'case-table-p', 'category-docstring',
        'category-set-mnemonics', 'category-table', 'category-table-p',
        'ccl-execute', 'ccl-execute-on-string', 'ccl-program-p', 'cdr',
        'cdr-safe', 'ceiling', 'char-after', 'char-before',
        'char-category-set', 'char-charset', 'char-equal', 'char-or-string-p',
        'char-resolve-modifiers', 'char-syntax', 'char-table-extra-slot',
        'char-table-p', 'char-table-parent', 'char-table-range',
        'char-table-subtype', 'char-to-string', 'char-width', 'characterp',
        'charset-after', 'charset-id-internal', 'charset-plist',
        'charset-priority-list', 'charsetp', 'check-coding-system',
        'check-coding-systems-region', 'clear-buffer-auto-save-failure',
        'clear-charset-maps', 'clear-face-cache', 'clear-font-cache',
        'clear-image-cache', 'clear-string', 'clear-this-command-keys',
        'close-font', 'clrhash', 'coding-system-aliases',
        'coding-system-base', 'coding-system-eol-type', 'coding-system-p',
        'coding-system-plist', 'coding-system-priority-list',
        'coding-system-put', 'color-distance', 'color-gray-p',
        'color-supported-p', 'combine-after-change-execute',
        'command-error-default-function', 'command-remapping', 'commandp',
        'compare-buffer-substrings', 'compare-strings',
        'compare-window-configurations', 'completing-read',
        'compose-region-internal', 'compose-string-internal',
        'composition-get-gstring', 'compute-motion', 'concat', 'cons',
        'consp', 'constrain-to-field', 'continue-process',
        'controlling-tty-p', 'coordinates-in-window-p', 'copy-alist',
        'copy-category-table', 'copy-file', 'copy-hash-table', 'copy-keymap',
        'copy-marker', 'copy-sequence', 'copy-syntax-table', 'copysign',
        'cos', 'current-active-maps', 'current-bidi-paragraph-direction',
        'current-buffer', 'current-case-table', 'current-column',
        'current-global-map', 'current-idle-time', 'current-indentation',
        'current-input-mode', 'current-local-map', 'current-message',
        'current-minor-mode-maps', 'current-time', 'current-time-string',
        'current-time-zone', 'current-window-configuration',
        'cygwin-convert-file-name-from-windows',
        'cygwin-convert-file-name-to-windows', 'daemon-initialized',
        'daemonp', 'dbus--init-bus', 'dbus-get-unique-name',
        'dbus-message-internal', 'debug-timer-check', 'declare-equiv-charset',
        'decode-big5-char', 'decode-char', 'decode-coding-region',
        'decode-coding-string', 'decode-sjis-char', 'decode-time',
        'default-boundp', 'default-file-modes', 'default-printer-name',
        'default-toplevel-value', 'default-value', 'define-category',
        'define-charset-alias', 'define-charset-internal',
        'define-coding-system-alias', 'define-coding-system-internal',
        'define-fringe-bitmap', 'define-hash-table-test', 'define-key',
        'define-prefix-command', 'delete',
        'delete-all-overlays', 'delete-and-extract-region', 'delete-char',
        'delete-directory-internal', 'delete-field', 'delete-file',
        'delete-frame', 'delete-other-windows-internal', 'delete-overlay',
        'delete-process', 'delete-region', 'delete-terminal',
        'delete-window-internal', 'delq', 'describe-buffer-bindings',
        'describe-vector', 'destroy-fringe-bitmap', 'detect-coding-region',
        'detect-coding-string', 'ding', 'directory-file-name',
        'directory-files', 'directory-files-and-attributes', 'discard-input',
        'display-supports-face-attributes-p', 'do-auto-save', 'documentation',
        'documentation-property', 'downcase', 'downcase-region',
        'downcase-word', 'draw-string', 'dump-colors', 'dump-emacs',
        'dump-face', 'dump-frame-glyph-matrix', 'dump-glyph-matrix',
        'dump-glyph-row', 'dump-redisplay-history', 'dump-tool-bar-row',
        'elt', 'emacs-pid', 'encode-big5-char', 'encode-char',
        'encode-coding-region', 'encode-coding-string', 'encode-sjis-char',
        'encode-time', 'end-kbd-macro', 'end-of-line', 'eobp', 'eolp', 'eq',
        'eql', 'equal', 'equal-including-properties', 'erase-buffer',
        'error-message-string', 'eval', 'eval-buffer', 'eval-region',
        'event-convert-list', 'execute-kbd-macro', 'exit-recursive-edit',
        'exp', 'expand-file-name', 'expt', 'external-debugging-output',
        'face-attribute-relative-p', 'face-attributes-as-vector', 'face-font',
        'fboundp', 'fceiling', 'fetch-bytecode', 'ffloor',
        'field-beginning', 'field-end', 'field-string',
        'field-string-no-properties', 'file-accessible-directory-p',
        'file-acl', 'file-attributes', 'file-attributes-lessp',
        'file-directory-p', 'file-executable-p', 'file-exists-p',
        'file-locked-p', 'file-modes', 'file-name-absolute-p',
        'file-name-all-completions', 'file-name-as-directory',
        'file-name-completion', 'file-name-directory',
        'file-name-nondirectory', 'file-newer-than-file-p', 'file-readable-p',
        'file-regular-p', 'file-selinux-context', 'file-symlink-p',
        'file-system-info', 'file-system-info', 'file-writable-p',
        'fillarray', 'find-charset-region', 'find-charset-string',
        'find-coding-systems-region-internal', 'find-composition-internal',
        'find-file-name-handler', 'find-font', 'find-operation-coding-system',
        'float', 'float-time', 'floatp', 'floor', 'fmakunbound',
        'following-char', 'font-at', 'font-drive-otf', 'font-face-attributes',
        'font-family-list', 'font-get', 'font-get-glyphs',
        'font-get-system-font', 'font-get-system-normal-font', 'font-info',
        'font-match-p', 'font-otf-alternates', 'font-put',
        'font-shape-gstring', 'font-spec', 'font-variation-glyphs',
        'font-xlfd-name', 'fontp', 'fontset-font', 'fontset-info',
        'fontset-list', 'fontset-list-all', 'force-mode-line-update',
        'force-window-update', 'format', 'format-mode-line',
        'format-network-address', 'format-time-string', 'forward-char',
        'forward-comment', 'forward-line', 'forward-word',
        'frame-border-width', 'frame-bottom-divider-width',
        'frame-can-run-window-configuration-change-hook', 'frame-char-height',
        'frame-char-width', 'frame-face-alist', 'frame-first-window',
        'frame-focus', 'frame-font-cache', 'frame-fringe-width', 'frame-list',
        'frame-live-p', 'frame-or-buffer-changed-p', 'frame-parameter',
        'frame-parameters', 'frame-pixel-height', 'frame-pixel-width',
        'frame-pointer-visible-p', 'frame-right-divider-width',
        'frame-root-window', 'frame-scroll-bar-height',
        'frame-scroll-bar-width', 'frame-selected-window', 'frame-terminal',
        'frame-text-cols', 'frame-text-height', 'frame-text-lines',
        'frame-text-width', 'frame-total-cols', 'frame-total-lines',
        'frame-visible-p', 'framep', 'frexp', 'fringe-bitmaps-at-pos',
        'fround', 'fset', 'ftruncate', 'funcall', 'funcall-interactively',
        'function-equal', 'functionp', 'gap-position', 'gap-size',
        'garbage-collect', 'gc-status', 'generate-new-buffer-name', 'get',
        'get-buffer', 'get-buffer-create', 'get-buffer-process',
        'get-buffer-window', 'get-byte', 'get-char-property',
        'get-char-property-and-overlay', 'get-file-buffer', 'get-file-char',
        'get-internal-run-time', 'get-load-suffixes', 'get-pos-property',
        'get-process', 'get-screen-color', 'get-text-property',
        'get-unicode-property-internal', 'get-unused-category',
        'get-unused-iso-final-char', 'getenv-internal', 'gethash',
        'gfile-add-watch', 'gfile-rm-watch', 'global-key-binding',
        'gnutls-available-p', 'gnutls-boot', 'gnutls-bye', 'gnutls-deinit',
        'gnutls-error-fatalp', 'gnutls-error-string', 'gnutls-errorp',
        'gnutls-get-initstage', 'gnutls-peer-status',
        'gnutls-peer-status-warning-describe', 'goto-char', 'gpm-mouse-start',
        'gpm-mouse-stop', 'group-gid', 'group-real-gid',
        'handle-save-session', 'handle-switch-frame', 'hash-table-count',
        'hash-table-p', 'hash-table-rehash-size',
        'hash-table-rehash-threshold', 'hash-table-size', 'hash-table-test',
        'hash-table-weakness', 'iconify-frame', 'identity', 'image-flush',
        'image-mask-p', 'image-metadata', 'image-size', 'imagemagick-types',
        'imagep', 'indent-to', 'indirect-function', 'indirect-variable',
        'init-image-library', 'inotify-add-watch', 'inotify-rm-watch',
        'input-pending-p', 'insert', 'insert-and-inherit',
        'insert-before-markers', 'insert-before-markers-and-inherit',
        'insert-buffer-substring', 'insert-byte', 'insert-char',
        'insert-file-contents', 'insert-startup-screen', 'int86',
        'integer-or-marker-p', 'integerp', 'interactive-form', 'intern',
        'intern-soft', 'internal--track-mouse', 'internal-char-font',
        'internal-complete-buffer', 'internal-copy-lisp-face',
        'internal-default-process-filter',
        'internal-default-process-sentinel', 'internal-describe-syntax-value',
        'internal-event-symbol-parse-modifiers',
        'internal-face-x-get-resource', 'internal-get-lisp-face-attribute',
        'internal-lisp-face-attribute-values', 'internal-lisp-face-empty-p',
        'internal-lisp-face-equal-p', 'internal-lisp-face-p',
        'internal-make-lisp-face', 'internal-make-var-non-special',
        'internal-merge-in-global-face',
        'internal-set-alternative-font-family-alist',
        'internal-set-alternative-font-registry-alist',
        'internal-set-font-selection-order',
        'internal-set-lisp-face-attribute',
        'internal-set-lisp-face-attribute-from-resource',
        'internal-show-cursor', 'internal-show-cursor-p', 'interrupt-process',
        'invisible-p', 'invocation-directory', 'invocation-name', 'isnan',
        'iso-charset', 'key-binding', 'key-description',
        'keyboard-coding-system', 'keymap-parent', 'keymap-prompt', 'keymapp',
        'keywordp', 'kill-all-local-variables', 'kill-buffer', 'kill-emacs',
        'kill-local-variable', 'kill-process', 'last-nonminibuffer-frame',
        'lax-plist-get', 'lax-plist-put', 'ldexp', 'length',
        'libxml-parse-html-region', 'libxml-parse-xml-region',
        'line-beginning-position', 'line-end-position', 'line-pixel-height',
        'list', 'list-fonts', 'list-system-processes', 'listp', 'load',
        'load-average', 'local-key-binding', 'local-variable-if-set-p',
        'local-variable-p', 'locale-info', 'locate-file-internal',
        'lock-buffer', 'log', 'logand', 'logb', 'logior', 'lognot', 'logxor',
        'looking-at', 'lookup-image', 'lookup-image-map', 'lookup-key',
        'lower-frame', 'lsh', 'macroexpand', 'make-bool-vector',
        'make-byte-code', 'make-category-set', 'make-category-table',
        'make-char', 'make-char-table', 'make-directory-internal',
        'make-frame-invisible', 'make-frame-visible', 'make-hash-table',
        'make-indirect-buffer', 'make-keymap', 'make-list',
        'make-local-variable', 'make-marker', 'make-network-process',
        'make-overlay', 'make-serial-process', 'make-sparse-keymap',
        'make-string', 'make-symbol', 'make-symbolic-link', 'make-temp-name',
        'make-terminal-frame', 'make-variable-buffer-local',
        'make-variable-frame-local', 'make-vector', 'makunbound',
        'map-char-table', 'map-charset-chars', 'map-keymap',
        'map-keymap-internal', 'mapatoms', 'mapc', 'mapcar', 'mapconcat',
        'maphash', 'mark-marker', 'marker-buffer', 'marker-insertion-type',
        'marker-position', 'markerp', 'match-beginning', 'match-data',
        'match-end', 'matching-paren', 'max', 'max-char', 'md5', 'member',
        'memory-info', 'memory-limit', 'memory-use-counts', 'memq', 'memql',
        'menu-bar-menu-at-x-y', 'menu-or-popup-active-p',
        'menu-or-popup-active-p', 'merge-face-attribute', 'message',
        'message-box', 'message-or-box', 'min',
        'minibuffer-completion-contents', 'minibuffer-contents',
        'minibuffer-contents-no-properties', 'minibuffer-depth',
        'minibuffer-prompt', 'minibuffer-prompt-end',
        'minibuffer-selected-window', 'minibuffer-window', 'minibufferp',
        'minor-mode-key-binding', 'mod', 'modify-category-entry',
        'modify-frame-parameters', 'modify-syntax-entry',
        'mouse-pixel-position', 'mouse-position', 'move-overlay',
        'move-point-visually', 'move-to-column', 'move-to-window-line',
        'msdos-downcase-filename', 'msdos-long-file-names', 'msdos-memget',
        'msdos-memput', 'msdos-mouse-disable', 'msdos-mouse-enable',
        'msdos-mouse-init', 'msdos-mouse-p', 'msdos-remember-default-colors',
        'msdos-set-keyboard', 'msdos-set-mouse-buttons',
        'multibyte-char-to-unibyte', 'multibyte-string-p', 'narrow-to-region',
        'natnump', 'nconc', 'network-interface-info',
        'network-interface-list', 'new-fontset', 'newline-cache-check',
        'next-char-property-change', 'next-frame', 'next-overlay-change',
        'next-property-change', 'next-read-file-uses-dialog-p',
        'next-single-char-property-change', 'next-single-property-change',
        'next-window', 'nlistp', 'nreverse', 'nth', 'nthcdr', 'null',
        'number-or-marker-p', 'number-to-string', 'numberp',
        'open-dribble-file', 'open-font', 'open-termscript',
        'optimize-char-table', 'other-buffer', 'other-window-for-scrolling',
        'overlay-buffer', 'overlay-end', 'overlay-get', 'overlay-lists',
        'overlay-properties', 'overlay-put', 'overlay-recenter',
        'overlay-start', 'overlayp', 'overlays-at', 'overlays-in',
        'parse-partial-sexp', 'play-sound-internal', 'plist-get',
        'plist-member', 'plist-put', 'point', 'point-marker', 'point-max',
        'point-max-marker', 'point-min', 'point-min-marker',
        'pos-visible-in-window-p', 'position-bytes', 'posix-looking-at',
        'posix-search-backward', 'posix-search-forward', 'posix-string-match',
        'posn-at-point', 'posn-at-x-y', 'preceding-char',
        'prefix-numeric-value', 'previous-char-property-change',
        'previous-frame', 'previous-overlay-change',
        'previous-property-change', 'previous-single-char-property-change',
        'previous-single-property-change', 'previous-window', 'prin1',
        'prin1-to-string', 'princ', 'print', 'process-attributes',
        'process-buffer', 'process-coding-system', 'process-command',
        'process-connection', 'process-contact', 'process-datagram-address',
        'process-exit-status', 'process-filter', 'process-filter-multibyte-p',
        'process-id', 'process-inherit-coding-system-flag', 'process-list',
        'process-mark', 'process-name', 'process-plist',
        'process-query-on-exit-flag', 'process-running-child-p',
        'process-send-eof', 'process-send-region', 'process-send-string',
        'process-sentinel', 'process-status', 'process-tty-name',
        'process-type', 'processp', 'profiler-cpu-log',
        'profiler-cpu-running-p', 'profiler-cpu-start', 'profiler-cpu-stop',
        'profiler-memory-log', 'profiler-memory-running-p',
        'profiler-memory-start', 'profiler-memory-stop', 'propertize',
        'purecopy', 'put', 'put-text-property',
        'put-unicode-property-internal', 'puthash', 'query-font',
        'query-fontset', 'quit-process', 'raise-frame', 'random', 'rassoc',
        'rassq', 're-search-backward', 're-search-forward', 'read',
        'read-buffer', 'read-char', 'read-char-exclusive',
        'read-coding-system', 'read-command', 'read-event',
        'read-from-minibuffer', 'read-from-string', 'read-function',
        'read-key-sequence', 'read-key-sequence-vector',
        'read-no-blanks-input', 'read-non-nil-coding-system', 'read-string',
        'read-variable', 'recent-auto-save-p', 'recent-doskeys',
        'recent-keys', 'recenter', 'recursion-depth', 'recursive-edit',
        'redirect-debugging-output', 'redirect-frame-focus', 'redisplay',
        'redraw-display', 'redraw-frame', 'regexp-quote', 'region-beginning',
        'region-end', 'register-ccl-program', 'register-code-conversion-map',
        'remhash', 'remove-list-of-text-properties', 'remove-text-properties',
        'rename-buffer', 'rename-file', 'replace-match',
        'reset-this-command-lengths', 'resize-mini-window-internal',
        'restore-buffer-modified-p', 'resume-tty', 'reverse', 'round',
        'run-hook-with-args', 'run-hook-with-args-until-failure',
        'run-hook-with-args-until-success', 'run-hook-wrapped', 'run-hooks',
        'run-window-configuration-change-hook', 'run-window-scroll-functions',
        'safe-length', 'scan-lists', 'scan-sexps', 'scroll-down',
        'scroll-left', 'scroll-other-window', 'scroll-right', 'scroll-up',
        'search-backward', 'search-forward', 'secure-hash', 'select-frame',
        'select-window', 'selected-frame', 'selected-window',
        'self-insert-command', 'send-string-to-terminal', 'sequencep',
        'serial-process-configure', 'set', 'set-buffer',
        'set-buffer-auto-saved', 'set-buffer-major-mode',
        'set-buffer-modified-p', 'set-buffer-multibyte', 'set-case-table',
        'set-category-table', 'set-char-table-extra-slot',
        'set-char-table-parent', 'set-char-table-range', 'set-charset-plist',
        'set-charset-priority', 'set-coding-system-priority',
        'set-cursor-size', 'set-default', 'set-default-file-modes',
        'set-default-toplevel-value', 'set-file-acl', 'set-file-modes',
        'set-file-selinux-context', 'set-file-times', 'set-fontset-font',
        'set-frame-height', 'set-frame-position', 'set-frame-selected-window',
        'set-frame-size', 'set-frame-width', 'set-fringe-bitmap-face',
        'set-input-interrupt-mode', 'set-input-meta-mode', 'set-input-mode',
        'set-keyboard-coding-system-internal', 'set-keymap-parent',
        'set-marker', 'set-marker-insertion-type', 'set-match-data',
        'set-message-beep', 'set-minibuffer-window',
        'set-mouse-pixel-position', 'set-mouse-position',
        'set-network-process-option', 'set-output-flow-control',
        'set-process-buffer', 'set-process-coding-system',
        'set-process-datagram-address', 'set-process-filter',
        'set-process-filter-multibyte',
        'set-process-inherit-coding-system-flag', 'set-process-plist',
        'set-process-query-on-exit-flag', 'set-process-sentinel',
        'set-process-window-size', 'set-quit-char',
        'set-safe-terminal-coding-system-internal', 'set-screen-color',
        'set-standard-case-table', 'set-syntax-table',
        'set-terminal-coding-system-internal', 'set-terminal-local-value',
        'set-terminal-parameter', 'set-text-properties', 'set-time-zone-rule',
        'set-visited-file-modtime', 'set-window-buffer',
        'set-window-combination-limit', 'set-window-configuration',
        'set-window-dedicated-p', 'set-window-display-table',
        'set-window-fringes', 'set-window-hscroll', 'set-window-margins',
        'set-window-new-normal', 'set-window-new-pixel',
        'set-window-new-total', 'set-window-next-buffers',
        'set-window-parameter', 'set-window-point', 'set-window-prev-buffers',
        'set-window-redisplay-end-trigger', 'set-window-scroll-bars',
        'set-window-start', 'set-window-vscroll', 'setcar', 'setcdr',
        'setplist', 'show-face-resources', 'signal', 'signal-process', 'sin',
        'single-key-description', 'skip-chars-backward', 'skip-chars-forward',
        'skip-syntax-backward', 'skip-syntax-forward', 'sleep-for', 'sort',
        'sort-charsets', 'special-variable-p', 'split-char',
        'split-window-internal', 'sqrt', 'standard-case-table',
        'standard-category-table', 'standard-syntax-table', 'start-kbd-macro',
        'start-process', 'stop-process', 'store-kbd-macro-event', 'string',
        'string=', 'string<', 'string>', 'string-as-multibyte',
        'string-as-unibyte', 'string-bytes', 'string-collate-equalp',
        'string-collate-lessp', 'string-equal', 'string-greaterp',
        'string-lessp', 'string-make-multibyte', 'string-make-unibyte',
        'string-match', 'string-to-char', 'string-to-multibyte',
        'string-to-number', 'string-to-syntax', 'string-to-unibyte',
        'string-width', 'stringp', 'subr-name', 'subrp',
        'subst-char-in-region', 'substitute-command-keys',
        'substitute-in-file-name', 'substring', 'substring-no-properties',
        'suspend-emacs', 'suspend-tty', 'suspicious-object', 'sxhash',
        'symbol-function', 'symbol-name', 'symbol-plist', 'symbol-value',
        'symbolp', 'syntax-table', 'syntax-table-p', 'system-groups',
        'system-move-file-to-trash', 'system-name', 'system-users', 'tan',
        'terminal-coding-system', 'terminal-list', 'terminal-live-p',
        'terminal-local-value', 'terminal-name', 'terminal-parameter',
        'terminal-parameters', 'terpri', 'test-completion',
        'text-char-description', 'text-properties-at', 'text-property-any',
        'text-property-not-all', 'this-command-keys',
        'this-command-keys-vector', 'this-single-command-keys',
        'this-single-command-raw-keys', 'time-add', 'time-less-p',
        'time-subtract', 'tool-bar-get-system-style', 'tool-bar-height',
        'tool-bar-pixel-width', 'top-level', 'trace-redisplay',
        'trace-to-stderr', 'translate-region-internal', 'transpose-regions',
        'truncate', 'try-completion', 'tty-display-color-cells',
        'tty-display-color-p', 'tty-no-underline',
        'tty-suppress-bold-inverse-default-colors', 'tty-top-frame',
        'tty-type', 'type-of', 'undo-boundary', 'unencodable-char-position',
        'unhandled-file-name-directory', 'unibyte-char-to-multibyte',
        'unibyte-string', 'unicode-property-table-internal', 'unify-charset',
        'unintern', 'unix-sync', 'unlock-buffer', 'upcase', 'upcase-initials',
        'upcase-initials-region', 'upcase-region', 'upcase-word',
        'use-global-map', 'use-local-map', 'user-full-name',
        'user-login-name', 'user-real-login-name', 'user-real-uid',
        'user-uid', 'variable-binding-locus', 'vconcat', 'vector',
        'vector-or-char-table-p', 'vectorp', 'verify-visited-file-modtime',
        'vertical-motion', 'visible-frame-list', 'visited-file-modtime',
        'w16-get-clipboard-data', 'w16-selection-exists-p',
        'w16-set-clipboard-data', 'w32-battery-status',
        'w32-default-color-map', 'w32-define-rgb-color',
        'w32-display-monitor-attributes-list', 'w32-frame-menu-bar-size',
        'w32-frame-rect', 'w32-get-clipboard-data',
        'w32-get-codepage-charset', 'w32-get-console-codepage',
        'w32-get-console-output-codepage', 'w32-get-current-locale-id',
        'w32-get-default-locale-id', 'w32-get-keyboard-layout',
        'w32-get-locale-info', 'w32-get-valid-codepages',
        'w32-get-valid-keyboard-layouts', 'w32-get-valid-locale-ids',
        'w32-has-winsock', 'w32-long-file-name', 'w32-reconstruct-hot-key',
        'w32-register-hot-key', 'w32-registered-hot-keys',
        'w32-selection-exists-p', 'w32-send-sys-command',
        'w32-set-clipboard-data', 'w32-set-console-codepage',
        'w32-set-console-output-codepage', 'w32-set-current-locale',
        'w32-set-keyboard-layout', 'w32-set-process-priority',
        'w32-shell-execute', 'w32-short-file-name', 'w32-toggle-lock-key',
        'w32-unload-winsock', 'w32-unregister-hot-key', 'w32-window-exists-p',
        'w32notify-add-watch', 'w32notify-rm-watch',
        'waiting-for-user-input-p', 'where-is-internal', 'widen',
        'widget-apply', 'widget-get', 'widget-put',
        'window-absolute-pixel-edges', 'window-at', 'window-body-height',
        'window-body-width', 'window-bottom-divider-width', 'window-buffer',
        'window-combination-limit', 'window-configuration-frame',
        'window-configuration-p', 'window-dedicated-p',
        'window-display-table', 'window-edges', 'window-end', 'window-frame',
        'window-fringes', 'window-header-line-height', 'window-hscroll',
        'window-inside-absolute-pixel-edges', 'window-inside-edges',
        'window-inside-pixel-edges', 'window-left-child',
        'window-left-column', 'window-line-height', 'window-list',
        'window-list-1', 'window-live-p', 'window-margins',
        'window-minibuffer-p', 'window-mode-line-height', 'window-new-normal',
        'window-new-pixel', 'window-new-total', 'window-next-buffers',
        'window-next-sibling', 'window-normal-size', 'window-old-point',
        'window-parameter', 'window-parameters', 'window-parent',
        'window-pixel-edges', 'window-pixel-height', 'window-pixel-left',
        'window-pixel-top', 'window-pixel-width', 'window-point',
        'window-prev-buffers', 'window-prev-sibling',
        'window-redisplay-end-trigger', 'window-resize-apply',
        'window-resize-apply-total', 'window-right-divider-width',
        'window-scroll-bar-height', 'window-scroll-bar-width',
        'window-scroll-bars', 'window-start', 'window-system',
        'window-text-height', 'window-text-pixel-size', 'window-text-width',
        'window-top-child', 'window-top-line', 'window-total-height',
        'window-total-width', 'window-use-time', 'window-valid-p',
        'window-vscroll', 'windowp', 'write-char', 'write-region',
        'x-backspace-delete-keys-p', 'x-change-window-property',
        'x-change-window-property', 'x-close-connection',
        'x-close-connection', 'x-create-frame', 'x-create-frame',
        'x-delete-window-property', 'x-delete-window-property',
        'x-disown-selection-internal', 'x-display-backing-store',
        'x-display-backing-store', 'x-display-color-cells',
        'x-display-color-cells', 'x-display-grayscale-p',
        'x-display-grayscale-p', 'x-display-list', 'x-display-list',
        'x-display-mm-height', 'x-display-mm-height', 'x-display-mm-width',
        'x-display-mm-width', 'x-display-monitor-attributes-list',
        'x-display-pixel-height', 'x-display-pixel-height',
        'x-display-pixel-width', 'x-display-pixel-width', 'x-display-planes',
        'x-display-planes', 'x-display-save-under', 'x-display-save-under',
        'x-display-screens', 'x-display-screens', 'x-display-visual-class',
        'x-display-visual-class', 'x-family-fonts', 'x-file-dialog',
        'x-file-dialog', 'x-file-dialog', 'x-focus-frame', 'x-frame-geometry',
        'x-frame-geometry', 'x-get-atom-name', 'x-get-resource',
        'x-get-selection-internal', 'x-hide-tip', 'x-hide-tip',
        'x-list-fonts', 'x-load-color-file', 'x-menu-bar-open-internal',
        'x-menu-bar-open-internal', 'x-open-connection', 'x-open-connection',
        'x-own-selection-internal', 'x-parse-geometry', 'x-popup-dialog',
        'x-popup-menu', 'x-register-dnd-atom', 'x-select-font',
        'x-select-font', 'x-selection-exists-p', 'x-selection-owner-p',
        'x-send-client-message', 'x-server-max-request-size',
        'x-server-max-request-size', 'x-server-vendor', 'x-server-vendor',
        'x-server-version', 'x-server-version', 'x-show-tip', 'x-show-tip',
        'x-synchronize', 'x-synchronize', 'x-uses-old-gtk-dialog',
        'x-window-property', 'x-window-property', 'x-wm-set-size-hint',
        'xw-color-defined-p', 'xw-color-defined-p', 'xw-color-values',
        'xw-color-values', 'xw-display-color-p', 'xw-display-color-p',
        'yes-or-no-p', 'zlib-available-p', 'zlib-decompress-region',
        'forward-point',
    }

    builtin_function_highlighted = {
        'defvaralias', 'provide', 'require',
        'with-no-warnings', 'define-widget', 'with-electric-help',
        'throw', 'defalias', 'featurep'
    }

    lambda_list_keywords = {
        '&allow-other-keys', '&aux', '&body', '&environment', '&key', '&optional',
        '&rest', '&whole',
    }

    error_keywords = {
        'cl-assert', 'cl-check-type', 'error', 'signal',
        'user-error', 'warn',
    }

    def get_tokens_unprocessed(self, text):
        stack = ['root']
        for index, token, value in RegexLexer.get_tokens_unprocessed(self, text, stack):
            if token is Name.Variable:
                if value in EmacsLispLexer.builtin_function:
                    yield index, Name.Function, value
                    continue
                if value in EmacsLispLexer.special_forms:
                    yield index, Keyword, value
                    continue
                if value in EmacsLispLexer.error_keywords:
                    yield index, Name.Exception, value
                    continue
                if value in EmacsLispLexer.builtin_function_highlighted:
                    yield index, Name.Builtin, value
                    continue
                if value in EmacsLispLexer.macros:
                    yield index, Name.Builtin, value
                    continue
                if value in EmacsLispLexer.lambda_list_keywords:
                    yield index, Keyword.Pseudo, value
                    continue
            yield index, token, value

    tokens = {
        'root': [
            default('body'),
        ],
        'body': [
            # whitespace
            (r'\s+', Whitespace),

            # single-line comment
            (r';.*$', Comment.Single),

            # strings and characters
            (r'"', String, 'string'),
            (r'\?([^\\]|\\.)', String.Char),
            # quoting
            (r":" + symbol, Name.Builtin),
            (r"::" + symbol, String.Symbol),
            (r"'" + symbol, String.Symbol),
            (r"'", Operator),
            (r"`", Operator),

            # decimal numbers
            (r'[-+]?\d+\.?' + terminated, Number.Integer),
            (r'[-+]?\d+/\d+' + terminated, Number),
            (r'[-+]?(\d*\.\d+([defls][-+]?\d+)?|\d+(\.\d*)?[defls][-+]?\d+)' +
             terminated, Number.Float),

            # vectors
            (r'\[|\]', Punctuation),

            # uninterned symbol
            (r'#:' + symbol, String.Symbol),

            # read syntax for char tables
            (r'#\^\^?', Operator),

            # function shorthand
            (r'#\'', Name.Function),

            # binary rational
            (r'#[bB][+-]?[01]+(/[01]+)?', Number.Bin),

            # octal rational
            (r'#[oO][+-]?[0-7]+(/[0-7]+)?', Number.Oct),

            # hex rational
            (r'#[xX][+-]?[0-9a-fA-F]+(/[0-9a-fA-F]+)?', Number.Hex),

            # radix rational
            (r'#\d+r[+-]?[0-9a-zA-Z]+(/[0-9a-zA-Z]+)?', Number),

            # reference
            (r'#\d+=', Operator),
            (r'#\d+#', Operator),

            # special operators that should have been parsed already
            (r'(,@|,|\.|:)', Operator),

            # special constants
            (r'(t|nil)' + terminated, Name.Constant),

            # functions and variables
            (r'\*' + symbol + r'\*', Name.Variable.Global),
            (symbol, Name.Variable),

            # parentheses
            (r'#\(', Operator, 'body'),
            (r'\(', Punctuation, 'body'),
            (r'\)', Punctuation, '#pop'),
        ],
        'string': [
            (r'[^"\\`]+', String),
            (rf'`{symbol}\'', String.Symbol),
            (r'`', String),
            (r'\\.', String),
            (r'\\\n', String),
            (r'"', String, '#pop'),
        ],
    }


class ShenLexer(RegexLexer):
    """
    Lexer for Shen source code.
    """
    name = 'Shen'
    url = 'http://shenlanguage.org/'
    aliases = ['shen']
    filenames = ['*.shen']
    mimetypes = ['text/x-shen', 'application/x-shen']
    version_added = '2.1'

    DECLARATIONS = (
        'datatype', 'define', 'defmacro', 'defprolog', 'defcc',
        'synonyms', 'declare', 'package', 'type', 'function',
    )

    SPECIAL_FORMS = (
        'lambda', 'get', 'let', 'if', 'cases', 'cond', 'put', 'time', 'freeze',
        'value', 'load', '$', 'protect', 'or', 'and', 'not', 'do', 'output',
        'prolog?', 'trap-error', 'error', 'make-string', '/.', 'set', '@p',
        '@s', '@v',
    )

    BUILTINS = (
        '==', '=', '*', '+', '-', '/', '<', '>', '>=', '<=', '<-address',
        '<-vector', 'abort', 'absvector', 'absvector?', 'address->', 'adjoin',
        'append', 'arity', 'assoc', 'bind', 'boolean?', 'bound?', 'call', 'cd',
        'close', 'cn', 'compile', 'concat', 'cons', 'cons?', 'cut', 'destroy',
        'difference', 'element?', 'empty?', 'enable-type-theory',
        'error-to-string', 'eval', 'eval-kl', 'exception', 'explode', 'external',
        'fail', 'fail-if', 'file', 'findall', 'fix', 'fst', 'fwhen', 'gensym',
        'get-time', 'hash', 'hd', 'hdstr', 'hdv', 'head', 'identical',
        'implementation', 'in', 'include', 'include-all-but', 'inferences',
        'input', 'input+', 'integer?', 'intern', 'intersection', 'is', 'kill',
        'language', 'length', 'limit', 'lineread', 'loaded', 'macro', 'macroexpand',
        'map', 'mapcan', 'maxinferences', 'mode', 'n->string', 'nl', 'nth', 'null',
        'number?', 'occurrences', 'occurs-check', 'open', 'os', 'out', 'port',
        'porters', 'pos', 'pr', 'preclude', 'preclude-all-but', 'print', 'profile',
        'profile-results', 'ps', 'quit', 'read', 'read+', 'read-byte', 'read-file',
        'read-file-as-bytelist', 'read-file-as-string', 'read-from-string',
        'release', 'remove', 'return', 'reverse', 'run', 'save', 'set',
        'simple-error', 'snd', 'specialise', 'spy', 'step', 'stinput', 'stoutput',
        'str', 'string->n', 'string->symbol', 'string?', 'subst', 'symbol?',
        'systemf', 'tail', 'tc', 'tc?', 'thaw', 'tl', 'tlstr', 'tlv', 'track',
        'tuple?', 'undefmacro', 'unify', 'unify!', 'union', 'unprofile',
        'unspecialise', 'untrack', 'variable?', 'vector', 'vector->', 'vector?',
        'verified', 'version', 'warn', 'when', 'write-byte', 'write-to-file',
        'y-or-n?',
    )

    BUILTINS_ANYWHERE = ('where', 'skip', '>>', '_', '!', '<e>', '<!>')

    MAPPINGS = {s: Keyword for s in DECLARATIONS}
    MAPPINGS.update((s, Name.Builtin) for s in BUILTINS)
    MAPPINGS.update((s, Keyword) for s in SPECIAL_FORMS)

    valid_symbol_chars = r'[\w!$%*+,<=>?/.\'@&#:-]'
    valid_name = f'{valid_symbol_chars}+'
    symbol_name = rf'[a-z!$%*+,<=>?/.\'@&#_-]{valid_symbol_chars}*'
    variable = rf'[A-Z]{valid_symbol_chars}*'

    tokens = {
        'string': [
            (r'"', String, '#pop'),
            (r'c#\d{1,3};', String.Escape),
            (r'~[ARS%]', String.Interpol),
            (r'(?s).', String),
        ],

        'root': [
            (r'(?s)\\\*.*?\*\\', Comment.Multiline),  # \* ... *\
            (r'\\\\.*', Comment.Single),              # \\ ...
            (r'\s+', Whitespace),
            (r'_{5,}', Punctuation),
            (r'={5,}', Punctuation),
            (r'(;|:=|\||--?>|<--?)', Punctuation),
            (r'(:-|:|\{|\})', Literal),
            (r'[+-]*\d*\.\d+(e[+-]?\d+)?', Number.Float),
            (r'[+-]*\d+', Number.Integer),
            (r'"', String, 'string'),
            (variable, Name.Variable),
            (r'(true|false|<>|\[\])', Keyword.Pseudo),
            (symbol_name, Literal),
            (r'(\[|\]|\(|\))', Punctuation),
        ],
    }

    def get_tokens_unprocessed(self, text):
        tokens = RegexLexer.get_tokens_unprocessed(self, text)
        tokens = self._process_symbols(tokens)
        tokens = self._process_declarations(tokens)
        return tokens

    def _relevant(self, token):
        return token not in (Text, Whitespace, Comment.Single, Comment.Multiline)

    def _process_declarations(self, tokens):
        opening_paren = False
        for index, token, value in tokens:
            yield index, token, value
            if self._relevant(token):
                if opening_paren and token == Keyword and value in self.DECLARATIONS:
                    declaration = value
                    yield from self._process_declaration(declaration, tokens)
                opening_paren = value == '(' and token == Punctuation

    def _process_symbols(self, tokens):
        opening_paren = False
        for index, token, value in tokens:
            if opening_paren and token in (Literal, Name.Variable):
                token = self.MAPPINGS.get(value, Name.Function)
            elif token == Literal and value in self.BUILTINS_ANYWHERE:
                token = Name.Builtin
            opening_paren = value == '(' and token == Punctuation
            yield index, token, value

    def _process_declaration(self, declaration, tokens):
        for index, token, value in tokens:
            if self._relevant(token):
                break
            yield index, token, value

        if declaration == 'datatype':
            prev_was_colon = False
            token = Keyword.Type if token == Literal else token
            yield index, token, value
            for index, token, value in tokens:
                if prev_was_colon and token == Literal:
                    token = Keyword.Type
                yield index, token, value
                if self._relevant(token):
                    prev_was_colon = token == Literal and value == ':'
        elif declaration == 'package':
            token = Name.Namespace if token == Literal else token
            yield index, token, value
        elif declaration == 'define':
            token = Name.Function if token == Literal else token
            yield index, token, value
            for index, token, value in tokens:
                if self._relevant(token):
                    break
                yield index, token, value
            if value == '{' and token == Literal:
                yield index, Punctuation, value
                for index, token, value in self._process_signature(tokens):
                    yield index, token, value
            else:
                yield index, token, value
        else:
            token = Name.Function if token == Literal else token
            yield index, token, value

        return

    def _process_signature(self, tokens):
        for index, token, value in tokens:
            if token == Literal and value == '}':
                yield index, Punctuation, value
                return
            elif token in (Literal, Name.Function):
                token = Name.Variable if value.istitle() else Keyword.Type
            yield index, token, value


class CPSALexer(RegexLexer):
    """
    A CPSA lexer based on the CPSA language as of version 2.2.12
    """
    name = 'CPSA'
    aliases = ['cpsa']
    filenames = ['*.cpsa']
    mimetypes = []
    url = 'https://web.cs.wpi.edu/~guttman/cs564/cpsauser.html'
    version_added = '2.1'

    # list of known keywords and builtins taken form vim 6.4 scheme.vim
    # syntax file.
    _keywords = (
        'herald', 'vars', 'defmacro', 'include', 'defprotocol', 'defrole',
        'defskeleton', 'defstrand', 'deflistener', 'non-orig', 'uniq-orig',
        'pen-non-orig', 'precedes', 'trace', 'send', 'recv', 'name', 'text',
        'skey', 'akey', 'data', 'mesg',
    )
    _builtins = (
        'cat', 'enc', 'hash', 'privk', 'pubk', 'invk', 'ltk', 'gen', 'exp',
    )

    # valid names for identifiers
    # well, names can only not consist fully of numbers
    # but this should be good enough for now
    valid_name = r'[\w!$%&*+,/:<=>?@^~|-]+'

    tokens = {
        'root': [
            # the comments - always starting with semicolon
            # and going to the end of the line
            (r';.*$', Comment.Single),

            # whitespaces - usually not relevant
            (r'\s+', Whitespace),

            # numbers
            (r'-?\d+\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),
            # support for uncommon kinds of numbers -
            # have to figure out what the characters mean
            # (r'(#e|#i|#b|#o|#d|#x)[\d.]+', Number),

            # strings, symbols and characters
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r"'" + valid_name, String.Symbol),
            (r"#\\([()/'\"._!§$%& ?=+-]|[a-zA-Z0-9]+)", String.Char),

            # constants
            (r'(#t|#f)', Name.Constant),

            # special operators
            (r"('|#|`|,@|,|\.)", Operator),

            # highlight the keywords
            (words(_keywords, suffix=r'\b'), Keyword),

            # first variable in a quoted string like
            # '(this is syntactic sugar)
            (r"(?<='\()" + valid_name, Name.Variable),
            (r"(?<=#\()" + valid_name, Name.Variable),

            # highlight the builtins
            (words(_builtins, prefix=r'(?<=\()', suffix=r'\b'), Name.Builtin),

            # the remaining functions
            (r'(?<=\()' + valid_name, Name.Function),
            # find the remaining variables
            (valid_name, Name.Variable),

            # the famous parentheses!
            (r'(\(|\))', Punctuation),
            (r'(\[|\])', Punctuation),
        ],
    }


class XtlangLexer(RegexLexer):
    """An xtlang lexer for the Extempore programming environment.

    This is a mixture of Scheme and xtlang, really. Keyword lists are
    taken from the Extempore Emacs mode
    (https://github.com/extemporelang/extempore-emacs-mode)
    """
    name = 'xtlang'
    url = 'http://extempore.moso.com.au'
    aliases = ['extempore']
    filenames = ['*.xtm']
    mimetypes = []
    version_added = '2.2'

    common_keywords = (
        'lambda', 'define', 'if', 'else', 'cond', 'and',
        'or', 'let', 'begin', 'set!', 'map', 'for-each',
    )
    scheme_keywords = (
        'do', 'delay', 'quasiquote', 'unquote', 'unquote-splicing', 'eval',
        'case', 'let*', 'letrec', 'quote',
    )
    xtlang_bind_keywords = (
        'bind-func', 'bind-val', 'bind-lib', 'bind-type', 'bind-alias',
        'bind-poly', 'bind-dylib', 'bind-lib-func', 'bind-lib-val',
    )
    xtlang_keywords = (
        'letz', 'memzone', 'cast', 'convert', 'dotimes', 'doloop',
    )
    common_functions = (
        '*', '+', '-', '/', '<', '<=', '=', '>', '>=', '%', 'abs', 'acos',
        'angle', 'append', 'apply', 'asin', 'assoc', 'assq', 'assv',
        'atan', 'boolean?', 'caaaar', 'caaadr', 'caaar', 'caadar',
        'caaddr', 'caadr', 'caar', 'cadaar', 'cadadr', 'cadar',
        'caddar', 'cadddr', 'caddr', 'cadr', 'car', 'cdaaar',
        'cdaadr', 'cdaar', 'cdadar', 'cdaddr', 'cdadr', 'cdar',
        'cddaar', 'cddadr', 'cddar', 'cdddar', 'cddddr', 'cdddr',
        'cddr', 'cdr', 'ceiling', 'cons', 'cos', 'floor', 'length',
        'list', 'log', 'max', 'member', 'min', 'modulo', 'not',
        'reverse', 'round', 'sin', 'sqrt', 'substring', 'tan',
        'println', 'random', 'null?', 'callback', 'now',
    )
    scheme_functions = (
        'call-with-current-continuation', 'call-with-input-file',
        'call-with-output-file', 'call-with-values', 'call/cc',
        'char->integer', 'char-alphabetic?', 'char-ci<=?', 'char-ci<?',
        'char-ci=?', 'char-ci>=?', 'char-ci>?', 'char-downcase',
        'char-lower-case?', 'char-numeric?', 'char-ready?',
        'char-upcase', 'char-upper-case?', 'char-whitespace?',
        'char<=?', 'char<?', 'char=?', 'char>=?', 'char>?', 'char?',
        'close-input-port', 'close-output-port', 'complex?',
        'current-input-port', 'current-output-port', 'denominator',
        'display', 'dynamic-wind', 'eof-object?', 'eq?', 'equal?',
        'eqv?', 'even?', 'exact->inexact', 'exact?', 'exp', 'expt',
        'force', 'gcd', 'imag-part', 'inexact->exact', 'inexact?',
        'input-port?', 'integer->char', 'integer?',
        'interaction-environment', 'lcm', 'list->string',
        'list->vector', 'list-ref', 'list-tail', 'list?', 'load',
        'magnitude', 'make-polar', 'make-rectangular', 'make-string',
        'make-vector', 'memq', 'memv', 'negative?', 'newline',
        'null-environment', 'number->string', 'number?',
        'numerator', 'odd?', 'open-input-file', 'open-output-file',
        'output-port?', 'pair?', 'peek-char', 'port?', 'positive?',
        'procedure?', 'quotient', 'rational?', 'rationalize', 'read',
        'read-char', 'real-part', 'real?',
        'remainder', 'scheme-report-environment', 'set-car!', 'set-cdr!',
        'string', 'string->list', 'string->number', 'string->symbol',
        'string-append', 'string-ci<=?', 'string-ci<?', 'string-ci=?',
        'string-ci>=?', 'string-ci>?', 'string-copy', 'string-fill!',
        'string-length', 'string-ref', 'string-set!', 'string<=?',
        'string<?', 'string=?', 'string>=?', 'string>?', 'string?',
        'symbol->string', 'symbol?', 'transcript-off', 'transcript-on',
        'truncate', 'values', 'vector', 'vector->list', 'vector-fill!',
        'vector-length', 'vector?',
        'with-input-from-file', 'with-output-to-file', 'write',
        'write-char', 'zero?',
    )
    xtlang_functions = (
        'toString', 'afill!', 'pfill!', 'tfill!', 'tbind', 'vfill!',
        'array-fill!', 'pointer-fill!', 'tuple-fill!', 'vector-fill!', 'free',
        'array', 'tuple', 'list', '~', 'cset!', 'cref', '&', 'bor',
        'ang-names', '<<', '>>', 'nil', 'printf', 'sprintf', 'null', 'now',
        'pset!', 'pref-ptr', 'vset!', 'vref', 'aset!', 'aref', 'aref-ptr',
        'tset!', 'tref', 'tref-ptr', 'salloc', 'halloc', 'zalloc', 'alloc',
        'schedule', 'exp', 'log', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'sqrt', 'expt', 'floor', 'ceiling', 'truncate', 'round',
        'llvm_printf', 'push_zone', 'pop_zone', 'memzone', 'callback',
        'llvm_sprintf', 'make-array', 'array-set!', 'array-ref',
        'array-ref-ptr', 'pointer-set!', 'pointer-ref', 'pointer-ref-ptr',
        'stack-alloc', 'heap-alloc', 'zone-alloc', 'make-tuple', 'tuple-set!',
        'tuple-ref', 'tuple-ref-ptr', 'closure-set!', 'closure-ref', 'pref',
        'pdref', 'impc_null', 'bitcast', 'void', 'ifret', 'ret->', 'clrun->',
        'make-env-zone', 'make-env', '<>', 'dtof', 'ftod', 'i1tof',
        'i1tod', 'i1toi8', 'i1toi32', 'i1toi64', 'i8tof', 'i8tod',
        'i8toi1', 'i8toi32', 'i8toi64', 'i32tof', 'i32tod', 'i32toi1',
        'i32toi8', 'i32toi64', 'i64tof', 'i64tod', 'i64toi1',
        'i64toi8', 'i64toi32',
    )

    # valid names for Scheme identifiers (names cannot consist fully
    # of numbers, but this should be good enough for now)
    valid_scheme_name = r'[\w!$%&*+,/:<=>?@^~|-]+'

    # valid characters in xtlang names & types
    valid_xtlang_name = r'[\w.!-]+'
    valid_xtlang_type = r'[]{}[\w<>,*/|!-]+'

    tokens = {
        # keep track of when we're exiting the xtlang form
        'xtlang': [
            (r'\(', Punctuation, '#push'),
            (r'\)', Punctuation, '#pop'),

            (r'(?<=bind-func\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-val\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-type\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-alias\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-poly\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-lib\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-dylib\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-lib-func\s)' + valid_xtlang_name, Name.Function),
            (r'(?<=bind-lib-val\s)' + valid_xtlang_name, Name.Function),

            # type annotations
            (r':' + valid_xtlang_type, Keyword.Type),

            # types
            (r'(<' + valid_xtlang_type + r'>|\|' + valid_xtlang_type + r'\||/' +
             valid_xtlang_type + r'/|' + valid_xtlang_type + r'\*)\**',
             Keyword.Type),

            # keywords
            (words(xtlang_keywords, prefix=r'(?<=\()'), Keyword),

            # builtins
            (words(xtlang_functions, prefix=r'(?<=\()'), Name.Function),

            include('common'),

            # variables
            (valid_xtlang_name, Name.Variable),
        ],
        'scheme': [
            # quoted symbols
            (r"'" + valid_scheme_name, String.Symbol),

            # char literals
            (r"#\\([()/'\"._!§$%& ?=+-]|[a-zA-Z0-9]+)", String.Char),

            # special operators
            (r"('|#|`|,@|,|\.)", Operator),

            # keywords
            (words(scheme_keywords, prefix=r'(?<=\()'), Keyword),

            # builtins
            (words(scheme_functions, prefix=r'(?<=\()'), Name.Function),

            include('common'),

            # variables
            (valid_scheme_name, Name.Variable),
        ],
        # common to both xtlang and Scheme
        'common': [
            # comments
            (r';.*$', Comment.Single),

            # whitespaces - usually not relevant
            (r'\s+', Whitespace),

            # numbers
            (r'-?\d+\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),

            # binary/oct/hex literals
            (r'(#b|#o|#x)[\d.]+', Number),

            # strings
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),

            # true/false constants
            (r'(#t|#f)', Name.Constant),

            # keywords
            (words(common_keywords, prefix=r'(?<=\()'), Keyword),

            # builtins
            (words(common_functions, prefix=r'(?<=\()'), Name.Function),

            # the famous parentheses!
            (r'(\(|\))', Punctuation),
        ],
        'root': [
            # go into xtlang mode
            (words(xtlang_bind_keywords, prefix=r'(?<=\()', suffix=r'\b'),
             Keyword, 'xtlang'),

            include('scheme')
        ],
    }


class FennelLexer(RegexLexer):
    """A lexer for the Fennel programming language.

    Fennel compiles to Lua, so all the Lua builtins are recognized as well
    as the special forms that are particular to the Fennel compiler.
    """
    name = 'Fennel'
    url = 'https://fennel-lang.org'
    aliases = ['fennel', 'fnl']
    filenames = ['*.fnl']
    version_added = '2.3'

    # this list is current as of Fennel version 0.10.0.
    special_forms = (
        '#', '%', '*', '+', '-', '->', '->>', '-?>', '-?>>', '.', '..',
        '/', '//', ':', '<', '<=', '=', '>', '>=', '?.', '^', 'accumulate',
        'and', 'band', 'bnot', 'bor', 'bxor', 'collect', 'comment', 'do', 'doc',
        'doto', 'each', 'eval-compiler', 'for', 'hashfn', 'icollect', 'if',
        'import-macros', 'include', 'length', 'let', 'lshift', 'lua',
        'macrodebug', 'match', 'not', 'not=', 'or', 'partial', 'pick-args',
        'pick-values', 'quote', 'require-macros', 'rshift', 'set',
        'set-forcibly!', 'tset', 'values', 'when', 'while', 'with-open', '~='
    )

    declarations = (
        'fn', 'global', 'lambda', 'local', 'macro', 'macros', 'var', 'λ'
    )

    builtins = (
        '_G', '_VERSION', 'arg', 'assert', 'bit32', 'collectgarbage',
        'coroutine', 'debug', 'dofile', 'error', 'getfenv',
        'getmetatable', 'io', 'ipairs', 'load', 'loadfile', 'loadstring',
        'math', 'next', 'os', 'package', 'pairs', 'pcall', 'print',
        'rawequal', 'rawget', 'rawlen', 'rawset', 'require', 'select',
        'setfenv', 'setmetatable', 'string', 'table', 'tonumber',
        'tostring', 'type', 'unpack', 'xpcall'
    )

    # based on the scheme definition, but disallowing leading digits and
    # commas, and @ is not allowed.
    valid_name = r'[a-zA-Z_!$%&*+/:<=>?^~|-][\w!$%&*+/:<=>?^~|\.-]*'

    tokens = {
        'root': [
            # the only comment form is a semicolon; goes to the end of the line
            (r';.*$', Comment.Single),

            (r',+', Text),
            (r'\s+', Whitespace),
            (r'-?\d+\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),

            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),

            (r'(true|false|nil)', Name.Constant),

            # these are technically strings, but it's worth visually
            # distinguishing them because their intent is different
            # from regular strings.
            (r':' + valid_name, String.Symbol),

            # special forms are keywords
            (words(special_forms, suffix=' '), Keyword),
            # these are ... even more special!
            (words(declarations, suffix=' '), Keyword.Declaration),
            # lua standard library are builtins
            (words(builtins, suffix=' '), Name.Builtin),
            # special-case the vararg symbol
            (r'\.\.\.', Name.Variable),
            # regular identifiers
            (valid_name, Name.Variable),

            # all your normal paired delimiters for your programming enjoyment
            (r'(\(|\))', Punctuation),
            (r'(\[|\])', Punctuation),
            (r'(\{|\})', Punctuation),

            # the # symbol is shorthand for a lambda function
            (r'#', Punctuation),
        ]
    }


class JanetLexer(RegexLexer):
    """A lexer for the Janet programming language.
    """
    name = 'Janet'
    url =  'https://janet-lang.org/'
    aliases = ['janet']
    filenames = ['*.janet', '*.jdn']
    mimetypes = ['text/x-janet', 'application/x-janet']
    version_added = '2.18'

    # XXX: gets too slow
    #flags = re.MULTILINE | re.VERBOSE

    special_forms = (
        'break', 'def', 'do', 'fn', 'if', 'quote', 'quasiquote', 'splice',
        'set', 'unquote', 'upscope', 'var', 'while'
    )

    builtin_macros = (
        '%=', '*=', '++', '+=', '--', '-=', '->', '->>', '-?>',
        '-?>>', '/=', 'and', 'as->', 'as-macro', 'as?->',
        'assert', 'case', 'catseq', 'chr', 'comment', 'compif',
        'comptime', 'compwhen', 'cond', 'coro', 'def-',
        'default', 'defdyn', 'defer', 'defmacro', 'defmacro-',
        'defn', 'defn-', 'delay', 'doc', 'each', 'eachk',
        'eachp', 'edefer', 'ev/do-thread', 'ev/gather',
        'ev/spawn', 'ev/spawn-thread', 'ev/with-deadline',
        'ffi/defbind', 'fiber-fn', 'for', 'forever', 'forv',
        'generate', 'if-let', 'if-not', 'if-with', 'import',
        'juxt', 'label', 'let', 'loop', 'match', 'or', 'prompt',
        'protect', 'repeat', 'seq', 'short-fn', 'tabseq',
        'toggle', 'tracev', 'try', 'unless', 'use', 'var-',
        'varfn', 'when', 'when-let', 'when-with', 'with',
        'with-dyns', 'with-syms', 'with-vars',
        # obsolete builtin macros
        'eachy'
    )

    builtin_functions = (
        '%', '*', '+', '-', '/', '<', '<=', '=', '>', '>=',
        'abstract?', 'accumulate', 'accumulate2', 'all',
        'all-bindings', 'all-dynamics', 'any?', 'apply',
        'array', 'array/clear', 'array/concat', 'array/ensure',
        'array/fill', 'array/insert', 'array/new',
        'array/new-filled', 'array/peek', 'array/pop',
        'array/push', 'array/remove', 'array/slice',
        'array/trim', 'array/weak', 'array?', 'asm',
        'bad-compile', 'bad-parse', 'band', 'blshift', 'bnot',
        'boolean?', 'bor', 'brshift', 'brushift', 'buffer',
        'buffer/bit', 'buffer/bit-clear', 'buffer/bit-set',
        'buffer/bit-toggle', 'buffer/blit', 'buffer/clear',
        'buffer/fill', 'buffer/format', 'buffer/from-bytes',
        'buffer/new', 'buffer/new-filled', 'buffer/popn',
        'buffer/push', 'buffer/push-at', 'buffer/push-byte',
        'buffer/push-string', 'buffer/push-word',
        'buffer/slice', 'buffer/trim', 'buffer?', 'bxor',
        'bytes?', 'cancel', 'cfunction?', 'cli-main', 'cmp',
        'comp', 'compare', 'compare<', 'compare<=', 'compare=',
        'compare>', 'compare>=', 'compile', 'complement',
        'count', 'curenv', 'debug', 'debug/arg-stack',
        'debug/break', 'debug/fbreak', 'debug/lineage',
        'debug/stack', 'debug/stacktrace', 'debug/step',
        'debug/unbreak', 'debug/unfbreak', 'debugger',
        'debugger-on-status', 'dec', 'deep-not=', 'deep=',
        'defglobal', 'describe', 'dictionary?', 'disasm',
        'distinct', 'div', 'doc*', 'doc-format', 'doc-of',
        'dofile', 'drop', 'drop-until', 'drop-while', 'dyn',
        'eflush', 'empty?', 'env-lookup', 'eprin', 'eprinf',
        'eprint', 'eprintf', 'error', 'errorf',
        'ev/acquire-lock', 'ev/acquire-rlock',
        'ev/acquire-wlock', 'ev/all-tasks', 'ev/call',
        'ev/cancel', 'ev/capacity', 'ev/chan', 'ev/chan-close',
        'ev/chunk', 'ev/close', 'ev/count', 'ev/deadline',
        'ev/full', 'ev/give', 'ev/give-supervisor', 'ev/go',
        'ev/lock', 'ev/read', 'ev/release-lock',
        'ev/release-rlock', 'ev/release-wlock', 'ev/rselect',
        'ev/rwlock', 'ev/select', 'ev/sleep', 'ev/take',
        'ev/thread', 'ev/thread-chan', 'ev/write', 'eval',
        'eval-string', 'even?', 'every?', 'extreme', 'false?',
        'ffi/align', 'ffi/call', 'ffi/calling-conventions',
        'ffi/close', 'ffi/context', 'ffi/free', 'ffi/jitfn',
        'ffi/lookup', 'ffi/malloc', 'ffi/native',
        'ffi/pointer-buffer', 'ffi/pointer-cfunction',
        'ffi/read', 'ffi/signature', 'ffi/size', 'ffi/struct',
        'ffi/trampoline', 'ffi/write', 'fiber/can-resume?',
        'fiber/current', 'fiber/getenv', 'fiber/last-value',
        'fiber/maxstack', 'fiber/new', 'fiber/root',
        'fiber/setenv', 'fiber/setmaxstack', 'fiber/status',
        'fiber?', 'file/close', 'file/flush', 'file/lines',
        'file/open', 'file/read', 'file/seek', 'file/tell',
        'file/temp', 'file/write', 'filter', 'find',
        'find-index', 'first', 'flatten', 'flatten-into',
        'flush', 'flycheck', 'freeze', 'frequencies',
        'from-pairs', 'function?', 'gccollect', 'gcinterval',
        'gcsetinterval', 'gensym', 'get', 'get-in', 'getline',
        'getproto', 'group-by', 'has-key?', 'has-value?',
        'hash', 'idempotent?', 'identity', 'import*', 'in',
        'inc', 'index-of', 'indexed?', 'int/s64',
        'int/to-bytes', 'int/to-number', 'int/u64', 'int?',
        'interleave', 'interpose', 'invert', 'juxt*', 'keep',
        'keep-syntax', 'keep-syntax!', 'keys', 'keyword',
        'keyword/slice', 'keyword?', 'kvs', 'last', 'length',
        'lengthable?', 'load-image', 'macex', 'macex1',
        'maclintf', 'make-env', 'make-image', 'map', 'mapcat',
        'marshal', 'math/abs', 'math/acos', 'math/acosh',
        'math/asin', 'math/asinh', 'math/atan', 'math/atan2',
        'math/atanh', 'math/cbrt', 'math/ceil', 'math/cos',
        'math/cosh', 'math/erf', 'math/erfc', 'math/exp',
        'math/exp2', 'math/expm1', 'math/floor', 'math/gamma',
        'math/gcd', 'math/hypot', 'math/lcm', 'math/log',
        'math/log-gamma', 'math/log10', 'math/log1p',
        'math/log2', 'math/next', 'math/pow', 'math/random',
        'math/rng', 'math/rng-buffer', 'math/rng-int',
        'math/rng-uniform', 'math/round', 'math/seedrandom',
        'math/sin', 'math/sinh', 'math/sqrt', 'math/tan',
        'math/tanh', 'math/trunc', 'max', 'max-of', 'mean',
        'memcmp', 'merge', 'merge-into', 'merge-module', 'min',
        'min-of', 'mod', 'module/add-paths',
        'module/expand-path', 'module/find', 'module/value',
        'nan?', 'nat?', 'native', 'neg?', 'net/accept',
        'net/accept-loop', 'net/address', 'net/address-unpack',
        'net/chunk', 'net/close', 'net/connect', 'net/flush',
        'net/listen', 'net/localname', 'net/peername',
        'net/read', 'net/recv-from', 'net/send-to',
        'net/server', 'net/setsockopt', 'net/shutdown',
        'net/write', 'next', 'nil?', 'not', 'not=', 'number?',
        'odd?', 'one?', 'os/arch', 'os/cd', 'os/chmod',
        'os/clock', 'os/compiler', 'os/cpu-count',
        'os/cryptorand', 'os/cwd', 'os/date', 'os/dir',
        'os/environ', 'os/execute', 'os/exit', 'os/getenv',
        'os/isatty', 'os/link', 'os/lstat', 'os/mkdir',
        'os/mktime', 'os/open', 'os/perm-int', 'os/perm-string',
        'os/pipe', 'os/posix-exec', 'os/posix-fork',
        'os/proc-close', 'os/proc-kill', 'os/proc-wait',
        'os/readlink', 'os/realpath', 'os/rename', 'os/rm',
        'os/rmdir', 'os/setenv', 'os/shell', 'os/sigaction',
        'os/sleep', 'os/spawn', 'os/stat', 'os/strftime',
        'os/symlink', 'os/time', 'os/touch', 'os/umask',
        'os/which', 'pairs', 'parse', 'parse-all',
        'parser/byte', 'parser/clone', 'parser/consume',
        'parser/eof', 'parser/error', 'parser/flush',
        'parser/has-more', 'parser/insert', 'parser/new',
        'parser/produce', 'parser/state', 'parser/status',
        'parser/where', 'partial', 'partition', 'partition-by',
        'peg/compile', 'peg/find', 'peg/find-all', 'peg/match',
        'peg/replace', 'peg/replace-all', 'pos?', 'postwalk',
        'pp', 'prewalk', 'prin', 'prinf', 'print', 'printf',
        'product', 'propagate', 'put', 'put-in', 'quit',
        'range', 'reduce', 'reduce2', 'repl', 'require',
        'resume', 'return', 'reverse', 'reverse!',
        'run-context', 'sandbox', 'scan-number', 'setdyn',
        'signal', 'slice', 'slurp', 'some', 'sort', 'sort-by',
        'sorted', 'sorted-by', 'spit', 'string',
        'string/ascii-lower', 'string/ascii-upper',
        'string/bytes', 'string/check-set', 'string/find',
        'string/find-all', 'string/format', 'string/from-bytes',
        'string/has-prefix?', 'string/has-suffix?',
        'string/join', 'string/repeat', 'string/replace',
        'string/replace-all', 'string/reverse', 'string/slice',
        'string/split', 'string/trim', 'string/triml',
        'string/trimr', 'string?', 'struct', 'struct/getproto',
        'struct/proto-flatten', 'struct/to-table',
        'struct/with-proto', 'struct?', 'sum', 'symbol',
        'symbol/slice', 'symbol?', 'table', 'table/clear',
        'table/clone', 'table/getproto', 'table/new',
        'table/proto-flatten', 'table/rawget', 'table/setproto',
        'table/to-struct', 'table/weak', 'table/weak-keys',
        'table/weak-values', 'table?', 'take', 'take-until',
        'take-while', 'thaw', 'trace', 'true?', 'truthy?',
        'tuple', 'tuple/brackets', 'tuple/setmap',
        'tuple/slice', 'tuple/sourcemap', 'tuple/type',
        'tuple?', 'type', 'unmarshal', 'untrace', 'update',
        'update-in', 'values', 'varglobal', 'walk',
        'warn-compile', 'xprin', 'xprinf', 'xprint', 'xprintf',
        'yield', 'zero?', 'zipcoll',
        # obsolete builtin functions
        'tarray/buffer', 'tarray/copy-bytes', 'tarray/length',
        'tarray/new', 'tarray/properties', 'tarray/slice',
        'tarray/swap-bytes', 'thread/close', 'thread/current',
        'thread/exit', 'thread/new', 'thread/receive',
        'thread/send'
    )

    builtin_variables = (
        'debugger-env', 'default-peg-grammar', 'janet/build',
        'janet/config-bits', 'janet/version', 'load-image-dict',
        'make-image-dict', 'math/-inf', 'math/e', 'math/inf',
        'math/int-max', 'math/int-min', 'math/int32-max',
        'math/int32-min', 'math/nan', 'math/pi', 'module/cache',
        'module/loaders', 'module/loading', 'module/paths',
        'root-env', 'stderr', 'stdin', 'stdout'
    )

    constants = (
        'false', 'nil', 'true'
    )

    # XXX: this form not usable to pass to `suffix=`
    #_token_end = r'''
    #  (?=            # followed by one of:
    #      \s           # whitespace
    #    | \#           # comment
    #    | [)\]]        # end delimiters
    #    | $            # end of file
    #  )
    #'''

    # ...so, express it like this
    _token_end = r'(?=\s|#|[)\]]|$)'

    _first_char = r'[a-zA-Z!$%&*+\-./<=>?@^_]'
    _rest_char = rf'([0-9:]|{_first_char})'

    valid_name = rf'{_first_char}({_rest_char})*'

    _radix_unit = r'[0-9a-zA-Z][0-9a-zA-Z_]*'

    # exponent marker, optional sign, one or more alphanumeric
    _radix_exp = r'&[+-]?[0-9a-zA-Z]+'

    # 2af3__bee_
    _hex_unit = r'[0-9a-fA-F][0-9a-fA-F_]*'

    # 12_000__
    _dec_unit = r'[0-9][0-9_]*'

    # E-23
    # lower or uppercase e, optional sign, one or more digits
    _dec_exp = r'[eE][+-]?[0-9]+'

    tokens = {
        'root': [
            (r'#.*$', Comment.Single),

            (r'\s+', Whitespace),

            # radix number
            (rf'''(?x)
                  [+-]? [0-9]{{1,2}} r {_radix_unit} \. ({_radix_unit})?
                  ({_radix_exp})?
               ''',
             Number),

            (rf'''(?x)
                  [+-]? [0-9]{{1,2}} r (\.)? {_radix_unit}
                  ({_radix_exp})?
               ''',
             Number),

            # hex number
            (rf'(?x) [+-]? 0x {_hex_unit} \. ({_hex_unit})?',
             Number.Hex),

            (rf'(?x) [+-]? 0x (\.)? {_hex_unit}',
             Number.Hex),

            # decimal number
            (rf'(?x) [+-]? {_dec_unit} \. ({_dec_unit})? ({_dec_exp})?',
             Number.Float),

            (rf'(?x) [+-]? (\.)? {_dec_unit} ({_dec_exp})?',
             Number.Float),

            # strings and buffers
            (r'@?"', String, 'string'),

            # long-strings and long-buffers
            #
            #   non-empty content enclosed by a pair of n-backticks
            #   with optional leading @
            (r'@?(`+)(.|\n)+?\1', String),

            # things that hang out on front
            #
            #   ' ~ , ; |
            (r"['~,;|]", Operator),

            # collection delimiters
            #
            #   @( ( )
            #   @[ [ ]
            #   @{ { }
            (r'@?[(\[{]|[)\]}]', Punctuation),

            # constants
            (words(constants, suffix=_token_end), Keyword.Constants),

            # keywords
            (rf'(:({_rest_char})+|:)', Name.Constant),

            # symbols
            (words(builtin_variables, suffix=_token_end),
             Name.Variable.Global),

            (words(special_forms, prefix=r'(?<=\()', suffix=_token_end),
             Keyword.Reserved),

            (words(builtin_macros, prefix=r'(?<=\()', suffix=_token_end),
             Name.Builtin),

            (words(builtin_functions, prefix=r'(?<=\()', suffix=_token_end),
             Name.Function),

            # other symbols
            (valid_name, Name.Variable),
        ],
        'string': [
            (r'\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{6})', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
            (r'\\.', String.Escape),
            (r'"', String, '#pop'),
            (r'[^\\"]+', String),
        ]
    }
