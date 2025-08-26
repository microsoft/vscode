"""
    pygments.lexers.scdoc
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for scdoc, a simple man page generator.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, this
from lotas.erdos._vendor.pygments.token import Text, Comment, Keyword, String, Generic

__all__ = ['ScdocLexer']


class ScdocLexer(RegexLexer):
    """
    `scdoc` is a simple man page generator for POSIX systems written in C99.
    """
    name = 'scdoc'
    url = 'https://git.sr.ht/~sircmpwn/scdoc'
    aliases = ['scdoc', 'scd']
    filenames = ['*.scd', '*.scdoc']
    version_added = '2.5'
    flags = re.MULTILINE

    tokens = {
        'root': [
            # comment
            (r'^(;.+\n)', bygroups(Comment)),

            # heading with pound prefix
            (r'^(#)([^#].+\n)', bygroups(Generic.Heading, Text)),
            (r'^(#{2})(.+\n)', bygroups(Generic.Subheading, Text)),
            # bulleted lists
            (r'^(\s*)([*-])(\s)(.+\n)',
            bygroups(Text, Keyword, Text, using(this, state='inline'))),
            # numbered lists
            (r'^(\s*)(\.+\.)( .+\n)',
            bygroups(Text, Keyword, using(this, state='inline'))),
            # quote
            (r'^(\s*>\s)(.+\n)', bygroups(Keyword, Generic.Emph)),
            # text block
            (r'^(```\n)([\w\W]*?)(^```$)', bygroups(String, Text, String)),

            include('inline'),
        ],
        'inline': [
            # escape
            (r'\\.', Text),
            # underlines
            (r'(\s)(_[^_]+_)(\W|\n)', bygroups(Text, Generic.Emph, Text)),
            # bold
            (r'(\s)(\*[^*]+\*)(\W|\n)', bygroups(Text, Generic.Strong, Text)),
            # inline code
            (r'`[^`]+`', String.Backtick),

            # general text, must come last!
            (r'[^\\\s]+', Text),
            (r'.', Text),
        ],
    }

    def analyse_text(text):
        """We checks for bold and underline text with * and _. Also
        every scdoc file must start with a strictly defined first line."""
        result = 0

        if '*' in text:
            result += 0.01

        if '_' in text:
            result += 0.01

        # name(section) ["left_footer" ["center_header"]]
        first_line = text.partition('\n')[0]
        scdoc_preamble_pattern = r'^.*\([1-7]\)( "[^"]+"){0,2}$'

        if re.search(scdoc_preamble_pattern, first_line):
            result += 0.5

        return result
