"""
    pygments.lexers.savi
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for Savi.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, include
from lotas.erdos._vendor.pygments.token import Whitespace, Keyword, Name, String, Number, \
  Operator, Punctuation, Comment, Generic, Error

__all__ = ['SaviLexer']


# The canonical version of this file can be found in the following repository,
# where it is kept in sync with any language changes, as well as the other
# pygments-like lexers that are maintained for use with other tools:
# - https://github.com/savi-lang/savi/blob/main/tooling/pygments/lexers/savi.py
#
# If you're changing this file in the pygments repository, please ensure that
# any changes you make are also propagated to the official Savi repository,
# in order to avoid accidental clobbering of your changes later when an update
# from the Savi repository flows forward into the pygments repository.
#
# If you're changing this file in the Savi repository, please ensure that
# any changes you make are also reflected in the other pygments-like lexers
# (rouge, vscode, etc) so that all of the lexers can be kept cleanly in sync.

class SaviLexer(RegexLexer):
    """
    For Savi source code.

    .. versionadded: 2.10
    """

    name = 'Savi'
    url = 'https://github.com/savi-lang/savi'
    aliases = ['savi']
    filenames = ['*.savi']
    version_added = ''

    tokens = {
      "root": [
        # Line Comment
        (r'//.*?$', Comment.Single),

        # Doc Comment
        (r'::.*?$', Comment.Single),

        # Capability Operator
        (r'(\')(\w+)(?=[^\'])', bygroups(Operator, Name)),

        # Double-Quote String
        (r'\w?"', String.Double, "string.double"),

        # Single-Char String
        (r"'", String.Char, "string.char"),

        # Type Name
        (r'(_?[A-Z]\w*)', Name.Class),

        # Nested Type Name
        (r'(\.)(\s*)(_?[A-Z]\w*)', bygroups(Punctuation, Whitespace, Name.Class)),

        # Declare
        (r'^([ \t]*)(:\w+)',
          bygroups(Whitespace, Name.Tag),
          "decl"),

        # Error-Raising Calls/Names
        (r'((\w+|\+|\-|\*)\!)', Generic.Deleted),

        # Numeric Values
        (r'\b\d([\d_]*(\.[\d_]+)?)\b', Number),

        # Hex Numeric Values
        (r'\b0x([0-9a-fA-F_]+)\b', Number.Hex),

        # Binary Numeric Values
        (r'\b0b([01_]+)\b', Number.Bin),

        # Function Call (with braces)
        (r'\w+(?=\()', Name.Function),

        # Function Call (with receiver)
        (r'(\.)(\s*)(\w+)', bygroups(Punctuation, Whitespace, Name.Function)),

        # Function Call (with self receiver)
        (r'(@)(\w+)', bygroups(Punctuation, Name.Function)),

        # Parenthesis
        (r'\(', Punctuation, "root"),
        (r'\)', Punctuation, "#pop"),

        # Brace
        (r'\{', Punctuation, "root"),
        (r'\}', Punctuation, "#pop"),

        # Bracket
        (r'\[', Punctuation, "root"),
        (r'(\])(\!)', bygroups(Punctuation, Generic.Deleted), "#pop"),
        (r'\]', Punctuation, "#pop"),

        # Punctuation
        (r'[,;:\.@]', Punctuation),

        # Piping Operators
        (r'(\|\>)', Operator),

        # Branching Operators
        (r'(\&\&|\|\||\?\?|\&\?|\|\?|\.\?)', Operator),

        # Comparison Operators
        (r'(\<\=\>|\=\~|\=\=|\<\=|\>\=|\<|\>)', Operator),

        # Arithmetic Operators
        (r'(\+|\-|\/|\*|\%)', Operator),

        # Assignment Operators
        (r'(\=)', Operator),

        # Other Operators
        (r'(\!|\<\<|\<|\&|\|)', Operator),

        # Identifiers
        (r'\b\w+\b', Name),

        # Whitespace
        (r'[ \t\r]+\n*|\n+', Whitespace),
      ],

      # Declare (nested rules)
      "decl": [
        (r'\b[a-z_]\w*\b(?!\!)', Keyword.Declaration),
        (r':', Punctuation, "#pop"),
        (r'\n', Whitespace, "#pop"),
        include("root"),
      ],

      # Double-Quote String (nested rules)
      "string.double": [
        (r'\\\(', String.Interpol, "string.interpolation"),
        (r'\\u[0-9a-fA-F]{4}', String.Escape),
        (r'\\x[0-9a-fA-F]{2}', String.Escape),
        (r'\\[bfnrt\\\']', String.Escape),
        (r'\\"', String.Escape),
        (r'"', String.Double, "#pop"),
        (r'[^\\"]+', String.Double),
        (r'.', Error),
      ],

      # Single-Char String (nested rules)
      "string.char": [
        (r'\\u[0-9a-fA-F]{4}', String.Escape),
        (r'\\x[0-9a-fA-F]{2}', String.Escape),
        (r'\\[bfnrt\\\']', String.Escape),
        (r"\\'", String.Escape),
        (r"'", String.Char, "#pop"),
        (r"[^\\']+", String.Char),
        (r'.', Error),
      ],

      # Interpolation inside String (nested rules)
      "string.interpolation": [
        (r"\)", String.Interpol, "#pop"),
        include("root"),
      ]
    }
