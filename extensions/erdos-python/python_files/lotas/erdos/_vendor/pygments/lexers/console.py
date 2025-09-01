"""
    pygments.lexers.console
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for misc console output.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from erdos._vendor.pygments.token import Generic, Comment, String, Text, Keyword, Name, \
    Punctuation, Number, Whitespace

__all__ = ['VCTreeStatusLexer', 'PyPyLogLexer']


class VCTreeStatusLexer(RegexLexer):
    """
    For colorizing output of version control status commands, like "hg
    status" or "svn status".
    """
    name = 'VCTreeStatus'
    aliases = ['vctreestatus']
    filenames = []
    mimetypes = []
    url = ""
    version_added = '2.0'

    tokens = {
        'root': [
            (r'^A  \+  C\s+', Generic.Error),
            (r'^A\s+\+?\s+', String),
            (r'^M\s+', Generic.Inserted),
            (r'^C\s+', Generic.Error),
            (r'^D\s+', Generic.Deleted),
            (r'^[?!]\s+', Comment.Preproc),
            (r'      >\s+.*\n', Comment.Preproc),
            (r'\S+', Text),
            (r'\s+', Whitespace),
        ]
    }


class PyPyLogLexer(RegexLexer):
    """
    Lexer for PyPy log files.
    """
    name = "PyPy Log"
    aliases = ["pypylog", "pypy"]
    filenames = ["*.pypylog"]
    mimetypes = ['application/x-pypylog']
    url = 'pypy.org'
    version_added = '1.5'

    tokens = {
        "root": [
            (r"\[\w+\] \{jit-log-.*?$", Keyword, "jit-log"),
            (r"\[\w+\] \{jit-backend-counts$", Keyword, "jit-backend-counts"),
            include("extra-stuff"),
        ],
        "jit-log": [
            (r"\[\w+\] jit-log-.*?}$", Keyword, "#pop"),
            (r"^\+\d+: ", Comment),
            (r"--end of the loop--", Comment),
            (r"[ifp]\d+", Name),
            (r"ptr\d+", Name),
            (r"(\()(\w+(?:\.\w+)?)(\))",
             bygroups(Punctuation, Name.Builtin, Punctuation)),
            (r"[\[\]=,()]", Punctuation),
            (r"(\d+\.\d+|inf|-inf)", Number.Float),
            (r"-?\d+", Number.Integer),
            (r"'.*'", String),
            (r"(None|descr|ConstClass|ConstPtr|TargetToken)", Name),
            (r"<.*?>+", Name.Builtin),
            (r"(label|debug_merge_point|jump|finish)", Name.Class),
            (r"(int_add_ovf|int_add|int_sub_ovf|int_sub|int_mul_ovf|int_mul|"
             r"int_floordiv|int_mod|int_lshift|int_rshift|int_and|int_or|"
             r"int_xor|int_eq|int_ne|int_ge|int_gt|int_le|int_lt|int_is_zero|"
             r"int_is_true|"
             r"uint_floordiv|uint_ge|uint_lt|"
             r"float_add|float_sub|float_mul|float_truediv|float_neg|"
             r"float_eq|float_ne|float_ge|float_gt|float_le|float_lt|float_abs|"
             r"ptr_eq|ptr_ne|instance_ptr_eq|instance_ptr_ne|"
             r"cast_int_to_float|cast_float_to_int|"
             r"force_token|quasiimmut_field|same_as|virtual_ref_finish|"
             r"virtual_ref|mark_opaque_ptr|"
             r"call_may_force|call_assembler|call_loopinvariant|"
             r"call_release_gil|call_pure|call|"
             r"new_with_vtable|new_array|newstr|newunicode|new|"
             r"arraylen_gc|"
             r"getarrayitem_gc_pure|getarrayitem_gc|setarrayitem_gc|"
             r"getarrayitem_raw|setarrayitem_raw|getfield_gc_pure|"
             r"getfield_gc|getinteriorfield_gc|setinteriorfield_gc|"
             r"getfield_raw|setfield_gc|setfield_raw|"
             r"strgetitem|strsetitem|strlen|copystrcontent|"
             r"unicodegetitem|unicodesetitem|unicodelen|"
             r"guard_true|guard_false|guard_value|guard_isnull|"
             r"guard_nonnull_class|guard_nonnull|guard_class|guard_no_overflow|"
             r"guard_not_forced|guard_no_exception|guard_not_invalidated)",
             Name.Builtin),
            include("extra-stuff"),
        ],
        "jit-backend-counts": [
            (r"\[\w+\] jit-backend-counts}$", Keyword, "#pop"),
            (r":", Punctuation),
            (r"\d+", Number),
            include("extra-stuff"),
        ],
        "extra-stuff": [
            (r"\s+", Whitespace),
            (r"#.*?$", Comment),
        ],
    }
