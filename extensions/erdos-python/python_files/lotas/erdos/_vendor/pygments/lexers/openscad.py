"""
    pygments.lexers.openscad
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the OpenSCAD languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words, include
from lotas.erdos._vendor.pygments.token import Text, Comment, Punctuation, Operator, Keyword, Name, Number, Whitespace, Literal, String

__all__ = ['OpenScadLexer']


class OpenScadLexer(RegexLexer):
    """For openSCAD code.
    """
    name = "OpenSCAD"
    url = "https://openscad.org/"
    aliases = ["openscad"]
    filenames = ["*.scad"]
    mimetypes = ["application/x-openscad"]
    version_added = '2.16'

    tokens = {
        "root": [
            (r"[^\S\n]+", Whitespace),
            (r'//', Comment.Single, 'comment-single'),
            (r'/\*', Comment.Multiline, 'comment-multi'),
            (r"[{}\[\]\(\),;:]", Punctuation),
            (r"[*!#%\-+=?/]", Operator),
            (r"<=|<|==|!=|>=|>|&&|\|\|", Operator),
            (r"\$(f[asn]|t|vp[rtd]|children)", Operator),
            (r"(undef|PI)\b", Keyword.Constant),
            (
                r"(use|include)((?:\s|\\\\s)+)",
                bygroups(Keyword.Namespace, Text),
                "includes",
            ),
            (r"(module)(\s*)([^\s\(]+)",
             bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
            (r"(function)(\s*)([^\s\(]+)",
             bygroups(Keyword.Declaration, Whitespace, Name.Function)),
            (words(("true", "false"), prefix=r"\b", suffix=r"\b"), Literal),
            (words((
                "function", "module", "include", "use", "for",
                "intersection_for", "if", "else", "return"
                ), prefix=r"\b", suffix=r"\b"), Keyword
            ),
            (words((
                "circle", "square", "polygon", "text", "sphere", "cube",
                "cylinder", "polyhedron", "translate", "rotate", "scale",
                "resize", "mirror", "multmatrix", "color", "offset", "hull",
                "minkowski", "union", "difference", "intersection", "abs",
                "sign", "sin", "cos", "tan", "acos", "asin", "atan", "atan2",
                "floor", "round", "ceil", "ln", "log", "pow", "sqrt", "exp",
                "rands", "min", "max", "concat", "lookup", "str", "chr",
                "search", "version", "version_num", "norm", "cross",
                "parent_module", "echo", "import", "import_dxf",
                "dxf_linear_extrude", "linear_extrude", "rotate_extrude",
                "surface", "projection", "render", "dxf_cross",
                "dxf_dim", "let", "assign", "len"
                ), prefix=r"\b", suffix=r"\b"),
                Name.Builtin
            ),
            (r"\bchildren\b", Name.Builtin.Pseudo),
            (r'""".*?"""', String.Double),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"-?\d+(\.\d+)?(e[+-]?\d+)?", Number),
            (r"\w+", Name),
        ],
        "includes": [
            (
                r"(<)([^>]*)(>)",
                bygroups(Punctuation, Comment.PreprocFile, Punctuation),
            ),
        ],
        'comment': [
            (r':param: [a-zA-Z_]\w*|:returns?:|(FIXME|MARK|TODO):',
             Comment.Special)
        ],
        'comment-single': [
            (r'\n', Text, '#pop'),
            include('comment'),
            (r'[^\n]+', Comment.Single)
        ],
        'comment-multi': [
            include('comment'),
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
    }
