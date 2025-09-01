"""
    pygments.lexers.usd
    ~~~~~~~~~~~~~~~~~~~

    The module that parses Pixar's Universal Scene Description file format.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos._vendor.pygments.lexer import words as words_
from erdos._vendor.pygments.lexers._usd_builtins import COMMON_ATTRIBUTES, KEYWORDS, \
    OPERATORS, SPECIAL_NAMES, TYPES
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, String, Text, Whitespace

__all__ = ["UsdLexer"]


def _keywords(words, type_):
    return [(words_(words, prefix=r"\b", suffix=r"\b"), type_)]


_TYPE = r"(\w+(?:\[\])?)"
_BASE_ATTRIBUTE = r"(\w+(?:\:\w+)*)(?:(\.)(timeSamples))?"
_WHITESPACE = r"([ \t]+)"


class UsdLexer(RegexLexer):
    """
    A lexer that parses Pixar's Universal Scene Description file format.
    """

    name = "USD"
    url = 'https://graphics.pixar.com/usd/release/index.html'
    aliases = ["usd", "usda"]
    filenames = ["*.usd", "*.usda"]
    version_added = '2.6'

    tokens = {
        "root": [
            (rf"(custom){_WHITESPACE}(uniform)(\s+){_TYPE}(\s+){_BASE_ATTRIBUTE}(\s*)(=)",
             bygroups(Keyword.Token, Whitespace, Keyword.Token, Whitespace,
                      Keyword.Type, Whitespace, Name.Attribute, Text,
                      Name.Keyword.Tokens, Whitespace, Operator)),
            (rf"(custom){_WHITESPACE}{_TYPE}(\s+){_BASE_ATTRIBUTE}(\s*)(=)",
             bygroups(Keyword.Token, Whitespace, Keyword.Type, Whitespace,
                      Name.Attribute, Text, Name.Keyword.Tokens, Whitespace,
                      Operator)),
            (rf"(uniform){_WHITESPACE}{_TYPE}(\s+){_BASE_ATTRIBUTE}(\s*)(=)",
             bygroups(Keyword.Token, Whitespace, Keyword.Type, Whitespace,
                      Name.Attribute, Text, Name.Keyword.Tokens, Whitespace,
                      Operator)),
            (rf"{_TYPE}{_WHITESPACE}{_BASE_ATTRIBUTE}(\s*)(=)",
             bygroups(Keyword.Type, Whitespace, Name.Attribute, Text,
                      Name.Keyword.Tokens, Whitespace, Operator)),
        ] +
        _keywords(KEYWORDS, Keyword.Tokens) +
        _keywords(SPECIAL_NAMES, Name.Builtins) +
        _keywords(COMMON_ATTRIBUTES, Name.Attribute) +
        [(r"\b\w+:[\w:]+\b", Name.Attribute)] +
        _keywords(OPERATORS, Operator) +  # more attributes
        [(type_ + r"\[\]", Keyword.Type) for type_ in TYPES] +
        _keywords(TYPES, Keyword.Type) +
        [
            (r"[(){}\[\]]", Punctuation),
            ("#.*?$", Comment.Single),
            (",", Punctuation),
            (";", Punctuation),  # ";"s are allowed to combine separate metadata lines
            ("=", Operator),
            (r"[-]*([0-9]*[.])?[0-9]+(?:e[+-]*\d+)?", Number),
            (r"'''(?:.|\n)*?'''", String),
            (r'"""(?:.|\n)*?"""', String),
            (r"'.*?'", String),
            (r'".*?"', String),
            (r"<(\.\./)*([\w/]+|[\w/]+\.\w+[\w:]*)>", Name.Namespace),
            (r"@.*?@", String.Interpol),
            (r'\(.*"[.\\n]*".*\)', String.Doc),
            (r"\A#usda .+$", Comment.Hashbang),
            (r"\s+", Whitespace),
            (r"\w+", Text),
            (r"[_:.]+", Punctuation),
        ],
    }
