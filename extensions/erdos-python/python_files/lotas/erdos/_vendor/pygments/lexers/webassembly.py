"""
    pygments.lexers.webassembly
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the WebAssembly text format.

    The grammar can be found at https://github.com/WebAssembly/spec/blob/master/interpreter/README.md
    and https://webassembly.github.io/spec/core/text/.


    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words, bygroups, default
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, String, Number, Punctuation, Name

__all__ = ['WatLexer']

keywords = (
    'module', 'import', 'func', 'funcref', 'start', 'param', 'local', 'type',
    'result', 'export', 'memory', 'global', 'mut', 'data', 'table', 'elem',
    'if', 'then', 'else', 'end', 'block', 'loop'
)

builtins = (
    'unreachable', 'nop', 'block', 'loop', 'if', 'else', 'end', 'br', 'br_if',
    'br_table', 'return', 'call', 'call_indirect', 'drop', 'select',
    'local.get', 'local.set', 'local.tee', 'global.get', 'global.set',
    'i32.load', 'i64.load', 'f32.load', 'f64.load', 'i32.load8_s',
    'i32.load8_u', 'i32.load16_s', 'i32.load16_u', 'i64.load8_s',
    'i64.load8_u', 'i64.load16_s', 'i64.load16_u', 'i64.load32_s',
    'i64.load32_u', 'i32.store', 'i64.store', 'f32.store', 'f64.store',
    'i32.store8', 'i32.store16', 'i64.store8', 'i64.store16', 'i64.store32',
    'memory.size', 'memory.grow', 'i32.const', 'i64.const', 'f32.const',
    'f64.const', 'i32.eqz', 'i32.eq', 'i32.ne', 'i32.lt_s', 'i32.lt_u',
    'i32.gt_s', 'i32.gt_u', 'i32.le_s', 'i32.le_u', 'i32.ge_s', 'i32.ge_u',
    'i64.eqz', 'i64.eq', 'i64.ne', 'i64.lt_s', 'i64.lt_u', 'i64.gt_s',
    'i64.gt_u', 'i64.le_s', 'i64.le_u', 'i64.ge_s', 'i64.ge_u', 'f32.eq',
    'f32.ne', 'f32.lt', 'f32.gt', 'f32.le', 'f32.ge', 'f64.eq', 'f64.ne',
    'f64.lt', 'f64.gt', 'f64.le', 'f64.ge', 'i32.clz', 'i32.ctz', 'i32.popcnt',
    'i32.add', 'i32.sub', 'i32.mul', 'i32.div_s', 'i32.div_u', 'i32.rem_s',
    'i32.rem_u', 'i32.and', 'i32.or', 'i32.xor', 'i32.shl', 'i32.shr_s',
    'i32.shr_u', 'i32.rotl', 'i32.rotr', 'i64.clz', 'i64.ctz', 'i64.popcnt',
    'i64.add', 'i64.sub', 'i64.mul', 'i64.div_s', 'i64.div_u', 'i64.rem_s',
    'i64.rem_u', 'i64.and', 'i64.or', 'i64.xor', 'i64.shl', 'i64.shr_s',
    'i64.shr_u', 'i64.rotl', 'i64.rotr', 'f32.abs', 'f32.neg', 'f32.ceil',
    'f32.floor', 'f32.trunc', 'f32.nearest', 'f32.sqrt', 'f32.add', 'f32.sub',
    'f32.mul', 'f32.div', 'f32.min', 'f32.max', 'f32.copysign', 'f64.abs',
    'f64.neg', 'f64.ceil', 'f64.floor', 'f64.trunc', 'f64.nearest', 'f64.sqrt',
    'f64.add', 'f64.sub', 'f64.mul', 'f64.div', 'f64.min', 'f64.max',
    'f64.copysign', 'i32.wrap_i64', 'i32.trunc_f32_s', 'i32.trunc_f32_u',
    'i32.trunc_f64_s', 'i32.trunc_f64_u', 'i64.extend_i32_s',
    'i64.extend_i32_u', 'i64.trunc_f32_s', 'i64.trunc_f32_u',
    'i64.trunc_f64_s', 'i64.trunc_f64_u', 'f32.convert_i32_s',
    'f32.convert_i32_u', 'f32.convert_i64_s', 'f32.convert_i64_u',
    'f32.demote_f64', 'f64.convert_i32_s', 'f64.convert_i32_u',
    'f64.convert_i64_s', 'f64.convert_i64_u', 'f64.promote_f32',
    'i32.reinterpret_f32', 'i64.reinterpret_f64', 'f32.reinterpret_i32',
    'f64.reinterpret_i64',
)


class WatLexer(RegexLexer):
    """Lexer for the WebAssembly text format.
    """

    name = 'WebAssembly'
    url = 'https://webassembly.org/'
    aliases = ['wast', 'wat']
    filenames = ['*.wat', '*.wast']
    version_added = '2.9'

    tokens = {
        'root': [
            (words(keywords, suffix=r'(?=[^a-z_\.])'), Keyword),
            (words(builtins), Name.Builtin, 'arguments'),
            (words(['i32', 'i64', 'f32', 'f64']), Keyword.Type),
            (r'\$[A-Za-z0-9!#$%&\'*+./:<=>?@\\^_`|~-]+', Name.Variable), # yes, all of the are valid in identifiers
            (r';;.*?$', Comment.Single),
            (r'\(;', Comment.Multiline, 'nesting_comment'),
            (r'[+-]?0x[\dA-Fa-f](_?[\dA-Fa-f])*(.([\dA-Fa-f](_?[\dA-Fa-f])*)?)?([pP][+-]?[\dA-Fa-f](_?[\dA-Fa-f])*)?', Number.Float),
            (r'[+-]?\d.\d(_?\d)*[eE][+-]?\d(_?\d)*', Number.Float),
            (r'[+-]?\d.\d(_?\d)*', Number.Float),
            (r'[+-]?\d.[eE][+-]?\d(_?\d)*', Number.Float),
            (r'[+-]?(inf|nan:0x[\dA-Fa-f](_?[\dA-Fa-f])*|nan)', Number.Float),
            (r'[+-]?0x[\dA-Fa-f](_?[\dA-Fa-f])*', Number.Hex),
            (r'[+-]?\d(_?\d)*', Number.Integer),
            (r'[\(\)]', Punctuation),
            (r'"', String.Double, 'string'),
            (r'\s+', Text),
        ],
        'nesting_comment': [
            (r'\(;', Comment.Multiline, '#push'),
            (r';\)', Comment.Multiline, '#pop'),
            (r'[^;(]+', Comment.Multiline),
            (r'[;(]', Comment.Multiline),
        ],
        'string': [
            (r'\\[\dA-Fa-f][\dA-Fa-f]', String.Escape), # must have exactly two hex digits
            (r'\\t', String.Escape),
            (r'\\n', String.Escape),
            (r'\\r', String.Escape),
            (r'\\"', String.Escape),
            (r"\\'", String.Escape),
            (r'\\u\{[\dA-Fa-f](_?[\dA-Fa-f])*\}', String.Escape),
            (r'\\\\', String.Escape),
            (r'"', String.Double, '#pop'),
            (r'[^"\\]+', String.Double),
        ],
        'arguments': [
            (r'\s+', Text),
            (r'(offset)(=)(0x[\dA-Fa-f](_?[\dA-Fa-f])*)', bygroups(Keyword, Operator, Number.Hex)),
            (r'(offset)(=)(\d(_?\d)*)', bygroups(Keyword, Operator, Number.Integer)),
            (r'(align)(=)(0x[\dA-Fa-f](_?[\dA-Fa-f])*)', bygroups(Keyword, Operator, Number.Hex)),
            (r'(align)(=)(\d(_?\d)*)', bygroups(Keyword, Operator, Number.Integer)),
            default('#pop'),
        ]
    }
