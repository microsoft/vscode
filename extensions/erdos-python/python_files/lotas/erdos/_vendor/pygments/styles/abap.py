"""
    pygments.styles.abap
    ~~~~~~~~~~~~~~~~~~~~

    ABAP workbench like style.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
    Number, Operator


__all__ = ['AbapStyle']


class AbapStyle(Style):
    name = 'abap'

    styles = {
        Comment:                'italic #888',
        Comment.Special:        '#888',
        Keyword:                '#00f',
        Operator.Word:          '#00f',
        Name:                   '#000',
        Number:                 '#3af',
        String:                 '#5a2',

        Error:                  '#F00',
    }
