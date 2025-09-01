"""
    pygments.lexers.devicetree
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Devicetree language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, default, words
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text, Whitespace

__all__ = ['DevicetreeLexer']


class DevicetreeLexer(RegexLexer):
    """
    Lexer for Devicetree files.
    """

    name = 'Devicetree'
    url = 'https://www.devicetree.org/'
    aliases = ['devicetree', 'dts']
    filenames = ['*.dts', '*.dtsi']
    mimetypes = ['text/x-c']
    version_added = '2.7'

    #: optional Whitespace or /*...*/ style comment
    _ws = r'\s*(?:/[*][^*/]*?[*]/\s*)*'

    tokens = {
        'macro': [
            # Include preprocessor directives (C style):
            (r'(#include)(' + _ws + r')([^\n]+)',
             bygroups(Comment.Preproc, Comment.Multiline, Comment.PreprocFile)),
            # Define preprocessor directives (C style):
            (r'(#define)(' + _ws + r')([^\n]+)',
             bygroups(Comment.Preproc, Comment.Multiline, Comment.Preproc)),
            # devicetree style with file:
            (r'(/[^*/{]+/)(' + _ws + r')("[^\n{]+")',
             bygroups(Comment.Preproc, Comment.Multiline, Comment.PreprocFile)),
            # devicetree style with property:
            (r'(/[^*/{]+/)(' + _ws + r')([^\n;{]*)([;]?)',
             bygroups(Comment.Preproc, Comment.Multiline, Comment.Preproc, Punctuation)),
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'\\\n', Text),  # line continuation
            (r'//(\n|[\w\W]*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?[*][\w\W]*?[*](\\\n)?/', Comment.Multiline),
            # Open until EOF, so no ending delimiter
            (r'/(\\\n)?[*][\w\W]*', Comment.Multiline),
        ],
        'statements': [
            (r'(L?)(")', bygroups(String.Affix, String), 'string'),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'\d+', Number.Integer),
            (r'([^\s{}/*]*)(\s*)(:)', bygroups(Name.Label, Text, Punctuation), '#pop'),
            (words(('compatible', 'model', 'phandle', 'status', '#address-cells',
                    '#size-cells', 'reg', 'virtual-reg', 'ranges', 'dma-ranges',
                    'device_type', 'name'), suffix=r'\b'), Keyword.Reserved),
            (r'([~!%^&*+=|?:<>/#-])', Operator),
            (r'[()\[\]{},.]', Punctuation),
            (r'[a-zA-Z_][\w-]*(?=(?:\s*,\s*[a-zA-Z_][\w-]*|(?:' + _ws + r'))*\s*[=;])',
             Name),
            (r'[a-zA-Z_]\w*', Name.Attribute),
        ],
        'root': [
            include('whitespace'),
            include('macro'),

            # Nodes
            (r'([^/*@\s&]+|/)(@?)((?:0x)?[0-9a-fA-F,]*)(' + _ws + r')(\{)',
             bygroups(Name.Function, Operator, Number.Integer,
                      Comment.Multiline, Punctuation), 'node'),

            default('statement'),
        ],
        'statement': [
            include('whitespace'),
            include('statements'),
            (';', Punctuation, '#pop'),
        ],
        'node': [
            include('whitespace'),
            include('macro'),

            (r'([^/*@\s&]+|/)(@?)((?:0x)?[0-9a-fA-F,]*)(' + _ws + r')(\{)',
             bygroups(Name.Function, Operator, Number.Integer,
                      Comment.Multiline, Punctuation), '#push'),

            include('statements'),

            (r'\};', Punctuation, '#pop'),
            (';', Punctuation),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|'
             r'u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),  # line continuation
            (r'\\', String),  # stray backslash
        ],
    }
