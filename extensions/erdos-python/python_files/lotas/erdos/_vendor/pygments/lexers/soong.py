"""
    pygments.lexers.soong
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for Soong (Android.bp Blueprint) files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include
from erdos._vendor.pygments.token import Comment, Name, Number, Operator, Punctuation, \
        String, Whitespace

__all__ = ['SoongLexer']

class SoongLexer(RegexLexer):
    name = 'Soong'
    version_added = '2.18'
    url = 'https://source.android.com/docs/setup/reference/androidbp'
    aliases = ['androidbp', 'bp', 'soong']
    filenames = ['Android.bp']

    tokens = {
        'root': [
            # A variable assignment
            (r'(\w*)(\s*)(\+?=)(\s*)',
             bygroups(Name.Variable, Whitespace, Operator, Whitespace),
             'assign-rhs'),

            # A top-level module
            (r'(\w*)(\s*)(\{)',
             bygroups(Name.Function, Whitespace, Punctuation),
             'in-rule'),

            # Everything else
            include('comments'),
            (r'\s+', Whitespace),  # newlines okay
        ],
        'assign-rhs': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'in-list': [
            include('expr'),
            include('comments'),
            (r'\s+', Whitespace),  # newlines okay in a list
            (r',', Punctuation),
            (r'\]', Punctuation, '#pop'),
        ],
        'in-map': [
            # A map key
            (r'(\w+)(:)(\s*)', bygroups(Name, Punctuation, Whitespace)),

            include('expr'),
            include('comments'),
            (r'\s+', Whitespace),  # newlines okay in a map
            (r',', Punctuation),
            (r'\}', Punctuation, '#pop'),
        ],
        'in-rule': [
            # Just re-use map syntax
            include('in-map'),
        ],
        'comments': [
            (r'//.*', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
        ],
        'expr': [
            (r'(true|false)\b', Name.Builtin),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            (r'".*?"', String),
            (r'\{', Punctuation, 'in-map'),
            (r'\[', Punctuation, 'in-list'),
            (r'\w+', Name),
        ],
    }
