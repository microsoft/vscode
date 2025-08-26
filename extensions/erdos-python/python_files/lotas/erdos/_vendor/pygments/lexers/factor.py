"""
    pygments.lexers.factor
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Factor language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default, words
from lotas.erdos._vendor.pygments.token import Text, Comment, Keyword, Name, String, Number, \
    Whitespace, Punctuation

__all__ = ['FactorLexer']


class FactorLexer(RegexLexer):
    """
    Lexer for the Factor language.
    """
    name = 'Factor'
    url = 'http://factorcode.org'
    aliases = ['factor']
    filenames = ['*.factor']
    mimetypes = ['text/x-factor']
    version_added = '1.4'

    builtin_kernel = words((
        '-rot', '2bi', '2bi@', '2bi*', '2curry', '2dip', '2drop', '2dup', '2keep', '2nip',
        '2over', '2tri', '2tri@', '2tri*', '3bi', '3curry', '3dip', '3drop', '3dup', '3keep',
        '3tri', '4dip', '4drop', '4dup', '4keep', '<wrapper>', '=', '>boolean', 'clone',
        '?', '?execute', '?if', 'and', 'assert', 'assert=', 'assert?', 'bi', 'bi-curry',
        'bi-curry@', 'bi-curry*', 'bi@', 'bi*', 'boa', 'boolean', 'boolean?', 'both?',
        'build', 'call', 'callstack', 'callstack>array', 'callstack?', 'clear', '(clone)',
        'compose', 'compose?', 'curry', 'curry?', 'datastack', 'die', 'dip', 'do', 'drop',
        'dup', 'dupd', 'either?', 'eq?', 'equal?', 'execute', 'hashcode', 'hashcode*',
        'identity-hashcode', 'identity-tuple', 'identity-tuple?', 'if', 'if*',
        'keep', 'loop', 'most', 'new', 'nip', 'not', 'null', 'object', 'or', 'over',
        'pick', 'prepose', 'retainstack', 'rot', 'same?', 'swap', 'swapd', 'throw',
        'tri', 'tri-curry', 'tri-curry@', 'tri-curry*', 'tri@', 'tri*', 'tuple',
        'tuple?', 'unless', 'unless*', 'until', 'when', 'when*', 'while', 'with',
        'wrapper', 'wrapper?', 'xor'), suffix=r'(\s+)')

    builtin_assocs = words((
        '2cache', '<enum>', '>alist', '?at', '?of', 'assoc', 'assoc-all?',
        'assoc-any?', 'assoc-clone-like', 'assoc-combine', 'assoc-diff',
        'assoc-diff!', 'assoc-differ', 'assoc-each', 'assoc-empty?',
        'assoc-filter', 'assoc-filter!', 'assoc-filter-as', 'assoc-find',
        'assoc-hashcode', 'assoc-intersect', 'assoc-like', 'assoc-map',
        'assoc-map-as', 'assoc-partition', 'assoc-refine', 'assoc-size',
        'assoc-stack', 'assoc-subset?', 'assoc-union', 'assoc-union!',
        'assoc=', 'assoc>map', 'assoc?', 'at', 'at+', 'at*', 'cache', 'change-at',
        'clear-assoc', 'delete-at', 'delete-at*', 'enum', 'enum?', 'extract-keys',
        'inc-at', 'key?', 'keys', 'map>assoc', 'maybe-set-at', 'new-assoc', 'of',
        'push-at', 'rename-at', 'set-at', 'sift-keys', 'sift-values', 'substitute',
        'unzip', 'value-at', 'value-at*', 'value?', 'values', 'zip'), suffix=r'(\s+)')

    builtin_combinators = words((
        '2cleave', '2cleave>quot', '3cleave', '3cleave>quot', '4cleave',
        '4cleave>quot', 'alist>quot', 'call-effect', 'case', 'case-find',
        'case>quot', 'cleave', 'cleave>quot', 'cond', 'cond>quot', 'deep-spread>quot',
        'execute-effect', 'linear-case-quot', 'no-case', 'no-case?', 'no-cond',
        'no-cond?', 'recursive-hashcode', 'shallow-spread>quot', 'spread',
        'to-fixed-point', 'wrong-values', 'wrong-values?'), suffix=r'(\s+)')

    builtin_math = words((
        '-', '/', '/f', '/i', '/mod', '2/', '2^', '<', '<=', '<fp-nan>', '>',
        '>=', '>bignum', '>fixnum', '>float', '>integer', '(all-integers?)',
        '(each-integer)', '(find-integer)', '*', '+', '?1+',
        'abs', 'align', 'all-integers?', 'bignum', 'bignum?', 'bit?', 'bitand',
        'bitnot', 'bitor', 'bits>double', 'bits>float', 'bitxor', 'complex',
        'complex?', 'denominator', 'double>bits', 'each-integer', 'even?',
        'find-integer', 'find-last-integer', 'fixnum', 'fixnum?', 'float',
        'float>bits', 'float?', 'fp-bitwise=', 'fp-infinity?', 'fp-nan-payload',
        'fp-nan?', 'fp-qnan?', 'fp-sign', 'fp-snan?', 'fp-special?',
        'if-zero', 'imaginary-part', 'integer', 'integer>fixnum',
        'integer>fixnum-strict', 'integer?', 'log2', 'log2-expects-positive',
        'log2-expects-positive?', 'mod', 'neg', 'neg?', 'next-float',
        'next-power-of-2', 'number', 'number=', 'number?', 'numerator', 'odd?',
        'out-of-fixnum-range', 'out-of-fixnum-range?', 'power-of-2?',
        'prev-float', 'ratio', 'ratio?', 'rational', 'rational?', 'real',
        'real-part', 'real?', 'recip', 'rem', 'sgn', 'shift', 'sq', 'times',
        'u<', 'u<=', 'u>', 'u>=', 'unless-zero', 'unordered?', 'when-zero',
        'zero?'), suffix=r'(\s+)')

    builtin_sequences = words((
        '1sequence', '2all?', '2each', '2map', '2map-as', '2map-reduce', '2reduce',
        '2selector', '2sequence', '3append', '3append-as', '3each', '3map', '3map-as',
        '3sequence', '4sequence', '<repetition>', '<reversed>', '<slice>', '?first',
        '?last', '?nth', '?second', '?set-nth', 'accumulate', 'accumulate!',
        'accumulate-as', 'all?', 'any?', 'append', 'append!', 'append-as',
        'assert-sequence', 'assert-sequence=', 'assert-sequence?',
        'binary-reduce', 'bounds-check', 'bounds-check?', 'bounds-error',
        'bounds-error?', 'but-last', 'but-last-slice', 'cartesian-each',
        'cartesian-map', 'cartesian-product', 'change-nth', 'check-slice',
        'check-slice-error', 'clone-like', 'collapse-slice', 'collector',
        'collector-for', 'concat', 'concat-as', 'copy', 'count', 'cut', 'cut-slice',
        'cut*', 'delete-all', 'delete-slice', 'drop-prefix', 'each', 'each-from',
        'each-index', 'empty?', 'exchange', 'filter', 'filter!', 'filter-as', 'find',
        'find-from', 'find-index', 'find-index-from', 'find-last', 'find-last-from',
        'first', 'first2', 'first3', 'first4', 'flip', 'follow', 'fourth', 'glue', 'halves',
        'harvest', 'head', 'head-slice', 'head-slice*', 'head*', 'head?',
        'if-empty', 'immutable', 'immutable-sequence', 'immutable-sequence?',
        'immutable?', 'index', 'index-from', 'indices', 'infimum', 'infimum-by',
        'insert-nth', 'interleave', 'iota', 'iota-tuple', 'iota-tuple?', 'join',
        'join-as', 'last', 'last-index', 'last-index-from', 'length', 'lengthen',
        'like', 'longer', 'longer?', 'longest', 'map', 'map!', 'map-as', 'map-find',
        'map-find-last', 'map-index', 'map-integers', 'map-reduce', 'map-sum',
        'max-length', 'member-eq?', 'member?', 'midpoint@', 'min-length',
        'mismatch', 'move', 'new-like', 'new-resizable', 'new-sequence',
        'non-negative-integer-expected', 'non-negative-integer-expected?',
        'nth', 'nths', 'pad-head', 'pad-tail', 'padding', 'partition', 'pop', 'pop*',
        'prefix', 'prepend', 'prepend-as', 'produce', 'produce-as', 'product', 'push',
        'push-all', 'push-either', 'push-if', 'reduce', 'reduce-index', 'remove',
        'remove!', 'remove-eq', 'remove-eq!', 'remove-nth', 'remove-nth!', 'repetition',
        'repetition?', 'replace-slice', 'replicate', 'replicate-as', 'rest',
        'rest-slice', 'reverse', 'reverse!', 'reversed', 'reversed?', 'second',
        'selector', 'selector-for', 'sequence', 'sequence-hashcode', 'sequence=',
        'sequence?', 'set-first', 'set-fourth', 'set-last', 'set-length', 'set-nth',
        'set-second', 'set-third', 'short', 'shorten', 'shorter', 'shorter?',
        'shortest', 'sift', 'slice', 'slice-error', 'slice-error?', 'slice?',
        'snip', 'snip-slice', 'start', 'start*', 'subseq', 'subseq?', 'suffix',
        'suffix!', 'sum', 'sum-lengths', 'supremum', 'supremum-by', 'surround', 'tail',
        'tail-slice', 'tail-slice*', 'tail*', 'tail?', 'third', 'trim',
        'trim-head', 'trim-head-slice', 'trim-slice', 'trim-tail', 'trim-tail-slice',
        'unclip', 'unclip-last', 'unclip-last-slice', 'unclip-slice', 'unless-empty',
        'virtual-exemplar', 'virtual-sequence', 'virtual-sequence?', 'virtual@',
        'when-empty'), suffix=r'(\s+)')

    builtin_namespaces = words((
        '+@', 'change', 'change-global', 'counter', 'dec', 'get', 'get-global',
        'global', 'inc', 'init-namespaces', 'initialize', 'is-global', 'make-assoc',
        'namespace', 'namestack', 'off', 'on', 'set', 'set-global', 'set-namestack',
        'toggle', 'with-global', 'with-scope', 'with-variable', 'with-variables'),
        suffix=r'(\s+)')

    builtin_arrays = words((
        '1array', '2array', '3array', '4array', '<array>', '>array', 'array',
        'array?', 'pair', 'pair?', 'resize-array'), suffix=r'(\s+)')

    builtin_io = words((
        '(each-stream-block-slice)', '(each-stream-block)',
        '(stream-contents-by-block)', '(stream-contents-by-element)',
        '(stream-contents-by-length-or-block)',
        '(stream-contents-by-length)', '+byte+', '+character+',
        'bad-seek-type', 'bad-seek-type?', 'bl', 'contents', 'each-block',
        'each-block-size', 'each-block-slice', 'each-line', 'each-morsel',
        'each-stream-block', 'each-stream-block-slice', 'each-stream-line',
        'error-stream', 'flush', 'input-stream', 'input-stream?',
        'invalid-read-buffer', 'invalid-read-buffer?', 'lines', 'nl',
        'output-stream', 'output-stream?', 'print', 'read', 'read-into',
        'read-partial', 'read-partial-into', 'read-until', 'read1', 'readln',
        'seek-absolute', 'seek-absolute?', 'seek-end', 'seek-end?',
        'seek-input', 'seek-output', 'seek-relative', 'seek-relative?',
        'stream-bl', 'stream-contents', 'stream-contents*', 'stream-copy',
        'stream-copy*', 'stream-element-type', 'stream-flush',
        'stream-length', 'stream-lines', 'stream-nl', 'stream-print',
        'stream-read', 'stream-read-into', 'stream-read-partial',
        'stream-read-partial-into', 'stream-read-partial-unsafe',
        'stream-read-unsafe', 'stream-read-until', 'stream-read1',
        'stream-readln', 'stream-seek', 'stream-seekable?', 'stream-tell',
        'stream-write', 'stream-write1', 'tell-input', 'tell-output',
        'with-error-stream', 'with-error-stream*', 'with-error>output',
        'with-input-output+error-streams',
        'with-input-output+error-streams*', 'with-input-stream',
        'with-input-stream*', 'with-output-stream', 'with-output-stream*',
        'with-output>error', 'with-output+error-stream',
        'with-output+error-stream*', 'with-streams', 'with-streams*',
        'write', 'write1'), suffix=r'(\s+)')

    builtin_strings = words((
        '1string', '<string>', '>string', 'resize-string', 'string',
        'string?'), suffix=r'(\s+)')

    builtin_vectors = words((
        '1vector', '<vector>', '>vector', '?push', 'vector', 'vector?'),
        suffix=r'(\s+)')

    builtin_continuations = words((
        '<condition>', '<continuation>', '<restart>', 'attempt-all',
        'attempt-all-error', 'attempt-all-error?', 'callback-error-hook',
        'callcc0', 'callcc1', 'cleanup', 'compute-restarts', 'condition',
        'condition?', 'continuation', 'continuation?', 'continue',
        'continue-restart', 'continue-with', 'current-continuation',
        'error', 'error-continuation', 'error-in-thread', 'error-thread',
        'ifcc', 'ignore-errors', 'in-callback?', 'original-error', 'recover',
        'restart', 'restart?', 'restarts', 'rethrow', 'rethrow-restarts',
        'return', 'return-continuation', 'thread-error-hook', 'throw-continue',
        'throw-restarts', 'with-datastack', 'with-return'), suffix=r'(\s+)')

    tokens = {
        'root': [
            # factor allows a file to start with a shebang
            (r'#!.*$', Comment.Preproc),
            default('base'),
        ],
        'base': [
            (r'\s+', Whitespace),

            # defining words
            (r'((?:MACRO|MEMO|TYPED)?:[:]?)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function)),
            (r'(M:[:]?)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class, Whitespace,
                 Name.Function)),
            (r'(C:)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function, Whitespace,
                 Name.Class)),
            (r'(GENERIC:)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function)),
            (r'(HOOK:|GENERIC#)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function, Whitespace,
                 Name.Function)),
            (r'(\()(\s)', bygroups(Name.Function, Whitespace), 'stackeffect'),
            (r'(;)(\s)', bygroups(Keyword, Whitespace)),

            # imports and namespaces
            (r'(USING:)(\s+)',
             bygroups(Keyword.Namespace, Whitespace), 'vocabs'),
            (r'(USE:|UNUSE:|IN:|QUALIFIED:)(\s+)(\S+)',
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
            (r'(QUALIFIED-WITH:)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace,
                 Whitespace, Name.Namespace)),
            (r'(FROM:|EXCLUDE:)(\s+)(\S+)(\s+=>\s)',
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace,
                 Whitespace), 'words'),
            (r'(RENAME:)(\s+)(\S+)(\s+)(\S+)(\s+)(=>)(\s+)(\S+)',
             bygroups(Keyword.Namespace, Whitespace, Name.Function, Whitespace,
                 Name.Namespace, Whitespace, Punctuation, Whitespace,
                 Name.Function)),
            (r'(ALIAS:|TYPEDEF:)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword.Namespace, Whitespace, Name.Function, Whitespace,
                 Name.Function)),
            (r'(DEFER:|FORGET:|POSTPONE:)(\s+)(\S+)',
             bygroups(Keyword.Namespace, Whitespace, Name.Function)),

            # tuples and classes
            (r'(TUPLE:|ERROR:)(\s+)(\S+)(\s+)(<)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class, Whitespace, Punctuation,
                 Whitespace, Name.Class), 'slots'),
            (r'(TUPLE:|ERROR:|BUILTIN:)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class), 'slots'),
            (r'(MIXIN:|UNION:|INTERSECTION:)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class)),
            (r'(PREDICATE:)(\s+)(\S+)(\s+)(<)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class, Whitespace,
                 Punctuation, Whitespace, Name.Class)),
            (r'(C:)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function, Whitespace, Name.Class)),
            (r'(INSTANCE:)(\s+)(\S+)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Class, Whitespace, Name.Class)),
            (r'(SLOT:)(\s+)(\S+)', bygroups(Keyword, Whitespace, Name.Function)),
            (r'(SINGLETON:)(\s+)(\S+)', bygroups(Keyword, Whitespace, Name.Class)),
            (r'SINGLETONS:', Keyword, 'classes'),

            # other syntax
            (r'(CONSTANT:|SYMBOL:|MAIN:|HELP:)(\s+)(\S+)',
             bygroups(Keyword, Whitespace, Name.Function)),
            (r'(SYMBOLS:)(\s+)', bygroups(Keyword, Whitespace), 'words'),
            (r'(SYNTAX:)(\s+)', bygroups(Keyword, Whitespace)),
            (r'(ALIEN:)(\s+)', bygroups(Keyword, Whitespace)),
            (r'(STRUCT:)(\s+)(\S+)', bygroups(Keyword, Whitespace, Name.Class)),
            (r'(FUNCTION:)(\s+)'
                r'(\S+)(\s+)(\S+)(\s+)'
                r'(\()(\s+)([^)]+)(\))(\s)',
             bygroups(Keyword.Namespace, Whitespace,
                 Text, Whitespace, Name.Function, Whitespace,
                 Punctuation, Whitespace, Text, Punctuation, Whitespace)),
            (r'(FUNCTION-ALIAS:)(\s+)'
                r'(\S+)(\s+)(\S+)(\s+)'
                r'(\S+)(\s+)'
                r'(\()(\s+)([^)]+)(\))(\s)',
             bygroups(Keyword.Namespace, Whitespace,
                 Text, Whitespace, Name.Function, Whitespace,
                 Name.Function, Whitespace,
                 Punctuation, Whitespace, Text, Punctuation, Whitespace)),

            # vocab.private
            (r'(<PRIVATE|PRIVATE>)(\s)', bygroups(Keyword.Namespace, Whitespace)),

            # strings
            (r'"""\s(?:.|\n)*?\s"""', String),
            (r'"(?:\\\\|\\"|[^"])*"', String),
            (r'(\S+")(\s+)((?:\\\\|\\"|[^"])*")',
                bygroups(String, Whitespace, String)),
            (r'(CHAR:)(\s+)(\\[\\abfnrstv]|[^\\]\S*)(\s)',
                bygroups(String.Char, Whitespace, String.Char, Whitespace)),

            # comments
            (r'!\s+.*$', Comment),
            (r'#!\s+.*$', Comment),
            (r'/\*\s+(?:.|\n)*?\s\*/', Comment),

            # boolean constants
            (r'[tf]\b', Name.Constant),

            # symbols and literals
            (r'[\\$]\s+\S+', Name.Constant),
            (r'M\\\s+\S+\s+\S+', Name.Constant),

            # numbers
            (r'[+-]?(?:[\d,]*\d)?\.(?:\d([\d,]*\d)?)?(?:[eE][+-]?\d+)?\s', Number),
            (r'[+-]?\d(?:[\d,]*\d)?(?:[eE][+-]?\d+)?\s', Number),
            (r'0x[a-fA-F\d](?:[a-fA-F\d,]*[a-fA-F\d])?(?:p\d([\d,]*\d)?)?\s', Number),
            (r'NAN:\s+[a-fA-F\d](?:[a-fA-F\d,]*[a-fA-F\d])?(?:p\d([\d,]*\d)?)?\s', Number),
            (r'0b[01]+\s', Number.Bin),
            (r'0o[0-7]+\s', Number.Oct),
            (r'(?:\d([\d,]*\d)?)?\+\d(?:[\d,]*\d)?/\d(?:[\d,]*\d)?\s', Number),
            (r'(?:\-\d([\d,]*\d)?)?\-\d(?:[\d,]*\d)?/\d(?:[\d,]*\d)?\s', Number),

            # keywords
            (r'(?:deprecated|final|foldable|flushable|inline|recursive)\s',
             Keyword),

            # builtins
            (builtin_kernel, bygroups(Name.Builtin, Whitespace)),
            (builtin_assocs, bygroups(Name.Builtin, Whitespace)),
            (builtin_combinators, bygroups(Name.Builtin, Whitespace)),
            (builtin_math, bygroups(Name.Builtin, Whitespace)),
            (builtin_sequences, bygroups(Name.Builtin, Whitespace)),
            (builtin_namespaces, bygroups(Name.Builtin, Whitespace)),
            (builtin_arrays, bygroups(Name.Builtin, Whitespace)),
            (builtin_io, bygroups(Name.Builtin, Whitespace)),
            (builtin_strings, bygroups(Name.Builtin, Whitespace)),
            (builtin_vectors, bygroups(Name.Builtin, Whitespace)),
            (builtin_continuations, bygroups(Name.Builtin, Whitespace)),

            # everything else is text
            (r'\S+', Text),
        ],
        'stackeffect': [
            (r'\s+', Whitespace),
            (r'(\()(\s+)', bygroups(Name.Function, Whitespace), 'stackeffect'),
            (r'(\))(\s+)', bygroups(Name.Function, Whitespace), '#pop'),
            (r'(--)(\s+)', bygroups(Name.Function, Whitespace)),
            (r'\S+', Name.Variable),
        ],
        'slots': [
            (r'\s+', Whitespace),
            (r'(;)(\s+)', bygroups(Keyword, Whitespace), '#pop'),
            (r'(\{)(\s+)(\S+)(\s+)([^}]+)(\s+)(\})(\s+)',
             bygroups(Text, Whitespace, Name.Variable, Whitespace,
                 Text, Whitespace, Text, Whitespace)),
            (r'\S+', Name.Variable),
        ],
        'vocabs': [
            (r'\s+', Whitespace),
            (r'(;)(\s+)', bygroups(Keyword, Whitespace), '#pop'),
            (r'\S+', Name.Namespace),
        ],
        'classes': [
            (r'\s+', Whitespace),
            (r'(;)(\s+)', bygroups(Keyword, Whitespace), '#pop'),
            (r'\S+', Name.Class),
        ],
        'words': [
            (r'\s+', Whitespace),
            (r'(;)(\s+)', bygroups(Keyword, Whitespace), '#pop'),
            (r'\S+', Name.Function),
        ],
    }
