"""
    pygments.lexers.csound
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Csound languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default, include, using, words
from lotas.erdos._vendor.pygments.token import Comment, Error, Keyword, Name, Number, Operator, Punctuation, \
    String, Text, Whitespace
from lotas.erdos._vendor.pygments.lexers._csound_builtins import OPCODES, DEPRECATED_OPCODES, REMOVED_OPCODES
from lotas.erdos._vendor.pygments.lexers.html import HtmlLexer
from lotas.erdos._vendor.pygments.lexers.python import PythonLexer
from lotas.erdos._vendor.pygments.lexers.scripting import LuaLexer

__all__ = ['CsoundScoreLexer', 'CsoundOrchestraLexer', 'CsoundDocumentLexer']

newline = (r'((?:(?:;|//).*)*)(\n)', bygroups(Comment.Single, Text))


class CsoundLexer(RegexLexer):
    url = 'https://csound.com/'

    tokens = {
        'whitespace': [
            (r'[ \t]+', Whitespace),
            (r'/[*](?:.|\n)*?[*]/', Comment.Multiline),
            (r'(?:;|//).*$', Comment.Single),
            (r'(\\)(\n)', bygroups(Text, Whitespace))
        ],

        'preprocessor directives': [
            (r'#(?:e(?:nd(?:if)?|lse)\b|##)|@@?[ \t]*\d+', Comment.Preproc),
            (r'#includestr', Comment.Preproc, 'includestr directive'),
            (r'#include', Comment.Preproc, 'include directive'),
            (r'#[ \t]*define', Comment.Preproc, 'define directive'),
            (r'#(?:ifn?def|undef)\b', Comment.Preproc, 'macro directive')
        ],

        'include directive': [
            include('whitespace'),
            (r'([^ \t]).*?\1', String, '#pop')
        ],
        'includestr directive': [
            include('whitespace'),
            (r'"', String, ('#pop', 'quoted string'))
        ],

        'define directive': [
            (r'\n', Whitespace),
            include('whitespace'),
            (r'([A-Z_a-z]\w*)(\()', bygroups(Comment.Preproc, Punctuation),
             ('#pop', 'macro parameter name list')),
            (r'[A-Z_a-z]\w*', Comment.Preproc, ('#pop', 'before macro body'))
        ],
        'macro parameter name list': [
            include('whitespace'),
            (r'[A-Z_a-z]\w*', Comment.Preproc),
            (r"['#]", Punctuation),
            (r'\)', Punctuation, ('#pop', 'before macro body'))
        ],
        'before macro body': [
            (r'\n', Whitespace),
            include('whitespace'),
            (r'#', Punctuation, ('#pop', 'macro body'))
        ],
        'macro body': [
            (r'(?:\\(?!#)|[^#\\]|\n)+', Comment.Preproc),
            (r'\\#', Comment.Preproc),
            (r'(?<!\\)#', Punctuation, '#pop')
        ],

        'macro directive': [
            include('whitespace'),
            (r'[A-Z_a-z]\w*', Comment.Preproc, '#pop')
        ],

        'macro uses': [
            (r'(\$[A-Z_a-z]\w*\.?)(\()', bygroups(Comment.Preproc, Punctuation),
             'macro parameter value list'),
            (r'\$[A-Z_a-z]\w*(?:\.|\b)', Comment.Preproc)
        ],
        'macro parameter value list': [
            (r'(?:[^\'#"{()]|\{(?!\{))+', Comment.Preproc),
            (r"['#]", Punctuation),
            (r'"', String, 'macro parameter value quoted string'),
            (r'\{\{', String, 'macro parameter value braced string'),
            (r'\(', Comment.Preproc, 'macro parameter value parenthetical'),
            (r'\)', Punctuation, '#pop')
        ],
        'macro parameter value quoted string': [
            (r"\\[#'()]", Comment.Preproc),
            (r"[#'()]", Error),
            include('quoted string')
        ],
        'macro parameter value braced string': [
            (r"\\[#'()]", Comment.Preproc),
            (r"[#'()]", Error),
            include('braced string')
        ],
        'macro parameter value parenthetical': [
            (r'(?:[^\\()]|\\\))+', Comment.Preproc),
            (r'\(', Comment.Preproc, '#push'),
            (r'\)', Comment.Preproc, '#pop')
        ],

        'whitespace and macro uses': [
            include('whitespace'),
            include('macro uses')
        ],

        'numbers': [
            (r'\d+[Ee][+-]?\d+|(\d+\.\d*|\d*\.\d+)([Ee][+-]?\d+)?', Number.Float),
            (r'(0[Xx])([0-9A-Fa-f]+)', bygroups(Keyword.Type, Number.Hex)),
            (r'\d+', Number.Integer)
        ],

        'quoted string': [
            (r'"', String, '#pop'),
            (r'[^"$]+', String),
            include('macro uses'),
            (r'[$]', String)
        ],

        'braced string': [
            # Do nothing. This must be defined in subclasses.
        ]
    }


class CsoundScoreLexer(CsoundLexer):
    """
    For `Csound <https://csound.com>`_ scores.
    """

    name = 'Csound Score'
    aliases = ['csound-score', 'csound-sco']
    filenames = ['*.sco']
    version_added = '2.1'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            include('whitespace and macro uses'),
            include('preprocessor directives'),

            (r'[aBbCdefiqstvxy]', Keyword),
            # There is also a w statement that is generated internally and should not be
            # used; see https://github.com/csound/csound/issues/750.

            (r'z', Keyword.Constant),
            # z is a constant equal to 800,000,000,000. 800 billion seconds is about
            # 25,367.8 years. See also
            # https://csound.com/docs/manual/ScoreTop.html and
            # https://github.com/csound/csound/search?q=stof+path%3AEngine+filename%3Asread.c.

            (r'([nNpP][pP])(\d+)', bygroups(Keyword, Number.Integer)),

            (r'[mn]', Keyword, 'mark statement'),

            include('numbers'),
            (r'[!+\-*/^%&|<>#~.]', Operator),
            (r'[()\[\]]', Punctuation),
            (r'"', String, 'quoted string'),
            (r'\{', Comment.Preproc, 'loop after left brace'),
        ],

        'mark statement': [
            include('whitespace and macro uses'),
            (r'[A-Z_a-z]\w*', Name.Label),
            (r'\n', Whitespace, '#pop')
        ],

        'loop after left brace': [
            include('whitespace and macro uses'),
            (r'\d+', Number.Integer, ('#pop', 'loop after repeat count')),
        ],
        'loop after repeat count': [
            include('whitespace and macro uses'),
            (r'[A-Z_a-z]\w*', Comment.Preproc, ('#pop', 'loop'))
        ],
        'loop': [
            (r'\}', Comment.Preproc, '#pop'),
            include('root')
        ],

        # Braced strings are not allowed in Csound scores, but this is needed because the
        # superclass includes it.
        'braced string': [
            (r'\}\}', String, '#pop'),
            (r'[^}]|\}(?!\})', String)
        ]
    }


class CsoundOrchestraLexer(CsoundLexer):
    """
    For `Csound <https://csound.com>`_ orchestras.
    """

    name = 'Csound Orchestra'
    aliases = ['csound', 'csound-orc']
    filenames = ['*.orc', '*.udo']
    version_added = '2.1'

    user_defined_opcodes = set()

    def opcode_name_callback(lexer, match):
        opcode = match.group(0)
        lexer.user_defined_opcodes.add(opcode)
        yield match.start(), Name.Function, opcode

    def name_callback(lexer, match):
        type_annotation_token = Keyword.Type

        name = match.group(1)
        if name in OPCODES or name in DEPRECATED_OPCODES or name in REMOVED_OPCODES:
            yield match.start(), Name.Builtin, name
        elif name in lexer.user_defined_opcodes:
            yield match.start(), Name.Function, name
        else:
            type_annotation_token = Name
            name_match = re.search(r'^(g?[afikSw])(\w+)', name)
            if name_match:
                yield name_match.start(1), Keyword.Type, name_match.group(1)
                yield name_match.start(2), Name, name_match.group(2)
            else:
                yield match.start(), Name, name

        if match.group(2):
            yield match.start(2), Punctuation, match.group(2)
            yield match.start(3), type_annotation_token, match.group(3)

    tokens = {
        'root': [
            (r'\n', Whitespace),

            (r'^([ \t]*)(\w+)(:)([ \t]+|$)', bygroups(Whitespace, Name.Label, Punctuation, Whitespace)),

            include('whitespace and macro uses'),
            include('preprocessor directives'),

            (r'\binstr\b', Keyword.Declaration, 'instrument numbers and identifiers'),
            (r'\bopcode\b', Keyword.Declaration, 'after opcode keyword'),
            (r'\b(?:end(?:in|op))\b', Keyword.Declaration),

            include('partial statements')
        ],

        'partial statements': [
            (r'\b(?:0dbfs|A4|k(?:r|smps)|nchnls(?:_i)?|sr)\b', Name.Variable.Global),

            include('numbers'),

            (r'\+=|-=|\*=|/=|<<|>>|<=|>=|==|!=|&&|\|\||[~¬]|[=!+\-*/^%&|<>#?:]', Operator),
            (r'[(),\[\]]', Punctuation),

            (r'"', String, 'quoted string'),
            (r'\{\{', String, 'braced string'),

            (words((
                'do', 'else', 'elseif', 'endif', 'enduntil', 'fi', 'if', 'ithen', 'kthen',
                'od', 'then', 'until', 'while',
                ), prefix=r'\b', suffix=r'\b'), Keyword),
            (words(('return', 'rireturn'), prefix=r'\b', suffix=r'\b'), Keyword.Pseudo),

            (r'\b[ik]?goto\b', Keyword, 'goto label'),
            (r'\b(r(?:einit|igoto)|tigoto)(\(|\b)', bygroups(Keyword.Pseudo, Punctuation),
             'goto label'),
            (r'\b(c(?:g|in?|k|nk?)goto)(\(|\b)', bygroups(Keyword.Pseudo, Punctuation),
             ('goto label', 'goto argument')),
            (r'\b(timout)(\(|\b)', bygroups(Keyword.Pseudo, Punctuation),
             ('goto label', 'goto argument', 'goto argument')),
            (r'\b(loop_[gl][et])(\(|\b)', bygroups(Keyword.Pseudo, Punctuation),
             ('goto label', 'goto argument', 'goto argument', 'goto argument')),

            (r'\bprintk?s\b', Name.Builtin, 'prints opcode'),
            (r'\b(?:readscore|scoreline(?:_i)?)\b', Name.Builtin, 'Csound score opcode'),
            (r'\bpyl?run[it]?\b', Name.Builtin, 'Python opcode'),
            (r'\blua_(?:exec|opdef)\b', Name.Builtin, 'Lua opcode'),
            (r'\bp\d+\b', Name.Variable.Instance),
            (r'\b([A-Z_a-z]\w*)(?:(:)([A-Za-z]))?\b', name_callback)
        ],

        'instrument numbers and identifiers': [
            include('whitespace and macro uses'),
            (r'\d+|[A-Z_a-z]\w*', Name.Function),
            (r'[+,]', Punctuation),
            (r'\n', Whitespace, '#pop')
        ],

        'after opcode keyword': [
            include('whitespace and macro uses'),
            (r'[A-Z_a-z]\w*', opcode_name_callback, ('#pop', 'opcode type signatures')),
            (r'\n', Whitespace, '#pop')
        ],
        'opcode type signatures': [
            include('whitespace and macro uses'),

            # https://github.com/csound/csound/search?q=XIDENT+path%3AEngine+filename%3Acsound_orc.lex
            (r'0|[afijkKoOpPStV\[\]]+', Keyword.Type),

            (r',', Punctuation),
            (r'\n', Whitespace, '#pop')
        ],

        'quoted string': [
            (r'"', String, '#pop'),
            (r'[^\\"$%)]+', String),
            include('macro uses'),
            include('escape sequences'),
            include('format specifiers'),
            (r'[\\$%)]', String)
        ],
        'braced string': [
            (r'\}\}', String, '#pop'),
            (r'(?:[^\\%)}]|\}(?!\}))+', String),
            include('escape sequences'),
            include('format specifiers'),
            (r'[\\%)]', String)
        ],
        'escape sequences': [
            # https://github.com/csound/csound/search?q=unquote_string+path%3AEngine+filename%3Acsound_orc_compile.c
            (r'\\(?:[\\abnrt"]|[0-7]{1,3})', String.Escape)
        ],
        # Format specifiers are highlighted in all strings, even though only
        #   fprintks        https://csound.com/docs/manual/fprintks.html
        #   fprints         https://csound.com/docs/manual/fprints.html
        #   printf/printf_i https://csound.com/docs/manual/printf.html
        #   printks         https://csound.com/docs/manual/printks.html
        #   prints          https://csound.com/docs/manual/prints.html
        #   sprintf         https://csound.com/docs/manual/sprintf.html
        #   sprintfk        https://csound.com/docs/manual/sprintfk.html
        # work with strings that contain format specifiers. In addition, these opcodes’
        # handling of format specifiers is inconsistent:
        #   - fprintks and fprints accept %a and %A specifiers, and accept %s specifiers
        #     starting in Csound 6.15.0.
        #   - printks and prints accept %a and %A specifiers, but don’t accept %s
        #     specifiers.
        #   - printf, printf_i, sprintf, and sprintfk don’t accept %a and %A specifiers,
        #     but accept %s specifiers.
        # See https://github.com/csound/csound/issues/747 for more information.
        'format specifiers': [
            (r'%[#0\- +]*\d*(?:\.\d+)?[AE-GXac-giosux]', String.Interpol),
            (r'%%', String.Escape)
        ],

        'goto argument': [
            include('whitespace and macro uses'),
            (r',', Punctuation, '#pop'),
            include('partial statements')
        ],
        'goto label': [
            include('whitespace and macro uses'),
            (r'\w+', Name.Label, '#pop'),
            default('#pop')
        ],

        'prints opcode': [
            include('whitespace and macro uses'),
            (r'"', String, 'prints quoted string'),
            default('#pop')
        ],
        'prints quoted string': [
            (r'\\\\[aAbBnNrRtT]', String.Escape),
            (r'%[!nNrRtT]|[~^]{1,2}', String.Escape),
            include('quoted string')
        ],

        'Csound score opcode': [
            include('whitespace and macro uses'),
            (r'"', String, 'quoted string'),
            (r'\{\{', String, 'Csound score'),
            (r'\n', Whitespace, '#pop')
        ],
        'Csound score': [
            (r'\}\}', String, '#pop'),
            (r'([^}]+)|\}(?!\})', using(CsoundScoreLexer))
        ],

        'Python opcode': [
            include('whitespace and macro uses'),
            (r'"', String, 'quoted string'),
            (r'\{\{', String, 'Python'),
            (r'\n', Whitespace, '#pop')
        ],
        'Python': [
            (r'\}\}', String, '#pop'),
            (r'([^}]+)|\}(?!\})', using(PythonLexer))
        ],

        'Lua opcode': [
            include('whitespace and macro uses'),
            (r'"', String, 'quoted string'),
            (r'\{\{', String, 'Lua'),
            (r'\n', Whitespace, '#pop')
        ],
        'Lua': [
            (r'\}\}', String, '#pop'),
            (r'([^}]+)|\}(?!\})', using(LuaLexer))
        ]
    }


class CsoundDocumentLexer(RegexLexer):
    """
    For Csound documents.
    """

    name = 'Csound Document'
    aliases = ['csound-document', 'csound-csd']
    filenames = ['*.csd']
    url = 'https://csound.com'
    version_added = '2.1'

    # These tokens are based on those in XmlLexer in pygments/lexers/html.py. Making
    # CsoundDocumentLexer a subclass of XmlLexer rather than RegexLexer may seem like a
    # better idea, since Csound Document files look like XML files. However, Csound
    # Documents can contain Csound comments (preceded by //, for example) before and
    # after the root element, unescaped bitwise AND & and less than < operators, etc. In
    # other words, while Csound Document files look like XML files, they may not actually
    # be XML files.
    tokens = {
        'root': [
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (r'(?:;|//).*$', Comment.Single),
            (r'[^/;<]+|/(?!/)', Text),

            (r'<\s*CsInstruments', Name.Tag, ('orchestra', 'tag')),
            (r'<\s*CsScore', Name.Tag, ('score', 'tag')),
            (r'<\s*[Hh][Tt][Mm][Ll]', Name.Tag, ('HTML', 'tag')),

            (r'<\s*[\w:.-]+', Name.Tag, 'tag'),
            (r'<\s*/\s*[\w:.-]+\s*>', Name.Tag)
        ],

        'orchestra': [
            (r'<\s*/\s*CsInstruments\s*>', Name.Tag, '#pop'),
            (r'(.|\n)+?(?=<\s*/\s*CsInstruments\s*>)', using(CsoundOrchestraLexer))
        ],
        'score': [
            (r'<\s*/\s*CsScore\s*>', Name.Tag, '#pop'),
            (r'(.|\n)+?(?=<\s*/\s*CsScore\s*>)', using(CsoundScoreLexer))
        ],
        'HTML': [
            (r'<\s*/\s*[Hh][Tt][Mm][Ll]\s*>', Name.Tag, '#pop'),
            (r'(.|\n)+?(?=<\s*/\s*[Hh][Tt][Mm][Ll]\s*>)', using(HtmlLexer))
        ],

        'tag': [
            (r'\s+', Whitespace),
            (r'[\w.:-]+\s*=', Name.Attribute, 'attr'),
            (r'/?\s*>', Name.Tag, '#pop')
        ],
        'attr': [
            (r'\s+', Whitespace),
            (r'".*?"', String, '#pop'),
            (r"'.*?'", String, '#pop'),
            (r'[^\s>]+', String, '#pop')
        ]
    }
