"""
    pygments.styles.gh_dark
    ~~~~~~~~~~~~~~~~~~~~~~~

    Github's Dark-Colorscheme based theme for Pygments
    Colors extracted from https://github.com/primer/primitives

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, Error, Number, Operator, \
    Generic, Text, Literal, String, Token


__all__ = ['GhDarkStyle']


# vars are defined to match the defs in
# - [GitHub's VS Code theme](https://github.com/primer/github-vscode-theme) and
# - [Primer styles](https://github.com/primer/primitives)
RED_2 = "#ffa198"
RED_3 = "#ff7b72"
RED_9 = "#490202"
ORANGE_2 = "#ffa657"
ORANGE_3 = "#f0883e"
GREEN_1 = "#7ee787"
GREEN_2 = "#56d364"
GREEN_7 = "#0f5323"
BLUE_1 = "#a5d6ff"
BLUE_2 = "#79c0ff"
PURPLE_2 = "#d2a8ff"
GRAY_3 = "#8b949e"
GRAY_4 = "#6e7681"
FG_SUBTLE = "#6e7681"
FG_DEFAULT = "#e6edf3"
BG_DEFAULT = "#0d1117"
DANGER_FG = "#f85149"


class GhDarkStyle(Style):
    """
    Github's Dark-Colorscheme based theme for Pygments
    """
    
    name = 'github-dark'

    background_color = BG_DEFAULT

    # has transparency in VS Code theme as `colors.codemirror.activelineBg`
    highlight_color = GRAY_4

    line_number_special_color = FG_DEFAULT
    line_number_special_background_color = FG_SUBTLE

    line_number_color = GRAY_4
    line_number_background_color = BG_DEFAULT

    styles = {
        Token:                      FG_DEFAULT,

        Error:                      DANGER_FG,

        Keyword:                    RED_3,
        Keyword.Constant:           BLUE_2,
        Keyword.Pseudo:             BLUE_2,

        Name:                       FG_DEFAULT,
        Name.Class:                 "bold "+ORANGE_3,
        Name.Constant:              "bold "+BLUE_2,
        Name.Decorator:             'bold '+PURPLE_2,
        Name.Entity:                ORANGE_2,
        Name.Exception:             "bold "+ORANGE_3,
        Name.Function:              'bold '+PURPLE_2,
        Name.Label:                 "bold "+BLUE_2,
        Name.Namespace:             RED_3,
        Name.Property:              BLUE_2,
        Name.Tag:                   GREEN_1,
        Name.Variable:              BLUE_2,

        Literal:                    BLUE_1,
        Literal.Date:               BLUE_2,
        String:                     BLUE_1,
        String.Affix:               BLUE_2,
        String.Delimiter:           BLUE_2,
        String.Escape:              BLUE_2,
        String.Heredoc:             BLUE_2,
        String.Regex:               BLUE_2,
        Number:                     BLUE_1,

        Comment:                    'italic '+GRAY_3,
        Comment.Preproc:            "bold " + GRAY_3,
        Comment.Special:            "bold italic " + GRAY_3,

        Operator:                   'bold ' + RED_3,

        Generic:                    FG_DEFAULT,
        Generic.Deleted:            f"bg:{RED_9} {RED_2}",
        Generic.Emph:               "italic",
        Generic.Error:              RED_2,
        Generic.Heading:            "bold "+BLUE_2,
        Generic.Inserted:           f'bg:{GREEN_7} {GREEN_2}',
        Generic.Output:             GRAY_3,
        Generic.Prompt:             GRAY_3,
        Generic.Strong:             "bold",
        Generic.EmphStrong:         "bold italic",
        Generic.Subheading:         BLUE_2,
        Generic.Traceback:          RED_3,
        Generic.Underline:          "underline",

        Text.Whitespace:            FG_SUBTLE,
    }
