"""
    pygments.styles.friendly_grayscale
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    A style based on friendly style.
    The color values of the friendly style have been converted to grayscale
    using the luminosity value calculated by
    http://www.workwithcolor.com/color-converter-01.htm

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['FriendlyGrayscaleStyle']


class FriendlyGrayscaleStyle(Style):
    """
    A modern grayscale style based on the friendly style.

    .. versionadded:: 2.11
    """
    name = 'friendly_grayscale'

    background_color = "#f0f0f0"

    styles = {
        Whitespace:                "#bbbbbb",
        Comment:                   "italic #959595",
        Comment.Preproc:           "noitalic #575757",
        Comment.Special:           "noitalic bg:#F4F4F4",

        Keyword:                   "bold #575757",
        Keyword.Pseudo:            "nobold",
        Keyword.Type:              "nobold #4F4F4F",

        Operator:                  "#666666",
        Operator.Word:             "bold #575757",

        Name.Builtin:              "#575757",
        Name.Function:             "#3F3F3F",
        Name.Class:                "bold #7E7E7E",
        Name.Namespace:            "bold #7E7E7E",
        Name.Exception:            "#575757",
        Name.Variable:             "#9A9A9A",
        Name.Constant:             "#A5A5A5",
        Name.Label:                "bold #363636",
        Name.Entity:               "bold #848484",
        Name.Attribute:            "#707070",
        Name.Tag:                  "bold #3B3B3B",
        Name.Decorator:            "bold #555555",

        String:                    "#717171",
        String.Doc:                "italic",
        String.Interpol:           "italic #9F9F9F",
        String.Escape:             "bold #717171",
        String.Regex:              "#575757",
        String.Symbol:             "#676767",
        String.Other:              "#7E7E7E",
        Number:                    "#888888",

        Generic.Heading:           "bold #373737",
        Generic.Subheading:        "bold #5A5A5A",
        Generic.Deleted:           "#545454",
        Generic.Inserted:          "#7D7D7D",
        Generic.Error:             "#898989",
        Generic.Emph:              "italic",
        Generic.Strong:            "bold",
        Generic.EmphStrong:        "bold italic",
        Generic.Prompt:            "bold #7E7E7E",
        Generic.Output:            "#888888",
        Generic.Traceback:         "#6D6D6D",

        Error:                     "border:#898989"
    }
