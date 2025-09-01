"""
    pygments.styles.solarized
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Solarized by Camil Staps

    A Pygments style for the Solarized themes (licensed under MIT).
    See: https://github.com/altercation/solarized

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Comment, Error, Generic, Keyword, Name, Number, \
    Operator, String, Token


__all__ = ['SolarizedLightStyle', 'SolarizedDarkStyle']


def make_style(colors):
    return {
        Token:               colors['base0'],

        Comment:             'italic ' + colors['base01'],
        Comment.Hashbang:    colors['base01'],
        Comment.Multiline:   colors['base01'],
        Comment.Preproc:     'noitalic ' + colors['magenta'],
        Comment.PreprocFile: 'noitalic ' + colors['base01'],

        Keyword:             colors['green'],
        Keyword.Constant:    colors['cyan'],
        Keyword.Declaration: colors['cyan'],
        Keyword.Namespace:   colors['orange'],
        Keyword.Type:        colors['yellow'],

        Operator:            colors['base01'],
        Operator.Word:       colors['green'],

        Name.Builtin:        colors['blue'],
        Name.Builtin.Pseudo: colors['blue'],
        Name.Class:          colors['blue'],
        Name.Constant:       colors['blue'],
        Name.Decorator:      colors['blue'],
        Name.Entity:         colors['blue'],
        Name.Exception:      colors['blue'],
        Name.Function:       colors['blue'],
        Name.Function.Magic: colors['blue'],
        Name.Label:          colors['blue'],
        Name.Namespace:      colors['blue'],
        Name.Tag:            colors['blue'],
        Name.Variable:       colors['blue'],
        Name.Variable.Global:colors['blue'],
        Name.Variable.Magic: colors['blue'],

        String:              colors['cyan'],
        String.Doc:          colors['base01'],
        String.Regex:        colors['orange'],

        Number:              colors['cyan'],

        Generic:             colors['base0'],
        Generic.Deleted:     colors['red'],
        Generic.Emph:        'italic',
        Generic.Error:       colors['red'],
        Generic.Heading:     'bold',
        Generic.Subheading:  'underline',
        Generic.Inserted:    colors['green'],
        Generic.Output:      colors['base0'],
        Generic.Prompt:      'bold ' + colors['blue'],
        Generic.Strong:      'bold',
        Generic.EmphStrong:  'bold italic',
        Generic.Traceback:   colors['blue'],

        Error:               'bg:' + colors['red'],
    }


DARK_COLORS = {
    'base03':  '#002b36',
    'base02':  '#073642',
    'base01':  '#586e75',
    'base00':  '#657b83',
    'base0':   '#839496',
    'base1':   '#93a1a1',
    'base2':   '#eee8d5',
    'base3':   '#fdf6e3',
    'yellow':  '#b58900',
    'orange':  '#cb4b16',
    'red':     '#dc322f',
    'magenta': '#d33682',
    'violet':  '#6c71c4',
    'blue':    '#268bd2',
    'cyan':    '#2aa198',
    'green':   '#859900',
}

LIGHT_COLORS = {
    'base3':   '#002b36',
    'base2':   '#073642',
    'base1':   '#586e75',
    'base0':   '#657b83',
    'base00':  '#839496',
    'base01':  '#93a1a1',
    'base02':  '#eee8d5',
    'base03':  '#fdf6e3',
    'yellow':  '#b58900',
    'orange':  '#cb4b16',
    'red':     '#dc322f',
    'magenta': '#d33682',
    'violet':  '#6c71c4',
    'blue':    '#268bd2',
    'cyan':    '#2aa198',
    'green':   '#859900',
}


class SolarizedDarkStyle(Style):
    """
    The solarized style, dark.
    """

    name = 'solarized-dark'
    
    styles = make_style(DARK_COLORS)
    background_color = DARK_COLORS['base03']
    highlight_color = DARK_COLORS['base02']
    line_number_color = DARK_COLORS['base01']
    line_number_background_color = DARK_COLORS['base02']


class SolarizedLightStyle(SolarizedDarkStyle):
    """
    The solarized style, light.
    """

    name = 'solarized-light'
    
    styles = make_style(LIGHT_COLORS)
    background_color = LIGHT_COLORS['base03']
    highlight_color = LIGHT_COLORS['base02']
    line_number_color = LIGHT_COLORS['base01']
    line_number_background_color = LIGHT_COLORS['base02']
