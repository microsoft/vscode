"""
    pygments.lexers.sas
    ~~~~~~~~~~~~~~~~~~~

    Lexer for SAS.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re
from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, words
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, String, Text, \
    Other, Generic

__all__ = ['SASLexer']


class SASLexer(RegexLexer):
    """
    For SAS files.
    """
    # Syntax from syntax/sas.vim by James Kidd <james.kidd@covance.com>

    name      = 'SAS'
    aliases   = ['sas']
    filenames = ['*.SAS', '*.sas']
    mimetypes = ['text/x-sas', 'text/sas', 'application/x-sas']
    url = 'https://en.wikipedia.org/wiki/SAS_(software)'
    version_added = '2.2'
    flags     = re.IGNORECASE | re.MULTILINE

    builtins_macros = (
        "bquote", "nrbquote", "cmpres", "qcmpres", "compstor", "datatyp",
        "display", "do", "else", "end", "eval", "global", "goto", "if",
        "index", "input", "keydef", "label", "left", "length", "let",
        "local", "lowcase", "macro", "mend", "nrquote",
        "nrstr", "put", "qleft", "qlowcase", "qscan",
        "qsubstr", "qsysfunc", "qtrim", "quote", "qupcase", "scan",
        "str", "substr", "superq", "syscall", "sysevalf", "sysexec",
        "sysfunc", "sysget", "syslput", "sysprod", "sysrc", "sysrput",
        "then", "to", "trim", "unquote", "until", "upcase", "verify",
        "while", "window"
    )

    builtins_conditionals = (
        "do", "if", "then", "else", "end", "until", "while"
    )

    builtins_statements = (
        "abort", "array", "attrib", "by", "call", "cards", "cards4",
        "catname", "continue", "datalines", "datalines4", "delete", "delim",
        "delimiter", "display", "dm", "drop", "endsas", "error", "file",
        "filename", "footnote", "format", "goto", "in", "infile", "informat",
        "input", "keep", "label", "leave", "length", "libname", "link",
        "list", "lostcard", "merge", "missing", "modify", "options", "output",
        "out", "page", "put", "redirect", "remove", "rename", "replace",
        "retain", "return", "select", "set", "skip", "startsas", "stop",
        "title", "update", "waitsas", "where", "window", "x", "systask"
    )

    builtins_sql = (
        "add", "and", "alter", "as", "cascade", "check", "create",
        "delete", "describe", "distinct", "drop", "foreign", "from",
        "group", "having", "index", "insert", "into", "in", "key", "like",
        "message", "modify", "msgtype", "not", "null", "on", "or",
        "order", "primary", "references", "reset", "restrict", "select",
        "set", "table", "unique", "update", "validate", "view", "where"
    )

    builtins_functions = (
        "abs", "addr", "airy", "arcos", "arsin", "atan", "attrc",
        "attrn", "band", "betainv", "blshift", "bnot", "bor",
        "brshift", "bxor", "byte", "cdf", "ceil", "cexist", "cinv",
        "close", "cnonct", "collate", "compbl", "compound",
        "compress", "cos", "cosh", "css", "curobs", "cv", "daccdb",
        "daccdbsl", "daccsl", "daccsyd", "dacctab", "dairy", "date",
        "datejul", "datepart", "datetime", "day", "dclose", "depdb",
        "depdbsl", "depsl", "depsyd",
        "deptab", "dequote", "dhms", "dif", "digamma",
        "dim", "dinfo", "dnum", "dopen", "doptname", "doptnum",
        "dread", "dropnote", "dsname", "erf", "erfc", "exist", "exp",
        "fappend", "fclose", "fcol", "fdelete", "fetch", "fetchobs",
        "fexist", "fget", "fileexist", "filename", "fileref",
        "finfo", "finv", "fipname", "fipnamel", "fipstate", "floor",
        "fnonct", "fnote", "fopen", "foptname", "foptnum", "fpoint",
        "fpos", "fput", "fread", "frewind", "frlen", "fsep", "fuzz",
        "fwrite", "gaminv", "gamma", "getoption", "getvarc", "getvarn",
        "hbound", "hms", "hosthelp", "hour", "ibessel", "index",
        "indexc", "indexw", "input", "inputc", "inputn", "int",
        "intck", "intnx", "intrr", "irr", "jbessel", "juldate",
        "kurtosis", "lag", "lbound", "left", "length", "lgamma",
        "libname", "libref", "log", "log10", "log2", "logpdf", "logpmf",
        "logsdf", "lowcase", "max", "mdy", "mean", "min", "minute",
        "mod", "month", "mopen", "mort", "n", "netpv", "nmiss",
        "normal", "note", "npv", "open", "ordinal", "pathname",
        "pdf", "peek", "peekc", "pmf", "point", "poisson", "poke",
        "probbeta", "probbnml", "probchi", "probf", "probgam",
        "probhypr", "probit", "probnegb", "probnorm", "probt",
        "put", "putc", "putn", "qtr", "quote", "ranbin", "rancau",
        "ranexp", "rangam", "range", "rank", "rannor", "ranpoi",
        "rantbl", "rantri", "ranuni", "repeat", "resolve", "reverse",
        "rewind", "right", "round", "saving", "scan", "sdf", "second",
        "sign", "sin", "sinh", "skewness", "soundex", "spedis",
        "sqrt", "std", "stderr", "stfips", "stname", "stnamel",
        "substr", "sum", "symget", "sysget", "sysmsg", "sysprod",
        "sysrc", "system", "tan", "tanh", "time", "timepart", "tinv",
        "tnonct", "today", "translate", "tranwrd", "trigamma",
        "trim", "trimn", "trunc", "uniform", "upcase", "uss", "var",
        "varfmt", "varinfmt", "varlabel", "varlen", "varname",
        "varnum", "varray", "varrayx", "vartype", "verify", "vformat",
        "vformatd", "vformatdx", "vformatn", "vformatnx", "vformatw",
        "vformatwx", "vformatx", "vinarray", "vinarrayx", "vinformat",
        "vinformatd", "vinformatdx", "vinformatn", "vinformatnx",
        "vinformatw", "vinformatwx", "vinformatx", "vlabel",
        "vlabelx", "vlength", "vlengthx", "vname", "vnamex", "vtype",
        "vtypex", "weekday", "year", "yyq", "zipfips", "zipname",
        "zipnamel", "zipstate"
    )

    tokens = {
        'root': [
            include('comments'),
            include('proc-data'),
            include('cards-datalines'),
            include('logs'),
            include('general'),
            (r'.', Text),
        ],
        # SAS is multi-line regardless, but * is ended by ;
        'comments': [
            (r'^\s*\*.*?;', Comment),
            (r'/\*.*?\*/', Comment),
            (r'^\s*\*(.|\n)*?;', Comment.Multiline),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
        ],
        # Special highlight for proc, data, quit, run
        'proc-data': [
            (r'(^|;)\s*(proc \w+|data|run|quit)[\s;]',
             Keyword.Reserved),
        ],
        # Special highlight cards and datalines
        'cards-datalines': [
            (r'^\s*(datalines|cards)\s*;\s*$', Keyword, 'data'),
        ],
        'data': [
            (r'(.|\n)*^\s*;\s*$', Other, '#pop'),
        ],
        # Special highlight for put NOTE|ERROR|WARNING (order matters)
        'logs': [
            (r'\n?^\s*%?put ', Keyword, 'log-messages'),
        ],
        'log-messages': [
            (r'NOTE(:|-).*', Generic, '#pop'),
            (r'WARNING(:|-).*', Generic.Emph, '#pop'),
            (r'ERROR(:|-).*', Generic.Error, '#pop'),
            include('general'),
        ],
        'general': [
            include('keywords'),
            include('vars-strings'),
            include('special'),
            include('numbers'),
        ],
        # Keywords, statements, functions, macros
        'keywords': [
            (words(builtins_statements,
                   prefix = r'\b',
                   suffix = r'\b'),
             Keyword),
            (words(builtins_sql,
                   prefix = r'\b',
                   suffix = r'\b'),
             Keyword),
            (words(builtins_conditionals,
                   prefix = r'\b',
                   suffix = r'\b'),
             Keyword),
            (words(builtins_macros,
                   prefix = r'%',
                   suffix = r'\b'),
             Name.Builtin),
            (words(builtins_functions,
                   prefix = r'\b',
                   suffix = r'\('),
             Name.Builtin),
        ],
        # Strings and user-defined variables and macros (order matters)
        'vars-strings': [
            (r'&[a-z_]\w{0,31}\.?', Name.Variable),
            (r'%[a-z_]\w{0,31}', Name.Function),
            (r'\'', String, 'string_squote'),
            (r'"', String, 'string_dquote'),
        ],
        'string_squote': [
            ('\'', String, '#pop'),
            (r'\\\\|\\"|\\\n', String.Escape),
            # AFAIK, macro variables are not evaluated in single quotes
            # (r'&', Name.Variable, 'validvar'),
            (r'[^$\'\\]+', String),
            (r'[$\'\\]', String),
        ],
        'string_dquote': [
            (r'"', String, '#pop'),
            (r'\\\\|\\"|\\\n', String.Escape),
            (r'&', Name.Variable, 'validvar'),
            (r'[^$&"\\]+', String),
            (r'[$"\\]', String),
        ],
        'validvar': [
            (r'[a-z_]\w{0,31}\.?', Name.Variable, '#pop'),
        ],
        # SAS numbers and special variables
        'numbers': [
            (r'\b[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+|\.)(E[+-]?[0-9]+)?i?\b',
             Number),
        ],
        'special': [
            (r'(null|missing|_all_|_automatic_|_character_|_n_|'
             r'_infile_|_name_|_null_|_numeric_|_user_|_webout_)',
             Keyword.Constant),
        ],
        # 'operators': [
        #     (r'(-|=|<=|>=|<|>|<>|&|!=|'
        #      r'\||\*|\+|\^|/|!|~|~=)', Operator)
        # ],
    }
