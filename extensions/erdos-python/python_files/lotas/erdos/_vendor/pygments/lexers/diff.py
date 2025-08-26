"""
    pygments.lexers.diff
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for diff/patch formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, Generic, \
    Literal, Whitespace

__all__ = ['DiffLexer', 'DarcsPatchLexer', 'WDiffLexer']


class DiffLexer(RegexLexer):
    """
    Lexer for unified or context-style diffs or patches.
    """

    name = 'Diff'
    aliases = ['diff', 'udiff']
    filenames = ['*.diff', '*.patch']
    mimetypes = ['text/x-diff', 'text/x-patch']
    url = 'https://en.wikipedia.org/wiki/Diff'
    version_added = ''

    tokens = {
        'root': [
            (r'( )(.*)(\n)', bygroups(Whitespace, Text, Whitespace)),
            (r'(!.*|---)(\n)', bygroups(Generic.Strong, Whitespace)),
            (r'((?:< |-).*)(\n)', bygroups(Generic.Deleted, Whitespace)),
            (r'((?:> |\+).*)(\n)', bygroups(Generic.Inserted, Whitespace)),
            (
                r'(@.*|\d(?:,\d+)?(?:a|c|d)\d+(?:,\d+)?)(\n)',
                bygroups(Generic.Subheading, Whitespace),
            ),
            (r'((?:[Ii]ndex|diff).*)(\n)', bygroups(Generic.Heading, Whitespace)),
            (r'(=.*)(\n)', bygroups(Generic.Heading, Whitespace)),
            (r'(.*)(\n)', bygroups(Text, Whitespace)),
        ]
    }

    def analyse_text(text):
        if text[:7] == 'Index: ':
            return True
        if text[:5] == 'diff ':
            return True
        if text[:4] == '--- ':
            return 0.9


class DarcsPatchLexer(RegexLexer):
    """
    DarcsPatchLexer is a lexer for the various versions of the darcs patch
    format.  Examples of this format are derived by commands such as
    ``darcs annotate --patch`` and ``darcs send``.
    """

    name = 'Darcs Patch'
    aliases = ['dpatch']
    filenames = ['*.dpatch', '*.darcspatch']
    url = 'https://darcs.net'
    version_added = '0.10'

    DPATCH_KEYWORDS = ('hunk', 'addfile', 'adddir', 'rmfile', 'rmdir', 'move',
                       'replace')

    tokens = {
        'root': [
            (r'<', Operator),
            (r'>', Operator),
            (r'\{', Operator),
            (r'\}', Operator),
            (r'(\[)((?:TAG )?)(.*)(\n)(.*)(\*\*)(\d+)(\s?)(\])',
             bygroups(Operator, Keyword, Name, Whitespace, Name, Operator,
                      Literal.Date, Whitespace, Operator)),
            (r'(\[)((?:TAG )?)(.*)(\n)(.*)(\*\*)(\d+)(\s?)',
             bygroups(Operator, Keyword, Name, Whitespace, Name, Operator,
                      Literal.Date, Whitespace), 'comment'),
            (r'New patches:', Generic.Heading),
            (r'Context:', Generic.Heading),
            (r'Patch bundle hash:', Generic.Heading),
            (r'(\s*)({})(.*)(\n)'.format('|'.join(DPATCH_KEYWORDS)),
                bygroups(Whitespace, Keyword, Text, Whitespace)),
            (r'\+', Generic.Inserted, "insert"),
            (r'-', Generic.Deleted, "delete"),
            (r'(.*)(\n)', bygroups(Text, Whitespace)),
        ],
        'comment': [
            (r'[^\]].*\n', Comment),
            (r'\]', Operator, "#pop"),
        ],
        'specialText': [            # darcs add [_CODE_] special operators for clarity
            (r'\n', Whitespace, "#pop"),  # line-based
            (r'\[_[^_]*_]', Operator),
        ],
        'insert': [
            include('specialText'),
            (r'\[', Generic.Inserted),
            (r'[^\n\[]+', Generic.Inserted),
        ],
        'delete': [
            include('specialText'),
            (r'\[', Generic.Deleted),
            (r'[^\n\[]+', Generic.Deleted),
        ],
    }


class WDiffLexer(RegexLexer):
    """
    A wdiff lexer.

    Note that:

    * It only works with normal output (without options like ``-l``).
    * If the target files contain "[-", "-]", "{+", or "+}",
      especially they are unbalanced, the lexer will get confused.
    """

    name = 'WDiff'
    url = 'https://www.gnu.org/software/wdiff/'
    aliases = ['wdiff']
    filenames = ['*.wdiff']
    mimetypes = []
    version_added = '2.2'

    flags = re.MULTILINE | re.DOTALL

    # We can only assume "[-" after "[-" before "-]" is `nested`,
    # for instance wdiff to wdiff outputs. We have no way to
    # distinct these marker is of wdiff output from original text.

    ins_op = r"\{\+"
    ins_cl = r"\+\}"
    del_op = r"\[\-"
    del_cl = r"\-\]"
    normal = r'[^{}[\]+-]+'  # for performance
    tokens = {
        'root': [
            (ins_op, Generic.Inserted, 'inserted'),
            (del_op, Generic.Deleted, 'deleted'),
            (normal, Text),
            (r'.', Text),
        ],
        'inserted': [
            (ins_op, Generic.Inserted, '#push'),
            (del_op, Generic.Inserted, '#push'),
            (del_cl, Generic.Inserted, '#pop'),

            (ins_cl, Generic.Inserted, '#pop'),
            (normal, Generic.Inserted),
            (r'.', Generic.Inserted),
        ],
        'deleted': [
            (del_op, Generic.Deleted, '#push'),
            (ins_op, Generic.Deleted, '#push'),
            (ins_cl, Generic.Deleted, '#pop'),

            (del_cl, Generic.Deleted, '#pop'),
            (normal, Generic.Deleted),
            (r'.', Generic.Deleted),
        ],
    }
