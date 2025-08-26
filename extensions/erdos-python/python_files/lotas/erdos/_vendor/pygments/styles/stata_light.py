"""
    pygments.styles.stata_light
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Light Style inspired by Stata's do-file editor. Note this is not
    meant to be a complete style, just for Stata's file formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
    Number, Operator, Whitespace, Text


__all__ = ['StataLightStyle']


class StataLightStyle(Style):
    """
    Light mode style inspired by Stata's do-file editor. This is not
    meant to be a complete style, just for use with Stata.
    """

    name = 'stata-light'
    
    styles = {
        Text:                  '#111111',
        Whitespace:            '#bbbbbb',
        Error:                 'bg:#e3d2d2 #a61717',
        String:                '#7a2424',
        Number:                '#2c2cff',
        Operator:              '',
        Name.Function:         '#2c2cff',
        Name.Other:            '#be646c',
        Keyword:               'bold #353580',
        Keyword.Constant:      '',
        Comment:               'italic #008800',
        Name.Variable:         'bold #35baba',
        Name.Variable.Global:  'bold #b5565e',
    }
