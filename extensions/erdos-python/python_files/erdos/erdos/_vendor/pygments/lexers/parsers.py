"""
    pygments.lexers.parsers
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for parser generators.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, DelegatingLexer, \
    include, bygroups, using
from erdos.erdos._vendor.pygments.token import Punctuation, Other, Text, Comment, Operator, \
    Keyword, Name, String, Number, Whitespace
from erdos.erdos._vendor.pygments.lexers.jvm import JavaLexer
from erdos.erdos._vendor.pygments.lexers.c_cpp import CLexer, CppLexer
from erdos.erdos._vendor.pygments.lexers.objective import ObjectiveCLexer
from erdos.erdos._vendor.pygments.lexers.d import DLexer
from erdos.erdos._vendor.pygments.lexers.dotnet import CSharpLexer
from erdos.erdos._vendor.pygments.lexers.ruby import RubyLexer
from erdos.erdos._vendor.pygments.lexers.python import PythonLexer
from erdos.erdos._vendor.pygments.lexers.perl import PerlLexer

__all__ = ['RagelLexer', 'RagelEmbeddedLexer', 'RagelCLexer', 'RagelDLexer',
           'RagelCppLexer', 'RagelObjectiveCLexer', 'RagelRubyLexer',
           'RagelJavaLexer', 'AntlrLexer', 'AntlrPythonLexer',
           'AntlrPerlLexer', 'AntlrRubyLexer', 'AntlrCppLexer',
           'AntlrCSharpLexer', 'AntlrObjectiveCLexer',
           'AntlrJavaLexer', 'AntlrActionScriptLexer',
           'TreetopLexer', 'EbnfLexer']


class RagelLexer(RegexLexer):
    """A pure `Ragel <www.colm.net/open-source/ragel>`_ lexer.  Use this
    for fragments of Ragel.  For ``.rl`` files, use
    :class:`RagelEmbeddedLexer` instead (or one of the
    language-specific subclasses).

    """

    name = 'Ragel'
    url = 'http://www.colm.net/open-source/ragel/'
    aliases = ['ragel']
    filenames = []
    version_added = '1.1'

    tokens = {
        'whitespace': [
            (r'\s+', Whitespace)
        ],
        'comments': [
            (r'\#.*$', Comment),
        ],
        'keywords': [
            (r'(access|action|alphtype)\b', Keyword),
            (r'(getkey|write|machine|include)\b', Keyword),
            (r'(any|ascii|extend|alpha|digit|alnum|lower|upper)\b', Keyword),
            (r'(xdigit|cntrl|graph|print|punct|space|zlen|empty)\b', Keyword)
        ],
        'numbers': [
            (r'0x[0-9A-Fa-f]+', Number.Hex),
            (r'[+-]?[0-9]+', Number.Integer),
        ],
        'literals': [
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'\[(\\\\|\\[^\\]|[^\\\]])*\]', String),          # square bracket literals
            (r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/', String.Regex),  # regular expressions
        ],
        'identifiers': [
            (r'[a-zA-Z_]\w*', Name.Variable),
        ],
        'operators': [
            (r',', Operator),                           # Join
            (r'\||&|--?', Operator),                    # Union, Intersection and Subtraction
            (r'\.|<:|:>>?', Operator),                  # Concatention
            (r':', Operator),                           # Label
            (r'->', Operator),                          # Epsilon Transition
            (r'(>|\$|%|<|@|<>)(/|eof\b)', Operator),    # EOF Actions
            (r'(>|\$|%|<|@|<>)(!|err\b)', Operator),    # Global Error Actions
            (r'(>|\$|%|<|@|<>)(\^|lerr\b)', Operator),  # Local Error Actions
            (r'(>|\$|%|<|@|<>)(~|to\b)', Operator),     # To-State Actions
            (r'(>|\$|%|<|@|<>)(\*|from\b)', Operator),  # From-State Actions
            (r'>|@|\$|%', Operator),                    # Transition Actions and Priorities
            (r'\*|\?|\+|\{[0-9]*,[0-9]*\}', Operator),  # Repetition
            (r'!|\^', Operator),                        # Negation
            (r'\(|\)', Operator),                       # Grouping
        ],
        'root': [
            include('literals'),
            include('whitespace'),
            include('comments'),
            include('keywords'),
            include('numbers'),
            include('identifiers'),
            include('operators'),
            (r'\{', Punctuation, 'host'),
            (r'=', Operator),
            (r';', Punctuation),
        ],
        'host': [
            (r'(' + r'|'.join((  # keep host code in largest possible chunks
                r'[^{}\'"/#]+',  # exclude unsafe characters
                r'[^\\]\\[{}]',  # allow escaped { or }

                # strings and comments may safely contain unsafe characters
                r'"(\\\\|\\[^\\]|[^"\\])*"',
                r"'(\\\\|\\[^\\]|[^'\\])*'",
                r'//.*$\n?',            # single line comment
                r'/\*(.|\n)*?\*/',      # multi-line javadoc-style comment
                r'\#.*$\n?',            # ruby comment

                # regular expression: There's no reason for it to start
                # with a * and this stops confusion with comments.
                r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/',

                # / is safe now that we've handled regex and javadoc comments
                r'/',
            )) + r')+', Other),

            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
        ],
    }


class RagelEmbeddedLexer(RegexLexer):
    """
    A lexer for Ragel embedded in a host language file.

    This will only highlight Ragel statements. If you want host language
    highlighting then call the language-specific Ragel lexer.
    """

    name = 'Embedded Ragel'
    aliases = ['ragel-em']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    tokens = {
        'root': [
            (r'(' + r'|'.join((   # keep host code in largest possible chunks
                r'[^%\'"/#]+',    # exclude unsafe characters
                r'%(?=[^%]|$)',   # a single % sign is okay, just not 2 of them

                # strings and comments may safely contain unsafe characters
                r'"(\\\\|\\[^\\]|[^"\\])*"',
                r"'(\\\\|\\[^\\]|[^'\\])*'",
                r'/\*(.|\n)*?\*/',      # multi-line javadoc-style comment
                r'//.*$\n?',  # single line comment
                r'\#.*$\n?',  # ruby/ragel comment
                r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/',  # regular expression

                # / is safe now that we've handled regex and javadoc comments
                r'/',
            )) + r')+', Other),

            # Single Line FSM.
            # Please don't put a quoted newline in a single line FSM.
            # That's just mean. It will break this.
            (r'(%%)(?![{%])(.*)($|;)(\n?)', bygroups(Punctuation,
                                                     using(RagelLexer),
                                                     Punctuation, Text)),

            # Multi Line FSM.
            (r'(%%%%|%%)\{', Punctuation, 'multi-line-fsm'),
        ],
        'multi-line-fsm': [
            (r'(' + r'|'.join((  # keep ragel code in largest possible chunks.
                r'(' + r'|'.join((
                    r'[^}\'"\[/#]',   # exclude unsafe characters
                    r'\}(?=[^%]|$)',   # } is okay as long as it's not followed by %
                    r'\}%(?=[^%]|$)',  # ...well, one %'s okay, just not two...
                    r'[^\\]\\[{}]',   # ...and } is okay if it's escaped

                    # allow / if it's preceded with one of these symbols
                    # (ragel EOF actions)
                    r'(>|\$|%|<|@|<>)/',

                    # specifically allow regex followed immediately by *
                    # so it doesn't get mistaken for a comment
                    r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/\*',

                    # allow / as long as it's not followed by another / or by a *
                    r'/(?=[^/*]|$)',

                    # We want to match as many of these as we can in one block.
                    # Not sure if we need the + sign here,
                    # does it help performance?
                )) + r')+',

                # strings and comments may safely contain unsafe characters
                r'"(\\\\|\\[^\\]|[^"\\])*"',
                r"'(\\\\|\\[^\\]|[^'\\])*'",
                r"\[(\\\\|\\[^\\]|[^\]\\])*\]",  # square bracket literal
                r'/\*(.|\n)*?\*/',          # multi-line javadoc-style comment
                r'//.*$\n?',                # single line comment
                r'\#.*$\n?',                # ruby/ragel comment
            )) + r')+', using(RagelLexer)),

            (r'\}%%', Punctuation, '#pop'),
        ]
    }

    def analyse_text(text):
        return '@LANG: indep' in text


class RagelRubyLexer(DelegatingLexer):
    """
    A lexer for Ragel in a Ruby host file.
    """

    name = 'Ragel in Ruby Host'
    aliases = ['ragel-ruby', 'ragel-rb']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(RubyLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: ruby' in text


class RagelCLexer(DelegatingLexer):
    """
    A lexer for Ragel in a C host file.
    """

    name = 'Ragel in C Host'
    aliases = ['ragel-c']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(CLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: c' in text


class RagelDLexer(DelegatingLexer):
    """
    A lexer for Ragel in a D host file.
    """

    name = 'Ragel in D Host'
    aliases = ['ragel-d']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(DLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: d' in text


class RagelCppLexer(DelegatingLexer):
    """
    A lexer for Ragel in a C++ host file.
    """

    name = 'Ragel in CPP Host'
    aliases = ['ragel-cpp']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(CppLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: c++' in text


class RagelObjectiveCLexer(DelegatingLexer):
    """
    A lexer for Ragel in an Objective C host file.
    """

    name = 'Ragel in Objective C Host'
    aliases = ['ragel-objc']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(ObjectiveCLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: objc' in text


class RagelJavaLexer(DelegatingLexer):
    """
    A lexer for Ragel in a Java host file.
    """

    name = 'Ragel in Java Host'
    aliases = ['ragel-java']
    filenames = ['*.rl']
    url = 'http://www.colm.net/open-source/ragel/'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(JavaLexer, RagelEmbeddedLexer, **options)

    def analyse_text(text):
        return '@LANG: java' in text


class AntlrLexer(RegexLexer):
    """
    Generic ANTLR Lexer.
    Should not be called directly, instead
    use DelegatingLexer for your target language.
    """

    name = 'ANTLR'
    aliases = ['antlr']
    filenames = []
    url = 'https://www.antlr.org'
    version_added = '1.1'

    _id = r'[A-Za-z]\w*'
    _TOKEN_REF = r'[A-Z]\w*'
    _RULE_REF = r'[a-z]\w*'
    _STRING_LITERAL = r'\'(?:\\\\|\\\'|[^\']*)\''
    _INT = r'[0-9]+'

    tokens = {
        'whitespace': [
            (r'\s+', Whitespace),
        ],
        'comments': [
            (r'//.*$', Comment),
            (r'/\*(.|\n)*?\*/', Comment),
        ],
        'root': [
            include('whitespace'),
            include('comments'),

            (r'(lexer|parser|tree)?(\s*)(grammar\b)(\s*)(' + _id + ')(;)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Name.Class,
                      Punctuation)),
            # optionsSpec
            (r'options\b', Keyword, 'options'),
            # tokensSpec
            (r'tokens\b', Keyword, 'tokens'),
            # attrScope
            (r'(scope)(\s*)(' + _id + r')(\s*)(\{)',
             bygroups(Keyword, Whitespace, Name.Variable, Whitespace,
                      Punctuation), 'action'),
            # exception
            (r'(catch|finally)\b', Keyword, 'exception'),
            # action
            (r'(@' + _id + r')(\s*)(::)?(\s*)(' + _id + r')(\s*)(\{)',
             bygroups(Name.Label, Whitespace, Punctuation, Whitespace,
                      Name.Label, Whitespace, Punctuation), 'action'),
            # rule
            (r'((?:protected|private|public|fragment)\b)?(\s*)(' + _id + ')(!)?',
             bygroups(Keyword, Whitespace, Name.Label, Punctuation),
             ('rule-alts', 'rule-prelims')),
        ],
        'exception': [
            (r'\n', Whitespace, '#pop'),
            (r'\s', Whitespace),
            include('comments'),

            (r'\[', Punctuation, 'nested-arg-action'),
            (r'\{', Punctuation, 'action'),
        ],
        'rule-prelims': [
            include('whitespace'),
            include('comments'),

            (r'returns\b', Keyword),
            (r'\[', Punctuation, 'nested-arg-action'),
            (r'\{', Punctuation, 'action'),
            # throwsSpec
            (r'(throws)(\s+)(' + _id + ')',
             bygroups(Keyword, Whitespace, Name.Label)),
            (r'(,)(\s*)(' + _id + ')',
             bygroups(Punctuation, Whitespace, Name.Label)),  # Additional throws
            # optionsSpec
            (r'options\b', Keyword, 'options'),
            # ruleScopeSpec - scope followed by target language code or name of action
            # TODO finish implementing other possibilities for scope
            # L173 ANTLRv3.g from ANTLR book
            (r'(scope)(\s+)(\{)', bygroups(Keyword, Whitespace, Punctuation),
             'action'),
            (r'(scope)(\s+)(' + _id + r')(\s*)(;)',
             bygroups(Keyword, Whitespace, Name.Label, Whitespace, Punctuation)),
            # ruleAction
            (r'(@' + _id + r')(\s*)(\{)',
             bygroups(Name.Label, Whitespace, Punctuation), 'action'),
            # finished prelims, go to rule alts!
            (r':', Punctuation, '#pop')
        ],
        'rule-alts': [
            include('whitespace'),
            include('comments'),

            # These might need to go in a separate 'block' state triggered by (
            (r'options\b', Keyword, 'options'),
            (r':', Punctuation),

            # literals
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'<<([^>]|>[^>])>>', String),
            # identifiers
            # Tokens start with capital letter.
            (r'\$?[A-Z_]\w*', Name.Constant),
            # Rules start with small letter.
            (r'\$?[a-z_]\w*', Name.Variable),
            # operators
            (r'(\+|\||->|=>|=|\(|\)|\.\.|\.|\?|\*|\^|!|\#|~)', Operator),
            (r',', Punctuation),
            (r'\[', Punctuation, 'nested-arg-action'),
            (r'\{', Punctuation, 'action'),
            (r';', Punctuation, '#pop')
        ],
        'tokens': [
            include('whitespace'),
            include('comments'),
            (r'\{', Punctuation),
            (r'(' + _TOKEN_REF + r')(\s*)(=)?(\s*)(' + _STRING_LITERAL
             + r')?(\s*)(;)',
             bygroups(Name.Label, Whitespace, Punctuation, Whitespace,
                      String, Whitespace, Punctuation)),
            (r'\}', Punctuation, '#pop'),
        ],
        'options': [
            include('whitespace'),
            include('comments'),
            (r'\{', Punctuation),
            (r'(' + _id + r')(\s*)(=)(\s*)(' +
             '|'.join((_id, _STRING_LITERAL, _INT, r'\*')) + r')(\s*)(;)',
             bygroups(Name.Variable, Whitespace, Punctuation, Whitespace,
                      Text, Whitespace, Punctuation)),
            (r'\}', Punctuation, '#pop'),
        ],
        'action': [
            (r'(' + r'|'.join((    # keep host code in largest possible chunks
                r'[^${}\'"/\\]+',  # exclude unsafe characters

                # strings and comments may safely contain unsafe characters
                r'"(\\\\|\\[^\\]|[^"\\])*"',
                r"'(\\\\|\\[^\\]|[^'\\])*'",
                r'//.*$\n?',            # single line comment
                r'/\*(.|\n)*?\*/',      # multi-line javadoc-style comment

                # regular expression: There's no reason for it to start
                # with a * and this stops confusion with comments.
                r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/',

                # backslashes are okay, as long as we are not backslashing a %
                r'\\(?!%)',

                # Now that we've handled regex and javadoc comments
                # it's safe to let / through.
                r'/',
            )) + r')+', Other),
            (r'(\\)(%)', bygroups(Punctuation, Other)),
            (r'(\$[a-zA-Z]+)(\.?)(text|value)?',
             bygroups(Name.Variable, Punctuation, Name.Property)),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
        ],
        'nested-arg-action': [
            (r'(' + r'|'.join((    # keep host code in largest possible chunks.
                r'[^$\[\]\'"/]+',  # exclude unsafe characters

                # strings and comments may safely contain unsafe characters
                r'"(\\\\|\\[^\\]|[^"\\])*"',
                r"'(\\\\|\\[^\\]|[^'\\])*'",
                r'//.*$\n?',            # single line comment
                r'/\*(.|\n)*?\*/',      # multi-line javadoc-style comment

                # regular expression: There's no reason for it to start
                # with a * and this stops confusion with comments.
                r'/(?!\*)(\\\\|\\[^\\]|[^/\\])*/',

                # Now that we've handled regex and javadoc comments
                # it's safe to let / through.
                r'/',
            )) + r')+', Other),


            (r'\[', Punctuation, '#push'),
            (r'\]', Punctuation, '#pop'),
            (r'(\$[a-zA-Z]+)(\.?)(text|value)?',
             bygroups(Name.Variable, Punctuation, Name.Property)),
            (r'(\\\\|\\\]|\\\[|[^\[\]])+', Other),
        ]
    }

    def analyse_text(text):
        return re.search(r'^\s*grammar\s+[a-zA-Z0-9]+\s*;', text, re.M)


# http://www.antlr.org/wiki/display/ANTLR3/Code+Generation+Targets

class AntlrCppLexer(DelegatingLexer):
    """
    ANTLR with C++ Target
    """

    name = 'ANTLR With CPP Target'
    aliases = ['antlr-cpp']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(CppLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*C\s*;', text, re.M)


class AntlrObjectiveCLexer(DelegatingLexer):
    """
    ANTLR with Objective-C Target
    """

    name = 'ANTLR With ObjectiveC Target'
    aliases = ['antlr-objc']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(ObjectiveCLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*ObjC\s*;', text)


class AntlrCSharpLexer(DelegatingLexer):
    """
    ANTLR with C# Target
    """

    name = 'ANTLR With C# Target'
    aliases = ['antlr-csharp', 'antlr-c#']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(CSharpLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*CSharp2\s*;', text, re.M)


class AntlrPythonLexer(DelegatingLexer):
    """
    ANTLR with Python Target
    """

    name = 'ANTLR With Python Target'
    aliases = ['antlr-python']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(PythonLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*Python\s*;', text, re.M)


class AntlrJavaLexer(DelegatingLexer):
    """
    ANTLR with Java Target
    """

    name = 'ANTLR With Java Target'
    aliases = ['antlr-java']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(JavaLexer, AntlrLexer, **options)

    def analyse_text(text):
        # Antlr language is Java by default
        return AntlrLexer.analyse_text(text) and 0.9


class AntlrRubyLexer(DelegatingLexer):
    """
    ANTLR with Ruby Target
    """

    name = 'ANTLR With Ruby Target'
    aliases = ['antlr-ruby', 'antlr-rb']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(RubyLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*Ruby\s*;', text, re.M)


class AntlrPerlLexer(DelegatingLexer):
    """
    ANTLR with Perl Target
    """

    name = 'ANTLR With Perl Target'
    aliases = ['antlr-perl']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        super().__init__(PerlLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*Perl5\s*;', text, re.M)


class AntlrActionScriptLexer(DelegatingLexer):
    """
    ANTLR with ActionScript Target
    """

    name = 'ANTLR With ActionScript Target'
    aliases = ['antlr-actionscript', 'antlr-as']
    filenames = ['*.G', '*.g']
    url = 'https://www.antlr.org'
    version_added = '1.1'

    def __init__(self, **options):
        from erdos.erdos._vendor.pygments.lexers.actionscript import ActionScriptLexer
        super().__init__(ActionScriptLexer, AntlrLexer, **options)

    def analyse_text(text):
        return AntlrLexer.analyse_text(text) and \
            re.search(r'^\s*language\s*=\s*ActionScript\s*;', text, re.M)


class TreetopBaseLexer(RegexLexer):
    """
    A base lexer for `Treetop <http://treetop.rubyforge.org/>`_ grammars.
    Not for direct use; use :class:`TreetopLexer` instead.

    .. versionadded:: 1.6
    """

    tokens = {
        'root': [
            include('space'),
            (r'require[ \t]+[^\n\r]+[\n\r]', Other),
            (r'module\b', Keyword.Namespace, 'module'),
            (r'grammar\b', Keyword, 'grammar'),
        ],
        'module': [
            include('space'),
            include('end'),
            (r'module\b', Keyword, '#push'),
            (r'grammar\b', Keyword, 'grammar'),
            (r'[A-Z]\w*(?:::[A-Z]\w*)*', Name.Namespace),
        ],
        'grammar': [
            include('space'),
            include('end'),
            (r'rule\b', Keyword, 'rule'),
            (r'include\b', Keyword, 'include'),
            (r'[A-Z]\w*', Name),
        ],
        'include': [
            include('space'),
            (r'[A-Z]\w*(?:::[A-Z]\w*)*', Name.Class, '#pop'),
        ],
        'rule': [
            include('space'),
            include('end'),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            (r'([A-Za-z_]\w*)(:)', bygroups(Name.Label, Punctuation)),
            (r'[A-Za-z_]\w*', Name),
            (r'[()]', Punctuation),
            (r'[?+*/&!~]', Operator),
            (r'\[(?:\\.|\[:\^?[a-z]+:\]|[^\\\]])+\]', String.Regex),
            (r'([0-9]*)(\.\.)([0-9]*)',
             bygroups(Number.Integer, Operator, Number.Integer)),
            (r'(<)([^>]+)(>)', bygroups(Punctuation, Name.Class, Punctuation)),
            (r'\{', Punctuation, 'inline_module'),
            (r'\.', String.Regex),
        ],
        'inline_module': [
            (r'\{', Other, 'ruby'),
            (r'\}', Punctuation, '#pop'),
            (r'[^{}]+', Other),
        ],
        'ruby': [
            (r'\{', Other, '#push'),
            (r'\}', Other, '#pop'),
            (r'[^{}]+', Other),
        ],
        'space': [
            (r'[ \t\n\r]+', Whitespace),
            (r'#[^\n]*', Comment.Single),
        ],
        'end': [
            (r'end\b', Keyword, '#pop'),
        ],
    }


class TreetopLexer(DelegatingLexer):
    """
    A lexer for Treetop grammars.
    """

    name = 'Treetop'
    aliases = ['treetop']
    filenames = ['*.treetop', '*.tt']
    url = 'https://cjheath.github.io/treetop'
    version_added = '1.6'

    def __init__(self, **options):
        super().__init__(RubyLexer, TreetopBaseLexer, **options)


class EbnfLexer(RegexLexer):
    """
    Lexer for `ISO/IEC 14977 EBNF
    <https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_Form>`_
    grammars.
    """

    name = 'EBNF'
    aliases = ['ebnf']
    filenames = ['*.ebnf']
    mimetypes = ['text/x-ebnf']
    url = 'https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_Form'
    version_added = '2.0'

    tokens = {
        'root': [
            include('whitespace'),
            include('comment_start'),
            include('identifier'),
            (r'=', Operator, 'production'),
        ],
        'production': [
            include('whitespace'),
            include('comment_start'),
            include('identifier'),
            (r'"[^"]*"', String.Double),
            (r"'[^']*'", String.Single),
            (r'(\?[^?]*\?)', Name.Entity),
            (r'[\[\]{}(),|]', Punctuation),
            (r'-', Operator),
            (r';', Punctuation, '#pop'),
            (r'\.', Punctuation, '#pop'),
        ],
        'whitespace': [
            (r'\s+', Text),
        ],
        'comment_start': [
            (r'\(\*', Comment.Multiline, 'comment'),
        ],
        'comment': [
            (r'[^*)]', Comment.Multiline),
            include('comment_start'),
            (r'\*\)', Comment.Multiline, '#pop'),
            (r'[*)]', Comment.Multiline),
        ],
        'identifier': [
            (r'([a-zA-Z][\w \-]*)', Keyword),
        ],
    }
