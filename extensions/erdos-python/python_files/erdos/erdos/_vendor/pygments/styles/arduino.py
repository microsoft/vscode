"""
    pygments.styles.arduino
    ~~~~~~~~~~~~~~~~~~~~~~~

    Arduino® Syntax highlighting style.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
    Number, Operator, Generic, Whitespace


__all__ = ['ArduinoStyle']


class ArduinoStyle(Style):
    """
    The Arduino® language style. This style is designed to highlight the
    Arduino source code, so expect the best results with it.
    """
    name = 'arduino'

    background_color = "#ffffff"

    styles = {
        Whitespace:                "",         # class: 'w'
        Error:                     "#a61717",  # class: 'err'

        Comment:                   "#95a5a6",  # class: 'c'
        Comment.Multiline:         "",         # class: 'cm'
        Comment.Preproc:           "#728E00",  # class: 'cp'
        Comment.Single:            "",         # class: 'c1'
        Comment.Special:           "",         # class: 'cs'

        Keyword:                   "#728E00",  # class: 'k'
        Keyword.Constant:          "#00979D",  # class: 'kc'
        Keyword.Declaration:       "",         # class: 'kd'
        Keyword.Namespace:         "",         # class: 'kn'
        Keyword.Pseudo:            "#00979D",  # class: 'kp'
        Keyword.Reserved:          "#00979D",  # class: 'kr'
        Keyword.Type:              "#00979D",  # class: 'kt'

        Operator:                  "#728E00",  # class: 'o'
        Operator.Word:             "",         # class: 'ow'

        Name:                      "#434f54",  # class: 'n'
        Name.Attribute:            "",         # class: 'na'
        Name.Builtin:              "#728E00",  # class: 'nb'
        Name.Builtin.Pseudo:       "",         # class: 'bp'
        Name.Class:                "",         # class: 'nc'
        Name.Constant:             "",         # class: 'no'
        Name.Decorator:            "",         # class: 'nd'
        Name.Entity:               "",         # class: 'ni'
        Name.Exception:            "",         # class: 'ne'
        Name.Function:             "#D35400",  # class: 'nf'
        Name.Property:             "",         # class: 'py'
        Name.Label:                "",         # class: 'nl'
        Name.Namespace:            "",         # class: 'nn'
        Name.Other:                "#728E00",  # class: 'nx'
        Name.Tag:                  "",         # class: 'nt'
        Name.Variable:             "",         # class: 'nv'
        Name.Variable.Class:       "",         # class: 'vc'
        Name.Variable.Global:      "",         # class: 'vg'
        Name.Variable.Instance:    "",         # class: 'vi'

        Number:                    "#8A7B52",  # class: 'm'
        Number.Float:              "",         # class: 'mf'
        Number.Hex:                "",         # class: 'mh'
        Number.Integer:            "",         # class: 'mi'
        Number.Integer.Long:       "",         # class: 'il'
        Number.Oct:                "",         # class: 'mo'

        String:                    "#7F8C8D",  # class: 's'
        String.Backtick:           "",         # class: 'sb'
        String.Char:               "",         # class: 'sc'
        String.Doc:                "",         # class: 'sd'
        String.Double:             "",         # class: 's2'
        String.Escape:             "",         # class: 'se'
        String.Heredoc:            "",         # class: 'sh'
        String.Interpol:           "",         # class: 'si'
        String.Other:              "",         # class: 'sx'
        String.Regex:              "",         # class: 'sr'
        String.Single:             "",         # class: 's1'
        String.Symbol:             "",         # class: 'ss'

        Generic:                   "",         # class: 'g'
        Generic.Deleted:           "",         # class: 'gd',
        Generic.Emph:              "",         # class: 'ge'
        Generic.Error:             "",         # class: 'gr'
        Generic.Heading:           "",         # class: 'gh'
        Generic.Inserted:          "",         # class: 'gi'
        Generic.Output:            "",         # class: 'go'
        Generic.Prompt:            "",         # class: 'gp'
        Generic.Strong:            "",         # class: 'gs'
        Generic.Subheading:        "",         # class: 'gu'
        Generic.Traceback:         "",         # class: 'gt'
    }
