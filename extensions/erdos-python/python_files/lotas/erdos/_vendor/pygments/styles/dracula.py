"""
    pygments.styles.dracula
    ~~~~~~~~~~~~~~~~~~~~~~~

    Pygments version of `Dracula` from https://github.com/dracula/dracula-theme.

    Based on the Dracula Theme for pygments by Chris Bracco.
    See https://github.com/dracula/pygments/tree/fee9ed5613d1086bc01b9d0a5a0e9867a009f571

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, Literal, \
    Number, Operator, Other, Punctuation, Text, Generic, Whitespace


__all__ = ['DraculaStyle']

background = "#282a36"
foreground = "#f8f8f2"
selection = "#44475a"
comment = "#6272a4"
cyan = "#8be9fd"
green = "#50fa7b"
orange = "#ffb86c"
pink = "#ff79c6"
purple = "#bd93f9"
red = "#ff5555"
yellow = "#f1fa8c"

deletion = "#8b080b"

class DraculaStyle(Style):
    name = 'dracula'

    background_color = background
    highlight_color = selection
    line_number_color = yellow
    line_number_background_color = selection
    line_number_special_color = green
    line_number_special_background_color = comment

    styles = {
        Whitespace: foreground,

        Comment: comment,
        Comment.Preproc: pink,

        Generic: foreground,
        Generic.Deleted: deletion,
        Generic.Emph: "underline",
        Generic.Heading: "bold",
        Generic.Inserted: "bold",
        Generic.Output: selection,
        Generic.EmphStrong: "underline",
        Generic.Subheading: "bold",

        Error: foreground,

        Keyword: pink,
        Keyword.Constant: pink,
        Keyword.Declaration: cyan + " italic",
        Keyword.Type: cyan,

        Literal: foreground,

        Name: foreground,
        Name.Attribute: green,
        Name.Builtin: cyan + " italic",
        Name.Builtin.Pseudo: foreground,
        Name.Class: green,
        Name.Function: green,
        Name.Label: cyan + " italic",
        Name.Tag: pink,
        Name.Variable: cyan + " italic",

        Number: orange,

        Operator: pink,

        Other: foreground,

        Punctuation: foreground,

        String: purple,

        Text: foreground,
    }
