"""
    pygments.lexers.css
    ~~~~~~~~~~~~~~~~~~~

    Lexers for CSS and related stylesheet formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re
import copy

from erdos.erdos._vendor.pygments.lexer import ExtendedRegexLexer, RegexLexer, include, bygroups, \
    default, words, inherit
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, \
    Punctuation, Whitespace
from erdos.erdos._vendor.pygments.lexers._css_builtins import _css_properties

__all__ = ['CssLexer', 'SassLexer', 'ScssLexer', 'LessCssLexer']


# List of vendor prefixes obtained from:
# https://www.w3.org/TR/CSS21/syndata.html#vendor-keyword-history
_vendor_prefixes = (
    '-ms-', 'mso-', '-moz-', '-o-', '-xv-', '-atsc-', '-wap-', '-khtml-',
    '-webkit-', 'prince-', '-ah-', '-hp-', '-ro-', '-rim-', '-tc-',
)

# List of extended color keywords obtained from:
# https://drafts.csswg.org/css-color/#named-colors
_color_keywords = (
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige',
    'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
    'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
    'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
    'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
    'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
    'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
    'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
    'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
    'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
    'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
    'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue',
    'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow',
    'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
    'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
    'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
    'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
    'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
    'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum',
    'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue',
    'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
    'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
    'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise',
    'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
) + ('transparent',)

# List of keyword values obtained from:
# http://cssvalues.com/
_keyword_values = (
    'absolute', 'alias', 'all', 'all-petite-caps', 'all-scroll',
    'all-small-caps', 'allow-end', 'alpha', 'alternate', 'alternate-reverse',
    'always', 'armenian', 'auto', 'avoid', 'avoid-column', 'avoid-page',
    'backwards', 'balance', 'baseline', 'below', 'blink', 'block', 'bold',
    'bolder', 'border-box', 'both', 'bottom', 'box-decoration', 'break-word',
    'capitalize', 'cell', 'center', 'circle', 'clip', 'clone', 'close-quote',
    'col-resize', 'collapse', 'color', 'color-burn', 'color-dodge', 'column',
    'column-reverse', 'compact', 'condensed', 'contain', 'container',
    'content-box', 'context-menu', 'copy', 'cover', 'crisp-edges', 'crosshair',
    'currentColor', 'cursive', 'darken', 'dashed', 'decimal',
    'decimal-leading-zero', 'default', 'descendants', 'difference', 'digits',
    'disc', 'distribute', 'dot', 'dotted', 'double', 'double-circle', 'e-resize',
    'each-line', 'ease', 'ease-in', 'ease-in-out', 'ease-out', 'edges',
    'ellipsis', 'end', 'ew-resize', 'exclusion', 'expanded', 'extra-condensed',
    'extra-expanded', 'fantasy', 'fill', 'fill-box', 'filled', 'first', 'fixed',
    'flat', 'flex', 'flex-end', 'flex-start', 'flip', 'force-end', 'forwards',
    'from-image', 'full-width', 'geometricPrecision', 'georgian', 'groove',
    'hanging', 'hard-light', 'help', 'hidden', 'hide', 'horizontal', 'hue',
    'icon', 'infinite', 'inherit', 'initial', 'ink', 'inline', 'inline-block',
    'inline-flex', 'inline-table', 'inset', 'inside', 'inter-word', 'invert',
    'isolate', 'italic', 'justify', 'large', 'larger', 'last', 'left',
    'lighten', 'lighter', 'line-through', 'linear', 'list-item', 'local',
    'loose', 'lower-alpha', 'lower-greek', 'lower-latin', 'lower-roman',
    'lowercase', 'ltr', 'luminance', 'luminosity', 'mandatory', 'manipulation',
    'manual', 'margin-box', 'match-parent', 'medium', 'mixed', 'monospace',
    'move', 'multiply', 'n-resize', 'ne-resize', 'nesw-resize',
    'no-close-quote', 'no-drop', 'no-open-quote', 'no-repeat', 'none', 'normal',
    'not-allowed', 'nowrap', 'ns-resize', 'nw-resize', 'nwse-resize', 'objects',
    'oblique', 'off', 'on', 'open', 'open-quote', 'optimizeLegibility',
    'optimizeSpeed', 'outset', 'outside', 'over', 'overlay', 'overline',
    'padding-box', 'page', 'pan-down', 'pan-left', 'pan-right', 'pan-up',
    'pan-x', 'pan-y', 'paused', 'petite-caps', 'pixelated', 'pointer',
    'preserve-3d', 'progress', 'proximity', 'relative', 'repeat',
    'repeat no-repeat', 'repeat-x', 'repeat-y', 'reverse', 'revert', 'ridge', 'right',
    'round', 'row', 'row-resize', 'row-reverse', 'rtl', 'ruby', 'ruby-base',
    'ruby-base-container', 'ruby-text', 'ruby-text-container', 'run-in',
    'running', 's-resize', 'sans-serif', 'saturation', 'scale-down', 'screen',
    'scroll', 'se-resize', 'semi-condensed', 'semi-expanded', 'separate',
    'serif', 'sesame', 'show', 'sideways', 'sideways-left', 'sideways-right',
    'slice', 'small', 'small-caps', 'smaller', 'smooth', 'snap', 'soft-light',
    'solid', 'space', 'space-around', 'space-between', 'spaces', 'square',
    'start', 'static', 'step-end', 'step-start', 'sticky', 'stretch', 'strict',
    'stroke-box', 'style', 'sw-resize', 'table', 'table-caption', 'table-cell',
    'table-column', 'table-column-group', 'table-footer-group',
    'table-header-group', 'table-row', 'table-row-group', 'text', 'thick',
    'thin', 'titling-caps', 'to', 'top', 'triangle', 'ultra-condensed',
    'ultra-expanded', 'under', 'underline', 'unicase', 'unset', 'upper-alpha',
    'upper-latin', 'upper-roman', 'uppercase', 'upright', 'use-glyph-orientation',
    'vertical', 'vertical-text', 'view-box', 'visible', 'w-resize', 'wait',
    'wavy', 'weight', 'weight style', 'wrap', 'wrap-reverse', 'x-large',
    'x-small', 'xx-large', 'xx-small', 'zoom-in', 'zoom-out',
)

# List of other keyword values from other sources:
_other_keyword_values = (
    'above', 'aural', 'behind', 'bidi-override', 'center-left', 'center-right',
    'cjk-ideographic', 'continuous', 'crop', 'cross', 'embed', 'far-left',
    'far-right', 'fast', 'faster', 'hebrew', 'high', 'higher', 'hiragana',
    'hiragana-iroha', 'katakana', 'katakana-iroha', 'landscape', 'left-side',
    'leftwards', 'level', 'loud', 'low', 'lower', 'message-box', 'middle',
    'mix', 'narrower', 'once', 'portrait', 'right-side', 'rightwards', 'silent',
    'slow', 'slower', 'small-caption', 'soft', 'spell-out', 'status-bar',
    'super', 'text-bottom', 'text-top', 'wider', 'x-fast', 'x-high', 'x-loud',
    'x-low', 'x-soft', 'yes', 'pre', 'pre-wrap', 'pre-line',
)

# List of functional notation and function keyword values:
_functional_notation_keyword_values = (
    'attr', 'blackness', 'blend', 'blenda', 'blur', 'brightness', 'calc',
    'circle', 'color-mod', 'contrast', 'counter', 'cubic-bezier', 'device-cmyk',
    'drop-shadow', 'ellipse', 'gray', 'grayscale', 'hsl', 'hsla', 'hue',
    'hue-rotate', 'hwb', 'image', 'inset', 'invert', 'lightness',
    'linear-gradient', 'matrix', 'matrix3d', 'opacity', 'perspective',
    'polygon', 'radial-gradient', 'rect', 'repeating-linear-gradient',
    'repeating-radial-gradient', 'rgb', 'rgba', 'rotate', 'rotate3d', 'rotateX',
    'rotateY', 'rotateZ', 'saturate', 'saturation', 'scale', 'scale3d',
    'scaleX', 'scaleY', 'scaleZ', 'sepia', 'shade', 'skewX', 'skewY', 'steps',
    'tint', 'toggle', 'translate', 'translate3d', 'translateX', 'translateY',
    'translateZ', 'whiteness',
)
# Note! Handle url(...) separately.

# List of units obtained from:
# https://www.w3.org/TR/css3-values/
_angle_units = (
    'deg', 'grad', 'rad', 'turn',
)
_frequency_units = (
    'Hz', 'kHz',
)
_length_units = (
    'em', 'ex', 'ch', 'rem',
    'vh', 'vw', 'vmin', 'vmax',
    'px', 'mm', 'cm', 'in', 'pt', 'pc', 'q',
)
_resolution_units = (
    'dpi', 'dpcm', 'dppx',
)
_time_units = (
    's', 'ms',
)
_all_units = _angle_units + _frequency_units + _length_units + \
    _resolution_units + _time_units


class CssLexer(RegexLexer):
    """
    For CSS (Cascading Style Sheets).
    """

    name = 'CSS'
    url = 'https://www.w3.org/TR/CSS/#css'
    aliases = ['css']
    filenames = ['*.css']
    mimetypes = ['text/css']
    version_added = ''

    tokens = {
        'root': [
            include('basics'),
        ],
        'basics': [
            (r'\s+', Whitespace),
            (r'/\*(?:.|\n)*?\*/', Comment),
            (r'\{', Punctuation, 'content'),
            (r'(\:{1,2})([\w-]+)', bygroups(Punctuation, Name.Decorator)),
            (r'(\.)([\w-]+)', bygroups(Punctuation, Name.Class)),
            (r'(\#)([\w-]+)', bygroups(Punctuation, Name.Namespace)),
            (r'(@)([\w-]+)', bygroups(Punctuation, Keyword), 'atrule'),
            (r'[\w-]+', Name.Tag),
            (r'[~^*!%&$\[\]()<>|+=@:;,./?-]', Operator),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
        ],
        'atrule': [
            (r'\{', Punctuation, 'atcontent'),
            (r';', Punctuation, '#pop'),
            include('basics'),
        ],
        'atcontent': [
            include('basics'),
            (r'\}', Punctuation, '#pop:2'),
        ],
        'content': [
            (r'\s+', Whitespace),
            (r'\}', Punctuation, '#pop'),
            (r';', Punctuation),
            (r'^@.*?$', Comment.Preproc),

            (words(_vendor_prefixes,), Keyword.Pseudo),
            (r'('+r'|'.join(_css_properties)+r')(\s*)(\:)',
             bygroups(Keyword, Whitespace, Punctuation), 'value-start'),
            (r'([-]+[a-zA-Z_][\w-]*)(\s*)(\:)', bygroups(Name.Variable, Whitespace, Punctuation),
             'value-start'),
            (r'([a-zA-Z_][\w-]*)(\s*)(\:)', bygroups(Name, Whitespace, Punctuation),
             'value-start'),

            (r'/\*(?:.|\n)*?\*/', Comment),
        ],
        'value-start': [
            (r'\s+', Whitespace),
            (words(_vendor_prefixes,), Name.Builtin.Pseudo),
            include('urls'),
            (r'('+r'|'.join(_functional_notation_keyword_values)+r')(\()',
             bygroups(Name.Builtin, Punctuation), 'function-start'),
            (r'([a-zA-Z_][\w-]+)(\()',
             bygroups(Name.Function, Punctuation), 'function-start'),
            (words(_keyword_values, suffix=r'\b'), Keyword.Constant),
            (words(_other_keyword_values, suffix=r'\b'), Keyword.Constant),
            (words(_color_keywords, suffix=r'\b'), Keyword.Constant),
            # for transition-property etc.
            (words(_css_properties, suffix=r'\b'), Keyword),
            (r'\!important', Comment.Preproc),
            (r'/\*(?:.|\n)*?\*/', Comment),

            include('numeric-values'),

            (r'[~^*!%&<>|+=@:./?-]+', Operator),
            (r'[\[\](),]+', Punctuation),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'[a-zA-Z_][\w-]*', Name),
            (r';', Punctuation, '#pop'),
            (r'\}', Punctuation, '#pop:2'),
        ],
        'function-start': [
            (r'\s+', Whitespace),
            (r'[-]+([A-Za-z][\w+]*[-]*)+', Name.Variable),
            include('urls'),
            (words(_vendor_prefixes,), Keyword.Pseudo),
            (words(_keyword_values, suffix=r'\b'), Keyword.Constant),
            (words(_other_keyword_values, suffix=r'\b'), Keyword.Constant),
            (words(_color_keywords, suffix=r'\b'), Keyword.Constant),

            # function-start may be entered recursively
            (r'(' + r'|'.join(_functional_notation_keyword_values) + r')(\()',
             bygroups(Name.Builtin, Punctuation), 'function-start'),
            (r'([a-zA-Z_][\w-]+)(\()',
             bygroups(Name.Function, Punctuation), 'function-start'),

            (r'/\*(?:.|\n)*?\*/', Comment),
            include('numeric-values'),
            (r'[*+/-]', Operator),
            (r',', Punctuation),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'[a-zA-Z_-]\w*', Name),
            (r'\)', Punctuation, '#pop'),
        ],
        'urls': [
            (r'(url)(\()(".*?")(\))', bygroups(Name.Builtin, Punctuation,
                                               String.Double, Punctuation)),
            (r"(url)(\()('.*?')(\))", bygroups(Name.Builtin, Punctuation,
                                               String.Single, Punctuation)),
            (r'(url)(\()(.*?)(\))', bygroups(Name.Builtin, Punctuation,
                                             String.Other, Punctuation)),
        ],
        'numeric-values': [
            (r'\#[a-zA-Z0-9]{1,6}', Number.Hex),
            (r'[+\-]?[0-9]*[.][0-9]+', Number.Float, 'numeric-end'),
            (r'[+\-]?[0-9]+', Number.Integer, 'numeric-end'),
        ],
        'numeric-end': [
            (words(_all_units, suffix=r'\b'), Keyword.Type),
            (r'%', Keyword.Type),
            default('#pop'),
        ],
    }


common_sass_tokens = {
    'value': [
        (r'[ \t]+', Whitespace),
        (r'[!$][\w-]+', Name.Variable),
        (r'url\(', String.Other, 'string-url'),
        (r'[a-z_-][\w-]*(?=\()', Name.Function),
        (words(_css_properties + (
            'above', 'absolute', 'always', 'armenian', 'aural', 'auto', 'avoid', 'baseline',
            'behind', 'below', 'bidi-override', 'blink', 'block', 'bold', 'bolder', 'both',
            'capitalize', 'center-left', 'center-right', 'center', 'circle',
            'cjk-ideographic', 'close-quote', 'collapse', 'condensed', 'continuous',
            'crosshair', 'cross', 'cursive', 'dashed', 'decimal-leading-zero',
            'decimal', 'default', 'digits', 'disc', 'dotted', 'double', 'e-resize', 'embed',
            'extra-condensed', 'extra-expanded', 'expanded', 'fantasy', 'far-left',
            'far-right', 'faster', 'fast', 'fixed', 'georgian', 'groove', 'hebrew', 'help',
            'hidden', 'hide', 'higher', 'high', 'hiragana-iroha', 'hiragana', 'icon',
            'inherit', 'inline-table', 'inline', 'inset', 'inside', 'invert', 'italic',
            'justify', 'katakana-iroha', 'katakana', 'landscape', 'larger', 'large',
            'left-side', 'leftwards', 'level', 'lighter', 'line-through', 'list-item',
            'loud', 'lower-alpha', 'lower-greek', 'lower-roman', 'lowercase', 'ltr',
            'lower', 'low', 'medium', 'message-box', 'middle', 'mix', 'monospace',
            'n-resize', 'narrower', 'ne-resize', 'no-close-quote', 'no-open-quote',
            'no-repeat', 'none', 'normal', 'nowrap', 'nw-resize', 'oblique', 'once',
            'open-quote', 'outset', 'outside', 'overline', 'pointer', 'portrait', 'px',
            'relative', 'repeat-x', 'repeat-y', 'repeat', 'rgb', 'ridge', 'right-side',
            'rightwards', 's-resize', 'sans-serif', 'scroll', 'se-resize',
            'semi-condensed', 'semi-expanded', 'separate', 'serif', 'show', 'silent',
            'slow', 'slower', 'small-caps', 'small-caption', 'smaller', 'soft', 'solid',
            'spell-out', 'square', 'static', 'status-bar', 'super', 'sw-resize',
            'table-caption', 'table-cell', 'table-column', 'table-column-group',
            'table-footer-group', 'table-header-group', 'table-row',
            'table-row-group', 'text', 'text-bottom', 'text-top', 'thick', 'thin',
            'transparent', 'ultra-condensed', 'ultra-expanded', 'underline',
            'upper-alpha', 'upper-latin', 'upper-roman', 'uppercase', 'url',
            'visible', 'w-resize', 'wait', 'wider', 'x-fast', 'x-high', 'x-large', 'x-loud',
            'x-low', 'x-small', 'x-soft', 'xx-large', 'xx-small', 'yes'), suffix=r'\b'),
         Name.Constant),
        (words(_color_keywords, suffix=r'\b'), Name.Entity),
        (words((
            'black', 'silver', 'gray', 'white', 'maroon', 'red', 'purple', 'fuchsia', 'green',
            'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua'), suffix=r'\b'),
         Name.Builtin),
        (r'\!(important|default)', Name.Exception),
        (r'(true|false)', Name.Pseudo),
        (r'(and|or|not)', Operator.Word),
        (r'/\*', Comment.Multiline, 'inline-comment'),
        (r'//[^\n]*', Comment.Single),
        (r'\#[a-z0-9]{1,6}', Number.Hex),
        (r'(-?\d+)(\%|[a-z]+)?', bygroups(Number.Integer, Keyword.Type)),
        (r'(-?\d*\.\d+)(\%|[a-z]+)?', bygroups(Number.Float, Keyword.Type)),
        (r'#\{', String.Interpol, 'interpolation'),
        (r'[~^*!&%<>|+=@:,./?-]+', Operator),
        (r'[\[\]()]+', Punctuation),
        (r'"', String.Double, 'string-double'),
        (r"'", String.Single, 'string-single'),
        (r'[a-z_-][\w-]*', Name),
    ],

    'interpolation': [
        (r'\}', String.Interpol, '#pop'),
        include('value'),
    ],

    'selector': [
        (r'[ \t]+', Whitespace),
        (r'\:', Name.Decorator, 'pseudo-class'),
        (r'\.', Name.Class, 'class'),
        (r'\#', Name.Namespace, 'id'),
        (r'[\w-]+', Name.Tag),
        (r'#\{', String.Interpol, 'interpolation'),
        (r'&', Keyword),
        (r'[~^*!&\[\]()<>|+=@:;,./?-]', Operator),
        (r'"', String.Double, 'string-double'),
        (r"'", String.Single, 'string-single'),
    ],

    'string-double': [
        (r'(\\.|#(?=[^\n{])|[^\n"#])+', String.Double),
        (r'#\{', String.Interpol, 'interpolation'),
        (r'"', String.Double, '#pop'),
    ],

    'string-single': [
        (r"(\\.|#(?=[^\n{])|[^\n'#])+", String.Single),
        (r'#\{', String.Interpol, 'interpolation'),
        (r"'", String.Single, '#pop'),
    ],

    'string-url': [
        (r'(\\#|#(?=[^\n{])|[^\n#)])+', String.Other),
        (r'#\{', String.Interpol, 'interpolation'),
        (r'\)', String.Other, '#pop'),
    ],

    'pseudo-class': [
        (r'[\w-]+', Name.Decorator),
        (r'#\{', String.Interpol, 'interpolation'),
        default('#pop'),
    ],

    'class': [
        (r'[\w-]+', Name.Class),
        (r'#\{', String.Interpol, 'interpolation'),
        default('#pop'),
    ],

    'id': [
        (r'[\w-]+', Name.Namespace),
        (r'#\{', String.Interpol, 'interpolation'),
        default('#pop'),
    ],

    'for': [
        (r'(from|to|through)', Operator.Word),
        include('value'),
    ],
}


def _indentation(lexer, match, ctx):
    indentation = match.group(0)
    yield match.start(), Whitespace, indentation
    ctx.last_indentation = indentation
    ctx.pos = match.end()

    if hasattr(ctx, 'block_state') and ctx.block_state and \
            indentation.startswith(ctx.block_indentation) and \
            indentation != ctx.block_indentation:
        ctx.stack.append(ctx.block_state)
    else:
        ctx.block_state = None
        ctx.block_indentation = None
        ctx.stack.append('content')


def _starts_block(token, state):
    def callback(lexer, match, ctx):
        yield match.start(), token, match.group(0)

        if hasattr(ctx, 'last_indentation'):
            ctx.block_indentation = ctx.last_indentation
        else:
            ctx.block_indentation = ''

        ctx.block_state = state
        ctx.pos = match.end()

    return callback


class SassLexer(ExtendedRegexLexer):
    """
    For Sass stylesheets.
    """

    name = 'Sass'
    url = 'https://sass-lang.com/'
    aliases = ['sass']
    filenames = ['*.sass']
    mimetypes = ['text/x-sass']
    version_added = '1.3'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'root': [
            (r'[ \t]*\n', Whitespace),
            (r'[ \t]*', _indentation),
        ],

        'content': [
            (r'//[^\n]*', _starts_block(Comment.Single, 'single-comment'),
             'root'),
            (r'/\*[^\n]*', _starts_block(Comment.Multiline, 'multi-comment'),
             'root'),
            (r'@import', Keyword, 'import'),
            (r'@for', Keyword, 'for'),
            (r'@(debug|warn|if|while)', Keyword, 'value'),
            (r'(@mixin)( )([\w-]+)', bygroups(Keyword, Whitespace, Name.Function), 'value'),
            (r'(@include)( )([\w-]+)', bygroups(Keyword, Whitespace, Name.Decorator), 'value'),
            (r'@extend', Keyword, 'selector'),
            (r'@[\w-]+', Keyword, 'selector'),
            (r'=[\w-]+', Name.Function, 'value'),
            (r'\+[\w-]+', Name.Decorator, 'value'),
            (r'([!$][\w-]\w*)([ \t]*(?:(?:\|\|)?=|:))',
             bygroups(Name.Variable, Operator), 'value'),
            (r':', Name.Attribute, 'old-style-attr'),
            (r'(?=.+?[=:]([^a-z]|$))', Name.Attribute, 'new-style-attr'),
            default('selector'),
        ],

        'single-comment': [
            (r'.+', Comment.Single),
            (r'\n', Whitespace, 'root'),
        ],

        'multi-comment': [
            (r'.+', Comment.Multiline),
            (r'\n', Whitespace, 'root'),
        ],

        'import': [
            (r'[ \t]+', Whitespace),
            (r'\S+', String),
            (r'\n', Whitespace, 'root'),
        ],

        'old-style-attr': [
            (r'[^\s:="\[]+', Name.Attribute),
            (r'#\{', String.Interpol, 'interpolation'),
            (r'([ \t]*)(=)', bygroups(Whitespace, Operator), 'value'),
            default('value'),
        ],

        'new-style-attr': [
            (r'[^\s:="\[]+', Name.Attribute),
            (r'#\{', String.Interpol, 'interpolation'),
            (r'([ \t]*)([=:])', bygroups(Whitespace, Operator), 'value'),
        ],

        'inline-comment': [
            (r"(\\#|#(?=[^\n{])|\*(?=[^\n/])|[^\n#*])+", Comment.Multiline),
            (r'#\{', String.Interpol, 'interpolation'),
            (r"\*/", Comment, '#pop'),
        ],
    }
    for group, common in common_sass_tokens.items():
        tokens[group] = copy.copy(common)
    tokens['value'].append((r'\n', Whitespace, 'root'))
    tokens['selector'].append((r'\n', Whitespace, 'root'))


class ScssLexer(RegexLexer):
    """
    For SCSS stylesheets.
    """

    name = 'SCSS'
    url = 'https://sass-lang.com/'
    aliases = ['scss']
    filenames = ['*.scss']
    mimetypes = ['text/x-scss']
    version_added = ''

    flags = re.IGNORECASE | re.DOTALL
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'//.*?\n', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'@import', Keyword, 'value'),
            (r'@for', Keyword, 'for'),
            (r'@(debug|warn|if|while)', Keyword, 'value'),
            (r'(@mixin)( [\w-]+)', bygroups(Keyword, Name.Function), 'value'),
            (r'(@include)( [\w-]+)', bygroups(Keyword, Name.Decorator), 'value'),
            (r'@extend', Keyword, 'selector'),
            (r'(@media)(\s+)', bygroups(Keyword, Whitespace), 'value'),
            (r'@[\w-]+', Keyword, 'selector'),
            (r'(\$[\w-]*\w)([ \t]*:)', bygroups(Name.Variable, Operator), 'value'),
            # TODO: broken, and prone to infinite loops.
            # (r'(?=[^;{}][;}])', Name.Attribute, 'attr'),
            # (r'(?=[^;{}:]+:[^a-z])', Name.Attribute, 'attr'),
            default('selector'),
        ],

        'attr': [
            (r'[^\s:="\[]+', Name.Attribute),
            (r'#\{', String.Interpol, 'interpolation'),
            (r'[ \t]*:', Operator, 'value'),
            default('#pop'),
        ],

        'inline-comment': [
            (r"(\\#|#(?=[^{])|\*(?=[^/])|[^#*])+", Comment.Multiline),
            (r'#\{', String.Interpol, 'interpolation'),
            (r"\*/", Comment, '#pop'),
        ],
    }
    for group, common in common_sass_tokens.items():
        tokens[group] = copy.copy(common)
    tokens['value'].extend([(r'\n', Whitespace), (r'[;{}]', Punctuation, '#pop')])
    tokens['selector'].extend([(r'\n', Whitespace), (r'[;{}]', Punctuation, '#pop')])


class LessCssLexer(CssLexer):
    """
    For LESS styleshets.
    """

    name = 'LessCss'
    url = 'http://lesscss.org/'
    aliases = ['less']
    filenames = ['*.less']
    mimetypes = ['text/x-less-css']
    version_added = '2.1'

    tokens = {
        'root': [
            (r'@\w+', Name.Variable),
            inherit,
        ],
        'content': [
            (r'\{', Punctuation, '#push'),
            (r'//.*\n', Comment.Single),
            inherit,
        ],
    }
