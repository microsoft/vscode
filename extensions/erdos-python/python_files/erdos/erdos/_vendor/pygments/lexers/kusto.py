"""
    pygments.lexers.kusto
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for Kusto Query Language (KQL).

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import (Comment, Keyword, Name, Number, Punctuation,
                            String, Whitespace)

__all__ = ["KustoLexer"]

# Although these all seem to be keywords
# https://github.com/microsoft/Kusto-Query-Language/blob/master/src/Kusto.Language/Syntax/SyntaxFacts.cs
# it appears that only the ones with tags here
# https://github.com/microsoft/Kusto-Query-Language/blob/master/src/Kusto.Language/Parser/QueryGrammar.cs
# are highlighted in the Azure portal log query editor.
KUSTO_KEYWORDS = [
    'and', 'as', 'between', 'by', 'consume', 'contains', 'containscs', 'count',
    'distinct', 'evaluate', 'extend', 'facet', 'filter', 'find', 'fork',
    'getschema', 'has', 'invoke', 'join', 'limit', 'lookup', 'make-series',
    'matches regex', 'mv-apply', 'mv-expand', 'notcontains', 'notcontainscs',
    '!contains', '!has', '!startswith', 'on', 'or', 'order', 'parse', 'parse-where',
    'parse-kv', 'partition', 'print', 'project', 'project-away', 'project-keep',
    'project-rename', 'project-reorder', 'range', 'reduce', 'regex', 'render',
    'sample', 'sample-distinct', 'scan', 'search', 'serialize', 'sort', 'startswith',
    'summarize', 'take', 'top', 'top-hitters', 'top-nested', 'typeof', 'union',
    'where', 'bool', 'date', 'datetime', 'int', 'long', 'real', 'string', 'time'
]

# From
# https://github.com/microsoft/Kusto-Query-Language/blob/master/src/Kusto.Language/Syntax/SyntaxFacts.cs
KUSTO_PUNCTUATION = [
    "(", ")", "[", "]", "{", "}", "|", "<|", "+", "-", "*", "/",
    "%", ".." "!", "<", "<=", ">", ">=", "=", "==", "!=", "<>",
    ":", ";", ",", "=~", "!~", "?", "=>",
]


class KustoLexer(RegexLexer):
    """For Kusto Query Language source code.
    """

    name = "Kusto"
    aliases = ["kql", "kusto"]
    filenames = ["*.kql", "*.kusto", ".csl"]
    url = "https://learn.microsoft.com/en-us/azure/data-explorer/kusto/query"
    version_added = '2.17'

    tokens = {
        "root": [
            (r"\s+", Whitespace),
            (words(KUSTO_KEYWORDS, suffix=r"\b"), Keyword),
            (r"//.*", Comment),
            (words(KUSTO_PUNCTUATION), Punctuation),
            (r"[^\W\d]\w*", Name),
            # Numbers can take the form 1, .1, 1., 1.1, 1.1111, etc.
            (r"\d+[.]\d*|[.]\d+", Number.Float),
            (r"\d+", Number.Integer),
            (r"'", String, "single_string"),
            (r'"', String, "double_string"),
            (r"@'", String, "single_verbatim"),
            (r'@"', String, "double_verbatim"),
            (r"```", String, "multi_string"),
        ],
        "single_string": [
            (r"'", String, "#pop"),
            (r"\\.", String.Escape),
            (r"[^'\\]+", String),
        ],
        "double_string": [
            (r'"', String, "#pop"),
            (r"\\.", String.Escape),
            (r'[^"\\]+', String),
        ],
        "single_verbatim": [
            (r"'", String, "#pop"),
            (r"[^']+", String),
        ],
        "double_verbatim": [
            (r'"', String, "#pop"),
            (r'[^"]+', String),
        ],
        "multi_string": [
            (r"[^`]+", String),
            (r"```", String, "#pop"),
            (r"`", String),
        ],
    }
