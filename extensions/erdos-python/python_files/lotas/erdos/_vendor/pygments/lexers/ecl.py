"""
    pygments.lexers.ecl
    ~~~~~~~~~~~~~~~~~~~

    Lexers for the ECL language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, words
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['ECLLexer']


class ECLLexer(RegexLexer):
    """
    Lexer for the declarative big-data ECL language.
    """

    name = 'ECL'
    url = 'https://hpccsystems.com/training/documentation/ecl-language-reference/html'
    aliases = ['ecl']
    filenames = ['*.ecl']
    mimetypes = ['application/x-ecl']
    version_added = '1.5'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'root': [
            include('whitespace'),
            include('statements'),
        ],
        'whitespace': [
            (r'\s+', Whitespace),
            (r'\/\/.*', Comment.Single),
            (r'/(\\\n)?\*(.|\n)*?\*(\\\n)?/', Comment.Multiline),
        ],
        'statements': [
            include('types'),
            include('keywords'),
            include('functions'),
            include('hash'),
            (r'"', String, 'string'),
            (r'\'', String, 'string'),
            (r'(\d+\.\d*|\.\d+|\d+)e[+-]?\d+[lu]*', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+f)f?', Number.Float),
            (r'0x[0-9a-f]+[lu]*', Number.Hex),
            (r'0[0-7]+[lu]*', Number.Oct),
            (r'\d+[lu]*', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]+', Operator),
            (r'[{}()\[\],.;]', Punctuation),
            (r'[a-z_]\w*', Name),
        ],
        'hash': [
            (r'^#.*$', Comment.Preproc),
        ],
        'types': [
            (r'(RECORD|END)\D', Keyword.Declaration),
            (r'((?:ASCII|BIG_ENDIAN|BOOLEAN|DATA|DECIMAL|EBCDIC|INTEGER|PATTERN|'
             r'QSTRING|REAL|RECORD|RULE|SET OF|STRING|TOKEN|UDECIMAL|UNICODE|'
             r'UNSIGNED|VARSTRING|VARUNICODE)\d*)(\s+)',
             bygroups(Keyword.Type, Whitespace)),
        ],
        'keywords': [
            (words((
                'APPLY', 'ASSERT', 'BUILD', 'BUILDINDEX', 'EVALUATE', 'FAIL',
                'KEYDIFF', 'KEYPATCH', 'LOADXML', 'NOTHOR', 'NOTIFY', 'OUTPUT',
                'PARALLEL', 'SEQUENTIAL', 'SOAPCALL', 'CHECKPOINT', 'DEPRECATED',
                'FAILCODE', 'FAILMESSAGE', 'FAILURE', 'GLOBAL', 'INDEPENDENT',
                'ONWARNING', 'PERSIST', 'PRIORITY', 'RECOVERY', 'STORED', 'SUCCESS',
                'WAIT', 'WHEN'), suffix=r'\b'),
             Keyword.Reserved),
            # These are classed differently, check later
            (words((
                'ALL', 'AND', 'ANY', 'AS', 'ATMOST', 'BEFORE', 'BEGINC++', 'BEST',
                'BETWEEN', 'CASE', 'CONST', 'COUNTER', 'CSV', 'DESCEND', 'ENCRYPT',
                'ENDC++', 'ENDMACRO', 'EXCEPT', 'EXCLUSIVE', 'EXPIRE', 'EXPORT',
                'EXTEND', 'FALSE', 'FEW', 'FIRST', 'FLAT', 'FULL', 'FUNCTION',
                'GROUP', 'HEADER', 'HEADING', 'HOLE', 'IFBLOCK', 'IMPORT', 'IN',
                'JOINED', 'KEEP', 'KEYED', 'LAST', 'LEFT', 'LIMIT', 'LOAD', 'LOCAL',
                'LOCALE', 'LOOKUP', 'MACRO', 'MANY', 'MAXCOUNT', 'MAXLENGTH',
                'MIN SKEW', 'MODULE', 'INTERFACE', 'NAMED', 'NOCASE', 'NOROOT',
                'NOSCAN', 'NOSORT', 'NOT', 'OF', 'ONLY', 'OPT', 'OR', 'OUTER',
                'OVERWRITE', 'PACKED', 'PARTITION', 'PENALTY', 'PHYSICALLENGTH',
                'PIPE', 'QUOTE', 'RELATIONSHIP', 'REPEAT', 'RETURN', 'RIGHT',
                'SCAN', 'SELF', 'SEPARATOR', 'SERVICE', 'SHARED', 'SKEW', 'SKIP',
                'SQL', 'STORE', 'TERMINATOR', 'THOR', 'THRESHOLD', 'TOKEN',
                'TRANSFORM', 'TRIM', 'TRUE', 'TYPE', 'UNICODEORDER', 'UNSORTED',
                'VALIDATE', 'VIRTUAL', 'WHOLE', 'WILD', 'WITHIN', 'XML', 'XPATH',
                '__COMPRESSED__'), suffix=r'\b'),
             Keyword.Reserved),
        ],
        'functions': [
            (words((
                'ABS', 'ACOS', 'ALLNODES', 'ASCII', 'ASIN', 'ASSTRING', 'ATAN',
                'ATAN2', 'AVE', 'CASE', 'CHOOSE', 'CHOOSEN', 'CHOOSESETS',
                'CLUSTERSIZE', 'COMBINE', 'CORRELATION', 'COS', 'COSH', 'COUNT',
                'COVARIANCE', 'CRON', 'DATASET', 'DEDUP', 'DEFINE', 'DENORMALIZE',
                'DISTRIBUTE', 'DISTRIBUTED', 'DISTRIBUTION', 'EBCDIC', 'ENTH',
                'ERROR', 'EVALUATE', 'EVENT', 'EVENTEXTRA', 'EVENTNAME', 'EXISTS',
                'EXP', 'FAILCODE', 'FAILMESSAGE', 'FETCH', 'FROMUNICODE',
                'GETISVALID', 'GLOBAL', 'GRAPH', 'GROUP', 'HASH', 'HASH32',
                'HASH64', 'HASHCRC', 'HASHMD5', 'HAVING', 'IF', 'INDEX',
                'INTFORMAT', 'ISVALID', 'ITERATE', 'JOIN', 'KEYUNICODE', 'LENGTH',
                'LIBRARY', 'LIMIT', 'LN', 'LOCAL', 'LOG', 'LOOP', 'MAP', 'MATCHED',
                'MATCHLENGTH', 'MATCHPOSITION', 'MATCHTEXT', 'MATCHUNICODE', 'MAX',
                'MERGE', 'MERGEJOIN', 'MIN', 'NOLOCAL', 'NONEMPTY', 'NORMALIZE',
                'PARSE', 'PIPE', 'POWER', 'PRELOAD', 'PROCESS', 'PROJECT', 'PULL',
                'RANDOM', 'RANGE', 'RANK', 'RANKED', 'REALFORMAT', 'RECORDOF',
                'REGEXFIND', 'REGEXREPLACE', 'REGROUP', 'REJECTED', 'ROLLUP',
                'ROUND', 'ROUNDUP', 'ROW', 'ROWDIFF', 'SAMPLE', 'SET', 'SIN',
                'SINH', 'SIZEOF', 'SOAPCALL', 'SORT', 'SORTED', 'SQRT', 'STEPPED',
                'STORED', 'SUM', 'TABLE', 'TAN', 'TANH', 'THISNODE', 'TOPN',
                'TOUNICODE', 'TRANSFER', 'TRIM', 'TRUNCATE', 'TYPEOF', 'UNGROUP',
                'UNICODEORDER', 'VARIANCE', 'WHICH', 'WORKUNIT', 'XMLDECODE',
                'XMLENCODE', 'XMLTEXT', 'XMLUNICODE'), suffix=r'\b'),
             Name.Function),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\'', String, '#pop'),
            (r'[^"\']+', String),
        ],
    }

    def analyse_text(text):
        """This is very difficult to guess relative to other business languages.
        -> in conjunction with BEGIN/END seems relatively rare though."""
        result = 0

        if '->' in text:
            result += 0.01
        if 'BEGIN' in text:
            result += 0.01
        if 'END' in text:
            result += 0.01

        return result
