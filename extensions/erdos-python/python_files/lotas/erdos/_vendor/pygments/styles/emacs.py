"""
    pygments.styles.emacs
    ~~~~~~~~~~~~~~~~~~~~~

    A highlighting style for Pygments, inspired by Emacs.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['EmacsStyle']


class EmacsStyle(Style):
    """
    The default style (inspired by Emacs 22).
    """
    name = 'emacs'

    background_color = "#f8f8f8"

    styles = {
        Whitespace:                "#bbbbbb",
        Comment:                   "italic #008800",
        Comment.Preproc:           "noitalic",
        Comment.Special:           "noitalic bold",

        Keyword:                   "bold #AA22FF",
        Keyword.Pseudo:            "nobold",
        Keyword.Type:              "bold #00BB00",

        Operator:                  "#666666",
        Operator.Word:             "bold #AA22FF",

        Name.Builtin:              "#AA22FF",
        Name.Function:             "#00A000",
        Name.Class:                "#0000FF",
        Name.Namespace:            "bold #0000FF",
        Name.Exception:            "bold #D2413A",
        Name.Variable:             "#B8860B",
        Name.Constant:             "#880000",
        Name.Label:                "#A0A000",
        Name.Entity:               "bold #999999",
        Name.Attribute:            "#BB4444",
        Name.Tag:                  "bold #008000",
        Name.Decorator:            "#AA22FF",

        String:                    "#BB4444",
        String.Doc:                "italic",
        String.Interpol:           "bold #BB6688",
        String.Escape:             "bold #BB6622",
        String.Regex:              "#BB6688",
        String.Symbol:             "#B8860B",
        String.Other:              "#008000",
        Number:                    "#666666",

        Generic.Heading:           "bold #000080",
        Generic.Subheading:        "bold #800080",
        Generic.Deleted:           "#A00000",
        Generic.Inserted:          "#00A000",
        Generic.Error:             "#FF0000",
        Generic.Emph:              "italic",
        Generic.Strong:            "bold",
        Generic.EmphStrong:        "bold italic",
        Generic.Prompt:            "bold #000080",
        Generic.Output:            "#888",
        Generic.Traceback:         "#04D",

        Error:                     "border:#FF0000"
    }
