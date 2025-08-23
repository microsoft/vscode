"""
    pygments.lexers.sgf
    ~~~~~~~~~~~~~~~~~~~

    Lexer for Smart Game Format (sgf) file format.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos.erdos._vendor.pygments.token import Name, Literal, String, Punctuation, Whitespace

__all__ = ["SmartGameFormatLexer"]


class SmartGameFormatLexer(RegexLexer):
    """
    Lexer for Smart Game Format (sgf) file format.

    The format is used to store game records of board games for two players
    (mainly Go game).
    """
    name = 'SmartGameFormat'
    url = 'https://www.red-bean.com/sgf/'
    aliases = ['sgf']
    filenames = ['*.sgf']
    version_added = '2.4'

    tokens = {
        'root': [
            (r'[():;]+', Punctuation),
            # tokens:
            (r'(A[BW]|AE|AN|AP|AR|AS|[BW]L|BM|[BW]R|[BW]S|[BW]T|CA|CH|CP|CR|'
             r'DD|DM|DO|DT|EL|EV|EX|FF|FG|G[BW]|GC|GM|GN|HA|HO|ID|IP|IT|IY|KM|'
             r'KO|LB|LN|LT|L|MA|MN|M|N|OB|OM|ON|OP|OT|OV|P[BW]|PC|PL|PM|RE|RG|'
             r'RO|RU|SO|SC|SE|SI|SL|SO|SQ|ST|SU|SZ|T[BW]|TC|TE|TM|TR|UC|US|VW|'
             r'V|[BW]|C)',
             Name.Builtin),
            # number:
            (r'(\[)([0-9.]+)(\])',
             bygroups(Punctuation, Literal.Number, Punctuation)),
            # date:
            (r'(\[)([0-9]{4}-[0-9]{2}-[0-9]{2})(\])',
             bygroups(Punctuation, Literal.Date, Punctuation)),
            # point:
            (r'(\[)([a-z]{2})(\])',
             bygroups(Punctuation, String, Punctuation)),
            # double points:
            (r'(\[)([a-z]{2})(:)([a-z]{2})(\])',
             bygroups(Punctuation, String, Punctuation, String, Punctuation)),

            (r'(\[)([\w\s#()+,\-.:?]+)(\])',
             bygroups(Punctuation, String, Punctuation)),
            (r'(\[)(\s.*)(\])',
             bygroups(Punctuation, Whitespace, Punctuation)),
            (r'\s+', Whitespace)
        ],
    }
