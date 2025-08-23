"""
    pygments.lexers._julia_builtins
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Julia builtins.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

# operators
#   see https://github.com/JuliaLang/julia/blob/master/src/julia-parser.scm
# Julia v1.6.0-rc1
OPERATORS_LIST = [
    # other
    '->',
    # prec-assignment
    ':=', '$=',
    # prec-conditional, prec-lazy-or, prec-lazy-and
    '?', '||', '&&',
    # prec-colon
    ':',
    # prec-plus
    '$',
    # prec-decl
    '::',
]
DOTTED_OPERATORS_LIST = [
    # prec-assignment
    r'=', r'+=', r'-=', r'*=', r'/=', r'//=', r'\=', r'^=', r'÷=', r'%=', r'<<=',
    r'>>=', r'>>>=', r'|=', r'&=', r'⊻=', r'≔', r'⩴', r"≕'", r'~',
    # prec-pair
    '=>',
    # prec-arrow
    r'→', r'↔', r'↚', r'↛', r'↞', r'↠', r'↢', r'↣', r'↦', r'↤', r'↮', r'⇎', r'⇍', r'⇏',
    r'⇐', r'⇒', r'⇔', r'⇴', r'⇶', r'⇷', r'⇸', r'⇹', r'⇺', r'⇻', r'⇼', r'⇽', r'⇾', r'⇿',
    r'⟵', r'⟶', r'⟷', r'⟹', r'⟺', r'⟻', r'⟼', r'⟽', r'⟾', r'⟿', r'⤀', r'⤁', r'⤂', r'⤃',
    r'⤄', r'⤅', r'⤆', r'⤇', r'⤌', r'⤍', r'⤎', r'⤏', r'⤐', r'⤑', r'⤔', r'⤕', r'⤖', r'⤗',
    r'⤘', r'⤝', r'⤞', r'⤟', r'⤠', r'⥄', r'⥅', r'⥆', r'⥇', r'⥈', r'⥊', r'⥋', r'⥎', r'⥐',
    r'⥒', r'⥓', r'⥖', r'⥗', r'⥚', r'⥛', r'⥞', r'⥟', r'⥢', r'⥤', r'⥦', r'⥧', r'⥨', r'⥩',
    r'⥪', r'⥫', r'⥬', r'⥭', r'⥰', r'⧴', r'⬱', r'⬰', r'⬲', r'⬳', r'⬴', r'⬵', r'⬶', r'⬷',
    r'⬸', r'⬹', r'⬺', r'⬻', r'⬼', r'⬽', r'⬾', r'⬿', r'⭀', r'⭁', r'⭂', r'⭃', r'⭄', r'⭇',
    r'⭈', r'⭉', r'⭊', r'⭋', r'⭌', r'￩', r'￫', r'⇜', r'⇝', r'↜', r'↝', r'↩', r'↪', r'↫',
    r'↬', r'↼', r'↽', r'⇀', r'⇁', r'⇄', r'⇆', r'⇇', r'⇉', r'⇋', r'⇌', r'⇚', r'⇛', r'⇠',
    r'⇢', r'↷', r'↶', r'↺', r'↻', r'-->', r'<--', r'<-->',
    # prec-comparison
    r'>', r'<', r'>=', r'≥', r'<=', r'≤', r'==', r'===', r'≡', r'!=', r'≠', r'!==',
    r'≢', r'∈', r'∉', r'∋', r'∌', r'⊆', r'⊈', r'⊂', r'⊄', r'⊊', r'∝', r'∊', r'∍', r'∥',
    r'∦', r'∷', r'∺', r'∻', r'∽', r'∾', r'≁', r'≃', r'≂', r'≄', r'≅', r'≆', r'≇', r'≈',
    r'≉', r'≊', r'≋', r'≌', r'≍', r'≎', r'≐', r'≑', r'≒', r'≓', r'≖', r'≗', r'≘', r'≙',
    r'≚', r'≛', r'≜', r'≝', r'≞', r'≟', r'≣', r'≦', r'≧', r'≨', r'≩', r'≪', r'≫', r'≬',
    r'≭', r'≮', r'≯', r'≰', r'≱', r'≲', r'≳', r'≴', r'≵', r'≶', r'≷', r'≸', r'≹', r'≺',
    r'≻', r'≼', r'≽', r'≾', r'≿', r'⊀', r'⊁', r'⊃', r'⊅', r'⊇', r'⊉', r'⊋', r'⊏', r'⊐',
    r'⊑', r'⊒', r'⊜', r'⊩', r'⊬', r'⊮', r'⊰', r'⊱', r'⊲', r'⊳', r'⊴', r'⊵', r'⊶', r'⊷',
    r'⋍', r'⋐', r'⋑', r'⋕', r'⋖', r'⋗', r'⋘', r'⋙', r'⋚', r'⋛', r'⋜', r'⋝', r'⋞', r'⋟',
    r'⋠', r'⋡', r'⋢', r'⋣', r'⋤', r'⋥', r'⋦', r'⋧', r'⋨', r'⋩', r'⋪', r'⋫', r'⋬', r'⋭',
    r'⋲', r'⋳', r'⋴', r'⋵', r'⋶', r'⋷', r'⋸', r'⋹', r'⋺', r'⋻', r'⋼', r'⋽', r'⋾', r'⋿',
    r'⟈', r'⟉', r'⟒', r'⦷', r'⧀', r'⧁', r'⧡', r'⧣', r'⧤', r'⧥', r'⩦', r'⩧', r'⩪', r'⩫',
    r'⩬', r'⩭', r'⩮', r'⩯', r'⩰', r'⩱', r'⩲', r'⩳', r'⩵', r'⩶', r'⩷', r'⩸', r'⩹', r'⩺',
    r'⩻', r'⩼', r'⩽', r'⩾', r'⩿', r'⪀', r'⪁', r'⪂', r'⪃', r'⪄', r'⪅', r'⪆', r'⪇', r'⪈',
    r'⪉', r'⪊', r'⪋', r'⪌', r'⪍', r'⪎', r'⪏', r'⪐', r'⪑', r'⪒', r'⪓', r'⪔', r'⪕', r'⪖',
    r'⪗', r'⪘', r'⪙', r'⪚', r'⪛', r'⪜', r'⪝', r'⪞', r'⪟', r'⪠', r'⪡', r'⪢', r'⪣', r'⪤',
    r'⪥', r'⪦', r'⪧', r'⪨', r'⪩', r'⪪', r'⪫', r'⪬', r'⪭', r'⪮', r'⪯', r'⪰', r'⪱', r'⪲',
    r'⪳', r'⪴', r'⪵', r'⪶', r'⪷', r'⪸', r'⪹', r'⪺', r'⪻', r'⪼', r'⪽', r'⪾', r'⪿', r'⫀',
    r'⫁', r'⫂', r'⫃', r'⫄', r'⫅', r'⫆', r'⫇', r'⫈', r'⫉', r'⫊', r'⫋', r'⫌', r'⫍', r'⫎',
    r'⫏', r'⫐', r'⫑', r'⫒', r'⫓', r'⫔', r'⫕', r'⫖', r'⫗', r'⫘', r'⫙', r'⫷', r'⫸', r'⫹',
    r'⫺', r'⊢', r'⊣', r'⟂', r'<:', r'>:',
    # prec-pipe
    '<|', '|>',
    # prec-colon
    r'…', r'⁝', r'⋮', r'⋱', r'⋰', r'⋯',
    # prec-plus
    r'+', r'-', r'¦', r'|', r'⊕', r'⊖', r'⊞', r'⊟', r'++', r'∪', r'∨', r'⊔', r'±', r'∓',
    r'∔', r'∸', r'≏', r'⊎', r'⊻', r'⊽', r'⋎', r'⋓', r'⧺', r'⧻', r'⨈', r'⨢', r'⨣', r'⨤',
    r'⨥', r'⨦', r'⨧', r'⨨', r'⨩', r'⨪', r'⨫', r'⨬', r'⨭', r'⨮', r'⨹', r'⨺', r'⩁', r'⩂',
    r'⩅', r'⩊', r'⩌', r'⩏', r'⩐', r'⩒', r'⩔', r'⩖', r'⩗', r'⩛', r'⩝', r'⩡', r'⩢', r'⩣',
    # prec-times
    r'*', r'/', r'⌿', r'÷', r'%', r'&', r'⋅', r'∘', r'×', '\\', r'∩', r'∧', r'⊗', r'⊘',
    r'⊙', r'⊚', r'⊛', r'⊠', r'⊡', r'⊓', r'∗', r'∙', r'∤', r'⅋', r'≀', r'⊼', r'⋄', r'⋆',
    r'⋇', r'⋉', r'⋊', r'⋋', r'⋌', r'⋏', r'⋒', r'⟑', r'⦸', r'⦼', r'⦾', r'⦿', r'⧶', r'⧷',
    r'⨇', r'⨰', r'⨱', r'⨲', r'⨳', r'⨴', r'⨵', r'⨶', r'⨷', r'⨸', r'⨻', r'⨼', r'⨽', r'⩀',
    r'⩃', r'⩄', r'⩋', r'⩍', r'⩎', r'⩑', r'⩓', r'⩕', r'⩘', r'⩚', r'⩜', r'⩞', r'⩟', r'⩠',
    r'⫛', r'⊍', r'▷', r'⨝', r'⟕', r'⟖', r'⟗', r'⨟',
    # prec-rational, prec-bitshift
    '//', '>>', '<<', '>>>',
    # prec-power
    r'^', r'↑', r'↓', r'⇵', r'⟰', r'⟱', r'⤈', r'⤉', r'⤊', r'⤋', r'⤒', r'⤓', r'⥉', r'⥌',
    r'⥍', r'⥏', r'⥑', r'⥔', r'⥕', r'⥘', r'⥙', r'⥜', r'⥝', r'⥠', r'⥡', r'⥣', r'⥥', r'⥮',
    r'⥯', r'￪', r'￬',
    # unary-ops, excluding unary-and-binary-ops
    '!', r'¬', r'√', r'∛', r'∜'
]

# Generated with the following in Julia v1.6.0-rc1
'''
#!/usr/bin/env julia

import REPL.REPLCompletions
res = String["in", "isa", "where"]
for kw in collect(x.keyword for x in REPLCompletions.complete_keyword(""))
    if !(contains(kw, " ") || kw == "struct")
        push!(res, kw)
    end
end
sort!(unique!(setdiff!(res, ["true", "false"])))
foreach(x -> println("\'", x, "\',"), res)
'''
KEYWORD_LIST = (
    'baremodule',
    'begin',
    'break',
    'catch',
    'ccall',
    'const',
    'continue',
    'do',
    'else',
    'elseif',
    'end',
    'export',
    'finally',
    'for',
    'function',
    'global',
    'if',
    'import',
    'in',
    'isa',
    'let',
    'local',
    'macro',
    'module',
    'quote',
    'return',
    'try',
    'using',
    'where',
    'while',
)

# Generated with the following in Julia v1.6.0-rc1
'''
#!/usr/bin/env julia

import REPL.REPLCompletions
res = String[]
for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
                    REPLCompletions.completions("", 0)[1])
    try
        v = eval(Symbol(compl.mod))
        if (v isa Type || v isa TypeVar) && (compl.mod != "=>")
            push!(res, compl.mod)
        end
    catch e
    end
end
sort!(unique!(res))
foreach(x -> println("\'", x, "\',"), res)
'''
BUILTIN_LIST = (
    'AbstractArray',
    'AbstractChannel',
    'AbstractChar',
    'AbstractDict',
    'AbstractDisplay',
    'AbstractFloat',
    'AbstractIrrational',
    'AbstractMatch',
    'AbstractMatrix',
    'AbstractPattern',
    'AbstractRange',
    'AbstractSet',
    'AbstractString',
    'AbstractUnitRange',
    'AbstractVecOrMat',
    'AbstractVector',
    'Any',
    'ArgumentError',
    'Array',
    'AssertionError',
    'BigFloat',
    'BigInt',
    'BitArray',
    'BitMatrix',
    'BitSet',
    'BitVector',
    'Bool',
    'BoundsError',
    'CapturedException',
    'CartesianIndex',
    'CartesianIndices',
    'Cchar',
    'Cdouble',
    'Cfloat',
    'Channel',
    'Char',
    'Cint',
    'Cintmax_t',
    'Clong',
    'Clonglong',
    'Cmd',
    'Colon',
    'Complex',
    'ComplexF16',
    'ComplexF32',
    'ComplexF64',
    'ComposedFunction',
    'CompositeException',
    'Condition',
    'Cptrdiff_t',
    'Cshort',
    'Csize_t',
    'Cssize_t',
    'Cstring',
    'Cuchar',
    'Cuint',
    'Cuintmax_t',
    'Culong',
    'Culonglong',
    'Cushort',
    'Cvoid',
    'Cwchar_t',
    'Cwstring',
    'DataType',
    'DenseArray',
    'DenseMatrix',
    'DenseVecOrMat',
    'DenseVector',
    'Dict',
    'DimensionMismatch',
    'Dims',
    'DivideError',
    'DomainError',
    'EOFError',
    'Enum',
    'ErrorException',
    'Exception',
    'ExponentialBackOff',
    'Expr',
    'Float16',
    'Float32',
    'Float64',
    'Function',
    'GlobalRef',
    'HTML',
    'IO',
    'IOBuffer',
    'IOContext',
    'IOStream',
    'IdDict',
    'IndexCartesian',
    'IndexLinear',
    'IndexStyle',
    'InexactError',
    'InitError',
    'Int',
    'Int128',
    'Int16',
    'Int32',
    'Int64',
    'Int8',
    'Integer',
    'InterruptException',
    'InvalidStateException',
    'Irrational',
    'KeyError',
    'LinRange',
    'LineNumberNode',
    'LinearIndices',
    'LoadError',
    'MIME',
    'Matrix',
    'Method',
    'MethodError',
    'Missing',
    'MissingException',
    'Module',
    'NTuple',
    'NamedTuple',
    'Nothing',
    'Number',
    'OrdinalRange',
    'OutOfMemoryError',
    'OverflowError',
    'Pair',
    'PartialQuickSort',
    'PermutedDimsArray',
    'Pipe',
    'ProcessFailedException',
    'Ptr',
    'QuoteNode',
    'Rational',
    'RawFD',
    'ReadOnlyMemoryError',
    'Real',
    'ReentrantLock',
    'Ref',
    'Regex',
    'RegexMatch',
    'RoundingMode',
    'SegmentationFault',
    'Set',
    'Signed',
    'Some',
    'StackOverflowError',
    'StepRange',
    'StepRangeLen',
    'StridedArray',
    'StridedMatrix',
    'StridedVecOrMat',
    'StridedVector',
    'String',
    'StringIndexError',
    'SubArray',
    'SubString',
    'SubstitutionString',
    'Symbol',
    'SystemError',
    'Task',
    'TaskFailedException',
    'Text',
    'TextDisplay',
    'Timer',
    'Tuple',
    'Type',
    'TypeError',
    'TypeVar',
    'UInt',
    'UInt128',
    'UInt16',
    'UInt32',
    'UInt64',
    'UInt8',
    'UndefInitializer',
    'UndefKeywordError',
    'UndefRefError',
    'UndefVarError',
    'Union',
    'UnionAll',
    'UnitRange',
    'Unsigned',
    'Val',
    'Vararg',
    'VecElement',
    'VecOrMat',
    'Vector',
    'VersionNumber',
    'WeakKeyDict',
    'WeakRef',
)

# Generated with the following in Julia v1.6.0-rc1
'''
#!/usr/bin/env julia

import REPL.REPLCompletions
res = String["true", "false"]
for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
                    REPLCompletions.completions("", 0)[1])
    try
        v = eval(Symbol(compl.mod))
        if !(v isa Function || v isa Type || v isa TypeVar || v isa Module || v isa Colon)
            push!(res, compl.mod)
        end
    catch e
    end
end
sort!(unique!(res))
foreach(x -> println("\'", x, "\',"), res)
'''
LITERAL_LIST = (
    'ARGS',
    'C_NULL',
    'DEPOT_PATH',
    'ENDIAN_BOM',
    'ENV',
    'Inf',
    'Inf16',
    'Inf32',
    'Inf64',
    'InsertionSort',
    'LOAD_PATH',
    'MergeSort',
    'NaN',
    'NaN16',
    'NaN32',
    'NaN64',
    'PROGRAM_FILE',
    'QuickSort',
    'RoundDown',
    'RoundFromZero',
    'RoundNearest',
    'RoundNearestTiesAway',
    'RoundNearestTiesUp',
    'RoundToZero',
    'RoundUp',
    'VERSION',
    'devnull',
    'false',
    'im',
    'missing',
    'nothing',
    'pi',
    'stderr',
    'stdin',
    'stdout',
    'true',
    'undef',
    'π',
    'ℯ',
)
