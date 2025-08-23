"""
    pygments.lexers.graphics
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for computer graphics and plotting related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words, include, bygroups, using, \
    this, default
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, \
    Number, Punctuation, String, Whitespace

__all__ = ['GLShaderLexer', 'PostScriptLexer', 'AsymptoteLexer', 'GnuplotLexer',
           'PovrayLexer', 'HLSLShaderLexer']


class GLShaderLexer(RegexLexer):
    """
    GLSL (OpenGL Shader) lexer.
    """
    name = 'GLSL'
    aliases = ['glsl']
    filenames = ['*.vert', '*.frag', '*.geo']
    mimetypes = ['text/x-glslsrc']
    url = 'https://www.khronos.org/api/opengl'
    version_added = '1.1'

    tokens = {
        'root': [
            (r'#(?:.*\\\n)*.*$', Comment.Preproc),
            (r'//.*$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'\+|-|~|!=?|\*|/|%|<<|>>|<=?|>=?|==?|&&?|\^|\|\|?',
             Operator),
            (r'[?:]', Operator),  # quick hack for ternary
            (r'\bdefined\b', Operator),
            (r'[;{}(),\[\]]', Punctuation),
            # FIXME when e is present, no decimal point needed
            (r'[+-]?\d*\.\d+([eE][-+]?\d+)?', Number.Float),
            (r'[+-]?\d+\.\d*([eE][-+]?\d+)?', Number.Float),
            (r'0[xX][0-9a-fA-F]*', Number.Hex),
            (r'0[0-7]*', Number.Oct),
            (r'[1-9][0-9]*', Number.Integer),
            (words((
                # Storage qualifiers
                'attribute', 'const', 'uniform', 'varying',
                'buffer', 'shared', 'in', 'out',
                # Layout qualifiers
                'layout',
                # Interpolation qualifiers
                'flat', 'smooth', 'noperspective',
                # Auxiliary qualifiers
                'centroid', 'sample', 'patch',
                # Parameter qualifiers. Some double as Storage qualifiers
                'inout',
                # Precision qualifiers
                'lowp', 'mediump', 'highp', 'precision',
                # Invariance qualifiers
                'invariant',
                # Precise qualifiers
                'precise',
                # Memory qualifiers
                'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
                # Statements
                'break', 'continue', 'do', 'for', 'while', 'switch',
                'case', 'default', 'if', 'else', 'subroutine',
                'discard', 'return', 'struct'),
                prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words((
                # Boolean values
                'true', 'false'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Constant),
            (words((
                # Miscellaneous types
                'void', 'atomic_uint',
                # Floating-point scalars and vectors
                'float', 'vec2', 'vec3', 'vec4',
                'double', 'dvec2', 'dvec3', 'dvec4',
                # Integer scalars and vectors
                'int', 'ivec2', 'ivec3', 'ivec4',
                'uint', 'uvec2', 'uvec3', 'uvec4',
                # Boolean scalars and vectors
                'bool', 'bvec2', 'bvec3', 'bvec4',
                # Matrices
                'mat2', 'mat3', 'mat4', 'dmat2', 'dmat3', 'dmat4',
                'mat2x2', 'mat2x3', 'mat2x4', 'dmat2x2', 'dmat2x3', 'dmat2x4',
                'mat3x2', 'mat3x3', 'mat3x4', 'dmat3x2', 'dmat3x3',
                'dmat3x4', 'mat4x2', 'mat4x3', 'mat4x4', 'dmat4x2', 'dmat4x3', 'dmat4x4',
                # Floating-point samplers
                'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube',
                'sampler1DArray', 'sampler2DArray', 'samplerCubeArray',
                'sampler2DRect', 'samplerBuffer',
                'sampler2DMS', 'sampler2DMSArray',
                # Shadow samplers
                'sampler1DShadow', 'sampler2DShadow', 'samplerCubeShadow',
                'sampler1DArrayShadow', 'sampler2DArrayShadow',
                'samplerCubeArrayShadow', 'sampler2DRectShadow',
                # Signed integer samplers
                'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube',
                'isampler1DArray', 'isampler2DArray', 'isamplerCubeArray',
                'isampler2DRect', 'isamplerBuffer',
                'isampler2DMS', 'isampler2DMSArray',
                # Unsigned integer samplers
                'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube',
                'usampler1DArray', 'usampler2DArray', 'usamplerCubeArray',
                'usampler2DRect', 'usamplerBuffer',
                'usampler2DMS', 'usampler2DMSArray',
                # Floating-point image types
                'image1D', 'image2D', 'image3D', 'imageCube',
                'image1DArray', 'image2DArray', 'imageCubeArray',
                'image2DRect', 'imageBuffer',
                'image2DMS', 'image2DMSArray',
                # Signed integer image types
                'iimage1D', 'iimage2D', 'iimage3D', 'iimageCube',
                'iimage1DArray', 'iimage2DArray', 'iimageCubeArray',
                'iimage2DRect', 'iimageBuffer',
                'iimage2DMS', 'iimage2DMSArray',
                # Unsigned integer image types
                'uimage1D', 'uimage2D', 'uimage3D', 'uimageCube',
                'uimage1DArray', 'uimage2DArray', 'uimageCubeArray',
                'uimage2DRect', 'uimageBuffer',
                'uimage2DMS', 'uimage2DMSArray'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Type),
            (words((
                # Reserved for future use.
                'common', 'partition', 'active', 'asm', 'class',
                'union', 'enum', 'typedef', 'template', 'this',
                'resource', 'goto', 'inline', 'noinline', 'public',
                'static', 'extern', 'external', 'interface', 'long',
                'short', 'half', 'fixed', 'unsigned', 'superp', 'input',
                'output', 'hvec2', 'hvec3', 'hvec4', 'fvec2', 'fvec3',
                'fvec4', 'sampler3DRect', 'filter', 'sizeof', 'cast',
                'namespace', 'using'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Reserved),
            # All names beginning with "gl_" are reserved.
            (r'gl_\w*', Name.Builtin),
            (r'[a-zA-Z_]\w*', Name),
            (r'\.', Punctuation),
            (r'\s+', Whitespace),
        ],
    }


class HLSLShaderLexer(RegexLexer):
    """
    HLSL (Microsoft Direct3D Shader) lexer.
    """
    name = 'HLSL'
    aliases = ['hlsl']
    filenames = ['*.hlsl', '*.hlsli']
    mimetypes = ['text/x-hlsl']
    url = 'https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl'
    version_added = '2.3'

    tokens = {
        'root': [
            (r'#(?:.*\\\n)*.*$', Comment.Preproc),
            (r'//.*$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'\+|-|~|!=?|\*|/|%|<<|>>|<=?|>=?|==?|&&?|\^|\|\|?',
             Operator),
            (r'[?:]', Operator),  # quick hack for ternary
            (r'\bdefined\b', Operator),
            (r'[;{}(),.\[\]]', Punctuation),
            # FIXME when e is present, no decimal point needed
            (r'[+-]?\d*\.\d+([eE][-+]?\d+)?f?', Number.Float),
            (r'[+-]?\d+\.\d*([eE][-+]?\d+)?f?', Number.Float),
            (r'0[xX][0-9a-fA-F]*', Number.Hex),
            (r'0[0-7]*', Number.Oct),
            (r'[1-9][0-9]*', Number.Integer),
            (r'"', String, 'string'),
            (words((
                'asm','asm_fragment','break','case','cbuffer','centroid','class',
                'column_major','compile','compile_fragment','const','continue',
                'default','discard','do','else','export','extern','for','fxgroup',
                'globallycoherent','groupshared','if','in','inline','inout',
                'interface','line','lineadj','linear','namespace','nointerpolation',
                'noperspective','NULL','out','packoffset','pass','pixelfragment',
                'point','precise','return','register','row_major','sample',
                'sampler','shared','stateblock','stateblock_state','static',
                'struct','switch','tbuffer','technique','technique10',
                'technique11','texture','typedef','triangle','triangleadj',
                'uniform','vertexfragment','volatile','while'),
                prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words(('true','false'), prefix=r'\b', suffix=r'\b'),
             Keyword.Constant),
            (words((
                'auto','catch','char','const_cast','delete','dynamic_cast','enum',
                'explicit','friend','goto','long','mutable','new','operator',
                'private','protected','public','reinterpret_cast','short','signed',
                'sizeof','static_cast','template','this','throw','try','typename',
                'union','unsigned','using','virtual'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Reserved),
            (words((
                'dword','matrix','snorm','string','unorm','unsigned','void','vector',
                'BlendState','Buffer','ByteAddressBuffer','ComputeShader',
                'DepthStencilState','DepthStencilView','DomainShader',
                'GeometryShader','HullShader','InputPatch','LineStream',
                'OutputPatch','PixelShader','PointStream','RasterizerState',
                'RenderTargetView','RasterizerOrderedBuffer',
                'RasterizerOrderedByteAddressBuffer',
                'RasterizerOrderedStructuredBuffer','RasterizerOrderedTexture1D',
                'RasterizerOrderedTexture1DArray','RasterizerOrderedTexture2D',
                'RasterizerOrderedTexture2DArray','RasterizerOrderedTexture3D',
                'RWBuffer','RWByteAddressBuffer','RWStructuredBuffer',
                'RWTexture1D','RWTexture1DArray','RWTexture2D','RWTexture2DArray',
                'RWTexture3D','SamplerState','SamplerComparisonState',
                'StructuredBuffer','Texture1D','Texture1DArray','Texture2D',
                'Texture2DArray','Texture2DMS','Texture2DMSArray','Texture3D',
                'TextureCube','TextureCubeArray','TriangleStream','VertexShader'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Type),
            (words((
                'bool','double','float','int','half','min16float','min10float',
                'min16int','min12int','min16uint','uint'),
                prefix=r'\b', suffix=r'([1-4](x[1-4])?)?\b'),
             Keyword.Type),     # vector and matrix types
            (words((
                'abort','abs','acos','all','AllMemoryBarrier',
                'AllMemoryBarrierWithGroupSync','any','AppendStructuredBuffer',
                'asdouble','asfloat','asin','asint','asuint','asuint','atan',
                'atan2','ceil','CheckAccessFullyMapped','clamp','clip',
                'CompileShader','ConsumeStructuredBuffer','cos','cosh','countbits',
                'cross','D3DCOLORtoUBYTE4','ddx','ddx_coarse','ddx_fine','ddy',
                'ddy_coarse','ddy_fine','degrees','determinant',
                'DeviceMemoryBarrier','DeviceMemoryBarrierWithGroupSync','distance',
                'dot','dst','errorf','EvaluateAttributeAtCentroid',
                'EvaluateAttributeAtSample','EvaluateAttributeSnapped','exp',
                'exp2','f16tof32','f32tof16','faceforward','firstbithigh',
                'firstbitlow','floor','fma','fmod','frac','frexp','fwidth',
                'GetRenderTargetSampleCount','GetRenderTargetSamplePosition',
                'GlobalOrderedCountIncrement','GroupMemoryBarrier',
                'GroupMemoryBarrierWithGroupSync','InterlockedAdd','InterlockedAnd',
                'InterlockedCompareExchange','InterlockedCompareStore',
                'InterlockedExchange','InterlockedMax','InterlockedMin',
                'InterlockedOr','InterlockedXor','isfinite','isinf','isnan',
                'ldexp','length','lerp','lit','log','log10','log2','mad','max',
                'min','modf','msad4','mul','noise','normalize','pow','printf',
                'Process2DQuadTessFactorsAvg','Process2DQuadTessFactorsMax',
                'Process2DQuadTessFactorsMin','ProcessIsolineTessFactors',
                'ProcessQuadTessFactorsAvg','ProcessQuadTessFactorsMax',
                'ProcessQuadTessFactorsMin','ProcessTriTessFactorsAvg',
                'ProcessTriTessFactorsMax','ProcessTriTessFactorsMin',
                'QuadReadLaneAt','QuadSwapX','QuadSwapY','radians','rcp',
                'reflect','refract','reversebits','round','rsqrt','saturate',
                'sign','sin','sincos','sinh','smoothstep','sqrt','step','tan',
                'tanh','tex1D','tex1D','tex1Dbias','tex1Dgrad','tex1Dlod',
                'tex1Dproj','tex2D','tex2D','tex2Dbias','tex2Dgrad','tex2Dlod',
                'tex2Dproj','tex3D','tex3D','tex3Dbias','tex3Dgrad','tex3Dlod',
                'tex3Dproj','texCUBE','texCUBE','texCUBEbias','texCUBEgrad',
                'texCUBElod','texCUBEproj','transpose','trunc','WaveAllBitAnd',
                'WaveAllMax','WaveAllMin','WaveAllBitOr','WaveAllBitXor',
                'WaveAllEqual','WaveAllProduct','WaveAllSum','WaveAllTrue',
                'WaveAnyTrue','WaveBallot','WaveGetLaneCount','WaveGetLaneIndex',
                'WaveGetOrderedIndex','WaveIsHelperLane','WaveOnce',
                'WavePrefixProduct','WavePrefixSum','WaveReadFirstLane',
                'WaveReadLaneAt'),
                prefix=r'\b', suffix=r'\b'),
             Name.Builtin),     # built-in functions
            (words((
                'SV_ClipDistance','SV_ClipDistance0','SV_ClipDistance1',
                'SV_Culldistance','SV_CullDistance0','SV_CullDistance1',
                'SV_Coverage','SV_Depth','SV_DepthGreaterEqual',
                'SV_DepthLessEqual','SV_DispatchThreadID','SV_DomainLocation',
                'SV_GroupID','SV_GroupIndex','SV_GroupThreadID','SV_GSInstanceID',
                'SV_InnerCoverage','SV_InsideTessFactor','SV_InstanceID',
                'SV_IsFrontFace','SV_OutputControlPointID','SV_Position',
                'SV_PrimitiveID','SV_RenderTargetArrayIndex','SV_SampleIndex',
                'SV_StencilRef','SV_TessFactor','SV_VertexID',
                'SV_ViewportArrayIndex'),
                prefix=r'\b', suffix=r'\b'),
             Name.Decorator),   # system-value semantics
            (r'\bSV_Target[0-7]?\b', Name.Decorator),
            (words((
                'allow_uav_condition','branch','call','domain','earlydepthstencil',
                'fastopt','flatten','forcecase','instance','loop','maxtessfactor',
                'numthreads','outputcontrolpoints','outputtopology','partitioning',
                'patchconstantfunc','unroll'),
                prefix=r'\b', suffix=r'\b'),
             Name.Decorator),   # attributes
            (r'[a-zA-Z_]\w*', Name),
            (r'\\$', Comment.Preproc),  # backslash at end of line -- usually macro continuation
            (r'\s+', Whitespace),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|'
             r'u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),  # line continuation
            (r'\\', String),  # stray backslash
        ],
    }


class PostScriptLexer(RegexLexer):
    """
    Lexer for PostScript files.
    """
    name = 'PostScript'
    url = 'https://en.wikipedia.org/wiki/PostScript'
    aliases = ['postscript', 'postscr']
    filenames = ['*.ps', '*.eps']
    mimetypes = ['application/postscript']
    version_added = '1.4'

    delimiter = r'()<>\[\]{}/%\s'
    delimiter_end = rf'(?=[{delimiter}])'

    valid_name_chars = rf'[^{delimiter}]'
    valid_name = rf"{valid_name_chars}+{delimiter_end}"

    tokens = {
        'root': [
            # All comment types
            (r'^%!.+$', Comment.Preproc),
            (r'%%.*$', Comment.Special),
            (r'(^%.*\n){2,}', Comment.Multiline),
            (r'%.*$', Comment.Single),

            # String literals are awkward; enter separate state.
            (r'\(', String, 'stringliteral'),

            (r'[{}<>\[\]]', Punctuation),

            # Numbers
            (r'<[0-9A-Fa-f]+>' + delimiter_end, Number.Hex),
            # Slight abuse: use Oct to signify any explicit base system
            (r'[0-9]+\#(\-|\+)?([0-9]+\.?|[0-9]*\.[0-9]+|[0-9]+\.[0-9]*)'
             r'((e|E)[0-9]+)?' + delimiter_end, Number.Oct),
            (r'(\-|\+)?([0-9]+\.?|[0-9]*\.[0-9]+|[0-9]+\.[0-9]*)((e|E)[0-9]+)?'
             + delimiter_end, Number.Float),
            (r'(\-|\+)?[0-9]+' + delimiter_end, Number.Integer),

            # References
            (rf'\/{valid_name}', Name.Variable),

            # Names
            (valid_name, Name.Function),      # Anything else is executed

            # These keywords taken from
            # <http://www.math.ubc.ca/~cass/graphics/manual/pdf/a1.pdf>
            # Is there an authoritative list anywhere that doesn't involve
            # trawling documentation?

            (r'(false|true)' + delimiter_end, Keyword.Constant),

            # Conditionals / flow control
            (r'(eq|ne|g[et]|l[et]|and|or|not|if(?:else)?|for(?:all)?)'
             + delimiter_end, Keyword.Reserved),

            (words((
                'abs', 'add', 'aload', 'arc', 'arcn', 'array', 'atan', 'begin',
                'bind', 'ceiling', 'charpath', 'clip', 'closepath', 'concat',
                'concatmatrix', 'copy', 'cos', 'currentlinewidth', 'currentmatrix',
                'currentpoint', 'curveto', 'cvi', 'cvs', 'def', 'defaultmatrix',
                'dict', 'dictstackoverflow', 'div', 'dtransform', 'dup', 'end',
                'exch', 'exec', 'exit', 'exp', 'fill', 'findfont', 'floor', 'get',
                'getinterval', 'grestore', 'gsave', 'gt', 'identmatrix', 'idiv',
                'idtransform', 'index', 'invertmatrix', 'itransform', 'length',
                'lineto', 'ln', 'load', 'log', 'loop', 'matrix', 'mod', 'moveto',
                'mul', 'neg', 'newpath', 'pathforall', 'pathbbox', 'pop', 'print',
                'pstack', 'put', 'quit', 'rand', 'rangecheck', 'rcurveto', 'repeat',
                'restore', 'rlineto', 'rmoveto', 'roll', 'rotate', 'round', 'run',
                'save', 'scale', 'scalefont', 'setdash', 'setfont', 'setgray',
                'setlinecap', 'setlinejoin', 'setlinewidth', 'setmatrix',
                'setrgbcolor', 'shfill', 'show', 'showpage', 'sin', 'sqrt',
                'stack', 'stringwidth', 'stroke', 'strokepath', 'sub', 'syntaxerror',
                'transform', 'translate', 'truncate', 'typecheck', 'undefined',
                'undefinedfilename', 'undefinedresult'), suffix=delimiter_end),
             Name.Builtin),

            (r'\s+', Whitespace),
        ],

        'stringliteral': [
            (r'[^()\\]+', String),
            (r'\\', String.Escape, 'escape'),
            (r'\(', String, '#push'),
            (r'\)', String, '#pop'),
        ],

        'escape': [
            (r'[0-8]{3}|n|r|t|b|f|\\|\(|\)', String.Escape, '#pop'),
            default('#pop'),
        ],
    }


class AsymptoteLexer(RegexLexer):
    """
    For Asymptote source code.
    """
    name = 'Asymptote'
    url = 'http://asymptote.sf.net/'
    aliases = ['asymptote', 'asy']
    filenames = ['*.asy']
    mimetypes = ['text/x-asymptote']
    version_added = '1.2'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//.*?\n|/\*.*?\*/)+'

    tokens = {
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),  # line continuation
            (r'//(\n|(.|\n)*?[^\\]\n)', Comment),
            (r'/(\\\n)?\*(.|\n)*?\*(\\\n)?/', Comment),
        ],
        'statements': [
            # simple string (TeX friendly)
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # C style string (with character escapes)
            (r"'", String, 'string'),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[lL]?', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[Ll]?', Number.Hex),
            (r'0[0-7]+[Ll]?', Number.Oct),
            (r'\d+[Ll]?', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'[()\[\],.]', Punctuation),
            (r'\b(case)(.+?)(:)', bygroups(Keyword, using(this), Text)),
            (r'(and|controls|tension|atleast|curl|if|else|while|for|do|'
             r'return|break|continue|struct|typedef|new|access|import|'
             r'unravel|from|include|quote|static|public|private|restricted|'
             r'this|explicit|true|false|null|cycle|newframe|operator)\b', Keyword),
            # Since an asy-type-name can be also an asy-function-name,
            # in the following we test if the string "  [a-zA-Z]" follows
            # the Keyword.Type.
            # Of course it is not perfect !
            (r'(Braid|FitResult|Label|Legend|TreeNode|abscissa|arc|arrowhead|'
             r'binarytree|binarytreeNode|block|bool|bool3|bounds|bqe|circle|'
             r'conic|coord|coordsys|cputime|ellipse|file|filltype|frame|grid3|'
             r'guide|horner|hsv|hyperbola|indexedTransform|int|inversion|key|'
             r'light|line|linefit|marginT|marker|mass|object|pair|parabola|path|'
             r'path3|pen|picture|point|position|projection|real|revolution|'
             r'scaleT|scientific|segment|side|slice|splitface|string|surface|'
             r'tensionSpecifier|ticklocate|ticksgridT|tickvalues|transform|'
             r'transformation|tree|triangle|trilinear|triple|vector|'
             r'vertex|void)(?=\s+[a-zA-Z])', Keyword.Type),
            # Now the asy-type-name which are not asy-function-name
            # except yours !
            # Perhaps useless
            (r'(Braid|FitResult|TreeNode|abscissa|arrowhead|block|bool|bool3|'
             r'bounds|coord|frame|guide|horner|int|linefit|marginT|pair|pen|'
             r'picture|position|real|revolution|slice|splitface|ticksgridT|'
             r'tickvalues|tree|triple|vertex|void)\b', Keyword.Type),
            (r'[a-zA-Z_]\w*:(?!:)', Name.Label),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'root': [
            include('whitespace'),
            # functions
            (r'((?:[\w*\s])+?(?:\s|\*))'  # return arguments
             r'([a-zA-Z_]\w*)'            # method name
             r'(\s*\([^;]*?\))'           # signature
             r'(' + _ws + r')(\{)',
             bygroups(using(this), Name.Function, using(this), using(this),
                      Punctuation),
             'function'),
            # function declarations
            (r'((?:[\w*\s])+?(?:\s|\*))'  # return arguments
             r'([a-zA-Z_]\w*)'            # method name
             r'(\s*\([^;]*?\))'           # signature
             r'(' + _ws + r')(;)',
             bygroups(using(this), Name.Function, using(this), using(this),
                      Punctuation)),
            default('statement'),
        ],
        'statement': [
            include('whitespace'),
            include('statements'),
            ('[{}]', Punctuation),
            (';', Punctuation, '#pop'),
        ],
        'function': [
            include('whitespace'),
            include('statements'),
            (';', Punctuation),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
        ],
        'string': [
            (r"'", String, '#pop'),
            (r'\\([\\abfnrtv"\'?]|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'\n', String),
            (r"[^\\'\n]+", String),  # all other characters
            (r'\\\n', String),
            (r'\\n', String),        # line continuation
            (r'\\', String),         # stray backslash
        ],
    }

    def get_tokens_unprocessed(self, text):
        from erdos.erdos._vendor.pygments.lexers._asy_builtins import ASYFUNCNAME, ASYVARNAME
        for index, token, value in \
                RegexLexer.get_tokens_unprocessed(self, text):
            if token is Name and value in ASYFUNCNAME:
                token = Name.Function
            elif token is Name and value in ASYVARNAME:
                token = Name.Variable
            yield index, token, value


def _shortened(word):
    dpos = word.find('$')
    return '|'.join(word[:dpos] + word[dpos+1:i] + r'\b'
                    for i in range(len(word), dpos, -1))


def _shortened_many(*words):
    return '|'.join(map(_shortened, words))


class GnuplotLexer(RegexLexer):
    """
    For Gnuplot plotting scripts.
    """

    name = 'Gnuplot'
    url = 'http://gnuplot.info/'
    aliases = ['gnuplot']
    filenames = ['*.plot', '*.plt']
    mimetypes = ['text/x-gnuplot']
    version_added = '0.11'

    tokens = {
        'root': [
            include('whitespace'),
            (_shortened('bi$nd'), Keyword, 'bind'),
            (_shortened_many('ex$it', 'q$uit'), Keyword, 'quit'),
            (_shortened('f$it'), Keyword, 'fit'),
            (r'(if)(\s*)(\()', bygroups(Keyword, Text, Punctuation), 'if'),
            (r'else\b', Keyword),
            (_shortened('pa$use'), Keyword, 'pause'),
            (_shortened_many('p$lot', 'rep$lot', 'sp$lot'), Keyword, 'plot'),
            (_shortened('sa$ve'), Keyword, 'save'),
            (_shortened('se$t'), Keyword, ('genericargs', 'optionarg')),
            (_shortened_many('sh$ow', 'uns$et'),
             Keyword, ('noargs', 'optionarg')),
            (_shortened_many('low$er', 'ra$ise', 'ca$ll', 'cd$', 'cl$ear',
                             'h$elp', '\\?$', 'hi$story', 'l$oad', 'pr$int',
                             'pwd$', 're$read', 'res$et', 'scr$eendump',
                             'she$ll', 'sy$stem', 'up$date'),
             Keyword, 'genericargs'),
            (_shortened_many('pwd$', 're$read', 'res$et', 'scr$eendump',
                             'she$ll', 'test$'),
             Keyword, 'noargs'),
            (r'([a-zA-Z_]\w*)(\s*)(=)',
             bygroups(Name.Variable, Whitespace, Operator), 'genericargs'),
            (r'([a-zA-Z_]\w*)(\s*)(\()(.*?)(\))(\s*)(=)',
             bygroups(Name.Function, Whitespace, Punctuation,
                      Text, Punctuation, Whitespace, Operator), 'genericargs'),
            (r'@[a-zA-Z_]\w*', Name.Constant),  # macros
            (r';', Keyword),
        ],
        'comment': [
            (r'[^\\\n]+', Comment),
            (r'\\\n', Comment),
            (r'\\', Comment),
            # don't add the newline to the Comment token
            default('#pop'),
        ],
        'whitespace': [
            ('#', Comment, 'comment'),
            (r'[ \t\v\f]+', Whitespace),
        ],
        'noargs': [
            include('whitespace'),
            # semicolon and newline end the argument list
            (r';', Punctuation, '#pop'),
            (r'\n', Whitespace, '#pop'),
        ],
        'dqstring': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),   # all other characters
            (r'\\\n', String),        # line continuation
            (r'\\', String),          # stray backslash
            (r'\n', Whitespace, '#pop'),  # newline ends the string too
        ],
        'sqstring': [
            (r"''", String),          # escaped single quote
            (r"'", String, '#pop'),
            (r"[^\\'\n]+", String),   # all other characters
            (r'\\\n', String),        # line continuation
            (r'\\', String),          # normal backslash
            (r'\n', Whitespace, '#pop'),  # newline ends the string too
        ],
        'genericargs': [
            include('noargs'),
            (r'"', String, 'dqstring'),
            (r"'", String, 'sqstring'),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+', Number.Float),
            (r'(\d+\.\d*|\.\d+)', Number.Float),
            (r'-?\d+', Number.Integer),
            ('[,.~!%^&*+=|?:<>/-]', Operator),
            (r'[{}()\[\]]', Punctuation),
            (r'(eq|ne)\b', Operator.Word),
            (r'([a-zA-Z_]\w*)(\s*)(\()',
             bygroups(Name.Function, Text, Punctuation)),
            (r'[a-zA-Z_]\w*', Name),
            (r'@[a-zA-Z_]\w*', Name.Constant),  # macros
            (r'(\\)(\n)', bygroups(Text, Whitespace)),
        ],
        'optionarg': [
            include('whitespace'),
            (_shortened_many(
                "a$ll", "an$gles", "ar$row", "au$toscale", "b$ars", "bor$der",
                "box$width", "cl$abel", "c$lip", "cn$trparam", "co$ntour", "da$ta",
                "data$file", "dg$rid3d", "du$mmy", "enc$oding", "dec$imalsign",
                "fit$", "font$path", "fo$rmat", "fu$nction", "fu$nctions", "g$rid",
                "hid$den3d", "his$torysize", "is$osamples", "k$ey", "keyt$itle",
                "la$bel", "li$nestyle", "ls$", "loa$dpath", "loc$ale", "log$scale",
                "mac$ros", "map$ping", "map$ping3d", "mar$gin", "lmar$gin",
                "rmar$gin", "tmar$gin", "bmar$gin", "mo$use", "multi$plot",
                "mxt$ics", "nomxt$ics", "mx2t$ics", "nomx2t$ics", "myt$ics",
                "nomyt$ics", "my2t$ics", "nomy2t$ics", "mzt$ics", "nomzt$ics",
                "mcbt$ics", "nomcbt$ics", "of$fsets", "or$igin", "o$utput",
                "pa$rametric", "pm$3d", "pal$ette", "colorb$ox", "p$lot",
                "poi$ntsize", "pol$ar", "pr$int", "obj$ect", "sa$mples", "si$ze",
                "st$yle", "su$rface", "table$", "t$erminal", "termo$ptions", "ti$cs",
                "ticsc$ale", "ticsl$evel", "timef$mt", "tim$estamp", "tit$le",
                "v$ariables", "ve$rsion", "vi$ew", "xyp$lane", "xda$ta", "x2da$ta",
                "yda$ta", "y2da$ta", "zda$ta", "cbda$ta", "xl$abel", "x2l$abel",
                "yl$abel", "y2l$abel", "zl$abel", "cbl$abel", "xti$cs", "noxti$cs",
                "x2ti$cs", "nox2ti$cs", "yti$cs", "noyti$cs", "y2ti$cs", "noy2ti$cs",
                "zti$cs", "nozti$cs", "cbti$cs", "nocbti$cs", "xdti$cs", "noxdti$cs",
                "x2dti$cs", "nox2dti$cs", "ydti$cs", "noydti$cs", "y2dti$cs",
                "noy2dti$cs", "zdti$cs", "nozdti$cs", "cbdti$cs", "nocbdti$cs",
                "xmti$cs", "noxmti$cs", "x2mti$cs", "nox2mti$cs", "ymti$cs",
                "noymti$cs", "y2mti$cs", "noy2mti$cs", "zmti$cs", "nozmti$cs",
                "cbmti$cs", "nocbmti$cs", "xr$ange", "x2r$ange", "yr$ange",
                "y2r$ange", "zr$ange", "cbr$ange", "rr$ange", "tr$ange", "ur$ange",
                "vr$ange", "xzeroa$xis", "x2zeroa$xis", "yzeroa$xis", "y2zeroa$xis",
                "zzeroa$xis", "zeroa$xis", "z$ero"), Name.Builtin, '#pop'),
        ],
        'bind': [
            ('!', Keyword, '#pop'),
            (_shortened('all$windows'), Name.Builtin),
            include('genericargs'),
        ],
        'quit': [
            (r'gnuplot\b', Keyword),
            include('noargs'),
        ],
        'fit': [
            (r'via\b', Name.Builtin),
            include('plot'),
        ],
        'if': [
            (r'\)', Punctuation, '#pop'),
            include('genericargs'),
        ],
        'pause': [
            (r'(mouse|any|button1|button2|button3)\b', Name.Builtin),
            (_shortened('key$press'), Name.Builtin),
            include('genericargs'),
        ],
        'plot': [
            (_shortened_many('ax$es', 'axi$s', 'bin$ary', 'ev$ery', 'i$ndex',
                             'mat$rix', 's$mooth', 'thru$', 't$itle',
                             'not$itle', 'u$sing', 'w$ith'),
             Name.Builtin),
            include('genericargs'),
        ],
        'save': [
            (_shortened_many('f$unctions', 's$et', 't$erminal', 'v$ariables'),
             Name.Builtin),
            include('genericargs'),
        ],
    }


class PovrayLexer(RegexLexer):
    """
    For Persistence of Vision Raytracer files.
    """
    name = 'POVRay'
    url = 'http://www.povray.org/'
    aliases = ['pov']
    filenames = ['*.pov', '*.inc']
    mimetypes = ['text/x-povray']
    version_added = '0.11'

    tokens = {
        'root': [
            (r'/\*[\w\W]*?\*/', Comment.Multiline),
            (r'//.*$', Comment.Single),
            (r'(?s)"(?:\\.|[^"\\])+"', String.Double),
            (words((
                'break', 'case', 'debug', 'declare', 'default', 'define', 'else',
                'elseif', 'end', 'error', 'fclose', 'fopen', 'for', 'if', 'ifdef',
                'ifndef', 'include', 'local', 'macro', 'range', 'read', 'render',
                'statistics', 'switch', 'undef', 'version', 'warning', 'while',
                'write'), prefix=r'#', suffix=r'\b'),
             Comment.Preproc),
            (words((
                'aa_level', 'aa_threshold', 'abs', 'acos', 'acosh', 'adaptive', 'adc_bailout',
                'agate', 'agate_turb', 'all', 'alpha', 'ambient', 'ambient_light', 'angle',
                'aperture', 'arc_angle', 'area_light', 'asc', 'asin', 'asinh', 'assumed_gamma',
                'atan', 'atan2', 'atanh', 'atmosphere', 'atmospheric_attenuation',
                'attenuating', 'average', 'background', 'black_hole', 'blue', 'blur_samples',
                'bounded_by', 'box_mapping', 'bozo', 'break', 'brick', 'brick_size',
                'brightness', 'brilliance', 'bumps', 'bumpy1', 'bumpy2', 'bumpy3', 'bump_map',
                'bump_size', 'case', 'caustics', 'ceil', 'checker', 'chr', 'clipped_by', 'clock',
                'color', 'color_map', 'colour', 'colour_map', 'component', 'composite', 'concat',
                'confidence', 'conic_sweep', 'constant', 'control0', 'control1', 'cos', 'cosh',
                'count', 'crackle', 'crand', 'cube', 'cubic_spline', 'cylindrical_mapping',
                'debug', 'declare', 'default', 'degrees', 'dents', 'diffuse', 'direction',
                'distance', 'distance_maximum', 'div', 'dust', 'dust_type', 'eccentricity',
                'else', 'emitting', 'end', 'error', 'error_bound', 'exp', 'exponent',
                'fade_distance', 'fade_power', 'falloff', 'falloff_angle', 'false',
                'file_exists', 'filter', 'finish', 'fisheye', 'flatness', 'flip', 'floor',
                'focal_point', 'fog', 'fog_alt', 'fog_offset', 'fog_type', 'frequency', 'gif',
                'global_settings', 'glowing', 'gradient', 'granite', 'gray_threshold',
                'green', 'halo', 'hexagon', 'hf_gray_16', 'hierarchy', 'hollow', 'hypercomplex',
                'if', 'ifdef', 'iff', 'image_map', 'incidence', 'include', 'int', 'interpolate',
                'inverse', 'ior', 'irid', 'irid_wavelength', 'jitter', 'lambda', 'leopard',
                'linear', 'linear_spline', 'linear_sweep', 'location', 'log', 'looks_like',
                'look_at', 'low_error_factor', 'mandel', 'map_type', 'marble', 'material_map',
                'matrix', 'max', 'max_intersections', 'max_iteration', 'max_trace_level',
                'max_value', 'metallic', 'min', 'minimum_reuse', 'mod', 'mortar',
                'nearest_count', 'no', 'normal', 'normal_map', 'no_shadow', 'number_of_waves',
                'octaves', 'off', 'offset', 'omega', 'omnimax', 'on', 'once', 'onion', 'open',
                'orthographic', 'panoramic', 'pattern1', 'pattern2', 'pattern3',
                'perspective', 'pgm', 'phase', 'phong', 'phong_size', 'pi', 'pigment',
                'pigment_map', 'planar_mapping', 'png', 'point_at', 'pot', 'pow', 'ppm',
                'precision', 'pwr', 'quadratic_spline', 'quaternion', 'quick_color',
                'quick_colour', 'quilted', 'radial', 'radians', 'radiosity', 'radius', 'rainbow',
                'ramp_wave', 'rand', 'range', 'reciprocal', 'recursion_limit', 'red',
                'reflection', 'refraction', 'render', 'repeat', 'rgb', 'rgbf', 'rgbft', 'rgbt',
                'right', 'ripples', 'rotate', 'roughness', 'samples', 'scale', 'scallop_wave',
                'scattering', 'seed', 'shadowless', 'sin', 'sine_wave', 'sinh', 'sky', 'sky_sphere',
                'slice', 'slope_map', 'smooth', 'specular', 'spherical_mapping', 'spiral',
                'spiral1', 'spiral2', 'spotlight', 'spotted', 'sqr', 'sqrt', 'statistics', 'str',
                'strcmp', 'strength', 'strlen', 'strlwr', 'strupr', 'sturm', 'substr', 'switch', 'sys',
                't', 'tan', 'tanh', 'test_camera_1', 'test_camera_2', 'test_camera_3',
                'test_camera_4', 'texture', 'texture_map', 'tga', 'thickness', 'threshold',
                'tightness', 'tile2', 'tiles', 'track', 'transform', 'translate', 'transmit',
                'triangle_wave', 'true', 'ttf', 'turbulence', 'turb_depth', 'type',
                'ultra_wide_angle', 'up', 'use_color', 'use_colour', 'use_index', 'u_steps',
                'val', 'variance', 'vaxis_rotate', 'vcross', 'vdot', 'version', 'vlength',
                'vnormalize', 'volume_object', 'volume_rendered', 'vol_with_light',
                'vrotate', 'v_steps', 'warning', 'warp', 'water_level', 'waves', 'while', 'width',
                'wood', 'wrinkles', 'yes'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words((
                'bicubic_patch', 'blob', 'box', 'camera', 'cone', 'cubic', 'cylinder', 'difference',
                'disc', 'height_field', 'intersection', 'julia_fractal', 'lathe',
                'light_source', 'merge', 'mesh', 'object', 'plane', 'poly', 'polygon', 'prism',
                'quadric', 'quartic', 'smooth_triangle', 'sor', 'sphere', 'superellipsoid',
                'text', 'torus', 'triangle', 'union'), suffix=r'\b'),
             Name.Builtin),
            (r'\b(x|y|z|u|v)\b', Name.Builtin.Pseudo),
            (r'[a-zA-Z_]\w*', Name),
            (r'[0-9]*\.[0-9]+', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'[\[\](){}<>;,]', Punctuation),
            (r'[-+*/=.|&]|<=|>=|!=', Operator),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r'\s+', Whitespace),
        ]
    }

    def analyse_text(text):
        """POVRAY is similar to JSON/C, but the combination of camera and
        light_source is probably not very likely elsewhere. HLSL or GLSL
        are similar (GLSL even has #version), but they miss #declare, and
        light_source/camera are not keywords anywhere else -- it's fair
        to assume though that any POVRAY scene must have a camera and
        lightsource."""
        result = 0
        if '#version' in text:
            result += 0.05
        if '#declare' in text:
            result += 0.05
        if 'camera' in text:
            result += 0.05
        if 'light_source' in text:
            result += 0.1

        return result
