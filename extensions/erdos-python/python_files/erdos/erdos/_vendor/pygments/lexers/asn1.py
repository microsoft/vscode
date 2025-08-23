"""
    pygments.lexers.asn1
    ~~~~~~~~~~~~~~~~~~~~

    Pygments lexers for ASN.1.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.token import  Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace
from erdos.erdos._vendor.pygments.lexer import RegexLexer, words, bygroups

__all__ = ['Asn1Lexer']

SINGLE_WORD_KEYWORDS = [
    "ENCODED",
    "ABSTRACT-SYNTAX",
    "END",
    "APPLICATION",
    "EXPLICIT",
    "IMPLICIT",
    "AUTOMATIC",
    "TAGS",
    "BEGIN",
    "EXTENSIBILITY",
    "BY",
    "FROM",
    "COMPONENT",
    "UNIVERSAL",
    "COMPONENTS",
    "CONSTRAINED",
    "IMPLIED",
    "DEFINITIONS",
    "INCLUDES",
    "PRIVATE",
    "WITH",
    "OF",
]

OPERATOR_WORDS = [
    "EXCEPT",
    "UNION",
    "INTERSECTION",
]

SINGLE_WORD_NAMESPACE_KEYWORDS = [
    "EXPORTS",
    "IMPORTS",
]

MULTI_WORDS_DECLARATIONS = [
    "SEQUENCE OF",
    "SET OF",
    "INSTANCE OF",
    "WITH SYNTAX",
]

SINGLE_WORDS_DECLARATIONS = [
    "SIZE",
    "SEQUENCE",
    "SET",
    "CLASS",
    "UNIQUE",
    "DEFAULT",
    "CHOICE",
    "PATTERN",
    "OPTIONAL",
    "PRESENT",
    "ABSENT",
    "CONTAINING",
    "ENUMERATED",
    "ALL",
]

TWO_WORDS_TYPES = [
    "OBJECT IDENTIFIER",
    "BIT STRING",
    "OCTET STRING",
    "CHARACTER STRING",
    "EMBEDDED PDV",
]

SINGLE_WORD_TYPES = [
    "RELATIVE-OID",
    "TYPE-IDENTIFIER",
    "ObjectDescriptor",
    "IA5String",
    "INTEGER",
    "ISO646String",
    "T61String",
    "BMPString",
    "NumericString",
    "TeletexString",
    "GeneralizedTime",
    "REAL",
    "BOOLEAN",
    "GeneralString",
    "GraphicString",
    "UniversalString",
    "UTCTime",
    "VisibleString",
    "UTF8String",
    "PrintableString",
    "VideotexString",
    "EXTERNAL",
]


def word_sequences(tokens):
    return "(" + '|'.join(token.replace(' ', r'\s+') for token in tokens) + r')\b'


class Asn1Lexer(RegexLexer):

    """
    Lexer for ASN.1 module definition
    """

    flags = re.MULTILINE

    name = 'ASN.1'
    aliases = ['asn1']
    filenames = ["*.asn1"]
    url = "https://www.itu.int/ITU-T/studygroups/com17/languages/X.680-0207.pdf"
    version_added = '2.16'

    tokens = {
       'root': [
            # Whitespace:
            (r'\s+', Whitespace),
            # Comments:
            (r'--.*$', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),
            #  Numbers:
            (r'\d+\.\d*([eE][-+]?\d+)?', Number.Float),
            (r'\d+', Number.Integer),
            # Identifier:
            (r"&?[a-z][-a-zA-Z0-9]*[a-zA-Z0-9]\b", Name.Variable),
            # Constants:
            (words(("TRUE", "FALSE", "NULL", "MINUS-INFINITY", "PLUS-INFINITY", "MIN", "MAX"), suffix=r'\b'), Keyword.Constant),
            # Builtin types:
            (word_sequences(TWO_WORDS_TYPES), Keyword.Type),
            (words(SINGLE_WORD_TYPES, suffix=r'\b'), Keyword.Type),
            # Other keywords:
            (r"EXPORTS\s+ALL\b", Keyword.Namespace),
            (words(SINGLE_WORD_NAMESPACE_KEYWORDS, suffix=r'\b'), Operator.Namespace),
            (word_sequences(MULTI_WORDS_DECLARATIONS), Keyword.Declaration),
            (words(SINGLE_WORDS_DECLARATIONS, suffix=r'\b'), Keyword.Declaration),
            (words(OPERATOR_WORDS, suffix=r'\b'), Operator.Word),
            (words(SINGLE_WORD_KEYWORDS), Keyword),
            # Type identifier:
            (r"&?[A-Z][-a-zA-Z0-9]*[a-zA-Z0-9]\b", Name.Type),
            # Operators:
            (r"(::=|\.\.\.|\.\.|\[\[|\]\]|\||\^)", Operator),
            # Punctuation:
            (r"(\.|,|\{|\}|\(|\)|\[|\])", Punctuation),
            # String:
            (r'"', String, 'string'),
            # Binary string:
            (r"('[01 ]*')(B)\b", bygroups(String, String.Affix)),
            (r"('[0-9A-F ]*')(H)\b",bygroups(String, String.Affix)),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
        'string': [
            (r'""', String),
            (r'"', String, "#pop"),
            (r'[^"]', String),
        ]
    }
