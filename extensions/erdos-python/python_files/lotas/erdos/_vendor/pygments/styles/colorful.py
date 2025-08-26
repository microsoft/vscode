"""
    pygments.styles.colorful
    ~~~~~~~~~~~~~~~~~~~~~~~~

    A colorful style, inspired by CodeRay.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['ColorfulStyle']


class ColorfulStyle(Style):
    """
    A colorful style, inspired by CodeRay.
    """
    name = 'colorful'

    styles = {
        Whitespace:                "#bbbbbb",

        Comment:                   "#888",
        Comment.Preproc:           "#579",
        Comment.Special:           "bold #cc0000",

        Keyword:                   "bold #080",
        Keyword.Pseudo:            "#038",
        Keyword.Type:              "#339",

        Operator:                  "#333",
        Operator.Word:             "bold #000",

        Name.Builtin:              "#007020",
        Name.Function:             "bold #06B",
        Name.Class:                "bold #B06",
        Name.Namespace:            "bold #0e84b5",
        Name.Exception:            "bold #F00",
        Name.Variable:             "#963",
        Name.Variable.Instance:    "#33B",
        Name.Variable.Class:       "#369",
        Name.Variable.Global:      "bold #d70",
        Name.Constant:             "bold #036",
        Name.Label:                "bold #970",
        Name.Entity:               "bold #800",
        Name.Attribute:            "#00C",
        Name.Tag:                  "#070",
        Name.Decorator:            "bold #555",

        String:                    "bg:#fff0f0",
        String.Char:               "#04D bg:",
        String.Doc:                "#D42 bg:",
        String.Interpol:           "bg:#eee",
        String.Escape:             "bold #666",
        String.Regex:              "bg:#fff0ff #000",
        String.Symbol:             "#A60 bg:",
        String.Other:              "#D20",

        Number:                    "bold #60E",
        Number.Integer:            "bold #00D",
        Number.Float:              "bold #60E",
        Number.Hex:                "bold #058",
        Number.Oct:                "bold #40E",

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

        Error:                     "#F00 bg:#FAA"
    }
