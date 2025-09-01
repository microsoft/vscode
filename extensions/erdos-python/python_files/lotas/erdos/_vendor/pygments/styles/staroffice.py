"""
    pygments.styles.staroffice
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Style similar to StarOffice style, also in OpenOffice and LibreOffice.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Comment, Error, Literal, Name, Token


__all__ = ['StarofficeStyle']


class StarofficeStyle(Style):
    """
    Style similar to StarOffice style, also in OpenOffice and LibreOffice.
    """
    name = 'staroffice'

    
    styles = {
        Token:                  '#000080',   # Blue
        Comment:                '#696969',   # DimGray
        Error:                  '#800000',   # Maroon
        Literal:                '#EE0000',   # Red
        Name:                   '#008000',   # Green
    }
