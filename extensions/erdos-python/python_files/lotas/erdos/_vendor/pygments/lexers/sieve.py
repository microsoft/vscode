"""
    pygments.lexers.sieve
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Sieve file format.

    https://tools.ietf.org/html/rfc5228
    https://tools.ietf.org/html/rfc5173
    https://tools.ietf.org/html/rfc5229
    https://tools.ietf.org/html/rfc5230
    https://tools.ietf.org/html/rfc5232
    https://tools.ietf.org/html/rfc5235
    https://tools.ietf.org/html/rfc5429
    https://tools.ietf.org/html/rfc8580

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from lotas.erdos._vendor.pygments.token import Comment, Name, Literal, String, Text, Punctuation, \
    Keyword

__all__ = ["SieveLexer"]


class SieveLexer(RegexLexer):
    """
    Lexer for sieve format.
    """
    name = 'Sieve'
    filenames = ['*.siv', '*.sieve']
    aliases = ['sieve']
    url = 'https://en.wikipedia.org/wiki/Sieve_(mail_filtering_language)'
    version_added = '2.6'

    tokens = {
        'root': [
            (r'\s+', Text),
            (r'[();,{}\[\]]', Punctuation),
            # import:
            (r'(?i)require',
             Keyword.Namespace),
            # tags:
            (r'(?i)(:)(addresses|all|contains|content|create|copy|comparator|'
             r'count|days|detail|domain|fcc|flags|from|handle|importance|is|'
             r'localpart|length|lowerfirst|lower|matches|message|mime|options|'
             r'over|percent|quotewildcard|raw|regex|specialuse|subject|text|'
             r'under|upperfirst|upper|value)',
             bygroups(Name.Tag, Name.Tag)),
            # tokens:
            (r'(?i)(address|addflag|allof|anyof|body|discard|elsif|else|envelope|'
             r'ereject|exists|false|fileinto|if|hasflag|header|keep|'
             r'notify_method_capability|notify|not|redirect|reject|removeflag|'
             r'setflag|size|spamtest|stop|string|true|vacation|virustest)',
             Name.Builtin),
            (r'(?i)set',
             Keyword.Declaration),
            # number:
            (r'([0-9.]+)([kmgKMG])?',
             bygroups(Literal.Number, Literal.Number)),
            # comment:
            (r'#.*$',
             Comment.Single),
            (r'/\*.*\*/',
             Comment.Multiline),
            # string:
            (r'"[^"]*?"',
             String),
            # text block:
            (r'text:',
             Name.Tag, 'text'),
        ],
        'text': [
            (r'[^.].*?\n', String),
            (r'^\.', Punctuation, "#pop"),
        ]
    }
