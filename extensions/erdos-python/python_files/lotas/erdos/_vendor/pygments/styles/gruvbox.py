"""
    pygments.styles.gruvbox
    ~~~~~~~~~~~~~~~~~~~~~~~

    pygments version of the "gruvbox" vim theme.
    https://github.com/morhetz/gruvbox

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.style import Style
from lotas.erdos._vendor.pygments.token import Token, Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic


__all__ = ['GruvboxDarkStyle', 'GruvboxLightStyle']


class GruvboxDarkStyle(Style):
    """
    Pygments version of the "gruvbox" dark vim theme.
    """
    
    name = 'gruvbox-dark'

    background_color = '#282828'
    highlight_color = '#ebdbb2'

    styles = {
        Token:              '#dddddd',

        Comment:            'italic #928374',
        Comment.PreProc:    '#8ec07c',
        Comment.Special:    'bold italic #ebdbb2',

        Keyword:            '#fb4934',
        Operator.Word:      '#fb4934',

        String:             '#b8bb26',
        String.Escape:      '#fe8019',

        Number:             '#d3869b',

        Name.Builtin:       '#fe8019',
        Name.Variable:      '#83a598',
        Name.Constant:      '#d3869b',
        Name.Class:         '#8ec07c',
        Name.Function:      '#8ec07c',
        Name.Namespace:     '#8ec07c',
        Name.Exception:     '#fb4934',
        Name.Tag:           '#8ec07c',
        Name.Attribute:     '#fabd2f',
        Name.Decorator:     '#fb4934',

        Generic.Heading:    'bold #ebdbb2',
        Generic.Subheading: 'underline #ebdbb2',
        Generic.Deleted:    'bg:#fb4934 #282828',
        Generic.Inserted:   'bg:#b8bb26 #282828',
        Generic.Error:      '#fb4934',
        Generic.Emph:       'italic',
        Generic.Strong:     'bold',
        Generic.EmphStrong: 'bold italic',
        Generic.Prompt:     '#a89984',
        Generic.Output:     '#f2e5bc',
        Generic.Traceback:  '#fb4934',

        Error:              'bg:#fb4934 #282828'
    }


class GruvboxLightStyle(Style):
    """
    Pygments version of the "gruvbox" Light vim theme.
    """

    name = 'gruvbox-light'

    background_color = '#fbf1c7'
    highlight_color = '#3c3836'

    styles = {
        Comment:            'italic #928374',
        Comment.PreProc:    '#427b58',
        Comment.Special:    'bold italic #3c3836',

        Keyword:            '#9d0006',
        Operator.Word:      '#9d0006',

        String:             '#79740e',
        String.Escape:      '#af3a03',

        Number:             '#8f3f71',

        Name.Builtin:       '#af3a03',
        Name.Variable:      '#076678',
        Name.Constant:      '#8f3f71',
        Name.Class:         '#427b58',
        Name.Function:      '#427b58',
        Name.Namespace:     '#427b58',
        Name.Exception:     '#9d0006',
        Name.Tag:           '#427b58',
        Name.Attribute:     '#b57614',
        Name.Decorator:     '#9d0006',

        Generic.Heading:    'bold #3c3836',
        Generic.Subheading: 'underline #3c3836',
        Generic.Deleted:    'bg:#9d0006 #fbf1c7',
        Generic.Inserted:   'bg:#79740e #fbf1c7',
        Generic.Error:      '#9d0006',
        Generic.Emph:       'italic',
        Generic.Strong:     'bold',
        Generic.Prompt:     '#7c6f64',
        Generic.Output:     '#32302f',
        Generic.Traceback:  '#9d0006',

        Error:              'bg:#9d0006 #fbf1c7'
    }
