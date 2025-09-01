"""
    pygments.styles.tango
    ~~~~~~~~~~~~~~~~~~~~~

    The Crunchy default Style inspired from the color palette from
    the Tango Icon Theme Guidelines.

    http://tango.freedesktop.org/Tango_Icon_Theme_Guidelines

    Butter:     #fce94f     #edd400     #c4a000
    Orange:     #fcaf3e     #f57900     #ce5c00
    Chocolate:  #e9b96e     #c17d11     #8f5902
    Chameleon:  #8ae234     #73d216     #4e9a06
    Sky Blue:   #729fcf     #3465a4     #204a87
    Plum:       #ad7fa8     #75507b     #5c35cc
    Scarlet Red:#ef2929     #cc0000     #a40000
    Aluminium:  #eeeeec     #d3d7cf     #babdb6
                #888a85     #555753     #2e3436

    Not all of the above colors are used; other colors added:
        very light grey: #f8f8f8  (for background)

    This style can be used as a template as it includes all the known
    Token types, unlike most (if not all) of the styles included in the
    Pygments distribution.

    However, since Crunchy is intended to be used by beginners, we have strived
    to create a style that gloss over subtle distinctions between different
    categories.

    Taking Python for example, comments (Comment.*) and docstrings (String.Doc)
    have been chosen to have the same style.  Similarly, keywords (Keyword.*),
    and Operator.Word (and, or, in) have been assigned the same style.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Keyword, Name, Comment, String, Error, \
     Number, Operator, Generic, Whitespace, Punctuation, Other, Literal


__all__ = ['TangoStyle']


class TangoStyle(Style):
    """
    The Crunchy default Style inspired from the color palette from
    the Tango Icon Theme Guidelines.
    """

    name = 'tango'
    
    background_color = "#f8f8f8"

    styles = {
        # No corresponding class for the following:
        #Text:                     "", # class:  ''
        Whitespace:                "#f8f8f8",      # class: 'w'
        Error:                     "#a40000 border:#ef2929", # class: 'err'
        Other:                     "#000000",                # class 'x'

        Comment:                   "italic #8f5902", # class: 'c'
        Comment.Multiline:         "italic #8f5902", # class: 'cm'
        Comment.Preproc:           "italic #8f5902", # class: 'cp'
        Comment.Single:            "italic #8f5902", # class: 'c1'
        Comment.Special:           "italic #8f5902", # class: 'cs'

        Keyword:                   "bold #204a87",   # class: 'k'
        Keyword.Constant:          "bold #204a87",   # class: 'kc'
        Keyword.Declaration:       "bold #204a87",   # class: 'kd'
        Keyword.Namespace:         "bold #204a87",   # class: 'kn'
        Keyword.Pseudo:            "bold #204a87",   # class: 'kp'
        Keyword.Reserved:          "bold #204a87",   # class: 'kr'
        Keyword.Type:              "bold #204a87",   # class: 'kt'

        Operator:                  "bold #ce5c00",   # class: 'o'
        Operator.Word:             "bold #204a87",   # class: 'ow' - like keywords

        Punctuation:               "bold #000000",   # class: 'p'

        # because special names such as Name.Class, Name.Function, etc.
        # are not recognized as such later in the parsing, we choose them
        # to look the same as ordinary variables.
        Name:                      "#000000",        # class: 'n'
        Name.Attribute:            "#c4a000",        # class: 'na' - to be revised
        Name.Builtin:              "#204a87",        # class: 'nb'
        Name.Builtin.Pseudo:       "#3465a4",        # class: 'bp'
        Name.Class:                "#000000",        # class: 'nc' - to be revised
        Name.Constant:             "#000000",        # class: 'no' - to be revised
        Name.Decorator:            "bold #5c35cc",   # class: 'nd' - to be revised
        Name.Entity:               "#ce5c00",        # class: 'ni'
        Name.Exception:            "bold #cc0000",   # class: 'ne'
        Name.Function:             "#000000",        # class: 'nf'
        Name.Property:             "#000000",        # class: 'py'
        Name.Label:                "#f57900",        # class: 'nl'
        Name.Namespace:            "#000000",        # class: 'nn' - to be revised
        Name.Other:                "#000000",        # class: 'nx'
        Name.Tag:                  "bold #204a87",   # class: 'nt' - like a keyword
        Name.Variable:             "#000000",        # class: 'nv' - to be revised
        Name.Variable.Class:       "#000000",        # class: 'vc' - to be revised
        Name.Variable.Global:      "#000000",        # class: 'vg' - to be revised
        Name.Variable.Instance:    "#000000",        # class: 'vi' - to be revised

        # since the tango light blue does not show up well in text, we choose
        # a pure blue instead.
        Number:                    "bold #0000cf",   # class: 'm'
        Number.Float:              "bold #0000cf",   # class: 'mf'
        Number.Hex:                "bold #0000cf",   # class: 'mh'
        Number.Integer:            "bold #0000cf",   # class: 'mi'
        Number.Integer.Long:       "bold #0000cf",   # class: 'il'
        Number.Oct:                "bold #0000cf",   # class: 'mo'

        Literal:                   "#000000",        # class: 'l'
        Literal.Date:              "#000000",        # class: 'ld'

        String:                    "#4e9a06",        # class: 's'
        String.Backtick:           "#4e9a06",        # class: 'sb'
        String.Char:               "#4e9a06",        # class: 'sc'
        String.Doc:                "italic #8f5902", # class: 'sd' - like a comment
        String.Double:             "#4e9a06",        # class: 's2'
        String.Escape:             "#4e9a06",        # class: 'se'
        String.Heredoc:            "#4e9a06",        # class: 'sh'
        String.Interpol:           "#4e9a06",        # class: 'si'
        String.Other:              "#4e9a06",        # class: 'sx'
        String.Regex:              "#4e9a06",        # class: 'sr'
        String.Single:             "#4e9a06",        # class: 's1'
        String.Symbol:             "#4e9a06",        # class: 'ss'

        Generic:                   "#000000",        # class: 'g'
        Generic.Deleted:           "#a40000",        # class: 'gd'
        Generic.Emph:              "italic #000000", # class: 'ge'
        Generic.Error:             "#ef2929",        # class: 'gr'
        Generic.Heading:           "bold #000080",   # class: 'gh'
        Generic.Inserted:          "#00A000",        # class: 'gi'
        Generic.Output:            "italic #000000", # class: 'go'
        Generic.Prompt:            "#8f5902",        # class: 'gp'
        Generic.Strong:            "bold #000000",   # class: 'gs'
        Generic.EmphStrong:        "bold italic #000000",  # class: 'ges'
        Generic.Subheading:        "bold #800080",   # class: 'gu'
        Generic.Traceback:         "bold #a40000",   # class: 'gt'
    }
