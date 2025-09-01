"""
    pygments.lexers.dax
    ~~~~~~~~~~~~~~~~~~~

    Lexer for LilyPond.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words
from erdos._vendor.pygments.token import Comment, Punctuation, Whitespace,\
    Name, Operator, String, Number, Text

__all__ = ['DaxLexer']


class DaxLexer(RegexLexer):
    """
    Lexer for Power BI DAX
    Referenced from: https://github.com/sql-bi/SyntaxHighlighterBrushDax
    """
    name = 'Dax'
    aliases = ['dax']
    filenames = ['*.dax']
    url = 'https://learn.microsoft.com/en-us/dax/dax-function-reference'
    mimetypes = []
    version_added = '2.15'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r"--.*\n?", Comment.Single),	# Comment: Double dash comment
            (r"//.*\n?", Comment.Single),	# Comment: Double backslash comment
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (words(('abs', 'accrint', 'accrintm', 'acos', 'acosh', 'acot', 'acoth',
                    'addcolumns', 'addmissingitems', 'all', 'allcrossfiltered',
                    'allexcept', 'allnoblankrow', 'allselected', 'amordegrc', 'amorlinc',
                    'and','approximatedistinctcount', 'asin', 'asinh', 'atan', 'atanh',
                    'average', 'averagea', 'averagex', 'beta.dist', 'beta.inv',
                    'bitand', 'bitlshift', 'bitor', 'bitrshift', 'bitxor', 'blank',
                    'calculate', 'calculatetable', 'calendar', 'calendarauto', 'ceiling',
                    'chisq.dist', 'chisq.dist.rt', 'chisq.inv', 'chisq.inv.rt',
                    'closingbalancemonth', 'closingbalancequarter', 'closingbalanceyear',
                    'coalesce', 'columnstatistics', 'combin', 'combina', 'combinevalues',
                    'concatenate', 'concatenatex', 'confidence.norm', 'confidence.t',
                    'contains', 'containsrow', 'containsstring', 'containsstringexact',
                    'convert', 'cos', 'cosh', 'cot', 'coth', 'count', 'counta', 'countax',
                    'countblank', 'countrows', 'countx', 'coupdaybs', 'coupdays',
                    'coupdaysnc', 'coupncd', 'coupnum', 'couppcd', 'crossfilter',
                    'crossjoin', 'cumipmt', 'cumprinc', 'currency', 'currentgroup',
                    'customdata', 'datatable', 'date', 'dateadd', 'datediff',
                    'datesbetween', 'datesinperiod', 'datesmtd', 'datesqtd',
                    'datesytd', 'datevalue', 'day', 'db', 'ddb', 'degrees', 'detailrows',
                    'disc', 'distinct', 'distinctcount', 'distinctcountnoblank',
                    'divide', 'dollarde', 'dollarfr', 'duration', 'earlier', 'earliest',
                    'edate', 'effect', 'endofmonth', 'endofquarter', 'endofyear',
                    'eomonth', 'error', 'evaluateandlog', 'even', 'exact', 'except',
                    'exp', 'expon.dist', 'fact', 'false', 'filter', 'filters', 'find',
                    'firstdate', 'firstnonblank', 'firstnonblankvalue', 'fixed', 'floor',
                    'format', 'fv', 'gcd', 'generate', 'generateall', 'generateseries',
                    'geomean', 'geomeanx', 'groupby', 'hash', 'hasonefilter',
                    'hasonevalue', 'hour', 'if', 'if.eager', 'iferror', 'ignore', 'index',
                    'int', 'intersect', 'intrate', 'ipmt', 'isafter', 'isblank',
                    'iscrossfiltered', 'isempty', 'iserror', 'iseven', 'isfiltered',
                    'isinscope', 'islogical', 'isnontext', 'isnumber', 'iso.ceiling',
                    'isodd', 'isonorafter', 'ispmt', 'isselectedmeasure', 'issubtotal',
                    'istext', 'keepfilters', 'keywordmatch', 'lastdate', 'lastnonblank',
                    'lastnonblankvalue', 'lcm', 'left', 'len', 'linest', 'linestx', 'ln',
                    'log', 'log10', 'lookupvalue', 'lower', 'max', 'maxa', 'maxx',
                    'mduration', 'median', 'medianx', 'mid', 'min', 'mina', 'minute',
                    'minx', 'mod', 'month', 'mround', 'nameof', 'naturalinnerjoin',
                    'naturalleftouterjoin', 'networkdays', 'nextday', 'nextmonth',
                    'nextquarter', 'nextyear', 'nominal', 'nonvisual', 'norm.dist',
                    'norm.inv', 'norm.s.dist', 'norm.s.inv', 'not', 'now', 'nper', 'odd',
                    'oddfprice', 'oddfyield', 'oddlprice', 'oddlyield', 'offset',
                    'openingbalancemonth', 'openingbalancequarter', 'openingbalanceyear',
                    'or', 'orderby', 'parallelperiod', 'partitionby', 'path',
                    'pathcontains', 'pathitem', 'pathitemreverse', 'pathlength',
                    'pduration', 'percentile.exc', 'percentile.inc', 'percentilex.exc',
                    'percentilex.inc', 'permut', 'pi', 'pmt', 'poisson.dist', 'power',
                    'ppmt', 'previousday', 'previousmonth', 'previousquarter',
                    'previousyear', 'price', 'pricedisc', 'pricemat', 'product',
                    'productx', 'pv', 'quarter', 'quotient', 'radians', 'rand',
                    'randbetween', 'rank.eq', 'rankx', 'rate', 'received', 'related',
                    'relatedtable', 'removefilters', 'replace', 'rept', 'right',
                    'rollup', 'rollupaddissubtotal', 'rollupgroup', 'rollupissubtotal',
                    'round', 'rounddown', 'roundup', 'row', 'rri', 'sameperiodlastyear',
                    'sample', 'sampleaxiswithlocalminmax', 'search', 'second',
                    'selectcolumns', 'selectedmeasure', 'selectedmeasureformatstring',
                    'selectedmeasurename', 'selectedvalue', 'sign', 'sin', 'sinh', 'sln',
                    'sqrt', 'sqrtpi', 'startofmonth', 'startofquarter', 'startofyear',
                    'stdev.p', 'stdev.s', 'stdevx.p', 'stdevx.s', 'substitute',
                    'substitutewithindex', 'sum', 'summarize', 'summarizecolumns', 'sumx',
                    'switch', 'syd', 't.dist', 't.dist.2t', 't.dist.rt', 't.inv',
                    't.inv.2t', 'tan', 'tanh', 'tbilleq', 'tbillprice', 'tbillyield',
                    'time', 'timevalue', 'tocsv', 'today', 'tojson', 'topn',
                    'topnperlevel', 'topnskip', 'totalmtd', 'totalqtd', 'totalytd',
                    'treatas', 'trim', 'true', 'trunc', 'unichar', 'unicode', 'union',
                    'upper', 'userculture', 'userelationship', 'username', 'userobjectid',
                    'userprincipalname', 'utcnow', 'utctoday', 'value', 'values', 'var.p',
                    'var.s', 'varx.p', 'varx.s', 'vdb', 'weekday', 'weeknum', 'window',
                    'xirr', 'xnpv', 'year', 'yearfrac', 'yield', 'yielddisc', 'yieldmat'),
                 prefix=r'(?i)', suffix=r'\b'), Name.Function), #Functions

            (words(('at','asc','boolean','both','by','create','currency',
                'datetime','day','define','desc','double',
                'evaluate','false','integer','measure',
                'month','none','order','return','single','start','string',
                'table','true','var','year'),
                prefix=r'(?i)', suffix=r'\b'), Name.Builtin), # Keyword

            (r':=|[-+*\/=^]', Operator),
            (r'\b(IN|NOT)\b', Operator.Word),
            (r'"', String, 'string'), #StringLiteral
            (r"'(?:[^']|'')*'(?!')(?:\[[ \w]+\])?|\w+\[[ \w]+\]",
                Name.Attribute),	# Column reference
            (r"\[[ \w]+\]", Name.Attribute), #Measure reference
            (r'(?<!\w)(\d+\.?\d*|\.\d+\b)', Number),# Number
            (r'[\[\](){}`,.]', Punctuation), #Parenthesis
            (r'.*\n', Text),

        ],
        'multiline-comments': [
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[^/*]+', Comment.Multiline),
            (r'[/*]', Comment.Multiline)
        ],
        'string': [
            (r'""', String.Escape),
            (r'"', String, '#pop'),
            (r'[^"]+', String),
        ]
    }
