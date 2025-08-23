"""
    pygments.lexers.smalltalk
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Smalltalk and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, default
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['SmalltalkLexer', 'NewspeakLexer']


class SmalltalkLexer(RegexLexer):
    """
    For Smalltalk syntax.
    Contributed by Stefan Matthias Aust.
    Rewritten by Nils Winter.
    """
    name = 'Smalltalk'
    url = 'http://www.smalltalk.org/'
    filenames = ['*.st']
    aliases = ['smalltalk', 'squeak', 'st']
    mimetypes = ['text/x-smalltalk']
    version_added = '0.10'

    tokens = {
        'root': [
            (r'(<)(\w+:)(.*?)(>)', bygroups(Text, Keyword, Text, Text)),
            include('squeak fileout'),
            include('whitespaces'),
            include('method definition'),
            (r'(\|)([\w\s]*)(\|)', bygroups(Operator, Name.Variable, Operator)),
            include('objects'),
            (r'\^|\:=|\_', Operator),
            # temporaries
            (r'[\]({}.;!]', Text),
        ],
        'method definition': [
            # Not perfect can't allow whitespaces at the beginning and the
            # without breaking everything
            (r'([a-zA-Z]+\w*:)(\s*)(\w+)',
             bygroups(Name.Function, Text, Name.Variable)),
            (r'^(\b[a-zA-Z]+\w*\b)(\s*)$', bygroups(Name.Function, Text)),
            (r'^([-+*/\\~<>=|&!?,@%]+)(\s*)(\w+)(\s*)$',
             bygroups(Name.Function, Text, Name.Variable, Text)),
        ],
        'blockvariables': [
            include('whitespaces'),
            (r'(:)(\s*)(\w+)',
             bygroups(Operator, Text, Name.Variable)),
            (r'\|', Operator, '#pop'),
            default('#pop'),  # else pop
        ],
        'literals': [
            (r"'(''|[^'])*'", String, 'afterobject'),
            (r'\$.', String.Char, 'afterobject'),
            (r'#\(', String.Symbol, 'parenth'),
            (r'\)', Text, 'afterobject'),
            (r'(\d+r)?-?\d+(\.\d+)?(e-?\d+)?', Number, 'afterobject'),
        ],
        '_parenth_helper': [
            include('whitespaces'),
            (r'(\d+r)?-?\d+(\.\d+)?(e-?\d+)?', Number),
            (r'[-+*/\\~<>=|&#!?,@%\w:]+', String.Symbol),
            # literals
            (r"'(''|[^'])*'", String),
            (r'\$.', String.Char),
            (r'#*\(', String.Symbol, 'inner_parenth'),
        ],
        'parenth': [
            # This state is a bit tricky since
            # we can't just pop this state
            (r'\)', String.Symbol, ('root', 'afterobject')),
            include('_parenth_helper'),
        ],
        'inner_parenth': [
            (r'\)', String.Symbol, '#pop'),
            include('_parenth_helper'),
        ],
        'whitespaces': [
            # skip whitespace and comments
            (r'\s+', Text),
            (r'"(""|[^"])*"', Comment),
        ],
        'objects': [
            (r'\[', Text, 'blockvariables'),
            (r'\]', Text, 'afterobject'),
            (r'\b(self|super|true|false|nil|thisContext)\b',
             Name.Builtin.Pseudo, 'afterobject'),
            (r'\b[A-Z]\w*(?!:)\b', Name.Class, 'afterobject'),
            (r'\b[a-z]\w*(?!:)\b', Name.Variable, 'afterobject'),
            (r'#("(""|[^"])*"|[-+*/\\~<>=|&!?,@%]+|[\w:]+)',
             String.Symbol, 'afterobject'),
            include('literals'),
        ],
        'afterobject': [
            (r'! !$', Keyword, '#pop'),  # squeak chunk delimiter
            include('whitespaces'),
            (r'\b(ifTrue:|ifFalse:|whileTrue:|whileFalse:|timesRepeat:)',
             Name.Builtin, '#pop'),
            (r'\b(new\b(?!:))', Name.Builtin),
            (r'\:=|\_', Operator, '#pop'),
            (r'\b[a-zA-Z]+\w*:', Name.Function, '#pop'),
            (r'\b[a-zA-Z]+\w*', Name.Function),
            (r'\w+:?|[-+*/\\~<>=|&!?,@%]+', Name.Function, '#pop'),
            (r'\.', Punctuation, '#pop'),
            (r';', Punctuation),
            (r'[\])}]', Text),
            (r'[\[({]', Text, '#pop'),
        ],
        'squeak fileout': [
            # Squeak fileout format (optional)
            (r'^"(""|[^"])*"!', Keyword),
            (r"^'(''|[^'])*'!", Keyword),
            (r'^(!)(\w+)( commentStamp: )(.*?)( prior: .*?!\n)(.*?)(!)',
                bygroups(Keyword, Name.Class, Keyword, String, Keyword, Text, Keyword)),
            (r"^(!)(\w+(?: class)?)( methodsFor: )('(?:''|[^'])*')(.*?!)",
                bygroups(Keyword, Name.Class, Keyword, String, Keyword)),
            (r'^(\w+)( subclass: )(#\w+)'
             r'(\s+instanceVariableNames: )(.*?)'
             r'(\s+classVariableNames: )(.*?)'
             r'(\s+poolDictionaries: )(.*?)'
             r'(\s+category: )(.*?)(!)',
                bygroups(Name.Class, Keyword, String.Symbol, Keyword, String, Keyword,
                         String, Keyword, String, Keyword, String, Keyword)),
            (r'^(\w+(?: class)?)(\s+instanceVariableNames: )(.*?)(!)',
                bygroups(Name.Class, Keyword, String, Keyword)),
            (r'(!\n)(\].*)(! !)$', bygroups(Keyword, Text, Keyword)),
            (r'! !$', Keyword),
        ],
    }


class NewspeakLexer(RegexLexer):
    """
    For Newspeak syntax.
    """
    name = 'Newspeak'
    url = 'http://newspeaklanguage.org/'
    filenames = ['*.ns2']
    aliases = ['newspeak', ]
    mimetypes = ['text/x-newspeak']
    version_added = '1.1'

    tokens = {
        'root': [
            (r'\b(Newsqueak2)\b', Keyword.Declaration),
            (r"'[^']*'", String),
            (r'\b(class)(\s+)(\w+)(\s*)',
             bygroups(Keyword.Declaration, Text, Name.Class, Text)),
            (r'\b(mixin|self|super|private|public|protected|nil|true|false)\b',
             Keyword),
            (r'(\w+\:)(\s*)([a-zA-Z_]\w+)',
             bygroups(Name.Function, Text, Name.Variable)),
            (r'(\w+)(\s*)(=)',
             bygroups(Name.Attribute, Text, Operator)),
            (r'<\w+>', Comment.Special),
            include('expressionstat'),
            include('whitespace')
        ],

        'expressionstat': [
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'\d+', Number.Integer),
            (r':\w+', Name.Variable),
            (r'(\w+)(::)', bygroups(Name.Variable, Operator)),
            (r'\w+:', Name.Function),
            (r'\w+', Name.Variable),
            (r'\(|\)', Punctuation),
            (r'\[|\]', Punctuation),
            (r'\{|\}', Punctuation),

            (r'(\^|\+|\/|~|\*|<|>|=|@|%|\||&|\?|!|,|-|:)', Operator),
            (r'\.|;', Punctuation),
            include('whitespace'),
            include('literals'),
        ],
        'literals': [
            (r'\$.', String),
            (r"'[^']*'", String),
            (r"#'[^']*'", String.Symbol),
            (r"#\w+:?", String.Symbol),
            (r"#(\+|\/|~|\*|<|>|=|@|%|\||&|\?|!|,|-)+", String.Symbol)
        ],
        'whitespace': [
            (r'\s+', Text),
            (r'"[^"]*"', Comment)
        ],
    }
