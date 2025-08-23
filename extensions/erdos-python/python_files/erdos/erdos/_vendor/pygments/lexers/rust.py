"""
    pygments.lexers.rust
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the Rust language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, words, default
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['RustLexer']


class RustLexer(RegexLexer):
    """
    Lexer for the Rust programming language (version 1.47).
    """
    name = 'Rust'
    url = 'https://www.rust-lang.org/'
    filenames = ['*.rs', '*.rs.in']
    aliases = ['rust', 'rs']
    mimetypes = ['text/rust', 'text/x-rust']
    version_added = '1.6'

    keyword_types = (words((
        'u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128',
        'usize', 'isize', 'f32', 'f64', 'char', 'str', 'bool',
    ), suffix=r'\b'), Keyword.Type)

    builtin_funcs_types = (words((
        'Copy', 'Send', 'Sized', 'Sync', 'Unpin',
        'Drop', 'Fn', 'FnMut', 'FnOnce', 'drop',
        'Box', 'ToOwned', 'Clone',
        'PartialEq', 'PartialOrd', 'Eq', 'Ord',
        'AsRef', 'AsMut', 'Into', 'From', 'Default',
        'Iterator', 'Extend', 'IntoIterator', 'DoubleEndedIterator',
        'ExactSizeIterator',
        'Option', 'Some', 'None',
        'Result', 'Ok', 'Err',
        'String', 'ToString', 'Vec',
    ), suffix=r'\b'), Name.Builtin)

    builtin_macros = (words((
        'asm', 'assert', 'assert_eq', 'assert_ne', 'cfg', 'column',
        'compile_error', 'concat', 'concat_idents', 'dbg', 'debug_assert',
        'debug_assert_eq', 'debug_assert_ne', 'env', 'eprint', 'eprintln',
        'file', 'format', 'format_args', 'format_args_nl', 'global_asm',
        'include', 'include_bytes', 'include_str',
        'is_aarch64_feature_detected',
        'is_arm_feature_detected',
        'is_mips64_feature_detected',
        'is_mips_feature_detected',
        'is_powerpc64_feature_detected',
        'is_powerpc_feature_detected',
        'is_x86_feature_detected',
        'line', 'llvm_asm', 'log_syntax', 'macro_rules', 'matches',
        'module_path', 'option_env', 'panic', 'print', 'println', 'stringify',
        'thread_local', 'todo', 'trace_macros', 'unimplemented', 'unreachable',
        'vec', 'write', 'writeln',
    ), suffix=r'!'), Name.Function.Magic)

    tokens = {
        'root': [
            # rust allows a file to start with a shebang, but if the first line
            # starts with #![ then it's not a shebang but a crate attribute.
            (r'#![^[\r\n].*$', Comment.Preproc),
            default('base'),
        ],
        'base': [
            # Whitespace and Comments
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'//!.*?\n', String.Doc),
            (r'///(\n|[^/].*?\n)', String.Doc),
            (r'//(.*?)\n', Comment.Single),
            (r'/\*\*(\n|[^/*])', String.Doc, 'doccomment'),
            (r'/\*!', String.Doc, 'doccomment'),
            (r'/\*', Comment.Multiline, 'comment'),

            # Macro parameters
            (r"""\$([a-zA-Z_]\w*|\(,?|\),?|,?)""", Comment.Preproc),
            # Keywords
            (words(('as', 'async', 'await', 'box', 'const', 'crate', 'dyn',
                    'else', 'extern', 'for', 'if', 'impl', 'in', 'loop',
                    'match', 'move', 'mut', 'pub', 'ref', 'return', 'static',
                    'super', 'trait', 'unsafe', 'use', 'where', 'while'),
                   suffix=r'\b'), Keyword),
            (words(('abstract', 'become', 'do', 'final', 'macro', 'override',
                    'priv', 'typeof', 'try', 'unsized', 'virtual', 'yield'),
                   suffix=r'\b'), Keyword.Reserved),
            (r'(true|false)\b', Keyword.Constant),
            (r'self\b', Name.Builtin.Pseudo),
            (r'mod\b', Keyword, 'modname'),
            (r'let\b', Keyword.Declaration),
            (r'fn\b', Keyword, 'funcname'),
            (r'(struct|enum|type|union)\b', Keyword, 'typename'),
            (r'(default)(\s+)(type|fn)\b', bygroups(Keyword, Whitespace, Keyword)),
            keyword_types,
            (r'[sS]elf\b', Name.Builtin.Pseudo),
            # Prelude (taken from Rust's src/libstd/prelude.rs)
            builtin_funcs_types,
            builtin_macros,
            # Path separators, so types don't catch them.
            (r'::\b', Punctuation),
            # Types in positions.
            (r'(?::|->)', Punctuation, 'typename'),
            # Labels
            (r'(break|continue)(\b\s*)(\'[A-Za-z_]\w*)?',
             bygroups(Keyword, Text.Whitespace, Name.Label)),

            # Character literals
            (r"""'(\\['"\\nrt]|\\x[0-7][0-9a-fA-F]|\\0"""
             r"""|\\u\{[0-9a-fA-F]{1,6}\}|.)'""",
             String.Char),
            (r"""b'(\\['"\\nrt]|\\x[0-9a-fA-F]{2}|\\0"""
             r"""|\\u\{[0-9a-fA-F]{1,6}\}|.)'""",
             String.Char),

            # Binary literals
            (r'0b[01_]+', Number.Bin, 'number_lit'),
            # Octal literals
            (r'0o[0-7_]+', Number.Oct, 'number_lit'),
            # Hexadecimal literals
            (r'0[xX][0-9a-fA-F_]+', Number.Hex, 'number_lit'),
            # Decimal literals
            (r'[0-9][0-9_]*(\.[0-9_]+[eE][+\-]?[0-9_]+|'
             r'\.[0-9_]*(?!\.)|[eE][+\-]?[0-9_]+)', Number.Float,
             'number_lit'),
            (r'[0-9][0-9_]*', Number.Integer, 'number_lit'),

            # String literals
            (r'b"', String, 'bytestring'),
            (r'"', String, 'string'),
            (r'(?s)b?r(#*)".*?"\1', String),

            # Lifetime names
            (r"'", Operator, 'lifetime'),

            # Operators and Punctuation
            (r'\.\.=?', Operator),
            (r'[{}()\[\],.;]', Punctuation),
            (r'[+\-*/%&|<>^!~@=:?]', Operator),

            # Identifiers
            (r'[a-zA-Z_]\w*', Name),
            # Raw identifiers
            (r'r#[a-zA-Z_]\w*', Name),

            # Attributes
            (r'#!?\[', Comment.Preproc, 'attribute['),

            # Misc
            # Lone hashes: not used in Rust syntax, but allowed in macro
            # arguments, most famously for quote::quote!()
            (r'#', Punctuation),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'doccomment': [
            (r'[^*/]+', String.Doc),
            (r'/\*', String.Doc, '#push'),
            (r'\*/', String.Doc, '#pop'),
            (r'[*/]', String.Doc),
        ],
        'modname': [
            (r'\s+', Whitespace),
            (r'[a-zA-Z_]\w*', Name.Namespace, '#pop'),
            default('#pop'),
        ],
        'funcname': [
            (r'\s+', Whitespace),
            (r'[a-zA-Z_]\w*', Name.Function, '#pop'),
            default('#pop'),
        ],
        'typename': [
            (r'\s+', Whitespace),
            (r'&', Keyword.Pseudo),
            (r"'", Operator, 'lifetime'),
            builtin_funcs_types,
            keyword_types,
            (r'[a-zA-Z_]\w*', Name.Class, '#pop'),
            default('#pop'),
        ],
        'lifetime': [
            (r"(static|_)", Name.Builtin),
            (r"[a-zA-Z_]+\w*", Name.Attribute),
            default('#pop'),
        ],
        'number_lit': [
            (r'[ui](8|16|32|64|size)', Keyword, '#pop'),
            (r'f(32|64)', Keyword, '#pop'),
            default('#pop'),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r"""\\['"\\nrt]|\\x[0-7][0-9a-fA-F]|\\0"""
             r"""|\\u\{[0-9a-fA-F]{1,6}\}""", String.Escape),
            (r'[^\\"]+', String),
            (r'\\', String),
        ],
        'bytestring': [
            (r"""\\x[89a-fA-F][0-9a-fA-F]""", String.Escape),
            include('string'),
        ],
        'attribute_common': [
            (r'"', String, 'string'),
            (r'\[', Comment.Preproc, 'attribute['),
        ],
        'attribute[': [
            include('attribute_common'),
            (r'\]', Comment.Preproc, '#pop'),
            (r'[^"\]\[]+', Comment.Preproc),
        ],
    }
