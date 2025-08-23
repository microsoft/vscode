"""
    pygments.lexers.blueprint
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Blueprint UI markup language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, words
from erdos.erdos._vendor.pygments.token import (
    Comment,
    Operator,
    Keyword,
    Name,
    String,
    Number,
    Punctuation,
    Whitespace,
)

__all__ = ["BlueprintLexer"]


class BlueprintLexer(RegexLexer):
    """
    For Blueprint UI markup.
    """

    name = "Blueprint"
    aliases = ["blueprint"]
    filenames = ["*.blp"]
    mimetypes = ["text/x-blueprint"]
    url = "https://gitlab.gnome.org/jwestman/blueprint-compiler"
    version_added = '2.16'

    flags = re.IGNORECASE
    tokens = {
        "root": [
            include("block-content"),
        ],
        "type": [
            (r"\$\s*[a-z_][a-z0-9_\-]*", Name.Class),
            (r"(?:([a-z_][a-z0-9_\-]*)(\s*)(\.)(\s*))?([a-z_][a-z0-9_\-]*)",
             bygroups(Name.Namespace, Whitespace, Punctuation, Whitespace, Name.Class)),
        ],
        "whitespace": [
            (r"\s+", Whitespace),
            (r"//.*?\n", Comment.Single),
            (r"/\*", Comment.Multiline, "comment-multiline"),
        ],
        "comment-multiline": [
            (r"\*/", Comment.Multiline, "#pop"),
            (r"[^*]+", Comment.Multiline),
            (r"\*", Comment.Multiline),
        ],
        "value": [
            (r"(typeof)(\s*)(<)", bygroups(Keyword, Whitespace, Punctuation), "typeof"),
            (words(("true", "false", "null")), Keyword.Constant),
            (r"[a-z_][a-z0-9_\-]*", Name.Variable),
            (r"\|", Operator),
            (r'".*?"', String.Double),
            (r"\'.*?\'", String.Single),
            (r"0x[\d_]*", Number.Hex),
            (r"[0-9_]+", Number.Integer),
            (r"\d[\d\.a-z_]*", Number),
        ],
        "typeof": [
            include("whitespace"),
            include("type"),
            (r">", Punctuation, "#pop"),
        ],
        "content": [
            include("whitespace"),
            # Keywords
            (words(("after", "bidirectional", "bind-property", "bind", "default",
                    "destructive", "disabled", "inverted", "no-sync-create",
                    "suggested", "swapped", "sync-create", "template")),
             Keyword),
            # Translated strings
            (r"(C?_)(\s*)(\()",
             bygroups(Name.Function.Builtin, Whitespace, Punctuation),
             "paren-content"),
            # Cast expressions
            (r"(as)(\s*)(<)", bygroups(Keyword, Whitespace, Punctuation), "typeof"),
            # Closures
            (r"(\$?[a-z_][a-z0-9_\-]*)(\s*)(\()",
             bygroups(Name.Function, Whitespace, Punctuation),
             "paren-content"),
            # Objects
            (r"(?:(\$\s*[a-z_][a-z0-9_\-]+)|(?:([a-z_][a-z0-9_\-]*)(\s*)(\.)(\s*))?([a-z_][a-z0-9_\-]*))(?:(\s+)([a-z_][a-z0-9_\-]*))?(\s*)(\{)",
             bygroups(Name.Class, Name.Namespace, Whitespace, Punctuation, Whitespace,
                      Name.Class, Whitespace, Name.Variable, Whitespace, Punctuation),
             "brace-block"),
            # Misc
            include("value"),
            (r",|\.", Punctuation),
        ],
        "block-content": [
            # Import statements
            (r"(using)(\s+)([a-z_][a-z0-9_\-]*)(\s+)(\d[\d\.]*)(;)",
             bygroups(Keyword, Whitespace, Name.Namespace, Whitespace,
                      Name.Namespace, Punctuation)),
            # Menus
            (r"(menu|section|submenu)(?:(\s+)([a-z_][a-z0-9_\-]*))?(\s*)(\{)",
             bygroups(Keyword, Whitespace, Name.Variable, Whitespace, Punctuation),
             "brace-block"),
            (r"(item)(\s*)(\{)",
             bygroups(Keyword, Whitespace, Punctuation),
             "brace-block"),
            (r"(item)(\s*)(\()",
             bygroups(Keyword, Whitespace, Punctuation),
             "paren-block"),
            # Templates
            (r"template", Keyword.Declaration, "template"),
            # Nested blocks. When extensions are added, this is where they go.
            (r"(responses|items|mime-types|patterns|suffixes|marks|widgets|strings|styles)(\s*)(\[)",
             bygroups(Keyword, Whitespace, Punctuation),
             "bracket-block"),
            (r"(accessibility|setters|layout|item)(\s*)(\{)",
             bygroups(Keyword, Whitespace, Punctuation),
             "brace-block"),
            (r"(condition|mark|item)(\s*)(\()",
             bygroups(Keyword, Whitespace, Punctuation),
             "paren-content"),
            (r"\[", Punctuation, "child-type"),
            # Properties and signals
            (r"([a-z_][a-z0-9_\-]*(?:::[a-z0-9_]+)?)(\s*)(:|=>)",
             bygroups(Name.Property, Whitespace, Punctuation),
             "statement"),
            include("content"),
        ],
        "paren-block": [
            include("block-content"),
            (r"\)", Punctuation, "#pop"),
        ],
        "paren-content": [
            include("content"),
            (r"\)", Punctuation, "#pop"),
        ],
        "bracket-block": [
            include("block-content"),
            (r"\]", Punctuation, "#pop"),
        ],
        "brace-block": [
            include("block-content"),
            (r"\}", Punctuation, "#pop"),
        ],
        "statement": [
            include("content"),
            (r";", Punctuation, "#pop"),
        ],
        "child-type": [
            include("whitespace"),
            (r"(action)(\s+)(response)(\s*)(=)(\s*)",
             bygroups(Keyword, Whitespace, Name.Attribute, Whitespace,
                      Punctuation, Whitespace)),
            (words(("default", "internal-child", "response")), Keyword),
            (r"[a-z_][a-z0-9_\-]*", Name.Decorator),
            include("value"),
            (r"=", Punctuation),
            (r"\]", Punctuation, "#pop"),
        ],
        "template": [
            include("whitespace"),
            include("type"),
            (r":", Punctuation),
            (r"\{", Punctuation, ("#pop", "brace-block")),
        ],
    }
