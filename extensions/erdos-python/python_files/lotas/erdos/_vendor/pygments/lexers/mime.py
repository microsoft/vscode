"""
    pygments.lexers.mime
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for Multipurpose Internet Mail Extensions (MIME) data.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include
from erdos._vendor.pygments.lexers import get_lexer_for_mimetype
from erdos._vendor.pygments.token import Text, Name, String, Operator, Comment, Other
from erdos._vendor.pygments.util import get_int_opt, ClassNotFound

__all__ = ["MIMELexer"]


class MIMELexer(RegexLexer):
    """
    Lexer for Multipurpose Internet Mail Extensions (MIME) data. This lexer is
    designed to process nested multipart data.

    It assumes that the given data contains both header and body (and is
    split at an empty line). If no valid header is found, then the entire data
    will be treated as body.

    Additional options accepted:

    `MIME-max-level`
        Max recursion level for nested MIME structure. Any negative number
        would treated as unlimited. (default: -1)

    `Content-Type`
        Treat the data as a specific content type. Useful when header is
        missing, or this lexer would try to parse from header. (default:
        `text/plain`)

    `Multipart-Boundary`
        Set the default multipart boundary delimiter. This option is only used
        when `Content-Type` is `multipart` and header is missing. This lexer
        would try to parse from header by default. (default: None)

    `Content-Transfer-Encoding`
        Treat the data as a specific encoding. Or this lexer would try to parse
        from header by default. (default: None)
    """

    name = "MIME"
    aliases = ["mime"]
    mimetypes = ["multipart/mixed",
                 "multipart/related",
                 "multipart/alternative"]
    url = 'https://en.wikipedia.org/wiki/MIME'
    version_added = '2.5'

    def __init__(self, **options):
        super().__init__(**options)
        self.boundary = options.get("Multipart-Boundary")
        self.content_transfer_encoding = options.get("Content_Transfer_Encoding")
        self.content_type = options.get("Content_Type", "text/plain")
        self.max_nested_level = get_int_opt(options, "MIME-max-level", -1)

    def get_header_tokens(self, match):
        field = match.group(1)

        if field.lower() in self.attention_headers:
            yield match.start(1), Name.Tag, field + ":"
            yield match.start(2), Text.Whitespace, match.group(2)

            pos = match.end(2)
            body = match.group(3)
            for i, t, v in self.get_tokens_unprocessed(body, ("root", field.lower())):
                yield pos + i, t, v

        else:
            yield match.start(), Comment, match.group()

    def get_body_tokens(self, match):
        pos_body_start = match.start()
        entire_body = match.group()

        # skip first newline
        if entire_body[0] == '\n':
            yield pos_body_start, Text.Whitespace, '\n'
            pos_body_start = pos_body_start + 1
            entire_body = entire_body[1:]

        # if it is not a multipart
        if not self.content_type.startswith("multipart") or not self.boundary:
            for i, t, v in self.get_bodypart_tokens(entire_body):
                yield pos_body_start + i, t, v
            return

        # find boundary
        bdry_pattern = rf"^--{re.escape(self.boundary)}(--)?\n"
        bdry_matcher = re.compile(bdry_pattern, re.MULTILINE)

        # some data has prefix text before first boundary
        m = bdry_matcher.search(entire_body)
        if m:
            pos_part_start = pos_body_start + m.end()
            pos_iter_start = lpos_end = m.end()
            yield pos_body_start, Text, entire_body[:m.start()]
            yield pos_body_start + lpos_end, String.Delimiter, m.group()
        else:
            pos_part_start = pos_body_start
            pos_iter_start = 0

        # process tokens of each body part
        for m in bdry_matcher.finditer(entire_body, pos_iter_start):
            # bodypart
            lpos_start = pos_part_start - pos_body_start
            lpos_end = m.start()
            part = entire_body[lpos_start:lpos_end]
            for i, t, v in self.get_bodypart_tokens(part):
                yield pos_part_start + i, t, v

            # boundary
            yield pos_body_start + lpos_end, String.Delimiter, m.group()
            pos_part_start = pos_body_start + m.end()

        # some data has suffix text after last boundary
        lpos_start = pos_part_start - pos_body_start
        if lpos_start != len(entire_body):
            yield pos_part_start, Text, entire_body[lpos_start:]

    def get_bodypart_tokens(self, text):
        # return if:
        #  * no content
        #  * no content type specific
        #  * content encoding is not readable
        #  * max recurrsion exceed
        if not text.strip() or not self.content_type:
            return [(0, Other, text)]

        cte = self.content_transfer_encoding
        if cte and cte not in {"8bit", "7bit", "quoted-printable"}:
            return [(0, Other, text)]

        if self.max_nested_level == 0:
            return [(0, Other, text)]

        # get lexer
        try:
            lexer = get_lexer_for_mimetype(self.content_type)
        except ClassNotFound:
            return [(0, Other, text)]

        if isinstance(lexer, type(self)):
            lexer.max_nested_level = self.max_nested_level - 1

        return lexer.get_tokens_unprocessed(text)

    def store_content_type(self, match):
        self.content_type = match.group(1)

        prefix_len = match.start(1) - match.start(0)
        yield match.start(0), Text.Whitespace, match.group(0)[:prefix_len]
        yield match.start(1), Name.Label, match.group(2)
        yield match.end(2), String.Delimiter, '/'
        yield match.start(3), Name.Label, match.group(3)

    def get_content_type_subtokens(self, match):
        yield match.start(1), Text, match.group(1)
        yield match.start(2), Text.Whitespace, match.group(2)
        yield match.start(3), Name.Attribute, match.group(3)
        yield match.start(4), Operator, match.group(4)
        yield match.start(5), String, match.group(5)

        if match.group(3).lower() == "boundary":
            boundary = match.group(5).strip()
            if boundary[0] == '"' and boundary[-1] == '"':
                boundary = boundary[1:-1]
            self.boundary = boundary

    def store_content_transfer_encoding(self, match):
        self.content_transfer_encoding = match.group(0).lower()
        yield match.start(0), Name.Constant, match.group(0)

    attention_headers = {"content-type", "content-transfer-encoding"}

    tokens = {
        "root": [
            (r"^([\w-]+):( *)([\s\S]*?\n)(?![ \t])", get_header_tokens),
            (r"^$[\s\S]+", get_body_tokens),
        ],
        "header": [
            # folding
            (r"\n[ \t]", Text.Whitespace),
            (r"\n(?![ \t])", Text.Whitespace, "#pop"),
        ],
        "content-type": [
            include("header"),
            (
                r"^\s*((multipart|application|audio|font|image|model|text|video"
                r"|message)/([\w-]+))",
                store_content_type,
            ),
            (r'(;)((?:[ \t]|\n[ \t])*)([\w:-]+)(=)([\s\S]*?)(?=;|\n(?![ \t]))',
             get_content_type_subtokens),
            (r';[ \t]*\n(?![ \t])', Text, '#pop'),
        ],
        "content-transfer-encoding": [
            include("header"),
            (r"([\w-]+)", store_content_transfer_encoding),
        ],
    }
