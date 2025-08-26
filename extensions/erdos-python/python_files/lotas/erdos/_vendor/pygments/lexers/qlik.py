"""
    pygments.lexers.qlik
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the qlik scripting language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, words
from lotas.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text
from lotas.erdos._vendor.pygments.lexers._qlik_builtins import OPERATORS_LIST, STATEMENT_LIST, \
    SCRIPT_FUNCTIONS, CONSTANT_LIST

__all__ = ["QlikLexer"]


class QlikLexer(RegexLexer):
    """
    Lexer for qlik code, including .qvs files
    """

    name = "Qlik"
    aliases = ["qlik", "qlikview", "qliksense", "qlikscript"]
    filenames = ["*.qvs", "*.qvw"]
    url = "https://qlik.com"
    version_added = '2.12'

    flags = re.IGNORECASE

    tokens = {
        # Handle multi-line comments
        "comment": [
            (r"\*/", Comment.Multiline, "#pop"),
            (r"[^*]+", Comment.Multiline),
        ],
        # Handle numbers
        "numerics": [
            (r"\b\d+\.\d+(e\d+)?[fd]?\b", Number.Float),
            (r"\b\d+\b", Number.Integer),
        ],
        # Handle variable names in things
        "interp": [
            (
                r"(\$\()(\w+)(\))",
                bygroups(String.Interpol, Name.Variable, String.Interpol),
            ),
        ],
        # Handle strings
        "string": [
            (r"'", String, "#pop"),
            include("interp"),
            (r"[^'$]+", String),
            (r"\$", String),
        ],
        #
        "assignment": [
            (r";", Punctuation, "#pop"),
            include("root"),
        ],
        "field_name_quote": [
            (r'"', String.Symbol, "#pop"),
            include("interp"),
            (r"[^\"$]+", String.Symbol),
            (r"\$", String.Symbol),
        ],
        "field_name_bracket": [
            (r"\]", String.Symbol, "#pop"),
            include("interp"),
            (r"[^\]$]+", String.Symbol),
            (r"\$", String.Symbol),
        ],
        "function": [(r"\)", Punctuation, "#pop"), include("root")],
        "root": [
            # Whitespace and comments
            (r"\s+", Text.Whitespace),
            (r"/\*", Comment.Multiline, "comment"),
            (r"//.*\n", Comment.Single),
            # variable assignment
            (r"(let|set)(\s+)", bygroups(Keyword.Declaration, Text.Whitespace),
             "assignment"),
            # Word operators
            (words(OPERATORS_LIST["words"], prefix=r"\b", suffix=r"\b"),
             Operator.Word),
            # Statements
            (words(STATEMENT_LIST, suffix=r"\b"), Keyword),
            # Table names
            (r"[a-z]\w*:", Keyword.Declaration),
            # Constants
            (words(CONSTANT_LIST, suffix=r"\b"), Keyword.Constant),
            # Functions
            (words(SCRIPT_FUNCTIONS, suffix=r"(?=\s*\()"), Name.Builtin,
             "function"),
            # interpolation - e.g. $(variableName)
            include("interp"),
            # Quotes denote a field/file name
            (r'"', String.Symbol, "field_name_quote"),
            # Square brackets denote a field/file name
            (r"\[", String.Symbol, "field_name_bracket"),
            # Strings
            (r"'", String, "string"),
            # Numbers
            include("numerics"),
            # Operator symbols
            (words(OPERATORS_LIST["symbols"]), Operator),
            # Strings denoted by single quotes
            (r"'.+?'", String),
            # Words as text
            (r"\b\w+\b", Text),
            # Basic punctuation
            (r"[,;.()\\/]", Punctuation),
        ],
    }
