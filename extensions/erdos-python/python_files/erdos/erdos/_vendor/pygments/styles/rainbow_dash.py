"""
    pygments.styles.rainbow_dash
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    A bright and colorful syntax highlighting `theme`.

    .. _theme: http://sanssecours.github.io/Rainbow-Dash.tmbundle

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Comment, Error, Generic, Name, Number, Operator, \
    String, Text, Whitespace, Keyword


__all__ = ['RainbowDashStyle']


BLUE_LIGHT = '#0080ff'
BLUE = '#2c5dcd'
GREEN = '#00cc66'
GREEN_LIGHT = '#ccffcc'
GREEN_NEON = '#00cc00'
GREY = '#aaaaaa'
GREY_LIGHT = '#cbcbcb'
GREY_DARK = '#4d4d4d'
PURPLE = '#5918bb'
RED = '#cc0000'
RED_DARK = '#c5060b'
RED_LIGHT = '#ffcccc'
RED_BRIGHT = '#ff0000'
WHITE = '#ffffff'
TURQUOISE = '#318495'
ORANGE = '#ff8000'


class RainbowDashStyle(Style):
    """
    A bright and colorful syntax highlighting theme.
    """

    name = 'rainbow_dash'
    
    background_color = WHITE

    styles = {
        Comment: f'italic {BLUE_LIGHT}',
        Comment.Preproc: 'noitalic',
        Comment.Special: 'bold',

        Error: f'bg:{RED} {WHITE}',

        Generic.Deleted: f'border:{RED_DARK} bg:{RED_LIGHT}',
        Generic.Emph: 'italic',
        Generic.Error: RED_BRIGHT,
        Generic.Heading: f'bold {BLUE}',
        Generic.Inserted: f'border:{GREEN_NEON} bg:{GREEN_LIGHT}',
        Generic.Output: GREY,
        Generic.Prompt: f'bold {BLUE}',
        Generic.Strong: 'bold',
        Generic.EmphStrong: 'bold italic',
        Generic.Subheading: f'bold {BLUE}',
        Generic.Traceback: RED_DARK,

        Keyword: f'bold {BLUE}',
        Keyword.Pseudo: 'nobold',
        Keyword.Type: PURPLE,

        Name.Attribute: f'italic {BLUE}',
        Name.Builtin: f'bold {PURPLE}',
        Name.Class: 'underline',
        Name.Constant: TURQUOISE,
        Name.Decorator: f'bold {ORANGE}',
        Name.Entity: f'bold {PURPLE}',
        Name.Exception: f'bold {PURPLE}',
        Name.Function: f'bold {ORANGE}',
        Name.Tag: f'bold {BLUE}',

        Number: f'bold {PURPLE}',

        Operator: BLUE,
        Operator.Word: 'bold',

        String: GREEN,
        String.Doc: 'italic',
        String.Escape: f'bold {RED_DARK}',
        String.Other: TURQUOISE,
        String.Symbol: f'bold {RED_DARK}',

        Text: GREY_DARK,

        Whitespace: GREY_LIGHT
    }
