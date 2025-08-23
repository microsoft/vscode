"""
    pygments.lexers.ptx
    ~~~~~~~~~~~~~~~~~~~

    Lexer for other PTX language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, String, Number, \
    Punctuation, Whitespace, Operator

__all__ = ["PtxLexer"]


class PtxLexer(RegexLexer):
    """
    For NVIDIA `PTX <https://docs.nvidia.com/cuda/parallel-thread-execution/>`_
    source.
    """
    name = 'PTX'
    url = "https://docs.nvidia.com/cuda/parallel-thread-execution/"
    filenames = ['*.ptx']
    aliases = ['ptx']
    mimetypes = ['text/x-ptx']
    version_added = '2.16'

    #: optional Comment or Whitespace
    string = r'"[^"]*?"'
    followsym = r'[a-zA-Z0-9_$]'
    identifier = r'([-a-zA-Z$._][\w\-$.]*|' + string + ')'
    block_label = r'(' + identifier + r'|(\d+))'

    tokens = {
        'root': [
            include('whitespace'),

            (block_label + r'\s*:', Name.Label),

            include('keyword'),

            (r'%' + identifier, Name.Variable),
            (r'%\d+', Name.Variable.Anonymous),
            (r'c?' + string, String),
            (identifier, Name.Variable),
            (r';', Punctuation),
            (r'[*+-/]', Operator),

            (r'0[xX][a-fA-F0-9]+', Number),
            (r'-?\d+(?:[.]\d+)?(?:[eE][-+]?\d+(?:[.]\d+)?)?', Number),

            (r'[=<>{}\[\]()*.,!]|x\b', Punctuation)

        ],
        'whitespace': [
            (r'(\n|\s+)+', Whitespace),
            (r'//.*?\n', Comment)
        ],

        'keyword': [
            # Instruction keywords
            (words((
                'abs', 'discard', 'min', 'shf', 'vadd',
                'activemask', 'div', 'mma', 'shfl', 'vadd2',
                'add', 'dp2a', 'mov', 'shl', 'vadd4',
                'addc', 'dp4a', 'movmatrix', 'shr', 'vavrg2',
                'alloca', 'elect', 'mul', 'sin', 'vavrg4',
                'and', 'ex2', 'mul24', 'slct', 'vmad',
                'applypriority', 'exit', 'multimem', 'sqrt', 'vmax',
                'atom', 'fence', 'nanosleep', 'st', 'vmax2',
                'bar', 'fma', 'neg', 'stackrestore', 'vmax4',
                'barrier', 'fns', 'not', 'stacksave', 'vmin',
                'bfe', 'getctarank', 'or', 'stmatrix', 'vmin2',
                'bfi', 'griddepcontrol', 'pmevent', 'sub', 'vmin4',
                'bfind', 'isspacep', 'popc', 'subc', 'vote',
                'bmsk', 'istypep', 'prefetch', 'suld', 'vset',
                'bra', 'ld', 'prefetchu', 'suq', 'vset2',
                'brev', 'ldmatrix', 'prmt', 'sured', 'vset4',
                'brkpt', 'ldu', 'rcp', 'sust', 'vshl',
                'brx', 'lg2', 'red', 'szext', 'vshr',
                'call', 'lop3', 'redux', 'tanh', 'vsub',
                'clz', 'mad', 'rem', 'testp', 'vsub2',
                'cnot', 'mad24', 'ret', 'tex', 'vsub4',
                'copysign', 'madc', 'rsqrt', 'tld4', 'wgmma',
                'cos', 'mapa', 'sad', 'trap', 'wmma',
                'cp', 'match', 'selp', 'txq', 'xor',
                'createpolicy', 'max', 'set', 'vabsdiff', 'cvt',
                'mbarrier', 'setmaxnreg', 'vabsdiff2', 'cvta',
                'membar', 'setp', 'vabsdiff4')), Keyword),
            # State Spaces and Suffixes
            (words((
                'reg', '.sreg', '.const', '.global',
                '.local', '.param', '.shared', '.tex',
                '.wide', '.loc'
            )), Keyword.Pseudo),
            # PTX Directives
            (words((
                '.address_size', '.explicitcluster', '.maxnreg', '.section',
                '.alias', '.extern', '.maxntid', '.shared',
                '.align', '.file', '.minnctapersm', '.sreg',
                '.branchtargets', '.func', '.noreturn', '.target',
                '.callprototype', '.global', '.param', '.tex',
                '.calltargets', '.loc', '.pragma', '.version',
                '.common', '.local', '.reg', '.visible',
                '.const', '.maxclusterrank', '.reqnctapercluster', '.weak',
                '.entry', '.maxnctapersm', '.reqntid')), Keyword.Reserved),
            # Fundamental Types
            (words((
                '.s8', '.s16', '.s32', '.s64',
                '.u8', '.u16', '.u32', '.u64',
                '.f16', '.f16x2', '.f32', '.f64',
                '.b8', '.b16', '.b32', '.b64',
                '.pred'
            )), Keyword.Type)
        ],

    }
