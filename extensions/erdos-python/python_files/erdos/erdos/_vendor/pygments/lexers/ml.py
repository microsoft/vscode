"""
    pygments.lexers.ml
    ~~~~~~~~~~~~~~~~~~

    Lexers for ML family languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, default, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Error

__all__ = ['SMLLexer', 'OcamlLexer', 'OpaLexer', 'ReasonLexer', 'FStarLexer']


class SMLLexer(RegexLexer):
    """
    For the Standard ML language.
    """

    name = 'Standard ML'
    aliases = ['sml']
    filenames = ['*.sml', '*.sig', '*.fun']
    mimetypes = ['text/x-standardml', 'application/x-standardml']
    url = 'https://en.wikipedia.org/wiki/Standard_ML'
    version_added = '1.5'

    alphanumid_reserved = {
        # Core
        'abstype', 'and', 'andalso', 'as', 'case', 'datatype', 'do', 'else',
        'end', 'exception', 'fn', 'fun', 'handle', 'if', 'in', 'infix',
        'infixr', 'let', 'local', 'nonfix', 'of', 'op', 'open', 'orelse',
        'raise', 'rec', 'then', 'type', 'val', 'with', 'withtype', 'while',
        # Modules
        'eqtype', 'functor', 'include', 'sharing', 'sig', 'signature',
        'struct', 'structure', 'where',
    }

    symbolicid_reserved = {
        # Core
        ':', r'\|', '=', '=>', '->', '#',
        # Modules
        ':>',
    }

    nonid_reserved = {'(', ')', '[', ']', '{', '}', ',', ';', '...', '_'}

    alphanumid_re = r"[a-zA-Z][\w']*"
    symbolicid_re = r"[!%&$#+\-/:<=>?@\\~`^|*]+"

    # A character constant is a sequence of the form #s, where s is a string
    # constant denoting a string of size one character. This setup just parses
    # the entire string as either a String.Double or a String.Char (depending
    # on the argument), even if the String.Char is an erroneous
    # multiple-character string.
    def stringy(whatkind):
        return [
            (r'[^"\\]', whatkind),
            (r'\\[\\"abtnvfr]', String.Escape),
            # Control-character notation is used for codes < 32,
            # where \^@ == \000
            (r'\\\^[\x40-\x5e]', String.Escape),
            # Docs say 'decimal digits'
            (r'\\[0-9]{3}', String.Escape),
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\\s+\\', String.Interpol),
            (r'"', whatkind, '#pop'),
        ]

    # Callbacks for distinguishing tokens and reserved words
    def long_id_callback(self, match):
        if match.group(1) in self.alphanumid_reserved:
            token = Error
        else:
            token = Name.Namespace
        yield match.start(1), token, match.group(1)
        yield match.start(2), Punctuation, match.group(2)

    def end_id_callback(self, match):
        if match.group(1) in self.alphanumid_reserved:
            token = Error
        elif match.group(1) in self.symbolicid_reserved:
            token = Error
        else:
            token = Name
        yield match.start(1), token, match.group(1)

    def id_callback(self, match):
        str = match.group(1)
        if str in self.alphanumid_reserved:
            token = Keyword.Reserved
        elif str in self.symbolicid_reserved:
            token = Punctuation
        else:
            token = Name
        yield match.start(1), token, str

    tokens = {
        # Whitespace and comments are (almost) everywhere
        'whitespace': [
            (r'\s+', Text),
            (r'\(\*', Comment.Multiline, 'comment'),
        ],

        'delimiters': [
            # This lexer treats these delimiters specially:
            # Delimiters define scopes, and the scope is how the meaning of
            # the `|' is resolved - is it a case/handle expression, or function
            # definition by cases? (This is not how the Definition works, but
            # it's how MLton behaves, see http://mlton.org/SMLNJDeviations)
            (r'\(|\[|\{', Punctuation, 'main'),
            (r'\)|\]|\}', Punctuation, '#pop'),
            (r'\b(let|if|local)\b(?!\')', Keyword.Reserved, ('main', 'main')),
            (r'\b(struct|sig|while)\b(?!\')', Keyword.Reserved, 'main'),
            (r'\b(do|else|end|in|then)\b(?!\')', Keyword.Reserved, '#pop'),
        ],

        'core': [
            # Punctuation that doesn't overlap symbolic identifiers
            (r'({})'.format('|'.join(re.escape(z) for z in nonid_reserved)),
             Punctuation),

            # Special constants: strings, floats, numbers in decimal and hex
            (r'#"', String.Char, 'char'),
            (r'"', String.Double, 'string'),
            (r'~?0x[0-9a-fA-F]+', Number.Hex),
            (r'0wx[0-9a-fA-F]+', Number.Hex),
            (r'0w\d+', Number.Integer),
            (r'~?\d+\.\d+[eE]~?\d+', Number.Float),
            (r'~?\d+\.\d+', Number.Float),
            (r'~?\d+[eE]~?\d+', Number.Float),
            (r'~?\d+', Number.Integer),

            # Labels
            (r'#\s*[1-9][0-9]*', Name.Label),
            (rf'#\s*({alphanumid_re})', Name.Label),
            (rf'#\s+({symbolicid_re})', Name.Label),
            # Some reserved words trigger a special, local lexer state change
            (r'\b(datatype|abstype)\b(?!\')', Keyword.Reserved, 'dname'),
            (r'\b(exception)\b(?!\')', Keyword.Reserved, 'ename'),
            (r'\b(functor|include|open|signature|structure)\b(?!\')',
             Keyword.Reserved, 'sname'),
            (r'\b(type|eqtype)\b(?!\')', Keyword.Reserved, 'tname'),

            # Regular identifiers, long and otherwise
            (r'\'[\w\']*', Name.Decorator),
            (rf'({alphanumid_re})(\.)', long_id_callback, "dotted"),
            (rf'({alphanumid_re})', id_callback),
            (rf'({symbolicid_re})', id_callback),
        ],
        'dotted': [
            (rf'({alphanumid_re})(\.)', long_id_callback),
            (rf'({alphanumid_re})', end_id_callback, "#pop"),
            (rf'({symbolicid_re})', end_id_callback, "#pop"),
            (r'\s+', Error),
            (r'\S+', Error),
        ],


        # Main parser (prevents errors in files that have scoping errors)
        'root': [
            default('main')
        ],

        # In this scope, I expect '|' to not be followed by a function name,
        # and I expect 'and' to be followed by a binding site
        'main': [
            include('whitespace'),

            # Special behavior of val/and/fun
            (r'\b(val|and)\b(?!\')', Keyword.Reserved, 'vname'),
            (r'\b(fun)\b(?!\')', Keyword.Reserved,
             ('#pop', 'main-fun', 'fname')),

            include('delimiters'),
            include('core'),
            (r'\S+', Error),
        ],

        # In this scope, I expect '|' and 'and' to be followed by a function
        'main-fun': [
            include('whitespace'),

            (r'\s', Text),
            (r'\(\*', Comment.Multiline, 'comment'),

            # Special behavior of val/and/fun
            (r'\b(fun|and)\b(?!\')', Keyword.Reserved, 'fname'),
            (r'\b(val)\b(?!\')', Keyword.Reserved,
             ('#pop', 'main', 'vname')),

            # Special behavior of '|' and '|'-manipulating keywords
            (r'\|', Punctuation, 'fname'),
            (r'\b(case|handle)\b(?!\')', Keyword.Reserved,
             ('#pop', 'main')),

            include('delimiters'),
            include('core'),
            (r'\S+', Error),
        ],

        # Character and string parsers
        'char': stringy(String.Char),
        'string': stringy(String.Double),

        'breakout': [
            (r'(?=\b({})\b(?!\'))'.format('|'.join(alphanumid_reserved)), Text, '#pop'),
        ],

        # Dealing with what comes after module system keywords
        'sname': [
            include('whitespace'),
            include('breakout'),

            (rf'({alphanumid_re})', Name.Namespace),
            default('#pop'),
        ],

        # Dealing with what comes after the 'fun' (or 'and' or '|') keyword
        'fname': [
            include('whitespace'),
            (r'\'[\w\']*', Name.Decorator),
            (r'\(', Punctuation, 'tyvarseq'),

            (rf'({alphanumid_re})', Name.Function, '#pop'),
            (rf'({symbolicid_re})', Name.Function, '#pop'),

            # Ignore interesting function declarations like "fun (x + y) = ..."
            default('#pop'),
        ],

        # Dealing with what comes after the 'val' (or 'and') keyword
        'vname': [
            include('whitespace'),
            (r'\'[\w\']*', Name.Decorator),
            (r'\(', Punctuation, 'tyvarseq'),

            (rf'({alphanumid_re})(\s*)(=(?!{symbolicid_re}))',
             bygroups(Name.Variable, Text, Punctuation), '#pop'),
            (rf'({symbolicid_re})(\s*)(=(?!{symbolicid_re}))',
             bygroups(Name.Variable, Text, Punctuation), '#pop'),
            (rf'({alphanumid_re})', Name.Variable, '#pop'),
            (rf'({symbolicid_re})', Name.Variable, '#pop'),

            # Ignore interesting patterns like 'val (x, y)'
            default('#pop'),
        ],

        # Dealing with what comes after the 'type' (or 'and') keyword
        'tname': [
            include('whitespace'),
            include('breakout'),

            (r'\'[\w\']*', Name.Decorator),
            (r'\(', Punctuation, 'tyvarseq'),
            (rf'=(?!{symbolicid_re})', Punctuation, ('#pop', 'typbind')),

            (rf'({alphanumid_re})', Keyword.Type),
            (rf'({symbolicid_re})', Keyword.Type),
            (r'\S+', Error, '#pop'),
        ],

        # A type binding includes most identifiers
        'typbind': [
            include('whitespace'),

            (r'\b(and)\b(?!\')', Keyword.Reserved, ('#pop', 'tname')),

            include('breakout'),
            include('core'),
            (r'\S+', Error, '#pop'),
        ],

        # Dealing with what comes after the 'datatype' (or 'and') keyword
        'dname': [
            include('whitespace'),
            include('breakout'),

            (r'\'[\w\']*', Name.Decorator),
            (r'\(', Punctuation, 'tyvarseq'),
            (r'(=)(\s*)(datatype)',
             bygroups(Punctuation, Text, Keyword.Reserved), '#pop'),
            (rf'=(?!{symbolicid_re})', Punctuation,
             ('#pop', 'datbind', 'datcon')),

            (rf'({alphanumid_re})', Keyword.Type),
            (rf'({symbolicid_re})', Keyword.Type),
            (r'\S+', Error, '#pop'),
        ],

        # common case - A | B | C of int
        'datbind': [
            include('whitespace'),

            (r'\b(and)\b(?!\')', Keyword.Reserved, ('#pop', 'dname')),
            (r'\b(withtype)\b(?!\')', Keyword.Reserved, ('#pop', 'tname')),
            (r'\b(of)\b(?!\')', Keyword.Reserved),

            (rf'(\|)(\s*)({alphanumid_re})',
             bygroups(Punctuation, Text, Name.Class)),
            (rf'(\|)(\s+)({symbolicid_re})',
             bygroups(Punctuation, Text, Name.Class)),

            include('breakout'),
            include('core'),
            (r'\S+', Error),
        ],

        # Dealing with what comes after an exception
        'ename': [
            include('whitespace'),

            (rf'(and\b)(\s+)({alphanumid_re})',
             bygroups(Keyword.Reserved, Text, Name.Class)),
            (rf'(and\b)(\s*)({symbolicid_re})',
             bygroups(Keyword.Reserved, Text, Name.Class)),
            (r'\b(of)\b(?!\')', Keyword.Reserved),
            (rf'({alphanumid_re})|({symbolicid_re})', Name.Class),

            default('#pop'),
        ],

        'datcon': [
            include('whitespace'),
            (rf'({alphanumid_re})', Name.Class, '#pop'),
            (rf'({symbolicid_re})', Name.Class, '#pop'),
            (r'\S+', Error, '#pop'),
        ],

        # Series of type variables
        'tyvarseq': [
            (r'\s', Text),
            (r'\(\*', Comment.Multiline, 'comment'),

            (r'\'[\w\']*', Name.Decorator),
            (alphanumid_re, Name),
            (r',', Punctuation),
            (r'\)', Punctuation, '#pop'),
            (symbolicid_re, Name),
        ],

        'comment': [
            (r'[^(*)]', Comment.Multiline),
            (r'\(\*', Comment.Multiline, '#push'),
            (r'\*\)', Comment.Multiline, '#pop'),
            (r'[(*)]', Comment.Multiline),
        ],
    }


class OcamlLexer(RegexLexer):
    """
    For the OCaml language.
    """

    name = 'OCaml'
    url = 'https://ocaml.org/'
    aliases = ['ocaml']
    filenames = ['*.ml', '*.mli', '*.mll', '*.mly']
    mimetypes = ['text/x-ocaml']
    version_added = '0.7'

    keywords = (
        'and', 'as', 'assert', 'begin', 'class', 'constraint', 'do', 'done',
        'downto', 'else', 'end', 'exception', 'external', 'false',
        'for', 'fun', 'function', 'functor', 'if', 'in', 'include',
        'inherit', 'initializer', 'lazy', 'let', 'match', 'method',
        'module', 'mutable', 'new', 'object', 'of', 'open', 'private',
        'raise', 'rec', 'sig', 'struct', 'then', 'to', 'true', 'try',
        'type', 'val', 'virtual', 'when', 'while', 'with',
    )
    keyopts = (
        '!=', '#', '&', '&&', r'\(', r'\)', r'\*', r'\+', ',', '-',
        r'-\.', '->', r'\.', r'\.\.', ':', '::', ':=', ':>', ';', ';;', '<',
        '<-', '=', '>', '>]', r'>\}', r'\?', r'\?\?', r'\[', r'\[<', r'\[>',
        r'\[\|', ']', '_', '`', r'\{', r'\{<', r'\|', r'\|]', r'\}', '~'
    )

    operators = r'[!$%&*+\./:<=>?@^|~-]'
    word_operators = ('asr', 'land', 'lor', 'lsl', 'lxor', 'mod', 'or')
    prefix_syms = r'[!?~]'
    infix_syms = r'[=<>@^|&+\*/$%-]'
    primitives = ('unit', 'int', 'float', 'bool', 'string', 'char', 'list', 'array')

    tokens = {
        'escape-sequence': [
            (r'\\[\\"\'ntbr]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
        ],
        'root': [
            (r'\s+', Text),
            (r'false|true|\(\)|\[\]', Name.Builtin.Pseudo),
            (r'\b([A-Z][\w\']*)(?=\s*\.)', Name.Namespace, 'dotted'),
            (r'\b([A-Z][\w\']*)', Name.Class),
            (r'\(\*(?![)])', Comment, 'comment'),
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
            (r'({})'.format('|'.join(keyopts[::-1])), Operator),
            (rf'({infix_syms}|{prefix_syms})?{operators}', Operator),
            (r'\b({})\b'.format('|'.join(word_operators)), Operator.Word),
            (r'\b({})\b'.format('|'.join(primitives)), Keyword.Type),

            (r"[^\W\d][\w']*", Name),

            (r'-?\d[\d_]*(.[\d_]*)?([eE][+\-]?\d[\d_]*)', Number.Float),
            (r'0[xX][\da-fA-F][\da-fA-F_]*', Number.Hex),
            (r'0[oO][0-7][0-7_]*', Number.Oct),
            (r'0[bB][01][01_]*', Number.Bin),
            (r'\d[\d_]*', Number.Integer),

            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2}))'",
             String.Char),
            (r"'.'", String.Char),
            (r"'", Keyword),  # a stray quote is another syntax element

            (r'"', String.Double, 'string'),

            (r'[~?][a-z][\w\']*:', Name.Variable),
        ],
        'comment': [
            (r'[^(*)]+', Comment),
            (r'\(\*', Comment, '#push'),
            (r'\*\)', Comment, '#pop'),
            (r'[(*)]', Comment),
        ],
        'string': [
            (r'[^\\"]+', String.Double),
            include('escape-sequence'),
            (r'\\\n', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'dotted': [
            (r'\s+', Text),
            (r'\.', Punctuation),
            (r'[A-Z][\w\']*(?=\s*\.)', Name.Namespace),
            (r'[A-Z][\w\']*', Name.Class, '#pop'),
            (r'[a-z_][\w\']*', Name, '#pop'),
            default('#pop'),
        ],
    }


class OpaLexer(RegexLexer):
    """
    Lexer for the Opa language.
    """

    name = 'Opa'
    aliases = ['opa']
    filenames = ['*.opa']
    mimetypes = ['text/x-opa']
    url = 'http://opalang.org'
    version_added = '1.5'

    # most of these aren't strictly keywords
    # but if you color only real keywords, you might just
    # as well not color anything
    keywords = (
        'and', 'as', 'begin', 'case', 'client', 'css', 'database', 'db', 'do',
        'else', 'end', 'external', 'forall', 'function', 'if', 'import',
        'match', 'module', 'or', 'package', 'parser', 'rec', 'server', 'then',
        'type', 'val', 'with', 'xml_parser',
    )

    # matches both stuff and `stuff`
    ident_re = r'(([a-zA-Z_]\w*)|(`[^`]*`))'

    op_re = r'[.=\-<>,@~%/+?*&^!]'
    punc_re = r'[()\[\],;|]'  # '{' and '}' are treated elsewhere
                              # because they are also used for inserts

    tokens = {
        # copied from the caml lexer, should be adapted
        'escape-sequence': [
            (r'\\[\\"\'ntr}]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
        ],

        # factorizing these rules, because they are inserted many times
        'comments': [
            (r'/\*', Comment, 'nested-comment'),
            (r'//.*?$', Comment),
        ],
        'comments-and-spaces': [
            include('comments'),
            (r'\s+', Text),
        ],

        'root': [
            include('comments-and-spaces'),
            # keywords
            (words(keywords, prefix=r'\b', suffix=r'\b'), Keyword),
            # directives
            # we could parse the actual set of directives instead of anything
            # starting with @, but this is troublesome
            # because it needs to be adjusted all the time
            # and assuming we parse only sources that compile, it is useless
            (r'@' + ident_re + r'\b', Name.Builtin.Pseudo),

            # number literals
            (r'-?.[\d]+([eE][+\-]?\d+)', Number.Float),
            (r'-?\d+.\d*([eE][+\-]?\d+)', Number.Float),
            (r'-?\d+[eE][+\-]?\d+', Number.Float),
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'0[oO][0-7]+', Number.Oct),
            (r'0[bB][01]+', Number.Bin),
            (r'\d+', Number.Integer),
            # color literals
            (r'#[\da-fA-F]{3,6}', Number.Integer),

            # string literals
            (r'"', String.Double, 'string'),
            # char literal, should be checked because this is the regexp from
            # the caml lexer
            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2})|.)'",
             String.Char),

            # this is meant to deal with embedded exprs in strings
            # every time we find a '}' we pop a state so that if we were
            # inside a string, we are back in the string state
            # as a consequence, we must also push a state every time we find a
            # '{' or else we will have errors when parsing {} for instance
            (r'\{', Operator, '#push'),
            (r'\}', Operator, '#pop'),

            # html literals
            # this is a much more strict that the actual parser,
            # since a<b would not be parsed as html
            # but then again, the parser is way too lax, and we can't hope
            # to have something as tolerant
            (r'<(?=[a-zA-Z>])', String.Single, 'html-open-tag'),

            # db path
            # matching the '[_]' in '/a[_]' because it is a part
            # of the syntax of the db path definition
            # unfortunately, i don't know how to match the ']' in
            # /a[1], so this is somewhat inconsistent
            (r'[@?!]?(/\w+)+(\[_\])?', Name.Variable),
            # putting the same color on <- as on db path, since
            # it can be used only to mean Db.write
            (r'<-(?!'+op_re+r')', Name.Variable),

            # 'modules'
            # although modules are not distinguished by their names as in caml
            # the standard library seems to follow the convention that modules
            # only area capitalized
            (r'\b([A-Z]\w*)(?=\.)', Name.Namespace),

            # operators
            # = has a special role because this is the only
            # way to syntactic distinguish binding constructions
            # unfortunately, this colors the equal in {x=2} too
            (r'=(?!'+op_re+r')', Keyword),
            (rf'({op_re})+', Operator),
            (rf'({punc_re})+', Operator),

            # coercions
            (r':', Operator, 'type'),
            # type variables
            # we need this rule because we don't parse specially type
            # definitions so in "type t('a) = ...", "'a" is parsed by 'root'
            ("'"+ident_re, Keyword.Type),

            # id literal, #something, or #{expr}
            (r'#'+ident_re, String.Single),
            (r'#(?=\{)', String.Single),

            # identifiers
            # this avoids to color '2' in 'a2' as an integer
            (ident_re, Text),

            # default, not sure if that is needed or not
            # (r'.', Text),
        ],

        # it is quite painful to have to parse types to know where they end
        # this is the general rule for a type
        # a type is either:
        # * -> ty
        # * type-with-slash
        # * type-with-slash -> ty
        # * type-with-slash (, type-with-slash)+ -> ty
        #
        # the code is pretty funky in here, but this code would roughly
        # translate in caml to:
        # let rec type stream =
        # match stream with
        # | [< "->";  stream >] -> type stream
        # | [< "";  stream >] ->
        #   type_with_slash stream
        #   type_lhs_1 stream;
        # and type_1 stream = ...
        'type': [
            include('comments-and-spaces'),
            (r'->', Keyword.Type),
            default(('#pop', 'type-lhs-1', 'type-with-slash')),
        ],

        # parses all the atomic or closed constructions in the syntax of type
        # expressions: record types, tuple types, type constructors, basic type
        # and type variables
        'type-1': [
            include('comments-and-spaces'),
            (r'\(', Keyword.Type, ('#pop', 'type-tuple')),
            (r'~?\{', Keyword.Type, ('#pop', 'type-record')),
            (ident_re+r'\(', Keyword.Type, ('#pop', 'type-tuple')),
            (ident_re, Keyword.Type, '#pop'),
            ("'"+ident_re, Keyword.Type),
            # this case is not in the syntax but sometimes
            # we think we are parsing types when in fact we are parsing
            # some css, so we just pop the states until we get back into
            # the root state
            default('#pop'),
        ],

        # type-with-slash is either:
        # * type-1
        # * type-1 (/ type-1)+
        'type-with-slash': [
            include('comments-and-spaces'),
            default(('#pop', 'slash-type-1', 'type-1')),
        ],
        'slash-type-1': [
            include('comments-and-spaces'),
            ('/', Keyword.Type, ('#pop', 'type-1')),
            # same remark as above
            default('#pop'),
        ],

        # we go in this state after having parsed a type-with-slash
        # while trying to parse a type
        # and at this point we must determine if we are parsing an arrow
        # type (in which case we must continue parsing) or not (in which
        # case we stop)
        'type-lhs-1': [
            include('comments-and-spaces'),
            (r'->', Keyword.Type, ('#pop', 'type')),
            (r'(?=,)', Keyword.Type, ('#pop', 'type-arrow')),
            default('#pop'),
        ],
        'type-arrow': [
            include('comments-and-spaces'),
            # the look ahead here allows to parse f(x : int, y : float -> truc)
            # correctly
            (r',(?=[^:]*?->)', Keyword.Type, 'type-with-slash'),
            (r'->', Keyword.Type, ('#pop', 'type')),
            # same remark as above
            default('#pop'),
        ],

        # no need to do precise parsing for tuples and records
        # because they are closed constructions, so we can simply
        # find the closing delimiter
        # note that this function would be not work if the source
        # contained identifiers like `{)` (although it could be patched
        # to support it)
        'type-tuple': [
            include('comments-and-spaces'),
            (r'[^()/*]+', Keyword.Type),
            (r'[/*]', Keyword.Type),
            (r'\(', Keyword.Type, '#push'),
            (r'\)', Keyword.Type, '#pop'),
        ],
        'type-record': [
            include('comments-and-spaces'),
            (r'[^{}/*]+', Keyword.Type),
            (r'[/*]', Keyword.Type),
            (r'\{', Keyword.Type, '#push'),
            (r'\}', Keyword.Type, '#pop'),
        ],

        # 'type-tuple': [
        #     include('comments-and-spaces'),
        #     (r'\)', Keyword.Type, '#pop'),
        #     default(('#pop', 'type-tuple-1', 'type-1')),
        # ],
        # 'type-tuple-1': [
        #     include('comments-and-spaces'),
        #     (r',?\s*\)', Keyword.Type, '#pop'), # ,) is a valid end of tuple, in (1,)
        #     (r',', Keyword.Type, 'type-1'),
        # ],
        # 'type-record':[
        #     include('comments-and-spaces'),
        #     (r'\}', Keyword.Type, '#pop'),
        #     (r'~?(?:\w+|`[^`]*`)', Keyword.Type, 'type-record-field-expr'),
        # ],
        # 'type-record-field-expr': [
        #
        # ],

        'nested-comment': [
            (r'[^/*]+', Comment),
            (r'/\*', Comment, '#push'),
            (r'\*/', Comment, '#pop'),
            (r'[/*]', Comment),
        ],

        # the copy pasting between string and single-string
        # is kinda sad. Is there a way to avoid that??
        'string': [
            (r'[^\\"{]+', String.Double),
            (r'"', String.Double, '#pop'),
            (r'\{', Operator, 'root'),
            include('escape-sequence'),
        ],
        'single-string': [
            (r'[^\\\'{]+', String.Double),
            (r'\'', String.Double, '#pop'),
            (r'\{', Operator, 'root'),
            include('escape-sequence'),
        ],

        # all the html stuff
        # can't really reuse some existing html parser
        # because we must be able to parse embedded expressions

        # we are in this state after someone parsed the '<' that
        # started the html literal
        'html-open-tag': [
            (r'[\w\-:]+', String.Single, ('#pop', 'html-attr')),
            (r'>', String.Single, ('#pop', 'html-content')),
        ],

        # we are in this state after someone parsed the '</' that
        # started the end of the closing tag
        'html-end-tag': [
            # this is a star, because </> is allowed
            (r'[\w\-:]*>', String.Single, '#pop'),
        ],

        # we are in this state after having parsed '<ident(:ident)?'
        # we thus parse a possibly empty list of attributes
        'html-attr': [
            (r'\s+', Text),
            (r'[\w\-:]+=', String.Single, 'html-attr-value'),
            (r'/>', String.Single, '#pop'),
            (r'>', String.Single, ('#pop', 'html-content')),
        ],

        'html-attr-value': [
            (r"'", String.Single, ('#pop', 'single-string')),
            (r'"', String.Single, ('#pop', 'string')),
            (r'#'+ident_re, String.Single, '#pop'),
            (r'#(?=\{)', String.Single, ('#pop', 'root')),
            (r'[^"\'{`=<>]+', String.Single, '#pop'),
            (r'\{', Operator, ('#pop', 'root')),  # this is a tail call!
        ],

        # we should probably deal with '\' escapes here
        'html-content': [
            (r'<!--', Comment, 'html-comment'),
            (r'</', String.Single, ('#pop', 'html-end-tag')),
            (r'<', String.Single, 'html-open-tag'),
            (r'\{', Operator, 'root'),
            (r'[^<{]+', String.Single),
        ],

        'html-comment': [
            (r'-->', Comment, '#pop'),
            (r'[^\-]+|-', Comment),
        ],
    }


class ReasonLexer(RegexLexer):
    """
    For the ReasonML language.
    """

    name = 'ReasonML'
    url = 'https://reasonml.github.io/'
    aliases = ['reasonml', 'reason']
    filenames = ['*.re', '*.rei']
    mimetypes = ['text/x-reasonml']
    version_added = '2.6'

    keywords = (
        'as', 'assert', 'begin', 'class', 'constraint', 'do', 'done', 'downto',
        'else', 'end', 'exception', 'external', 'false', 'for', 'fun', 'esfun',
        'function', 'functor', 'if', 'in', 'include', 'inherit', 'initializer', 'lazy',
        'let', 'switch', 'module', 'pub', 'mutable', 'new', 'nonrec', 'object', 'of',
        'open', 'pri', 'rec', 'sig', 'struct', 'then', 'to', 'true', 'try',
        'type', 'val', 'virtual', 'when', 'while', 'with',
    )
    keyopts = (
        '!=', '#', '&', '&&', r'\(', r'\)', r'\*', r'\+', ',', '-',
        r'-\.', '=>', r'\.', r'\.\.', r'\.\.\.', ':', '::', ':=', ':>', ';', ';;', '<',
        '<-', '=', '>', '>]', r'>\}', r'\?', r'\?\?', r'\[', r'\[<', r'\[>',
        r'\[\|', ']', '_', '`', r'\{', r'\{<', r'\|', r'\|\|', r'\|]', r'\}', '~'
    )

    operators = r'[!$%&*+\./:<=>?@^|~-]'
    word_operators = ('and', 'asr', 'land', 'lor', 'lsl', 'lsr', 'lxor', 'mod', 'or')
    prefix_syms = r'[!?~]'
    infix_syms = r'[=<>@^|&+\*/$%-]'
    primitives = ('unit', 'int', 'float', 'bool', 'string', 'char', 'list', 'array')

    tokens = {
        'escape-sequence': [
            (r'\\[\\"\'ntbr]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
        ],
        'root': [
            (r'\s+', Text),
            (r'false|true|\(\)|\[\]', Name.Builtin.Pseudo),
            (r'\b([A-Z][\w\']*)(?=\s*\.)', Name.Namespace, 'dotted'),
            (r'\b([A-Z][\w\']*)', Name.Class),
            (r'//.*?\n', Comment.Single),
            (r'\/\*(?!/)', Comment.Multiline, 'comment'),
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
            (r'({})'.format('|'.join(keyopts[::-1])), Operator.Word),
            (rf'({infix_syms}|{prefix_syms})?{operators}', Operator),
            (r'\b({})\b'.format('|'.join(word_operators)), Operator.Word),
            (r'\b({})\b'.format('|'.join(primitives)), Keyword.Type),

            (r"[^\W\d][\w']*", Name),

            (r'-?\d[\d_]*(.[\d_]*)?([eE][+\-]?\d[\d_]*)', Number.Float),
            (r'0[xX][\da-fA-F][\da-fA-F_]*', Number.Hex),
            (r'0[oO][0-7][0-7_]*', Number.Oct),
            (r'0[bB][01][01_]*', Number.Bin),
            (r'\d[\d_]*', Number.Integer),

            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2}))'",
             String.Char),
            (r"'.'", String.Char),
            (r"'", Keyword),

            (r'"', String.Double, 'string'),

            (r'[~?][a-z][\w\']*:', Name.Variable),
        ],
        'comment': [
            (r'[^/*]+', Comment.Multiline),
            (r'\/\*', Comment.Multiline, '#push'),
            (r'\*\/', Comment.Multiline, '#pop'),
            (r'\*', Comment.Multiline),
        ],
        'string': [
            (r'[^\\"]+', String.Double),
            include('escape-sequence'),
            (r'\\\n', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'dotted': [
            (r'\s+', Text),
            (r'\.', Punctuation),
            (r'[A-Z][\w\']*(?=\s*\.)', Name.Namespace),
            (r'[A-Z][\w\']*', Name.Class, '#pop'),
            (r'[a-z_][\w\']*', Name, '#pop'),
            default('#pop'),
        ],
    }


class FStarLexer(RegexLexer):
    """
    For the F* language.
    """

    name = 'FStar'
    url = 'https://www.fstar-lang.org/'
    aliases = ['fstar']
    filenames = ['*.fst', '*.fsti']
    mimetypes = ['text/x-fstar']
    version_added = '2.7'

    keywords = (
        'abstract', 'attributes', 'noeq', 'unopteq', 'and'
        'begin', 'by', 'default', 'effect', 'else', 'end', 'ensures',
        'exception', 'exists', 'false', 'forall', 'fun', 'function', 'if',
        'in', 'include', 'inline', 'inline_for_extraction', 'irreducible',
        'logic', 'match', 'module', 'mutable', 'new', 'new_effect', 'noextract',
        'of', 'open', 'opaque', 'private', 'range_of', 'reifiable',
        'reify', 'reflectable', 'requires', 'set_range_of', 'sub_effect',
        'synth', 'then', 'total', 'true', 'try', 'type', 'unfold', 'unfoldable',
        'val', 'when', 'with', 'not'
    )
    decl_keywords = ('let', 'rec')
    assume_keywords = ('assume', 'admit', 'assert', 'calc')
    keyopts = (
        r'~', r'-', r'/\\', r'\\/', r'<:', r'<@', r'\(\|', r'\|\)', r'#', r'u#',
        r'&', r'\(', r'\)', r'\(\)', r',', r'~>', r'->', r'<-', r'<--', r'<==>',
        r'==>', r'\.', r'\?', r'\?\.', r'\.\[', r'\.\(', r'\.\(\|', r'\.\[\|',
        r'\{:pattern', r':', r'::', r':=', r';', r';;', r'=', r'%\[', r'!\{',
        r'\[', r'\[@', r'\[\|', r'\|>', r'\]', r'\|\]', r'\{', r'\|', r'\}', r'\$'
    )

    operators = r'[!$%&*+\./:<=>?@^|~-]'
    prefix_syms = r'[!?~]'
    infix_syms = r'[=<>@^|&+\*/$%-]'
    primitives = ('unit', 'int', 'float', 'bool', 'string', 'char', 'list', 'array')

    tokens = {
        'escape-sequence': [
            (r'\\[\\"\'ntbr]', String.Escape),
            (r'\\[0-9]{3}', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
        ],
        'root': [
            (r'\s+', Text),
            (r'false|true|False|True|\(\)|\[\]', Name.Builtin.Pseudo),
            (r'\b([A-Z][\w\']*)(?=\s*\.)', Name.Namespace, 'dotted'),
            (r'\b([A-Z][\w\']*)', Name.Class),
            (r'\(\*(?![)])', Comment, 'comment'),
            (r'\/\/.+$', Comment),
            (r'\b({})\b'.format('|'.join(keywords)), Keyword),
            (r'\b({})\b'.format('|'.join(assume_keywords)), Name.Exception),
            (r'\b({})\b'.format('|'.join(decl_keywords)), Keyword.Declaration),
            (r'({})'.format('|'.join(keyopts[::-1])), Operator),
            (rf'({infix_syms}|{prefix_syms})?{operators}', Operator),
            (r'\b({})\b'.format('|'.join(primitives)), Keyword.Type),

            (r"[^\W\d][\w']*", Name),

            (r'-?\d[\d_]*(.[\d_]*)?([eE][+\-]?\d[\d_]*)', Number.Float),
            (r'0[xX][\da-fA-F][\da-fA-F_]*', Number.Hex),
            (r'0[oO][0-7][0-7_]*', Number.Oct),
            (r'0[bB][01][01_]*', Number.Bin),
            (r'\d[\d_]*', Number.Integer),

            (r"'(?:(\\[\\\"'ntbr ])|(\\[0-9]{3})|(\\x[0-9a-fA-F]{2}))'",
             String.Char),
            (r"'.'", String.Char),
            (r"'", Keyword),  # a stray quote is another syntax element
            (r"\`([\w\'.]+)\`", Operator.Word),  # for infix applications
            (r"\`", Keyword),  # for quoting
            (r'"', String.Double, 'string'),

            (r'[~?][a-z][\w\']*:', Name.Variable),
        ],
        'comment': [
            (r'[^(*)]+', Comment),
            (r'\(\*', Comment, '#push'),
            (r'\*\)', Comment, '#pop'),
            (r'[(*)]', Comment),
        ],
        'string': [
            (r'[^\\"]+', String.Double),
            include('escape-sequence'),
            (r'\\\n', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'dotted': [
            (r'\s+', Text),
            (r'\.', Punctuation),
            (r'[A-Z][\w\']*(?=\s*\.)', Name.Namespace),
            (r'[A-Z][\w\']*', Name.Class, '#pop'),
            (r'[a-z_][\w\']*', Name, '#pop'),
            default('#pop'),
        ],
    }
