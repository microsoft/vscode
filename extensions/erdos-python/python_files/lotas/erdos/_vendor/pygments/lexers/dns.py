"""
    pygments.lexers.dns
    ~~~~~~~~~~~~~~~~~~~

    Pygments lexers for DNS

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace, Literal
from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, include

__all__ = ['DnsZoneLexer']


CLASSES = [
    "IN",
    "CS",
    "CH",
    "HS",
]

CLASSES_RE = "(" + "|".join(CLASSES) + ')'


class DnsZoneLexer(RegexLexer):

    """
    Lexer for DNS zone file
    """

    flags = re.MULTILINE

    name = 'Zone'
    aliases = ['zone']
    filenames = [ "*.zone" ]
    url = "https://datatracker.ietf.org/doc/html/rfc1035"
    mimetypes = ['text/dns']
    version_added = '2.16'

    tokens = {
       'root': [
            # Empty/comment line:
            (r'([ \t]*)(;.*)(\n)', bygroups(Whitespace, Comment.Single, Whitespace)),
            # Special directives:
            (r'^\$ORIGIN\b', Keyword, 'values'),
            (r'^\$TTL\b', Keyword, 'values'),
            (r'^\$INCLUDE\b', Comment.Preproc, 'include'),
            # TODO, $GENERATE https://bind9.readthedocs.io/en/v9.18.14/chapter3.html#soa-rr
            (r'^\$[A-Z]+\b', Keyword, 'values'),
            # Records:
            # <domain-name> [<TTL>] [<class>] <type> <RDATA> [<comment>]
            (r'^(@)([ \t]+)(?:([0-9]+[smhdw]?)([ \t]+))?(?:' + CLASSES_RE + "([ \t]+))?([A-Z]+)([ \t]+)", 
                bygroups(Operator, Whitespace, Number.Integer, Whitespace, Name.Class, Whitespace, Keyword.Type, Whitespace),
                "values"),
            (r'^([^ \t\n]*)([ \t]+)(?:([0-9]+[smhdw]?)([ \t]+))?(?:' + CLASSES_RE + "([ \t]+))?([A-Z]+)([ \t]+)", 
                bygroups(Name, Whitespace, Number.Integer, Whitespace, Name.Class, Whitespace, Keyword.Type, Whitespace),
                "values"),
            # <domain-name> [<class>] [<TTL>] <type> <RDATA> [<comment>]
            (r'^(Operator)([ \t]+)(?:' + CLASSES_RE + "([ \t]+))?(?:([0-9]+[smhdw]?)([ \t]+))?([A-Z]+)([ \t]+)", 
                bygroups(Name, Whitespace, Number.Integer, Whitespace, Name.Class, Whitespace, Keyword.Type, Whitespace),
                "values"),
            (r'^([^ \t\n]*)([ \t]+)(?:' + CLASSES_RE + "([ \t]+))?(?:([0-9]+[smhdw]?)([ \t]+))?([A-Z]+)([ \t]+)", 
                bygroups(Name, Whitespace, Number.Integer, Whitespace, Name.Class, Whitespace, Keyword.Type, Whitespace),
                "values"),
        ],
        # Parsing values:
        'values': [
            (r'\n', Whitespace, "#pop"),
            (r'\(', Punctuation, 'nested'),
            include('simple-value'),
        ],
        # Parsing nested values (...):
        'nested': [
            (r'\)', Punctuation, "#pop"),
            include('multiple-simple-values'),
        ],
        # Parsing values:
        'simple-value': [
            (r'(;.*)', bygroups(Comment.Single)),
            (r'[ \t]+', Whitespace),
            (r"@\b", Operator),
            ('"', String, 'string'),
            (r'[0-9]+[smhdw]?$', Number.Integer),
            (r'([0-9]+[smhdw]?)([ \t]+)', bygroups(Number.Integer, Whitespace)),
            (r'\S+', Literal),
        ],
        'multiple-simple-values': [
            include('simple-value'),
            (r'[\n]+', Whitespace),
        ],
        'include': [
            (r'([ \t]+)([^ \t\n]+)([ \t]+)([-\._a-zA-Z]+)([ \t]+)(;.*)?$',
             bygroups(Whitespace, Comment.PreprocFile, Whitespace, Name, Whitespace, Comment.Single), '#pop'),
            (r'([ \t]+)([^ \t\n]+)([ \t\n]+)$', bygroups(Whitespace, Comment.PreprocFile, Whitespace), '#pop'),
        ],
        "string": [
            (r'\\"', String),
            (r'"', String, "#pop"),
            (r'[^"]+', String),
        ]
    }

    def analyse_text(text):
        return text.startswith("$ORIGIN")
