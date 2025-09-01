"""
    pygments.lexers.slash
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Slash programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import ExtendedRegexLexer, bygroups, DelegatingLexer
from erdos._vendor.pygments.token import Name, Number, String, Comment, Punctuation, \
    Other, Keyword, Operator, Whitespace

__all__ = ['SlashLexer']


class SlashLanguageLexer(ExtendedRegexLexer):
    _nkw = r'(?=[^a-zA-Z_0-9])'

    def move_state(new_state):
        return ("#pop", new_state)

    def right_angle_bracket(lexer, match, ctx):
        if len(ctx.stack) > 1 and ctx.stack[-2] == "string":
            ctx.stack.pop()
        yield match.start(), String.Interpol, '}'
        ctx.pos = match.end()
        pass

    tokens = {
        "root": [
            (r"<%=",        Comment.Preproc,    move_state("slash")),
            (r"<%!!",       Comment.Preproc,    move_state("slash")),
            (r"<%#.*?%>",   Comment.Multiline),
            (r"<%",         Comment.Preproc,    move_state("slash")),
            (r".|\n",       Other),
        ],
        "string": [
            (r"\\",         String.Escape,      move_state("string_e")),
            (r"\"",         String,             move_state("slash")),
            (r"#\{",        String.Interpol,    "slash"),
            (r'.|\n',       String),
        ],
        "string_e": [
            (r'n',                  String.Escape,      move_state("string")),
            (r't',                  String.Escape,      move_state("string")),
            (r'r',                  String.Escape,      move_state("string")),
            (r'e',                  String.Escape,      move_state("string")),
            (r'x[a-fA-F0-9]{2}',    String.Escape,      move_state("string")),
            (r'.',                  String.Escape,      move_state("string")),
        ],
        "regexp": [
            (r'}[a-z]*',            String.Regex,       move_state("slash")),
            (r'\\(.|\n)',           String.Regex),
            (r'{',                  String.Regex,       "regexp_r"),
            (r'.|\n',               String.Regex),
        ],
        "regexp_r": [
            (r'}[a-z]*',            String.Regex,       "#pop"),
            (r'\\(.|\n)',           String.Regex),
            (r'{',                  String.Regex,       "regexp_r"),
        ],
        "slash": [
            (r"%>",                     Comment.Preproc,    move_state("root")),
            (r"\"",                     String,             move_state("string")),
            (r"'[a-zA-Z0-9_]+",         String),
            (r'%r{',                    String.Regex,       move_state("regexp")),
            (r'/\*.*?\*/',              Comment.Multiline),
            (r"(#|//).*?\n",            Comment.Single),
            (r'-?[0-9]+e[+-]?[0-9]+',   Number.Float),
            (r'-?[0-9]+\.[0-9]+(e[+-]?[0-9]+)?', Number.Float),
            (r'-?[0-9]+',               Number.Integer),
            (r'nil'+_nkw,               Name.Builtin),
            (r'true'+_nkw,              Name.Builtin),
            (r'false'+_nkw,             Name.Builtin),
            (r'self'+_nkw,              Name.Builtin),
            (r'(class)(\s+)([A-Z][a-zA-Z0-9_\']*)',
                bygroups(Keyword, Whitespace, Name.Class)),
            (r'class'+_nkw,             Keyword),
            (r'extends'+_nkw,           Keyword),
            (r'(def)(\s+)(self)(\s*)(\.)(\s*)([a-z_][a-zA-Z0-9_\']*=?|<<|>>|==|<=>|<=|<|>=|>|\+|-(self)?|~(self)?|\*|/|%|^|&&|&|\||\[\]=?)',
                bygroups(Keyword, Whitespace, Name.Builtin, Whitespace, Punctuation, Whitespace, Name.Function)),
            (r'(def)(\s+)([a-z_][a-zA-Z0-9_\']*=?|<<|>>|==|<=>|<=|<|>=|>|\+|-(self)?|~(self)?|\*|/|%|^|&&|&|\||\[\]=?)',
                bygroups(Keyword, Whitespace, Name.Function)),
            (r'def'+_nkw,               Keyword),
            (r'if'+_nkw,                Keyword),
            (r'elsif'+_nkw,             Keyword),
            (r'else'+_nkw,              Keyword),
            (r'unless'+_nkw,            Keyword),
            (r'for'+_nkw,               Keyword),
            (r'in'+_nkw,                Keyword),
            (r'while'+_nkw,             Keyword),
            (r'until'+_nkw,             Keyword),
            (r'and'+_nkw,               Keyword),
            (r'or'+_nkw,                Keyword),
            (r'not'+_nkw,               Keyword),
            (r'lambda'+_nkw,            Keyword),
            (r'try'+_nkw,               Keyword),
            (r'catch'+_nkw,             Keyword),
            (r'return'+_nkw,            Keyword),
            (r'next'+_nkw,              Keyword),
            (r'last'+_nkw,              Keyword),
            (r'throw'+_nkw,             Keyword),
            (r'use'+_nkw,               Keyword),
            (r'switch'+_nkw,            Keyword),
            (r'\\',                     Keyword),
            (r'λ',                      Keyword),
            (r'__FILE__'+_nkw,          Name.Builtin.Pseudo),
            (r'__LINE__'+_nkw,          Name.Builtin.Pseudo),
            (r'[A-Z][a-zA-Z0-9_\']*'+_nkw, Name.Constant),
            (r'[a-z_][a-zA-Z0-9_\']*'+_nkw, Name),
            (r'@[a-z_][a-zA-Z0-9_\']*'+_nkw, Name.Variable.Instance),
            (r'@@[a-z_][a-zA-Z0-9_\']*'+_nkw, Name.Variable.Class),
            (r'\(',                     Punctuation),
            (r'\)',                     Punctuation),
            (r'\[',                     Punctuation),
            (r'\]',                     Punctuation),
            (r'\{',                     Punctuation),
            (r'\}',                     right_angle_bracket),
            (r';',                      Punctuation),
            (r',',                      Punctuation),
            (r'<<=',                    Operator),
            (r'>>=',                    Operator),
            (r'<<',                     Operator),
            (r'>>',                     Operator),
            (r'==',                     Operator),
            (r'!=',                     Operator),
            (r'=>',                     Operator),
            (r'=',                      Operator),
            (r'<=>',                    Operator),
            (r'<=',                     Operator),
            (r'>=',                     Operator),
            (r'<',                      Operator),
            (r'>',                      Operator),
            (r'\+\+',                   Operator),
            (r'\+=',                    Operator),
            (r'-=',                     Operator),
            (r'\*\*=',                  Operator),
            (r'\*=',                    Operator),
            (r'\*\*',                   Operator),
            (r'\*',                     Operator),
            (r'/=',                     Operator),
            (r'\+',                     Operator),
            (r'-',                      Operator),
            (r'/',                      Operator),
            (r'%=',                     Operator),
            (r'%',                      Operator),
            (r'^=',                     Operator),
            (r'&&=',                    Operator),
            (r'&=',                     Operator),
            (r'&&',                     Operator),
            (r'&',                      Operator),
            (r'\|\|=',                  Operator),
            (r'\|=',                    Operator),
            (r'\|\|',                   Operator),
            (r'\|',                     Operator),
            (r'!',                      Operator),
            (r'\.\.\.',                 Operator),
            (r'\.\.',                   Operator),
            (r'\.',                     Operator),
            (r'::',                     Operator),
            (r':',                      Operator),
            (r'(\s|\n)+',               Whitespace),
            (r'[a-z_][a-zA-Z0-9_\']*',  Name.Variable),
        ],
    }


class SlashLexer(DelegatingLexer):
    """
    Lexer for the Slash programming language.
    """

    name = 'Slash'
    aliases = ['slash']
    filenames = ['*.sla']
    url = 'https://github.com/arturadib/Slash-A'
    version_added = '2.4'

    def __init__(self, **options):
        from erdos._vendor.pygments.lexers.web import HtmlLexer
        super().__init__(HtmlLexer, SlashLanguageLexer, **options)
