"""
    pygments.lexers.vip
    ~~~~~~~~~~~~~~~~~~~

    Lexers for Visual Prolog & Grammar files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, inherit, words, include
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['VisualPrologLexer', 'VisualPrologGrammarLexer']


class VisualPrologBaseLexer(RegexLexer):
    minorendkw = ('try', 'foreach', 'if')
    minorkwexp = ('and', 'catch', 'do', 'else', 'elseif', 'erroneous', 'externally', 'failure', 'finally', 'foreach', 'if', 'or', 'orelse', 'otherwise', 'then',
                  'try', 'div', 'mod', 'rem', 'quot')
    dockw = ('short', 'detail', 'end', 'withdomain')
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (words(minorendkw, prefix=r'\bend\s+', suffix=r'\b'), Keyword.Minor),
            (r'end', Keyword),
            (words(minorkwexp, suffix=r'\b'), Keyword.Minor),
            (r'0[xo][\da-fA-F_]+', Number),
            (r'((\d[\d_]*)?\.)?\d[\d_]*([eE][\-+]?\d+)?', Number),
            (r'_\w*', Name.Variable.Anonymous),
            (r'[A-Z]\w*', Name.Variable),
            (r'@\w+', Name.Variable),
            (r'[a-z]\w*', Name),
            (r'/\*', Comment, 'comment'),
            (r'\%', Comment, 'commentline'),
            (r'"', String.Symbol, 'string'),
            (r'\'', String.Symbol, 'stringsingle'),
            (r'@"', String.Symbol, 'atstring'),
            (r'[\-+*^/!?<>=~:]+', Operator),
            (r'[$,.[\]|(){}\\]+', Punctuation),
            (r'.', Text),
        ],
        'commentdoc': [
            (words(dockw, prefix=r'@', suffix=r'\b'), Comment.Preproc),
            (r'@', Comment),
        ],
        'commentline': [
            include('commentdoc'),
            (r'[^@\n]+', Comment),
            (r'$', Comment, '#pop'),
        ],
        'comment': [
            include('commentdoc'),
            (r'[^@*/]+', Comment),
            (r'/\*', Comment, '#push'),
            (r'\*/', Comment, '#pop'),
            (r'[*/]', Comment),
        ],
        'stringescape': [
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\[\'"ntr\\]', String.Escape),
        ],
        'stringsingle': [
            include('stringescape'),
            (r'\'', String.Symbol, '#pop'),
            (r'[^\'\\\n]+', String),
            (r'\n', String.Escape.Error, '#pop'),
        ],
        'string': [
            include('stringescape'),
            (r'"', String.Symbol, '#pop'),
            (r'[^"\\\n]+', String),
            (r'\n', String.Escape.Error, '#pop'),
        ],
        'atstring': [
            (r'""', String.Escape),
            (r'"', String.Symbol, '#pop'),
            (r'[^"]+', String),
        ]
    }


class VisualPrologLexer(VisualPrologBaseLexer):
    """Lexer for VisualProlog
    """
    name = 'Visual Prolog'
    url = 'https://www.visual-prolog.com/'
    aliases = ['visualprolog']
    filenames = ['*.pro', '*.cl', '*.i', '*.pack', '*.ph']
    version_added = '2.17'

    majorkw = ('goal', 'namespace', 'interface', 'class', 'implement', 'where', 'open', 'inherits', 'supports', 'resolve',
               'delegate', 'monitor', 'constants', 'domains', 'predicates', 'constructors', 'properties', 'clauses', 'facts')
    minorkw = ('align', 'anyflow', 'as', 'bitsize', 'determ', 'digits', 'erroneous', 'externally', 'failure', 'from',
               'guard', 'multi', 'nondeterm', 'or', 'orelse', 'otherwise', 'procedure', 'resolve', 'single', 'suspending')
    directivekw = ('bininclude', 'else', 'elseif', 'endif', 'error', 'export', 'externally', 'from', 'grammargenerate',
                   'grammarinclude', 'if', 'include', 'message', 'options', 'orrequires', 'requires', 'stringinclude', 'then')
    tokens = {
        'root': [
            (words(minorkw, suffix=r'\b'), Keyword.Minor),
            (words(majorkw, suffix=r'\b'), Keyword),
            (words(directivekw, prefix='#', suffix=r'\b'), Keyword.Directive),
            inherit
        ]
    }

    def analyse_text(text):
        """Competes with IDL and Prolog on *.pro; div. lisps on*.cl and SwigLexer on *.i"""
        # These are *really* good indicators (and not conflicting with the other languages)
        # end-scope first on line e.g. 'end implement'
        # section keyword alone on line e.g. 'clauses'
        if re.search(r'^\s*(end\s+(interface|class|implement)|(clauses|predicates|domains|facts|constants|properties)\s*$)', text):
            return 0.98
        else:
            return 0


class VisualPrologGrammarLexer(VisualPrologBaseLexer):
    """Lexer for VisualProlog grammar
    """

    name = 'Visual Prolog Grammar'
    url = 'https://www.visual-prolog.com/'
    aliases = ['visualprologgrammar']
    filenames = ['*.vipgrm']
    version_added = '2.17'

    majorkw = ('open', 'namespace', 'grammar', 'nonterminals',
               'startsymbols', 'terminals', 'rules', 'precedence')
    directivekw = ('bininclude', 'stringinclude')
    tokens = {
        'root': [
            (words(majorkw, suffix=r'\b'), Keyword),
            (words(directivekw, prefix='#', suffix=r'\b'), Keyword.Directive),
            inherit
        ]
    }

    def analyse_text(text):
        """No competditors (currently)"""
        # These are *really* good indicators
        # end-scope first on line e.g. 'end grammar'
        # section keyword alone on line e.g. 'rules'
        if re.search(r'^\s*(end\s+grammar|(nonterminals|startsymbols|terminals|rules|precedence)\s*$)', text):
            return 0.98
        else:
            return 0
