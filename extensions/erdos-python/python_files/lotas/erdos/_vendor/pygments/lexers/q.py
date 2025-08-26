"""
    pygments.lexers.q
    ~~~~~~~~~~~~~~~~~

    Lexer for the Q programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, words, include, bygroups, inherit
from lotas.erdos._vendor.pygments.token import Comment, Name, Number, Operator, Punctuation, \
    String, Whitespace, Literal, Generic

__all__ = ["KLexer", "QLexer"]


class KLexer(RegexLexer):
    """
    For K source code.
    """

    name = "K"
    aliases = ["k"]
    filenames = ["*.k"]
    url = "https://code.kx.com"
    version_added = '2.12'

    tokens = {
        "whitespace": [
            # hashbang script
            (r"^#!.*", Comment.Hashbang),
            # Comments
            (r"^/\s*\n", Comment.Multiline, "comments"),
            (r"(?<!\S)/.*", Comment.Single),
            # Whitespace
            (r"\s+", Whitespace),
            # Strings
            (r"\"", String.Double, "strings"),
        ],
        "root": [
            include("whitespace"),
            include("keywords"),
            include("declarations"),
        ],
        "keywords": [
            (words(("abs", "acos", "asin", "atan", "avg", "bin",
                    "binr", "by", "cor", "cos", "cov", "dev",
                    "delete", "div", "do", "enlist", "exec", "exit",
                    "exp", "from", "getenv", "hopen", "if", "in",
                    "insert", "last", "like", "log", "max", "min",
                    "prd", "select", "setenv", "sin", "sqrt", "ss",
                    "sum", "tan", "update", "var", "wavg", "while",
                    "within", "wsum", "xexp"),
                   suffix=r"\b"), Operator.Word),
        ],
        "declarations": [
            # Timing
            (r"^\\ts?", Comment.Preproc),
            (r"^(\\\w\s+[^/\n]*?)(/.*)",
             bygroups(Comment.Preproc, Comment.Single)),
            # Generic System Commands
            (r"^\\\w.*", Comment.Preproc),
            # Prompt
            (r"^[a-zA-Z]\)", Generic.Prompt),
            # Function Names
            (r"([.]?[a-zA-Z][\w.]*)(\s*)([-.~=!@#$%^&*_+|,<>?/\\:']?:)(\s*)(\{)",
             bygroups(Name.Function, Whitespace, Operator, Whitespace, Punctuation),
             "functions"),
            # Variable Names
            (r"([.]?[a-zA-Z][\w.]*)(\s*)([-.~=!@#$%^&*_+|,<>?/\\:']?:)",
             bygroups(Name.Variable, Whitespace, Operator)),
            # Functions
            (r"\{", Punctuation, "functions"),
            # Parentheses
            (r"\(", Punctuation, "parentheses"),
            # Brackets
            (r"\[", Punctuation, "brackets"),
            # Errors
            (r"'`([a-zA-Z][\w.]*)?", Name.Exception),
            # File Symbols
            (r"`:([a-zA-Z/][\w./]*)?", String.Symbol),
            # Symbols
            (r"`([a-zA-Z][\w.]*)?", String.Symbol),
            # Numbers
            include("numbers"),
            # Variable Names
            (r"[a-zA-Z][\w.]*", Name),
            # Operators
            (r"[-=+*#$%@!~^&:.,<>'\\|/?_]", Operator),
            # Punctuation
            (r";", Punctuation),
        ],
        "functions": [
            include("root"),
            (r"\}", Punctuation, "#pop"),
        ],
        "parentheses": [
            include("root"),
            (r"\)", Punctuation, "#pop"),
        ],
        "brackets": [
            include("root"),
            (r"\]", Punctuation, "#pop"),
        ],
        "numbers": [
            # Binary Values
            (r"[01]+b", Number.Bin),
            # Nulls/Infinities
            (r"0[nNwW][cefghijmndzuvtp]?", Number),
            # Timestamps
            ((r"(?:[0-9]{4}[.][0-9]{2}[.][0-9]{2}|[0-9]+)"
              "D(?:[0-9](?:[0-9](?::[0-9]{2}"
              "(?::[0-9]{2}(?:[.][0-9]*)?)?)?)?)?"), Literal.Date),
            # Datetimes
            ((r"[0-9]{4}[.][0-9]{2}"
              "(?:m|[.][0-9]{2}(?:T(?:[0-9]{2}:[0-9]{2}"
              "(?::[0-9]{2}(?:[.][0-9]*)?)?)?)?)"), Literal.Date),
            # Times
            (r"[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.][0-9]{1,3})?)?",
             Literal.Date),
            # GUIDs
            (r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
             Number.Hex),
            # Byte Vectors
            (r"0x[0-9a-fA-F]+", Number.Hex),
            # Floats
            (r"([0-9]*[.]?[0-9]+|[0-9]+[.]?[0-9]*)[eE][+-]?[0-9]+[ef]?",
             Number.Float),
            (r"([0-9]*[.][0-9]+|[0-9]+[.][0-9]*)[ef]?", Number.Float),
            (r"[0-9]+[ef]", Number.Float),
            # Characters
            (r"[0-9]+c", Number),
            # Integers
            (r"[0-9]+[ihtuv]", Number.Integer),
            # Long Integers
            (r"[0-9]+[jnp]?", Number.Integer.Long),
        ],
        "comments": [
            (r"[^\\]+", Comment.Multiline),
            (r"^\\", Comment.Multiline, "#pop"),
            (r"\\", Comment.Multiline),
        ],
        "strings": [
            (r'[^"\\]+', String.Double),
            (r"\\.", String.Escape),
            (r'"', String.Double, "#pop"),
        ],
    }


class QLexer(KLexer):
    """
    For `Q <https://code.kx.com/>`_ source code.
    """

    name = "Q"
    aliases = ["q"]
    filenames = ["*.q"]
    version_added = '2.12'

    tokens = {
        "root": [
            (words(("aj", "aj0", "ajf", "ajf0", "all", "and", "any", "asc",
                    "asof", "attr", "avgs", "ceiling", "cols", "count", "cross",
                    "csv", "cut", "deltas", "desc", "differ", "distinct", "dsave",
                    "each", "ej", "ema", "eval", "except", "fby", "fills", "first",
                    "fkeys", "flip", "floor", "get", "group", "gtime", "hclose",
                    "hcount", "hdel", "hsym", "iasc", "idesc", "ij", "ijf",
                    "inter", "inv", "key", "keys", "lj", "ljf", "load", "lower",
                    "lsq", "ltime", "ltrim", "mavg", "maxs", "mcount", "md5",
                    "mdev", "med", "meta", "mins", "mmax", "mmin", "mmu", "mod",
                    "msum", "neg", "next", "not", "null", "or", "over", "parse",
                    "peach", "pj", "prds", "prior", "prev", "rand", "rank", "ratios",
                    "raze", "read0", "read1", "reciprocal", "reval", "reverse",
                    "rload", "rotate", "rsave", "rtrim", "save", "scan", "scov",
                    "sdev", "set", "show", "signum", "ssr", "string", "sublist",
                    "sums", "sv", "svar", "system", "tables", "til", "trim", "txf",
                    "type", "uj", "ujf", "ungroup", "union", "upper", "upsert",
                    "value", "view", "views", "vs", "where", "wj", "wj1", "ww",
                    "xasc", "xbar", "xcol", "xcols", "xdesc", "xgroup", "xkey",
                    "xlog", "xprev", "xrank"),
                    suffix=r"\b"), Name.Builtin,
            ),
            inherit,
        ],
    }
