"""
    pygments.lexers.rnc
    ~~~~~~~~~~~~~~~~~~~

    Lexer for Relax-NG Compact syntax

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Punctuation

__all__ = ['RNCCompactLexer']


class RNCCompactLexer(RegexLexer):
    """
    For RelaxNG-compact syntax.
    """

    name = 'Relax-NG Compact'
    url = 'http://relaxng.org'
    aliases = ['rng-compact', 'rnc']
    filenames = ['*.rnc']
    version_added = '2.2'

    tokens = {
        'root': [
            (r'namespace\b', Keyword.Namespace),
            (r'(?:default|datatypes)\b', Keyword.Declaration),
            (r'##.*$', Comment.Preproc),
            (r'#.*$', Comment.Single),
            (r'"[^"]*"', String.Double),
            # TODO single quoted strings and escape sequences outside of
            # double-quoted strings
            (r'(?:element|attribute|mixed)\b', Keyword.Declaration, 'variable'),
            (r'(text\b|xsd:[^ ]+)', Keyword.Type, 'maybe_xsdattributes'),
            (r'[,?&*=|~]|>>', Operator),
            (r'[(){}]', Punctuation),
            (r'.', Text),
        ],

        # a variable has been declared using `element` or `attribute`
        'variable': [
            (r'[^{]+', Name.Variable),
            (r'\{', Punctuation, '#pop'),
        ],

        # after an xsd:<datatype> declaration there may be attributes
        'maybe_xsdattributes': [
            (r'\{', Punctuation, 'xsdattributes'),
            (r'\}', Punctuation, '#pop'),
            (r'.', Text),
        ],

        # attributes take the form { key1 = value1 key2 = value2 ... }
        'xsdattributes': [
            (r'[^ =}]', Name.Attribute),
            (r'=', Operator),
            (r'"[^"]*"', String.Double),
            (r'\}', Punctuation, '#pop'),
            (r'.', Text),
        ],
    }
