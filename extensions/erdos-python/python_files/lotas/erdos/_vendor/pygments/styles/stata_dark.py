"""
    pygments.styles.stata_dark
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Dark style inspired by Stata's do-file editor. Note this is not
    meant to be a complete style, just for Stata's file formats.


    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Token, Keyword, Name, Comment, String, Error, \
    Number, Operator, Whitespace, Generic


__all__ = ['StataDarkStyle']


class StataDarkStyle(Style):
    name = 'stata-dark'
    
    background_color = "#232629"
    highlight_color = "#49483e"

    styles = {
        Token:                 '#cccccc',
        Whitespace:            '#bbbbbb',
        Error:                 'bg:#e3d2d2 #a61717',
        String:                '#51cc99',
        Number:                '#4FB8CC',
        Operator:              '',
        Name.Function:         '#6a6aff',
        Name.Other:            '#e2828e',
        Keyword:               'bold #7686bb',
        Keyword.Constant:      '',
        Comment:               'italic #777777',
        Name.Variable:         'bold #7AB4DB',
        Name.Variable.Global:  'bold #BE646C',
        Generic.Prompt:        '#ffffff',
    }
