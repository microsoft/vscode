"""
    pygments.lexers.tal
    ~~~~~~~~~~~~~~~~~~~

    Lexer for Uxntal

    .. versionadded:: 2.12

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import Comment, Keyword, Name, String, Number, \
    Punctuation, Whitespace, Literal

__all__ = ['TalLexer']


class TalLexer(RegexLexer):
    """
    For Uxntal source code.
    """

    name = 'Tal'
    aliases = ['tal', 'uxntal']
    filenames = ['*.tal']
    mimetypes = ['text/x-uxntal']
    url = 'https://wiki.xxiivv.com/site/uxntal.html'
    version_added = '2.12'

    instructions = [
        'BRK', 'LIT', 'INC', 'POP', 'DUP', 'NIP', 'SWP', 'OVR', 'ROT',
        'EQU', 'NEQ', 'GTH', 'LTH', 'JMP', 'JCN', 'JSR', 'STH',
        'LDZ', 'STZ', 'LDR', 'STR', 'LDA', 'STA', 'DEI', 'DEO',
        'ADD', 'SUB', 'MUL', 'DIV', 'AND', 'ORA', 'EOR', 'SFT'
    ]

    tokens = {
        # the comment delimiters must not be adjacent to non-space characters.
        # this means ( foo ) is a valid comment but (foo) is not. this also
        # applies to nested comments.
        'comment': [
            (r'(?<!\S)\((?!\S)', Comment.Multiline, '#push'), # nested comments
            (r'(?<!\S)\)(?!\S)', Comment.Multiline, '#pop'), # nested comments
            (r'[^()]+', Comment.Multiline), # comments
            (r'[()]+', Comment.Multiline), # comments
        ],
        'root': [
            (r'\s+', Whitespace), # spaces
            (r'(?<!\S)\((?!\S)', Comment.Multiline, 'comment'), # comments
            (words(instructions, prefix=r'(?<!\S)', suffix=r'2?k?r?(?!\S)'),
             Keyword.Reserved), # instructions
            (r'[][{}](?!\S)', Punctuation), # delimiters
            (r'#([0-9a-f]{2}){1,2}(?!\S)', Number.Hex), # integer
            (r'"\S+', String), # raw string
            (r'([0-9a-f]{2}){1,2}(?!\S)', Literal), # raw integer
            (r'[|$][0-9a-f]{1,4}(?!\S)', Keyword.Declaration), # abs/rel pad
            (r'%\S+', Name.Decorator), # macro
            (r'@\S+', Name.Function), # label
            (r'&\S+', Name.Label), # sublabel
            (r'/\S+', Name.Tag), # spacer
            (r'\.\S+', Name.Variable.Magic), # literal zero page addr
            (r',\S+', Name.Variable.Instance), # literal rel addr
            (r';\S+', Name.Variable.Global), # literal abs addr
            (r'-\S+', Literal), # raw zero page addr
            (r'_\S+', Literal), # raw relative addr
            (r'=\S+', Literal), # raw absolute addr
            (r'!\S+', Name.Function), # immediate jump
            (r'\?\S+', Name.Function), # conditional immediate jump
            (r'~\S+', Keyword.Namespace), # include
            (r'\S+', Name.Function), # macro invocation, immediate subroutine
        ]
    }

    def analyse_text(text):
        return '|0100' in text[:500]
