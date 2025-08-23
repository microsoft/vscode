"""
    pygments.styles.friendly
    ~~~~~~~~~~~~~~~~~~~~~~~~

    A modern style based on the VIM pyte theme.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['FriendlyStyle']


class FriendlyStyle(Style):
    """
    A modern style based on the VIM pyte theme.
    """
    name = 'friendly'

    background_color = "#f0f0f0"
    line_number_color = "#666666"

    styles = {
        Whitespace:                "#bbbbbb",
        Comment:                   "italic #60a0b0",
        Comment.Preproc:           "noitalic #007020",
        Comment.Special:           "noitalic bg:#fff0f0",

        Keyword:                   "bold #007020",
        Keyword.Pseudo:            "nobold",
        Keyword.Type:              "nobold #902000",

        Operator:                  "#666666",
        Operator.Word:             "bold #007020",

        Name.Builtin:              "#007020",
        Name.Function:             "#06287e",
        Name.Class:                "bold #0e84b5",
        Name.Namespace:            "bold #0e84b5",
        Name.Exception:            "#007020",
        Name.Variable:             "#bb60d5",
        Name.Constant:             "#60add5",
        Name.Label:                "bold #002070",
        Name.Entity:               "bold #d55537",
        Name.Attribute:            "#4070a0",
        Name.Tag:                  "bold #062873",
        Name.Decorator:            "bold #555555",

        String:                    "#4070a0",
        String.Doc:                "italic",
        String.Interpol:           "italic #70a0d0",
        String.Escape:             "bold #4070a0",
        String.Regex:              "#235388",
        String.Symbol:             "#517918",
        String.Other:              "#c65d09",
        Number:                    "#40a070",

        Generic.Heading:           "bold #000080",
        Generic.Subheading:        "bold #800080",
        Generic.Deleted:           "#A00000",
        Generic.Inserted:          "#00A000",
        Generic.Error:             "#FF0000",
        Generic.Emph:              "italic",
        Generic.Strong:            "bold",
        Generic.EmphStrong:        "bold italic",
        Generic.Prompt:            "bold #c65d09",
        Generic.Output:            "#888",
        Generic.Traceback:         "#04D",

        Error:                     "border:#FF0000"
    }
