"""
    pygments.lexers.verification
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Intermediate Verification Languages (IVLs).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, Number, \
    Punctuation, Text, Generic

__all__ = ['BoogieLexer', 'SilverLexer']


class BoogieLexer(RegexLexer):
    """
    For Boogie source code.
    """
    name = 'Boogie'
    url = 'https://boogie-docs.readthedocs.io/en/latest/'
    aliases = ['boogie']
    filenames = ['*.bpl']
    version_added = '2.1'

    tokens = {
        'root': [
            # Whitespace and Comments
            (r'\n', Text),
            (r'\s+', Text),
            (r'\\\n', Text),  # line continuation
            (r'//[/!](.*?)\n', Comment.Doc),
            (r'//(.*?)\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),

            (words((
                'axiom', 'break', 'call', 'ensures', 'else', 'exists', 'function',
                'forall', 'if', 'invariant', 'modifies', 'procedure',  'requires',
                'then', 'var', 'while'),
             suffix=r'\b'), Keyword),
            (words(('const',), suffix=r'\b'), Keyword.Reserved),

            (words(('bool', 'int', 'ref'), suffix=r'\b'), Keyword.Type),
            include('numbers'),
            (r"(>=|<=|:=|!=|==>|&&|\|\||[+/\-=>*<\[\]])", Operator),
            (r'\{.*?\}', Generic.Emph), #triggers
            (r"([{}():;,.])", Punctuation),
            # Identifier
            (r'[a-zA-Z_]\w*', Name),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'numbers': [
            (r'[0-9]+', Number.Integer),
        ],
    }


class SilverLexer(RegexLexer):
    """
    For Silver source code.
    """
    name = 'Silver'
    aliases = ['silver']
    filenames = ['*.sil', '*.vpr']
    url = 'https://github.com/viperproject/silver'
    version_added = '2.2'

    tokens = {
        'root': [
            # Whitespace and Comments
            (r'\n', Text),
            (r'\s+', Text),
            (r'\\\n', Text),  # line continuation
            (r'//[/!](.*?)\n', Comment.Doc),
            (r'//(.*?)\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),

            (words((
                'result', 'true', 'false', 'null', 'method', 'function',
                'predicate', 'program', 'domain', 'axiom', 'var', 'returns',
                'field', 'define', 'fold', 'unfold', 'inhale', 'exhale', 'new', 'assert',
                'assume', 'goto', 'while', 'if', 'elseif', 'else', 'fresh',
                'constraining', 'Seq', 'Set', 'Multiset', 'union', 'intersection',
                'setminus', 'subset', 'unfolding', 'in', 'old', 'forall', 'exists',
                'acc', 'wildcard', 'write', 'none', 'epsilon', 'perm', 'unique',
                'apply', 'package', 'folding', 'label', 'forperm'),
             suffix=r'\b'), Keyword),
            (words(('requires', 'ensures', 'invariant'), suffix=r'\b'), Name.Decorator),
            (words(('Int', 'Perm', 'Bool', 'Ref', 'Rational'), suffix=r'\b'), Keyword.Type),
            include('numbers'),
            (r'[!%&*+=|?:<>/\-\[\]]', Operator),
            (r'\{.*?\}', Generic.Emph), #triggers
            (r'([{}():;,.])', Punctuation),
            # Identifier
            (r'[\w$]\w*', Name),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'numbers': [
            (r'[0-9]+', Number.Integer),
        ],
    }
