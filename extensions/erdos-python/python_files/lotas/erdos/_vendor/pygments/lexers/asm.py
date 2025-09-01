"""
    pygments.lexers.asm
    ~~~~~~~~~~~~~~~~~~~

    Lexers for assembly languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, words, \
    DelegatingLexer, default
from erdos._vendor.pygments.lexers.c_cpp import CppLexer, CLexer
from erdos._vendor.pygments.lexers.d import DLexer
from erdos._vendor.pygments.token import Text, Name, Number, String, Comment, Punctuation, \
    Other, Keyword, Operator, Whitespace

__all__ = ['GasLexer', 'ObjdumpLexer', 'DObjdumpLexer', 'CppObjdumpLexer',
           'CObjdumpLexer', 'HsailLexer', 'LlvmLexer', 'LlvmMirBodyLexer',
           'LlvmMirLexer', 'NasmLexer', 'NasmObjdumpLexer', 'TasmLexer',
           'Ca65Lexer', 'Dasm16Lexer']


class GasLexer(RegexLexer):
    """
    For Gas (AT&T) assembly code.
    """
    name = 'GAS'
    aliases = ['gas', 'asm']
    filenames = ['*.s', '*.S']
    mimetypes = ['text/x-gas']
    url = 'https://www.gnu.org/software/binutils'
    version_added = ''

    #: optional Comment or Whitespace
    string = r'"(\\"|[^"])*"'
    char = r'[\w$.@-]'
    identifier = r'(?:[a-zA-Z$_]' + char + r'*|\.' + char + '+)'
    number = r'(?:0[xX][a-fA-F0-9]+|#?-?\d+)'
    register = '%' + identifier + r'\b'

    tokens = {
        'root': [
            include('whitespace'),
            (identifier + ':', Name.Label),
            (r'\.' + identifier, Name.Attribute, 'directive-args'),
            (r'lock|rep(n?z)?|data\d+', Name.Attribute),
            (identifier, Name.Function, 'instruction-args'),
            (r'[\r\n]+', Text)
        ],
        'directive-args': [
            (identifier, Name.Constant),
            (string, String),
            ('@' + identifier, Name.Attribute),
            (number, Number.Integer),
            (register, Name.Variable),
            (r'[\r\n]+', Whitespace, '#pop'),
            (r'([;#]|//).*?\n', Comment.Single, '#pop'),
            (r'/[*].*?[*]/', Comment.Multiline),
            (r'/[*].*?\n[\w\W]*?[*]/', Comment.Multiline, '#pop'),

            include('punctuation'),
            include('whitespace')
        ],
        'instruction-args': [
            # For objdump-disassembled code, shouldn't occur in
            # actual assembler input
            ('([a-z0-9]+)( )(<)('+identifier+')(>)',
                bygroups(Number.Hex, Text, Punctuation, Name.Constant,
                         Punctuation)),
            ('([a-z0-9]+)( )(<)('+identifier+')([-+])('+number+')(>)',
                bygroups(Number.Hex, Text, Punctuation, Name.Constant,
                         Punctuation, Number.Integer, Punctuation)),

            # Address constants
            (identifier, Name.Constant),
            (number, Number.Integer),
            # Registers
            (register, Name.Variable),
            # Numeric constants
            ('$'+number, Number.Integer),
            (r"$'(.|\\')'", String.Char),
            (r'[\r\n]+', Whitespace, '#pop'),
            (r'([;#]|//).*?\n', Comment.Single, '#pop'),
            (r'/[*].*?[*]/', Comment.Multiline),
            (r'/[*].*?\n[\w\W]*?[*]/', Comment.Multiline, '#pop'),

            include('punctuation'),
            include('whitespace')
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'([;#]|//).*?\n', Comment.Single),
            (r'/[*][\w\W]*?[*]/', Comment.Multiline)
        ],
        'punctuation': [
            (r'[-*,.()\[\]!:{}]+', Punctuation)
        ]
    }

    def analyse_text(text):
        if re.search(r'^\.(text|data|section)', text, re.M):
            return True
        elif re.search(r'^\.\w+', text, re.M):
            return 0.1


def _objdump_lexer_tokens(asm_lexer):
    """
    Common objdump lexer tokens to wrap an ASM lexer.
    """
    hex_re = r'[0-9A-Za-z]'
    return {
        'root': [
            # File name & format:
            ('(.*?)(:)( +file format )(.*?)$',
                bygroups(Name.Label, Punctuation, Text, String)),
            # Section header
            ('(Disassembly of section )(.*?)(:)$',
                bygroups(Text, Name.Label, Punctuation)),
            # Function labels
            # (With offset)
            ('('+hex_re+'+)( )(<)(.*?)([-+])(0[xX][A-Za-z0-9]+)(>:)$',
                bygroups(Number.Hex, Whitespace, Punctuation, Name.Function,
                         Punctuation, Number.Hex, Punctuation)),
            # (Without offset)
            ('('+hex_re+'+)( )(<)(.*?)(>:)$',
                bygroups(Number.Hex, Whitespace, Punctuation, Name.Function,
                         Punctuation)),
            # Code line with disassembled instructions
            ('( *)('+hex_re+r'+:)(\t)((?:'+hex_re+hex_re+' )+)( *\t)([a-zA-Z].*?)$',
                bygroups(Whitespace, Name.Label, Whitespace, Number.Hex, Whitespace,
                         using(asm_lexer))),
            # Code line without raw instructions (objdump --no-show-raw-insn)
            ('( *)('+hex_re+r'+:)( *\t)([a-zA-Z].*?)$',
                bygroups(Whitespace, Name.Label, Whitespace,
                         using(asm_lexer))),
            # Code line with ascii
            ('( *)('+hex_re+r'+:)(\t)((?:'+hex_re+hex_re+' )+)( *)(.*?)$',
                bygroups(Whitespace, Name.Label, Whitespace, Number.Hex, Whitespace, String)),
            # Continued code line, only raw opcodes without disassembled
            # instruction
            ('( *)('+hex_re+r'+:)(\t)((?:'+hex_re+hex_re+' )+)$',
                bygroups(Whitespace, Name.Label, Whitespace, Number.Hex)),
            # Skipped a few bytes
            (r'\t\.\.\.$', Text),
            # Relocation line
            # (With offset)
            (r'(\t\t\t)('+hex_re+r'+:)( )([^\t]+)(\t)(.*?)([-+])(0x'+hex_re+'+)$',
                bygroups(Whitespace, Name.Label, Whitespace, Name.Property, Whitespace,
                         Name.Constant, Punctuation, Number.Hex)),
            # (Without offset)
            (r'(\t\t\t)('+hex_re+r'+:)( )([^\t]+)(\t)(.*?)$',
                bygroups(Whitespace, Name.Label, Whitespace, Name.Property, Whitespace,
                         Name.Constant)),
            (r'[^\n]+\n', Other)
        ]
    }


class ObjdumpLexer(RegexLexer):
    """
    For the output of ``objdump -dr``.
    """
    name = 'objdump'
    aliases = ['objdump']
    filenames = ['*.objdump']
    mimetypes = ['text/x-objdump']
    url = 'https://www.gnu.org/software/binutils'
    version_added = ''

    tokens = _objdump_lexer_tokens(GasLexer)


class DObjdumpLexer(DelegatingLexer):
    """
    For the output of ``objdump -Sr`` on compiled D files.
    """
    name = 'd-objdump'
    aliases = ['d-objdump']
    filenames = ['*.d-objdump']
    mimetypes = ['text/x-d-objdump']
    url = 'https://www.gnu.org/software/binutils'
    version_added = ''

    def __init__(self, **options):
        super().__init__(DLexer, ObjdumpLexer, **options)


class CppObjdumpLexer(DelegatingLexer):
    """
    For the output of ``objdump -Sr`` on compiled C++ files.
    """
    name = 'cpp-objdump'
    aliases = ['cpp-objdump', 'c++-objdumb', 'cxx-objdump']
    filenames = ['*.cpp-objdump', '*.c++-objdump', '*.cxx-objdump']
    mimetypes = ['text/x-cpp-objdump']
    url = 'https://www.gnu.org/software/binutils'
    version_added = ''

    def __init__(self, **options):
        super().__init__(CppLexer, ObjdumpLexer, **options)


class CObjdumpLexer(DelegatingLexer):
    """
    For the output of ``objdump -Sr`` on compiled C files.
    """
    name = 'c-objdump'
    aliases = ['c-objdump']
    filenames = ['*.c-objdump']
    mimetypes = ['text/x-c-objdump']
    url = 'https://www.gnu.org/software/binutils'
    version_added = ''


    def __init__(self, **options):
        super().__init__(CLexer, ObjdumpLexer, **options)


class HsailLexer(RegexLexer):
    """
    For HSAIL assembly code.
    """
    name = 'HSAIL'
    aliases = ['hsail', 'hsa']
    filenames = ['*.hsail']
    mimetypes = ['text/x-hsail']
    url = 'https://en.wikipedia.org/wiki/Heterogeneous_System_Architecture#HSA_Intermediate_Layer'
    version_added = '2.2'

    string = r'"[^"]*?"'
    identifier = r'[a-zA-Z_][\w.]*'
    # Registers
    register_number = r'[0-9]+'
    register = r'(\$(c|s|d|q)' + register_number + r')\b'
    # Qualifiers
    alignQual = r'(align\(\d+\))'
    widthQual = r'(width\((\d+|all)\))'
    allocQual = r'(alloc\(agent\))'
    # Instruction Modifiers
    roundingMod = (r'((_ftz)?(_up|_down|_zero|_near))')
    datatypeMod = (r'_('
                   # packedTypes
                   r'u8x4|s8x4|u16x2|s16x2|u8x8|s8x8|u16x4|s16x4|u32x2|s32x2|'
                   r'u8x16|s8x16|u16x8|s16x8|u32x4|s32x4|u64x2|s64x2|'
                   r'f16x2|f16x4|f16x8|f32x2|f32x4|f64x2|'
                   # baseTypes
                   r'u8|s8|u16|s16|u32|s32|u64|s64|'
                   r'b128|b8|b16|b32|b64|b1|'
                   r'f16|f32|f64|'
                   # opaqueType
                   r'roimg|woimg|rwimg|samp|sig32|sig64)')

    # Numeric Constant
    float = r'((\d+\.)|(\d*\.\d+))[eE][+-]?\d+'
    hexfloat = r'0[xX](([0-9a-fA-F]+\.[0-9a-fA-F]*)|([0-9a-fA-F]*\.[0-9a-fA-F]+))[pP][+-]?\d+'
    ieeefloat = r'0((h|H)[0-9a-fA-F]{4}|(f|F)[0-9a-fA-F]{8}|(d|D)[0-9a-fA-F]{16})'

    tokens = {
        'root': [
            include('whitespace'),
            include('comments'),

            (string, String),

            (r'@' + identifier + ':?', Name.Label),

            (register, Name.Variable.Anonymous),

            include('keyword'),

            (r'&' + identifier, Name.Variable.Global),
            (r'%' + identifier, Name.Variable),

            (hexfloat, Number.Hex),
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (ieeefloat, Number.Float),
            (float, Number.Float),
            (r'\d+', Number.Integer),

            (r'[=<>{}\[\]()*.,:;!]|x\b', Punctuation)
        ],
        'whitespace': [
            (r'(\n|\s)+', Whitespace),
        ],
        'comments': [
            (r'/\*.*?\*/', Comment.Multiline),
            (r'//.*?\n', Comment.Single),
        ],
        'keyword': [
            # Types
            (r'kernarg' + datatypeMod, Keyword.Type),

            # Regular keywords
            (r'\$(full|base|small|large|default|zero|near)', Keyword),
            (words((
                'module', 'extension', 'pragma', 'prog', 'indirect', 'signature',
                'decl', 'kernel', 'function', 'enablebreakexceptions',
                'enabledetectexceptions', 'maxdynamicgroupsize', 'maxflatgridsize',
                'maxflatworkgroupsize', 'requireddim', 'requiredgridsize',
                'requiredworkgroupsize', 'requirenopartialworkgroups'),
                suffix=r'\b'), Keyword),

            # instructions
            (roundingMod, Keyword),
            (datatypeMod, Keyword),
            (r'_(' + alignQual + '|' + widthQual + ')', Keyword),
            (r'_kernarg', Keyword),
            (r'(nop|imagefence)\b', Keyword),
            (words((
                'cleardetectexcept', 'clock', 'cuid', 'debugtrap', 'dim',
                'getdetectexcept', 'groupbaseptr', 'kernargbaseptr', 'laneid',
                'maxcuid', 'maxwaveid', 'packetid', 'setdetectexcept', 'waveid',
                'workitemflatabsid', 'workitemflatid', 'nullptr', 'abs', 'bitrev',
                'currentworkgroupsize', 'currentworkitemflatid', 'fract', 'ncos',
                'neg', 'nexp2', 'nlog2', 'nrcp', 'nrsqrt', 'nsin', 'nsqrt',
                'gridgroups', 'gridsize', 'not', 'sqrt', 'workgroupid',
                'workgroupsize', 'workitemabsid', 'workitemid', 'ceil', 'floor',
                'rint', 'trunc', 'add', 'bitmask', 'borrow', 'carry', 'copysign',
                'div', 'rem', 'sub', 'shl', 'shr', 'and', 'or', 'xor', 'unpackhi',
                'unpacklo', 'max', 'min', 'fma', 'mad', 'bitextract', 'bitselect',
                'shuffle', 'cmov', 'bitalign', 'bytealign', 'lerp', 'nfma', 'mul',
                'mulhi', 'mul24hi', 'mul24', 'mad24', 'mad24hi', 'bitinsert',
                'combine', 'expand', 'lda', 'mov', 'pack', 'unpack', 'packcvt',
                'unpackcvt', 'sad', 'sementp', 'ftos', 'stof', 'cmp', 'ld', 'st',
                '_eq', '_ne', '_lt', '_le', '_gt', '_ge', '_equ', '_neu', '_ltu',
                '_leu', '_gtu', '_geu', '_num', '_nan', '_seq', '_sne', '_slt',
                '_sle', '_sgt', '_sge', '_snum', '_snan', '_sequ', '_sneu', '_sltu',
                '_sleu', '_sgtu', '_sgeu', 'atomic', '_ld', '_st', '_cas', '_add',
                '_and', '_exch', '_max', '_min', '_or', '_sub', '_wrapdec',
                '_wrapinc', '_xor', 'ret', 'cvt', '_readonly', '_kernarg', '_global',
                'br', 'cbr', 'sbr', '_scacq', '_screl', '_scar', '_rlx', '_wave',
                '_wg', '_agent', '_system', 'ldimage', 'stimage', '_v2', '_v3', '_v4',
                '_1d', '_2d', '_3d', '_1da', '_2da', '_1db', '_2ddepth', '_2dadepth',
                '_width', '_height', '_depth', '_array', '_channelorder',
                '_channeltype', 'querysampler', '_coord', '_filter', '_addressing',
                'barrier', 'wavebarrier', 'initfbar', 'joinfbar', 'waitfbar',
                'arrivefbar', 'leavefbar', 'releasefbar', 'ldf', 'activelaneid',
                'activelanecount', 'activelanemask', 'activelanepermute', 'call',
                'scall', 'icall', 'alloca', 'packetcompletionsig',
                'addqueuewriteindex', 'casqueuewriteindex', 'ldqueuereadindex',
                'stqueuereadindex', 'readonly', 'global', 'private', 'group',
                'spill', 'arg', '_upi', '_downi', '_zeroi', '_neari', '_upi_sat',
                '_downi_sat', '_zeroi_sat', '_neari_sat', '_supi', '_sdowni',
                '_szeroi', '_sneari', '_supi_sat', '_sdowni_sat', '_szeroi_sat',
                '_sneari_sat', '_pp', '_ps', '_sp', '_ss', '_s', '_p', '_pp_sat',
                '_ps_sat', '_sp_sat', '_ss_sat', '_s_sat', '_p_sat')), Keyword),

            # Integer types
            (r'i[1-9]\d*', Keyword)
        ]
    }


class LlvmLexer(RegexLexer):
    """
    For LLVM assembly code.
    """
    name = 'LLVM'
    url = 'https://llvm.org/docs/LangRef.html'
    aliases = ['llvm']
    filenames = ['*.ll']
    mimetypes = ['text/x-llvm']
    version_added = ''

    #: optional Comment or Whitespace
    string = r'"[^"]*?"'
    identifier = r'([-a-zA-Z$._][\w\-$.]*|' + string + ')'
    block_label = r'(' + identifier + r'|(\d+))'

    tokens = {
        'root': [
            include('whitespace'),

            # Before keywords, because keywords are valid label names :(...
            (block_label + r'\s*:', Name.Label),

            include('keyword'),

            (r'%' + identifier, Name.Variable),
            (r'@' + identifier, Name.Variable.Global),
            (r'%\d+', Name.Variable.Anonymous),
            (r'@\d+', Name.Variable.Global),
            (r'#\d+', Name.Variable.Global),
            (r'!' + identifier, Name.Variable),
            (r'!\d+', Name.Variable.Anonymous),
            (r'c?' + string, String),

            (r'0[xX][KLMHR]?[a-fA-F0-9]+', Number),
            (r'-?\d+(?:[.]\d+)?(?:[eE][-+]?\d+(?:[.]\d+)?)?', Number),

            (r'[=<>{}\[\]()*.,!]|x\b', Punctuation)
        ],
        'whitespace': [
            (r'(\n|\s+)+', Whitespace),
            (r';.*?\n', Comment)
        ],
        'keyword': [
            # Regular keywords
            (words((
                'aarch64_sve_vector_pcs', 'aarch64_vector_pcs', 'acq_rel',
                'acquire', 'add', 'addrspace', 'addrspacecast', 'afn', 'alias',
                'aliasee', 'align', 'alignLog2', 'alignstack', 'alloca',
                'allocsize', 'allOnes', 'alwaysinline', 'alwaysInline',
                'amdgpu_cs', 'amdgpu_es', 'amdgpu_gfx', 'amdgpu_gs',
                'amdgpu_hs', 'amdgpu_kernel', 'amdgpu_ls', 'amdgpu_ps',
                'amdgpu_vs', 'and', 'any', 'anyregcc', 'appending', 'arcp',
                'argmemonly', 'args', 'arm_aapcs_vfpcc', 'arm_aapcscc',
                'arm_apcscc', 'ashr', 'asm', 'atomic', 'atomicrmw',
                'attributes', 'available_externally', 'avr_intrcc',
                'avr_signalcc', 'bit', 'bitcast', 'bitMask', 'blockaddress',
                'blockcount', 'br', 'branchFunnel', 'builtin', 'byArg',
                'byref', 'byte', 'byteArray', 'byval', 'c', 'call', 'callbr',
                'callee', 'caller', 'calls', 'canAutoHide', 'catch',
                'catchpad', 'catchret', 'catchswitch', 'cc', 'ccc',
                'cfguard_checkcc', 'cleanup', 'cleanuppad', 'cleanupret',
                'cmpxchg', 'cold', 'coldcc', 'comdat', 'common', 'constant',
                'contract', 'convergent', 'critical', 'cxx_fast_tlscc',
                'datalayout', 'declare', 'default', 'define', 'deplibs',
                'dereferenceable', 'dereferenceable_or_null', 'distinct',
                'dllexport', 'dllimport', 'dso_local', 'dso_local_equivalent',
                'dso_preemptable', 'dsoLocal', 'eq', 'exact', 'exactmatch',
                'extern_weak', 'external', 'externally_initialized',
                'extractelement', 'extractvalue', 'fadd', 'false', 'fast',
                'fastcc', 'fcmp', 'fdiv', 'fence', 'filter', 'flags', 'fmul',
                'fneg', 'fpext', 'fptosi', 'fptoui', 'fptrunc', 'freeze',
                'frem', 'from', 'fsub', 'funcFlags', 'function', 'gc',
                'getelementptr', 'ghccc', 'global', 'guid', 'gv', 'hash',
                'hhvm_ccc', 'hhvmcc', 'hidden', 'hot', 'hotness', 'icmp',
                'ifunc', 'inaccessiblemem_or_argmemonly',
                'inaccessiblememonly', 'inalloca', 'inbounds', 'indir',
                'indirectbr', 'info', 'initialexec', 'inline', 'inlineBits',
                'inlinehint', 'inrange', 'inreg', 'insertelement',
                'insertvalue', 'insts', 'intel_ocl_bicc', 'inteldialect',
                'internal', 'inttoptr', 'invoke', 'jumptable', 'kind',
                'landingpad', 'largest', 'linkage', 'linkonce', 'linkonce_odr',
                'live', 'load', 'local_unnamed_addr', 'localdynamic',
                'localexec', 'lshr', 'max', 'metadata', 'min', 'minsize',
                'module', 'monotonic', 'msp430_intrcc', 'mul', 'mustprogress',
                'musttail', 'naked', 'name', 'nand', 'ne', 'nest', 'ninf',
                'nnan', 'noalias', 'nobuiltin', 'nocallback', 'nocapture',
                'nocf_check', 'noduplicate', 'noduplicates', 'nofree',
                'noimplicitfloat', 'noinline', 'noInline', 'nomerge', 'none',
                'nonlazybind', 'nonnull', 'noprofile', 'norecurse',
                'noRecurse', 'noredzone', 'noreturn', 'nosync', 'notail',
                'notEligibleToImport', 'noundef', 'nounwind', 'nsw',
                'nsz', 'null', 'null_pointer_is_valid', 'nuw', 'oeq', 'offset',
                'oge', 'ogt', 'ole', 'olt', 'one', 'opaque', 'optforfuzzing',
                'optnone', 'optsize', 'or', 'ord', 'param', 'params',
                'partition', 'path', 'personality', 'phi', 'poison',
                'preallocated', 'prefix', 'preserve_allcc', 'preserve_mostcc',
                'private', 'prologue', 'protected', 'ptrtoint', 'ptx_device',
                'ptx_kernel', 'readnone', 'readNone', 'readonly', 'readOnly',
                'reassoc', 'refs', 'relbf', 'release', 'resByArg', 'resume',
                'ret', 'returnDoesNotAlias', 'returned', 'returns_twice',
                'safestack', 'samesize', 'sanitize_address',
                'sanitize_hwaddress', 'sanitize_memory', 'sanitize_memtag',
                'sanitize_thread', 'sdiv', 'section', 'select', 'seq_cst',
                'sext', 'sge', 'sgt', 'shadowcallstack', 'shl',
                'shufflevector', 'sideeffect', 'signext', 'single',
                'singleImpl', 'singleImplName', 'sitofp', 'sizeM1',
                'sizeM1BitWidth', 'sle', 'slt', 'source_filename',
                'speculatable', 'speculative_load_hardening', 'spir_func',
                'spir_kernel', 'splat', 'srem', 'sret', 'ssp', 'sspreq',
                'sspstrong', 'store', 'strictfp', 'sub', 'summaries',
                'summary', 'swiftcc', 'swifterror', 'swiftself', 'switch',
                'syncscope', 'tail', 'tailcc', 'target', 'thread_local', 'to',
                'token', 'triple', 'true', 'trunc', 'type',
                'typeCheckedLoadConstVCalls', 'typeCheckedLoadVCalls',
                'typeid', 'typeidCompatibleVTable', 'typeIdInfo',
                'typeTestAssumeConstVCalls', 'typeTestAssumeVCalls',
                'typeTestRes', 'typeTests', 'udiv', 'ueq', 'uge', 'ugt',
                'uitofp', 'ule', 'ult', 'umax', 'umin', 'undef', 'une',
                'uniformRetVal', 'uniqueRetVal', 'unknown', 'unnamed_addr',
                'uno', 'unordered', 'unreachable', 'unsat', 'unwind', 'urem',
                'uselistorder', 'uselistorder_bb', 'uwtable', 'va_arg',
                'varFlags', 'variable', 'vcall_visibility', 'vFuncId',
                'virtFunc', 'virtualConstProp', 'void', 'volatile', 'vscale',
                'vTableFuncs', 'weak', 'weak_odr', 'webkit_jscc', 'win64cc',
                'within', 'wpdRes', 'wpdResolutions', 'writeonly', 'x',
                'x86_64_sysvcc', 'x86_fastcallcc', 'x86_intrcc', 'x86_mmx',
                'x86_regcallcc', 'x86_stdcallcc', 'x86_thiscallcc',
                'x86_vectorcallcc', 'xchg', 'xor', 'zeroext',
                'zeroinitializer', 'zext', 'immarg', 'willreturn'),
                suffix=r'\b'), Keyword),

            # Types
            (words(('void', 'half', 'bfloat', 'float', 'double', 'fp128',
                    'x86_fp80', 'ppc_fp128', 'label', 'metadata', 'x86_mmx',
                    'x86_amx', 'token', 'ptr')),
                   Keyword.Type),

            # Integer types
            (r'i[1-9]\d*', Keyword.Type)
        ]
    }


class LlvmMirBodyLexer(RegexLexer):
    """
    For LLVM MIR examples without the YAML wrapper.
    """
    name = 'LLVM-MIR Body'
    url = 'https://llvm.org/docs/MIRLangRef.html'
    aliases = ['llvm-mir-body']
    filenames = []
    mimetypes = []
    version_added = '2.6'

    tokens = {
        'root': [
            # Attributes on basic blocks
            (words(('liveins', 'successors'), suffix=':'), Keyword),
            # Basic Block Labels
            (r'bb\.[0-9]+(\.[a-zA-Z0-9_.-]+)?( \(address-taken\))?:', Name.Label),
            (r'bb\.[0-9]+ \(%[a-zA-Z0-9_.-]+\)( \(address-taken\))?:', Name.Label),
            (r'%bb\.[0-9]+(\.\w+)?', Name.Label),
            # Stack references
            (r'%stack\.[0-9]+(\.\w+\.addr)?', Name),
            # Subreg indices
            (r'%subreg\.\w+', Name),
            # Virtual registers
            (r'%[a-zA-Z0-9_]+ *', Name.Variable, 'vreg'),
            # Reference to LLVM-IR global
            include('global'),
            # Reference to Intrinsic
            (r'intrinsic\(\@[a-zA-Z0-9_.]+\)', Name.Variable.Global),
            # Comparison predicates
            (words(('eq', 'ne', 'sgt', 'sge', 'slt', 'sle', 'ugt', 'uge', 'ult',
                    'ule'), prefix=r'intpred\(', suffix=r'\)'), Name.Builtin),
            (words(('oeq', 'one', 'ogt', 'oge', 'olt', 'ole', 'ugt', 'uge',
                    'ult', 'ule'), prefix=r'floatpred\(', suffix=r'\)'),
             Name.Builtin),
            # Physical registers
            (r'\$\w+', String.Single),
            # Assignment operator
            (r'=', Operator),
            # gMIR Opcodes
            (r'(G_ANYEXT|G_[SZ]EXT|G_SEXT_INREG|G_TRUNC|G_IMPLICIT_DEF|G_PHI|'
             r'G_FRAME_INDEX|G_GLOBAL_VALUE|G_INTTOPTR|G_PTRTOINT|G_BITCAST|'
             r'G_CONSTANT|G_FCONSTANT|G_VASTART|G_VAARG|G_CTLZ|G_CTLZ_ZERO_UNDEF|'
             r'G_CTTZ|G_CTTZ_ZERO_UNDEF|G_CTPOP|G_BSWAP|G_BITREVERSE|'
             r'G_ADDRSPACE_CAST|G_BLOCK_ADDR|G_JUMP_TABLE|G_DYN_STACKALLOC|'
             r'G_ADD|G_SUB|G_MUL|G_[SU]DIV|G_[SU]REM|G_AND|G_OR|G_XOR|G_SHL|'
             r'G_[LA]SHR|G_[IF]CMP|G_SELECT|G_GEP|G_PTR_MASK|G_SMIN|G_SMAX|'
             r'G_UMIN|G_UMAX|G_[US]ADDO|G_[US]ADDE|G_[US]SUBO|G_[US]SUBE|'
             r'G_[US]MULO|G_[US]MULH|G_FNEG|G_FPEXT|G_FPTRUNC|G_FPTO[US]I|'
             r'G_[US]ITOFP|G_FABS|G_FCOPYSIGN|G_FCANONICALIZE|G_FMINNUM|'
             r'G_FMAXNUM|G_FMINNUM_IEEE|G_FMAXNUM_IEEE|G_FMINIMUM|G_FMAXIMUM|'
             r'G_FADD|G_FSUB|G_FMUL|G_FMA|G_FMAD|G_FDIV|G_FREM|G_FPOW|G_FEXP|'
             r'G_FEXP2|G_FLOG|G_FLOG2|G_FLOG10|G_FCEIL|G_FCOS|G_FSIN|G_FSQRT|'
             r'G_FFLOOR|G_FRINT|G_FNEARBYINT|G_INTRINSIC_TRUNC|'
             r'G_INTRINSIC_ROUND|G_LOAD|G_[ZS]EXTLOAD|G_INDEXED_LOAD|'
             r'G_INDEXED_[ZS]EXTLOAD|G_STORE|G_INDEXED_STORE|'
             r'G_ATOMIC_CMPXCHG_WITH_SUCCESS|G_ATOMIC_CMPXCHG|'
             r'G_ATOMICRMW_(XCHG|ADD|SUB|AND|NAND|OR|XOR|MAX|MIN|UMAX|UMIN|FADD|'
                           r'FSUB)'
             r'|G_FENCE|G_EXTRACT|G_UNMERGE_VALUES|G_INSERT|G_MERGE_VALUES|'
             r'G_BUILD_VECTOR|G_BUILD_VECTOR_TRUNC|G_CONCAT_VECTORS|'
             r'G_INTRINSIC|G_INTRINSIC_W_SIDE_EFFECTS|G_BR|G_BRCOND|'
             r'G_BRINDIRECT|G_BRJT|G_INSERT_VECTOR_ELT|G_EXTRACT_VECTOR_ELT|'
             r'G_SHUFFLE_VECTOR)\b',
             Name.Builtin),
            # Target independent opcodes
            (r'(COPY|PHI|INSERT_SUBREG|EXTRACT_SUBREG|REG_SEQUENCE)\b',
             Name.Builtin),
            # Flags
            (words(('killed', 'implicit')), Keyword),
            # ConstantInt values
            (r'(i[0-9]+)( +)', bygroups(Keyword.Type, Whitespace), 'constantint'),
            # ConstantFloat values
            (r'(half|float|double) +', Keyword.Type, 'constantfloat'),
            # Bare immediates
            include('integer'),
            # MMO's
            (r'(::)( *)', bygroups(Operator, Whitespace), 'mmo'),
            # MIR Comments
            (r';.*', Comment),
            # If we get here, assume it's a target instruction
            (r'[a-zA-Z0-9_]+', Name),
            # Everything else that isn't highlighted
            (r'[(), \n]+', Text),
        ],
        # The integer constant from a ConstantInt value
        'constantint': [
            include('integer'),
            (r'(?=.)', Text, '#pop'),
        ],
        # The floating point constant from a ConstantFloat value
        'constantfloat': [
            include('float'),
            (r'(?=.)', Text, '#pop'),
        ],
        'vreg': [
            # The bank or class if there is one
            (r'( *)(:(?!:))', bygroups(Whitespace, Keyword), ('#pop', 'vreg_bank_or_class')),
            # The LLT if there is one
            (r'( *)(\()', bygroups(Whitespace, Text), 'vreg_type'),
            (r'(?=.)', Text, '#pop'),
        ],
        'vreg_bank_or_class': [
            # The unassigned bank/class
            (r'( *)(_)', bygroups(Whitespace, Name.Variable.Magic)),
            (r'( *)([a-zA-Z0-9_]+)', bygroups(Whitespace, Name.Variable)),
            # The LLT if there is one
            (r'( *)(\()', bygroups(Whitespace, Text), 'vreg_type'),
            (r'(?=.)', Text, '#pop'),
        ],
        'vreg_type': [
            # Scalar and pointer types
            (r'( *)([sp][0-9]+)', bygroups(Whitespace, Keyword.Type)),
            (r'( *)(<[0-9]+ *x *[sp][0-9]+>)', bygroups(Whitespace, Keyword.Type)),
            (r'\)', Text, '#pop'),
            (r'(?=.)', Text, '#pop'),
        ],
        'mmo': [
            (r'\(', Text),
            (r' +', Whitespace),
            (words(('load', 'store', 'on', 'into', 'from', 'align', 'monotonic',
                    'acquire', 'release', 'acq_rel', 'seq_cst')),
             Keyword),
            # IR references
            (r'%ir\.[a-zA-Z0-9_.-]+', Name),
            (r'%ir-block\.[a-zA-Z0-9_.-]+', Name),
            (r'[-+]', Operator),
            include('integer'),
            include('global'),
            (r',', Punctuation),
            (r'\), \(', Text),
            (r'\)', Text, '#pop'),
        ],
        'integer': [(r'-?[0-9]+', Number.Integer),],
        'float': [(r'-?[0-9]+\.[0-9]+(e[+-][0-9]+)?', Number.Float)],
        'global': [(r'\@[a-zA-Z0-9_.]+', Name.Variable.Global)],
    }


class LlvmMirLexer(RegexLexer):
    """
    Lexer for the overall LLVM MIR document format.

    MIR is a human readable serialization format that's used to represent LLVM's
    machine specific intermediate representation. It allows LLVM's developers to
    see the state of the compilation process at various points, as well as test
    individual pieces of the compiler.
    """
    name = 'LLVM-MIR'
    url = 'https://llvm.org/docs/MIRLangRef.html'
    aliases = ['llvm-mir']
    filenames = ['*.mir']
    version_added = '2.6'

    tokens = {
        'root': [
            # Comments are hashes at the YAML level
            (r'#.*', Comment),
            # Documents starting with | are LLVM-IR
            (r'--- \|$', Keyword, 'llvm_ir'),
            # Other documents are MIR
            (r'---', Keyword, 'llvm_mir'),
            # Consume everything else in one token for efficiency
            (r'[^-#]+|.', Text),
        ],
        'llvm_ir': [
            # Documents end with '...' or '---'
            (r'(\.\.\.|(?=---))', Keyword, '#pop'),
            # Delegate to the LlvmLexer
            (r'((?:.|\n)+?)(?=(\.\.\.|---))', bygroups(using(LlvmLexer))),
        ],
        'llvm_mir': [
            # Comments are hashes at the YAML level
            (r'#.*', Comment),
            # Documents end with '...' or '---'
            (r'(\.\.\.|(?=---))', Keyword, '#pop'),
            # Handle the simple attributes
            (r'name:', Keyword, 'name'),
            (words(('alignment', ),
                   suffix=':'), Keyword, 'number'),
            (words(('legalized', 'regBankSelected', 'tracksRegLiveness',
                    'selected', 'exposesReturnsTwice'),
                   suffix=':'), Keyword, 'boolean'),
            # Handle the attributes don't highlight inside
            (words(('registers', 'stack', 'fixedStack', 'liveins', 'frameInfo',
                    'machineFunctionInfo'),
                   suffix=':'), Keyword),
            # Delegate the body block to the LlvmMirBodyLexer
            (r'body: *\|', Keyword, 'llvm_mir_body'),
            # Consume everything else
            (r'.+', Text),
            (r'\n', Whitespace),
        ],
        'name': [
            (r'[^\n]+', Name),
            default('#pop'),
        ],
        'boolean': [
            (r' *(true|false)', Name.Builtin),
            default('#pop'),
        ],
        'number': [
            (r' *[0-9]+', Number),
            default('#pop'),
        ],
        'llvm_mir_body': [
            # Documents end with '...' or '---'.
            # We have to pop llvm_mir_body and llvm_mir
            (r'(\.\.\.|(?=---))', Keyword, '#pop:2'),
            # Delegate the body block to the LlvmMirBodyLexer
            (r'((?:.|\n)+?)(?=\.\.\.|---)', bygroups(using(LlvmMirBodyLexer))),
            # The '...' is optional. If we didn't already find it then it isn't
            # there. There might be a '---' instead though.
            (r'(?!\.\.\.|---)((?:.|\n)+)', bygroups(using(LlvmMirBodyLexer))),
        ],
    }


class NasmLexer(RegexLexer):
    """
    For Nasm (Intel) assembly code.
    """
    name = 'NASM'
    aliases = ['nasm']
    filenames = ['*.asm', '*.ASM', '*.nasm']
    mimetypes = ['text/x-nasm']
    url = 'https://nasm.us'
    version_added = ''

    # Tasm uses the same file endings, but TASM is not as common as NASM, so
    # we prioritize NASM higher by default
    priority = 1.0

    identifier = r'[a-z$._?][\w$.?#@~]*'
    hexn = r'(?:0x[0-9a-f]+|$0[0-9a-f]*|[0-9]+[0-9a-f]*h)'
    octn = r'[0-7]+q'
    binn = r'[01]+b'
    decn = r'[0-9]+'
    floatn = decn + r'\.e?' + decn
    string = r'"(\\"|[^"\n])*"|' + r"'(\\'|[^'\n])*'|" + r"`(\\`|[^`\n])*`"
    declkw = r'(?:res|d)[bwdqt]|times'
    register = (r'(r[0-9][0-5]?[bwd]?|'
                r'[a-d][lh]|[er]?[a-d]x|[er]?[sb]p|[er]?[sd]i|[c-gs]s|st[0-7]|'
                r'mm[0-7]|cr[0-4]|dr[0-367]|tr[3-7]|k[0-7]|'
                r'[xyz]mm(?:[12][0-9]?|3[01]?|[04-9]))\b')
    wordop = r'seg|wrt|strict|rel|abs'
    type = r'byte|[dq]?word'
    # Directives must be followed by whitespace, otherwise CPU will match
    # cpuid for instance.
    directives = (r'(?:BITS|USE16|USE32|SECTION|SEGMENT|ABSOLUTE|EXTERN|GLOBAL|'
                  r'ORG|ALIGN|STRUC|ENDSTRUC|COMMON|CPU|GROUP|UPPERCASE|IMPORT|'
                  r'EXPORT|LIBRARY|MODULE)(?=\s)')

    flags = re.IGNORECASE | re.MULTILINE
    tokens = {
        'root': [
            (r'^\s*%', Comment.Preproc, 'preproc'),
            include('whitespace'),
            (identifier + ':', Name.Label),
            (rf'({identifier})(\s+)(equ)',
                bygroups(Name.Constant, Whitespace, Keyword.Declaration),
                'instruction-args'),
            (directives, Keyword, 'instruction-args'),
            (declkw, Keyword.Declaration, 'instruction-args'),
            (identifier, Name.Function, 'instruction-args'),
            (r'[\r\n]+', Whitespace)
        ],
        'instruction-args': [
            (string, String),
            (hexn, Number.Hex),
            (octn, Number.Oct),
            (binn, Number.Bin),
            (floatn, Number.Float),
            (decn, Number.Integer),
            include('punctuation'),
            (register, Name.Builtin),
            (identifier, Name.Variable),
            (r'[\r\n]+', Whitespace, '#pop'),
            include('whitespace')
        ],
        'preproc': [
            (r'[^;\n]+', Comment.Preproc),
            (r';.*?\n', Comment.Single, '#pop'),
            (r'\n', Comment.Preproc, '#pop'),
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'[ \t]+', Whitespace),
            (r';.*', Comment.Single),
            (r'#.*', Comment.Single)
        ],
        'punctuation': [
            (r'[,{}():\[\]]+', Punctuation),
            (r'[&|^<>+*/%~-]+', Operator),
            (r'[$]+', Keyword.Constant),
            (wordop, Operator.Word),
            (type, Keyword.Type)
        ],
    }

    def analyse_text(text):
        # Probably TASM
        if re.match(r'PROC', text, re.IGNORECASE):
            return False


class NasmObjdumpLexer(ObjdumpLexer):
    """
    For the output of ``objdump -d -M intel``.
    """
    name = 'objdump-nasm'
    aliases = ['objdump-nasm']
    filenames = ['*.objdump-intel']
    mimetypes = ['text/x-nasm-objdump']
    url = 'https://www.gnu.org/software/binutils'
    version_added = '2.0'

    tokens = _objdump_lexer_tokens(NasmLexer)


class TasmLexer(RegexLexer):
    """
    For Tasm (Turbo Assembler) assembly code.
    """
    name = 'TASM'
    aliases = ['tasm']
    filenames = ['*.asm', '*.ASM', '*.tasm']
    mimetypes = ['text/x-tasm']
    url = 'https://en.wikipedia.org/wiki/Turbo_Assembler'
    version_added = ''

    identifier = r'[@a-z$._?][\w$.?#@~]*'
    hexn = r'(?:0x[0-9a-f]+|$0[0-9a-f]*|[0-9]+[0-9a-f]*h)'
    octn = r'[0-7]+q'
    binn = r'[01]+b'
    decn = r'[0-9]+'
    floatn = decn + r'\.e?' + decn
    string = r'"(\\"|[^"\n])*"|' + r"'(\\'|[^'\n])*'|" + r"`(\\`|[^`\n])*`"
    declkw = r'(?:res|d)[bwdqt]|times'
    register = (r'(r[0-9][0-5]?[bwd]|'
                r'[a-d][lh]|[er]?[a-d]x|[er]?[sb]p|[er]?[sd]i|[c-gs]s|st[0-7]|'
                r'mm[0-7]|cr[0-4]|dr[0-367]|tr[3-7])\b')
    wordop = r'seg|wrt|strict'
    type = r'byte|[dq]?word'
    directives = (r'BITS|USE16|USE32|SECTION|SEGMENT|ABSOLUTE|EXTERN|GLOBAL|'
                  r'ORG|ALIGN|STRUC|ENDSTRUC|ENDS|COMMON|CPU|GROUP|UPPERCASE|INCLUDE|'
                  r'EXPORT|LIBRARY|MODULE|PROC|ENDP|USES|ARG|DATASEG|UDATASEG|END|IDEAL|'
                  r'P386|MODEL|ASSUME|CODESEG|SIZE')
    # T[A-Z][a-z] is more of a convention. Lexer should filter out STRUC definitions
    # and then 'add' them to datatype somehow.
    datatype = (r'db|dd|dw|T[A-Z][a-z]+')

    flags = re.IGNORECASE | re.MULTILINE
    tokens = {
        'root': [
            (r'^\s*%', Comment.Preproc, 'preproc'),
            include('whitespace'),
            (identifier + ':', Name.Label),
            (directives, Keyword, 'instruction-args'),
            (rf'({identifier})(\s+)({datatype})',
                bygroups(Name.Constant, Whitespace, Keyword.Declaration),
                'instruction-args'),
            (declkw, Keyword.Declaration, 'instruction-args'),
            (identifier, Name.Function, 'instruction-args'),
            (r'[\r\n]+', Whitespace)
        ],
        'instruction-args': [
            (string, String),
            (hexn, Number.Hex),
            (octn, Number.Oct),
            (binn, Number.Bin),
            (floatn, Number.Float),
            (decn, Number.Integer),
            include('punctuation'),
            (register, Name.Builtin),
            (identifier, Name.Variable),
            # Do not match newline when it's preceded by a backslash
            (r'(\\)(\s*)(;.*)([\r\n])',
             bygroups(Text, Whitespace, Comment.Single, Whitespace)),
            (r'[\r\n]+', Whitespace, '#pop'),
            include('whitespace')
        ],
        'preproc': [
            (r'[^;\n]+', Comment.Preproc),
            (r';.*?\n', Comment.Single, '#pop'),
            (r'\n', Comment.Preproc, '#pop'),
        ],
        'whitespace': [
            (r'[\n\r]', Whitespace),
            (r'(\\)([\n\r])', bygroups(Text, Whitespace)),
            (r'[ \t]+', Whitespace),
            (r';.*', Comment.Single)
        ],
        'punctuation': [
            (r'[,():\[\]]+', Punctuation),
            (r'[&|^<>+*=/%~-]+', Operator),
            (r'[$]+', Keyword.Constant),
            (wordop, Operator.Word),
            (type, Keyword.Type)
        ],
    }

    def analyse_text(text):
        # See above
        if re.match(r'PROC', text, re.I):
            return True


class Ca65Lexer(RegexLexer):
    """
    For ca65 assembler sources.
    """
    name = 'ca65 assembler'
    aliases = ['ca65']
    filenames = ['*.s']
    url = 'https://cc65.github.io'
    version_added = '1.6'

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r';.*', Comment.Single),
            (r'\s+', Whitespace),
            (r'[a-z_.@$][\w.@$]*:', Name.Label),
            (r'((ld|st)[axy]|(in|de)[cxy]|asl|lsr|ro[lr]|adc|sbc|cmp|cp[xy]'
             r'|cl[cvdi]|se[cdi]|jmp|jsr|bne|beq|bpl|bmi|bvc|bvs|bcc|bcs'
             r'|p[lh][ap]|rt[is]|brk|nop|ta[xy]|t[xy]a|txs|tsx|and|ora|eor'
             r'|bit)\b', Keyword),
            (r'\.\w+', Keyword.Pseudo),
            (r'[-+~*/^&|!<>=]', Operator),
            (r'"[^"\n]*.', String),
            (r"'[^'\n]*.", String.Char),
            (r'\$[0-9a-f]+|[0-9a-f]+h\b', Number.Hex),
            (r'\d+', Number.Integer),
            (r'%[01]+', Number.Bin),
            (r'[#,.:()=\[\]]', Punctuation),
            (r'[a-z_.@$][\w.@$]*', Name),
        ]
    }

    def analyse_text(self, text):
        # comments in GAS start with "#"
        if re.search(r'^\s*;', text, re.MULTILINE):
            return 0.9


class Dasm16Lexer(RegexLexer):
    """
    For DCPU-16 Assembly.
    """
    name = 'DASM16'
    url = 'http://0x10c.com/doc/dcpu-16.txt'
    aliases = ['dasm16']
    filenames = ['*.dasm16', '*.dasm']
    mimetypes = ['text/x-dasm16']
    version_added = '2.4'

    INSTRUCTIONS = [
        'SET',
        'ADD', 'SUB',
        'MUL', 'MLI',
        'DIV', 'DVI',
        'MOD', 'MDI',
        'AND', 'BOR', 'XOR',
        'SHR', 'ASR', 'SHL',
        'IFB', 'IFC', 'IFE', 'IFN', 'IFG', 'IFA', 'IFL', 'IFU',
        'ADX', 'SBX',
        'STI', 'STD',
        'JSR',
        'INT', 'IAG', 'IAS', 'RFI', 'IAQ', 'HWN', 'HWQ', 'HWI',
    ]

    REGISTERS = [
        'A', 'B', 'C',
        'X', 'Y', 'Z',
        'I', 'J',
        'SP', 'PC', 'EX',
        'POP', 'PEEK', 'PUSH'
    ]

    # Regexes yo
    char = r'[a-zA-Z0-9_$@.]'
    identifier = r'(?:[a-zA-Z$_]' + char + r'*|\.' + char + '+)'
    number = r'[+-]?(?:0[xX][a-zA-Z0-9]+|\d+)'
    binary_number = r'0b[01_]+'
    instruction = r'(?i)(' + '|'.join(INSTRUCTIONS) + ')'
    single_char = r"'\\?" + char + "'"
    string = r'"(\\"|[^"])*"'

    def guess_identifier(lexer, match):
        ident = match.group(0)
        klass = Name.Variable if ident.upper() in lexer.REGISTERS else Name.Label
        yield match.start(), klass, ident

    tokens = {
        'root': [
            include('whitespace'),
            (':' + identifier, Name.Label),
            (identifier + ':', Name.Label),
            (instruction, Name.Function, 'instruction-args'),
            (r'\.' + identifier, Name.Function, 'data-args'),
            (r'[\r\n]+', Whitespace)
        ],

        'numeric' : [
            (binary_number, Number.Integer),
            (number, Number.Integer),
            (single_char, String),
        ],

        'arg' : [
            (identifier, guess_identifier),
            include('numeric')
        ],

        'deref' : [
            (r'\+', Punctuation),
            (r'\]', Punctuation, '#pop'),
            include('arg'),
            include('whitespace')
        ],

        'instruction-line' : [
            (r'[\r\n]+', Whitespace, '#pop'),
            (r';.*?$', Comment, '#pop'),
            include('whitespace')
        ],

        'instruction-args': [
            (r',', Punctuation),
            (r'\[', Punctuation, 'deref'),
            include('arg'),
            include('instruction-line')
        ],

        'data-args' : [
            (r',', Punctuation),
            include('numeric'),
            (string, String),
            include('instruction-line')
        ],

        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r';.*?\n', Comment)
        ],
    }
