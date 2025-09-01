"""
    pygments.lexers.clean
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Clean language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import ExtendedRegexLexer, words, default, include, bygroups
from erdos._vendor.pygments.token import Comment, Error, Keyword, Literal, Name, Number, \
    Operator, Punctuation, String, Whitespace

__all__ = ['CleanLexer']


class CleanLexer(ExtendedRegexLexer):
    """
    Lexer for the general purpose, state-of-the-art, pure and lazy functional
    programming language Clean.

    .. versionadded: 2.2
    """
    name = 'Clean'
    url = 'http://clean.cs.ru.nl/Clean'
    aliases = ['clean']
    filenames = ['*.icl', '*.dcl']
    version_added = ''

    keywords = (
        'case', 'ccall', 'class', 'code', 'code inline', 'derive', 'export',
        'foreign', 'generic', 'if', 'in', 'infix', 'infixl', 'infixr',
        'instance', 'let', 'of', 'otherwise', 'special', 'stdcall', 'where',
        'with')

    modulewords = ('implementation', 'definition', 'system')

    lowerId = r'[a-z`][\w`]*'
    upperId = r'[A-Z`][\w`]*'
    funnyId = r'[~@#$%\^?!+\-*<>\\/|&=:]+'
    scoreUpperId = r'_' + upperId
    scoreLowerId = r'_' + lowerId
    moduleId = r'[a-zA-Z_][a-zA-Z0-9_.`]+'
    classId = '|'.join([lowerId, upperId, funnyId])

    tokens = {
        'root': [
            include('comments'),
            include('keywords'),
            include('module'),
            include('import'),
            include('whitespace'),
            include('literals'),
            include('operators'),
            include('delimiters'),
            include('names'),
        ],
        'whitespace': [
            (r'\s+', Whitespace),
        ],
        'comments': [
            (r'//.*\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'comments.in'),
            (r'/\*\*', Comment.Special, 'comments.in'),
        ],
        'comments.in': [
            (r'\*\/', Comment.Multiline, '#pop'),
            (r'/\*', Comment.Multiline, '#push'),
            (r'[^*/]+', Comment.Multiline),
            (r'\*(?!/)', Comment.Multiline),
            (r'/', Comment.Multiline),
        ],
        'keywords': [
            (words(keywords, prefix=r'\b', suffix=r'\b'), Keyword),
        ],
        'module': [
            (words(modulewords, prefix=r'\b', suffix=r'\b'), Keyword.Namespace),
            (r'\bmodule\b', Keyword.Namespace, 'module.name'),
        ],
        'module.name': [
            include('whitespace'),
            (moduleId, Name.Class, '#pop'),
        ],
        'import': [
            (r'\b(import)\b(\s*)', bygroups(Keyword, Whitespace), 'import.module'),
            (r'\b(from)\b(\s*)\b(' + moduleId + r')\b(\s*)\b(import)\b',
                bygroups(Keyword, Whitespace, Name.Class, Whitespace, Keyword),
                'import.what'),
        ],
        'import.module': [
            (r'\b(qualified)\b(\s*)', bygroups(Keyword, Whitespace)),
            (r'(\s*)\b(as)\b', bygroups(Whitespace, Keyword), ('#pop', 'import.module.as')),
            (moduleId, Name.Class),
            (r'(\s*)(,)(\s*)', bygroups(Whitespace, Punctuation, Whitespace)),
            (r'\s+', Whitespace),
            default('#pop'),
        ],
        'import.module.as': [
            include('whitespace'),
            (lowerId, Name.Class, '#pop'),
            (upperId, Name.Class, '#pop'),
        ],
        'import.what': [
            (r'\b(class)\b(\s+)(' + classId + r')',
                bygroups(Keyword, Whitespace, Name.Class), 'import.what.class'),
            (r'\b(instance)(\s+)(' + classId + r')(\s+)',
                bygroups(Keyword, Whitespace, Name.Class, Whitespace), 'import.what.instance'),
            (r'(::)(\s*)\b(' + upperId + r')\b',
                bygroups(Punctuation, Whitespace, Name.Class), 'import.what.type'),
            (r'\b(generic)\b(\s+)\b(' + lowerId + '|' + upperId + r')\b',
                bygroups(Keyword, Whitespace, Name)),
            include('names'),
            (r'(,)(\s+)', bygroups(Punctuation, Whitespace)),
            (r'$', Whitespace, '#pop'),
            include('whitespace'),
        ],
        'import.what.class': [
            (r',', Punctuation, '#pop'),
            (r'\(', Punctuation, 'import.what.class.members'),
            (r'$', Whitespace, '#pop:2'),
            include('whitespace'),
        ],
        'import.what.class.members': [
            (r',', Punctuation),
            (r'\.\.', Punctuation),
            (r'\)', Punctuation, '#pop'),
            include('names'),
        ],
        'import.what.instance': [
            (r'[,)]', Punctuation, '#pop'),
            (r'\(', Punctuation, 'import.what.instance'),
            (r'$', Whitespace, '#pop:2'),
            include('whitespace'),
            include('names'),
        ],
        'import.what.type': [
            (r',', Punctuation, '#pop'),
            (r'[({]', Punctuation, 'import.what.type.consesandfields'),
            (r'$', Whitespace, '#pop:2'),
            include('whitespace'),
        ],
        'import.what.type.consesandfields': [
            (r',', Punctuation),
            (r'\.\.', Punctuation),
            (r'[)}]', Punctuation, '#pop'),
            include('names'),
        ],
        'literals': [
            (r'\'([^\'\\]|\\(x[\da-fA-F]+|\d+|.))\'', Literal.Char),
            (r'[+~-]?0[0-7]+\b', Number.Oct),
            (r'[+~-]?\d+\.\d+(E[+-]?\d+)?', Number.Float),
            (r'[+~-]?\d+\b', Number.Integer),
            (r'[+~-]?0x[\da-fA-F]+\b', Number.Hex),
            (r'True|False', Literal),
            (r'"', String.Double, 'literals.stringd'),
        ],
        'literals.stringd': [
            (r'[^\\"\n]+', String.Double),
            (r'"', String.Double, '#pop'),
            (r'\\.', String.Double),
            (r'[$\n]', Error, '#pop'),
        ],
        'operators': [
            (r'[-~@#$%\^?!+*<>\\/|&=:.]+', Operator),
            (r'\b_+\b', Operator),
        ],
        'delimiters': [
            (r'[,;(){}\[\]]', Punctuation),
            (r'(\')([\w`.]+)(\')',
                bygroups(Punctuation, Name.Class, Punctuation)),
        ],
        'names': [
            (lowerId, Name),
            (scoreLowerId, Name),
            (funnyId, Name.Function),
            (upperId, Name.Class),
            (scoreUpperId, Name.Class),
        ]
    }
