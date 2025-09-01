"""
    pygments.lexers.crystal
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Crystal.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import ExtendedRegexLexer, include, bygroups, default, \
    words, line_re
from erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, \
    Punctuation, Error, Whitespace

__all__ = ['CrystalLexer']


CRYSTAL_OPERATORS = [
    '!=', '!~', '!', '%', '&&', '&', '**', '*', '+', '-', '/', '<=>', '<<', '<=', '<',
    '===', '==', '=~', '=', '>=', '>>', '>', '[]=', '[]?', '[]', '^', '||', '|', '~'
]


class CrystalLexer(ExtendedRegexLexer):
    """
    For Crystal source code.
    """

    name = 'Crystal'
    url = 'https://crystal-lang.org'
    aliases = ['cr', 'crystal']
    filenames = ['*.cr']
    mimetypes = ['text/x-crystal']
    version_added = '2.2'

    flags = re.DOTALL | re.MULTILINE

    def heredoc_callback(self, match, ctx):
        # okay, this is the hardest part of parsing Crystal...
        # match: 1 = <<-?, 2 = quote? 3 = name 4 = quote? 5 = rest of line

        start = match.start(1)
        yield start, Operator, match.group(1)        # <<-?
        yield match.start(2), String.Heredoc, match.group(2)    # quote ", ', `
        yield match.start(3), String.Delimiter, match.group(3)  # heredoc name
        yield match.start(4), String.Heredoc, match.group(4)    # quote again

        heredocstack = ctx.__dict__.setdefault('heredocstack', [])
        outermost = not bool(heredocstack)
        heredocstack.append((match.group(1) == '<<-', match.group(3)))

        ctx.pos = match.start(5)
        ctx.end = match.end(5)
        # this may find other heredocs, so limit the recursion depth
        if len(heredocstack) < 100:
            yield from self.get_tokens_unprocessed(context=ctx)
        else:
            yield ctx.pos, String.Heredoc, match.group(5)
        ctx.pos = match.end()

        if outermost:
            # this is the outer heredoc again, now we can process them all
            for tolerant, hdname in heredocstack:
                lines = []
                for match in line_re.finditer(ctx.text, ctx.pos):
                    if tolerant:
                        check = match.group().strip()
                    else:
                        check = match.group().rstrip()
                    if check == hdname:
                        for amatch in lines:
                            yield amatch.start(), String.Heredoc, amatch.group()
                        yield match.start(), String.Delimiter, match.group()
                        ctx.pos = match.end()
                        break
                    else:
                        lines.append(match)
                else:
                    # end of heredoc not found -- error!
                    for amatch in lines:
                        yield amatch.start(), Error, amatch.group()
            ctx.end = len(ctx.text)
            del heredocstack[:]

    def gen_crystalstrings_rules():
        states = {}
        states['strings'] = [
            (r'\:\w+[!?]?', String.Symbol),
            (words(CRYSTAL_OPERATORS, prefix=r'\:'), String.Symbol),
            (r":'(\\\\|\\[^\\]|[^'\\])*'", String.Symbol),
            # This allows arbitrary text after '\ for simplicity
            (r"'(\\\\|\\'|[^']|\\[^'\\]+)'", String.Char),
            (r':"', String.Symbol, 'simple-sym'),
            # Crystal doesn't have "symbol:"s but this simplifies function args
            (r'([a-zA-Z_]\w*)(:)(?!:)', bygroups(String.Symbol, Punctuation)),
            (r'"', String.Double, 'simple-string'),
            (r'(?<!\.)`', String.Backtick, 'simple-backtick'),
        ]

        # double-quoted string and symbol
        for name, ttype, end in ('string', String.Double, '"'), \
                                ('sym', String.Symbol, '"'), \
                                ('backtick', String.Backtick, '`'):
            states['simple-'+name] = [
                include('string-escaped' if name == 'sym' else 'string-intp-escaped'),
                (rf'[^\\{end}#]+', ttype),
                (r'[\\#]', ttype),
                (end, ttype, '#pop'),
            ]

        # https://crystal-lang.org/docs/syntax_and_semantics/literals/string.html#percent-string-literals
        for lbrace, rbrace, bracecc, name in \
                ('\\{', '\\}', '{}', 'cb'), \
                ('\\[', '\\]', '\\[\\]', 'sb'), \
                ('\\(', '\\)', '()', 'pa'), \
                ('<', '>', '<>', 'ab'), \
                ('\\|', '\\|', '\\|', 'pi'):
            states[name+'-intp-string'] = [
                (r'\\' + lbrace, String.Other),
            ] + (lbrace != rbrace) * [
                (lbrace, String.Other, '#push'),
            ] + [
                (rbrace, String.Other, '#pop'),
                include('string-intp-escaped'),
                (r'[\\#' + bracecc + ']', String.Other),
                (r'[^\\#' + bracecc + ']+', String.Other),
            ]
            states['strings'].append((r'%Q?' + lbrace, String.Other,
                                      name+'-intp-string'))
            states[name+'-string'] = [
                (r'\\[\\' + bracecc + ']', String.Other),
            ] + (lbrace != rbrace) * [
                (lbrace, String.Other, '#push'),
            ] + [
                (rbrace, String.Other, '#pop'),
                (r'[\\#' + bracecc + ']', String.Other),
                (r'[^\\#' + bracecc + ']+', String.Other),
            ]
            # https://crystal-lang.org/docs/syntax_and_semantics/literals/array.html#percent-array-literals
            states['strings'].append((r'%[qwi]' + lbrace, String.Other,
                                      name+'-string'))
            states[name+'-regex'] = [
                (r'\\[\\' + bracecc + ']', String.Regex),
            ] + (lbrace != rbrace) * [
                (lbrace, String.Regex, '#push'),
            ] + [
                (rbrace + '[imsx]*', String.Regex, '#pop'),
                include('string-intp'),
                (r'[\\#' + bracecc + ']', String.Regex),
                (r'[^\\#' + bracecc + ']+', String.Regex),
            ]
            states['strings'].append((r'%r' + lbrace, String.Regex,
                                      name+'-regex'))

        return states

    tokens = {
        'root': [
            (r'#.*?$', Comment.Single),
            # keywords
            (words('''
                abstract asm begin break case do else elsif end ensure extend if in
                include next of private protected require rescue return select self super
                then unless until when while with yield
            '''.split(), suffix=r'\b'), Keyword),
            (words('''
                previous_def forall out uninitialized __DIR__ __FILE__ __LINE__
                __END_LINE__
            '''.split(), prefix=r'(?<!\.)', suffix=r'\b'), Keyword.Pseudo),
            # https://crystal-lang.org/docs/syntax_and_semantics/is_a.html
            (r'\.(is_a\?|nil\?|responds_to\?|as\?|as\b)', Keyword.Pseudo),
            (words(['true', 'false', 'nil'], suffix=r'\b'), Keyword.Constant),
            # start of function, class and module names
            (r'(module|lib)(\s+)([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)',
             bygroups(Keyword, Whitespace, Name.Namespace)),
            (r'(def|fun|macro)(\s+)((?:[a-zA-Z_]\w*::)*)',
             bygroups(Keyword, Whitespace, Name.Namespace), 'funcname'),
            (r'def(?=[*%&^`~+-/\[<>=])', Keyword, 'funcname'),
            (r'(annotation|class|struct|union|type|alias|enum)(\s+)((?:[a-zA-Z_]\w*::)*)',
             bygroups(Keyword, Whitespace, Name.Namespace), 'classname'),
            # https://crystal-lang.org/api/toplevel.html
            (words('''
                instance_sizeof offsetof pointerof sizeof typeof
            '''.split(), prefix=r'(?<!\.)', suffix=r'\b'), Keyword.Pseudo),
            # macros
            (r'(?<!\.)(debugger\b|p!|pp!|record\b|spawn\b)', Name.Builtin.Pseudo),
            # builtins
            (words('''
                abort at_exit caller exit gets loop main p pp print printf puts
                raise rand read_line sleep spawn sprintf system
            '''.split(), prefix=r'(?<!\.)', suffix=r'\b'), Name.Builtin),
            # https://crystal-lang.org/api/Object.html#macro-summary
            (r'(?<!\.)(((class_)?((getter|property)\b[!?]?|setter\b))|'
             r'(def_(clone|equals|equals_and_hash|hash)|delegate|forward_missing_to)\b)',
             Name.Builtin.Pseudo),
            # normal heredocs
            (r'(?<!\w)(<<-?)(["`\']?)([a-zA-Z_]\w*)(\2)(.*?\n)',
             heredoc_callback),
            # empty string heredocs
            (r'(<<-?)("|\')()(\2)(.*?\n)', heredoc_callback),
            (r'__END__', Comment.Preproc, 'end-part'),
            # multiline regex (after keywords or assignments)
            (r'(?:^|(?<=[=<>~!:])|'
             r'(?<=(?:\s|;)when\s)|'
             r'(?<=(?:\s|;)or\s)|'
             r'(?<=(?:\s|;)and\s)|'
             r'(?<=\.index\s)|'
             r'(?<=\.scan\s)|'
             r'(?<=\.sub\s)|'
             r'(?<=\.sub!\s)|'
             r'(?<=\.gsub\s)|'
             r'(?<=\.gsub!\s)|'
             r'(?<=\.match\s)|'
             r'(?<=(?:\s|;)if\s)|'
             r'(?<=(?:\s|;)elsif\s)|'
             r'(?<=^when\s)|'
             r'(?<=^index\s)|'
             r'(?<=^scan\s)|'
             r'(?<=^sub\s)|'
             r'(?<=^gsub\s)|'
             r'(?<=^sub!\s)|'
             r'(?<=^gsub!\s)|'
             r'(?<=^match\s)|'
             r'(?<=^if\s)|'
             r'(?<=^elsif\s)'
             r')(\s*)(/)', bygroups(Whitespace, String.Regex), 'multiline-regex'),
            # multiline regex (in method calls or subscripts)
            (r'(?<=\(|,|\[)/', String.Regex, 'multiline-regex'),
            # multiline regex (this time the funny no whitespace rule)
            (r'(\s+)(/)(?![\s=])', bygroups(Whitespace, String.Regex),
             'multiline-regex'),
            # lex numbers and ignore following regular expressions which
            # are division operators in fact (grrrr. i hate that. any
            # better ideas?)
            # since pygments 0.7 we also eat a "?" operator after numbers
            # so that the char operator does not work. Chars are not allowed
            # there so that you can use the ternary operator.
            # stupid example:
            #   x>=0?n[x]:""
            (r'(0o[0-7]+(?:_[0-7]+)*(?:_?[iu][0-9]+)?)\b(\s*)([/?])?',
             bygroups(Number.Oct, Whitespace, Operator)),
            (r'(0x[0-9A-Fa-f]+(?:_[0-9A-Fa-f]+)*(?:_?[iu][0-9]+)?)\b(\s*)([/?])?',
             bygroups(Number.Hex, Whitespace, Operator)),
            (r'(0b[01]+(?:_[01]+)*(?:_?[iu][0-9]+)?)\b(\s*)([/?])?',
             bygroups(Number.Bin, Whitespace, Operator)),
            # 3 separate expressions for floats because any of the 3 optional
            # parts makes it a float
            (r'((?:0(?![0-9])|[1-9][\d_]*)(?:\.\d[\d_]*)(?:e[+-]?[0-9]+)?'
             r'(?:_?f[0-9]+)?)(\s*)([/?])?',
             bygroups(Number.Float, Whitespace, Operator)),
            (r'((?:0(?![0-9])|[1-9][\d_]*)(?:\.\d[\d_]*)?(?:e[+-]?[0-9]+)'
             r'(?:_?f[0-9]+)?)(\s*)([/?])?',
             bygroups(Number.Float, Whitespace, Operator)),
            (r'((?:0(?![0-9])|[1-9][\d_]*)(?:\.\d[\d_]*)?(?:e[+-]?[0-9]+)?'
             r'(?:_?f[0-9]+))(\s*)([/?])?',
             bygroups(Number.Float, Whitespace, Operator)),
            (r'(0\b|[1-9][\d]*(?:_\d+)*(?:_?[iu][0-9]+)?)\b(\s*)([/?])?',
             bygroups(Number.Integer, Whitespace, Operator)),
            # Names
            (r'@@[a-zA-Z_]\w*', Name.Variable.Class),
            (r'@[a-zA-Z_]\w*', Name.Variable.Instance),
            (r'\$\w+', Name.Variable.Global),
            (r'\$[!@&`\'+~=/\\,;.<>_*$?:"^-]', Name.Variable.Global),
            (r'\$-[0adFiIlpvw]', Name.Variable.Global),
            (r'::', Operator),
            include('strings'),
            # https://crystal-lang.org/reference/syntax_and_semantics/literals/char.html
            (r'\?(\\[MC]-)*'  # modifiers
             r'(\\([\\abefnrtv#"\']|[0-7]{1,3}|x[a-fA-F0-9]{2}|u[a-fA-F0-9]{4}|u\{[a-fA-F0-9 ]+\})|\S)'
             r'(?!\w)',
             String.Char),
            (r'[A-Z][A-Z_]+\b(?!::|\.)', Name.Constant),
            # macro expansion
            (r'\{%', String.Interpol, 'in-macro-control'),
            (r'\{\{', String.Interpol, 'in-macro-expr'),
            # annotations
            (r'(@\[)(\s*)([A-Z]\w*(::[A-Z]\w*)*)',
             bygroups(Operator, Whitespace, Name.Decorator), 'in-annot'),
            # this is needed because Crystal attributes can look
            # like keywords (class) or like this: ` ?!?
            (words(CRYSTAL_OPERATORS, prefix=r'(\.|::)'),
             bygroups(Operator, Name.Operator)),
            (r'(\.|::)([a-zA-Z_]\w*[!?]?|[*%&^`~+\-/\[<>=])',
             bygroups(Operator, Name)),
            # Names can end with [!?] unless it's "!="
            (r'[a-zA-Z_]\w*(?:[!?](?!=))?', Name),
            (r'(\[|\]\??|\*\*|<=>?|>=|<<?|>>?|=~|===|'
             r'!~|&&?|\|\||\.{1,3})', Operator),
            (r'[-+/*%=<>&!^|~]=?', Operator),
            (r'[(){};,/?:\\]', Punctuation),
            (r'\s+', Whitespace)
        ],
        'funcname': [
            (r'(?:([a-zA-Z_]\w*)(\.))?'
             r'([a-zA-Z_]\w*[!?]?|\*\*?|[-+]@?|'
             r'[/%&|^`~]|\[\]=?|<<|>>|<=?>|>=?|===?)',
             bygroups(Name.Class, Operator, Name.Function), '#pop'),
            default('#pop')
        ],
        'classname': [
            (r'[A-Z_]\w*', Name.Class),
            (r'(\()(\s*)([A-Z_]\w*)(\s*)(\))',
             bygroups(Punctuation, Whitespace, Name.Class, Whitespace, Punctuation)),
            default('#pop')
        ],
        'in-intp': [
            (r'\{', String.Interpol, '#push'),
            (r'\}', String.Interpol, '#pop'),
            include('root'),
        ],
        'string-intp': [
            (r'#\{', String.Interpol, 'in-intp'),
        ],
        'string-escaped': [
            # https://crystal-lang.org/reference/syntax_and_semantics/literals/string.html
            (r'\\([\\abefnrtv#"\']|[0-7]{1,3}|x[a-fA-F0-9]{2}|u[a-fA-F0-9]{4}|u\{[a-fA-F0-9 ]+\})',
             String.Escape)
        ],
        'string-intp-escaped': [
            include('string-intp'),
            include('string-escaped'),
        ],
        'interpolated-regex': [
            include('string-intp'),
            (r'[\\#]', String.Regex),
            (r'[^\\#]+', String.Regex),
        ],
        'interpolated-string': [
            include('string-intp'),
            (r'[\\#]', String.Other),
            (r'[^\\#]+', String.Other),
        ],
        'multiline-regex': [
            include('string-intp'),
            (r'\\\\', String.Regex),
            (r'\\/', String.Regex),
            (r'[\\#]', String.Regex),
            (r'[^\\/#]+', String.Regex),
            (r'/[imsx]*', String.Regex, '#pop'),
        ],
        'end-part': [
            (r'.+', Comment.Preproc, '#pop')
        ],
        'in-macro-control': [
            (r'\{%', String.Interpol, '#push'),
            (r'%\}', String.Interpol, '#pop'),
            (r'(for|verbatim)\b', Keyword),
            include('root'),
        ],
        'in-macro-expr': [
            (r'\{\{', String.Interpol, '#push'),
            (r'\}\}', String.Interpol, '#pop'),
            include('root'),
        ],
        'in-annot': [
            (r'\[', Operator, '#push'),
            (r'\]', Operator, '#pop'),
            include('root'),
        ],
    }
    tokens.update(gen_crystalstrings_rules())
