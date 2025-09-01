"""
    pygments.lexers.algebra
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for computer algebra systems.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import Lexer, RegexLexer, bygroups, do_insertions, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace

__all__ = ['GAPLexer', 'GAPConsoleLexer', 'MathematicaLexer', 'MuPADLexer',
           'BCLexer']


class GAPLexer(RegexLexer):
    """
    For GAP source code.
    """
    name = 'GAP'
    url = 'https://www.gap-system.org'
    aliases = ['gap']
    filenames = ['*.g', '*.gd', '*.gi', '*.gap']
    version_added = '2.0'

    tokens = {
        'root': [
            (r'#.*$', Comment.Single),
            (r'"(?:[^"\\]|\\.)*"', String),
            (r'\(|\)|\[|\]|\{|\}', Punctuation),
            (r'''(?x)\b(?:
                if|then|elif|else|fi|
                for|while|do|od|
                repeat|until|
                break|continue|
                function|local|return|end|
                rec|
                quit|QUIT|
                IsBound|Unbind|
                TryNextMethod|
                Info|Assert
              )\b''', Keyword),
            (r'''(?x)\b(?:
                true|false|fail|infinity
              )\b''',
             Name.Constant),
            (r'''(?x)\b(?:
                (Declare|Install)([A-Z][A-Za-z]+)|
                   BindGlobal|BIND_GLOBAL
              )\b''',
             Name.Builtin),
            (r'\.|,|:=|;|=|\+|-|\*|/|\^|>|<', Operator),
            (r'''(?x)\b(?:
                and|or|not|mod|in
              )\b''',
             Operator.Word),
            (r'''(?x)
              (?:\w+|`[^`]*`)
              (?:::\w+|`[^`]*`)*''', Name.Variable),
            (r'[0-9]+(?:\.[0-9]*)?(?:e[0-9]+)?', Number),
            (r'\.[0-9]+(?:e[0-9]+)?', Number),
            (r'.', Text)
        ],
    }

    def analyse_text(text):
        score = 0.0

        # Declaration part
        if re.search(
            r"(InstallTrueMethod|Declare(Attribute|Category|Filter|Operation" +
            r"|GlobalFunction|Synonym|SynonymAttr|Property))", text
        ):
            score += 0.7

        # Implementation part
        if re.search(
            r"(DeclareRepresentation|Install(GlobalFunction|Method|" +
            r"ImmediateMethod|OtherMethod)|New(Family|Type)|Objectify)", text
        ):
            score += 0.7

        return min(score, 1.0)


class GAPConsoleLexer(Lexer):
    """
    For GAP console sessions. Modeled after JuliaConsoleLexer.
    """
    name = 'GAP session'
    aliases = ['gap-console', 'gap-repl']
    filenames = ['*.tst']
    url = 'https://www.gap-system.org'
    version_added = '2.14'
    _example = "gap-repl/euclidean.tst"

    def get_tokens_unprocessed(self, text):
        gaplexer = GAPLexer(**self.options)
        start = 0
        curcode = ''
        insertions = []
        output = False
        error = False

        for line in text.splitlines(keepends=True):
            if line.startswith('gap> ') or line.startswith('brk> '):
                insertions.append((len(curcode), [(0, Generic.Prompt, line[:5])]))
                curcode += line[5:]
                output = False
                error = False
            elif not output and line.startswith('> '):
                insertions.append((len(curcode), [(0, Generic.Prompt, line[:2])]))
                curcode += line[2:]
            else:
                if curcode:
                    yield from do_insertions(
                        insertions, gaplexer.get_tokens_unprocessed(curcode))
                    curcode = ''
                    insertions = []
                if line.startswith('Error, ') or error:
                    yield start, Generic.Error, line
                    error = True
                else:
                    yield start, Generic.Output, line
                output = True
            start += len(line)

        if curcode:
            yield from do_insertions(
                insertions, gaplexer.get_tokens_unprocessed(curcode))

    # the following is needed to distinguish Scilab and GAP .tst files
    def analyse_text(text):
        # GAP prompts are a dead give away, although hypothetical;y a
        # file in another language could be trying to compare a variable
        # "gap" as in "gap> 0.1". But that this should happen at the
        # start of a line seems unlikely...
        if re.search(r"^gap> ", text):
            return 0.9
        else:
            return 0.0


class MathematicaLexer(RegexLexer):
    """
    Lexer for Mathematica source code.
    """
    name = 'Mathematica'
    url = 'http://www.wolfram.com/mathematica/'
    aliases = ['mathematica', 'mma', 'nb']
    filenames = ['*.nb', '*.cdf', '*.nbp', '*.ma']
    mimetypes = ['application/mathematica',
                 'application/vnd.wolfram.mathematica',
                 'application/vnd.wolfram.mathematica.package',
                 'application/vnd.wolfram.cdf']
    version_added = '2.0'

    # http://reference.wolfram.com/mathematica/guide/Syntax.html
    operators = (
        ";;", "=", "=.", "!=" "==", ":=", "->", ":>", "/.", "+", "-", "*", "/",
        "^", "&&", "||", "!", "<>", "|", "/;", "?", "@", "//", "/@", "@@",
        "@@@", "~~", "===", "&", "<", ">", "<=", ">=",
    )

    punctuation = (",", ";", "(", ")", "[", "]", "{", "}")

    def _multi_escape(entries):
        return '({})'.format('|'.join(re.escape(entry) for entry in entries))

    tokens = {
        'root': [
            (r'(?s)\(\*.*?\*\)', Comment),

            (r'([a-zA-Z]+[A-Za-z0-9]*`)', Name.Namespace),
            (r'([A-Za-z0-9]*_+[A-Za-z0-9]*)', Name.Variable),
            (r'#\d*', Name.Variable),
            (r'([a-zA-Z]+[a-zA-Z0-9]*)', Name),

            (r'-?\d+\.\d*', Number.Float),
            (r'-?\d*\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),

            (words(operators), Operator),
            (words(punctuation), Punctuation),
            (r'".*?"', String),
            (r'\s+', Text.Whitespace),
        ],
    }


class MuPADLexer(RegexLexer):
    """
    A MuPAD lexer.
    Contributed by Christopher Creutzig <christopher@creutzig.de>.
    """
    name = 'MuPAD'
    url = 'http://www.mupad.com'
    aliases = ['mupad']
    filenames = ['*.mu']
    version_added = '0.8'

    tokens = {
        'root': [
            (r'//.*?$', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),
            (r'"(?:[^"\\]|\\.)*"', String),
            (r'\(|\)|\[|\]|\{|\}', Punctuation),
            (r'''(?x)\b(?:
                next|break|end|
                axiom|end_axiom|category|end_category|domain|end_domain|inherits|
                if|%if|then|elif|else|end_if|
                case|of|do|otherwise|end_case|
                while|end_while|
                repeat|until|end_repeat|
                for|from|to|downto|step|end_for|
                proc|local|option|save|begin|end_proc|
                delete|frame
              )\b''', Keyword),
            (r'''(?x)\b(?:
                DOM_ARRAY|DOM_BOOL|DOM_COMPLEX|DOM_DOMAIN|DOM_EXEC|DOM_EXPR|
                DOM_FAIL|DOM_FLOAT|DOM_FRAME|DOM_FUNC_ENV|DOM_HFARRAY|DOM_IDENT|
                DOM_INT|DOM_INTERVAL|DOM_LIST|DOM_NIL|DOM_NULL|DOM_POLY|DOM_PROC|
                DOM_PROC_ENV|DOM_RAT|DOM_SET|DOM_STRING|DOM_TABLE|DOM_VAR
              )\b''', Name.Class),
            (r'''(?x)\b(?:
                PI|EULER|E|CATALAN|
                NIL|FAIL|undefined|infinity|
                TRUE|FALSE|UNKNOWN
              )\b''',
             Name.Constant),
            (r'\b(?:dom|procname)\b', Name.Builtin.Pseudo),
            (r'\.|,|:|;|=|\+|-|\*|/|\^|@|>|<|\$|\||!|\'|%|~=', Operator),
            (r'''(?x)\b(?:
                and|or|not|xor|
                assuming|
                div|mod|
                union|minus|intersect|in|subset
              )\b''',
             Operator.Word),
            (r'\b(?:I|RDN_INF|RD_NINF|RD_NAN)\b', Number),
            # (r'\b(?:adt|linalg|newDomain|hold)\b', Name.Builtin),
            (r'''(?x)
              ((?:[a-zA-Z_#][\w#]*|`[^`]*`)
              (?:::[a-zA-Z_#][\w#]*|`[^`]*`)*)(\s*)([(])''',
             bygroups(Name.Function, Text, Punctuation)),
            (r'''(?x)
              (?:[a-zA-Z_#][\w#]*|`[^`]*`)
              (?:::[a-zA-Z_#][\w#]*|`[^`]*`)*''', Name.Variable),
            (r'[0-9]+(?:\.[0-9]*)?(?:e[0-9]+)?', Number),
            (r'\.[0-9]+(?:e[0-9]+)?', Number),
            (r'\s+', Whitespace),
            (r'.', Text)
        ],
        'comment': [
            (r'[^/*]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
    }


class BCLexer(RegexLexer):
    """
    A BC lexer.
    """
    name = 'BC'
    url = 'https://www.gnu.org/software/bc/'
    aliases = ['bc']
    filenames = ['*.bc']
    version_added = '2.1'

    tokens = {
        'root': [
            (r'/\*', Comment.Multiline, 'comment'),
            (r'"(?:[^"\\]|\\.)*"', String),
            (r'[{}();,]', Punctuation),
            (words(('if', 'else', 'while', 'for', 'break', 'continue',
                    'halt', 'return', 'define', 'auto', 'print', 'read',
                    'length', 'scale', 'sqrt', 'limits', 'quit',
                    'warranty'), suffix=r'\b'), Keyword),
            (r'\+\+|--|\|\||&&|'
             r'([-<>+*%\^/!=])=?', Operator),
            # bc doesn't support exponential
            (r'[0-9]+(\.[0-9]*)?', Number),
            (r'\.[0-9]+', Number),
            (r'.', Text)
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
    }
