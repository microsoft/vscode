"""
    pygments.styles.vs
    ~~~~~~~~~~~~~~~~~~

    Simple style with MS Visual Studio colors.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Operator, Generic


__all__ = ['VisualStudioStyle']


class VisualStudioStyle(Style):
    name = 'vs'
    
    background_color = "#ffffff"

    styles = {
        Comment:                   "#008000",
        Comment.Preproc:           "#0000ff",
        Keyword:                   "#0000ff",
        Operator.Word:             "#0000ff",
        Keyword.Type:              "#2b91af",
        Name.Class:                "#2b91af",
        String:                    "#a31515",

        Generic.Heading:           "bold",
        Generic.Subheading:        "bold",
        Generic.Emph:              "italic",
        Generic.Strong:            "bold",
        Generic.EmphStrong:        "bold italic",
        Generic.Prompt:            "bold",

        Error:                     "border:#FF0000"
    }
