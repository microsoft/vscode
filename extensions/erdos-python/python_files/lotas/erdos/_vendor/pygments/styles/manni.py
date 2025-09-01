"""
    pygments.styles.manni
    ~~~~~~~~~~~~~~~~~~~~~

    A colorful style, inspired by the terminal highlighting style.

    This is a port of the style used in the `php port`_ of pygments
    by Manni. The style is called 'default' there.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['ManniStyle']


class ManniStyle(Style):
    """
    A colorful style, inspired by the terminal highlighting style.
    """
    name = 'manni'
    
    background_color = '#f0f3f3'

    styles = {
        Whitespace:         '#bbbbbb',
        Comment:            'italic #0099FF',
        Comment.Preproc:    'noitalic #009999',
        Comment.Special:    'bold',

        Keyword:            'bold #006699',
        Keyword.Pseudo:     'nobold',
        Keyword.Type:       '#007788',

        Operator:           '#555555',
        Operator.Word:      'bold #000000',

        Name.Builtin:       '#336666',
        Name.Function:      '#CC00FF',
        Name.Class:         'bold #00AA88',
        Name.Namespace:     'bold #00CCFF',
        Name.Exception:     'bold #CC0000',
        Name.Variable:      '#003333',
        Name.Constant:      '#336600',
        Name.Label:         '#9999FF',
        Name.Entity:        'bold #999999',
        Name.Attribute:     '#330099',
        Name.Tag:           'bold #330099',
        Name.Decorator:     '#9999FF',

        String:             '#CC3300',
        String.Doc:         'italic',
        String.Interpol:    '#AA0000',
        String.Escape:      'bold #CC3300',
        String.Regex:       '#33AAAA',
        String.Symbol:      '#FFCC33',
        String.Other:       '#CC3300',

        Number:             '#FF6600',

        Generic.Heading:    'bold #003300',
        Generic.Subheading: 'bold #003300',
        Generic.Deleted:    'border:#CC0000 bg:#FFCCCC',
        Generic.Inserted:   'border:#00CC00 bg:#CCFFCC',
        Generic.Error:      '#FF0000',
        Generic.Emph:       'italic',
        Generic.Strong:     'bold',
        Generic.EmphStrong: 'bold italic',
        Generic.Prompt:     'bold #000099',
        Generic.Output:     '#AAAAAA',
        Generic.Traceback:  '#99CC66',

        Error:              'bg:#FFAAAA #AA0000'
    }
