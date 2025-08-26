"""
    pygments.styles.fruity
    ~~~~~~~~~~~~~~~~~~~~~~

    pygments version of my "fruity" vim theme.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Token, Comment, Name, Keyword, \
    Generic, Number, String, Whitespace


__all__ = ['FruityStyle']


class FruityStyle(Style):
    """
    Pygments version of the "native" vim theme.
    """

    name = 'fruity'

    background_color = '#111111'
    highlight_color = '#333333'

    styles = {
        Whitespace:         '#888888',
        Token:              '#ffffff',
        Generic.Output:     '#444444 bg:#222222',
        Keyword:            '#fb660a bold',
        Keyword.Pseudo:     'nobold',
        Number:             '#0086f7 bold',
        Name.Tag:           '#fb660a bold',
        Name.Variable:      '#fb660a',
        Comment:            '#008800 bg:#0f140f italic',
        Name.Attribute:     '#ff0086 bold',
        String:             '#0086d2',
        Name.Function:      '#ff0086 bold',
        Generic.Heading:    '#ffffff bold',
        Keyword.Type:       '#cdcaa9 bold',
        Generic.Subheading: '#ffffff bold',
        Name.Constant:      '#0086d2',
        Comment.Preproc:    '#ff0007 bold'
    }
