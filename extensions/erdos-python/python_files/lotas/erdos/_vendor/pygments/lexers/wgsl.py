"""
    pygments.lexers.wgsl
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the WebGPU Shading Language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words, default
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, \
    Number, Punctuation, Whitespace
from pygments import unistring as uni

__all__ = ['WgslLexer']

LF = '\\u000a'
VT = '\\u000b'
FF = '\\u000c'
CR = '\\u000d'
NextLine = '\\u0085'
LineSep = '\\u2028'
ParaSep = '\\u2029'
LineEndCodePoints = [LF,VT,FF,CR,NextLine,LineSep,ParaSep]
NotLineEndRE = '[^' + "".join(LineEndCodePoints) + ']'
LineEndRE = '[' + "".join(LineEndCodePoints) + ']'

# https://www.w3.org/TR/WGSL/#syntax-ident_pattern_token
ident_pattern_token = f'([{uni.xid_start}][{uni.xid_continue}]+)|[{uni.xid_start}]'


class WgslLexer(RegexLexer):
    """
    Lexer for the WebGPU Shading Language.
    """
    name = 'WebGPU Shading Language'
    url = 'https://www.w3.org/TR/WGSL/'
    aliases = ['wgsl']
    filenames = ['*.wgsl']
    mimetypes = ['text/wgsl']
    version_added = '2.15'

    # https://www.w3.org/TR/WGSL/#var-and-value
    keyword_decl = (words('var let const override'.split(),suffix=r'\b'), Keyword.Declaration)
    # https://www.w3.org/TR/WGSL/#keyword-summary
    keywords = (words("""
                alias
                break
                case
                const_assert
                continue
                continuing
                default
                diagnostic
                discard
                else
                enable
                false
                fn
                for
                if
                loop
                requires
                return
                struct
                switch
                true
                while
                """.split(), suffix=r'\b'), Keyword)

    # https://www.w3.org/TR/WGSL/#reserved-words
    keyword_reserved = (words("""
                NULL
                Self
                abstract
                active
                alignas
                alignof
                as
                asm
                asm_fragment
                async
                attribute
                auto
                await
                become
                binding_array
                cast
                catch
                class
                co_await
                co_return
                co_yield
                coherent
                column_major
                common
                compile
                compile_fragment
                concept
                const_cast
                consteval
                constexpr
                constinit
                crate
                debugger
                decltype
                delete
                demote
                demote_to_helper
                do
                dynamic_cast
                enum
                explicit
                export
                extends
                extern
                external
                fallthrough
                filter
                final
                finally
                friend
                from
                fxgroup
                get
                goto
                groupshared
                highp
                impl
                implements
                import
                inline
                instanceof
                interface
                layout
                lowp
                macro
                macro_rules
                match
                mediump
                meta
                mod
                module
                move
                mut
                mutable
                namespace
                new
                nil
                noexcept
                noinline
                nointerpolation
                noperspective
                null
                nullptr
                of
                operator
                package
                packoffset
                partition
                pass
                patch
                pixelfragment
                precise
                precision
                premerge
                priv
                protected
                pub
                public
                readonly
                ref
                regardless
                register
                reinterpret_cast
                require
                resource
                restrict
                self
                set
                shared
                sizeof
                smooth
                snorm
                static
                static_assert
                static_cast
                std
                subroutine
                super
                target
                template
                this
                thread_local
                throw
                trait
                try
                type
                typedef
                typeid
                typename
                typeof
                union
                unless
                unorm
                unsafe
                unsized
                use
                using
                varying
                virtual
                volatile
                wgsl
                where
                with
                writeonly
                yield
                """.split(), suffix=r'\b'), Keyword.Reserved)

    # https://www.w3.org/TR/WGSL/#predeclared-enumerants
    predeclared_enums = (words("""
          read write read_write
          function private workgroup uniform storage
          perspective linear flat
          center centroid sample
          vertex_index instance_index position front_facing frag_depth
              local_invocation_id local_invocation_index
              global_invocation_id workgroup_id num_workgroups
              sample_index sample_mask
          rgba8unorm
          rgba8snorm
          rgba8uint
          rgba8sint
          rgba16uint
          rgba16sint
          rgba16float
          r32uint
          r32sint
          r32float
          rg32uint
          rg32sint
          rg32float
          rgba32uint
          rgba32sint
          rgba32float
          bgra8unorm
          """.split(), suffix=r'\b'), Name.Builtin)

    # https://www.w3.org/TR/WGSL/#predeclared-types
    predeclared_types = (words("""
          bool
          f16
          f32
          i32
          sampler sampler_comparison
          texture_depth_2d
          texture_depth_2d_array
          texture_depth_cube
          texture_depth_cube_array
          texture_depth_multisampled_2d
          texture_external
          texture_external
          u32
          """.split(), suffix=r'\b'), Name.Builtin)

    # https://www.w3.org/TR/WGSL/#predeclared-types
    predeclared_type_generators = (words("""
          array
          atomic
          mat2x2
          mat2x3
          mat2x4
          mat3x2
          mat3x3
          mat3x4
          mat4x2
          mat4x3
          mat4x4
          ptr
          texture_1d
          texture_2d
          texture_2d_array
          texture_3d
          texture_cube
          texture_cube_array
          texture_multisampled_2d
          texture_storage_1d
          texture_storage_2d
          texture_storage_2d_array
          texture_storage_3d
          vec2
          vec3
          vec4
          """.split(), suffix=r'\b'), Name.Builtin)

    # Predeclared type aliases for vectors
    # https://www.w3.org/TR/WGSL/#vector-types
    predeclared_type_alias_vectors = (words("""
          vec2i vec3i vec4i
          vec2u vec3u vec4u
          vec2f vec3f vec4f
          vec2h vec3h vec4h
          """.split(), suffix=r'\b'), Name.Builtin)

    # Predeclared type aliases for matrices
    # https://www.w3.org/TR/WGSL/#matrix-types
    predeclared_type_alias_matrices = (words("""
          mat2x2f mat2x3f mat2x4f
          mat3x2f mat3x3f mat3x4f
          mat4x2f mat4x3f mat4x4f
          mat2x2h mat2x3h mat2x4h
          mat3x2h mat3x3h mat3x4h
          mat4x2h mat4x3h mat4x4h
          """.split(), suffix=r'\b'), Name.Builtin)

    tokens = {
        'blankspace': [
            # https://www.w3.org/TR/WGSL/#blankspace
            (r'[\u0020\u0009\u000a\u000b\u000c\u000d\u0085\u200e\u200f\u2028\u2029]+', Whitespace),
        ],
        'comments': [
            # Line ending comments
            # Match up CR/LF pair first.
            (rf'//{NotLineEndRE}*{CR}{LF}', Comment.Single),
            (rf'//{NotLineEndRE}*{LineEndRE}', Comment.Single),
            (r'/\*', Comment.Multiline, 'block_comment'),
        ],
        'attribute': [
            include('blankspace'),
            include('comments'),
            (ident_pattern_token, Name.Decorator,'#pop'),
            default('#pop'),
        ],
        'root': [
            include('blankspace'),
            include('comments'),

            # Attributes.
            # https://www.w3.org/TR/WGSL/#attributes
            # Mark the '@' and the attribute name as a decorator.
            (r'@', Name.Decorator, 'attribute'),

            # Keywords
            (r'(true|false)\b', Keyword.Constant),
            keyword_decl,
            keywords,
            keyword_reserved,

            # Predeclared
            predeclared_enums,
            predeclared_types,
            predeclared_type_generators,
            predeclared_type_alias_vectors,
            predeclared_type_alias_matrices,

            # Decimal float literals
            # https://www.w3.org/TR/WGSL/#syntax-decimal_float_literal
            # 0, with type-specifying suffix.
            (r'0[fh]', Number.Float),
            # Other decimal integer, with type-specifying suffix.
            (r'[1-9][0-9]*[fh]', Number.Float),
            #    Has decimal point, at least one digit after decimal.
            (r'[0-9]*\.[0-9]+([eE][+-]?[0-9]+)?[fh]?', Number.Float),
            #    Has decimal point, at least one digit before decimal.
            (r'[0-9]+\.[0-9]*([eE][+-]?[0-9]+)?[fh]?', Number.Float),
            #    Has at least one digit, and has an exponent.
            (r'[0-9]+[eE][+-]?[0-9]+[fh]?', Number.Float),

            # Hex float literals
            # https://www.w3.org/TR/WGSL/#syntax-hex_float_literal
            (r'0[xX][0-9a-fA-F]*\.[0-9a-fA-F]+([pP][+-]?[0-9]+[fh]?)?', Number.Float),
            (r'0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*([pP][+-]?[0-9]+[fh]?)?', Number.Float),
            (r'0[xX][0-9a-fA-F]+[pP][+-]?[0-9]+[fh]?', Number.Float),

            # Hexadecimal integer literals
            # https://www.w3.org/TR/WGSL/#syntax-hex_int_literal
            (r'0[xX][0-9a-fA-F]+[iu]?', Number.Hex),
            # Decimal integer literals
            # https://www.w3.org/TR/WGSL/#syntax-decimal_int_literal
            # We need two rules here because 01 is not valid.
            (r'[1-9][0-9]*[iu]?', Number.Integer),
            (r'0[iu]?', Number.Integer), # Must match last.

            # Operators and Punctuation
            (r'[{}()\[\],\.;:]', Punctuation),
            (r'->', Punctuation), # Return-type arrow
            (r'[+\-*/%&|<>^!~=]', Operator),

            # TODO: Treat context-depedendent names specially
            # https://www.w3.org/TR/WGSL/#context-dependent-name

            # Identifiers
            (ident_pattern_token, Name),

            # TODO: templates start and end tokens.
            # https://www.w3.org/TR/WGSL/#template-lists-sec
        ],
        'block_comment': [
            # https://www.w3.org/TR/WGSL/#block-comment
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
    }
