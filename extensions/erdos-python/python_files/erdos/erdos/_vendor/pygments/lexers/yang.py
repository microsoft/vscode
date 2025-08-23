"""
    pygments.lexers.yang
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the YANG 1.1 modeling language. See :rfc:`7950`.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos.erdos._vendor.pygments.token import Text, Token, Name, String, Comment, Number

__all__ = ['YangLexer']


class YangLexer(RegexLexer):
    """
    Lexer for YANG, based on RFC7950.
    """
    name = 'YANG'
    url = 'https://tools.ietf.org/html/rfc7950/'
    aliases = ['yang']
    filenames = ['*.yang']
    mimetypes = ['application/yang']
    version_added = '2.7'

    #Keywords from RFC7950 ; oriented at BNF style
    TOP_STMTS_KEYWORDS = ("module", "submodule")
    MODULE_HEADER_STMT_KEYWORDS = ("belongs-to", "namespace", "prefix", "yang-version")
    META_STMT_KEYWORDS = ("contact", "description", "organization",
                          "reference", "revision")
    LINKAGE_STMTS_KEYWORDS = ("import", "include", "revision-date")
    BODY_STMT_KEYWORDS = ("action", "argument", "augment", "deviation",
                          "extension", "feature", "grouping", "identity",
                          "if-feature", "input", "notification", "output",
                          "rpc", "typedef")
    DATA_DEF_STMT_KEYWORDS = ("anydata", "anyxml", "case", "choice",
                              "config", "container", "deviate", "leaf",
                              "leaf-list", "list", "must", "presence",
                              "refine", "uses", "when")
    TYPE_STMT_KEYWORDS = ("base", "bit", "default", "enum", "error-app-tag",
                          "error-message", "fraction-digits", "length",
                          "max-elements", "min-elements", "modifier",
                          "ordered-by", "path", "pattern", "position",
                          "range", "require-instance", "status", "type",
                          "units", "value", "yin-element")
    LIST_STMT_KEYWORDS = ("key", "mandatory", "unique")

    #RFC7950 other keywords
    CONSTANTS_KEYWORDS = ("add", "current", "delete", "deprecated", "false",
                          "invert-match", "max", "min", "not-supported",
                          "obsolete", "replace", "true", "unbounded", "user")

    #RFC7950 Built-In Types
    TYPES = ("binary", "bits", "boolean", "decimal64", "empty", "enumeration",
             "identityref", "instance-identifier", "int16", "int32", "int64",
             "int8", "leafref", "string", "uint16", "uint32", "uint64",
             "uint8", "union")

    suffix_re_pattern = r'(?=[^\w\-:])'

    tokens = {
        'comments': [
            (r'[^*/]', Comment),
            (r'/\*', Comment, '#push'),
            (r'\*/', Comment, '#pop'),
            (r'[*/]', Comment),
        ],
        "root": [
            (r'\s+', Text.Whitespace),
            (r'[{};]+', Token.Punctuation),
            (r'(?<![\-\w])(and|or|not|\+|\.)(?![\-\w])', Token.Operator),

            (r'"(?:\\"|[^"])*?"', String.Double),
            (r"'(?:\\'|[^'])*?'", String.Single),

            (r'/\*', Comment, 'comments'),
            (r'//.*?$', Comment),

            #match BNF stmt for `node-identifier` with [ prefix ":"]
            (r'(?:^|(?<=[\s{};]))([\w.-]+)(:)([\w.-]+)(?=[\s{};])',
             bygroups(Name.Namespace, Token.Punctuation, Name.Variable)),

            #match BNF stmt `date-arg-str`
            (r'([0-9]{4}\-[0-9]{2}\-[0-9]{2})(?=[\s{};])', Name.Label),
            (r'([0-9]+\.[0-9]+)(?=[\s{};])', Number.Float),
            (r'([0-9]+)(?=[\s{};])', Number.Integer),

            (words(TOP_STMTS_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(MODULE_HEADER_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(META_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(LINKAGE_STMTS_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(BODY_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(DATA_DEF_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(TYPE_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(LIST_STMT_KEYWORDS, suffix=suffix_re_pattern), Token.Keyword),
            (words(TYPES, suffix=suffix_re_pattern), Name.Class),
            (words(CONSTANTS_KEYWORDS, suffix=suffix_re_pattern), Name.Class),

            (r'[^;{}\s\'"]+', Name.Variable),
        ]
    }
