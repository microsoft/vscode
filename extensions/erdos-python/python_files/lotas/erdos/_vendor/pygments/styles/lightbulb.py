"""
    pygments.styles.lightbulb
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    A minimal dark theme based on the Lightbulb theme for VSCode.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import (
    Comment,
    Error,
    Generic,
    Keyword,
    Literal,
    Name,
    Number,
    Operator,
    Punctuation,
    String,
    Token,
)


__all__ = ['LightbulbStyle']


COLORS = {
    "bg": "#1d2331",
    "blue_1": "#73D0FF",
    "gray_1": "#7e8aa1",
    "gray_2": "#3c4354",
    "gray_3": "#6e7681",
    "red_1": "#f88f7f",
    "red_2": "#3d1e20",
    "orange_1": "#FFAD66",
    "orange_2": "#F29E74",
    "yellow_1": "#FFD173",
    "white": "#d4d2c8",
    "magenta_1": "#DFBFFF",
    "green_1": "#D5FF80",
    "green_2": "#19362c",
    "cyan_1": "#95E6CB",
}


class LightbulbStyle(Style):
    """
    A minimal dark theme based on the Lightbulb theme for VSCode.
    """

    name = 'lightbulb'

    background_color = COLORS['bg']
    highlight_color = COLORS['gray_3']

    line_number_color = COLORS['gray_2']
    line_number_special_color = COLORS['gray_2']

    styles = {
        Comment: COLORS["gray_1"],
        Comment.Hashbang: "italic " + COLORS['red_1'],
        Comment.Preproc: "bold " + COLORS['orange_1'],
        Comment.Special: "italic " + COLORS['gray_1'],
        Error: COLORS['red_1'],
        Generic.Deleted: f"bg:{COLORS['red_2']} #f88f7f",
        Generic.Emph: "italic",
        Generic.Error: "#f88f7f",
        Generic.Inserted: f"bg:{COLORS['green_2']} #6ad4af",
        Generic.Output: COLORS['gray_1'],
        Generic.Strong: "bold",
        Generic.Traceback: COLORS['red_1'],
        Keyword: COLORS['orange_1'],
        Keyword.Constant: COLORS['orange_1'],
        Keyword.Declaration: COLORS['orange_1'],
        Keyword.Namespace: COLORS['orange_1'],
        Keyword.Reserved: COLORS['orange_1'],
        Keyword.Type: COLORS['blue_1'],
        Literal: COLORS['green_1'],
        Name: COLORS['white'],
        Name.Attribute: COLORS['yellow_1'],
        Name.Builtin: COLORS['yellow_1'],
        Name.Builtin.Pseudo: "#5CCFE6",
        Name.Class: COLORS['blue_1'],
        Name.Constant: COLORS['yellow_1'],
        Name.Decorator: "bold italic " + COLORS['gray_1'],
        Name.Entity: COLORS['cyan_1'],
        Name.Exception: COLORS['blue_1'],
        Name.Function: COLORS['yellow_1'],
        Name.Function.Magic: COLORS['yellow_1'],
        Name.Other: COLORS['white'],
        Name.Property: COLORS['yellow_1'],
        Name.Tag: "#5CCFE6",
        Name.Variable: COLORS['white'],
        Number: COLORS['magenta_1'],
        Operator: COLORS['orange_1'],
        Operator.Word: COLORS['orange_1'],
        Punctuation: COLORS['white'],
        String: COLORS['green_1'],
        String.Affix: COLORS['orange_2'],
        String.Doc: COLORS['gray_1'],
        String.Escape: COLORS['cyan_1'],
        String.Interpol: COLORS['cyan_1'],
        String.Other: COLORS['cyan_1'],
        String.Regex: COLORS['cyan_1'],
        String.Symbol: COLORS['magenta_1'],
        Token: COLORS['white'],
    }
