"""
    pygments.lexers.haskell
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Haskell and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import Lexer, RegexLexer, bygroups, do_insertions, \
    default, include, inherit, line_re
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace
from erdos.erdos._vendor.pygments import unistring as uni

__all__ = ['HaskellLexer', 'HspecLexer', 'IdrisLexer', 'AgdaLexer', 'CryptolLexer',
           'LiterateHaskellLexer', 'LiterateIdrisLexer', 'LiterateAgdaLexer',
           'LiterateCryptolLexer', 'KokaLexer']


class HaskellLexer(RegexLexer):
    """
    A Haskell lexer based on the lexemes defined in the Haskell 98 Report.
    """
    name = 'Haskell'
    url = 'https://www.haskell.org/'
    aliases = ['haskell', 'hs']
    filenames = ['*.hs']
    mimetypes = ['text/x-haskell']
    version_added = '0.8'

    reserved = ('case', 'class', 'data', 'default', 'deriving', 'do', 'else',
                'family', 'if', 'in', 'infix[lr]?', 'instance',
                'let', 'newtype', 'of', 'then', 'type', 'where', '_')
    ascii = ('NUL', 'SOH', '[SE]TX', 'EOT', 'ENQ', 'ACK',
             'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'S[OI]', 'DLE',
             'DC[1-4]', 'NAK', 'SYN', 'ETB', 'CAN',
             'EM', 'SUB', 'ESC', '[FGRU]S', 'SP', 'DEL')

    tokens = {
        'root': [
            # Whitespace:
            (r'\s+', Whitespace),
            # (r'--\s*|.*$', Comment.Doc),
            (r'--(?![!#$%&*+./<=>?@^|_~:\\]).*?$', Comment.Single),
            (r'\{-', Comment.Multiline, 'comment'),
            # Lexemes:
            #  Identifiers
            (r'\bimport\b', Keyword.Reserved, 'import'),
            (r'\bmodule\b', Keyword.Reserved, 'module'),
            (r'\berror\b', Name.Exception),
            (r'\b({})(?!\')\b'.format('|'.join(reserved)), Keyword.Reserved),
            (r"'[^\\]'", String.Char),  # this has to come before the TH quote
            (r'^[_' + uni.Ll + r'][\w\']*', Name.Function),
            (r"'?[_" + uni.Ll + r"][\w']*", Name),
            (r"('')?[" + uni.Lu + r"][\w\']*", Keyword.Type),
            (r"(')[" + uni.Lu + r"][\w\']*", Keyword.Type),
            (r"(')\[[^\]]*\]", Keyword.Type),  # tuples and lists get special treatment in GHC
            (r"(')\([^)]*\)", Keyword.Type),  # ..
            (r"(')[:!#$%&*+.\\/<=>?@^|~-]+", Keyword.Type),  # promoted type operators
            #  Operators
            (r'\\(?![:!#$%&*+.\\/<=>?@^|~-]+)', Name.Function),  # lambda operator
            (r'(<-|::|->|=>|=)(?![:!#$%&*+.\\/<=>?@^|~-]+)', Operator.Word),  # specials
            (r':[:!#$%&*+.\\/<=>?@^|~-]*', Keyword.Type),  # Constructor operators
            (r'[:!#$%&*+.\\/<=>?@^|~-]+', Operator),  # Other operators
            #  Numbers
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*_*[pP][+-]?\d(_*\d)*', Number.Float),
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*\.[\da-fA-F](_*[\da-fA-F])*'
             r'(_*[pP][+-]?\d(_*\d)*)?', Number.Float),
            (r'\d(_*\d)*_*[eE][+-]?\d(_*\d)*', Number.Float),
            (r'\d(_*\d)*\.\d(_*\d)*(_*[eE][+-]?\d(_*\d)*)?', Number.Float),
            (r'0[bB]_*[01](_*[01])*', Number.Bin),
            (r'0[oO]_*[0-7](_*[0-7])*', Number.Oct),
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*', Number.Hex),
            (r'\d(_*\d)*', Number.Integer),
            #  Character/String Literals
            (r"'", String.Char, 'character'),
            (r'"', String, 'string'),
            #  Special
            (r'\[\]', Keyword.Type),
            (r'\(\)', Name.Builtin),
            (r'[][(),;`{}]', Punctuation),
        ],
        'import': [
            # Import statements
            (r'\s+', Whitespace),
            (r'"', String, 'string'),
            # after "funclist" state
            (r'\)', Punctuation, '#pop'),
            (r'qualified\b', Keyword),
            # import X as Y
            (r'([' + uni.Lu + r'][\w.]*)(\s+)(as)(\s+)([' + uni.Lu + r'][\w.]*)',
             bygroups(Name.Namespace, Whitespace, Keyword, Whitespace, Name), '#pop'),
            # import X hiding (functions)
            (r'([' + uni.Lu + r'][\w.]*)(\s+)(hiding)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Keyword, Whitespace, Punctuation), 'funclist'),
            # import X (functions)
            (r'([' + uni.Lu + r'][\w.]*)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Punctuation), 'funclist'),
            # import X
            (r'[\w.]+', Name.Namespace, '#pop'),
        ],
        'module': [
            (r'\s+', Whitespace),
            (r'([' + uni.Lu + r'][\w.]*)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Punctuation), 'funclist'),
            (r'[' + uni.Lu + r'][\w.]*', Name.Namespace, '#pop'),
        ],
        'funclist': [
            (r'\s+', Whitespace),
            (r'[' + uni.Lu + r']\w*', Keyword.Type),
            (r'(_[\w\']+|[' + uni.Ll + r'][\w\']*)', Name.Function),
            (r'--(?![!#$%&*+./<=>?@^|_~:\\]).*?$', Comment.Single),
            (r'\{-', Comment.Multiline, 'comment'),
            (r',', Punctuation),
            (r'[:!#$%&*+.\\/<=>?@^|~-]+', Operator),
            # (HACK, but it makes sense to push two instances, believe me)
            (r'\(', Punctuation, ('funclist', 'funclist')),
            (r'\)', Punctuation, '#pop:2'),
        ],
        # NOTE: the next four states are shared in the AgdaLexer; make sure
        # any change is compatible with Agda as well or copy over and change
        'comment': [
            # Multiline Comments
            (r'[^-{}]+', Comment.Multiline),
            (r'\{-', Comment.Multiline, '#push'),
            (r'-\}', Comment.Multiline, '#pop'),
            (r'[-{}]', Comment.Multiline),
        ],
        'character': [
            # Allows multi-chars, incorrectly.
            (r"[^\\']'", String.Char, '#pop'),
            (r"\\", String.Escape, 'escape'),
            ("'", String.Char, '#pop'),
        ],
        'string': [
            (r'[^\\"]+', String),
            (r"\\", String.Escape, 'escape'),
            ('"', String, '#pop'),
        ],
        'escape': [
            (r'[abfnrtv"\'&\\]', String.Escape, '#pop'),
            (r'\^[][' + uni.Lu + r'@^_]', String.Escape, '#pop'),
            ('|'.join(ascii), String.Escape, '#pop'),
            (r'o[0-7]+', String.Escape, '#pop'),
            (r'x[\da-fA-F]+', String.Escape, '#pop'),
            (r'\d+', String.Escape, '#pop'),
            (r'(\s+)(\\)', bygroups(Whitespace, String.Escape), '#pop'),
        ],
    }


class HspecLexer(HaskellLexer):
    """
    A Haskell lexer with support for Hspec constructs.
    """

    name = 'Hspec'
    aliases = ['hspec']
    filenames = ['*Spec.hs']
    mimetypes = []
    version_added = '2.4'

    tokens = {
        'root': [
            (r'(it)(\s*)("[^"]*")', bygroups(Text, Whitespace, String.Doc)),
            (r'(describe)(\s*)("[^"]*")', bygroups(Text, Whitespace, String.Doc)),
            (r'(context)(\s*)("[^"]*")', bygroups(Text, Whitespace, String.Doc)),
            inherit,
        ],
    }


class IdrisLexer(RegexLexer):
    """
    A lexer for the dependently typed programming language Idris.

    Based on the Haskell and Agda Lexer.
    """
    name = 'Idris'
    url = 'https://www.idris-lang.org/'
    aliases = ['idris', 'idr']
    filenames = ['*.idr']
    mimetypes = ['text/x-idris']
    version_added = '2.0'

    reserved = ('case', 'class', 'data', 'default', 'using', 'do', 'else',
                'if', 'in', 'infix[lr]?', 'instance', 'rewrite', 'auto',
                'namespace', 'codata', 'mutual', 'private', 'public', 'abstract',
                'total', 'partial',
                'interface', 'implementation', 'export', 'covering', 'constructor',
                'let', 'proof', 'of', 'then', 'static', 'where', '_', 'with',
                'pattern',  'term',  'syntax', 'prefix',
                'postulate', 'parameters', 'record', 'dsl', 'impossible', 'implicit',
                'tactics', 'intros', 'intro', 'compute', 'refine', 'exact', 'trivial')

    ascii = ('NUL', 'SOH', '[SE]TX', 'EOT', 'ENQ', 'ACK',
             'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'S[OI]', 'DLE',
             'DC[1-4]', 'NAK', 'SYN', 'ETB', 'CAN',
             'EM', 'SUB', 'ESC', '[FGRU]S', 'SP', 'DEL')

    directives = ('lib', 'link', 'flag', 'include', 'hide', 'freeze', 'access',
                  'default', 'logging', 'dynamic', 'name', 'error_handlers', 'language')

    tokens = {
        'root': [
            # Comments
            (r'^(\s*)(%({}))'.format('|'.join(directives)),
             bygroups(Whitespace, Keyword.Reserved)),
            (r'(\s*)(--(?![!#$%&*+./<=>?@^|_~:\\]).*?)$', bygroups(Whitespace, Comment.Single)),
            (r'(\s*)(\|{3}.*?)$', bygroups(Whitespace, Comment.Single)),
            (r'(\s*)(\{-)', bygroups(Whitespace, Comment.Multiline), 'comment'),
            # Declaration
            (r'^(\s*)([^\s(){}]+)(\s*)(:)(\s*)',
             bygroups(Whitespace, Name.Function, Whitespace, Operator.Word, Whitespace)),
            #  Identifiers
            (r'\b({})(?!\')\b'.format('|'.join(reserved)), Keyword.Reserved),
            (r'(import|module)(\s+)', bygroups(Keyword.Reserved, Whitespace), 'module'),
            (r"('')?[A-Z][\w\']*", Keyword.Type),
            (r'[a-z][\w\']*', Text),
            #  Special Symbols
            (r'(<-|::|->|=>|=)', Operator.Word),  # specials
            (r'([(){}\[\]:!#$%&*+.\\/<=>?@^|~-]+)', Operator.Word),  # specials
            #  Numbers
            (r'\d+[eE][+-]?\d+', Number.Float),
            (r'\d+\.\d+([eE][+-]?\d+)?', Number.Float),
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            # Strings
            (r"'", String.Char, 'character'),
            (r'"', String, 'string'),
            (r'[^\s(){}]+', Text),
            (r'\s+?', Whitespace),  # Whitespace
        ],
        'module': [
            (r'\s+', Whitespace),
            (r'([A-Z][\w.]*)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Punctuation), 'funclist'),
            (r'[A-Z][\w.]*', Name.Namespace, '#pop'),
        ],
        'funclist': [
            (r'\s+', Whitespace),
            (r'[A-Z]\w*', Keyword.Type),
            (r'(_[\w\']+|[a-z][\w\']*)', Name.Function),
            (r'--.*$', Comment.Single),
            (r'\{-', Comment.Multiline, 'comment'),
            (r',', Punctuation),
            (r'[:!#$%&*+.\\/<=>?@^|~-]+', Operator),
            # (HACK, but it makes sense to push two instances, believe me)
            (r'\(', Punctuation, ('funclist', 'funclist')),
            (r'\)', Punctuation, '#pop:2'),
        ],
        # NOTE: the next four states are shared in the AgdaLexer; make sure
        # any change is compatible with Agda as well or copy over and change
        'comment': [
            # Multiline Comments
            (r'[^-{}]+', Comment.Multiline),
            (r'\{-', Comment.Multiline, '#push'),
            (r'-\}', Comment.Multiline, '#pop'),
            (r'[-{}]', Comment.Multiline),
        ],
        'character': [
            # Allows multi-chars, incorrectly.
            (r"[^\\']", String.Char),
            (r"\\", String.Escape, 'escape'),
            ("'", String.Char, '#pop'),
        ],
        'string': [
            (r'[^\\"]+', String),
            (r"\\", String.Escape, 'escape'),
            ('"', String, '#pop'),
        ],
        'escape': [
            (r'[abfnrtv"\'&\\]', String.Escape, '#pop'),
            (r'\^[][A-Z@^_]', String.Escape, '#pop'),
            ('|'.join(ascii), String.Escape, '#pop'),
            (r'o[0-7]+', String.Escape, '#pop'),
            (r'x[\da-fA-F]+', String.Escape, '#pop'),
            (r'\d+', String.Escape, '#pop'),
            (r'(\s+)(\\)', bygroups(Whitespace, String.Escape), '#pop')
        ],
    }


class AgdaLexer(RegexLexer):
    """
    For the Agda dependently typed functional programming language and
    proof assistant.
    """

    name = 'Agda'
    url = 'http://wiki.portal.chalmers.se/agda/pmwiki.php'
    aliases = ['agda']
    filenames = ['*.agda']
    mimetypes = ['text/x-agda']
    version_added = '2.0'

    reserved = (
        'abstract', 'codata', 'coinductive', 'constructor', 'data', 'do',
        'eta-equality', 'field', 'forall', 'hiding', 'in', 'inductive', 'infix',
        'infixl', 'infixr', 'instance', 'interleaved', 'let', 'macro', 'mutual',
        'no-eta-equality', 'opaque', 'open', 'overlap', 'pattern', 'postulate', 'primitive',
        'private', 'quote', 'quoteTerm', 'record', 'renaming', 'rewrite',
        'syntax', 'tactic', 'unfolding', 'unquote', 'unquoteDecl', 'unquoteDef', 'using',
        'variable', 'where', 'with',
    )

    tokens = {
        'root': [
            # Declaration
            (r'^(\s*)([^\s(){}]+)(\s*)(:)(\s*)',
             bygroups(Whitespace, Name.Function, Whitespace,
                      Operator.Word, Whitespace)),
            # Comments
            (r'--(?![!#$%&*+./<=>?@^|_~:\\]).*?$', Comment.Single),
            (r'\{-', Comment.Multiline, 'comment'),
            # Holes
            (r'\{!', Comment.Directive, 'hole'),
            # Lexemes:
            #  Identifiers
            (r'\b({})(?!\')\b'.format('|'.join(reserved)), Keyword.Reserved),
            (r'(import|module)(\s+)', bygroups(Keyword.Reserved, Whitespace),
             'module'),
            (r'\b(Set|Prop)[\u2080-\u2089]*\b', Keyword.Type),
            #  Special Symbols
            (r'(\(|\)|\{|\})', Operator),
            (r'(\.{1,3}|\||\u03BB|\u2200|\u2192|:|=|->)', Operator.Word),
            #  Numbers
            (r'\d+[eE][+-]?\d+', Number.Float),
            (r'\d+\.\d+([eE][+-]?\d+)?', Number.Float),
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            # Strings
            (r"'", String.Char, 'character'),
            (r'"', String, 'string'),
            (r'[^\s(){}]+', Text),
            (r'\s+?', Whitespace),  # Whitespace
        ],
        'hole': [
            # Holes
            (r'[^!{}]+', Comment.Directive),
            (r'\{!', Comment.Directive, '#push'),
            (r'!\}', Comment.Directive, '#pop'),
            (r'[!{}]', Comment.Directive),
        ],
        'module': [
            (r'\{-', Comment.Multiline, 'comment'),
            (r'[a-zA-Z][\w.\']*', Name, '#pop'),
            (r'[\W0-9_]+', Text)
        ],
        'comment': HaskellLexer.tokens['comment'],
        'character': HaskellLexer.tokens['character'],
        'string': HaskellLexer.tokens['string'],
        'escape': HaskellLexer.tokens['escape']
    }


class CryptolLexer(RegexLexer):
    """
    FIXME: A Cryptol2 lexer based on the lexemes defined in the Haskell 98 Report.
    """
    name = 'Cryptol'
    aliases = ['cryptol', 'cry']
    filenames = ['*.cry']
    mimetypes = ['text/x-cryptol']
    url = 'https://www.cryptol.net'
    version_added = '2.0'

    reserved = ('Arith', 'Bit', 'Cmp', 'False', 'Inf', 'True', 'else',
                'export', 'extern', 'fin', 'if', 'import', 'inf', 'lg2',
                'max', 'min', 'module', 'newtype', 'pragma', 'property',
                'then', 'type', 'where', 'width')
    ascii = ('NUL', 'SOH', '[SE]TX', 'EOT', 'ENQ', 'ACK',
             'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'S[OI]', 'DLE',
             'DC[1-4]', 'NAK', 'SYN', 'ETB', 'CAN',
             'EM', 'SUB', 'ESC', '[FGRU]S', 'SP', 'DEL')

    tokens = {
        'root': [
            # Whitespace:
            (r'\s+', Whitespace),
            # (r'--\s*|.*$', Comment.Doc),
            (r'//.*$', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),
            # Lexemes:
            #  Identifiers
            (r'\bimport\b', Keyword.Reserved, 'import'),
            (r'\bmodule\b', Keyword.Reserved, 'module'),
            (r'\berror\b', Name.Exception),
            (r'\b({})(?!\')\b'.format('|'.join(reserved)), Keyword.Reserved),
            (r'^[_a-z][\w\']*', Name.Function),
            (r"'?[_a-z][\w']*", Name),
            (r"('')?[A-Z][\w\']*", Keyword.Type),
            #  Operators
            (r'\\(?![:!#$%&*+.\\/<=>?@^|~-]+)', Name.Function),  # lambda operator
            (r'(<-|::|->|=>|=)(?![:!#$%&*+.\\/<=>?@^|~-]+)', Operator.Word),  # specials
            (r':[:!#$%&*+.\\/<=>?@^|~-]*', Keyword.Type),  # Constructor operators
            (r'[:!#$%&*+.\\/<=>?@^|~-]+', Operator),  # Other operators
            #  Numbers
            (r'\d+[eE][+-]?\d+', Number.Float),
            (r'\d+\.\d+([eE][+-]?\d+)?', Number.Float),
            (r'0[oO][0-7]+', Number.Oct),
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            #  Character/String Literals
            (r"'", String.Char, 'character'),
            (r'"', String, 'string'),
            #  Special
            (r'\[\]', Keyword.Type),
            (r'\(\)', Name.Builtin),
            (r'[][(),;`{}]', Punctuation),
        ],
        'import': [
            # Import statements
            (r'\s+', Whitespace),
            (r'"', String, 'string'),
            # after "funclist" state
            (r'\)', Punctuation, '#pop'),
            (r'qualified\b', Keyword),
            # import X as Y
            (r'([A-Z][\w.]*)(\s+)(as)(\s+)([A-Z][\w.]*)',
             bygroups(Name.Namespace, Whitespace, Keyword, Whitespace, Name), '#pop'),
            # import X hiding (functions)
            (r'([A-Z][\w.]*)(\s+)(hiding)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Keyword, Whitespace, Punctuation), 'funclist'),
            # import X (functions)
            (r'([A-Z][\w.]*)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Punctuation), 'funclist'),
            # import X
            (r'[\w.]+', Name.Namespace, '#pop'),
        ],
        'module': [
            (r'\s+', Whitespace),
            (r'([A-Z][\w.]*)(\s+)(\()',
             bygroups(Name.Namespace, Whitespace, Punctuation), 'funclist'),
            (r'[A-Z][\w.]*', Name.Namespace, '#pop'),
        ],
        'funclist': [
            (r'\s+', Whitespace),
            (r'[A-Z]\w*', Keyword.Type),
            (r'(_[\w\']+|[a-z][\w\']*)', Name.Function),
            # TODO: these don't match the comments in docs, remove.
            # (r'--(?![!#$%&*+./<=>?@^|_~:\\]).*?$', Comment.Single),
            # (r'{-', Comment.Multiline, 'comment'),
            (r',', Punctuation),
            (r'[:!#$%&*+.\\/<=>?@^|~-]+', Operator),
            # (HACK, but it makes sense to push two instances, believe me)
            (r'\(', Punctuation, ('funclist', 'funclist')),
            (r'\)', Punctuation, '#pop:2'),
        ],
        'comment': [
            # Multiline Comments
            (r'[^/*]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'character': [
            # Allows multi-chars, incorrectly.
            (r"[^\\']'", String.Char, '#pop'),
            (r"\\", String.Escape, 'escape'),
            ("'", String.Char, '#pop'),
        ],
        'string': [
            (r'[^\\"]+', String),
            (r"\\", String.Escape, 'escape'),
            ('"', String, '#pop'),
        ],
        'escape': [
            (r'[abfnrtv"\'&\\]', String.Escape, '#pop'),
            (r'\^[][A-Z@^_]', String.Escape, '#pop'),
            ('|'.join(ascii), String.Escape, '#pop'),
            (r'o[0-7]+', String.Escape, '#pop'),
            (r'x[\da-fA-F]+', String.Escape, '#pop'),
            (r'\d+', String.Escape, '#pop'),
            (r'(\s+)(\\)', bygroups(Whitespace, String.Escape), '#pop'),
        ],
    }

    EXTRA_KEYWORDS = {'join', 'split', 'reverse', 'transpose', 'width',
                      'length', 'tail', '<<', '>>', '<<<', '>>>', 'const',
                      'reg', 'par', 'seq', 'ASSERT', 'undefined', 'error',
                      'trace'}

    def get_tokens_unprocessed(self, text):
        stack = ['root']
        for index, token, value in \
                RegexLexer.get_tokens_unprocessed(self, text, stack):
            if token is Name and value in self.EXTRA_KEYWORDS:
                yield index, Name.Builtin, value
            else:
                yield index, token, value


class LiterateLexer(Lexer):
    """
    Base class for lexers of literate file formats based on LaTeX or Bird-style
    (prefixing each code line with ">").

    Additional options accepted:

    `litstyle`
        If given, must be ``"bird"`` or ``"latex"``.  If not given, the style
        is autodetected: if the first non-whitespace character in the source
        is a backslash or percent character, LaTeX is assumed, else Bird.
    """

    bird_re = re.compile(r'(>[ \t]*)(.*\n)')

    def __init__(self, baselexer, **options):
        self.baselexer = baselexer
        Lexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text):
        style = self.options.get('litstyle')
        if style is None:
            style = (text.lstrip()[0:1] in '%\\') and 'latex' or 'bird'

        code = ''
        insertions = []
        if style == 'bird':
            # bird-style
            for match in line_re.finditer(text):
                line = match.group()
                m = self.bird_re.match(line)
                if m:
                    insertions.append((len(code),
                                       [(0, Comment.Special, m.group(1))]))
                    code += m.group(2)
                else:
                    insertions.append((len(code), [(0, Text, line)]))
        else:
            # latex-style
            from erdos.erdos._vendor.pygments.lexers.markup import TexLexer
            lxlexer = TexLexer(**self.options)
            codelines = 0
            latex = ''
            for match in line_re.finditer(text):
                line = match.group()
                if codelines:
                    if line.lstrip().startswith('\\end{code}'):
                        codelines = 0
                        latex += line
                    else:
                        code += line
                elif line.lstrip().startswith('\\begin{code}'):
                    codelines = 1
                    latex += line
                    insertions.append((len(code),
                                       list(lxlexer.get_tokens_unprocessed(latex))))
                    latex = ''
                else:
                    latex += line
            insertions.append((len(code),
                               list(lxlexer.get_tokens_unprocessed(latex))))
        yield from do_insertions(insertions, self.baselexer.get_tokens_unprocessed(code))


class LiterateHaskellLexer(LiterateLexer):
    """
    For Literate Haskell (Bird-style or LaTeX) source.

    Additional options accepted:

    `litstyle`
        If given, must be ``"bird"`` or ``"latex"``.  If not given, the style
        is autodetected: if the first non-whitespace character in the source
        is a backslash or percent character, LaTeX is assumed, else Bird.
    """
    name = 'Literate Haskell'
    aliases = ['literate-haskell', 'lhaskell', 'lhs']
    filenames = ['*.lhs']
    mimetypes = ['text/x-literate-haskell']
    url = 'https://wiki.haskell.org/Literate_programming'
    version_added = '0.9'

    def __init__(self, **options):
        hslexer = HaskellLexer(**options)
        LiterateLexer.__init__(self, hslexer, **options)


class LiterateIdrisLexer(LiterateLexer):
    """
    For Literate Idris (Bird-style or LaTeX) source.

    Additional options accepted:

    `litstyle`
        If given, must be ``"bird"`` or ``"latex"``.  If not given, the style
        is autodetected: if the first non-whitespace character in the source
        is a backslash or percent character, LaTeX is assumed, else Bird.
    """
    name = 'Literate Idris'
    aliases = ['literate-idris', 'lidris', 'lidr']
    filenames = ['*.lidr']
    mimetypes = ['text/x-literate-idris']
    url = 'https://idris2.readthedocs.io/en/latest/reference/literate.html'
    version_added = '2.0'

    def __init__(self, **options):
        hslexer = IdrisLexer(**options)
        LiterateLexer.__init__(self, hslexer, **options)


class LiterateAgdaLexer(LiterateLexer):
    """
    For Literate Agda source.

    Additional options accepted:

    `litstyle`
        If given, must be ``"bird"`` or ``"latex"``.  If not given, the style
        is autodetected: if the first non-whitespace character in the source
        is a backslash or percent character, LaTeX is assumed, else Bird.
    """
    name = 'Literate Agda'
    aliases = ['literate-agda', 'lagda']
    filenames = ['*.lagda']
    mimetypes = ['text/x-literate-agda']
    url = 'https://agda.readthedocs.io/en/latest/tools/literate-programming.html'
    version_added = '2.0'

    def __init__(self, **options):
        agdalexer = AgdaLexer(**options)
        LiterateLexer.__init__(self, agdalexer, litstyle='latex', **options)


class LiterateCryptolLexer(LiterateLexer):
    """
    For Literate Cryptol (Bird-style or LaTeX) source.

    Additional options accepted:

    `litstyle`
        If given, must be ``"bird"`` or ``"latex"``.  If not given, the style
        is autodetected: if the first non-whitespace character in the source
        is a backslash or percent character, LaTeX is assumed, else Bird.
    """
    name = 'Literate Cryptol'
    aliases = ['literate-cryptol', 'lcryptol', 'lcry']
    filenames = ['*.lcry']
    mimetypes = ['text/x-literate-cryptol']
    url = 'https://www.cryptol.net'
    version_added = '2.0'

    def __init__(self, **options):
        crylexer = CryptolLexer(**options)
        LiterateLexer.__init__(self, crylexer, **options)


class KokaLexer(RegexLexer):
    """
    Lexer for the Koka language.
    """

    name = 'Koka'
    url = 'https://koka-lang.github.io/koka/doc/index.html'
    aliases = ['koka']
    filenames = ['*.kk', '*.kki']
    mimetypes = ['text/x-koka']
    version_added = '1.6'

    keywords = [
        'infix', 'infixr', 'infixl',
        'type', 'cotype', 'rectype', 'alias',
        'struct', 'con',
        'fun', 'function', 'val', 'var',
        'external',
        'if', 'then', 'else', 'elif', 'return', 'match',
        'private', 'public', 'private',
        'module', 'import', 'as',
        'include', 'inline',
        'rec',
        'try', 'yield', 'enum',
        'interface', 'instance',
    ]

    # keywords that are followed by a type
    typeStartKeywords = [
        'type', 'cotype', 'rectype', 'alias', 'struct', 'enum',
    ]

    # keywords valid in a type
    typekeywords = [
        'forall', 'exists', 'some', 'with',
    ]

    # builtin names and special names
    builtin = [
        'for', 'while', 'repeat',
        'foreach', 'foreach-indexed',
        'error', 'catch', 'finally',
        'cs', 'js', 'file', 'ref', 'assigned',
    ]

    # symbols that can be in an operator
    symbols = r'[$%&*+@!/\\^~=.:\-?|<>]+'

    # symbol boundary: an operator keyword should not be followed by any of these
    sboundary = '(?!' + symbols + ')'

    # name boundary: a keyword should not be followed by any of these
    boundary = r'(?![\w/])'

    # koka token abstractions
    tokenType = Name.Attribute
    tokenTypeDef = Name.Class
    tokenConstructor = Generic.Emph

    # main lexer
    tokens = {
        'root': [
            include('whitespace'),

            # go into type mode
            (r'::?' + sboundary, tokenType, 'type'),
            (r'(alias)(\s+)([a-z]\w*)?', bygroups(Keyword, Whitespace, tokenTypeDef),
             'alias-type'),
            (r'(struct)(\s+)([a-z]\w*)?', bygroups(Keyword, Whitespace, tokenTypeDef),
             'struct-type'),
            ((r'({})'.format('|'.join(typeStartKeywords))) +
             r'(\s+)([a-z]\w*)?', bygroups(Keyword, Whitespace, tokenTypeDef),
             'type'),

            # special sequences of tokens (we use ?: for non-capturing group as
            # required by 'bygroups')
            (r'(module)(\s+)(interface(?=\s))?(\s+)?((?:[a-z]\w*/)*[a-z]\w*)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Name.Namespace)),
            (r'(import)(\s+)((?:[a-z]\w*/)*[a-z]\w*)'
             r'(?:(\s*)(=)(\s*)(qualified)?(\s*)'
             r'((?:[a-z]\w*/)*[a-z]\w*))?',
             bygroups(Keyword, Whitespace, Name.Namespace, Whitespace, Keyword, Whitespace,
                      Keyword, Whitespace, Name.Namespace)),

            (r'^(public|private)?(\s+)?(function|fun|val)'
             r'(\s+)([a-z]\w*|\((?:' + symbols + r'|/)\))',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Name.Function)),
            (r'^(?:(public|private)(?=\s+external))?((?<!^)\s+)?(external)(\s+)(inline(?=\s))?(\s+)?'
             r'([a-z]\w*|\((?:' + symbols + r'|/)\))',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword, Whitespace, Name.Function)),

            # keywords
            (r'({})'.format('|'.join(typekeywords)) + boundary, Keyword.Type),
            (r'({})'.format('|'.join(keywords)) + boundary, Keyword),
            (r'({})'.format('|'.join(builtin)) + boundary, Keyword.Pseudo),
            (r'::?|:=|\->|[=.]' + sboundary, Keyword),

            # names
            (r'((?:[a-z]\w*/)*)([A-Z]\w*)',
             bygroups(Name.Namespace, tokenConstructor)),
            (r'((?:[a-z]\w*/)*)([a-z]\w*)', bygroups(Name.Namespace, Name)),
            (r'((?:[a-z]\w*/)*)(\((?:' + symbols + r'|/)\))',
             bygroups(Name.Namespace, Name)),
            (r'_\w*', Name.Variable),

            # literal string
            (r'@"', String.Double, 'litstring'),

            # operators
            (symbols + "|/(?![*/])", Operator),
            (r'`', Operator),
            (r'[{}()\[\];,]', Punctuation),

            # literals. No check for literal characters with len > 1
            (r'[0-9]+\.[0-9]+([eE][\-+]?[0-9]+)?', Number.Float),
            (r'0[xX][0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),

            (r"'", String.Char, 'char'),
            (r'"', String.Double, 'string'),
        ],

        # type started by alias
        'alias-type': [
            (r'=', Keyword),
            include('type')
        ],

        # type started by struct
        'struct-type': [
            (r'(?=\((?!,*\)))', Punctuation, '#pop'),
            include('type')
        ],

        # type started by colon
        'type': [
            (r'[(\[<]', tokenType, 'type-nested'),
            include('type-content')
        ],

        # type nested in brackets: can contain parameters, comma etc.
        'type-nested': [
            (r'[)\]>]', tokenType, '#pop'),
            (r'[(\[<]', tokenType, 'type-nested'),
            (r',', tokenType),
            (r'([a-z]\w*)(\s*)(:)(?!:)',
             bygroups(Name, Whitespace, tokenType)),  # parameter name
            include('type-content')
        ],

        # shared contents of a type
        'type-content': [
            include('whitespace'),

            # keywords
            (r'({})'.format('|'.join(typekeywords)) + boundary, Keyword),
            (r'(?=(({})'.format('|'.join(keywords)) + boundary + '))',
             Keyword, '#pop'),  # need to match because names overlap...

            # kinds
            (r'[EPHVX]' + boundary, tokenType),

            # type names
            (r'[a-z][0-9]*(?![\w/])', tokenType),
            (r'_\w*', tokenType.Variable),  # Generic.Emph
            (r'((?:[a-z]\w*/)*)([A-Z]\w*)',
             bygroups(Name.Namespace, tokenType)),
            (r'((?:[a-z]\w*/)*)([a-z]\w+)',
             bygroups(Name.Namespace, tokenType)),

            # type keyword operators
            (r'::|->|[.:|]', tokenType),

            # catchall
            default('#pop')
        ],

        # comments and literals
        'whitespace': [
            (r'(\n\s*)(#.*)$', bygroups(Whitespace, Comment.Preproc)),
            (r'\s+', Whitespace),
            (r'/\*', Comment.Multiline, 'comment'),
            (r'//.*$', Comment.Single)
        ],
        'comment': [
            (r'[^/*]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'litstring': [
            (r'[^"]+', String.Double),
            (r'""', String.Escape),
            (r'"', String.Double, '#pop'),
        ],
        'string': [
            (r'[^\\"\n]+', String.Double),
            include('escape-sequence'),
            (r'["\n]', String.Double, '#pop'),
        ],
        'char': [
            (r'[^\\\'\n]+', String.Char),
            include('escape-sequence'),
            (r'[\'\n]', String.Char, '#pop'),
        ],
        'escape-sequence': [
            (r'\\[nrt\\"\']', String.Escape),
            (r'\\x[0-9a-fA-F]{2}', String.Escape),
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            # Yes, \U literals are 6 hex digits.
            (r'\\U[0-9a-fA-F]{6}', String.Escape)
        ]
    }
