"""
    pygments.lexers.javascript
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for JavaScript and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import bygroups, combined, default, do_insertions, include, \
    inherit, Lexer, RegexLexer, this, using, words, line_re
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Other, Generic, Whitespace
from lotas.erdos._vendor.pygments.util import get_bool_opt
import lotas.erdos._vendor.pygments.unistring as uni

__all__ = ['JavascriptLexer', 'KalLexer', 'LiveScriptLexer', 'DartLexer',
           'TypeScriptLexer', 'LassoLexer', 'ObjectiveJLexer',
           'CoffeeScriptLexer', 'MaskLexer', 'EarlGreyLexer', 'JuttleLexer',
           'NodeConsoleLexer']

JS_IDENT_START = ('(?:[$_' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl') +
                  ']|\\\\u[a-fA-F0-9]{4})')
JS_IDENT_PART = ('(?:[$' + uni.combine('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl',
                                       'Mn', 'Mc', 'Nd', 'Pc') +
                 '\u200c\u200d]|\\\\u[a-fA-F0-9]{4})')
JS_IDENT = JS_IDENT_START + '(?:' + JS_IDENT_PART + ')*'


class JavascriptLexer(RegexLexer):
    """
    For JavaScript source code.
    """

    name = 'JavaScript'
    url = 'https://www.ecma-international.org/publications-and-standards/standards/ecma-262/'
    aliases = ['javascript', 'js']
    filenames = ['*.js', '*.jsm', '*.mjs', '*.cjs']
    mimetypes = ['application/javascript', 'application/x-javascript',
                 'text/x-javascript', 'text/javascript']
    version_added = ''

    flags = re.DOTALL | re.MULTILINE

    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Whitespace),
            (r'<!--', Comment),
            (r'//.*?$', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline)
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gimuysd]+\b|\B)', String.Regex, '#pop'),
            (r'(?=/)', Text, ('#pop', 'badregex')),
            default('#pop')
        ],
        'badregex': [
            (r'\n', Whitespace, '#pop')
        ],
        'root': [
            (r'\A#! ?/.*?$', Comment.Hashbang),  # recognized by node.js
            (r'^(?=\s|/|<!--)', Text, 'slashstartsregex'),
            include('commentsandwhitespace'),

            # Numeric literals
            (r'0[bB][01]+n?', Number.Bin),
            (r'0[oO]?[0-7]+n?', Number.Oct),  # Browsers support "0o7" and "07" (< ES5) notations
            (r'0[xX][0-9a-fA-F]+n?', Number.Hex),
            (r'[0-9]+n', Number.Integer),  # Javascript BigInt requires an "n" postfix
            # Javascript doesn't have actual integer literals, so every other
            # numeric literal is handled by the regex below (including "normal")
            # integers
            (r'(\.[0-9]+|[0-9]+\.[0-9]*|[0-9]+)([eE][-+]?[0-9]+)?', Number.Float),

            (r'\.\.\.|=>', Punctuation),
            (r'\+\+|--|~|\?\?=?|\?|:|\\(?=\n)|'
             r'(<<|>>>?|==?|!=?|(?:\*\*|\|\||&&|[-<>+*%&|^/]))=?', Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),

            (r'(typeof|instanceof|in|void|delete|new)\b', Operator.Word, 'slashstartsregex'),

            # Match stuff like: constructor
            (r'\b(constructor|from|as)\b', Keyword.Reserved),

            (r'(for|in|while|do|break|return|continue|switch|case|default|if|else|'
             r'throw|try|catch|finally|yield|await|async|this|of|static|export|'
             r'import|debugger|extends|super)\b', Keyword, 'slashstartsregex'),
            (r'(var|let|const|with|function|class)\b', Keyword.Declaration, 'slashstartsregex'),

            (r'(abstract|boolean|byte|char|double|enum|final|float|goto|'
             r'implements|int|interface|long|native|package|private|protected|'
             r'public|short|synchronized|throws|transient|volatile)\b', Keyword.Reserved),
            (r'(true|false|null|NaN|Infinity|undefined)\b', Keyword.Constant),

            (r'(Array|Boolean|Date|BigInt|Function|Math|ArrayBuffer|'
             r'Number|Object|RegExp|String|Promise|Proxy|decodeURI|'
             r'decodeURIComponent|encodeURI|encodeURIComponent|'
             r'eval|isFinite|isNaN|parseFloat|parseInt|DataView|'
             r'document|window|globalThis|global|Symbol|Intl|'
             r'WeakSet|WeakMap|Set|Map|Reflect|JSON|Atomics|'
             r'Int(?:8|16|32)Array|BigInt64Array|Float32Array|Float64Array|'
             r'Uint8ClampedArray|Uint(?:8|16|32)Array|BigUint64Array)\b', Name.Builtin),

            (r'((?:Eval|Internal|Range|Reference|Syntax|Type|URI)?Error)\b', Name.Exception),

            # Match stuff like: super(argument, list)
            (r'(super)(\s*)(\([\w,?.$\s]+\s*\))',
             bygroups(Keyword, Whitespace), 'slashstartsregex'),
            # Match stuff like: function() {...}
            (r'([a-zA-Z_?.$][\w?.$]*)(?=\(\) \{)', Name.Other, 'slashstartsregex'),

            (JS_IDENT, Name.Other),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'`', String.Backtick, 'interp'),
            # private identifier
            (r'#[a-zA-Z_]\w*', Name),
        ],
        'interp': [
            (r'`', String.Backtick, '#pop'),
            (r'\\.', String.Backtick),
            (r'\$\{', String.Interpol, 'interp-inside'),
            (r'\$', String.Backtick),
            (r'[^`\\$]+', String.Backtick),
        ],
        'interp-inside': [
            # TODO: should this include single-line comments and allow nesting strings?
            (r'\}', String.Interpol, '#pop'),
            include('root'),
        ],
    }


class TypeScriptLexer(JavascriptLexer):
    """
    For TypeScript source code.
    """

    name = 'TypeScript'
    url = 'https://www.typescriptlang.org/'
    aliases = ['typescript', 'ts']
    filenames = ['*.ts']
    mimetypes = ['application/x-typescript', 'text/x-typescript']
    version_added = '1.6'

    # Higher priority than the TypoScriptLexer, as TypeScript is far more
    # common these days
    priority = 0.5

    tokens = {
        'root': [
            (r'(abstract|implements|private|protected|public|readonly)\b',
                Keyword, 'slashstartsregex'),
            (r'(enum|interface|override)\b', Keyword.Declaration, 'slashstartsregex'),
            (r'\b(declare|type)\b', Keyword.Reserved),
            # Match variable type keywords
            (r'\b(string|boolean|number)\b', Keyword.Type),
            # Match stuff like: module name {...}
            (r'\b(module)(\s*)([\w?.$]+)(\s*)',
             bygroups(Keyword.Reserved, Whitespace, Name.Other, Whitespace), 'slashstartsregex'),
            # Match stuff like: (function: return type)
            (r'([\w?.$]+)(\s*)(:)(\s*)([\w?.$]+)',
             bygroups(Name.Other, Whitespace, Operator, Whitespace, Keyword.Type)),
            # Match stuff like: Decorators
            (r'@' + JS_IDENT, Keyword.Declaration),
            inherit,
            # private identifier
            (r'#[a-zA-Z_]\w*', Name),
        ],
    }


class KalLexer(RegexLexer):
    """
    For Kal source code.
    """

    name = 'Kal'
    url = 'http://rzimmerman.github.io/kal'
    aliases = ['kal']
    filenames = ['*.kal']
    mimetypes = ['text/kal', 'application/kal']
    version_added = '2.0'

    flags = re.DOTALL
    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Whitespace),
            (r'###[^#].*?###', Comment.Multiline),
            (r'(#(?!##[^#]).*?)(\n)', bygroups(Comment.Single, Whitespace)),
        ],
        'functiondef': [
            (r'([$a-zA-Z_][\w$]*)(\s*)', bygroups(Name.Function, Whitespace),
                '#pop'),
            include('commentsandwhitespace'),
        ],
        'classdef': [
            (r'\b(inherits)(\s+)(from)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'([$a-zA-Z_][\w$]*)(?=\s*\n)', Name.Class, '#pop'),
            (r'[$a-zA-Z_][\w$]*\b', Name.Class),
            include('commentsandwhitespace'),
        ],
        'listcomprehension': [
            (r'\]', Punctuation, '#pop'),
            (r'\b(property|value)\b', Keyword),
            include('root'),
        ],
        'waitfor': [
            (r'\n', Whitespace, '#pop'),
            (r'\bfrom\b', Keyword),
            include('root'),
        ],
        'root': [
            include('commentsandwhitespace'),
            (r'/(?! )(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gimuysd]+\b|\B)', String.Regex),
            (r'\?|:|_(?=\n)|==?|!=|-(?!>)|[<>+*/-]=?',
             Operator),
            (r'\b(and|or|isnt|is|not|but|bitwise|mod|\^|xor|exists|'
             r'doesnt\s+exist)\b', Operator.Word),
            (r'(\([^()]+\))?(\s*)(>)',
                bygroups(Name.Function, Whitespace, Punctuation)),
            (r'[{(]', Punctuation),
            (r'\[', Punctuation, 'listcomprehension'),
            (r'[})\].,]', Punctuation),
            (r'\b(function|method|task)\b', Keyword.Declaration, 'functiondef'),
            (r'\bclass\b', Keyword.Declaration, 'classdef'),
            (r'\b(safe(?=\s))?(\s*)(wait(?=\s))(\s+)(for)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace,
                    Keyword), 'waitfor'),
            (r'\b(me|this)(\.[$a-zA-Z_][\w.$]*)?\b', Name.Variable.Instance),
            (r'(?<![.$])(run)(\s+)(in)(\s+)(parallel)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(?<![.$])(for)(\s+)(parallel|series)?\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(?<![.$])(except)(\s+)(when)?\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(?<![.$])(fail)(\s+)(with)?\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(?<![.$])(inherits)(\s+)(from)?\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(?<![.$])(for)(\s+)(parallel|series)?\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (words((
                'in', 'of', 'while', 'until', 'break', 'return', 'continue',
                'when', 'if', 'unless', 'else', 'otherwise', 'throw', 'raise',
                'try', 'catch', 'finally', 'new', 'delete', 'typeof',
                'instanceof', 'super'), prefix=r'(?<![.$])', suffix=r'\b'),
                Keyword),
            (words((
                'true', 'false', 'yes', 'no', 'on', 'off', 'null', 'nothing',
                'none', 'NaN', 'Infinity', 'undefined'), prefix=r'(?<![.$])',
                suffix=r'\b'), Keyword.Constant),
            (words((
                'Array', 'Boolean', 'Date', 'Error', 'Function', 'Math',
                'Number', 'Object', 'RegExp', 'String', 'decodeURI',
                'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'eval',
                'isFinite', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt',
                'document', 'window', 'globalThis', 'Symbol', 'print'),
                suffix=r'\b'), Name.Builtin),
            (r'([$a-zA-Z_][\w.$]*)(\s*)(:|[+\-*/]?\=)?\b',
                bygroups(Name.Variable, Whitespace, Operator)),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            ('"""', String, 'tdqs'),
            ("'''", String, 'tsqs'),
            ('"', String, 'dqs'),
            ("'", String, 'sqs'),
        ],
        'strings': [
            (r'[^#\\\'"]+', String),
            # note that all kal strings are multi-line.
            # hashmarks, quotes and backslashes must be parsed one at a time
        ],
        'interpoling_string': [
            (r'\}', String.Interpol, "#pop"),
            include('root')
        ],
        'dqs': [
            (r'"', String, '#pop'),
            (r'\\.|\'', String),  # double-quoted string don't need ' escapes
            (r'#\{', String.Interpol, "interpoling_string"),
            include('strings')
        ],
        'sqs': [
            (r"'", String, '#pop'),
            (r'#|\\.|"', String),  # single quoted strings don't need " escapses
            include('strings')
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            (r'\\.|\'|"', String),  # no need to escape quotes in triple-string
            (r'#\{', String.Interpol, "interpoling_string"),
            include('strings'),
        ],
        'tsqs': [
            (r"'''", String, '#pop'),
            (r'#|\\.|\'|"', String),  # no need to escape quotes in triple-strings
            include('strings')
        ],
    }


class LiveScriptLexer(RegexLexer):
    """
    For LiveScript source code.
    """

    name = 'LiveScript'
    url = 'https://livescript.net/'
    aliases = ['livescript', 'live-script']
    filenames = ['*.ls']
    mimetypes = ['text/livescript']
    version_added = '1.6'

    flags = re.DOTALL
    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Whitespace),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'(#.*?)(\n)', bygroups(Comment.Single, Whitespace)),
        ],
        'multilineregex': [
            include('commentsandwhitespace'),
            (r'//([gimuysd]+\b|\B)', String.Regex, '#pop'),
            (r'/', String.Regex),
            (r'[^/#]+', String.Regex)
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'//', String.Regex, ('#pop', 'multilineregex')),
            (r'/(?! )(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gimuysd]+\b|\B)', String.Regex, '#pop'),
            (r'/', Operator, '#pop'),
            default('#pop'),
        ],
        'root': [
            (r'\A(?=\s|/)', Text, 'slashstartsregex'),
            include('commentsandwhitespace'),
            (r'(?:\([^()]+\))?[ ]*[~-]{1,2}>|'
             r'(?:\(?[^()\n]+\)?)?[ ]*<[~-]{1,2}', Name.Function),
            (r'\+\+|&&|(?<![.$])\b(?:and|x?or|is|isnt|not)\b|\?|:|=|'
             r'\|\||\\(?=\n)|(<<|>>>?|==?|!=?|'
             r'~(?!\~?>)|-(?!\-?>)|<(?!\[)|(?<!\])>|'
             r'[+*`%&|^/])=?',
             Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),
            (r'(?<![.$])(for|own|in|of|while|until|loop|break|'
             r'return|continue|switch|when|then|if|unless|else|'
             r'throw|try|catch|finally|new|delete|typeof|instanceof|super|'
             r'extends|this|class|by|const|var|to|til)\b', Keyword,
             'slashstartsregex'),
            (r'(?<![.$])(true|false|yes|no|on|off|'
             r'null|NaN|Infinity|undefined|void)\b',
             Keyword.Constant),
            (r'(Array|Boolean|Date|Error|Function|Math|'
             r'Number|Object|RegExp|String|decodeURI|'
             r'decodeURIComponent|encodeURI|encodeURIComponent|'
             r'eval|isFinite|isNaN|parseFloat|parseInt|document|window|'
             r'globalThis|Symbol|Symbol|BigInt)\b', Name.Builtin),
            (r'([$a-zA-Z_][\w.\-:$]*)(\s*)([:=])(\s+)',
                bygroups(Name.Variable, Whitespace, Operator, Whitespace),
                'slashstartsregex'),
            (r'(@[$a-zA-Z_][\w.\-:$]*)(\s*)([:=])(\s+)',
                bygroups(Name.Variable.Instance, Whitespace, Operator,
                    Whitespace),
                'slashstartsregex'),
            (r'@', Name.Other, 'slashstartsregex'),
            (r'@?[$a-zA-Z_][\w-]*', Name.Other, 'slashstartsregex'),
            (r'[0-9]+\.[0-9]+([eE][0-9]+)?[fd]?(?:[a-zA-Z_]+)?', Number.Float),
            (r'[0-9]+(~[0-9a-z]+)?(?:[a-zA-Z_]+)?', Number.Integer),
            ('"""', String, 'tdqs'),
            ("'''", String, 'tsqs'),
            ('"', String, 'dqs'),
            ("'", String, 'sqs'),
            (r'\\\S+', String),
            (r'<\[.*?\]>', String),
        ],
        'strings': [
            (r'[^#\\\'"]+', String),
            # note that all coffee script strings are multi-line.
            # hashmarks, quotes and backslashes must be parsed one at a time
        ],
        'interpoling_string': [
            (r'\}', String.Interpol, "#pop"),
            include('root')
        ],
        'dqs': [
            (r'"', String, '#pop'),
            (r'\\.|\'', String),  # double-quoted string don't need ' escapes
            (r'#\{', String.Interpol, "interpoling_string"),
            (r'#', String),
            include('strings')
        ],
        'sqs': [
            (r"'", String, '#pop'),
            (r'#|\\.|"', String),  # single quoted strings don't need " escapses
            include('strings')
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            (r'\\.|\'|"', String),  # no need to escape quotes in triple-string
            (r'#\{', String.Interpol, "interpoling_string"),
            (r'#', String),
            include('strings'),
        ],
        'tsqs': [
            (r"'''", String, '#pop'),
            (r'#|\\.|\'|"', String),  # no need to escape quotes in triple-strings
            include('strings')
        ],
    }


class DartLexer(RegexLexer):
    """
    For Dart source code.
    """

    name = 'Dart'
    url = 'http://dart.dev/'
    aliases = ['dart']
    filenames = ['*.dart']
    mimetypes = ['text/x-dart']
    version_added = '1.5'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            include('string_literal'),
            (r'#!(.*?)$', Comment.Preproc),
            (r'\b(import|export)\b', Keyword, 'import_decl'),
            (r'\b(library|source|part of|part)\b', Keyword),
            (r'[^\S\n]+', Whitespace),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'\b(class|extension|mixin)\b(\s+)',
             bygroups(Keyword.Declaration, Whitespace), 'class'),
            (r'\b(as|assert|break|case|catch|const|continue|default|do|else|finally|'
             r'for|if|in|is|new|rethrow|return|super|switch|this|throw|try|while)\b',
             Keyword),
            (r'\b(abstract|async|await|const|covariant|extends|external|factory|final|'
             r'get|implements|late|native|on|operator|required|set|static|sync|typedef|'
             r'var|with|yield)\b', Keyword.Declaration),
            (r'\b(bool|double|dynamic|int|num|Function|Never|Null|Object|String|void)\b',
             Keyword.Type),
            (r'\b(false|null|true)\b', Keyword.Constant),
            (r'[~!%^&*+=|?:<>/-]|as\b', Operator),
            (r'@[a-zA-Z_$]\w*', Name.Decorator),
            (r'[a-zA-Z_$]\w*:', Name.Label),
            (r'[a-zA-Z_$]\w*', Name),
            (r'[(){}\[\],.;]', Punctuation),
            (r'0[xX][0-9a-fA-F]+', Number.Hex),
            # DIGIT+ (‘.’ DIGIT*)? EXPONENT?
            (r'\d+(\.\d*)?([eE][+-]?\d+)?', Number),
            (r'\.\d+([eE][+-]?\d+)?', Number),  # ‘.’ DIGIT+ EXPONENT?
            (r'\n', Whitespace)
            # pseudo-keyword negate intentionally left out
        ],
        'class': [
            (r'[a-zA-Z_$]\w*', Name.Class, '#pop')
        ],
        'import_decl': [
            include('string_literal'),
            (r'\s+', Whitespace),
            (r'\b(as|deferred|show|hide)\b', Keyword),
            (r'[a-zA-Z_$]\w*', Name),
            (r'\,', Punctuation),
            (r'\;', Punctuation, '#pop')
        ],
        'string_literal': [
            # Raw strings.
            (r'r"""([\w\W]*?)"""', String.Double),
            (r"r'''([\w\W]*?)'''", String.Single),
            (r'r"(.*?)"', String.Double),
            (r"r'(.*?)'", String.Single),
            # Normal Strings.
            (r'"""', String.Double, 'string_double_multiline'),
            (r"'''", String.Single, 'string_single_multiline'),
            (r'"', String.Double, 'string_double'),
            (r"'", String.Single, 'string_single')
        ],
        'string_common': [
            (r"\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]*\}|[a-z'\"$\\])",
             String.Escape),
            (r'(\$)([a-zA-Z_]\w*)', bygroups(String.Interpol, Name)),
            (r'(\$\{)(.*?)(\})',
             bygroups(String.Interpol, using(this), String.Interpol))
        ],
        'string_double': [
            (r'"', String.Double, '#pop'),
            (r'[^"$\\\n]+', String.Double),
            include('string_common'),
            (r'\$+', String.Double)
        ],
        'string_double_multiline': [
            (r'"""', String.Double, '#pop'),
            (r'[^"$\\]+', String.Double),
            include('string_common'),
            (r'(\$|\")+', String.Double)
        ],
        'string_single': [
            (r"'", String.Single, '#pop'),
            (r"[^'$\\\n]+", String.Single),
            include('string_common'),
            (r'\$+', String.Single)
        ],
        'string_single_multiline': [
            (r"'''", String.Single, '#pop'),
            (r'[^\'$\\]+', String.Single),
            include('string_common'),
            (r'(\$|\')+', String.Single)
        ]
    }


class LassoLexer(RegexLexer):
    """
    For Lasso source code, covering both Lasso 9
    syntax and LassoScript for Lasso 8.6 and earlier. For Lasso embedded in
    HTML, use the `LassoHtmlLexer`.

    Additional options accepted:

    `builtinshighlighting`
        If given and ``True``, highlight builtin types, traits, methods, and
        members (default: ``True``).
    `requiredelimiters`
        If given and ``True``, only highlight code between delimiters as Lasso
        (default: ``False``).
    """

    name = 'Lasso'
    aliases = ['lasso', 'lassoscript']
    filenames = ['*.lasso', '*.lasso[89]']
    version_added = '1.6'
    alias_filenames = ['*.incl', '*.inc', '*.las']
    mimetypes = ['text/x-lasso']
    url = 'https://www.lassosoft.com'

    flags = re.IGNORECASE | re.DOTALL | re.MULTILINE

    tokens = {
        'root': [
            (r'^#![ \S]+lasso9\b', Comment.Preproc, 'lasso'),
            (r'(?=\[|<)', Other, 'delimiters'),
            (r'\s+', Whitespace),
            default(('delimiters', 'lassofile')),
        ],
        'delimiters': [
            (r'\[no_square_brackets\]', Comment.Preproc, 'nosquarebrackets'),
            (r'\[noprocess\]', Comment.Preproc, 'noprocess'),
            (r'\[', Comment.Preproc, 'squarebrackets'),
            (r'<\?(lasso(script)?|=)', Comment.Preproc, 'anglebrackets'),
            (r'<(!--.*?-->)?', Other),
            (r'[^[<]+', Other),
        ],
        'nosquarebrackets': [
            (r'\[noprocess\]', Comment.Preproc, 'noprocess'),
            (r'\[', Other),
            (r'<\?(lasso(script)?|=)', Comment.Preproc, 'anglebrackets'),
            (r'<(!--.*?-->)?', Other),
            (r'[^[<]+', Other),
        ],
        'noprocess': [
            (r'\[/noprocess\]', Comment.Preproc, '#pop'),
            (r'\[', Other),
            (r'[^[]', Other),
        ],
        'squarebrackets': [
            (r'\]', Comment.Preproc, '#pop'),
            include('lasso'),
        ],
        'anglebrackets': [
            (r'\?>', Comment.Preproc, '#pop'),
            include('lasso'),
        ],
        'lassofile': [
            (r'\]|\?>', Comment.Preproc, '#pop'),
            include('lasso'),
        ],
        'whitespacecomments': [
            (r'\s+', Whitespace),
            (r'(//.*?)(\s*)$', bygroups(Comment.Single, Whitespace)),
            (r'/\*\*!.*?\*/', String.Doc),
            (r'/\*.*?\*/', Comment.Multiline),
        ],
        'lasso': [
            # whitespace/comments
            include('whitespacecomments'),

            # literals
            (r'\d*\.\d+(e[+-]?\d+)?', Number.Float),
            (r'0x[\da-f]+', Number.Hex),
            (r'\d+', Number.Integer),
            (r'(infinity|NaN)\b', Number),
            (r"'", String.Single, 'singlestring'),
            (r'"', String.Double, 'doublestring'),
            (r'`[^`]*`', String.Backtick),

            # names
            (r'\$[a-z_][\w.]*', Name.Variable),
            (r'#([a-z_][\w.]*|\d+\b)', Name.Variable.Instance),
            (r"(\.)(\s*)('[a-z_][\w.]*')",
                bygroups(Name.Builtin.Pseudo, Whitespace, Name.Variable.Class)),
            (r"(self)(\s*)(->)(\s*)('[a-z_][\w.]*')",
                bygroups(Name.Builtin.Pseudo, Whitespace, Operator, Whitespace,
                    Name.Variable.Class)),
            (r'(\.\.?)(\s*)([a-z_][\w.]*(=(?!=))?)',
                bygroups(Name.Builtin.Pseudo, Whitespace, Name.Other.Member)),
            (r'(->\\?|&)(\s*)([a-z_][\w.]*(=(?!=))?)',
                bygroups(Operator, Whitespace, Name.Other.Member)),
            (r'(?<!->)(self|inherited|currentcapture|givenblock)\b',
                Name.Builtin.Pseudo),
            (r'-(?!infinity)[a-z_][\w.]*', Name.Attribute),
            (r'(::)(\s*)([a-z_][\w.]*)',
                bygroups(Punctuation, Whitespace, Name.Label)),
            (r'(error_(code|msg)_\w+|Error_AddError|Error_ColumnRestriction|'
             r'Error_DatabaseConnectionUnavailable|Error_DatabaseTimeout|'
             r'Error_DeleteError|Error_FieldRestriction|Error_FileNotFound|'
             r'Error_InvalidDatabase|Error_InvalidPassword|'
             r'Error_InvalidUsername|Error_ModuleNotFound|'
             r'Error_NoError|Error_NoPermission|Error_OutOfMemory|'
             r'Error_ReqColumnMissing|Error_ReqFieldMissing|'
             r'Error_RequiredColumnMissing|Error_RequiredFieldMissing|'
             r'Error_UpdateError)\b', Name.Exception),

            # definitions
            (r'(define)(\s+)([a-z_][\w.]*)(\s*)(=>)(\s*)(type|trait|thread)\b',
                bygroups(Keyword.Declaration, Whitespace, Name.Class,
                    Whitespace, Operator, Whitespace, Keyword)),
            (r'(define)(\s+)([a-z_][\w.]*)(\s*)(->)(\s*)([a-z_][\w.]*=?|[-+*/%])',
                bygroups(Keyword.Declaration, Whitespace, Name.Class,
                    Whitespace, Operator, Whitespace, Name.Function),
                'signature'),
            (r'(define)(\s+)([a-z_][\w.]*)',
                bygroups(Keyword.Declaration, Whitespace, Name.Function), 'signature'),
            (r'(public|protected|private|provide)(\s+)(([a-z_][\w.]*=?|[-+*/%])'
             r'(?=\s*\())', bygroups(Keyword, Whitespace, Name.Function),
                'signature'),
            (r'(public|protected|private|provide)(\s+)([a-z_][\w.]*)',
                bygroups(Keyword, Whitespace, Name.Function)),

            # keywords
            (r'(true|false|none|minimal|full|all|void)\b', Keyword.Constant),
            (r'(local|var|variable|global|data(?=\s))\b', Keyword.Declaration),
            (r'(array|date|decimal|duration|integer|map|pair|string|tag|xml|'
             r'null|boolean|bytes|keyword|list|locale|queue|set|stack|'
             r'staticarray)\b', Keyword.Type),
            (r'([a-z_][\w.]*)(\s+)(in)\b', bygroups(Name, Whitespace, Keyword)),
            (r'(let|into)(\s+)([a-z_][\w.]*)', bygroups(Keyword, Whitespace, Name)),
            (r'require\b', Keyword, 'requiresection'),
            (r'(/?)(Namespace_Using)\b', bygroups(Punctuation, Keyword.Namespace)),
            (r'(/?)(Cache|Database_Names|Database_SchemaNames|'
             r'Database_TableNames|Define_Tag|Define_Type|Email_Batch|'
             r'Encode_Set|HTML_Comment|Handle|Handle_Error|Header|If|Inline|'
             r'Iterate|LJAX_Target|Link|Link_CurrentAction|Link_CurrentGroup|'
             r'Link_CurrentRecord|Link_Detail|Link_FirstGroup|Link_FirstRecord|'
             r'Link_LastGroup|Link_LastRecord|Link_NextGroup|Link_NextRecord|'
             r'Link_PrevGroup|Link_PrevRecord|Log|Loop|Output_None|Portal|'
             r'Private|Protect|Records|Referer|Referrer|Repeating|ResultSet|'
             r'Rows|Search_Args|Search_Arguments|Select|Sort_Args|'
             r'Sort_Arguments|Thread_Atomic|Value_List|While|Abort|Case|Else|'
             r'Fail_If|Fail_IfNot|Fail|If_Empty|If_False|If_Null|If_True|'
             r'Loop_Abort|Loop_Continue|Loop_Count|Params|Params_Up|Return|'
             r'Return_Value|Run_Children|SOAP_DefineTag|SOAP_LastRequest|'
             r'SOAP_LastResponse|Tag_Name|ascending|average|by|define|'
             r'descending|do|equals|frozen|group|handle_failure|import|in|into|'
             r'join|let|match|max|min|on|order|parent|protected|provide|public|'
             r'require|returnhome|skip|split_thread|sum|take|thread|to|trait|'
             r'type|where|with|yield|yieldhome)\b',
                bygroups(Punctuation, Keyword)),

            # other
            (r',', Punctuation, 'commamember'),
            (r'(and|or|not)\b', Operator.Word),
            (r'([a-z_][\w.]*)(\s*)(::)(\s*)([a-z_][\w.]*)?(\s*=(?!=))',
                bygroups(Name, Whitespace, Punctuation, Whitespace, Name.Label,
                    Operator)),
            (r'(/?)([\w.]+)', bygroups(Punctuation, Name.Other)),
            (r'(=)(n?bw|n?ew|n?cn|lte?|gte?|n?eq|n?rx|ft)\b',
                bygroups(Operator, Operator.Word)),
            (r':=|[-+*/%=<>&|!?\\]+', Operator),
            (r'[{}():;,@^]', Punctuation),
        ],
        'singlestring': [
            (r"'", String.Single, '#pop'),
            (r"[^'\\]+", String.Single),
            include('escape'),
            (r"\\", String.Single),
        ],
        'doublestring': [
            (r'"', String.Double, '#pop'),
            (r'[^"\\]+', String.Double),
            include('escape'),
            (r'\\', String.Double),
        ],
        'escape': [
            (r'\\(U[\da-f]{8}|u[\da-f]{4}|x[\da-f]{1,2}|[0-7]{1,3}|:[^:\n\r]+:|'
             r'[abefnrtv?"\'\\]|$)', String.Escape),
        ],
        'signature': [
            (r'=>', Operator, '#pop'),
            (r'\)', Punctuation, '#pop'),
            (r'[(,]', Punctuation, 'parameter'),
            include('lasso'),
        ],
        'parameter': [
            (r'\)', Punctuation, '#pop'),
            (r'-?[a-z_][\w.]*', Name.Attribute, '#pop'),
            (r'\.\.\.', Name.Builtin.Pseudo),
            include('lasso'),
        ],
        'requiresection': [
            (r'(([a-z_][\w.]*=?|[-+*/%])(?=\s*\())', Name, 'requiresignature'),
            (r'(([a-z_][\w.]*=?|[-+*/%])(?=(\s*::\s*[\w.]+)?\s*,))', Name),
            (r'[a-z_][\w.]*=?|[-+*/%]', Name, '#pop'),
            (r'(::)(\s*)([a-z_][\w.]*)',
                bygroups(Punctuation, Whitespace, Name.Label)),
            (r',', Punctuation),
            include('whitespacecomments'),
        ],
        'requiresignature': [
            (r'(\)(?=(\s*::\s*[\w.]+)?\s*,))', Punctuation, '#pop'),
            (r'\)', Punctuation, '#pop:2'),
            (r'-?[a-z_][\w.]*', Name.Attribute),
            (r'(::)(\s*)([a-z_][\w.]*)',
                bygroups(Punctuation, Whitespace, Name.Label)),
            (r'\.\.\.', Name.Builtin.Pseudo),
            (r'[(,]', Punctuation),
            include('whitespacecomments'),
        ],
        'commamember': [
            (r'(([a-z_][\w.]*=?|[-+*/%])'
             r'(?=\s*(\(([^()]*\([^()]*\))*[^)]*\)\s*)?(::[\w.\s]+)?=>))',
                Name.Function, 'signature'),
            include('whitespacecomments'),
            default('#pop'),
        ],
    }

    def __init__(self, **options):
        self.builtinshighlighting = get_bool_opt(
            options, 'builtinshighlighting', True)
        self.requiredelimiters = get_bool_opt(
            options, 'requiredelimiters', False)

        self._builtins = set()
        self._members = set()
        if self.builtinshighlighting:
            from lotas.erdos._vendor.pygments.lexers._lasso_builtins import BUILTINS, MEMBERS
            for key, value in BUILTINS.items():
                self._builtins.update(value)
            for key, value in MEMBERS.items():
                self._members.update(value)
        RegexLexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text):
        stack = ['root']
        if self.requiredelimiters:
            stack.append('delimiters')
        for index, token, value in \
                RegexLexer.get_tokens_unprocessed(self, text, stack):
            if (token is Name.Other and value.lower() in self._builtins or
                    token is Name.Other.Member and
                    value.lower().rstrip('=') in self._members):
                yield index, Name.Builtin, value
                continue
            yield index, token, value

    def analyse_text(text):
        rv = 0.0
        if 'bin/lasso9' in text:
            rv += 0.8
        if re.search(r'<\?lasso', text, re.I):
            rv += 0.4
        if re.search(r'local\(', text, re.I):
            rv += 0.4
        return rv


class ObjectiveJLexer(RegexLexer):
    """
    For Objective-J source code with preprocessor directives.
    """

    name = 'Objective-J'
    aliases = ['objective-j', 'objectivej', 'obj-j', 'objj']
    filenames = ['*.j']
    mimetypes = ['text/x-objective-j']
    url = 'https://www.cappuccino.dev/learn/objective-j.html'
    version_added = '1.3'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//[^\n]*\n|/[*](?:[^*]|[*][^/])*[*]/)*'

    flags = re.DOTALL | re.MULTILINE

    tokens = {
        'root': [
            include('whitespace'),

            # function definition
            (r'^(' + _ws + r'[+-]' + _ws + r')([(a-zA-Z_].*?[^(])(' + _ws + r'\{)',
             bygroups(using(this), using(this, state='function_signature'),
                      using(this))),

            # class definition
            (r'(@interface|@implementation)(\s+)', bygroups(Keyword, Whitespace),
             'classname'),
            (r'(@class|@protocol)(\s*)', bygroups(Keyword, Whitespace),
             'forward_classname'),
            (r'(\s*)(@end)(\s*)', bygroups(Whitespace, Keyword, Whitespace)),

            include('statements'),
            ('[{()}]', Punctuation),
            (';', Punctuation),
        ],
        'whitespace': [
            (r'(@import)(\s+)("(?:\\\\|\\"|[^"])*")',
             bygroups(Comment.Preproc, Whitespace, String.Double)),
            (r'(@import)(\s+)(<(?:\\\\|\\>|[^>])*>)',
             bygroups(Comment.Preproc, Whitespace, String.Double)),
            (r'(#(?:include|import))(\s+)("(?:\\\\|\\"|[^"])*")',
             bygroups(Comment.Preproc, Whitespace, String.Double)),
            (r'(#(?:include|import))(\s+)(<(?:\\\\|\\>|[^>])*>)',
             bygroups(Comment.Preproc, Whitespace, String.Double)),

            (r'#if\s+0', Comment.Preproc, 'if0'),
            (r'#', Comment.Preproc, 'macro'),

            (r'\s+', Whitespace),
            (r'(\\)(\n)',
                bygroups(String.Escape, Whitespace)),  # line continuation
            (r'//(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'<!--', Comment),
        ],
        'slashstartsregex': [
            include('whitespace'),
            (r'/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gim]+\b|\B)', String.Regex, '#pop'),
            (r'(?=/)', Text, ('#pop', 'badregex')),
            default('#pop'),
        ],
        'badregex': [
            (r'\n', Whitespace, '#pop'),
        ],
        'statements': [
            (r'(L|@)?"', String, 'string'),
            (r"(L|@)?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'",
             String.Char),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[lL]?', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[Ll]?', Number.Hex),
            (r'0[0-7]+[Ll]?', Number.Oct),
            (r'\d+[Ll]?', Number.Integer),

            (r'^(?=\s|/|<!--)', Text, 'slashstartsregex'),

            (r'\+\+|--|~|&&|\?|:|\|\||\\(?=\n)|'
             r'(<<|>>>?|==?|!=?|[-<>+*%&|^/])=?',
             Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),

            (r'(for|in|while|do|break|return|continue|switch|case|default|if|'
             r'else|throw|try|catch|finally|new|delete|typeof|instanceof|void|'
             r'prototype|__proto__)\b', Keyword, 'slashstartsregex'),

            (r'(var|with|function)\b', Keyword.Declaration, 'slashstartsregex'),

            (r'(@selector|@private|@protected|@public|@encode|'
             r'@synchronized|@try|@throw|@catch|@finally|@end|@property|'
             r'@synthesize|@dynamic|@for|@accessors|new)\b', Keyword),

            (r'(int|long|float|short|double|char|unsigned|signed|void|'
             r'id|BOOL|bool|boolean|IBOutlet|IBAction|SEL|@outlet|@action)\b',
             Keyword.Type),

            (r'(self|super)\b', Name.Builtin),

            (r'(TRUE|YES|FALSE|NO|Nil|nil|NULL)\b', Keyword.Constant),
            (r'(true|false|null|NaN|Infinity|undefined)\b', Keyword.Constant),
            (r'(ABS|ASIN|ACOS|ATAN|ATAN2|SIN|COS|TAN|EXP|POW|CEIL|FLOOR|ROUND|'
             r'MIN|MAX|RAND|SQRT|E|LN2|LN10|LOG2E|LOG10E|PI|PI2|PI_2|SQRT1_2|'
             r'SQRT2)\b', Keyword.Constant),

            (r'(Array|Boolean|Date|Error|Function|Math|'
             r'Number|Object|RegExp|String|decodeURI|'
             r'decodeURIComponent|encodeURI|encodeURIComponent|'
             r'Error|eval|isFinite|isNaN|parseFloat|parseInt|document|this|'
             r'window|globalThis|Symbol)\b', Name.Builtin),

            (r'([$a-zA-Z_]\w*)(' + _ws + r')(?=\()',
             bygroups(Name.Function, using(this))),

            (r'[$a-zA-Z_]\w*', Name),
        ],
        'classname': [
            # interface definition that inherits
            (r'([a-zA-Z_]\w*)(' + _ws + r':' + _ws +
             r')([a-zA-Z_]\w*)?',
             bygroups(Name.Class, using(this), Name.Class), '#pop'),
            # interface definition for a category
            (r'([a-zA-Z_]\w*)(' + _ws + r'\()([a-zA-Z_]\w*)(\))',
             bygroups(Name.Class, using(this), Name.Label, Text), '#pop'),
            # simple interface / implementation
            (r'([a-zA-Z_]\w*)', Name.Class, '#pop'),
        ],
        'forward_classname': [
            (r'([a-zA-Z_]\w*)(\s*)(,)(\s*)',
             bygroups(Name.Class, Whitespace, Text, Whitespace), '#push'),
            (r'([a-zA-Z_]\w*)(\s*)(;?)',
             bygroups(Name.Class, Whitespace, Text), '#pop'),
        ],
        'function_signature': [
            include('whitespace'),

            # start of a selector w/ parameters
            (r'(\(' + _ws + r')'                # open paren
             r'([a-zA-Z_]\w+)'                  # return type
             r'(' + _ws + r'\)' + _ws + r')'    # close paren
             r'([$a-zA-Z_]\w+' + _ws + r':)',   # function name
             bygroups(using(this), Keyword.Type, using(this),
                      Name.Function), 'function_parameters'),

            # no-param function
            (r'(\(' + _ws + r')'                # open paren
             r'([a-zA-Z_]\w+)'                  # return type
             r'(' + _ws + r'\)' + _ws + r')'    # close paren
             r'([$a-zA-Z_]\w+)',                # function name
             bygroups(using(this), Keyword.Type, using(this),
                      Name.Function), "#pop"),

            # no return type given, start of a selector w/ parameters
            (r'([$a-zA-Z_]\w+' + _ws + r':)',   # function name
             bygroups(Name.Function), 'function_parameters'),

            # no return type given, no-param function
            (r'([$a-zA-Z_]\w+)',                # function name
             bygroups(Name.Function), "#pop"),

            default('#pop'),
        ],
        'function_parameters': [
            include('whitespace'),

            # parameters
            (r'(\(' + _ws + ')'                 # open paren
             r'([^)]+)'                        # type
             r'(' + _ws + r'\)' + _ws + r')'    # close paren
             r'([$a-zA-Z_]\w+)',      # param name
             bygroups(using(this), Keyword.Type, using(this), Text)),

            # one piece of a selector name
            (r'([$a-zA-Z_]\w+' + _ws + r':)',   # function name
             Name.Function),

            # smallest possible selector piece
            (r'(:)', Name.Function),

            # var args
            (r'(,' + _ws + r'\.\.\.)', using(this)),

            # param name
            (r'([$a-zA-Z_]\w+)', Text),
        ],
        'expression': [
            (r'([$a-zA-Z_]\w*)(\()', bygroups(Name.Function,
                                              Punctuation)),
            (r'(\))', Punctuation, "#pop"),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'\\', String),  # stray backslash
        ],
        'macro': [
            (r'[^/\n]+', Comment.Preproc),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace), '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Whitespace),
            (r'\n', Whitespace, '#pop'),
        ],
        'if0': [
            (r'^\s*#if.*?(?<!\\)\n', Comment.Preproc, '#push'),
            (r'^\s*#endif.*?(?<!\\)\n', Comment.Preproc, '#pop'),
            (r'(.*?)(\n)', bygroups(Comment, Whitespace)),
        ]
    }

    def analyse_text(text):
        if re.search(r'^\s*@import\s+[<"]', text, re.MULTILINE):
            # special directive found in most Objective-J files
            return True
        return False


class CoffeeScriptLexer(RegexLexer):
    """
    For CoffeeScript source code.
    """

    name = 'CoffeeScript'
    url = 'http://coffeescript.org'
    aliases = ['coffeescript', 'coffee-script', 'coffee']
    filenames = ['*.coffee']
    mimetypes = ['text/coffeescript']
    version_added = '1.3'

    _operator_re = (
        r'\+\+|~|&&|\band\b|\bor\b|\bis\b|\bisnt\b|\bnot\b|\?|:|'
        r'\|\||\\(?=\n)|'
        r'(<<|>>>?|==?(?!>)|!=?|=(?!>)|-(?!>)|[<>+*`%&|\^/])=?')

    flags = re.DOTALL
    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Whitespace),
            (r'###[^#].*?###', Comment.Multiline),
            (r'(#(?!##[^#]).*?)(\n)', bygroups(Comment.Single, Whitespace)),
        ],
        'multilineregex': [
            (r'[^/#]+', String.Regex),
            (r'///([gimuysd]+\b|\B)', String.Regex, '#pop'),
            (r'#\{', String.Interpol, 'interpoling_string'),
            (r'[/#]', String.Regex),
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'///', String.Regex, ('#pop', 'multilineregex')),
            (r'/(?! )(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gimuysd]+\b|\B)', String.Regex, '#pop'),
            # This isn't really guarding against mishighlighting well-formed
            # code, just the ability to infinite-loop between root and
            # slashstartsregex.
            (r'/', Operator, '#pop'),
            default('#pop'),
        ],
        'root': [
            include('commentsandwhitespace'),
            (r'\A(?=\s|/)', Text, 'slashstartsregex'),
            (_operator_re, Operator, 'slashstartsregex'),
            (r'(?:\([^()]*\))?\s*[=-]>', Name.Function, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),
            (r'(?<![.$])(for|own|in|of|while|until|'
             r'loop|break|return|continue|'
             r'switch|when|then|if|unless|else|'
             r'throw|try|catch|finally|new|delete|typeof|instanceof|super|'
             r'extends|this|class|by)\b', Keyword, 'slashstartsregex'),
            (r'(?<![.$])(true|false|yes|no|on|off|null|'
             r'NaN|Infinity|undefined)\b',
             Keyword.Constant),
            (r'(Array|Boolean|Date|Error|Function|Math|'
             r'Number|Object|RegExp|String|decodeURI|'
             r'decodeURIComponent|encodeURI|encodeURIComponent|'
             r'eval|isFinite|isNaN|parseFloat|parseInt|document|window|globalThis|Symbol)\b',
             Name.Builtin),
            (r'([$a-zA-Z_][\w.:$]*)(\s*)([:=])(\s+)',
                bygroups(Name.Variable, Whitespace, Operator, Whitespace),
                'slashstartsregex'),
            (r'(@[$a-zA-Z_][\w.:$]*)(\s*)([:=])(\s+)',
                bygroups(Name.Variable.Instance, Whitespace, Operator, Whitespace),
                'slashstartsregex'),
            (r'@', Name.Other, 'slashstartsregex'),
            (r'@?[$a-zA-Z_][\w$]*', Name.Other),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            ('"""', String, 'tdqs'),
            ("'''", String, 'tsqs'),
            ('"', String, 'dqs'),
            ("'", String, 'sqs'),
        ],
        'strings': [
            (r'[^#\\\'"]+', String),
            # note that all coffee script strings are multi-line.
            # hashmarks, quotes and backslashes must be parsed one at a time
        ],
        'interpoling_string': [
            (r'\}', String.Interpol, "#pop"),
            include('root')
        ],
        'dqs': [
            (r'"', String, '#pop'),
            (r'\\.|\'', String),  # double-quoted string don't need ' escapes
            (r'#\{', String.Interpol, "interpoling_string"),
            (r'#', String),
            include('strings')
        ],
        'sqs': [
            (r"'", String, '#pop'),
            (r'#|\\.|"', String),  # single quoted strings don't need " escapses
            include('strings')
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            (r'\\.|\'|"', String),  # no need to escape quotes in triple-string
            (r'#\{', String.Interpol, "interpoling_string"),
            (r'#', String),
            include('strings'),
        ],
        'tsqs': [
            (r"'''", String, '#pop'),
            (r'#|\\.|\'|"', String),  # no need to escape quotes in triple-strings
            include('strings')
        ],
    }


class MaskLexer(RegexLexer):
    """
    For Mask markup.
    """
    name = 'Mask'
    url = 'https://github.com/atmajs/MaskJS'
    aliases = ['mask']
    filenames = ['*.mask']
    mimetypes = ['text/x-mask']
    version_added = '2.0'

    flags = re.MULTILINE | re.IGNORECASE | re.DOTALL
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'[{};>]', Punctuation),
            (r"'''", String, 'string-trpl-single'),
            (r'"""', String, 'string-trpl-double'),
            (r"'", String, 'string-single'),
            (r'"', String, 'string-double'),
            (r'([\w-]+)', Name.Tag, 'node'),
            (r'([^.#;{>\s]+)', Name.Class, 'node'),
            (r'(#[\w-]+)', Name.Function, 'node'),
            (r'(\.[\w-]+)', Name.Variable.Class, 'node')
        ],
        'string-base': [
            (r'\\.', String.Escape),
            (r'~\[', String.Interpol, 'interpolation'),
            (r'.', String.Single),
        ],
        'string-single': [
            (r"'", String.Single, '#pop'),
            include('string-base')
        ],
        'string-double': [
            (r'"', String.Single, '#pop'),
            include('string-base')
        ],
        'string-trpl-single': [
            (r"'''", String.Single, '#pop'),
            include('string-base')
        ],
        'string-trpl-double': [
            (r'"""', String.Single, '#pop'),
            include('string-base')
        ],
        'interpolation': [
            (r'\]', String.Interpol, '#pop'),
            (r'(\s*)(:)', bygroups(Whitespace, String.Interpol), 'expression'),
            (r'(\s*)(\w+)(:)', bygroups(Whitespace, Name.Other, Punctuation)),
            (r'[^\]]+', String.Interpol)
        ],
        'expression': [
            (r'[^\]]+', using(JavascriptLexer), '#pop')
        ],
        'node': [
            (r'\s+', Whitespace),
            (r'\.', Name.Variable.Class, 'node-class'),
            (r'\#', Name.Function, 'node-id'),
            (r'(style)([ \t]*)(=)',
                bygroups(Name.Attribute, Whitespace, Operator),
                'node-attr-style-value'),
            (r'([\w:-]+)([ \t]*)(=)',
                bygroups(Name.Attribute, Whitespace, Operator),
                'node-attr-value'),
            (r'[\w:-]+', Name.Attribute),
            (r'[>{;]', Punctuation, '#pop')
        ],
        'node-class': [
            (r'[\w-]+', Name.Variable.Class),
            (r'~\[', String.Interpol, 'interpolation'),
            default('#pop')
        ],
        'node-id': [
            (r'[\w-]+', Name.Function),
            (r'~\[', String.Interpol, 'interpolation'),
            default('#pop')
        ],
        'node-attr-value': [
            (r'\s+', Whitespace),
            (r'\w+', Name.Variable, '#pop'),
            (r"'", String, 'string-single-pop2'),
            (r'"', String, 'string-double-pop2'),
            default('#pop')
        ],
        'node-attr-style-value': [
            (r'\s+', Whitespace),
            (r"'", String.Single, 'css-single-end'),
            (r'"', String.Single, 'css-double-end'),
            include('node-attr-value')
        ],
        'css-base': [
            (r'\s+', Whitespace),
            (r";", Punctuation),
            (r"[\w\-]+\s*:", Name.Builtin)
        ],
        'css-single-end': [
            include('css-base'),
            (r"'", String.Single, '#pop:2'),
            (r"[^;']+", Name.Entity)
        ],
        'css-double-end': [
            include('css-base'),
            (r'"', String.Single, '#pop:2'),
            (r'[^;"]+', Name.Entity)
        ],
        'string-single-pop2': [
            (r"'", String.Single, '#pop:2'),
            include('string-base')
        ],
        'string-double-pop2': [
            (r'"', String.Single, '#pop:2'),
            include('string-base')
        ],
    }


class EarlGreyLexer(RegexLexer):
    """
    For Earl-Grey source code.

    .. versionadded: 2.1
    """

    name = 'Earl Grey'
    aliases = ['earl-grey', 'earlgrey', 'eg']
    filenames = ['*.eg']
    mimetypes = ['text/x-earl-grey']
    url = 'https://github.com/breuleux/earl-grey'
    version_added = ''

    tokens = {
        'root': [
            (r'\n', Whitespace),
            include('control'),
            (r'[^\S\n]+', Text),
            (r'(;;.*)(\n)', bygroups(Comment, Whitespace)),
            (r'[\[\]{}:(),;]', Punctuation),
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),
            (r'\\', Text),
            include('errors'),
            (words((
                'with', 'where', 'when', 'and', 'not', 'or', 'in',
                'as', 'of', 'is'),
                prefix=r'(?<=\s|\[)', suffix=r'(?![\w$\-])'),
             Operator.Word),
            (r'[*@]?->', Name.Function),
            (r'[+\-*/~^<>%&|?!@#.]*=', Operator.Word),
            (r'\.{2,3}', Operator.Word),  # Range Operator
            (r'([+*/~^<>&|?!]+)|([#\-](?=\s))|@@+(?=\s)|=+', Operator),
            (r'(?<![\w$\-])(var|let)(?:[^\w$])', Keyword.Declaration),
            include('keywords'),
            include('builtins'),
            include('assignment'),
            (r'''(?x)
                (?:()([a-zA-Z$_](?:[\w$\-]*[\w$])?)|
                   (?<=[\s{\[(])(\.)([a-zA-Z$_](?:[\w$\-]*[\w$])?))
                (?=.*%)''',
             bygroups(Punctuation, Name.Tag, Punctuation, Name.Class.Start), 'dbs'),
            (r'[rR]?`', String.Backtick, 'bt'),
            (r'[rR]?```', String.Backtick, 'tbt'),
            (r'(?<=[\s\[{(,;])\.([a-zA-Z$_](?:[\w$\-]*[\w$])?)'
             r'(?=[\s\]}),;])', String.Symbol),
            include('nested'),
            (r'(?:[rR]|[rR]\.[gmi]{1,3})?"', String, combined('stringescape', 'dqs')),
            (r'(?:[rR]|[rR]\.[gmi]{1,3})?\'', String, combined('stringescape', 'sqs')),
            (r'"""', String, combined('stringescape', 'tdqs')),
            include('tuple'),
            include('import_paths'),
            include('name'),
            include('numbers'),
        ],
        'dbs': [
            (r'(\.)([a-zA-Z$_](?:[\w$\-]*[\w$])?)(?=[.\[\s])',
             bygroups(Punctuation, Name.Class.DBS)),
            (r'(\[)([\^#][a-zA-Z$_](?:[\w$\-]*[\w$])?)(\])',
             bygroups(Punctuation, Name.Entity.DBS, Punctuation)),
            (r'\s+', Whitespace),
            (r'%', Operator.DBS, '#pop'),
        ],
        'import_paths': [
            (r'(?<=[\s:;,])(\.{1,3}(?:[\w\-]*/)*)(\w(?:[\w\-]*\w)*)(?=[\s;,])',
             bygroups(Text.Whitespace, Text)),
        ],
        'assignment': [
            (r'(\.)?([a-zA-Z$_](?:[\w$\-]*[\w$])?)'
             r'(?=\s+[+\-*/~^<>%&|?!@#.]*\=\s)',
             bygroups(Punctuation, Name.Variable))
        ],
        'errors': [
            (words(('Error', 'TypeError', 'ReferenceError'),
                   prefix=r'(?<![\w\-$.])', suffix=r'(?![\w\-$.])'),
             Name.Exception),
            (r'''(?x)
                (?<![\w$])
                E\.[\w$](?:[\w$\-]*[\w$])?
                (?:\.[\w$](?:[\w$\-]*[\w$])?)*
                (?=[({\[?!\s])''',
             Name.Exception),
        ],
        'control': [
            (r'''(?x)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)
                (?!\n)\s+
                (?!and|as|each\*|each|in|is|mod|of|or|when|where|with)
                (?=(?:[+\-*/~^<>%&|?!@#.])?[a-zA-Z$_](?:[\w$-]*[\w$])?)''',
             Keyword.Control),
            (r'([a-zA-Z$_](?:[\w$-]*[\w$])?)(?!\n)(\s+)(?=[\'"\d{\[(])',
             bygroups(Keyword.Control, Whitespace)),
            (r'''(?x)
                (?:
                    (?<=[%=])|
                    (?<=[=\-]>)|
                    (?<=with|each|with)|
                    (?<=each\*|where)
                )(\s+)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)(:)''',
             bygroups(Whitespace, Keyword.Control, Punctuation)),
            (r'''(?x)
                (?<![+\-*/~^<>%&|?!@#.])(\s+)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)(:)''',
             bygroups(Whitespace, Keyword.Control, Punctuation)),
        ],
        'nested': [
            (r'''(?x)
                (?<=[\w$\]})])(\.)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)
                (?=\s+with(?:\s|\n))''',
             bygroups(Punctuation, Name.Function)),
            (r'''(?x)
                (?<!\s)(\.)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)
                (?=[}\]).,;:\s])''',
             bygroups(Punctuation, Name.Field)),
            (r'''(?x)
                (?<=[\w$\]})])(\.)
                ([a-zA-Z$_](?:[\w$-]*[\w$])?)
                (?=[\[{(:])''',
             bygroups(Punctuation, Name.Function)),
        ],
        'keywords': [
            (words((
                'each', 'each*', 'mod', 'await', 'break', 'chain',
                'continue', 'elif', 'expr-value', 'if', 'match',
                'return', 'yield', 'pass', 'else', 'require', 'var',
                'let', 'async', 'method', 'gen'),
                prefix=r'(?<![\w\-$.])', suffix=r'(?![\w\-$.])'),
             Keyword.Pseudo),
            (words(('this', 'self', '@'),
                   prefix=r'(?<![\w\-$.])', suffix=r'(?![\w\-$])'),
             Keyword.Constant),
            (words((
                'Function', 'Object', 'Array', 'String', 'Number',
                'Boolean', 'ErrorFactory', 'ENode', 'Promise'),
                prefix=r'(?<![\w\-$.])', suffix=r'(?![\w\-$])'),
             Keyword.Type),
        ],
        'builtins': [
            (words((
                'send', 'object', 'keys', 'items', 'enumerate', 'zip',
                'product', 'neighbours', 'predicate', 'equal',
                'nequal', 'contains', 'repr', 'clone', 'range',
                'getChecker', 'get-checker', 'getProperty', 'get-property',
                'getProjector', 'get-projector', 'consume', 'take',
                'promisify', 'spawn', 'constructor'),
                prefix=r'(?<![\w\-#.])', suffix=r'(?![\w\-.])'),
             Name.Builtin),
            (words((
                'true', 'false', 'null', 'undefined'),
                prefix=r'(?<![\w\-$.])', suffix=r'(?![\w\-$.])'),
             Name.Constant),
        ],
        'name': [
            (r'@([a-zA-Z$_](?:[\w$-]*[\w$])?)', Name.Variable.Instance),
            (r'([a-zA-Z$_](?:[\w$-]*[\w$])?)(\+\+|\-\-)?',
             bygroups(Name.Symbol, Operator.Word))
        ],
        'tuple': [
            (r'#[a-zA-Z_][\w\-]*(?=[\s{(,;])', Name.Namespace)
        ],
        'interpoling_string': [
            (r'\}', String.Interpol, '#pop'),
            include('root')
        ],
        'stringescape': [
            (r'\\([\\abfnrtv"\']|\n|N\{.*?\}|u[a-fA-F0-9]{4}|'
             r'U[a-fA-F0-9]{8}|x[a-fA-F0-9]{2}|[0-7]{1,3})', String.Escape)
        ],
        'strings': [
            (r'[^\\\'"]', String),
            (r'[\'"\\]', String),
            (r'\n', String)  # All strings are multiline in EG
        ],
        'dqs': [
            (r'"', String, '#pop'),
            (r'\\\\|\\"|\\\n', String.Escape),
            include('strings')
        ],
        'sqs': [
            (r"'", String, '#pop'),
            (r"\\\\|\\'|\\\n", String.Escape),
            (r'\{', String.Interpol, 'interpoling_string'),
            include('strings')
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            include('strings'),
        ],
        'bt': [
            (r'`', String.Backtick, '#pop'),
            (r'(?<!`)\n', String.Backtick),
            (r'\^=?', String.Escape),
            (r'.+', String.Backtick),
        ],
        'tbt': [
            (r'```', String.Backtick, '#pop'),
            (r'\n', String.Backtick),
            (r'\^=?', String.Escape),
            (r'[^`]+', String.Backtick),
        ],
        'numbers': [
            (r'\d+\.(?!\.)\d*([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+[eE][+-]?[0-9]+', Number.Float),
            (r'8r[0-7]+', Number.Oct),
            (r'2r[01]+', Number.Bin),
            (r'16r[a-fA-F0-9]+', Number.Hex),
            (r'([3-79]|[12][0-9]|3[0-6])r[a-zA-Z\d]+(\.[a-zA-Z\d]+)?',
             Number.Radix),
            (r'\d+', Number.Integer)
        ],
    }


class JuttleLexer(RegexLexer):
    """
    For Juttle source code.
    """

    name = 'Juttle'
    url = 'http://juttle.github.io/'
    aliases = ['juttle']
    filenames = ['*.juttle']
    mimetypes = ['application/juttle', 'application/x-juttle',
                 'text/x-juttle', 'text/juttle']
    version_added = '2.2'

    flags = re.DOTALL | re.MULTILINE

    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Whitespace),
            (r'(//.*?)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'/\*.*?\*/', Comment.Multiline)
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gimuysd]+\b|\B)', String.Regex, '#pop'),
            (r'(?=/)', Text, ('#pop', 'badregex')),
            default('#pop')
        ],
        'badregex': [
            (r'\n', Text, '#pop')
        ],
        'root': [
            (r'^(?=\s|/)', Text, 'slashstartsregex'),
            include('commentsandwhitespace'),
            (r':\d{2}:\d{2}:\d{2}(\.\d*)?:', String.Moment),
            (r':(now|beginning|end|forever|yesterday|today|tomorrow|'
             r'(\d+(\.\d*)?|\.\d+)(ms|[smhdwMy])?):', String.Moment),
            (r':\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d*)?)?'
             r'(Z|[+-]\d{2}:\d{2}|[+-]\d{4})?:', String.Moment),
            (r':((\d+(\.\d*)?|\.\d+)[ ]+)?(millisecond|second|minute|hour|'
             r'day|week|month|year)[s]?'
             r'(([ ]+and[ ]+(\d+[ ]+)?(millisecond|second|minute|hour|'
             r'day|week|month|year)[s]?)'
             r'|[ ]+(ago|from[ ]+now))*:', String.Moment),
            (r'\+\+|--|~|&&|\?|:|\|\||\\(?=\n)|'
             r'(==?|!=?|[-<>+*%&|^/])=?', Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),
            (r'(import|return|continue|if|else)\b', Keyword, 'slashstartsregex'),
            (r'(var|const|function|reducer|sub|input)\b', Keyword.Declaration,
             'slashstartsregex'),
            (r'(batch|emit|filter|head|join|keep|pace|pass|put|read|reduce|remove|'
             r'sequence|skip|sort|split|tail|unbatch|uniq|view|write)\b',
             Keyword.Reserved),
            (r'(true|false|null|Infinity)\b', Keyword.Constant),
            (r'(Array|Date|Juttle|Math|Number|Object|RegExp|String)\b',
             Name.Builtin),
            (JS_IDENT, Name.Other),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
        ]

    }


class NodeConsoleLexer(Lexer):
    """
    For parsing within an interactive Node.js REPL, such as:

    .. sourcecode:: nodejsrepl

        > let a = 3
        undefined
        > a
        3
        > let b = '4'
        undefined
        > b
        '4'
        > b == a
        false

    .. versionadded: 2.10
    """
    name = 'Node.js REPL console session'
    aliases = ['nodejsrepl', ]
    mimetypes = ['text/x-nodejsrepl', ]
    url = 'https://nodejs.org'
    version_added = ''

    def get_tokens_unprocessed(self, text):
        jslexer = JavascriptLexer(**self.options)

        curcode = ''
        insertions = []

        for match in line_re.finditer(text):
            line = match.group()
            if line.startswith('> '):
                insertions.append((len(curcode),
                    [(0, Generic.Prompt, line[:1]),
                     (1, Whitespace, line[1:2])]))

                curcode += line[2:]
            elif line.startswith('...'):
                # node does a nested ... thing depending on depth
                code = line.lstrip('.')
                lead = len(line) - len(code)

                insertions.append((len(curcode),
                    [(0, Generic.Prompt, line[:lead])]))

                curcode += code
            else:
                if curcode:
                    yield from do_insertions(insertions,
                        jslexer.get_tokens_unprocessed(curcode))

                    curcode = ''
                    insertions = []

                yield from do_insertions([],
                    jslexer.get_tokens_unprocessed(line))

        if curcode:
            yield from do_insertions(insertions,
                jslexer.get_tokens_unprocessed(curcode))
