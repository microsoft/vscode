"""
    pygments.lexers.elpi
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the `Elpi <http://github.com/LPCIC/elpi>`_ programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, using
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['ElpiLexer']

from erdos._vendor.pygments.lexers.theorem import CoqLexer

class ElpiLexer(RegexLexer):
    """
    Lexer for the Elpi programming language.
    """

    name = 'Elpi'
    url = 'http://github.com/LPCIC/elpi'
    aliases = ['elpi']
    filenames = ['*.elpi']
    mimetypes = ['text/x-elpi']
    version_added = '2.11'

    lcase_re = r"[a-z]"
    ucase_re = r"[A-Z]"
    digit_re = r"[0-9]"
    schar2_re = r"([+*^?/<>`'@#~=&!])"
    schar_re = rf"({schar2_re}|-|\$|_)"
    idchar_re = rf"({lcase_re}|{ucase_re}|{digit_re}|{schar_re})"
    idcharstarns_re = rf"({idchar_re}*(\.({lcase_re}|{ucase_re}){idchar_re}*)*)"
    symbchar_re = rf"({lcase_re}|{ucase_re}|{digit_re}|{schar_re}|:)"
    constant_re = rf"({ucase_re}{idchar_re}*|{lcase_re}{idcharstarns_re}|{schar2_re}{symbchar_re}*|_{idchar_re}+)"
    symbol_re = r"(,|<=>|->|:-|;|\?-|->|&|=>|\bas\b|\buvar\b|<|=<|=|==|>=|>|\bi<|\bi=<|\bi>=|\bi>|\bis\b|\br<|\br=<|\br>=|\br>|\bs<|\bs=<|\bs>=|\bs>|@|::|\[\]|`->|`:|`:=|\^|-|\+|\bi-|\bi\+|r-|r\+|/|\*|\bdiv\b|\bi\*|\bmod\b|\br\*|~|\bi~|\br~)"
    escape_re = rf"\(({constant_re}|{symbol_re})\)"
    const_sym_re = rf"({constant_re}|{symbol_re}|{escape_re})"

    tokens = {
        'root': [
            include('elpi')
        ],

        'elpi': [
            include('_elpi-comment'),

            (r"(:before|:after|:if|:name)(\s*)(\")",
             bygroups(Keyword.Mode, Text.Whitespace, String.Double),
             'elpi-string'),
            (r"(:index)(\s*)(\()", bygroups(Keyword.Mode, Text.Whitespace, Punctuation),
             'elpi-indexing-expr'),
            (rf"\b(external pred|pred)(\s+)({const_sym_re})",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-pred-item'),
            (rf"\b(external type|type)(\s+)(({const_sym_re}(,\s*)?)+)",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-type'),
            (rf"\b(kind)(\s+)(({const_sym_re}|,)+)",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-type'),
            (rf"\b(typeabbrev)(\s+)({const_sym_re})",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-type'),
            (r"\b(typeabbrev)(\s+)(\([^)]+\))",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-type'),
            (r"\b(accumulate)(\s+)(\")",
             bygroups(Keyword.Declaration, Text.Whitespace, String.Double),
             'elpi-string'),
            (rf"\b(accumulate|namespace|local)(\s+)({constant_re})",
             bygroups(Keyword.Declaration, Text.Whitespace, Text)),
            (rf"\b(shorten)(\s+)({constant_re}\.)",
             bygroups(Keyword.Declaration, Text.Whitespace, Text)),
            (r"\b(pi|sigma)(\s+)([a-zA-Z][A-Za-z0-9_ ]*)(\\)",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Variable, Text)),
            (rf"\b(constraint)(\s+)(({const_sym_re}(\s+)?)+)",
             bygroups(Keyword.Declaration, Text.Whitespace, Name.Function),
             'elpi-chr-rule-start'),

            (rf"(?=[A-Z_]){constant_re}", Name.Variable),
            (rf"(?=[a-z_])({constant_re}|_)\\", Name.Variable),
            (r"_", Name.Variable),
            (rf"({symbol_re}|!|=>|;)", Keyword.Declaration),
            (constant_re, Text),
            (r"\[|\]|\||=>", Keyword.Declaration),
            (r'"', String.Double, 'elpi-string'),
            (r'`', String.Double, 'elpi-btick'),
            (r'\'', String.Double, 'elpi-tick'),
            (r'\{\{', Punctuation, 'elpi-quote'),
            (r'\{[^\{]', Text, 'elpi-spill'),
            (r"\(", Punctuation, 'elpi-in-parens'),
            (r'\d[\d_]*', Number.Integer),
            (r'-?\d[\d_]*(.[\d_]*)?([eE][+\-]?\d[\d_]*)', Number.Float),
            (r"[\+\*\-/\^\.]", Operator),
        ],
        '_elpi-comment': [
            (r'%[^\n]*\n', Comment),
            (r'/(?:\\\n)?[*](?:[^*]|[*](?!(?:\\\n)?/))*[*](?:\\\n)?/', Comment),
            (r"\s+", Text.Whitespace),
        ],
        'elpi-indexing-expr':[
            (r'[0-9 _]+', Number.Integer),
            (r'\)', Punctuation, '#pop'),
        ],
        'elpi-type': [
            (r"(ctype\s+)(\")", bygroups(Keyword.Type, String.Double), 'elpi-string'),
            (r'->', Keyword.Type),
            (constant_re, Keyword.Type),
            (r"\(|\)", Keyword.Type),
            (r"\.", Text, '#pop'),
            include('_elpi-comment'),
        ],
        'elpi-chr-rule-start': [
            (r"\{", Punctuation, 'elpi-chr-rule'),
            include('_elpi-comment'),
        ],
        'elpi-chr-rule': [
           (r"\brule\b", Keyword.Declaration),
           (r"\\", Keyword.Declaration),
           (r"\}", Punctuation, '#pop:2'),
           include('elpi'),
        ],
        'elpi-pred-item': [
            (r"[io]:", Keyword.Mode, 'elpi-ctype'),
            (r"\.", Text, '#pop'),
            include('_elpi-comment'),
        ],
        'elpi-ctype': [
            (r"(ctype\s+)(\")", bygroups(Keyword.Type, String.Double), 'elpi-string'),
            (r'->', Keyword.Type),
            (constant_re, Keyword.Type),
            (r"\(|\)", Keyword.Type),
            (r",", Text, '#pop'),
            (r"\.", Text, '#pop:2'),
            include('_elpi-comment'),
        ],
        'elpi-btick': [
            (r'[^` ]+', String.Double),
            (r'`', String.Double, '#pop'),
        ],
        'elpi-tick': [
            (r'[^\' ]+', String.Double),
            (r'\'', String.Double, '#pop'),
        ],
        'elpi-string': [
            (r'[^\"]+', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'elpi-quote': [
            (r'\}\}', Punctuation, '#pop'),
            (r"\s+", Text.Whitespace),
            (r"(lp:)(\{\{)", bygroups(Number, Punctuation), 'elpi-quote-exit'),
            (rf"(lp:)((?=[A-Z_]){constant_re})", bygroups(Number, Name.Variable)),
            (r"((?!lp:|\}\}).)+", using(CoqLexer)),
        ],
        'elpi-quote-exit': [
            include('elpi'),
            (r'\}\}', Punctuation, '#pop'),
        ],
        'elpi-spill': [
            (r'\{[^\{]', Text, '#push'),
            (r'\}[^\}]', Text, '#pop'),
            include('elpi'),
        ],
        'elpi-in-parens': [
            (r"\(", Punctuation, '#push'),
            include('elpi'),
            (r"\)", Punctuation, '#pop'),
        ],
    }
