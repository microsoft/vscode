"""
    pygments.lexers.wowtoc
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for World of Warcraft TOC files

    TOC files describe game addons.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos._vendor.pygments.token import Comment, Name, Text, Punctuation, String, Keyword

__all__ = ["WoWTocLexer"]

def _create_tag_line_pattern(inner_pattern, ignore_case=False):
    return ((r"(?i)" if ignore_case else r"")
        + r"^(##)( *)"  # groups 1, 2
        + inner_pattern  # group 3
        + r"( *)(:)( *)(.*?)( *)$")  # groups 4, 5, 6, 7, 8


def _create_tag_line_token(inner_pattern, inner_token, ignore_case=False):
    # this function template-izes the tag line for a specific type of tag, which will
    # have a different pattern and different token. otherwise, everything about a tag
    # line is the same
    return (
        _create_tag_line_pattern(inner_pattern, ignore_case=ignore_case),
        bygroups(
            Keyword.Declaration,
            Text.Whitespace,
            inner_token,
            Text.Whitespace,
            Punctuation,
            Text.Whitespace,
            String,
            Text.Whitespace,
        ),
    )


class WoWTocLexer(RegexLexer):
    """
    Lexer for World of Warcraft TOC files.
    """

    name = "World of Warcraft TOC"
    aliases = ["wowtoc"]
    filenames = ["*.toc"]
    url = 'https://wowpedia.fandom.com/wiki/TOC_format'
    version_added = '2.14'

    tokens = {
        "root": [
            # official localized tags, Notes and Title
            # (normal part is insensitive, locale part is sensitive)
            _create_tag_line_token(
                r"((?:[nN][oO][tT][eE][sS]|[tT][iI][tT][lL][eE])-(?:ptBR|zhCN|"
                r"enCN|frFR|deDE|itIT|esMX|ptPT|koKR|ruRU|esES|zhTW|enTW|enGB|enUS))",
                Name.Builtin,
            ),
            # other official tags
            _create_tag_line_token(
                r"(Interface|Title|Notes|RequiredDeps|Dep[^: ]*|OptionalDeps|"
                r"LoadOnDemand|LoadWith|LoadManagers|SavedVariablesPerCharacter|"
                r"SavedVariables|DefaultState|Secure|Author|Version)",
                Name.Builtin,
                ignore_case=True,
            ),
            # user-defined tags
            _create_tag_line_token(
                r"(X-[^: ]*)",
                Name.Variable,
                ignore_case=True,
            ),
            # non-conforming tags, but still valid
            _create_tag_line_token(
                r"([^: ]*)",
                Name.Other,
            ),

            # Comments
            (r"^#.*$", Comment),

            # Addon Files
            (r"^.+$", Name),
        ]
    }

    def analyse_text(text):
        # at time of writing, this file suffix conflict's with one of Tex's in
        # markup.py. Tex's anaylse_text() appears to be definitive (binary) and does not
        # share any likeness to WoW TOCs, which means we wont have to compete with it by
        # abitrary increments in score.

        result = 0

        # while not required, an almost certain marker of WoW TOC's is the interface tag
        # if this tag is omitted, players will need to opt-in to loading the addon with
        # an options change ("Load out of date addons"). the value is also standardized:
        # `<major><minor><patch>`, with minor and patch being two-digit zero-padded.
        interface_pattern = _create_tag_line_pattern(r"(Interface)", ignore_case=True)
        match = re.search(interface_pattern, text)
        if match and re.match(r"(\d+)(\d{2})(\d{2})", match.group(7)):
            result += 0.8

        casefolded = text.casefold()
        # Lua file listing is good marker too, but probably conflicts with many other
        # lexers
        if ".lua" in casefolded:
            result += 0.1
        # ditto for XML files, but they're less used in WoW TOCs
        if ".xml" in casefolded:
            result += 0.05

        return result
