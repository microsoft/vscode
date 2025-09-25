"""
    pygments.lexers.mojo
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Mojo and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import keyword

from erdos._vendor.pygments import unistring as uni
from erdos._vendor.pygments.lexer import (
    RegexLexer,
    bygroups,
    combined,
    default,
    include,
    this,
    using,
    words,
)
from erdos._vendor.pygments.token import (
    Comment,
    # Error,
    Keyword,
    Name,
    Number,
    Operator,
    Punctuation,
    String,
    Text,
    Whitespace,
)
from erdos._vendor.pygments.util import shebang_matches

__all__ = ["MojoLexer"]


class MojoLexer(RegexLexer):
    """
    For Mojo source code (version 24.2.1).
    """

    name = "Mojo"
    url = "https://docs.modular.com/mojo/"
    aliases = ["mojo", "🔥"]
    filenames = [
        "*.mojo",
        "*.🔥",
    ]
    mimetypes = [
        "text/x-mojo",
        "application/x-mojo",
    ]
    version_added = "2.18"

    uni_name = f"[{uni.xid_start}][{uni.xid_continue}]*"

    def innerstring_rules(ttype):
        return [
            # the old style '%s' % (...) string formatting (still valid in Py3)
            (
                r"%(\(\w+\))?[-#0 +]*([0-9]+|[*])?(\.([0-9]+|[*]))?"
                "[hlL]?[E-GXc-giorsaux%]",
                String.Interpol,
            ),
            # the new style '{}'.format(...) string formatting
            (
                r"\{"
                r"((\w+)((\.\w+)|(\[[^\]]+\]))*)?"  # field name
                r"(\![sra])?"  # conversion
                r"(\:(.?[<>=\^])?[-+ ]?#?0?(\d+)?,?(\.\d+)?[E-GXb-gnosx%]?)?"
                r"\}",
                String.Interpol,
            ),
            # backslashes, quotes and formatting signs must be parsed one at a time
            (r'[^\\\'"%{\n]+', ttype),
            (r'[\'"\\]', ttype),
            # unhandled string formatting sign
            (r"%|(\{{1,2})", ttype),
            # newlines are an error (use "nl" state)
        ]

    def fstring_rules(ttype):
        return [
            # Assuming that a '}' is the closing brace after format specifier.
            # Sadly, this means that we won't detect syntax error. But it's
            # more important to parse correct syntax correctly, than to
            # highlight invalid syntax.
            (r"\}", String.Interpol),
            (r"\{", String.Interpol, "expr-inside-fstring"),
            # backslashes, quotes and formatting signs must be parsed one at a time
            (r'[^\\\'"{}\n]+', ttype),
            (r'[\'"\\]', ttype),
            # newlines are an error (use "nl" state)
        ]

    tokens = {
        "root": [
            (r"\s+", Whitespace),
            (
                r'^(\s*)([rRuUbB]{,2})("""(?:.|\n)*?""")',
                bygroups(Whitespace, String.Affix, String.Doc),
            ),
            (
                r"^(\s*)([rRuUbB]{,2})('''(?:.|\n)*?''')",
                bygroups(Whitespace, String.Affix, String.Doc),
            ),
            (r"\A#!.+$", Comment.Hashbang),
            (r"#.*$", Comment.Single),
            (r"\\\n", Whitespace),
            (r"\\", Whitespace),
            include("keywords"),
            include("soft-keywords"),
            # In the original PR, all the below here used ((?:\s|\\\s)+) to
            # designate whitespace, but I can't find any example of this being
            # needed in the example file, so we're replacing it with `\s+`.
            (
                r"(alias)(\s+)",
                bygroups(Keyword, Whitespace),
                "varname",  # TODO varname the right fit?
            ),
            (r"(var)(\s+)", bygroups(Keyword, Whitespace), "varname"),
            (r"(def)(\s+)", bygroups(Keyword, Whitespace), "funcname"),
            (r"(fn)(\s+)", bygroups(Keyword, Whitespace), "funcname"),
            (
                r"(class)(\s+)",
                bygroups(Keyword, Whitespace),
                "classname",
            ),  # not implemented yet
            (r"(struct)(\s+)", bygroups(Keyword, Whitespace), "structname"),
            (r"(trait)(\s+)", bygroups(Keyword, Whitespace), "structname"),
            (r"(from)(\s+)", bygroups(Keyword.Namespace, Whitespace), "fromimport"),
            (r"(import)(\s+)", bygroups(Keyword.Namespace, Whitespace), "import"),
            include("expr"),
        ],
        "expr": [
            # raw f-strings
            (
                '(?i)(rf|fr)(""")',
                bygroups(String.Affix, String.Double),
                combined("rfstringescape", "tdqf"),
            ),
            (
                "(?i)(rf|fr)(''')",
                bygroups(String.Affix, String.Single),
                combined("rfstringescape", "tsqf"),
            ),
            (
                '(?i)(rf|fr)(")',
                bygroups(String.Affix, String.Double),
                combined("rfstringescape", "dqf"),
            ),
            (
                "(?i)(rf|fr)(')",
                bygroups(String.Affix, String.Single),
                combined("rfstringescape", "sqf"),
            ),
            # non-raw f-strings
            (
                '([fF])(""")',
                bygroups(String.Affix, String.Double),
                combined("fstringescape", "tdqf"),
            ),
            (
                "([fF])(''')",
                bygroups(String.Affix, String.Single),
                combined("fstringescape", "tsqf"),
            ),
            (
                '([fF])(")',
                bygroups(String.Affix, String.Double),
                combined("fstringescape", "dqf"),
            ),
            (
                "([fF])(')",
                bygroups(String.Affix, String.Single),
                combined("fstringescape", "sqf"),
            ),
            # raw bytes and strings
            ('(?i)(rb|br|r)(""")', bygroups(String.Affix, String.Double), "tdqs"),
            ("(?i)(rb|br|r)(''')", bygroups(String.Affix, String.Single), "tsqs"),
            ('(?i)(rb|br|r)(")', bygroups(String.Affix, String.Double), "dqs"),
            ("(?i)(rb|br|r)(')", bygroups(String.Affix, String.Single), "sqs"),
            # non-raw strings
            (
                '([uU]?)(""")',
                bygroups(String.Affix, String.Double),
                combined("stringescape", "tdqs"),
            ),
            (
                "([uU]?)(''')",
                bygroups(String.Affix, String.Single),
                combined("stringescape", "tsqs"),
            ),
            (
                '([uU]?)(")',
                bygroups(String.Affix, String.Double),
                combined("stringescape", "dqs"),
            ),
            (
                "([uU]?)(')",
                bygroups(String.Affix, String.Single),
                combined("stringescape", "sqs"),
            ),
            # non-raw bytes
            (
                '([bB])(""")',
                bygroups(String.Affix, String.Double),
                combined("bytesescape", "tdqs"),
            ),
            (
                "([bB])(''')",
                bygroups(String.Affix, String.Single),
                combined("bytesescape", "tsqs"),
            ),
            (
                '([bB])(")',
                bygroups(String.Affix, String.Double),
                combined("bytesescape", "dqs"),
            ),
            (
                "([bB])(')",
                bygroups(String.Affix, String.Single),
                combined("bytesescape", "sqs"),
            ),
            (r"[^\S\n]+", Text),
            include("numbers"),
            (r"!=|==|<<|>>|:=|[-~+/*%=<>&^|.]", Operator),
            (r"([]{}:\(\),;[])+", Punctuation),
            (r"(in|is|and|or|not)\b", Operator.Word),
            include("expr-keywords"),
            include("builtins"),
            include("magicfuncs"),
            include("magicvars"),
            include("name"),
        ],
        "expr-inside-fstring": [
            (r"[{([]", Punctuation, "expr-inside-fstring-inner"),
            # without format specifier
            (
                r"(=\s*)?"  # debug (https://bugs.python.org/issue36817)
                r"(\![sraf])?"  # conversion
                r"\}",
                String.Interpol,
                "#pop",
            ),
            # with format specifier
            # we'll catch the remaining '}' in the outer scope
            (
                r"(=\s*)?"  # debug (https://bugs.python.org/issue36817)
                r"(\![sraf])?"  # conversion
                r":",
                String.Interpol,
                "#pop",
            ),
            (r"\s+", Whitespace),  # allow new lines
            include("expr"),
        ],
        "expr-inside-fstring-inner": [
            (r"[{([]", Punctuation, "expr-inside-fstring-inner"),
            (r"[])}]", Punctuation, "#pop"),
            (r"\s+", Whitespace),  # allow new lines
            include("expr"),
        ],
        "expr-keywords": [
            # Based on https://docs.python.org/3/reference/expressions.html
            (
                words(
                    (
                        "async for",  # TODO https://docs.modular.com/mojo/roadmap#no-async-for-or-async-with
                        "async with",  # TODO https://docs.modular.com/mojo/roadmap#no-async-for-or-async-with
                        "await",
                        "else",
                        "for",
                        "if",
                        "lambda",
                        "yield",
                        "yield from",
                    ),
                    suffix=r"\b",
                ),
                Keyword,
            ),
            (words(("True", "False", "None"), suffix=r"\b"), Keyword.Constant),
        ],
        "keywords": [
            (
                words(
                    (
                        "assert",
                        "async",
                        "await",
                        "borrowed",
                        "break",
                        "continue",
                        "del",
                        "elif",
                        "else",
                        "except",
                        "finally",
                        "for",
                        "global",
                        "if",
                        "lambda",
                        "pass",
                        "raise",
                        "nonlocal",
                        "return",
                        "try",
                        "while",
                        "yield",
                        "yield from",
                        "as",
                        "with",
                    ),
                    suffix=r"\b",
                ),
                Keyword,
            ),
            (words(("True", "False", "None"), suffix=r"\b"), Keyword.Constant),
        ],
        "soft-keywords": [
            # `match`, `case` and `_` soft keywords
            (
                r"(^[ \t]*)"  # at beginning of line + possible indentation
                r"(match|case)\b"  # a possible keyword
                r"(?![ \t]*(?:"  # not followed by...
                r"[:,;=^&|@~)\]}]|(?:" +  # characters and keywords that mean this isn't
                # pattern matching (but None/True/False is ok)
                r"|".join(k for k in keyword.kwlist if k[0].islower())
                + r")\b))",
                bygroups(Whitespace, Keyword),
                "soft-keywords-inner",
            ),
        ],
        "soft-keywords-inner": [
            # optional `_` keyword
            (r"(\s+)([^\n_]*)(_\b)", bygroups(Whitespace, using(this), Keyword)),
            default("#pop"),
        ],
        "builtins": [
            (
                words(
                    (
                        "__import__",
                        "abs",
                        "aiter",
                        "all",
                        "any",
                        "bin",
                        "bool",
                        "bytearray",
                        "breakpoint",
                        "bytes",
                        "callable",
                        "chr",
                        "classmethod",
                        "compile",
                        "complex",
                        "delattr",
                        "dict",
                        "dir",
                        "divmod",
                        "enumerate",
                        "eval",
                        "filter",
                        "float",
                        "format",
                        "frozenset",
                        "getattr",
                        "globals",
                        "hasattr",
                        "hash",
                        "hex",
                        "id",
                        "input",
                        "int",
                        "isinstance",
                        "issubclass",
                        "iter",
                        "len",
                        "list",
                        "locals",
                        "map",
                        "max",
                        "memoryview",
                        "min",
                        "next",
                        "object",
                        "oct",
                        "open",
                        "ord",
                        "pow",
                        "print",
                        "property",
                        "range",
                        "repr",
                        "reversed",
                        "round",
                        "set",
                        "setattr",
                        "slice",
                        "sorted",
                        "staticmethod",
                        "str",
                        "sum",
                        "super",
                        "tuple",
                        "type",
                        "vars",
                        "zip",
                        # Mojo builtin types: https://docs.modular.com/mojo/stdlib/builtin/
                        "AnyType",
                        "Coroutine",
                        "DType",
                        "Error",
                        "Int",
                        "List",
                        "ListLiteral",
                        "Scalar",
                        "Int8",
                        "UInt8",
                        "Int16",
                        "UInt16",
                        "Int32",
                        "UInt32",
                        "Int64",
                        "UInt64",
                        "BFloat16",
                        "Float16",
                        "Float32",
                        "Float64",
                        "SIMD",
                        "String",
                        "Tensor",
                        "Tuple",
                        "Movable",
                        "Copyable",
                        "CollectionElement",
                    ),
                    prefix=r"(?<!\.)",
                    suffix=r"\b",
                ),
                Name.Builtin,
            ),
            (r"(?<!\.)(self|Ellipsis|NotImplemented|cls)\b", Name.Builtin.Pseudo),
            (
                words(
                    ("Error",),
                    prefix=r"(?<!\.)",
                    suffix=r"\b",
                ),
                Name.Exception,
            ),
        ],
        "magicfuncs": [
            (
                words(
                    (
                        "__abs__",
                        "__add__",
                        "__aenter__",
                        "__aexit__",
                        "__aiter__",
                        "__and__",
                        "__anext__",
                        "__await__",
                        "__bool__",
                        "__bytes__",
                        "__call__",
                        "__complex__",
                        "__contains__",
                        "__del__",
                        "__delattr__",
                        "__delete__",
                        "__delitem__",
                        "__dir__",
                        "__divmod__",
                        "__enter__",
                        "__eq__",
                        "__exit__",
                        "__float__",
                        "__floordiv__",
                        "__format__",
                        "__ge__",
                        "__get__",
                        "__getattr__",
                        "__getattribute__",
                        "__getitem__",
                        "__gt__",
                        "__hash__",
                        "__iadd__",
                        "__iand__",
                        "__ifloordiv__",
                        "__ilshift__",
                        "__imatmul__",
                        "__imod__",
                        "__imul__",
                        "__index__",
                        "__init__",
                        "__instancecheck__",
                        "__int__",
                        "__invert__",
                        "__ior__",
                        "__ipow__",
                        "__irshift__",
                        "__isub__",
                        "__iter__",
                        "__itruediv__",
                        "__ixor__",
                        "__le__",
                        "__len__",
                        "__length_hint__",
                        "__lshift__",
                        "__lt__",
                        "__matmul__",
                        "__missing__",
                        "__mod__",
                        "__mul__",
                        "__ne__",
                        "__neg__",
                        "__new__",
                        "__next__",
                        "__or__",
                        "__pos__",
                        "__pow__",
                        "__prepare__",
                        "__radd__",
                        "__rand__",
                        "__rdivmod__",
                        "__repr__",
                        "__reversed__",
                        "__rfloordiv__",
                        "__rlshift__",
                        "__rmatmul__",
                        "__rmod__",
                        "__rmul__",
                        "__ror__",
                        "__round__",
                        "__rpow__",
                        "__rrshift__",
                        "__rshift__",
                        "__rsub__",
                        "__rtruediv__",
                        "__rxor__",
                        "__set__",
                        "__setattr__",
                        "__setitem__",
                        "__str__",
                        "__sub__",
                        "__subclasscheck__",
                        "__truediv__",
                        "__xor__",
                    ),
                    suffix=r"\b",
                ),
                Name.Function.Magic,
            ),
        ],
        "magicvars": [
            (
                words(
                    (
                        "__annotations__",
                        "__bases__",
                        "__class__",
                        "__closure__",
                        "__code__",
                        "__defaults__",
                        "__dict__",
                        "__doc__",
                        "__file__",
                        "__func__",
                        "__globals__",
                        "__kwdefaults__",
                        "__module__",
                        "__mro__",
                        "__name__",
                        "__objclass__",
                        "__qualname__",
                        "__self__",
                        "__slots__",
                        "__weakref__",
                    ),
                    suffix=r"\b",
                ),
                Name.Variable.Magic,
            ),
        ],
        "numbers": [
            (
                r"(\d(?:_?\d)*\.(?:\d(?:_?\d)*)?|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*)"
                r"([eE][+-]?\d(?:_?\d)*)?",
                Number.Float,
            ),
            (r"\d(?:_?\d)*[eE][+-]?\d(?:_?\d)*j?", Number.Float),
            (r"0[oO](?:_?[0-7])+", Number.Oct),
            (r"0[bB](?:_?[01])+", Number.Bin),
            (r"0[xX](?:_?[a-fA-F0-9])+", Number.Hex),
            (r"\d(?:_?\d)*", Number.Integer),
        ],
        "name": [
            (r"@" + uni_name, Name.Decorator),
            (r"@", Operator),  # new matrix multiplication operator
            (uni_name, Name),
        ],
        "varname": [
            (uni_name, Name.Variable, "#pop"),
        ],
        "funcname": [
            include("magicfuncs"),
            (uni_name, Name.Function, "#pop"),
            default("#pop"),
        ],
        "classname": [
            (uni_name, Name.Class, "#pop"),
        ],
        "structname": [
            (uni_name, Name.Struct, "#pop"),
        ],
        "import": [
            (r"(\s+)(as)(\s+)", bygroups(Whitespace, Keyword, Whitespace)),
            (r"\.", Name.Namespace),
            (uni_name, Name.Namespace),
            (r"(\s*)(,)(\s*)", bygroups(Whitespace, Operator, Whitespace)),
            default("#pop"),  # all else: go back
        ],
        "fromimport": [
            (r"(\s+)(import)\b", bygroups(Whitespace, Keyword.Namespace), "#pop"),
            (r"\.", Name.Namespace),
            # if None occurs here, it's "raise x from None", since None can
            # never be a module name
            (r"None\b", Keyword.Constant, "#pop"),
            (uni_name, Name.Namespace),
            default("#pop"),
        ],
        "rfstringescape": [
            (r"\{\{", String.Escape),
            (r"\}\}", String.Escape),
        ],
        "fstringescape": [
            include("rfstringescape"),
            include("stringescape"),
        ],
        "bytesescape": [
            (r'\\([\\abfnrtv"\']|\n|x[a-fA-F0-9]{2}|[0-7]{1,3})', String.Escape)
        ],
        "stringescape": [
            (r"\\(N\{.*?\}|u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8})", String.Escape),
            include("bytesescape"),
        ],
        "fstrings-single": fstring_rules(String.Single),
        "fstrings-double": fstring_rules(String.Double),
        "strings-single": innerstring_rules(String.Single),
        "strings-double": innerstring_rules(String.Double),
        "dqf": [
            (r'"', String.Double, "#pop"),
            (r'\\\\|\\"|\\\n', String.Escape),  # included here for raw strings
            include("fstrings-double"),
        ],
        "sqf": [
            (r"'", String.Single, "#pop"),
            (r"\\\\|\\'|\\\n", String.Escape),  # included here for raw strings
            include("fstrings-single"),
        ],
        "dqs": [
            (r'"', String.Double, "#pop"),
            (r'\\\\|\\"|\\\n', String.Escape),  # included here for raw strings
            include("strings-double"),
        ],
        "sqs": [
            (r"'", String.Single, "#pop"),
            (r"\\\\|\\'|\\\n", String.Escape),  # included here for raw strings
            include("strings-single"),
        ],
        "tdqf": [
            (r'"""', String.Double, "#pop"),
            include("fstrings-double"),
            (r"\n", String.Double),
        ],
        "tsqf": [
            (r"'''", String.Single, "#pop"),
            include("fstrings-single"),
            (r"\n", String.Single),
        ],
        "tdqs": [
            (r'"""', String.Double, "#pop"),
            include("strings-double"),
            (r"\n", String.Double),
        ],
        "tsqs": [
            (r"'''", String.Single, "#pop"),
            include("strings-single"),
            (r"\n", String.Single),
        ],
    }

    def analyse_text(text):
        # TODO supported?
        if shebang_matches(text, r"mojo?"):
            return 1.0
        if "import " in text[:1000]:
            return 0.9
        return 0
