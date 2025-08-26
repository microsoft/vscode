"""
    pygments.lexers.supercollider
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for SuperCollider

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words, default
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['SuperColliderLexer']


class SuperColliderLexer(RegexLexer):
    """
    For SuperCollider source code.
    """

    name = 'SuperCollider'
    url = 'http://supercollider.github.io/'
    aliases = ['supercollider', 'sc']
    filenames = ['*.sc', '*.scd']
    mimetypes = ['application/supercollider', 'text/supercollider']
    version_added = '2.1'

    flags = re.DOTALL | re.MULTILINE
    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Text),
            (r'<!--', Comment),
            (r'//.*?\n', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline)
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gim]+\b|\B)', String.Regex, '#pop'),
            (r'(?=/)', Text, ('#pop', 'badregex')),
            default('#pop'),
        ],
        'badregex': [
            (r'\n', Text, '#pop')
        ],
        'root': [
            (r'^(?=\s|/|<!--)', Text, 'slashstartsregex'),
            include('commentsandwhitespace'),
            (r'\+\+|--|~|&&|\?|:|\|\||\\(?=\n)|'
             r'(<<|>>>?|==?|!=?|[-<>+*%&|^/])=?', Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),
            (words((
                'for', 'in', 'while', 'do', 'break', 'return', 'continue',
                'switch', 'case', 'default', 'if', 'else', 'throw', 'try',
                'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof',
                'void'), suffix=r'\b'),
             Keyword, 'slashstartsregex'),
            (words(('var', 'let', 'with', 'function', 'arg'), suffix=r'\b'),
             Keyword.Declaration, 'slashstartsregex'),
            (words((
                '(abstract', 'boolean', 'byte', 'char', 'class', 'const',
                'debugger', 'double', 'enum', 'export', 'extends', 'final',
                'float', 'goto', 'implements', 'import', 'int', 'interface',
                'long', 'native', 'package', 'private', 'protected', 'public',
                'short', 'static', 'super', 'synchronized', 'throws',
                'transient', 'volatile'), suffix=r'\b'),
             Keyword.Reserved),
            (words(('true', 'false', 'nil', 'inf'), suffix=r'\b'), Keyword.Constant),
            (words((
                'Array', 'Boolean', 'Date', 'Error', 'Function', 'Number',
                'Object', 'Packages', 'RegExp', 'String',
                'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'super',
                'thisFunctionDef', 'thisFunction', 'thisMethod', 'thisProcess',
                'thisThread', 'this'), suffix=r'\b'),
             Name.Builtin),
            (r'[$a-zA-Z_]\w*', Name.Other),
            (r'\\?[$a-zA-Z_]\w*', String.Symbol),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
        ]
    }

    def analyse_text(text):
        """We're searching for a common function and a unique keyword here."""
        if 'SinOsc' in text or 'thisFunctionDef' in text:
            return 0.1
