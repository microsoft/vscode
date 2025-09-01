"""
    pygments.lexers.grammar_notation
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for grammar notations like BNF.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, this, using, words
from erdos._vendor.pygments.token import Comment, Keyword, Literal, Name, Number, \
    Operator, Punctuation, String, Text, Whitespace

__all__ = ['BnfLexer', 'AbnfLexer', 'JsgfLexer', 'PegLexer']


class BnfLexer(RegexLexer):
    """
    This lexer is for grammar notations which are similar to
    original BNF.

    In order to maximize a number of targets of this lexer,
    let's decide some designs:

    * We don't distinguish `Terminal Symbol`.

    * We do assume that `NonTerminal Symbol` are always enclosed
      with arrow brackets.

    * We do assume that `NonTerminal Symbol` may include
      any printable characters except arrow brackets and ASCII 0x20.
      This assumption is for `RBNF <http://www.rfc-base.org/txt/rfc-5511.txt>`_.

    * We do assume that target notation doesn't support comment.

    * We don't distinguish any operators and punctuation except
      `::=`.

    Though these decision making might cause too minimal highlighting
    and you might be disappointed, but it is reasonable for us.
    """

    name = 'BNF'
    aliases = ['bnf']
    filenames = ['*.bnf']
    mimetypes = ['text/x-bnf']
    url = 'https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form'
    version_added = '2.1'

    tokens = {
        'root': [
            (r'(<)([ -;=?-~]+)(>)',
             bygroups(Punctuation, Name.Class, Punctuation)),

            # an only operator
            (r'::=', Operator),

            # fallback
            (r'[^<>:]+', Text),  # for performance
            (r'.', Text),
        ],
    }


class AbnfLexer(RegexLexer):
    """
    Lexer for IETF 7405 ABNF.

    (Updates `5234 <http://www.ietf.org/rfc/rfc5234.txt>`_) grammars.
    """

    name = 'ABNF'
    url = 'http://www.ietf.org/rfc/rfc7405.txt'
    aliases = ['abnf']
    filenames = ['*.abnf']
    mimetypes = ['text/x-abnf']
    version_added = '2.1'

    _core_rules = (
        'ALPHA', 'BIT', 'CHAR', 'CR', 'CRLF', 'CTL', 'DIGIT',
        'DQUOTE', 'HEXDIG', 'HTAB', 'LF', 'LWSP', 'OCTET',
        'SP', 'VCHAR', 'WSP')

    tokens = {
        'root': [
            # comment
            (r';.*$', Comment.Single),

            # quoted
            #   double quote itself in this state, it is as '%x22'.
            (r'(%[si])?"[^"]*"', Literal),

            # binary (but i have never seen...)
            (r'%b[01]+\-[01]+\b', Literal),  # range
            (r'%b[01]+(\.[01]+)*\b', Literal),  # concat

            # decimal
            (r'%d[0-9]+\-[0-9]+\b', Literal),  # range
            (r'%d[0-9]+(\.[0-9]+)*\b', Literal),  # concat

            # hexadecimal
            (r'%x[0-9a-fA-F]+\-[0-9a-fA-F]+\b', Literal),  # range
            (r'%x[0-9a-fA-F]+(\.[0-9a-fA-F]+)*\b', Literal),  # concat

            # repetition (<a>*<b>element) including nRule
            (r'\b[0-9]+\*[0-9]+', Operator),
            (r'\b[0-9]+\*', Operator),
            (r'\b[0-9]+', Operator),
            (r'\*', Operator),

            # Strictly speaking, these are not keyword but
            # are called `Core Rule'.
            (words(_core_rules, suffix=r'\b'), Keyword),

            # nonterminals (ALPHA *(ALPHA / DIGIT / "-"))
            (r'[a-zA-Z][a-zA-Z0-9-]*\b', Name.Class),

            # operators
            (r'(=/|=|/)', Operator),

            # punctuation
            (r'[\[\]()]', Punctuation),

            # fallback
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
    }


class JsgfLexer(RegexLexer):
    """
    For JSpeech Grammar Format grammars.
    """
    name = 'JSGF'
    url = 'https://www.w3.org/TR/jsgf/'
    aliases = ['jsgf']
    filenames = ['*.jsgf']
    mimetypes = ['application/jsgf', 'application/x-jsgf', 'text/jsgf']
    version_added = '2.2'

    tokens = {
        'root': [
            include('comments'),
            include('non-comments'),
        ],
        'comments': [
            (r'/\*\*(?!/)', Comment.Multiline, 'documentation comment'),
            (r'/\*[\w\W]*?\*/', Comment.Multiline),
            (r'//.*$', Comment.Single),
        ],
        'non-comments': [
            (r'\A#JSGF[^;]*', Comment.Preproc),
            (r'\s+', Whitespace),
            (r';', Punctuation),
            (r'[=|()\[\]*+]', Operator),
            (r'/[^/]+/', Number.Float),
            (r'"', String.Double, 'string'),
            (r'\{', String.Other, 'tag'),
            (words(('import', 'public'), suffix=r'\b'), Keyword.Reserved),
            (r'grammar\b', Keyword.Reserved, 'grammar name'),
            (r'(<)(NULL|VOID)(>)',
             bygroups(Punctuation, Name.Builtin, Punctuation)),
            (r'<', Punctuation, 'rulename'),
            (r'\w+|[^\s;=|()\[\]*+/"{<\w]+', Text),
        ],
        'string': [
            (r'"', String.Double, '#pop'),
            (r'\\.', String.Escape),
            (r'[^\\"]+', String.Double),
        ],
        'tag': [
            (r'\}', String.Other, '#pop'),
            (r'\\.', String.Escape),
            (r'[^\\}]+', String.Other),
        ],
        'grammar name': [
            (r';', Punctuation, '#pop'),
            (r'\s+', Whitespace),
            (r'\.', Punctuation),
            (r'[^;\s.]+', Name.Namespace),
        ],
        'rulename': [
            (r'>', Punctuation, '#pop'),
            (r'\*', Punctuation),
            (r'\s+', Whitespace),
            (r'([^.>]+)(\s*)(\.)', bygroups(Name.Namespace, Text, Punctuation)),
            (r'[^.>]+', Name.Constant),
        ],
        'documentation comment': [
            (r'\*/', Comment.Multiline, '#pop'),
            (r'^(\s*)(\*?)(\s*)(@(?:example|see))(\s+)'
             r'([\w\W]*?(?=(?:^\s*\*?\s*@|\*/)))',
             bygroups(Whitespace, Comment.Multiline, Whitespace, Comment.Special,
                      Whitespace, using(this, state='example'))),
            (r'(^\s*\*?\s*)(@\S*)',
             bygroups(Comment.Multiline, Comment.Special)),
            (r'[^*\n@]+|\w|\W', Comment.Multiline),
        ],
        'example': [
            (r'(\n\s*)(\*)', bygroups(Whitespace, Comment.Multiline)),
            include('non-comments'),
            (r'.', Comment.Multiline),
        ],
    }


class PegLexer(RegexLexer):
    """
    This lexer is for Parsing Expression Grammars (PEG).

    Various implementations of PEG have made different decisions
    regarding the syntax, so let's try to be accommodating:

    * `<-`, `←`, `:`, and `=` are all accepted as rule operators.

    * Both `|` and `/` are choice operators.

    * `^`, `↑`, and `~` are cut operators.

    * A single `a-z` character immediately before a string, or
      multiple `a-z` characters following a string, are part of the
      string (e.g., `r"..."` or `"..."ilmsuxa`).
    """

    name = 'PEG'
    url = 'https://bford.info/pub/lang/peg.pdf'
    aliases = ['peg']
    filenames = ['*.peg']
    mimetypes = ['text/x-peg']
    version_added = '2.6'

    tokens = {
        'root': [
            # Comments
            (r'#.*$', Comment.Single),

            # All operators
            (r'<-|[←:=/|&!?*+^↑~]', Operator),

            # Other punctuation
            (r'[()]', Punctuation),

            # Keywords
            (r'\.', Keyword),

            # Character classes
            (r'(\[)([^\]]*(?:\\.[^\]\\]*)*)(\])',
             bygroups(Punctuation, String, Punctuation)),

            # Single and double quoted strings (with optional modifiers)
            (r'[a-z]?"[^"\\]*(?:\\.[^"\\]*)*"[a-z]*', String.Double),
            (r"[a-z]?'[^'\\]*(?:\\.[^'\\]*)*'[a-z]*", String.Single),

            # Nonterminals are not whitespace, operators, or punctuation
            (r'[^\s<←:=/|&!?*+\^↑~()\[\]"\'#]+', Name.Class),

            # Fallback
            (r'.', Text),
        ],
    }
