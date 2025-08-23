"""
    pygments.styles.algol
    ~~~~~~~~~~~~~~~~~~~~~

    Algol publication style.

    This style renders source code for publication of algorithms in
    scientific papers and academic texts, where its format is frequently used.

    It is based on the style of the revised Algol-60 language report[1].

    o  No colours, only black, white and shades of grey are used.
    o  Keywords are rendered in lowercase underline boldface.
    o  Builtins are rendered in lowercase boldface italic.
    o  Docstrings and pragmas are rendered in dark grey boldface.
    o  Library identifiers are rendered in dark grey boldface italic.
    o  Comments are rendered in grey italic.

    To render keywords without underlining, refer to the `Algol_Nu` style.

    For lowercase conversion of keywords and builtins in languages where
    these are not or might not be lowercase, a supporting lexer is required.
    The Algol and Modula-2 lexers automatically convert to lowercase whenever
    this style is selected.

    [1] `Revised Report on the Algorithmic Language Algol-60 <http://www.masswerk.at/algol60/report.htm>`

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, Operator


__all__ = ['AlgolStyle']


class AlgolStyle(Style):
    name = 'algol'

    background_color = "#ffffff"

    styles = {
        Comment:                   "italic #888",
        Comment.Preproc:           "bold noitalic #888",
        Comment.Special:           "bold noitalic #888",

        Keyword:                   "underline bold",
        Keyword.Declaration:       "italic",

        Name.Builtin:              "bold italic",
        Name.Builtin.Pseudo:       "bold italic",
        Name.Namespace:            "bold italic #666",
        Name.Class:                "bold italic #666",
        Name.Function:             "bold italic #666",
        Name.Variable:             "bold italic #666",
        Name.Constant:             "bold italic #666",

        Operator.Word:             "bold",

        String:                    "italic #666",

        Error:                     "border:#FF0000"
    }
