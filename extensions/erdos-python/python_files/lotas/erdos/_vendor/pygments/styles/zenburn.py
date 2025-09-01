"""
    pygments.styles.zenburn
    ~~~~~~~~~~~~~~~~~~~~~~~

    Low contrast color scheme Zenburn.

    See: https://kippura.org/zenburnpage/
         https://github.com/jnurmine/Zenburn

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Token, Name, Operator, Keyword, Generic, Comment, \
    Number, String, Literal, Punctuation, Error


__all__ = ['ZenburnStyle']


class ZenburnStyle(Style):
    """
    Low contrast Zenburn style.
    """

    name = 'zenburn'
    
    background_color = '#3f3f3f'
    highlight_color = '#484848'
    line_number_color = '#5d6262'
    line_number_background_color = '#353535'
    line_number_special_color = '#7a8080'
    line_number_special_background_color = '#353535'

    styles = {
        Token: '#dcdccc',
        Error: '#e37170 bold',

        Keyword: '#efdcbc',
        Keyword.Type: '#dfdfbf bold',
        Keyword.Constant: '#dca3a3',
        Keyword.Declaration: '#f0dfaf',
        Keyword.Namespace: '#f0dfaf',

        Name: '#dcdccc',
        Name.Tag: '#e89393 bold',
        Name.Entity: '#cfbfaf',
        Name.Constant: '#dca3a3',
        Name.Class: '#efef8f',
        Name.Function: '#efef8f',
        Name.Builtin: '#efef8f',
        Name.Builtin.Pseudo: '#dcdccc',
        Name.Attribute: '#efef8f',
        Name.Exception: '#c3bf9f bold',

        Literal: '#9fafaf',

        String: '#cc9393',
        String.Doc: '#7f9f7f',
        String.Interpol: '#dca3a3 bold',

        Number: '#8cd0d3',
        Number.Float: '#c0bed1',

        Operator: '#f0efd0',

        Punctuation: '#f0efd0',

        Comment: '#7f9f7f italic',
        Comment.Preproc: '#dfaf8f bold',
        Comment.PreprocFile: '#cc9393',
        Comment.Special: '#dfdfdf bold',

        Generic: '#ecbcbc bold',
        Generic.Emph: '#ffffff bold',
        Generic.Output: '#5b605e bold',
        Generic.Heading: '#efefef bold',
        Generic.Deleted: '#c3bf9f bg:#313c36',
        Generic.Inserted: '#709080 bg:#313c36 bold',
        Generic.Traceback: '#80d4aa bg:#2f2f2f bold',
        Generic.Subheading: '#efefef bold',
    }
