"""
    pygments.lexers.julia
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Julia language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import Lexer, RegexLexer, bygroups, do_insertions, \
    words, include
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace
from erdos.erdos._vendor.pygments.util import shebang_matches
from erdos.erdos._vendor.pygments.lexers._julia_builtins import OPERATORS_LIST, DOTTED_OPERATORS_LIST, \
    KEYWORD_LIST, BUILTIN_LIST, LITERAL_LIST

__all__ = ['JuliaLexer', 'JuliaConsoleLexer']

# see https://docs.julialang.org/en/v1/manual/variables/#Allowed-Variable-Names
allowed_variable = \
    '(?:[a-zA-Z_\u00A1-\U0010ffff][a-zA-Z_0-9!\u00A1-\U0010ffff]*)'
# see https://github.com/JuliaLang/julia/blob/master/src/flisp/julia_opsuffs.h
operator_suffixes = r'[²³¹ʰʲʳʷʸˡˢˣᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁᵂᵃᵇᵈᵉᵍᵏᵐᵒᵖᵗᵘᵛᵝᵞᵟᵠᵡᵢᵣᵤᵥᵦᵧᵨᵩᵪᶜᶠᶥᶦᶫᶰᶸᶻᶿ′″‴‵‶‷⁗⁰ⁱ⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜⱼⱽ]*'

class JuliaLexer(RegexLexer):
    """
    For Julia source code.
    """

    name = 'Julia'
    url = 'https://julialang.org/'
    aliases = ['julia', 'jl']
    filenames = ['*.jl']
    mimetypes = ['text/x-julia', 'application/x-julia']
    version_added = '1.6'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'[^\S\n]+', Whitespace),
            (r'#=', Comment.Multiline, "blockcomment"),
            (r'#.*$', Comment),
            (r'[\[\](),;]', Punctuation),

            # symbols
            #   intercept range expressions first
            (r'(' + allowed_variable + r')(\s*)(:)(' + allowed_variable + ')',
                bygroups(Name, Whitespace, Operator, Name)),
            #   then match :name which does not follow closing brackets, digits, or the
            #   ::, <:, and :> operators
            (r'(?<![\]):<>\d.])(:' + allowed_variable + ')', String.Symbol),

            # type assertions - excludes expressions like ::typeof(sin) and ::avec[1]
            (r'(?<=::)(\s*)(' + allowed_variable + r')\b(?![(\[])',
             bygroups(Whitespace, Keyword.Type)),
            # type comparisons
            # - MyType <: A or MyType >: A
            ('(' + allowed_variable + r')(\s*)([<>]:)(\s*)(' + allowed_variable + r')\b(?![(\[])',
                bygroups(Keyword.Type, Whitespace, Operator, Whitespace, Keyword.Type)),
            # - <: B or >: B
            (r'([<>]:)(\s*)(' + allowed_variable + r')\b(?![(\[])',
                bygroups(Operator, Whitespace, Keyword.Type)),
            # - A <: or A >:
            (r'\b(' + allowed_variable + r')(\s*)([<>]:)',
                bygroups(Keyword.Type, Whitespace, Operator)),

            # operators
            # Suffixes aren't actually allowed on all operators, but we'll ignore that
            # since those cases are invalid Julia code.
            (words([*OPERATORS_LIST, *DOTTED_OPERATORS_LIST],
                   suffix=operator_suffixes), Operator),
            (words(['.' + o for o in DOTTED_OPERATORS_LIST],
                   suffix=operator_suffixes), Operator),
            (words(['...', '..']), Operator),

            # NOTE
            # Patterns below work only for definition sites and thus hardly reliable.
            #
            # functions
            # (r'(function)(\s+)(' + allowed_variable + ')',
            #  bygroups(Keyword, Text, Name.Function)),

            # chars
            (r"'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,3}|\\u[a-fA-F0-9]{1,4}|"
             r"\\U[a-fA-F0-9]{1,6}|[^\\\'\n])'", String.Char),

            # try to match trailing transpose
            (r'(?<=[.\w)\]])(\'' + operator_suffixes + ')+', Operator),

            # raw strings
            (r'(raw)(""")', bygroups(String.Affix, String), 'tqrawstring'),
            (r'(raw)(")', bygroups(String.Affix, String), 'rawstring'),
            # regular expressions
            (r'(r)(""")', bygroups(String.Affix, String.Regex), 'tqregex'),
            (r'(r)(")', bygroups(String.Affix, String.Regex), 'regex'),
            # other strings
            (r'(' + allowed_variable + ')?(""")',
             bygroups(String.Affix, String), 'tqstring'),
            (r'(' + allowed_variable + ')?(")',
             bygroups(String.Affix, String), 'string'),

            # backticks
            (r'(' + allowed_variable + ')?(```)',
             bygroups(String.Affix, String.Backtick), 'tqcommand'),
            (r'(' + allowed_variable + ')?(`)',
             bygroups(String.Affix, String.Backtick), 'command'),

            # type names
            # - names that begin a curly expression
            ('(' + allowed_variable + r')(\{)',
                bygroups(Keyword.Type, Punctuation), 'curly'),
            # - names as part of bare 'where'
            (r'(where)(\s+)(' + allowed_variable + ')',
                bygroups(Keyword, Whitespace, Keyword.Type)),
            # - curly expressions in general
            (r'(\{)', Punctuation, 'curly'),
            # - names as part of type declaration
            (r'(abstract|primitive)([ \t]+)(type\b)([\s()]+)(' +
                allowed_variable + r')',
                bygroups(Keyword, Whitespace, Keyword, Text, Keyword.Type)),
            (r'(mutable(?=[ \t]))?([ \t]+)?(struct\b)([\s()]+)(' +
                allowed_variable + r')',
                bygroups(Keyword, Whitespace, Keyword, Text, Keyword.Type)),

            # macros
            (r'@' + allowed_variable, Name.Decorator),
            (words([*OPERATORS_LIST, '..', '.', *DOTTED_OPERATORS_LIST],
                prefix='@', suffix=operator_suffixes), Name.Decorator),

            # keywords
            (words(KEYWORD_LIST, suffix=r'\b'), Keyword),
            # builtin types
            (words(BUILTIN_LIST, suffix=r'\b'), Keyword.Type),
            # builtin literals
            (words(LITERAL_LIST, suffix=r'\b'), Name.Builtin),

            # names
            (allowed_variable, Name),

            # numbers
            (r'(\d+((_\d+)+)?\.(?!\.)(\d+((_\d+)+)?)?|\.\d+((_\d+)+)?)([eEf][+-]?[0-9]+)?', Number.Float),
            (r'\d+((_\d+)+)?[eEf][+-]?[0-9]+', Number.Float),
            (r'0x[a-fA-F0-9]+((_[a-fA-F0-9]+)+)?(\.([a-fA-F0-9]+((_[a-fA-F0-9]+)+)?)?)?p[+-]?\d+', Number.Float),
            (r'0b[01]+((_[01]+)+)?', Number.Bin),
            (r'0o[0-7]+((_[0-7]+)+)?', Number.Oct),
            (r'0x[a-fA-F0-9]+((_[a-fA-F0-9]+)+)?', Number.Hex),
            (r'\d+((_\d+)+)?', Number.Integer),

            # single dot operator matched last to permit e.g. ".1" as a float
            (words(['.']), Operator),
        ],

        "blockcomment": [
            (r'[^=#]', Comment.Multiline),
            (r'#=', Comment.Multiline, '#push'),
            (r'=#', Comment.Multiline, '#pop'),
            (r'[=#]', Comment.Multiline),
        ],

        'curly': [
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
            (allowed_variable, Keyword.Type),
            include('root'),
        ],

        'tqrawstring': [
            (r'"""', String, '#pop'),
            (r'([^"]|"[^"][^"])+', String),
        ],
        'rawstring': [
            (r'"', String, '#pop'),
            (r'\\"', String.Escape),
            (r'([^"\\]|\\[^"])+', String),
        ],

        # Interpolation is defined as "$" followed by the shortest full
        # expression, which is something we can't parse.  Include the most
        # common cases here: $word, and $(paren'd expr).
        'interp': [
            (r'\$' + allowed_variable, String.Interpol),
            (r'(\$)(\()', bygroups(String.Interpol, Punctuation), 'in-intp'),
        ],
        'in-intp': [
            (r'\(', Punctuation, '#push'),
            (r'\)', Punctuation, '#pop'),
            include('root'),
        ],

        'string': [
            (r'(")(' + allowed_variable + r'|\d+)?',
             bygroups(String, String.Affix), '#pop'),
            # FIXME: This escape pattern is not perfect.
            (r'\\([\\"\'$nrbtfav]|(x|u|U)[a-fA-F0-9]+|\d+)', String.Escape),
            include('interp'),
            # @printf and @sprintf formats
            (r'%[-#0 +]*([0-9]+|[*])?(\.([0-9]+|[*]))?[hlL]?[E-GXc-giorsux%]',
             String.Interpol),
            (r'[^"$%\\]+', String),
            (r'.', String),
        ],
        'tqstring': [
            (r'(""")(' + allowed_variable + r'|\d+)?',
             bygroups(String, String.Affix), '#pop'),
            (r'\\([\\"\'$nrbtfav]|(x|u|U)[a-fA-F0-9]+|\d+)', String.Escape),
            include('interp'),
            (r'[^"$%\\]+', String),
            (r'.', String),
        ],

        'regex': [
            (r'(")([imsxa]*)?', bygroups(String.Regex, String.Affix), '#pop'),
            (r'\\"', String.Regex),
            (r'[^\\"]+', String.Regex),
        ],

        'tqregex': [
            (r'(""")([imsxa]*)?', bygroups(String.Regex, String.Affix), '#pop'),
            (r'[^"]+', String.Regex),
        ],

        'command': [
            (r'(`)(' + allowed_variable + r'|\d+)?',
             bygroups(String.Backtick, String.Affix), '#pop'),
            (r'\\[`$]', String.Escape),
            include('interp'),
            (r'[^\\`$]+', String.Backtick),
            (r'.', String.Backtick),
        ],
        'tqcommand': [
            (r'(```)(' + allowed_variable + r'|\d+)?',
             bygroups(String.Backtick, String.Affix), '#pop'),
            (r'\\\$', String.Escape),
            include('interp'),
            (r'[^\\`$]+', String.Backtick),
            (r'.', String.Backtick),
        ],
    }

    def analyse_text(text):
        return shebang_matches(text, r'julia')


class JuliaConsoleLexer(Lexer):
    """
    For Julia console sessions. Modeled after MatlabSessionLexer.
    """
    name = 'Julia console'
    aliases = ['jlcon', 'julia-repl']
    url = 'https://julialang.org/'
    version_added = '1.6'
    _example = "jlcon/console"

    def get_tokens_unprocessed(self, text):
        jllexer = JuliaLexer(**self.options)
        start = 0
        curcode = ''
        insertions = []
        output = False
        error = False

        for line in text.splitlines(keepends=True):
            if line.startswith('julia>'):
                insertions.append((len(curcode), [(0, Generic.Prompt, line[:6])]))
                curcode += line[6:]
                output = False
                error = False
            elif line.startswith('help?>') or line.startswith('shell>'):
                yield start, Generic.Prompt, line[:6]
                yield start + 6, Text, line[6:]
                output = False
                error = False
            elif line.startswith('      ') and not output:
                insertions.append((len(curcode), [(0, Whitespace, line[:6])]))
                curcode += line[6:]
            else:
                if curcode:
                    yield from do_insertions(
                        insertions, jllexer.get_tokens_unprocessed(curcode))
                    curcode = ''
                    insertions = []
                if line.startswith('ERROR: ') or error:
                    yield start, Generic.Error, line
                    error = True
                else:
                    yield start, Generic.Output, line
                output = True
            start += len(line)

        if curcode:
            yield from do_insertions(
                insertions, jllexer.get_tokens_unprocessed(curcode))
