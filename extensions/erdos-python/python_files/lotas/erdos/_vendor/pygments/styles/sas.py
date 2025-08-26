"""
    pygments.styles.sas
    ~~~~~~~~~~~~~~~~~~~

    Style inspired by SAS' enhanced program editor. Note This is not
    meant to be a complete style. It's merely meant to mimic SAS'
    program editor syntax highlighting.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
    Number, Other, Whitespace, Generic


__all__ = ['SasStyle']


class SasStyle(Style):
    """
    Style inspired by SAS' enhanced program editor. Note This is not
    meant to be a complete style. It's merely meant to mimic SAS'
    program editor syntax highlighting.
    """

    name = 'sas'
    
    styles = {
        Whitespace:            '#bbbbbb',
        Comment:               'italic #008800',
        String:                '#800080',
        Number:                'bold #2c8553',
        Other:                 'bg:#ffffe0',
        Keyword:               '#2c2cff',
        Keyword.Reserved:      'bold #353580',
        Keyword.Constant:      'bold',
        Name.Builtin:          '#2c2cff',
        Name.Function:         'bold italic',
        Name.Variable:         'bold #2c2cff',
        Generic:               '#2c2cff',
        Generic.Emph:          '#008800',
        Generic.Error:         '#d30202',
        Error:                 'bg:#e3d2d2 #a61717'
    }
