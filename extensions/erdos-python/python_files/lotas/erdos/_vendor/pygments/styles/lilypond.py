"""
    pygments.styles.lilypond
    ~~~~~~~~~~~~~~~~~~~~~~~~

    LilyPond-specific style.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.style import Style
from erdos._vendor.pygments.token import Token


__all__ = ['LilyPondStyle']


class LilyPondStyle(Style):
    """
    Style for the LilyPond language.

    .. versionadded:: 2.11
    """

    name = 'lilypond'
    
    # Don't show it in the gallery, it's intended for LilyPond
    # input only and doesn't show good output on Python code.
    web_style_gallery_exclude = True

    styles = {
        Token.Text: "",
        Token.Keyword: "bold",
        Token.Comment: "italic #A3AAB2",
        Token.String: "#AB0909",
        Token.String.Escape: "#C46C6C",
        Token.String.Symbol: "noinherit",
        Token.Pitch: "", #"#911520",
        Token.Number: "#976806", # includes durations
        # A bare 11 is not distinguishable from a number, so we highlight
        # the same.
        Token.ChordModifier: "#976806",
        Token.Name.Lvalue: "#08547A",
        Token.Name.BackslashReference: "#08547A",
        Token.Name.Builtin.MusicCommand: "bold #08547A",
        Token.Name.Builtin.PaperVariable: "bold #6C5A05",
        Token.Name.Builtin.HeaderVariable: "bold #6C5A05",
        Token.Name.Builtin.MusicFunction: "bold #08547A",
        Token.Name.Builtin.Clef: "bold #08547A",
        Token.Name.Builtin.Scale: "bold #08547A",
        Token.Name.Builtin.RepeatType: "#08547A",
        Token.Name.Builtin.Dynamic: "#68175A",
        Token.Name.Builtin.Articulation: "#68175A",
        Token.Name.Builtin.SchemeFunction: "bold #A83401",
        Token.Name.Builtin.SchemeBuiltin: "bold",
        Token.Name.Builtin.MarkupCommand: "bold #831E71",
        Token.Name.Builtin.Context: "bold #038B8B",
        Token.Name.Builtin.ContextProperty: "#038B8B",
        Token.Name.Builtin.Grob: "bold #0C7441",
        Token.Name.Builtin.GrobProperty: "#0C7441",
        Token.Name.Builtin.Translator: "bold #6200A4",
    }
