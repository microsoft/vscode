"""
    pygments.lexers.fantom
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Fantom language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from string import Template

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, \
    this, default, words
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Literal, Whitespace

__all__ = ['FantomLexer']


class FantomLexer(RegexLexer):
    """
    For Fantom source code.
    """
    name = 'Fantom'
    aliases = ['fan']
    filenames = ['*.fan']
    mimetypes = ['application/x-fantom']
    url = 'https://www.fantom.org'
    version_added = '1.5'

    # often used regexes
    def s(str):
        return Template(str).substitute(
            dict(
                pod=r'[\"\w\.]+',
                eos=r'\n|;',
                id=r'[a-zA-Z_]\w*',
                # all chars which can be part of type definition. Starts with
                # either letter, or [ (maps), or | (funcs)
                type=r'(?:\[|[a-zA-Z_]|\|)[:\w\[\]|\->?]*?',
            )
        )

    tokens = {
        'comments': [
            (r'(?s)/\*.*?\*/', Comment.Multiline),           # Multiline
            (r'//.*?$', Comment.Single),                    # Single line
            # TODO: highlight references in fandocs
            (r'\*\*.*?$', Comment.Special),                 # Fandoc
            (r'#.*$', Comment.Single)                       # Shell-style
        ],
        'literals': [
            (r'\b-?[\d_]+(ns|ms|sec|min|hr|day)', Number),   # Duration
            (r'\b-?[\d_]*\.[\d_]+(ns|ms|sec|min|hr|day)', Number),  # Duration with dot
            (r'\b-?(\d+)?\.\d+(f|F|d|D)?', Number.Float),    # Float/Decimal
            (r'\b-?0x[0-9a-fA-F_]+', Number.Hex),            # Hex
            (r'\b-?[\d_]+', Number.Integer),                 # Int
            (r"'\\.'|'[^\\]'|'\\u[0-9a-f]{4}'", String.Char),  # Char
            (r'"', Punctuation, 'insideStr'),                # Opening quote
            (r'`', Punctuation, 'insideUri'),                # Opening accent
            (r'\b(true|false|null)\b', Keyword.Constant),    # Bool & null
            (r'(?:(\w+)(::))?(\w+)(<\|)(.*?)(\|>)',          # DSL
             bygroups(Name.Namespace, Punctuation, Name.Class,
                      Punctuation, String, Punctuation)),
            (r'(?:(\w+)(::))?(\w+)?(#)(\w+)?',               # Type/slot literal
             bygroups(Name.Namespace, Punctuation, Name.Class,
                      Punctuation, Name.Function)),
            (r'\[,\]', Literal),                             # Empty list
            (s(r'($type)(\[,\])'),                           # Typed empty list
             bygroups(using(this, state='inType'), Literal)),
            (r'\[:\]', Literal),                             # Empty Map
            (s(r'($type)(\[:\])'),
             bygroups(using(this, state='inType'), Literal)),
        ],
        'insideStr': [
            (r'\\\\', String.Escape),                        # Escaped backslash
            (r'\\"', String.Escape),                         # Escaped "
            (r'\\`', String.Escape),                         # Escaped `
            (r'\$\w+', String.Interpol),                     # Subst var
            (r'\$\{.*?\}', String.Interpol),                 # Subst expr
            (r'"', Punctuation, '#pop'),                     # Closing quot
            (r'.', String)                                   # String content
        ],
        'insideUri': [  # TODO: remove copy/paste str/uri
            (r'\\\\', String.Escape),                        # Escaped backslash
            (r'\\"', String.Escape),                         # Escaped "
            (r'\\`', String.Escape),                         # Escaped `
            (r'\$\w+', String.Interpol),                     # Subst var
            (r'\$\{.*?\}', String.Interpol),                 # Subst expr
            (r'`', Punctuation, '#pop'),                     # Closing tick
            (r'.', String.Backtick)                          # URI content
        ],
        'protectionKeywords': [
            (r'\b(public|protected|private|internal)\b', Keyword),
        ],
        'typeKeywords': [
            (r'\b(abstract|final|const|native|facet|enum)\b', Keyword),
        ],
        'methodKeywords': [
            (r'\b(abstract|native|once|override|static|virtual|final)\b',
             Keyword),
        ],
        'fieldKeywords': [
            (r'\b(abstract|const|final|native|override|static|virtual|'
             r'readonly)\b', Keyword)
        ],
        'otherKeywords': [
            (words((
                'try', 'catch', 'throw', 'finally', 'for', 'if', 'else', 'while',
                'as', 'is', 'isnot', 'switch', 'case', 'default', 'continue',
                'break', 'do', 'return', 'get', 'set'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (r'\b(it|this|super)\b', Name.Builtin.Pseudo),
        ],
        'operators': [
            (r'\+\+|\-\-|\+|\-|\*|/|\|\||&&|<=>|<=|<|>=|>|=|!|\[|\]', Operator)
        ],
        'inType': [
            (r'[\[\]|\->:?]', Punctuation),
            (s(r'$id'), Name.Class),
            default('#pop'),

        ],
        'root': [
            include('comments'),
            include('protectionKeywords'),
            include('typeKeywords'),
            include('methodKeywords'),
            include('fieldKeywords'),
            include('literals'),
            include('otherKeywords'),
            include('operators'),
            (r'using\b', Keyword.Namespace, 'using'),         # Using stmt
            (r'@\w+', Name.Decorator, 'facet'),               # Symbol
            (r'(class|mixin)(\s+)(\w+)', bygroups(Keyword, Whitespace, Name.Class),
             'inheritance'),                                  # Inheritance list

            # Type var := val
            (s(r'($type)([ \t]+)($id)(\s*)(:=)'),
             bygroups(using(this, state='inType'), Whitespace,
                      Name.Variable, Whitespace, Operator)),

            # var := val
            (s(r'($id)(\s*)(:=)'),
             bygroups(Name.Variable, Whitespace, Operator)),

            # .someId( or ->someId( ###
            (s(r'(\.|(?:\->))($id)(\s*)(\()'),
             bygroups(Operator, Name.Function, Whitespace, Punctuation),
             'insideParen'),

            # .someId  or ->someId
            (s(r'(\.|(?:\->))($id)'),
             bygroups(Operator, Name.Function)),

            # new makeXXX (
            (r'(new)(\s+)(make\w*)(\s*)(\()',
             bygroups(Keyword, Whitespace, Name.Function, Whitespace, Punctuation),
             'insideMethodDeclArgs'),

            # Type name (
            (s(r'($type)([ \t]+)'  # Return type and whitespace
               r'($id)(\s*)(\()'),  # method name + open brace
             bygroups(using(this, state='inType'), Whitespace,
                      Name.Function, Whitespace, Punctuation),
             'insideMethodDeclArgs'),

            # ArgType argName,
            (s(r'($type)(\s+)($id)(\s*)(,)'),
             bygroups(using(this, state='inType'), Whitespace, Name.Variable,
                      Whitespace, Punctuation)),

            # ArgType argName)
            # Covered in 'insideParen' state

            # ArgType argName -> ArgType|
            (s(r'($type)(\s+)($id)(\s*)(\->)(\s*)($type)(\|)'),
             bygroups(using(this, state='inType'), Whitespace, Name.Variable,
                      Whitespace, Punctuation, Whitespace, using(this, state='inType'),
                      Punctuation)),

            # ArgType argName|
            (s(r'($type)(\s+)($id)(\s*)(\|)'),
             bygroups(using(this, state='inType'), Whitespace, Name.Variable,
                      Whitespace, Punctuation)),

            # Type var
            (s(r'($type)([ \t]+)($id)'),
             bygroups(using(this, state='inType'), Whitespace,
                      Name.Variable)),

            (r'\(', Punctuation, 'insideParen'),
            (r'\{', Punctuation, 'insideBrace'),
            (r'\s+', Whitespace),
            (r'.', Text)
        ],
        'insideParen': [
            (r'\)', Punctuation, '#pop'),
            include('root'),
        ],
        'insideMethodDeclArgs': [
            (r'\)', Punctuation, '#pop'),
            (s(r'($type)(\s+)($id)(\s*)(\))'),
             bygroups(using(this, state='inType'), Whitespace, Name.Variable,
                      Whitespace, Punctuation), '#pop'),
            include('root'),
        ],
        'insideBrace': [
            (r'\}', Punctuation, '#pop'),
            include('root'),
        ],
        'inheritance': [
            (r'\s+', Whitespace),                                      # Whitespace
            (r':|,', Punctuation),
            (r'(?:(\w+)(::))?(\w+)',
             bygroups(Name.Namespace, Punctuation, Name.Class)),
            (r'\{', Punctuation, '#pop')
        ],
        'using': [
            (r'[ \t]+', Whitespace),  # consume whitespaces
            (r'(\[)(\w+)(\])',
             bygroups(Punctuation, Comment.Special, Punctuation)),  # ffi
            (r'(\")?([\w.]+)(\")?',
             bygroups(Punctuation, Name.Namespace, Punctuation)),  # podname
            (r'::', Punctuation, 'usingClass'),
            default('#pop')
        ],
        'usingClass': [
            (r'[ \t]+', Whitespace),  # consume whitespaces
            (r'(as)(\s+)(\w+)',
             bygroups(Keyword.Declaration, Whitespace, Name.Class), '#pop:2'),
            (r'[\w$]+', Name.Class),
            default('#pop:2')  # jump out to root state
        ],
        'facet': [
            (r'\s+', Whitespace),
            (r'\{', Punctuation, 'facetFields'),
            default('#pop')
        ],
        'facetFields': [
            include('comments'),
            include('literals'),
            include('operators'),
            (r'\s+', Whitespace),
            (r'(\s*)(\w+)(\s*)(=)', bygroups(Whitespace, Name, Whitespace, Operator)),
            (r'\}', Punctuation, '#pop'),
            (r'\s+', Whitespace),
            (r'.', Text)
        ],
    }
