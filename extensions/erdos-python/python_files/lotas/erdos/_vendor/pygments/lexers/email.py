"""
    pygments.lexers.email
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the raw E-mail.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, DelegatingLexer, bygroups
from erdos._vendor.pygments.lexers.mime import MIMELexer
from erdos._vendor.pygments.token import Text, Keyword, Name, String, Number, Comment
from erdos._vendor.pygments.util import get_bool_opt

__all__ = ["EmailLexer"]


class EmailHeaderLexer(RegexLexer):
    """
    Sub-lexer for raw E-mail. This lexer only process header part of e-mail.

    .. versionadded:: 2.5
    """

    def __init__(self, **options):
        super().__init__(**options)
        self.highlight_x = get_bool_opt(options, "highlight-X-header", False)

    def get_x_header_tokens(self, match):
        if self.highlight_x:
            # field
            yield match.start(1), Name.Tag, match.group(1)

            # content
            default_actions = self.get_tokens_unprocessed(
                match.group(2), stack=("root", "header"))
            yield from default_actions
        else:
            # lowlight
            yield match.start(1), Comment.Special, match.group(1)
            yield match.start(2), Comment.Multiline, match.group(2)

    tokens = {
        "root": [
            (r"^(?:[A-WYZ]|X400)[\w\-]*:", Name.Tag, "header"),
            (r"^(X-(?:\w[\w\-]*:))([\s\S]*?\n)(?![ \t])", get_x_header_tokens),
        ],
        "header": [
            # folding
            (r"\n[ \t]", Text.Whitespace),
            (r"\n(?![ \t])", Text.Whitespace, "#pop"),

            # keywords
            (r"\bE?SMTPS?\b", Keyword),
            (r"\b(?:HE|EH)LO\b", Keyword),

            # mailbox
            (r"[\w\.\-\+=]+@[\w\.\-]+", Name.Label),
            (r"<[\w\.\-\+=]+@[\w\.\-]+>", Name.Label),

            # domain
            (r"\b(\w[\w\.-]*\.[\w\.-]*\w[a-zA-Z]+)\b", Name.Function),

            # IPv4
            (r"(?<=\b)(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.){3}(?:25[0"
             r"-5]|2[0-4][0-9]|1?[0-9][0-9]?)(?=\b)",
             Number.Integer),

            # IPv6
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,7}:(?!\b)", Number.Hex),
            (r"(?<=\b):((:[0-9a-fA-F]{1,4}){1,7}|:)(?=\b)", Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}(?=\b)", Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}(?=\b)", Number.Hex),
            (r"(?<=\b)[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})(?=\b)", Number.Hex),
            (r"(?<=\b)fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}(?=\b)", Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}(?=\b)", Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}(?=\b)",
             Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}(?=\b)",
             Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}(?=\b)",
             Number.Hex),
            (r"(?<=\b)::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}"
             r"[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}"
             r"[0-9])(?=\b)",
             Number.Hex),
            (r"(?<=\b)([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9])"
             r"{0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])(?=\b)",
             Number.Hex),

            # Date time
            (r"(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+)?(0[1-9]|[1-2]?[0-9]|3["
             r"01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+("
             r"19[0-9]{2}|[2-9][0-9]{3})\s+(2[0-3]|[0-1][0-9]):([0-5][0-9])"
             r"(?::(60|[0-5][0-9]))?(?:\.\d{1,5})?\s+([-\+][0-9]{2}[0-5][0-"
             r"9]|\(?(?:UTC?|GMT|(?:E|C|M|P)(?:ST|ET|DT)|[A-IK-Z])\)?)",
             Name.Decorator),

            # RFC-2047 encoded string
            (r"(=\?)([\w-]+)(\?)([BbQq])(\?)([\[\w!\"#$%&\'()*+,-./:;<=>@[\\"
             r"\]^_`{|}~]+)(\?=)",
             bygroups(String.Affix, Name.Constant, String.Affix, Keyword.Constant,
                      String.Affix, Number.Hex, String.Affix)),

            # others
            (r'[\s]+', Text.Whitespace),
            (r'[\S]', Text),
        ],
    }


class EmailLexer(DelegatingLexer):
    """
    Lexer for raw E-mail.

    Additional options accepted:

    `highlight-X-header`
        Highlight the fields of ``X-`` user-defined email header. (default:
        ``False``).
    """

    name = "E-mail"
    aliases = ["email", "eml"]
    filenames = ["*.eml"]
    mimetypes = ["message/rfc822"]
    url = "https://en.wikipedia.org/wiki/Email#Message_format"
    version_added = '2.5'

    def __init__(self, **options):
        super().__init__(EmailHeaderLexer, MIMELexer, Comment, **options)
