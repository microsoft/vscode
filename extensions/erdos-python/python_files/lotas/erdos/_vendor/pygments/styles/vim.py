"""
    pygments.styles.vim
    ~~~~~~~~~~~~~~~~~~~

    A highlighting style for Pygments, inspired by vim.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace, Token


__all__ = ['VimStyle']


class VimStyle(Style):
    """
    Styles somewhat like vim 7.0
    """

    name = 'vim'
    
    background_color = "#000000"
    highlight_color = "#222222"

    styles = {
        Token:                     "#cccccc",
        Whitespace:                "",
        Comment:                   "#000080",
        Comment.Preproc:           "",
        Comment.Special:           "bold #cd0000",

        Keyword:                   "#cdcd00",
        Keyword.Declaration:       "#00cd00",
        Keyword.Namespace:         "#cd00cd",
        Keyword.Pseudo:            "",
        Keyword.Type:              "#00cd00",

        Operator:                  "#3399cc",
        Operator.Word:             "#cdcd00",

        Name:                      "",
        Name.Class:                "#00cdcd",
        Name.Builtin:              "#cd00cd",
        Name.Exception:            "bold #666699",
        Name.Variable:             "#00cdcd",

        String:                    "#cd0000",
        Number:                    "#cd00cd",

        Generic.Heading:           "bold #000080",
        Generic.Subheading:        "bold #800080",
        Generic.Deleted:           "#cd0000",
        Generic.Inserted:          "#00cd00",
        Generic.Error:             "#FF0000",
        Generic.Emph:              "italic",
        Generic.Strong:            "bold",
        Generic.EmphStrong:        "bold italic",
        Generic.Prompt:            "bold #000080",
        Generic.Output:            "#888",
        Generic.Traceback:         "#04D",

        Error:                     "border:#FF0000"
    }
