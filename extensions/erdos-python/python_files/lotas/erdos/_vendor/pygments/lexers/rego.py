"""
    pygments.lexers.rego
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the Rego policy languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, Punctuation, Whitespace

class RegoLexer(RegexLexer):
    """
    For Rego source.
    """
    name = 'Rego'
    url = 'https://www.openpolicyagent.org/docs/latest/policy-language/'
    filenames = ['*.rego']
    aliases = ['rego']
    mimetypes = ['text/x-rego']
    version_added = '2.19'

    reserved_words = (
        'as', 'contains', 'data', 'default', 'else', 'every', 'false',
        'if', 'in', 'import', 'package', 'not', 'null',
        'some', 'true', 'with'
    )

    builtins = (
        # https://www.openpolicyagent.org/docs/latest/philosophy/#the-opa-document-model
        'data',  # Global variable for accessing base and virtual documents
        'input', # Represents synchronously pushed base documents
    )

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'#.*?$', Comment.Single),
            (words(reserved_words, suffix=r'\b'), Keyword),
            (words(builtins, suffix=r'\b'), Name.Builtin),
            (r'[a-zA-Z_][a-zA-Z0-9_]*', Name),
            (r'"(\\\\|\\"|[^"])*"', String.Double),
            (r'`[^`]*`', String.Backtick),
            (r'-?\d+(\.\d+)?', Number),
            (r'(==|!=|<=|>=|:=)', Operator),  # Compound operators
            (r'[=<>+\-*/%&|]', Operator),     # Single-character operators
            (r'[\[\]{}(),.:;]', Punctuation),
        ]
    }

__all__ = ['RegoLexer']



