"""
    pygments.lexers.ul4
    ~~~~~~~~~~~~~~~~~~~

    Lexer for the UL4 templating language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, DelegatingLexer, bygroups, words, include
from erdos.erdos._vendor.pygments.token import Comment, Text, Keyword, String, Number, Literal, \
    Name, Other, Operator
from erdos.erdos._vendor.pygments.lexers.web import HtmlLexer, XmlLexer, CssLexer, JavascriptLexer
from erdos.erdos._vendor.pygments.lexers.python import PythonLexer

__all__ = ['UL4Lexer', 'HTMLUL4Lexer', 'XMLUL4Lexer', 'CSSUL4Lexer',
           'JavascriptUL4Lexer', 'PythonUL4Lexer']


class UL4Lexer(RegexLexer):
    """
    Generic lexer for UL4.
    """

    flags = re.MULTILINE | re.DOTALL

    name = 'UL4'
    aliases = ['ul4']
    filenames = ['*.ul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = '2.12'

    tokens = {
        "root": [
            (
                # Template header without name:
                # ``<?ul4?>``
                r"(<\?)(\s*)(ul4)(\s*)(\?>)",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword,
                         Text.Whitespace, Comment.Preproc),
            ),
            (
                # Template header with name (potentially followed by the signature):
                # ``<?ul4 foo(bar=42)?>``
                r"(<\?)(\s*)(ul4)(\s*)([a-zA-Z_][a-zA-Z_0-9]*)?",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword,
                         Text.Whitespace, Name.Function),
                "ul4", # Switch to "expression" mode
            ),
            (
                # Comment:
                # ``<?note?>...<?end note?>``
                r"<\?\s*note\s*\?>",
                Comment,
                "note", # Switch to "note" mode
            ),
            (
                # Comment:
                # ``<?note foobar?>``
                r"<\?\s*note\s.*?\?>",
                Comment,
            ),
            (
                # Template documentation:
                # ``<?doc?>...<?end doc?>``
                r"<\?\s*doc\s*\?>",
                String.Doc,
                "doc",
            ),
            (
                # Template documentation:
                # ``<?doc foobar?>``
                r"<\?\s*doc\s.*?\?>",
                String.Doc,
            ),
            (
                # ``<?ignore?>`` tag for commenting out code:
                # ``<?ignore?>...<?end ignore?>``
                r"<\?\s*ignore\s*\?>",
                Comment,
                "ignore", # Switch to "ignore" mode
            ),
            (
                # ``<?def?>`` tag for defining local templates
                # ``<?def foo(bar=42)?>...<?end def?>``
                r"(<\?)(\s*)(def)(\s*)([a-zA-Z_][a-zA-Z_0-9]*)?",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword,
                         Text.Whitespace, Name.Function),
                "ul4", # Switch to "expression" mode
            ),
            (
                # The rest of the supported tags
                r"(<\?)(\s*)(printx|print|for|if|elif|else|while|code|renderblocks?|render)\b",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword),
                "ul4", # Switch to "expression" mode
            ),
            (
                # ``<?end?>`` tag for ending ``<?def?>``, ``<?for?>``,
                # ``<?if?>``, ``<?while?>``, ``<?renderblock?>`` and
                # ``<?renderblocks?>`` blocks.
                r"(<\?)(\s*)(end)\b",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword),
                "end", # Switch to "end tag" mode
            ),
            (
                # ``<?whitespace?>`` tag for configuring whitespace handlng
                r"(<\?)(\s*)(whitespace)\b",
                bygroups(Comment.Preproc, Text.Whitespace, Keyword),
                "whitespace", # Switch to "whitespace" mode
            ),
            # Plain text
            (r"[^<]+", Other),
            (r"<", Other),
        ],
        # Ignore mode ignores everything upto the matching ``<?end ignore?>`` tag
        "ignore": [
            # Nested ``<?ignore?>`` tag
            (r"<\?\s*ignore\s*\?>", Comment, "#push"),
            # ``<?end ignore?>`` tag
            (r"<\?\s*end\s+ignore\s*\?>", Comment, "#pop"),
            # Everything else
            (r"[^<]+", Comment),
            (r".", Comment),
        ],
        # Note mode ignores everything upto the matching ``<?end note?>`` tag
        "note": [
            # Nested ``<?note?>`` tag
            (r"<\?\s*note\s*\?>", Comment, "#push"),
            # ``<?end note?>`` tag
            (r"<\?\s*end\s+note\s*\?>", Comment, "#pop"),
            # Everything else
            (r"[^<]+", Comment),
            (r".", Comment),
        ],
        # Doc mode ignores everything upto the matching ``<?end doc?>`` tag
        "doc": [
            # Nested ``<?doc?>`` tag
            (r"<\?\s*doc\s*\?>", String.Doc, "#push"),
            # ``<?end doc?>`` tag
            (r"<\?\s*end\s+doc\s*\?>", String.Doc, "#pop"),
            # Everything else
            (r"[^<]+", String.Doc),
            (r".", String.Doc),
        ],
        # UL4 expressions
        "ul4": [
            # End the tag
            (r"\?>", Comment.Preproc, "#pop"),
            # Start triple quoted string constant
            ("'''", String, "string13"),
            ('"""', String, "string23"),
            # Start single quoted string constant
            ("'", String, "string1"),
            ('"', String, "string2"),
            # Floating point number
            (r"\d+\.\d*([eE][+-]?\d+)?", Number.Float),
            (r"\.\d+([eE][+-]?\d+)?", Number.Float),
            (r"\d+[eE][+-]?\d+", Number.Float),
            # Binary integer: ``0b101010``
            (r"0[bB][01]+", Number.Bin),
            # Octal integer: ``0o52``
            (r"0[oO][0-7]+", Number.Oct),
            # Hexadecimal integer: ``0x2a``
            (r"0[xX][0-9a-fA-F]+", Number.Hex),
            # Date or datetime: ``@(2000-02-29)``/``@(2000-02-29T12:34:56.987654)``
            (r"@\(\d\d\d\d-\d\d-\d\d(T(\d\d:\d\d(:\d\d(\.\d{6})?)?)?)?\)", Literal.Date),
            # Color: ``#fff``, ``#fff8f0`` etc.
            (r"#[0-9a-fA-F]{8}", Literal.Color),
            (r"#[0-9a-fA-F]{6}", Literal.Color),
            (r"#[0-9a-fA-F]{3,4}", Literal.Color),
            # Decimal integer: ``42``
            (r"\d+", Number.Integer),
            # Operators
            (r"//|==|!=|>=|<=|<<|>>|\+=|-=|\*=|/=|//=|<<=|>>=|&=|\|=|^=|=|[\[\]{},:*/().~%&|<>^+-]", Operator),
            # Keywords
            (words(("for", "in", "if", "else", "not", "is", "and", "or"), suffix=r"\b"), Keyword),
            # Builtin constants
            (words(("None", "False", "True"), suffix=r"\b"), Keyword.Constant),
            # Variable names
            (r"[a-zA-Z_][a-zA-Z0-9_]*", Name),
            # Whitespace
            (r"\s+", Text.Whitespace),
        ],
        # ``<?end ...?>`` tag for closing the last open block
        "end": [
            (r"\?>", Comment.Preproc, "#pop"),
            (words(("for", "if", "def", "while", "renderblock", "renderblocks"), suffix=r"\b"), Keyword),
            (r"\s+", Text),
        ],
        # Content of the ``<?whitespace ...?>`` tag:
        # ``keep``, ``strip`` or ``smart``
        "whitespace": [
            (r"\?>", Comment.Preproc, "#pop"),
            (words(("keep", "strip", "smart"), suffix=r"\b"), Comment.Preproc),
            (r"\s+", Text.Whitespace),
        ],
        # Inside a string constant
        "stringescapes": [
            (r"""\\[\\'"abtnfr]""", String.Escape),
            (r"\\x[0-9a-fA-F]{2}", String.Escape),
            (r"\\u[0-9a-fA-F]{4}", String.Escape),
            (r"\\U[0-9a-fA-F]{8}", String.Escape),
        ],
        # Inside a triple quoted string started with ``'''``
        "string13": [
            (r"'''", String, "#pop"),
            include("stringescapes"),
            (r"[^\\']+", String),
            (r'.', String),
        ],
        # Inside a triple quoted string started with ``"""``
        "string23": [
            (r'"""', String, "#pop"),
            include("stringescapes"),
            (r'[^\\"]+', String),
            (r'.', String),
        ],
        # Inside a single quoted string started with ``'``
        "string1": [
            (r"'", String, "#pop"),
            include("stringescapes"),
            (r"[^\\']+", String),
            (r'.', String),
        ],
        # Inside a single quoted string started with ``"``
        "string2": [
            (r'"', String, "#pop"),
            include("stringescapes"),
            (r'[^\\"]+', String),
            (r'.', String),
        ],
    }

class HTMLUL4Lexer(DelegatingLexer):
    """
    Lexer for UL4 embedded in HTML.
    """

    name = 'HTML+UL4'
    aliases = ['html+ul4']
    filenames = ['*.htmlul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = ''

    def __init__(self, **options):
        super().__init__(HtmlLexer, UL4Lexer, **options)


class XMLUL4Lexer(DelegatingLexer):
    """
    Lexer for UL4 embedded in XML.
    """

    name = 'XML+UL4'
    aliases = ['xml+ul4']
    filenames = ['*.xmlul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = ''

    def __init__(self, **options):
        super().__init__(XmlLexer, UL4Lexer, **options)


class CSSUL4Lexer(DelegatingLexer):
    """
    Lexer for UL4 embedded in CSS.
    """

    name = 'CSS+UL4'
    aliases = ['css+ul4']
    filenames = ['*.cssul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = ''

    def __init__(self, **options):
        super().__init__(CssLexer, UL4Lexer, **options)


class JavascriptUL4Lexer(DelegatingLexer):
    """
    Lexer for UL4 embedded in Javascript.
    """

    name = 'Javascript+UL4'
    aliases = ['js+ul4']
    filenames = ['*.jsul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = ''

    def __init__(self, **options):
        super().__init__(JavascriptLexer, UL4Lexer, **options)


class PythonUL4Lexer(DelegatingLexer):
    """
    Lexer for UL4 embedded in Python.
    """

    name = 'Python+UL4'
    aliases = ['py+ul4']
    filenames = ['*.pyul4']
    url = 'https://python.livinglogic.de/UL4.html'
    version_added = ''

    def __init__(self, **options):
        super().__init__(PythonLexer, UL4Lexer, **options)
