"""
    pygments.lexers.int_fiction
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for interactive fiction languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, \
    this, default, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Error, Generic

__all__ = ['Inform6Lexer', 'Inform6TemplateLexer', 'Inform7Lexer',
           'Tads3Lexer']


class Inform6Lexer(RegexLexer):
    """
    For Inform 6 source code.
    """

    name = 'Inform 6'
    url = 'http://inform-fiction.org/'
    aliases = ['inform6', 'i6']
    filenames = ['*.inf']
    version_added = '2.0'

    flags = re.MULTILINE | re.DOTALL

    _name = r'[a-zA-Z_]\w*'

    # Inform 7 maps these four character classes to their ASCII
    # equivalents. To support Inform 6 inclusions within Inform 7,
    # Inform6Lexer maps them too.
    _dash = '\\-\u2010-\u2014'
    _dquote = '"\u201c\u201d'
    _squote = "'\u2018\u2019"
    _newline = '\\n\u0085\u2028\u2029'

    tokens = {
        'root': [
            (rf'\A(!%[^{_newline}]*[{_newline}])+', Comment.Preproc,
             'directive'),
            default('directive')
        ],
        '_whitespace': [
            (r'\s+', Text),
            (rf'![^{_newline}]*', Comment.Single)
        ],
        'default': [
            include('_whitespace'),
            (r'\[', Punctuation, 'many-values'),  # Array initialization
            (r':|(?=;)', Punctuation, '#pop'),
            (r'<', Punctuation),  # Second angle bracket in an action statement
            default(('expression', '_expression'))
        ],

        # Expressions
        '_expression': [
            include('_whitespace'),
            (r'(?=sp\b)', Text, '#pop'),
            (rf'(?=[{_dquote}{_squote}$0-9#a-zA-Z_])', Text,
             ('#pop', 'value')),
            (rf'\+\+|[{_dash}]{{1,2}}(?!>)|~~?', Operator),
            (rf'(?=[()\[{_dash},?@{{:;])', Text, '#pop')
        ],
        'expression': [
            include('_whitespace'),
            (r'\(', Punctuation, ('expression', '_expression')),
            (r'\)', Punctuation, '#pop'),
            (r'\[', Punctuation, ('#pop', 'statements', 'locals')),
            (rf'>(?=(\s+|(![^{_newline}]*))*[>;])', Punctuation),
            (rf'\+\+|[{_dash}]{{2}}(?!>)', Operator),
            (r',', Punctuation, '_expression'),
            (rf'&&?|\|\|?|[=~><]?=|[{_dash}]{{1,2}}>?|\.\.?[&#]?|::|[<>+*/%]',
             Operator, '_expression'),
            (r'(has|hasnt|in|notin|ofclass|or|provides)\b', Operator.Word,
             '_expression'),
            (r'sp\b', Name),
            (r'\?~?', Name.Label, 'label?'),
            (r'[@{]', Error),
            default('#pop')
        ],
        '_assembly-expression': [
            (r'\(', Punctuation, ('#push', '_expression')),
            (r'[\[\]]', Punctuation),
            (rf'[{_dash}]>', Punctuation, '_expression'),
            (r'sp\b', Keyword.Pseudo),
            (r';', Punctuation, '#pop:3'),
            include('expression')
        ],
        '_for-expression': [
            (r'\)', Punctuation, '#pop:2'),
            (r':', Punctuation, '#pop'),
            include('expression')
        ],
        '_keyword-expression': [
            (r'(from|near|to)\b', Keyword, '_expression'),
            include('expression')
        ],
        '_list-expression': [
            (r',', Punctuation, '#pop'),
            include('expression')
        ],
        '_object-expression': [
            (r'has\b', Keyword.Declaration, '#pop'),
            include('_list-expression')
        ],

        # Values
        'value': [
            include('_whitespace'),
            # Strings
            (rf'[{_squote}][^@][{_squote}]', String.Char, '#pop'),
            (rf'([{_squote}])(@\{{[0-9a-fA-F]*\}})([{_squote}])',
             bygroups(String.Char, String.Escape, String.Char), '#pop'),
            (rf'([{_squote}])(@.{{2}})([{_squote}])',
             bygroups(String.Char, String.Escape, String.Char), '#pop'),
            (rf'[{_squote}]', String.Single, ('#pop', 'dictionary-word')),
            (rf'[{_dquote}]', String.Double, ('#pop', 'string')),
            # Numbers
            (rf'\$[<>]?[+{_dash}][0-9]*\.?[0-9]*([eE][+{_dash}]?[0-9]+)?',
             Number.Float, '#pop'),
            (r'\$[0-9a-fA-F]+', Number.Hex, '#pop'),
            (r'\$\$[01]+', Number.Bin, '#pop'),
            (r'[0-9]+', Number.Integer, '#pop'),
            # Values prefixed by hashes
            (rf'(##|#a\$)({_name})', bygroups(Operator, Name), '#pop'),
            (rf'(#g\$)({_name})',
             bygroups(Operator, Name.Variable.Global), '#pop'),
            (r'#[nw]\$', Operator, ('#pop', 'obsolete-dictionary-word')),
            (rf'(#r\$)({_name})', bygroups(Operator, Name.Function), '#pop'),
            (r'#', Name.Builtin, ('#pop', 'system-constant')),
            # System functions
            (words((
                'child', 'children', 'elder', 'eldest', 'glk', 'indirect', 'metaclass',
                'parent', 'random', 'sibling', 'younger', 'youngest'), suffix=r'\b'),
             Name.Builtin, '#pop'),
            # Metaclasses
            (r'(?i)(Class|Object|Routine|String)\b', Name.Builtin, '#pop'),
            # Veneer routines
            (words((
                'Box__Routine', 'CA__Pr', 'CDefArt', 'CInDefArt', 'Cl__Ms',
                'Copy__Primitive', 'CP__Tab', 'DA__Pr', 'DB__Pr', 'DefArt', 'Dynam__String',
                'EnglishNumber', 'Glk__Wrap', 'IA__Pr', 'IB__Pr', 'InDefArt', 'Main__',
                'Meta__class', 'OB__Move', 'OB__Remove', 'OC__Cl', 'OP__Pr', 'Print__Addr',
                'Print__PName', 'PrintShortName', 'RA__Pr', 'RA__Sc', 'RL__Pr', 'R_Process',
                'RT__ChG', 'RT__ChGt', 'RT__ChLDB', 'RT__ChLDW', 'RT__ChPR', 'RT__ChPrintA',
                'RT__ChPrintC', 'RT__ChPrintO', 'RT__ChPrintS', 'RT__ChPS', 'RT__ChR',
                'RT__ChSTB', 'RT__ChSTW', 'RT__ChT', 'RT__Err', 'RT__TrPS', 'RV__Pr',
                'Symb__Tab', 'Unsigned__Compare', 'WV__Pr', 'Z__Region'),
                prefix='(?i)', suffix=r'\b'),
             Name.Builtin, '#pop'),
            # Other built-in symbols
            (words((
                'call', 'copy', 'create', 'DEBUG', 'destroy', 'DICT_CHAR_SIZE',
                'DICT_ENTRY_BYTES', 'DICT_IS_UNICODE', 'DICT_WORD_SIZE', 'DOUBLE_HI_INFINITY',
                'DOUBLE_HI_NAN', 'DOUBLE_HI_NINFINITY', 'DOUBLE_LO_INFINITY', 'DOUBLE_LO_NAN',
                'DOUBLE_LO_NINFINITY', 'false', 'FLOAT_INFINITY', 'FLOAT_NAN', 'FLOAT_NINFINITY',
                'GOBJFIELD_CHAIN', 'GOBJFIELD_CHILD', 'GOBJFIELD_NAME', 'GOBJFIELD_PARENT',
                'GOBJFIELD_PROPTAB', 'GOBJFIELD_SIBLING', 'GOBJ_EXT_START',
                'GOBJ_TOTAL_LENGTH', 'Grammar__Version', 'INDIV_PROP_START', 'INFIX',
                'infix__watching', 'MODULE_MODE', 'name', 'nothing', 'NUM_ATTR_BYTES', 'print',
                'print_to_array', 'recreate', 'remaining', 'self', 'sender', 'STRICT_MODE',
                'sw__var', 'sys__glob0', 'sys__glob1', 'sys__glob2', 'sys_statusline_flag',
                'TARGET_GLULX', 'TARGET_ZCODE', 'temp__global2', 'temp__global3',
                'temp__global4', 'temp_global', 'true', 'USE_MODULES', 'WORDSIZE'),
                prefix='(?i)', suffix=r'\b'),
             Name.Builtin, '#pop'),
            # Other values
            (_name, Name, '#pop')
        ],
        'value?': [
            include('value'),
            default('#pop')
        ],
        # Strings
        'dictionary-word': [
            (rf'[~^]+|//[^{_squote}]*', String.Escape),
            (rf'[^~^/\\@({{{_squote}]+', String.Single),
            (r'[/({]', String.Single),
            (r'@\{[0-9a-fA-F]*\}', String.Escape),
            (r'@.{2}', String.Escape),
            (rf'[{_squote}]', String.Single, '#pop')
        ],
        'string': [
            (r'[~^]+', String.Escape),
            (rf'[^~^\\@({{{_dquote}]+', String.Double),
            (r'[({]', String.Double),
            (r'\\', String.Escape),
            (rf'@(\\\s*[{_newline}]\s*)*@((\\\s*[{_newline}]\s*)*[0-9])*', String.Escape),
            (rf'@(\\\s*[{_newline}]\s*)*[({{]((\\\s*[{_newline}]\s*)*[0-9a-zA-Z_])*'
             rf'(\\\s*[{_newline}]\s*)*[)}}]',
             String.Escape),
            (rf'@(\\\s*[{_newline}]\s*)*.(\\\s*[{_newline}]\s*)*.',
             String.Escape),
            (rf'[{_dquote}]', String.Double, '#pop')
        ],
        'plain-string': [
            (rf'[^~^\\({{\[\]{_dquote}]+', String.Double),
            (r'[~^({\[\]]', String.Double),
            (r'\\', String.Escape),
            (rf'[{_dquote}]', String.Double, '#pop')
        ],
        # Names
        '_constant': [
            include('_whitespace'),
            (_name, Name.Constant, '#pop'),
            include('value')
        ],
        'constant*': [
            include('_whitespace'),
            (r',', Punctuation),
            (r'=', Punctuation, 'value?'),
            (_name, Name.Constant, 'value?'),
            default('#pop')
        ],
        '_global': [
            include('_whitespace'),
            (_name, Name.Variable.Global, '#pop'),
            include('value')
        ],
        'label?': [
            include('_whitespace'),
            (_name, Name.Label, '#pop'),
            default('#pop')
        ],
        'variable?': [
            include('_whitespace'),
            (_name, Name.Variable, '#pop'),
            default('#pop')
        ],
        # Values after hashes
        'obsolete-dictionary-word': [
            (r'\S\w*', String.Other, '#pop')
        ],
        'system-constant': [
            include('_whitespace'),
            (_name, Name.Builtin, '#pop')
        ],

        # Directives
        'directive': [
            include('_whitespace'),
            (r'#', Punctuation),
            (r';', Punctuation, '#pop'),
            (r'\[', Punctuation,
             ('default', 'statements', 'locals', 'routine-name?')),
            (words((
                'abbreviate', 'endif', 'dictionary', 'ifdef', 'iffalse', 'ifndef', 'ifnot',
                'iftrue', 'ifv3', 'ifv5', 'release', 'serial', 'switches', 'system_file',
                'version'), prefix='(?i)', suffix=r'\b'),
             Keyword, 'default'),
            (r'(?i)(array|global)\b', Keyword,
             ('default', 'directive-keyword?', '_global')),
            (r'(?i)attribute\b', Keyword, ('default', 'alias?', '_constant')),
            (r'(?i)class\b', Keyword,
             ('object-body', 'duplicates', 'class-name')),
            (r'(?i)(constant|default)\b', Keyword,
             ('default', 'constant*')),
            (r'(?i)(end\b)(.*)', bygroups(Keyword, Text)),
            (r'(?i)(extend|verb)\b', Keyword, 'grammar'),
            (r'(?i)fake_action\b', Keyword, ('default', '_constant')),
            (r'(?i)import\b', Keyword, 'manifest'),
            (r'(?i)(include|link|origsource)\b', Keyword,
             ('default', 'before-plain-string?')),
            (r'(?i)(lowstring|undef)\b', Keyword, ('default', '_constant')),
            (r'(?i)message\b', Keyword, ('default', 'diagnostic')),
            (r'(?i)(nearby|object)\b', Keyword,
             ('object-body', '_object-head')),
            (r'(?i)property\b', Keyword,
             ('default', 'alias?', '_constant', 'property-keyword*')),
            (r'(?i)replace\b', Keyword,
             ('default', 'routine-name?', 'routine-name?')),
            (r'(?i)statusline\b', Keyword, ('default', 'directive-keyword?')),
            (r'(?i)stub\b', Keyword, ('default', 'routine-name?')),
            (r'(?i)trace\b', Keyword,
             ('default', 'trace-keyword?', 'trace-keyword?')),
            (r'(?i)zcharacter\b', Keyword,
             ('default', 'directive-keyword?', 'directive-keyword?')),
            (_name, Name.Class, ('object-body', '_object-head'))
        ],
        # [, Replace, Stub
        'routine-name?': [
            include('_whitespace'),
            (_name, Name.Function, '#pop'),
            default('#pop')
        ],
        'locals': [
            include('_whitespace'),
            (r';', Punctuation, '#pop'),
            (r'\*', Punctuation),
            (r'"', String.Double, 'plain-string'),
            (_name, Name.Variable)
        ],
        # Array
        'many-values': [
            include('_whitespace'),
            (r';', Punctuation),
            (r'\]', Punctuation, '#pop'),
            (r':', Error),
            default(('expression', '_expression'))
        ],
        # Attribute, Property
        'alias?': [
            include('_whitespace'),
            (r'alias\b', Keyword, ('#pop', '_constant')),
            default('#pop')
        ],
        # Class, Object, Nearby
        'class-name': [
            include('_whitespace'),
            (r'(?=[,;]|(class|has|private|with)\b)', Text, '#pop'),
            (_name, Name.Class, '#pop')
        ],
        'duplicates': [
            include('_whitespace'),
            (r'\(', Punctuation, ('#pop', 'expression', '_expression')),
            default('#pop')
        ],
        '_object-head': [
            (rf'[{_dash}]>', Punctuation),
            (r'(class|has|private|with)\b', Keyword.Declaration, '#pop'),
            include('_global')
        ],
        'object-body': [
            include('_whitespace'),
            (r';', Punctuation, '#pop:2'),
            (r',', Punctuation),
            (r'class\b', Keyword.Declaration, 'class-segment'),
            (r'(has|private|with)\b', Keyword.Declaration),
            (r':', Error),
            default(('_object-expression', '_expression'))
        ],
        'class-segment': [
            include('_whitespace'),
            (r'(?=[,;]|(class|has|private|with)\b)', Text, '#pop'),
            (_name, Name.Class),
            default('value')
        ],
        # Extend, Verb
        'grammar': [
            include('_whitespace'),
            (r'=', Punctuation, ('#pop', 'default')),
            (r'\*', Punctuation, ('#pop', 'grammar-line')),
            default('_directive-keyword')
        ],
        'grammar-line': [
            include('_whitespace'),
            (r';', Punctuation, '#pop'),
            (r'[/*]', Punctuation),
            (rf'[{_dash}]>', Punctuation, 'value'),
            (r'(noun|scope)\b', Keyword, '=routine'),
            default('_directive-keyword')
        ],
        '=routine': [
            include('_whitespace'),
            (r'=', Punctuation, 'routine-name?'),
            default('#pop')
        ],
        # Import
        'manifest': [
            include('_whitespace'),
            (r';', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'(?i)global\b', Keyword, '_global'),
            default('_global')
        ],
        # Include, Link, Message
        'diagnostic': [
            include('_whitespace'),
            (rf'[{_dquote}]', String.Double, ('#pop', 'message-string')),
            default(('#pop', 'before-plain-string?', 'directive-keyword?'))
        ],
        'before-plain-string?': [
            include('_whitespace'),
            (rf'[{_dquote}]', String.Double, ('#pop', 'plain-string')),
            default('#pop')
        ],
        'message-string': [
            (r'[~^]+', String.Escape),
            include('plain-string')
        ],

        # Keywords used in directives
        '_directive-keyword!': [
            include('_whitespace'),
            (words((
                'additive', 'alias', 'buffer', 'class', 'creature', 'data', 'error', 'fatalerror',
                'first', 'has', 'held', 'individual', 'initial', 'initstr', 'last', 'long', 'meta',
                'multi', 'multiexcept', 'multiheld', 'multiinside', 'noun', 'number', 'only',
                'private', 'replace', 'reverse', 'scope', 'score', 'special', 'string', 'table',
                'terminating', 'time', 'topic', 'warning', 'with'), suffix=r'\b'),
             Keyword, '#pop'),
            (r'static\b', Keyword),
            (rf'[{_dash}]{{1,2}}>|[+=]', Punctuation, '#pop')
        ],
        '_directive-keyword': [
            include('_directive-keyword!'),
            include('value')
        ],
        'directive-keyword?': [
            include('_directive-keyword!'),
            default('#pop')
        ],
        'property-keyword*': [
            include('_whitespace'),
            (words(('additive', 'individual', 'long'),
                suffix=rf'\b(?=(\s*|(![^{_newline}]*[{_newline}]))*[_a-zA-Z])'),
             Keyword),
            default('#pop')
        ],
        'trace-keyword?': [
            include('_whitespace'),
            (words((
                'assembly', 'dictionary', 'expressions', 'lines', 'linker',
                'objects', 'off', 'on', 'symbols', 'tokens', 'verbs'), suffix=r'\b'),
             Keyword, '#pop'),
            default('#pop')
        ],

        # Statements
        'statements': [
            include('_whitespace'),
            (r'\]', Punctuation, '#pop'),
            (r'[;{}]', Punctuation),
            (words((
                'box', 'break', 'continue', 'default', 'give', 'inversion',
                'new_line', 'quit', 'read', 'remove', 'return', 'rfalse', 'rtrue',
                'spaces', 'string', 'until'), suffix=r'\b'),
             Keyword, 'default'),
            (r'(do|else)\b', Keyword),
            (r'(font|style)\b', Keyword,
             ('default', 'miscellaneous-keyword?')),
            (r'for\b', Keyword, ('for', '(?')),
            (r'(if|switch|while)', Keyword,
             ('expression', '_expression', '(?')),
            (r'(jump|save|restore)\b', Keyword, ('default', 'label?')),
            (r'objectloop\b', Keyword,
             ('_keyword-expression', 'variable?', '(?')),
            (rf'print(_ret)?\b|(?=[{_dquote}])', Keyword, 'print-list'),
            (r'\.', Name.Label, 'label?'),
            (r'@', Keyword, 'opcode'),
            (r'#(?![agrnw]\$|#)', Punctuation, 'directive'),
            (r'<', Punctuation, 'default'),
            (r'move\b', Keyword,
             ('default', '_keyword-expression', '_expression')),
            default(('default', '_keyword-expression', '_expression'))
        ],
        'miscellaneous-keyword?': [
            include('_whitespace'),
            (r'(bold|fixed|from|near|off|on|reverse|roman|to|underline)\b',
             Keyword, '#pop'),
            (r'(a|A|an|address|char|name|number|object|property|string|the|'
             rf'The)\b(?=(\s+|(![^{_newline}]*))*\))', Keyword.Pseudo,
             '#pop'),
            (rf'{_name}(?=(\s+|(![^{_newline}]*))*\))', Name.Function,
             '#pop'),
            default('#pop')
        ],
        '(?': [
            include('_whitespace'),
            (r'\(', Punctuation, '#pop'),
            default('#pop')
        ],
        'for': [
            include('_whitespace'),
            (r';', Punctuation, ('_for-expression', '_expression')),
            default(('_for-expression', '_expression'))
        ],
        'print-list': [
            include('_whitespace'),
            (r';', Punctuation, '#pop'),
            (r':', Error),
            default(('_list-expression', '_expression', '_list-expression', 'form'))
        ],
        'form': [
            include('_whitespace'),
            (r'\(', Punctuation, ('#pop', 'miscellaneous-keyword?')),
            default('#pop')
        ],

        # Assembly
        'opcode': [
            include('_whitespace'),
            (rf'[{_dquote}]', String.Double, ('operands', 'plain-string')),
            (rf'[{_dash}]{{1,2}}>', Punctuation, 'operands'),
            (_name, Keyword, 'operands')
        ],
        'operands': [
            (r':', Error),
            default(('_assembly-expression', '_expression'))
        ]
    }

    def get_tokens_unprocessed(self, text):
        # 'in' is either a keyword or an operator.
        # If the token two tokens after 'in' is ')', 'in' is a keyword:
        #   objectloop(a in b)
        # Otherwise, it is an operator:
        #   objectloop(a in b && true)
        objectloop_queue = []
        objectloop_token_count = -1
        previous_token = None
        for index, token, value in RegexLexer.get_tokens_unprocessed(self,
                                                                     text):
            if previous_token is Name.Variable and value == 'in':
                objectloop_queue = [[index, token, value]]
                objectloop_token_count = 2
            elif objectloop_token_count > 0:
                if token not in Comment and token not in Text:
                    objectloop_token_count -= 1
                objectloop_queue.append((index, token, value))
            else:
                if objectloop_token_count == 0:
                    if objectloop_queue[-1][2] == ')':
                        objectloop_queue[0][1] = Keyword
                    while objectloop_queue:
                        yield objectloop_queue.pop(0)
                    objectloop_token_count = -1
                yield index, token, value
            if token not in Comment and token not in Text:
                previous_token = token
        while objectloop_queue:
            yield objectloop_queue.pop(0)

    def analyse_text(text):
        """We try to find a keyword which seem relatively common, unfortunately
        there is a decent overlap with Smalltalk keywords otherwise here.."""
        result = 0
        if re.search('\borigsource\b', text, re.IGNORECASE):
            result += 0.05

        return result


class Inform7Lexer(RegexLexer):
    """
    For Inform 7 source code.
    """

    name = 'Inform 7'
    url = 'http://inform7.com/'
    aliases = ['inform7', 'i7']
    filenames = ['*.ni', '*.i7x']
    version_added = '2.0'

    flags = re.MULTILINE | re.DOTALL

    _dash = Inform6Lexer._dash
    _dquote = Inform6Lexer._dquote
    _newline = Inform6Lexer._newline
    _start = rf'\A|(?<=[{_newline}])'

    # There are three variants of Inform 7, differing in how to
    # interpret at signs and braces in I6T. In top-level inclusions, at
    # signs in the first column are inweb syntax. In phrase definitions
    # and use options, tokens in braces are treated as I7. Use options
    # also interpret "{N}".
    tokens = {}
    token_variants = ['+i6t-not-inline', '+i6t-inline', '+i6t-use-option']

    for level in token_variants:
        tokens[level] = {
            '+i6-root': list(Inform6Lexer.tokens['root']),
            '+i6t-root': [  # For Inform6TemplateLexer
                (rf'[^{Inform6Lexer._newline}]*', Comment.Preproc,
                 ('directive', '+p'))
            ],
            'root': [
                (r'(\|?\s)+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'[{_dquote}]', Generic.Heading,
                 ('+main', '+titling', '+titling-string')),
                default(('+main', '+heading?'))
            ],
            '+titling-string': [
                (rf'[^{_dquote}]+', Generic.Heading),
                (rf'[{_dquote}]', Generic.Heading, '#pop')
            ],
            '+titling': [
                (r'\[', Comment.Multiline, '+comment'),
                (rf'[^{_dquote}.;:|{_newline}]+', Generic.Heading),
                (rf'[{_dquote}]', Generic.Heading, '+titling-string'),
                (rf'[{_newline}]{{2}}|(?<=[\s{_dquote}])\|[\s{_dquote}]',
                 Text, ('#pop', '+heading?')),
                (rf'[.;:]|(?<=[\s{_dquote}])\|', Text, '#pop'),
                (rf'[|{_newline}]', Generic.Heading)
            ],
            '+main': [
                (rf'(?i)[^{_dquote}:a\[(|{_newline}]+', Text),
                (rf'[{_dquote}]', String.Double, '+text'),
                (r':', Text, '+phrase-definition'),
                (r'(?i)\bas\b', Text, '+use-option'),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'(\([{_dash}])(.*?)([{_dash}]\))',
                 bygroups(Punctuation,
                          using(this, state=('+i6-root', 'directive'),
                                i6t='+i6t-not-inline'), Punctuation)),
                (rf'({_start}|(?<=[\s;:.{_dquote}]))\|\s|[{_newline}]{{2,}}', Text, '+heading?'),
                (rf'(?i)[a(|{_newline}]', Text)
            ],
            '+phrase-definition': [
                (r'\s+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'(\([{_dash}])(.*?)([{_dash}]\))',
                 bygroups(Punctuation,
                          using(this, state=('+i6-root', 'directive',
                                             'default', 'statements'),
                                i6t='+i6t-inline'), Punctuation), '#pop'),
                default('#pop')
            ],
            '+use-option': [
                (r'\s+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'(\([{_dash}])(.*?)([{_dash}]\))',
                 bygroups(Punctuation,
                          using(this, state=('+i6-root', 'directive'),
                                i6t='+i6t-use-option'), Punctuation), '#pop'),
                default('#pop')
            ],
            '+comment': [
                (r'[^\[\]]+', Comment.Multiline),
                (r'\[', Comment.Multiline, '#push'),
                (r'\]', Comment.Multiline, '#pop')
            ],
            '+text': [
                (rf'[^\[{_dquote}]+', String.Double),
                (r'\[.*?\]', String.Interpol),
                (rf'[{_dquote}]', String.Double, '#pop')
            ],
            '+heading?': [
                (r'(\|?\s)+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'[{_dash}]{{4}}\s+', Text, '+documentation-heading'),
                (rf'[{_dash}]{{1,3}}', Text),
                (rf'(?i)(volume|book|part|chapter|section)\b[^{_newline}]*',
                 Generic.Heading, '#pop'),
                default('#pop')
            ],
            '+documentation-heading': [
                (r'\s+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (r'(?i)documentation\s+', Text, '+documentation-heading2'),
                default('#pop')
            ],
            '+documentation-heading2': [
                (r'\s+', Text),
                (r'\[', Comment.Multiline, '+comment'),
                (rf'[{_dash}]{{4}}\s', Text, '+documentation'),
                default('#pop:2')
            ],
            '+documentation': [
                (rf'(?i)({_start})\s*(chapter|example)\s*:[^{_newline}]*', Generic.Heading),
                (rf'(?i)({_start})\s*section\s*:[^{_newline}]*',
                 Generic.Subheading),
                (rf'(({_start})\t.*?[{_newline}])+',
                 using(this, state='+main')),
                (rf'[^{_newline}\[]+|[{_newline}\[]', Text),
                (r'\[', Comment.Multiline, '+comment'),
            ],
            '+i6t-not-inline': [
                (rf'({_start})@c( .*?)?([{_newline}]|\Z)',
                 Comment.Preproc),
                (rf'({_start})@([{_dash}]+|Purpose:)[^{_newline}]*',
                 Comment.Preproc),
                (rf'({_start})@p( .*?)?([{_newline}]|\Z)',
                 Generic.Heading, '+p')
            ],
            '+i6t-use-option': [
                include('+i6t-not-inline'),
                (r'(\{)(N)(\})', bygroups(Punctuation, Text, Punctuation))
            ],
            '+i6t-inline': [
                (r'(\{)(\S[^}]*)?(\})',
                 bygroups(Punctuation, using(this, state='+main'),
                          Punctuation))
            ],
            '+i6t': [
                (rf'(\{{[{_dash}])(![^}}]*)(\}}?)',
                 bygroups(Punctuation, Comment.Single, Punctuation)),
                (rf'(\{{[{_dash}])(lines)(:)([^}}]*)(\}}?)',
                 bygroups(Punctuation, Keyword, Punctuation, Text,
                          Punctuation), '+lines'),
                (rf'(\{{[{_dash}])([^:}}]*)(:?)([^}}]*)(\}}?)',
                 bygroups(Punctuation, Keyword, Punctuation, Text,
                          Punctuation)),
                (r'(\(\+)(.*?)(\+\)|\Z)',
                 bygroups(Punctuation, using(this, state='+main'),
                          Punctuation))
            ],
            '+p': [
                (r'[^@]+', Comment.Preproc),
                (rf'({_start})@c( .*?)?([{_newline}]|\Z)',
                 Comment.Preproc, '#pop'),
                (rf'({_start})@([{_dash}]|Purpose:)', Comment.Preproc),
                (rf'({_start})@p( .*?)?([{_newline}]|\Z)',
                 Generic.Heading),
                (r'@', Comment.Preproc)
            ],
            '+lines': [
                (rf'({_start})@c( .*?)?([{_newline}]|\Z)',
                 Comment.Preproc),
                (rf'({_start})@([{_dash}]|Purpose:)[^{_newline}]*',
                 Comment.Preproc),
                (rf'({_start})@p( .*?)?([{_newline}]|\Z)',
                 Generic.Heading, '+p'),
                (rf'({_start})@\w*[ {_newline}]', Keyword),
                (rf'![^{_newline}]*', Comment.Single),
                (rf'(\{{)([{_dash}]endlines)(\}})',
                 bygroups(Punctuation, Keyword, Punctuation), '#pop'),
                (rf'[^@!{{]+?([{_newline}]|\Z)|.', Text)
            ]
        }
        # Inform 7 can include snippets of Inform 6 template language,
        # so all of Inform6Lexer's states are copied here, with
        # modifications to account for template syntax. Inform7Lexer's
        # own states begin with '+' to avoid name conflicts. Some of
        # Inform6Lexer's states begin with '_': these are not modified.
        # They deal with template syntax either by including modified
        # states, or by matching r'' then pushing to modified states.
        for token in Inform6Lexer.tokens:
            if token == 'root':
                continue
            tokens[level][token] = list(Inform6Lexer.tokens[token])
            if not token.startswith('_'):
                tokens[level][token][:0] = [include('+i6t'), include(level)]

    def __init__(self, **options):
        level = options.get('i6t', '+i6t-not-inline')
        if level not in self._all_tokens:
            self._tokens = self.__class__.process_tokendef(level)
        else:
            self._tokens = self._all_tokens[level]
        RegexLexer.__init__(self, **options)


class Inform6TemplateLexer(Inform7Lexer):
    """
    For Inform 6 template code.
    """

    name = 'Inform 6 template'
    aliases = ['i6t']
    filenames = ['*.i6t']
    version_added = '2.0'

    def get_tokens_unprocessed(self, text, stack=('+i6t-root',)):
        return Inform7Lexer.get_tokens_unprocessed(self, text, stack)


class Tads3Lexer(RegexLexer):
    """
    For TADS 3 source code.
    """

    name = 'TADS 3'
    aliases = ['tads3']
    filenames = ['*.t']
    url = 'https://www.tads.org'
    version_added = ''

    flags = re.DOTALL | re.MULTILINE

    _comment_single = r'(?://(?:[^\\\n]|\\+[\w\W])*$)'
    _comment_multiline = r'(?:/\*(?:[^*]|\*(?!/))*\*/)'
    _escape = (r'(?:\\(?:[\n\\<>"\'^v bnrt]|u[\da-fA-F]{,4}|x[\da-fA-F]{,2}|'
               r'[0-3]?[0-7]{1,2}))')
    _name = r'(?:[_a-zA-Z]\w*)'
    _no_quote = r'(?=\s|\\?>)'
    _operator = (r'(?:&&|\|\||\+\+|--|\?\?|::|[.,@\[\]~]|'
                 r'(?:[=+\-*/%!&|^]|<<?|>>?>?)=?)')
    _ws = rf'(?:\\|\s|{_comment_single}|{_comment_multiline})'
    _ws_pp = rf'(?:\\\n|[^\S\n]|{_comment_single}|{_comment_multiline})'

    def _make_string_state(triple, double, verbatim=None, _escape=_escape):
        if verbatim:
            verbatim = ''.join([f'(?:{re.escape(c.lower())}|{re.escape(c.upper())})'
                                for c in verbatim])
        char = r'"' if double else r"'"
        token = String.Double if double else String.Single
        escaped_quotes = rf'+|{char}(?!{char}{{2}})' if triple else r''
        prefix = '{}{}'.format('t' if triple else '', 'd' if double else 's')
        tag_state_name = f'{prefix}qt'
        state = []
        if triple:
            state += [
                (rf'{char}{{3,}}', token, '#pop'),
                (rf'\\{char}+', String.Escape),
                (char, token)
            ]
        else:
            state.append((char, token, '#pop'))
        state += [
            include('s/verbatim'),
            (rf'[^\\<&{{}}{char}]+', token)
        ]
        if verbatim:
            # This regex can't use `(?i)` because escape sequences are
            # case-sensitive. `<\XMP>` works; `<\xmp>` doesn't.
            state.append((rf'\\?<(/|\\\\|(?!{_escape})\\){verbatim}(?=[\s=>])',
                          Name.Tag, ('#pop', f'{prefix}qs', tag_state_name)))
        else:
            state += [
                (rf'\\?<!([^><\\{char}]|<(?!<)|\\{char}{escaped_quotes}|{_escape}|\\.)*>?', Comment.Multiline),
                (r'(?i)\\?<listing(?=[\s=>]|\\>)', Name.Tag,
                 ('#pop', f'{prefix}qs/listing', tag_state_name)),
                (r'(?i)\\?<xmp(?=[\s=>]|\\>)', Name.Tag,
                 ('#pop', f'{prefix}qs/xmp', tag_state_name)),
                (rf'\\?<([^\s=><\\{char}]|<(?!<)|\\{char}{escaped_quotes}|{_escape}|\\.)*', Name.Tag,
                 tag_state_name),
                include('s/entity')
            ]
        state += [
            include('s/escape'),
            (rf'\{{([^}}<\\{char}]|<(?!<)|\\{char}{escaped_quotes}|{_escape}|\\.)*\}}', String.Interpol),
            (r'[\\&{}<]', token)
        ]
        return state

    def _make_tag_state(triple, double, _escape=_escape):
        char = r'"' if double else r"'"
        quantifier = r'{3,}' if triple else r''
        state_name = '{}{}qt'.format('t' if triple else '', 'd' if double else 's')
        token = String.Double if double else String.Single
        escaped_quotes = rf'+|{char}(?!{char}{{2}})' if triple else r''
        return [
            (rf'{char}{quantifier}', token, '#pop:2'),
            (r'(\s|\\\n)+', Text),
            (r'(=)(\\?")', bygroups(Punctuation, String.Double),
             f'dqs/{state_name}'),
            (r"(=)(\\?')", bygroups(Punctuation, String.Single),
             f'sqs/{state_name}'),
            (r'=', Punctuation, f'uqs/{state_name}'),
            (r'\\?>', Name.Tag, '#pop'),
            (rf'\{{([^}}<\\{char}]|<(?!<)|\\{char}{escaped_quotes}|{_escape}|\\.)*\}}', String.Interpol),
            (rf'([^\s=><\\{char}]|<(?!<)|\\{char}{escaped_quotes}|{_escape}|\\.)+', Name.Attribute),
            include('s/escape'),
            include('s/verbatim'),
            include('s/entity'),
            (r'[\\{}&]', Name.Attribute)
        ]

    def _make_attribute_value_state(terminator, host_triple, host_double,
                                    _escape=_escape):
        token = (String.Double if terminator == r'"' else
                 String.Single if terminator == r"'" else String.Other)
        host_char = r'"' if host_double else r"'"
        host_quantifier = r'{3,}' if host_triple else r''
        host_token = String.Double if host_double else String.Single
        escaped_quotes = (rf'+|{host_char}(?!{host_char}{{2}})'
                          if host_triple else r'')
        return [
            (rf'{host_char}{host_quantifier}', host_token, '#pop:3'),
            (r'{}{}'.format(r'' if token is String.Other else r'\\?', terminator),
             token, '#pop'),
            include('s/verbatim'),
            include('s/entity'),
            (rf'\{{([^}}<\\{host_char}]|<(?!<)|\\{host_char}{escaped_quotes}|{_escape}|\\.)*\}}', String.Interpol),
            (r'([^\s"\'<%s{}\\&])+' % (r'>' if token is String.Other else r''),
             token),
            include('s/escape'),
            (r'["\'\s&{<}\\]', token)
        ]

    tokens = {
        'root': [
            ('\ufeff', Text),
            (r'\{', Punctuation, 'object-body'),
            (r';+', Punctuation),
            (r'(?=(argcount|break|case|catch|continue|default|definingobj|'
             r'delegated|do|else|for|foreach|finally|goto|if|inherited|'
             r'invokee|local|nil|new|operator|replaced|return|self|switch|'
             r'targetobj|targetprop|throw|true|try|while)\b)', Text, 'block'),
            (rf'({_name})({_ws}*)(\()',
             bygroups(Name.Function, using(this, state='whitespace'),
                      Punctuation),
             ('block?/root', 'more/parameters', 'main/parameters')),
            include('whitespace'),
            (r'\++', Punctuation),
            (r'[^\s!"%-(*->@-_a-z{-~]+', Error),  # Averts an infinite loop
            (r'(?!\Z)', Text, 'main/root')
        ],
        'main/root': [
            include('main/basic'),
            default(('#pop', 'object-body/no-braces', 'classes', 'class'))
        ],
        'object-body/no-braces': [
            (r';', Punctuation, '#pop'),
            (r'\{', Punctuation, ('#pop', 'object-body')),
            include('object-body')
        ],
        'object-body': [
            (r';', Punctuation),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
            (r':', Punctuation, ('classes', 'class')),
            (rf'({_name}?)({_ws}*)(\()',
             bygroups(Name.Function, using(this, state='whitespace'),
                      Punctuation),
             ('block?', 'more/parameters', 'main/parameters')),
            (rf'({_name})({_ws}*)(\{{)',
             bygroups(Name.Function, using(this, state='whitespace'),
                      Punctuation), 'block'),
            (rf'({_name})({_ws}*)(:)',
             bygroups(Name.Variable, using(this, state='whitespace'),
                      Punctuation),
             ('object-body/no-braces', 'classes', 'class')),
            include('whitespace'),
            (rf'->|{_operator}', Punctuation, 'main'),
            default('main/object-body')
        ],
        'main/object-body': [
            include('main/basic'),
            (rf'({_name})({_ws}*)(=?)',
             bygroups(Name.Variable, using(this, state='whitespace'),
                      Punctuation), ('#pop', 'more', 'main')),
            default('#pop:2')
        ],
        'block?/root': [
            (r'\{', Punctuation, ('#pop', 'block')),
            include('whitespace'),
            (r'(?=[\[\'"<(:])', Text,  # It might be a VerbRule macro.
             ('#pop', 'object-body/no-braces', 'grammar', 'grammar-rules')),
            # It might be a macro like DefineAction.
            default(('#pop', 'object-body/no-braces'))
        ],
        'block?': [
            (r'\{', Punctuation, ('#pop', 'block')),
            include('whitespace'),
            default('#pop')
        ],
        'block/basic': [
            (r'[;:]+', Punctuation),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
            (r'default\b', Keyword.Reserved),
            (rf'({_name})({_ws}*)(:)',
             bygroups(Name.Label, using(this, state='whitespace'),
                      Punctuation)),
            include('whitespace')
        ],
        'block': [
            include('block/basic'),
            (r'(?!\Z)', Text, ('more', 'main'))
        ],
        'block/embed': [
            (r'>>', String.Interpol, '#pop'),
            include('block/basic'),
            (r'(?!\Z)', Text, ('more/embed', 'main'))
        ],
        'main/basic': [
            include('whitespace'),
            (r'\(', Punctuation, ('#pop', 'more', 'main')),
            (r'\[', Punctuation, ('#pop', 'more/list', 'main')),
            (r'\{', Punctuation, ('#pop', 'more/inner', 'main/inner',
                                  'more/parameters', 'main/parameters')),
            (r'\*|\.{3}', Punctuation, '#pop'),
            (r'(?i)0x[\da-f]+', Number.Hex, '#pop'),
            (r'(\d+\.(?!\.)\d*|\.\d+)([eE][-+]?\d+)?|\d+[eE][-+]?\d+',
             Number.Float, '#pop'),
            (r'0[0-7]+', Number.Oct, '#pop'),
            (r'\d+', Number.Integer, '#pop'),
            (r'"""', String.Double, ('#pop', 'tdqs')),
            (r"'''", String.Single, ('#pop', 'tsqs')),
            (r'"', String.Double, ('#pop', 'dqs')),
            (r"'", String.Single, ('#pop', 'sqs')),
            (r'R"""', String.Regex, ('#pop', 'tdqr')),
            (r"R'''", String.Regex, ('#pop', 'tsqr')),
            (r'R"', String.Regex, ('#pop', 'dqr')),
            (r"R'", String.Regex, ('#pop', 'sqr')),
            # Two-token keywords
            (rf'(extern)({_ws}+)(object\b)',
             bygroups(Keyword.Reserved, using(this, state='whitespace'),
                      Keyword.Reserved)),
            (rf'(function|method)({_ws}*)(\()',
             bygroups(Keyword.Reserved, using(this, state='whitespace'),
                      Punctuation),
             ('#pop', 'block?', 'more/parameters', 'main/parameters')),
            (rf'(modify)({_ws}+)(grammar\b)',
             bygroups(Keyword.Reserved, using(this, state='whitespace'),
                      Keyword.Reserved),
             ('#pop', 'object-body/no-braces', ':', 'grammar')),
            (rf'(new)({_ws}+(?=(?:function|method)\b))',
             bygroups(Keyword.Reserved, using(this, state='whitespace'))),
            (rf'(object)({_ws}+)(template\b)',
             bygroups(Keyword.Reserved, using(this, state='whitespace'),
                      Keyword.Reserved), ('#pop', 'template')),
            (rf'(string)({_ws}+)(template\b)',
             bygroups(Keyword, using(this, state='whitespace'),
                      Keyword.Reserved), ('#pop', 'function-name')),
            # Keywords
            (r'(argcount|definingobj|invokee|replaced|targetobj|targetprop)\b',
             Name.Builtin, '#pop'),
            (r'(break|continue|goto)\b', Keyword.Reserved, ('#pop', 'label')),
            (r'(case|extern|if|intrinsic|return|static|while)\b',
             Keyword.Reserved),
            (r'catch\b', Keyword.Reserved, ('#pop', 'catch')),
            (r'class\b', Keyword.Reserved,
             ('#pop', 'object-body/no-braces', 'class')),
            (r'(default|do|else|finally|try)\b', Keyword.Reserved, '#pop'),
            (r'(dictionary|property)\b', Keyword.Reserved,
             ('#pop', 'constants')),
            (r'enum\b', Keyword.Reserved, ('#pop', 'enum')),
            (r'export\b', Keyword.Reserved, ('#pop', 'main')),
            (r'(for|foreach)\b', Keyword.Reserved,
             ('#pop', 'more/inner', 'main/inner')),
            (r'(function|method)\b', Keyword.Reserved,
             ('#pop', 'block?', 'function-name')),
            (r'grammar\b', Keyword.Reserved,
             ('#pop', 'object-body/no-braces', 'grammar')),
            (r'inherited\b', Keyword.Reserved, ('#pop', 'inherited')),
            (r'local\b', Keyword.Reserved,
             ('#pop', 'more/local', 'main/local')),
            (r'(modify|replace|switch|throw|transient)\b', Keyword.Reserved,
             '#pop'),
            (r'new\b', Keyword.Reserved, ('#pop', 'class')),
            (r'(nil|true)\b', Keyword.Constant, '#pop'),
            (r'object\b', Keyword.Reserved, ('#pop', 'object-body/no-braces')),
            (r'operator\b', Keyword.Reserved, ('#pop', 'operator')),
            (r'propertyset\b', Keyword.Reserved,
             ('#pop', 'propertyset', 'main')),
            (r'self\b', Name.Builtin.Pseudo, '#pop'),
            (r'template\b', Keyword.Reserved, ('#pop', 'template')),
            # Operators
            (rf'(__objref|defined)({_ws}*)(\()',
             bygroups(Operator.Word, using(this, state='whitespace'),
                      Operator), ('#pop', 'more/__objref', 'main')),
            (r'delegated\b', Operator.Word),
            # Compiler-defined macros and built-in properties
            (r'(__DATE__|__DEBUG|__LINE__|__FILE__|'
             r'__TADS_MACRO_FORMAT_VERSION|__TADS_SYS_\w*|__TADS_SYSTEM_NAME|'
             r'__TADS_VERSION_MAJOR|__TADS_VERSION_MINOR|__TADS3|__TIME__|'
             r'construct|finalize|grammarInfo|grammarTag|lexicalParent|'
             r'miscVocab|sourceTextGroup|sourceTextGroupName|'
             r'sourceTextGroupOrder|sourceTextOrder)\b', Name.Builtin, '#pop')
        ],
        'main': [
            include('main/basic'),
            (_name, Name, '#pop'),
            default('#pop')
        ],
        'more/basic': [
            (r'\(', Punctuation, ('more/list', 'main')),
            (r'\[', Punctuation, ('more', 'main')),
            (r'\.{3}', Punctuation),
            (r'->|\.\.', Punctuation, 'main'),
            (r'(?=;)|[:)\]]', Punctuation, '#pop'),
            include('whitespace'),
            (_operator, Operator, 'main'),
            (r'\?', Operator, ('main', 'more/conditional', 'main')),
            (rf'(is|not)({_ws}+)(in\b)',
             bygroups(Operator.Word, using(this, state='whitespace'),
                      Operator.Word)),
            (r'[^\s!"%-_a-z{-~]+', Error)  # Averts an infinite loop
        ],
        'more': [
            include('more/basic'),
            default('#pop')
        ],
        # Then expression (conditional operator)
        'more/conditional': [
            (r':(?!:)', Operator, '#pop'),
            include('more')
        ],
        # Embedded expressions
        'more/embed': [
            (r'>>', String.Interpol, '#pop:2'),
            include('more')
        ],
        # For/foreach loop initializer or short-form anonymous function
        'main/inner': [
            (r'\(', Punctuation, ('#pop', 'more/inner', 'main/inner')),
            (r'local\b', Keyword.Reserved, ('#pop', 'main/local')),
            include('main')
        ],
        'more/inner': [
            (r'\}', Punctuation, '#pop'),
            (r',', Punctuation, 'main/inner'),
            (r'(in|step)\b', Keyword, 'main/inner'),
            include('more')
        ],
        # Local
        'main/local': [
            (_name, Name.Variable, '#pop'),
            include('whitespace')
        ],
        'more/local': [
            (r',', Punctuation, 'main/local'),
            include('more')
        ],
        # List
        'more/list': [
            (r'[,:]', Punctuation, 'main'),
            include('more')
        ],
        # Parameter list
        'main/parameters': [
            (rf'({_name})({_ws}*)(?=:)',
             bygroups(Name.Variable, using(this, state='whitespace')), '#pop'),
            (rf'({_name})({_ws}+)({_name})',
             bygroups(Name.Class, using(this, state='whitespace'),
                      Name.Variable), '#pop'),
            (r'\[+', Punctuation),
            include('main/basic'),
            (_name, Name.Variable, '#pop'),
            default('#pop')
        ],
        'more/parameters': [
            (rf'(:)({_ws}*(?=[?=,:)]))',
             bygroups(Punctuation, using(this, state='whitespace'))),
            (r'[?\]]+', Punctuation),
            (r'[:)]', Punctuation, ('#pop', 'multimethod?')),
            (r',', Punctuation, 'main/parameters'),
            (r'=', Punctuation, ('more/parameter', 'main')),
            include('more')
        ],
        'more/parameter': [
            (r'(?=[,)])', Text, '#pop'),
            include('more')
        ],
        'multimethod?': [
            (r'multimethod\b', Keyword, '#pop'),
            include('whitespace'),
            default('#pop')
        ],

        # Statements and expressions
        'more/__objref': [
            (r',', Punctuation, 'mode'),
            (r'\)', Operator, '#pop'),
            include('more')
        ],
        'mode': [
            (r'(error|warn)\b', Keyword, '#pop'),
            include('whitespace')
        ],
        'catch': [
            (r'\(+', Punctuation),
            (_name, Name.Exception, ('#pop', 'variables')),
            include('whitespace')
        ],
        'enum': [
            include('whitespace'),
            (r'token\b', Keyword, ('#pop', 'constants')),
            default(('#pop', 'constants'))
        ],
        'grammar': [
            (r'\)+', Punctuation),
            (r'\(', Punctuation, 'grammar-tag'),
            (r':', Punctuation, 'grammar-rules'),
            (_name, Name.Class),
            include('whitespace')
        ],
        'grammar-tag': [
            include('whitespace'),
            (r'"""([^\\"<]|""?(?!")|\\"+|\\.|<(?!<))+("{3,}|<<)|'
             r'R"""([^\\"]|""?(?!")|\\"+|\\.)+"{3,}|'
             r"'''([^\\'<]|''?(?!')|\\'+|\\.|<(?!<))+('{3,}|<<)|"
             r"R'''([^\\']|''?(?!')|\\'+|\\.)+'{3,}|"
             r'"([^\\"<]|\\.|<(?!<))+("|<<)|R"([^\\"]|\\.)+"|'
             r"'([^\\'<]|\\.|<(?!<))+('|<<)|R'([^\\']|\\.)+'|"
             r"([^)\s\\/]|/(?![/*]))+|\)", String.Other, '#pop')
        ],
        'grammar-rules': [
            include('string'),
            include('whitespace'),
            (rf'(\[)({_ws}*)(badness)',
             bygroups(Punctuation, using(this, state='whitespace'), Keyword),
             'main'),
            (rf'->|{_operator}|[()]', Punctuation),
            (_name, Name.Constant),
            default('#pop:2')
        ],
        ':': [
            (r':', Punctuation, '#pop')
        ],
        'function-name': [
            (r'(<<([^>]|>>>|>(?!>))*>>)+', String.Interpol),
            (rf'(?={_name}?{_ws}*[({{])', Text, '#pop'),
            (_name, Name.Function, '#pop'),
            include('whitespace')
        ],
        'inherited': [
            (r'<', Punctuation, ('#pop', 'classes', 'class')),
            include('whitespace'),
            (_name, Name.Class, '#pop'),
            default('#pop')
        ],
        'operator': [
            (r'negate\b', Operator.Word, '#pop'),
            include('whitespace'),
            (_operator, Operator),
            default('#pop')
        ],
        'propertyset': [
            (r'\(', Punctuation, ('more/parameters', 'main/parameters')),
            (r'\{', Punctuation, ('#pop', 'object-body')),
            include('whitespace')
        ],
        'template': [
            (r'(?=;)', Text, '#pop'),
            include('string'),
            (r'inherited\b', Keyword.Reserved),
            include('whitespace'),
            (rf'->|\?|{_operator}', Punctuation),
            (_name, Name.Variable)
        ],

        # Identifiers
        'class': [
            (r'\*|\.{3}', Punctuation, '#pop'),
            (r'object\b', Keyword.Reserved, '#pop'),
            (r'transient\b', Keyword.Reserved),
            (_name, Name.Class, '#pop'),
            include('whitespace'),
            default('#pop')
        ],
        'classes': [
            (r'[:,]', Punctuation, 'class'),
            include('whitespace'),
            (r'>', Punctuation, '#pop'),
            default('#pop')
        ],
        'constants': [
            (r',+', Punctuation),
            (r';', Punctuation, '#pop'),
            (r'property\b', Keyword.Reserved),
            (_name, Name.Constant),
            include('whitespace')
        ],
        'label': [
            (_name, Name.Label, '#pop'),
            include('whitespace'),
            default('#pop')
        ],
        'variables': [
            (r',+', Punctuation),
            (r'\)', Punctuation, '#pop'),
            include('whitespace'),
            (_name, Name.Variable)
        ],

        # Whitespace and comments
        'whitespace': [
            (rf'^{_ws_pp}*#({_comment_multiline}|[^\n]|(?<=\\)\n)*\n?',
             Comment.Preproc),
            (_comment_single, Comment.Single),
            (_comment_multiline, Comment.Multiline),
            (rf'\\+\n+{_ws_pp}*#?|\n+|([^\S\n]|\\)+', Text)
        ],

        # Strings
        'string': [
            (r'"""', String.Double, 'tdqs'),
            (r"'''", String.Single, 'tsqs'),
            (r'"', String.Double, 'dqs'),
            (r"'", String.Single, 'sqs')
        ],
        's/escape': [
            (rf'\{{\{{|\}}\}}|{_escape}', String.Escape)
        ],
        's/verbatim': [
            (r'<<\s*(as\s+decreasingly\s+likely\s+outcomes|cycling|else|end|'
             r'first\s+time|one\s+of|only|or|otherwise|'
             r'(sticky|(then\s+)?(purely\s+)?at)\s+random|stopping|'
             r'(then\s+)?(half\s+)?shuffled|\|\|)\s*>>', String.Interpol),
            (rf'<<(%(_({_escape}|\\?.)|[\-+ ,#]|\[\d*\]?)*\d*\.?\d*({_escape}|\\?.)|'
             r'\s*((else|otherwise)\s+)?(if|unless)\b)?',
             String.Interpol, ('block/embed', 'more/embed', 'main'))
        ],
        's/entity': [
            (r'(?i)&(#(x[\da-f]+|\d+)|[a-z][\da-z]*);?', Name.Entity)
        ],
        'tdqs': _make_string_state(True, True),
        'tsqs': _make_string_state(True, False),
        'dqs': _make_string_state(False, True),
        'sqs': _make_string_state(False, False),
        'tdqs/listing': _make_string_state(True, True, 'listing'),
        'tsqs/listing': _make_string_state(True, False, 'listing'),
        'dqs/listing': _make_string_state(False, True, 'listing'),
        'sqs/listing': _make_string_state(False, False, 'listing'),
        'tdqs/xmp': _make_string_state(True, True, 'xmp'),
        'tsqs/xmp': _make_string_state(True, False, 'xmp'),
        'dqs/xmp': _make_string_state(False, True, 'xmp'),
        'sqs/xmp': _make_string_state(False, False, 'xmp'),

        # Tags
        'tdqt': _make_tag_state(True, True),
        'tsqt': _make_tag_state(True, False),
        'dqt': _make_tag_state(False, True),
        'sqt': _make_tag_state(False, False),
        'dqs/tdqt': _make_attribute_value_state(r'"', True, True),
        'dqs/tsqt': _make_attribute_value_state(r'"', True, False),
        'dqs/dqt': _make_attribute_value_state(r'"', False, True),
        'dqs/sqt': _make_attribute_value_state(r'"', False, False),
        'sqs/tdqt': _make_attribute_value_state(r"'", True, True),
        'sqs/tsqt': _make_attribute_value_state(r"'", True, False),
        'sqs/dqt': _make_attribute_value_state(r"'", False, True),
        'sqs/sqt': _make_attribute_value_state(r"'", False, False),
        'uqs/tdqt': _make_attribute_value_state(_no_quote, True, True),
        'uqs/tsqt': _make_attribute_value_state(_no_quote, True, False),
        'uqs/dqt': _make_attribute_value_state(_no_quote, False, True),
        'uqs/sqt': _make_attribute_value_state(_no_quote, False, False),

        # Regular expressions
        'tdqr': [
            (r'[^\\"]+', String.Regex),
            (r'\\"*', String.Regex),
            (r'"{3,}', String.Regex, '#pop'),
            (r'"', String.Regex)
        ],
        'tsqr': [
            (r"[^\\']+", String.Regex),
            (r"\\'*", String.Regex),
            (r"'{3,}", String.Regex, '#pop'),
            (r"'", String.Regex)
        ],
        'dqr': [
            (r'[^\\"]+', String.Regex),
            (r'\\"?', String.Regex),
            (r'"', String.Regex, '#pop')
        ],
        'sqr': [
            (r"[^\\']+", String.Regex),
            (r"\\'?", String.Regex),
            (r"'", String.Regex, '#pop')
        ]
    }

    def get_tokens_unprocessed(self, text, **kwargs):
        pp = rf'^{self._ws_pp}*#{self._ws_pp}*'
        if_false_level = 0
        for index, token, value in (
            RegexLexer.get_tokens_unprocessed(self, text, **kwargs)):
            if if_false_level == 0:  # Not in a false #if
                if (token is Comment.Preproc and
                    re.match(rf'{pp}if{self._ws_pp}+(0|nil){self._ws_pp}*$\n?', value)):
                    if_false_level = 1
            else:  # In a false #if
                if token is Comment.Preproc:
                    if (if_false_level == 1 and
                          re.match(rf'{pp}el(if|se)\b', value)):
                        if_false_level = 0
                    elif re.match(rf'{pp}if', value):
                        if_false_level += 1
                    elif re.match(rf'{pp}endif\b', value):
                        if_false_level -= 1
                else:
                    token = Comment
            yield index, token, value

    def analyse_text(text):
        """This is a rather generic descriptive language without strong
        identifiers. It looks like a 'GameMainDef' has to be present,
        and/or a 'versionInfo' with an 'IFID' field."""
        result = 0
        if '__TADS' in text or 'GameMainDef' in text:
            result += 0.2

        # This is a fairly unique keyword which is likely used in source as well
        if 'versionInfo' in text and 'IFID' in text:
            result += 0.1

        return result
