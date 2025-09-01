"""
    pygments.lexers.nit
    ~~~~~~~~~~~~~~~~~~~

    Lexer for the Nit language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['NitLexer']


class NitLexer(RegexLexer):
    """
    For nit source.
    """

    name = 'Nit'
    url = 'http://nitlanguage.org'
    aliases = ['nit']
    filenames = ['*.nit']
    version_added = '2.0'
    tokens = {
        'root': [
            (r'#.*?$', Comment.Single),
            (words((
                'package', 'module', 'import', 'class', 'abstract', 'interface',
                'universal', 'enum', 'end', 'fun', 'type', 'init', 'redef',
                'isa', 'do', 'readable', 'writable', 'var', 'intern', 'extern',
                'public', 'protected', 'private', 'intrude', 'if', 'then',
                'else', 'while', 'loop', 'for', 'in', 'and', 'or', 'not',
                'implies', 'return', 'continue', 'break', 'abort', 'assert',
                'new', 'is', 'once', 'super', 'self', 'true', 'false', 'nullable',
                'null', 'as', 'isset', 'label', '__debug__'), suffix=r'(?=[\r\n\t( ])'),
             Keyword),
            (r'[A-Z]\w*', Name.Class),
            (r'"""(([^\'\\]|\\.)|\\r|\\n)*((\{\{?)?(""?\{\{?)*""""*)', String),  # Simple long string
            (r'\'\'\'(((\\.|[^\'\\])|\\r|\\n)|\'((\\.|[^\'\\])|\\r|\\n)|'
             r'\'\'((\\.|[^\'\\])|\\r|\\n))*\'\'\'', String),  # Simple long string alt
            (r'"""(([^\'\\]|\\.)|\\r|\\n)*((""?)?(\{\{?""?)*\{\{\{\{*)', String),  # Start long string
            (r'\}\}\}(((\\.|[^\'\\])|\\r|\\n))*(""?)?(\{\{?""?)*\{\{\{\{*', String),  # Mid long string
            (r'\}\}\}(((\\.|[^\'\\])|\\r|\\n))*(\{\{?)?(""?\{\{?)*""""*', String),  # End long string
            (r'"(\\.|([^"}{\\]))*"', String),  # Simple String
            (r'"(\\.|([^"}{\\]))*\{', String),  # Start string
            (r'\}(\\.|([^"}{\\]))*\{', String),  # Mid String
            (r'\}(\\.|([^"}{\\]))*"', String),  # End String
            (r'(\'[^\'\\]\')|(\'\\.\')', String.Char),
            (r'[0-9]+', Number.Integer),
            (r'[0-9]*.[0-9]+', Number.Float),
            (r'0(x|X)[0-9A-Fa-f]+', Number.Hex),
            (r'[a-z]\w*', Name),
            (r'_\w+', Name.Variable.Instance),
            (r'==|!=|<==>|>=|>>|>|<=|<<|<|\+|-|=|/|\*|%|\+=|-=|!|@', Operator),
            (r'\(|\)|\[|\]|,|\.\.\.|\.\.|\.|::|:', Punctuation),
            (r'`\{[^`]*`\}', Text),  # Extern blocks won't be Lexed by Nit
            (r'[\r\n\t ]+', Text),
        ],
    }
