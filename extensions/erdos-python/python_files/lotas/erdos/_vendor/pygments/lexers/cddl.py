"""
    pygments.lexers.cddl
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the Concise data definition language (CDDL), a notational
    convention to express CBOR and JSON data structures.

    More information:
    https://datatracker.ietf.org/doc/rfc8610/

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, words
from lotas.erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, Operator, \
    Punctuation, String, Whitespace

__all__ = ['CddlLexer']


class CddlLexer(RegexLexer):
    """
    Lexer for CDDL definitions.
    """
    name = "CDDL"
    url = 'https://datatracker.ietf.org/doc/rfc8610/'
    aliases = ["cddl"]
    filenames = ["*.cddl"]
    mimetypes = ["text/x-cddl"]
    version_added = '2.8'

    _prelude_types = [
        "any",
        "b64legacy",
        "b64url",
        "bigfloat",
        "bigint",
        "bignint",
        "biguint",
        "bool",
        "bstr",
        "bytes",
        "cbor-any",
        "decfrac",
        "eb16",
        "eb64legacy",
        "eb64url",
        "encoded-cbor",
        "false",
        "float",
        "float16",
        "float16-32",
        "float32",
        "float32-64",
        "float64",
        "int",
        "integer",
        "mime-message",
        "nil",
        "nint",
        "null",
        "number",
        "regexp",
        "tdate",
        "text",
        "time",
        "true",
        "tstr",
        "uint",
        "undefined",
        "unsigned",
        "uri",
    ]

    _controls = [
        ".and",
        ".bits",
        ".cbor",
        ".cborseq",
        ".default",
        ".eq",
        ".ge",
        ".gt",
        ".le",
        ".lt",
        ".ne",
        ".regexp",
        ".size",
        ".within",
    ]

    _re_id = (
        r"[$@A-Z_a-z]"
        r"(?:[\-\.]+(?=[$@0-9A-Z_a-z])|[$@0-9A-Z_a-z])*"

    )

    # While the spec reads more like "an int must not start with 0" we use a
    # lookahead here that says "after a 0 there must be no digit". This makes the
    # '0' the invalid character in '01', which looks nicer when highlighted.
    _re_uint = r"(?:0b[01]+|0x[0-9a-fA-F]+|[1-9]\d*|0(?!\d))"
    _re_int = r"-?" + _re_uint

    tokens = {
        "commentsandwhitespace": [(r"\s+", Whitespace), (r";.+$", Comment.Single)],
        "root": [
            include("commentsandwhitespace"),
            # tag types
            (rf"#(\d\.{_re_uint})?", Keyword.Type),  # type or any
            # occurrence
            (
                rf"({_re_uint})?(\*)({_re_uint})?",
                bygroups(Number, Operator, Number),
            ),
            (r"\?|\+", Operator),  # occurrence
            (r"\^", Operator),  # cuts
            (r"(\.\.\.|\.\.)", Operator),  # rangeop
            (words(_controls, suffix=r"\b"), Operator.Word),  # ctlops
            # into choice op
            (rf"&(?=\s*({_re_id}|\())", Operator),
            (rf"~(?=\s*{_re_id})", Operator),  # unwrap op
            (r"//|/(?!/)", Operator),  # double und single slash
            (r"=>|/==|/=|=", Operator),
            (r"[\[\]{}\(\),<>:]", Punctuation),
            # Bytestrings
            (r"(b64)(')", bygroups(String.Affix, String.Single), "bstrb64url"),
            (r"(h)(')", bygroups(String.Affix, String.Single), "bstrh"),
            (r"'", String.Single, "bstr"),
            # Barewords as member keys (must be matched before values, types, typenames,
            # groupnames).
            # Token type is String as barewords are always interpreted as such.
            (rf"({_re_id})(\s*)(:)",
             bygroups(String, Whitespace, Punctuation)),
            # predefined types
            (words(_prelude_types, prefix=r"(?![\-_$@])\b", suffix=r"\b(?![\-_$@])"),
             Name.Builtin),
            # user-defined groupnames, typenames
            (_re_id, Name.Class),
            # values
            (r"0b[01]+", Number.Bin),
            (r"0o[0-7]+", Number.Oct),
            (r"0x[0-9a-fA-F]+(\.[0-9a-fA-F]+)?p[+-]?\d+", Number.Hex),  # hexfloat
            (r"0x[0-9a-fA-F]+", Number.Hex),  # hex
            # Float
            (rf"{_re_int}(?=(\.\d|e[+-]?\d))(?:\.\d+)?(?:e[+-]?\d+)?",
             Number.Float),
            # Int
            (_re_int, Number.Integer),
            (r'"(\\\\|\\"|[^"])*"', String.Double),
        ],
        "bstrb64url": [
            (r"'", String.Single, "#pop"),
            include("commentsandwhitespace"),
            (r"\\.", String.Escape),
            (r"[0-9a-zA-Z\-_=]+", String.Single),
            (r".", Error),
            # (r";.+$", Token.Other),
        ],
        "bstrh": [
            (r"'", String.Single, "#pop"),
            include("commentsandwhitespace"),
            (r"\\.", String.Escape),
            (r"[0-9a-fA-F]+", String.Single),
            (r".", Error),
        ],
        "bstr": [
            (r"'", String.Single, "#pop"),
            (r"\\.", String.Escape),
            (r"[^'\\]+", String.Single),
        ],
    }
