"""
    pygments.styles.pastie
    ~~~~~~~~~~~~~~~~~~~~~~

    Style similar to the `pastie`_ default style.

    .. _pastie: http://pastie.caboo.se/

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.style import Style
from erdos.erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace


__all__ = ['PastieStyle']


class PastieStyle(Style):
    """
    Style similar to the pastie default style.
    """

    name = 'pastie'
    
    styles = {
        Whitespace:             '#bbbbbb',
        Comment:                '#888888',
        Comment.Preproc:        'bold #cc0000',
        Comment.Special:        'bg:#fff0f0 bold #cc0000',

        String:                 'bg:#fff0f0 #dd2200',
        String.Regex:           'bg:#fff0ff #008800',
        String.Other:           'bg:#f0fff0 #22bb22',
        String.Symbol:          '#aa6600',
        String.Interpol:        '#3333bb',
        String.Escape:          '#0044dd',

        Operator.Word:          '#008800',

        Keyword:                'bold #008800',
        Keyword.Pseudo:         'nobold',
        Keyword.Type:           '#888888',

        Name.Class:             'bold #bb0066',
        Name.Exception:         'bold #bb0066',
        Name.Function:          'bold #0066bb',
        Name.Property:          'bold #336699',
        Name.Namespace:         'bold #bb0066',
        Name.Builtin:           '#003388',
        Name.Variable:          '#336699',
        Name.Variable.Class:    '#336699',
        Name.Variable.Instance: '#3333bb',
        Name.Variable.Global:   '#dd7700',
        Name.Constant:          'bold #003366',
        Name.Tag:               'bold #bb0066',
        Name.Attribute:         '#336699',
        Name.Decorator:         '#555555',
        Name.Label:             'italic #336699',

        Number:                 'bold #0000DD',

        Generic.Heading:        '#333',
        Generic.Subheading:     '#666',
        Generic.Deleted:        'bg:#ffdddd #000000',
        Generic.Inserted:       'bg:#ddffdd #000000',
        Generic.Error:          '#aa0000',
        Generic.Emph:           'italic',
        Generic.Strong:         'bold',
        Generic.EmphStrong:     'bold italic',
        Generic.Prompt:         '#555555',
        Generic.Output:         '#888888',
        Generic.Traceback:      '#aa0000',

        Error:                  'bg:#e3d2d2 #a61717'
    }
