"""
    pygments.styles.onedark
    ~~~~~~~~~~~~~~~~~~~~~~~

    One Dark Theme for Pygments by Tobias Zoghaib (https://github.com/TobiZog)

    Inspired by one-dark-ui for the code editor Atom
    (https://atom.io/themes/one-dark-ui).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Token


__all__ = ['OneDarkStyle']


class OneDarkStyle(Style):
    """
    Theme inspired by One Dark Pro for Atom.

    .. versionadded:: 2.11
    """
    name = 'one-dark'
    
    background_color = '#282C34'

    styles = {
        Token:                  '#ABB2BF',

        Punctuation:            '#ABB2BF',
        Punctuation.Marker:     '#ABB2BF',

        Keyword:                '#C678DD',
        Keyword.Constant:       '#E5C07B',
        Keyword.Declaration:    '#C678DD',
        Keyword.Namespace:      '#C678DD',
        Keyword.Reserved:       '#C678DD',
        Keyword.Type:           '#E5C07B',

        Name:                   '#E06C75',
        Name.Attribute:         '#E06C75',
        Name.Builtin:           '#E5C07B',
        Name.Class:             '#E5C07B',
        Name.Function:          'bold #61AFEF',
        Name.Function.Magic:    'bold #56B6C2',
        Name.Other:             '#E06C75',
        Name.Tag:               '#E06C75',
        Name.Decorator:         '#61AFEF',
        Name.Variable.Class:    '',

        String:                 '#98C379',

        Number:                 '#D19A66',

        Operator:               '#56B6C2',

        Comment:                '#7F848E'
    }
