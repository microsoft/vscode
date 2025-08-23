"""
    pygments.styles.material
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Mimic the Material theme color scheme.

    https://github.com/material-theme/vsc-material-theme

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Escape, \
    Error, Text, Number, Operator, Generic, Punctuation, Literal


__all__ = ['MaterialStyle']


class MaterialStyle(Style):
    """
    This style mimics the Material Theme color scheme.
    """
    name = 'material'
    
    dark_teal = '#263238'
    white = '#FFFFFF'
    black = '#000000'
    red = '#FF5370'
    orange = '#F78C6C'
    yellow = '#FFCB6B'
    green = '#C3E88D'
    cyan = '#89DDFF'
    blue = '#82AAFF'
    paleblue = '#B2CCD6'
    purple = '#C792EA'
    brown = '#C17E70'
    pink = '#F07178'
    violet = '#BB80B3'
    foreground = '#EEFFFF'
    faded = '#546E7A'

    background_color = dark_teal
    highlight_color = '#2C3B41'
    line_number_color = '#37474F'
    line_number_background_color = dark_teal
    line_number_special_color = '#607A86'
    line_number_special_background_color = dark_teal

    styles = {
        Text:                          foreground,
        Escape:                        cyan,
        Error:                         red,

        Keyword:                       violet,
        Keyword.Constant:              cyan,
        Keyword.Declaration:           violet,
        Keyword.Namespace:             'italic ' + cyan,
        Keyword.Pseudo:                cyan,
        Keyword.Type:                  violet,

        Name:                          foreground,
        Name.Attribute:                violet,
        Name.Builtin:                  blue,
        Name.Builtin.Pseudo:           cyan,
        Name.Class:                    yellow,
        Name.Constant:                 foreground,
        Name.Decorator:                blue,
        Name.Entity:                   cyan,
        Name.Exception:                yellow,
        Name.Function:                 blue,
        Name.Function.Magic:           blue,
        Name.Label:                    blue,
        Name.Property:                 yellow,
        Name.Namespace:                yellow,
        Name.Other:                    foreground,
        Name.Tag:                      red,
        Name.Variable:                 cyan,
        Name.Variable.Class:           cyan,
        Name.Variable.Global:          cyan,
        Name.Variable.Instance:        cyan,
        Name.Variable.Magic:           blue,

        Literal:                       green,
        Literal.Date:                  green,

        String:                        green,
        String.Affix:                  violet,
        String.Backtick:               green,
        String.Char:                   green,
        String.Delimiter:              foreground,
        String.Doc:                    'italic ' + faded,
        String.Double:                 green,
        String.Escape:                 foreground,
        String.Heredoc:                green,
        String.Interpol:               cyan,
        String.Other:                  green,
        String.Regex:                  cyan,
        String.Single:                 green,
        String.Symbol:                 cyan,

        Number:                        orange,

        Operator:                      cyan,
        Operator.Word:                 'italic ' + cyan,

        Punctuation:                   cyan,

        Comment:                       'italic ' + faded,

        Generic:                       foreground,
        Generic.Deleted:               red,
        Generic.Emph:                  cyan,
        Generic.Error:                 red,
        Generic.Heading:               green,
        Generic.Inserted:              green,
        Generic.Output:                faded,
        Generic.Prompt:                yellow,
        Generic.Strong:                red,
        Generic.EmphStrong:            yellow,
        Generic.Subheading:            cyan,
        Generic.Traceback:             red,
    }
