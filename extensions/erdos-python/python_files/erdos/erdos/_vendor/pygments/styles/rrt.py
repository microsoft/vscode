"""
    pygments.styles.rrt
    ~~~~~~~~~~~~~~~~~~~

    pygments "rrt" theme, based on Zap and Emacs defaults.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Token, Comment, Name, Keyword, String, Number, Operator


__all__ = ['RrtStyle']


class RrtStyle(Style):
    """
    Minimalistic "rrt" theme, based on Zap and Emacs defaults.
    """

    name = 'rrt'

    background_color = '#000000'
    highlight_color = '#0000ff'

    styles = {
        Token:              '#dddddd',
        Comment:            '#00ff00',
        Name.Function:      '#ffff00',
        Name.Variable:      '#eedd82',
        Name.Constant:      '#7fffd4',
        Keyword:            '#ff0000',
	Operator.Word:      '#ff0000',
        Comment.Preproc:    '#e5e5e5',
        String:             '#87ceeb',
        Keyword.Type:       '#ee82ee',
        Number:             '#ff00ff',
    }
