"""
    pygments.styles.inkpot
    ~~~~~~~~~~~~~~~~~~~~~~

    A highlighting style for Pygments, inspired by the Inkpot theme for VIM.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Text, Other, Keyword, Name, Comment, String, \
    Error, Number, Operator, Generic, Whitespace, Punctuation


__all__ = ['InkPotStyle']


class InkPotStyle(Style):
    name = 'inkpot'
    
    background_color = "#1e1e27"

    styles = {
        Text:                      "#cfbfad",
        Other:                     "#cfbfad",
        Whitespace:                "#434357",
        Comment:                   "#cd8b00",
        Comment.Preproc:           "#409090",
        Comment.PreprocFile:       "bg:#404040 #ffcd8b",
        Comment.Special:           "#808bed",

        Keyword:                   "#808bed",
        Keyword.Pseudo:            "nobold",
        Keyword.Type:              "#ff8bff",

        Operator:                  "#666666",

        Punctuation:               "#cfbfad",

        Name:                      "#cfbfad",
        Name.Attribute:            "#cfbfad",
        Name.Builtin.Pseudo:       '#ffff00',
        Name.Builtin:              "#808bed",
        Name.Class:                "#ff8bff",
        Name.Constant:             "#409090",
        Name.Decorator:            "#409090",
        Name.Exception:            "#ff0000",
        Name.Function:             "#c080d0",
        Name.Label:                "#808bed",
        Name.Namespace:            "#ff0000",
        Name.Variable:             "#cfbfad",

        String:                    "bg:#404040 #ffcd8b",
        String.Doc:                "#808bed",

        Number:                    "#f0ad6d",

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

        Error:                     "bg:#6e2e2e #ffffff"
    }
