"""
    pygments.styles.coffee
    ~~~~~~~~~~~~~~~~~~~~~~

    A warm and cozy theme based off gruvbox

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import (Comment, Error, Generic, Keyword, Literal, Name,
                            Number, Operator, Punctuation, String, Token)

__all__ = ["CoffeeStyle"]


class CoffeeStyle(Style):
    """
    A warm and cozy theme based off gruvbox
    """

    name = "coffee"

    background_color = "#262220"
    highlight_color = "#ddd0c0"

    line_number_color = "#4e4e4e"
    line_number_special_color = "#8f9494"

    styles = {
        Comment: "#70757A",
        Comment.Hashbang: "#8f9f9f",
        Comment.Preproc: "#fdd0c0",
        Comment.PreprocFile: "#c9b98f",
        Comment.Special: "#af5f5f",
        Error: "#af5f5f",
        Generic.Deleted: "#bb6868",
        Generic.Emph: "italic",
        Generic.Error: "#af5f5f",
        Generic.Inserted: "#849155",
        Generic.Output: "#ddd0c0",
        Generic.Strong: "bold",
        Generic.Traceback: "#af5f5f",
        Keyword: "#919191",
        Keyword.Constant: "#875f5f",
        Keyword.Declaration: "#875f5f",
        Keyword.Namespace: "#875f5f",
        Keyword.Reserved: "#b46276",
        Keyword.Type: "#af875f",
        Literal: "#af875f",
        Name: "#ddd0c0",
        Name.Attribute: "#ddd0c0",
        Name.Builtin: "#ddd0c0",
        Name.Builtin.Pseudo: "#87afaf",
        Name.Class: "#875f5f",
        Name.Constant: "#af8787",
        Name.Decorator: "#fdd0c0",
        Name.Entity: "#ddd0c0",
        Name.Exception: "#877575",
        Name.Function: "#fdd0c0",
        Name.Function.Magic: "#fdd0c0",
        Name.Other: "#ddd0c0",
        Name.Property: "#dfaf87",
        Name.Tag: "#87afaf",
        Name.Variable: "#ddd0c0",
        Number: "#87afaf",
        Operator: "#878787",
        Operator.Word: "#878787",
        Punctuation: "#ddd0c0",
        String: "#c9b98f",
        String.Affix: "#dfaf87",
        String.Doc: "#878787",
        String.Escape: "#af5f5f",
        String.Interpol: "#af5f5f",
        String.Other: "#fdd0c0",
        String.Regex: "#af5f5f",
        String.Symbol: "#af5f5f",
        Token: "#ddd0c0",
    }
