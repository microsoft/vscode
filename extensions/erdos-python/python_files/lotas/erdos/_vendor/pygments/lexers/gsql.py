"""
    pygments.lexers.gsql
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for TigerGraph GSQL graph query language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, this, words
from erdos._vendor.pygments.token import Keyword, Punctuation, Comment, Operator, Name, \
    String, Number, Whitespace

__all__ = ["GSQLLexer"]


class GSQLLexer(RegexLexer):

    """
    For GSQL queries (version 3.x).
    """

    name = 'GSQL'
    url = 'https://docs.tigergraph.com/dev/gsql-ref'
    aliases = ['gsql']
    filenames = ['*.gsql']
    version_added = '2.10'

    flags = re.MULTILINE | re.IGNORECASE

    tokens = {
        'root': [
            include('comment'),
            include('keywords'),
            include('clauses'),
            include('accums'),
            include('relations'),
            include('strings'),
            include('whitespace'),
            include('barewords'),
            include('operators'),
        ],
        'comment': [
            (r'\#.*', Comment.Single),
            (r'/\*(.|\n)*?\*/', Comment.Multiline),
        ],
        'keywords': [
            (words((
                'ACCUM', 'AND', 'ANY', 'API', 'AS', 'ASC', 'AVG', 'BAG', 'BATCH',
                'BETWEEN', 'BOOL', 'BOTH', 'BREAK', 'BY', 'CASE', 'CATCH', 'COALESCE',
                'COMPRESS', 'CONTINUE', 'COUNT', 'CREATE', 'DATETIME', 'DATETIME_ADD',
                'DATETIME_SUB', 'DELETE', 'DESC', 'DISTRIBUTED', 'DO', 'DOUBLE',
                'EDGE', 'ELSE', 'END', 'ESCAPE', 'EXCEPTION', 'FALSE', 'FILE',
                'FILTER', 'FLOAT', 'FOREACH', 'FOR', 'FROM', 'GRAPH', 'GROUP',
                'GSQL_INT_MAX', 'GSQL_INT_MIN', 'GSQL_UINT_MAX', 'HAVING', 'IF',
                'IN', 'INSERT', 'INT', 'INTERPRET', 'INTERSECT', 'INTERVAL', 'INTO',
                'IS', 'ISEMPTY', 'JSONARRAY', 'JSONOBJECT', 'LASTHOP', 'LEADING',
                'LIKE', 'LIMIT', 'LIST', 'LOAD_ACCUM', 'LOG', 'MAP', 'MATCH', 'MAX',
                'MIN', 'MINUS', 'NOT', 'NOW', 'NULL', 'OFFSET', 'OR', 'ORDER', 'PATH',
                'PER', 'PINNED', 'POST_ACCUM', 'POST-ACCUM', 'PRIMARY_ID', 'PRINT',
                'QUERY', 'RAISE', 'RANGE', 'REPLACE', 'RESET_COLLECTION_ACCUM',
                'RETURN', 'RETURNS', 'RUN', 'SAMPLE', 'SELECT', 'SELECT_VERTEX',
                'SET', 'SRC', 'STATIC', 'STRING', 'SUM', 'SYNTAX', 'TARGET',
                'TAGSTGT', 'THEN', 'TO', 'TO_CSV', 'TO_DATETIME', 'TRAILING',
                'TRIM', 'TRUE', 'TRY', 'TUPLE', 'TYPEDEF', 'UINT', 'UNION', 'UPDATE',
                'VALUES', 'VERTEX', 'WHEN', 'WHERE', 'WHILE', 'WITH'),
                   prefix=r'(?<!\.)', suffix=r'\b'), Keyword),
        ],
        'clauses': [
            (words(('accum', 'having', 'limit', 'order', 'postAccum', 'sample', 'where')),
             Name.Builtin),
        ],
        'accums': [
            (words(('andaccum', 'arrayaccum', 'avgaccum', 'bagaccum', 'bitwiseandaccum',
                    'bitwiseoraccum', 'groupbyaccum', 'heapaccum', 'listaccum',
                    'MapAccum', 'maxaccum', 'minaccum', 'oraccum', 'setaccum',
                    'sumaccum')), Name.Builtin),
        ],
        'relations': [
            (r'(-\s?)(\(.*\:\w?\))(\s?-)', bygroups(Operator, using(this), Operator)),
            (r'->|<-', Operator),
            (r'[.*{}\[\]\<\>\_]', Punctuation),
        ],
        'strings': [
            (r'"([^"\\]|\\.)*"', String),
            (r'@{1,2}\w+', Name.Variable),
        ],
        'whitespace': [
            (r'\s+', Whitespace),
        ],
        'barewords': [
            (r'[a-z]\w*', Name),
            (r'(\d+\.\d+|\d+)', Number),
        ],
        'operators': [
            (r'\$|[^0-9|\/|\-](\-\=|\+\=|\*\=|\\\=|\=|\=\=|\=\=\=|'
             r'\+|\-|\*|\\|\+\=|\>|\<)[^\>|\/]', Operator),
            (r'(\||\(|\)|\,|\;|\=|\-|\+|\*|\/|\>|\<|\:)', Operator),
        ],
    }
