"""
    pygments.lexers.jsx
    ~~~~~~~~~~~~~~~~~~~

    Lexers for JSX (React) and TSX (TypeScript flavor).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import bygroups, default, include, inherit
from erdos._vendor.pygments.lexers.javascript import JavascriptLexer, TypeScriptLexer
from erdos._vendor.pygments.token import Name, Operator, Punctuation, String, Text, \
    Whitespace

__all__ = ['JsxLexer', 'TsxLexer']

_JSX_RULES = {
    "jsx": [
        (r"</?>", Punctuation),  # JSXFragment <>|</>
        (r"(<)(\w+)(\.?)", bygroups(Punctuation, Name.Tag, Punctuation), "tag"),
        (
            r"(</)(\w+)(>)",
            bygroups(Punctuation, Name.Tag, Punctuation),
        ),
        (
            r"(</)(\w+)",
            bygroups(Punctuation, Name.Tag),
            "fragment",
        ),  # Same for React.Context
    ],
    "tag": [
        (r"\s+", Whitespace),
        (r"([\w-]+)(\s*)(=)(\s*)", bygroups(Name.Attribute, Whitespace, Operator, Whitespace), "attr"),
        (r"[{}]+", Punctuation),
        (r"[\w\.]+", Name.Attribute),
        (r"(/?)(\s*)(>)", bygroups(Punctuation, Text, Punctuation), "#pop"),
    ],
    "fragment": [
        (r"(.)(\w+)", bygroups(Punctuation, Name.Attribute)),
        (r"(>)", bygroups(Punctuation), "#pop"),
    ],
    "attr": [
        (r"\{", Punctuation, "expression"),
        (r'".*?"', String, "#pop"),
        (r"'.*?'", String, "#pop"),
        default("#pop"),
    ],
    "expression": [
        (r"\{", Punctuation, "#push"),
        (r"\}", Punctuation, "#pop"),
        include("root"),
    ],
}


class JsxLexer(JavascriptLexer):
    """For JavaScript Syntax Extension (JSX).
    """

    name = "JSX"
    aliases = ["jsx", "react"]
    filenames = ["*.jsx", "*.react"]
    mimetypes = ["text/jsx", "text/typescript-jsx"]
    url = "https://facebook.github.io/jsx/"
    version_added = '2.17'

    flags = re.MULTILINE | re.DOTALL

    # Use same tokens as `JavascriptLexer`, but with tags and attributes support
    tokens = {
        "root": [
            include("jsx"),
            inherit,
        ],
    **_JSX_RULES}


class TsxLexer(TypeScriptLexer):
    """For TypeScript with embedded JSX
    """

    name = "TSX"
    aliases = ["tsx"]
    filenames = ["*.tsx"]
    mimetypes = ["text/typescript-tsx"]
    url = "https://www.typescriptlang.org/docs/handbook/jsx.html"
    version_added = '2.19'

    flags = re.MULTILINE | re.DOTALL

    # Use same tokens as `TypescriptLexer`, but with tags and attributes support
    tokens = {
        "root": [
            include("jsx"),
            inherit,
        ],
    **_JSX_RULES}
