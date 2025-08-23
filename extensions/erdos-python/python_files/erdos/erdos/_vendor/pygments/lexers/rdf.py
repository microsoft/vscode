"""
    pygments.lexers.rdf
    ~~~~~~~~~~~~~~~~~~~

    Lexers for semantic web and RDF query languages and markup.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default
from erdos.erdos._vendor.pygments.token import Keyword, Punctuation, String, Number, Operator, \
    Generic, Whitespace, Name, Literal, Comment, Text

__all__ = ['SparqlLexer', 'TurtleLexer', 'ShExCLexer']


class SparqlLexer(RegexLexer):
    """
    Lexer for SPARQL query language.
    """
    name = 'SPARQL'
    aliases = ['sparql']
    filenames = ['*.rq', '*.sparql']
    mimetypes = ['application/sparql-query']
    url = 'https://www.w3.org/TR/sparql11-query'
    version_added = '2.0'

    # character group definitions ::

    PN_CHARS_BASE_GRP = ('a-zA-Z'
                         '\u00c0-\u00d6'
                         '\u00d8-\u00f6'
                         '\u00f8-\u02ff'
                         '\u0370-\u037d'
                         '\u037f-\u1fff'
                         '\u200c-\u200d'
                         '\u2070-\u218f'
                         '\u2c00-\u2fef'
                         '\u3001-\ud7ff'
                         '\uf900-\ufdcf'
                         '\ufdf0-\ufffd')

    PN_CHARS_U_GRP = (PN_CHARS_BASE_GRP + '_')

    PN_CHARS_GRP = (PN_CHARS_U_GRP +
                    r'\-' +
                    r'0-9' +
                    '\u00b7' +
                    '\u0300-\u036f' +
                    '\u203f-\u2040')

    HEX_GRP = '0-9A-Fa-f'

    PN_LOCAL_ESC_CHARS_GRP = r' _~.\-!$&"()*+,;=/?#@%'

    # terminal productions ::

    PN_CHARS_BASE = '[' + PN_CHARS_BASE_GRP + ']'

    PN_CHARS_U = '[' + PN_CHARS_U_GRP + ']'

    PN_CHARS = '[' + PN_CHARS_GRP + ']'

    HEX = '[' + HEX_GRP + ']'

    PN_LOCAL_ESC_CHARS = '[' + PN_LOCAL_ESC_CHARS_GRP + ']'

    IRIREF = r'<(?:[^<>"{}|^`\\\x00-\x20])*>'

    BLANK_NODE_LABEL = '_:[0-9' + PN_CHARS_U_GRP + '](?:[' + PN_CHARS_GRP + \
                       '.]*' + PN_CHARS + ')?'

    PN_PREFIX = PN_CHARS_BASE + '(?:[' + PN_CHARS_GRP + '.]*' + PN_CHARS + ')?'

    VARNAME = '[0-9' + PN_CHARS_U_GRP + '][' + PN_CHARS_U_GRP + \
              '0-9\u00b7\u0300-\u036f\u203f-\u2040]*'

    PERCENT = '%' + HEX + HEX

    PN_LOCAL_ESC = r'\\' + PN_LOCAL_ESC_CHARS

    PLX = '(?:' + PERCENT + ')|(?:' + PN_LOCAL_ESC + ')'

    PN_LOCAL = ('(?:[' + PN_CHARS_U_GRP + ':0-9' + ']|' + PLX + ')' +
                '(?:(?:[' + PN_CHARS_GRP + '.:]|' + PLX + ')*(?:[' +
                PN_CHARS_GRP + ':]|' + PLX + '))?')

    EXPONENT = r'[eE][+-]?\d+'

    # Lexer token definitions ::

    tokens = {
        'root': [
            (r'\s+', Text),
            # keywords ::
            (r'(?i)(select|construct|describe|ask|where|filter|group\s+by|minus|'
             r'distinct|reduced|from\s+named|from|order\s+by|desc|asc|limit|'
             r'offset|values|bindings|load|into|clear|drop|create|add|move|copy|'
             r'insert\s+data|delete\s+data|delete\s+where|with|delete|insert|'
             r'using\s+named|using|graph|default|named|all|optional|service|'
             r'silent|bind|undef|union|not\s+in|in|as|having|to|prefix|base)\b', Keyword),
            (r'(a)\b', Keyword),
            # IRIs ::
            ('(' + IRIREF + ')', Name.Label),
            # blank nodes ::
            ('(' + BLANK_NODE_LABEL + ')', Name.Label),
            #  # variables ::
            ('[?$]' + VARNAME, Name.Variable),
            # prefixed names ::
            (r'(' + PN_PREFIX + r')?(\:)(' + PN_LOCAL + r')?',
             bygroups(Name.Namespace, Punctuation, Name.Tag)),
            # function names ::
            (r'(?i)(str|lang|langmatches|datatype|bound|iri|uri|bnode|rand|abs|'
             r'ceil|floor|round|concat|strlen|ucase|lcase|encode_for_uri|'
             r'contains|strstarts|strends|strbefore|strafter|year|month|day|'
             r'hours|minutes|seconds|timezone|tz|now|uuid|struuid|md5|sha1|sha256|sha384|'
             r'sha512|coalesce|if|strlang|strdt|sameterm|isiri|isuri|isblank|'
             r'isliteral|isnumeric|regex|substr|replace|exists|not\s+exists|'
             r'count|sum|min|max|avg|sample|group_concat|separator)\b',
             Name.Function),
            # boolean literals ::
            (r'(true|false)', Keyword.Constant),
            # double literals ::
            (r'[+\-]?(\d+\.\d*' + EXPONENT + r'|\.?\d+' + EXPONENT + ')', Number.Float),
            # decimal literals ::
            (r'[+\-]?(\d+\.\d*|\.\d+)', Number.Float),
            # integer literals ::
            (r'[+\-]?\d+', Number.Integer),
            # operators ::
            (r'(\|\||&&|=|\*|\-|\+|/|!=|<=|>=|!|<|>)', Operator),
            # punctuation characters ::
            (r'[(){}.;,:^\[\]]', Punctuation),
            # line comments ::
            (r'#[^\n]*', Comment),
            # strings ::
            (r'"""', String, 'triple-double-quoted-string'),
            (r'"', String, 'single-double-quoted-string'),
            (r"'''", String, 'triple-single-quoted-string'),
            (r"'", String, 'single-single-quoted-string'),
        ],
        'triple-double-quoted-string': [
            (r'"""', String, 'end-of-string'),
            (r'[^\\]+', String),
            (r'\\', String, 'string-escape'),
        ],
        'single-double-quoted-string': [
            (r'"', String, 'end-of-string'),
            (r'[^"\\\n]+', String),
            (r'\\', String, 'string-escape'),
        ],
        'triple-single-quoted-string': [
            (r"'''", String, 'end-of-string'),
            (r'[^\\]+', String),
            (r'\\', String.Escape, 'string-escape'),
        ],
        'single-single-quoted-string': [
            (r"'", String, 'end-of-string'),
            (r"[^'\\\n]+", String),
            (r'\\', String, 'string-escape'),
        ],
        'string-escape': [
            (r'u' + HEX + '{4}', String.Escape, '#pop'),
            (r'U' + HEX + '{8}', String.Escape, '#pop'),
            (r'.', String.Escape, '#pop'),
        ],
        'end-of-string': [
            (r'(@)([a-zA-Z]+(?:-[a-zA-Z0-9]+)*)',
             bygroups(Operator, Name.Function), '#pop:2'),
            (r'\^\^', Operator, '#pop:2'),
            default('#pop:2'),
        ],
    }


class TurtleLexer(RegexLexer):
    """
    Lexer for Turtle data language.
    """
    name = 'Turtle'
    aliases = ['turtle']
    filenames = ['*.ttl']
    mimetypes = ['text/turtle', 'application/x-turtle']
    url = 'https://www.w3.org/TR/turtle'
    version_added = '2.1'

    # character group definitions ::
    PN_CHARS_BASE_GRP = ('a-zA-Z'
                         '\u00c0-\u00d6'
                         '\u00d8-\u00f6'
                         '\u00f8-\u02ff'
                         '\u0370-\u037d'
                         '\u037f-\u1fff'
                         '\u200c-\u200d'
                         '\u2070-\u218f'
                         '\u2c00-\u2fef'
                         '\u3001-\ud7ff'
                         '\uf900-\ufdcf'
                         '\ufdf0-\ufffd')

    PN_CHARS_U_GRP = (PN_CHARS_BASE_GRP + '_')

    PN_CHARS_GRP = (PN_CHARS_U_GRP +
                    r'\-' +
                    r'0-9' +
                    '\u00b7' +
                    '\u0300-\u036f' +
                    '\u203f-\u2040')

    PN_CHARS = '[' + PN_CHARS_GRP + ']'

    PN_CHARS_BASE = '[' + PN_CHARS_BASE_GRP + ']'

    PN_PREFIX = PN_CHARS_BASE + '(?:[' + PN_CHARS_GRP + '.]*' + PN_CHARS + ')?'

    HEX_GRP = '0-9A-Fa-f'

    HEX = '[' + HEX_GRP + ']'

    PERCENT = '%' + HEX + HEX

    PN_LOCAL_ESC_CHARS_GRP = r' _~.\-!$&"()*+,;=/?#@%'

    PN_LOCAL_ESC_CHARS = '[' + PN_LOCAL_ESC_CHARS_GRP + ']'

    PN_LOCAL_ESC = r'\\' + PN_LOCAL_ESC_CHARS

    PLX = '(?:' + PERCENT + ')|(?:' + PN_LOCAL_ESC + ')'

    PN_LOCAL = ('(?:[' + PN_CHARS_U_GRP + ':0-9' + ']|' + PLX + ')' +
                '(?:(?:[' + PN_CHARS_GRP + '.:]|' + PLX + ')*(?:[' +
                PN_CHARS_GRP + ':]|' + PLX + '))?')

    patterns = {
        'PNAME_NS': r'((?:[a-zA-Z][\w-]*)?\:)',  # Simplified character range
        'IRIREF': r'(<[^<>"{}|^`\\\x00-\x20]*>)'
    }

    tokens = {
        'root': [
            (r'\s+', Text),

            # Base / prefix
            (r'(@base|BASE)(\s+){IRIREF}(\s*)(\.?)'.format(**patterns),
             bygroups(Keyword, Whitespace, Name.Variable, Whitespace,
                      Punctuation)),
            (r'(@prefix|PREFIX)(\s+){PNAME_NS}(\s+){IRIREF}(\s*)(\.?)'.format(**patterns),
             bygroups(Keyword, Whitespace, Name.Namespace, Whitespace,
                      Name.Variable, Whitespace, Punctuation)),

            # The shorthand predicate 'a'
            (r'(?<=\s)a(?=\s)', Keyword.Type),

            # IRIREF
            (r'{IRIREF}'.format(**patterns), Name.Variable),

            # PrefixedName
            (r'(' + PN_PREFIX + r')?(\:)(' + PN_LOCAL + r')?',
             bygroups(Name.Namespace, Punctuation, Name.Tag)),

            # BlankNodeLabel
            (r'(_)(:)([' + PN_CHARS_U_GRP + r'0-9]([' + PN_CHARS_GRP + r'.]*' + PN_CHARS + ')?)',
             bygroups(Name.Namespace, Punctuation, Name.Tag)),

            # Comment
            (r'#[^\n]+', Comment),

            (r'\b(true|false)\b', Literal),
            (r'[+\-]?\d*\.\d+', Number.Float),
            (r'[+\-]?\d*(:?\.\d+)?E[+\-]?\d+', Number.Float),
            (r'[+\-]?\d+', Number.Integer),
            (r'[\[\](){}.;,:^]', Punctuation),

            (r'"""', String, 'triple-double-quoted-string'),
            (r'"', String, 'single-double-quoted-string'),
            (r"'''", String, 'triple-single-quoted-string'),
            (r"'", String, 'single-single-quoted-string'),
        ],
        'triple-double-quoted-string': [
            (r'"""', String, 'end-of-string'),
            (r'[^\\]+(?=""")', String),
            (r'\\', String, 'string-escape'),
        ],
        'single-double-quoted-string': [
            (r'"', String, 'end-of-string'),
            (r'[^"\\\n]+', String),
            (r'\\', String, 'string-escape'),
        ],
        'triple-single-quoted-string': [
            (r"'''", String, 'end-of-string'),
            (r"[^\\]+(?=''')", String),
            (r'\\', String, 'string-escape'),
        ],
        'single-single-quoted-string': [
            (r"'", String, 'end-of-string'),
            (r"[^'\\\n]+", String),
            (r'\\', String, 'string-escape'),
        ],
        'string-escape': [
            (r'.', String, '#pop'),
        ],
        'end-of-string': [
            (r'(@)([a-zA-Z]+(?:-[a-zA-Z0-9]+)*)',
             bygroups(Operator, Generic.Emph), '#pop:2'),

            (r'(\^\^){IRIREF}'.format(**patterns), bygroups(Operator, Generic.Emph), '#pop:2'),

            default('#pop:2'),

        ],
    }

    # Turtle and Tera Term macro files share the same file extension
    # but each has a recognizable and distinct syntax.
    def analyse_text(text):
        for t in ('@base ', 'BASE ', '@prefix ', 'PREFIX '):
            if re.search(rf'^\s*{t}', text):
                return 0.80


class ShExCLexer(RegexLexer):
    """
    Lexer for ShExC shape expressions language syntax.
    """
    name = 'ShExC'
    aliases = ['shexc', 'shex']
    filenames = ['*.shex']
    mimetypes = ['text/shex']
    url = 'https://shex.io/shex-semantics/#shexc'
    version_added = ''

    # character group definitions ::

    PN_CHARS_BASE_GRP = ('a-zA-Z'
                         '\u00c0-\u00d6'
                         '\u00d8-\u00f6'
                         '\u00f8-\u02ff'
                         '\u0370-\u037d'
                         '\u037f-\u1fff'
                         '\u200c-\u200d'
                         '\u2070-\u218f'
                         '\u2c00-\u2fef'
                         '\u3001-\ud7ff'
                         '\uf900-\ufdcf'
                         '\ufdf0-\ufffd')

    PN_CHARS_U_GRP = (PN_CHARS_BASE_GRP + '_')

    PN_CHARS_GRP = (PN_CHARS_U_GRP +
                    r'\-' +
                    r'0-9' +
                    '\u00b7' +
                    '\u0300-\u036f' +
                    '\u203f-\u2040')

    HEX_GRP = '0-9A-Fa-f'

    PN_LOCAL_ESC_CHARS_GRP = r"_~.\-!$&'()*+,;=/?#@%"

    # terminal productions ::

    PN_CHARS_BASE = '[' + PN_CHARS_BASE_GRP + ']'

    PN_CHARS_U = '[' + PN_CHARS_U_GRP + ']'

    PN_CHARS = '[' + PN_CHARS_GRP + ']'

    HEX = '[' + HEX_GRP + ']'

    PN_LOCAL_ESC_CHARS = '[' + PN_LOCAL_ESC_CHARS_GRP + ']'

    UCHAR_NO_BACKSLASH = '(?:u' + HEX + '{4}|U' + HEX + '{8})'

    UCHAR = r'\\' + UCHAR_NO_BACKSLASH

    IRIREF = r'<(?:[^\x00-\x20<>"{}|^`\\]|' + UCHAR + ')*>'

    BLANK_NODE_LABEL = '_:[0-9' + PN_CHARS_U_GRP + '](?:[' + PN_CHARS_GRP + \
                       '.]*' + PN_CHARS + ')?'

    PN_PREFIX = PN_CHARS_BASE + '(?:[' + PN_CHARS_GRP + '.]*' + PN_CHARS + ')?'

    PERCENT = '%' + HEX + HEX

    PN_LOCAL_ESC = r'\\' + PN_LOCAL_ESC_CHARS

    PLX = '(?:' + PERCENT + ')|(?:' + PN_LOCAL_ESC + ')'

    PN_LOCAL = ('(?:[' + PN_CHARS_U_GRP + ':0-9' + ']|' + PLX + ')' +
                '(?:(?:[' + PN_CHARS_GRP + '.:]|' + PLX + ')*(?:[' +
                PN_CHARS_GRP + ':]|' + PLX + '))?')

    EXPONENT = r'[eE][+-]?\d+'

    # Lexer token definitions ::

    tokens = {
        'root': [
            (r'\s+', Text),
            # keywords ::
            (r'(?i)(base|prefix|start|external|'
             r'literal|iri|bnode|nonliteral|length|minlength|maxlength|'
             r'mininclusive|minexclusive|maxinclusive|maxexclusive|'
             r'totaldigits|fractiondigits|'
             r'closed|extra)\b', Keyword),
            (r'(a)\b', Keyword),
            # IRIs ::
            ('(' + IRIREF + ')', Name.Label),
            # blank nodes ::
            ('(' + BLANK_NODE_LABEL + ')', Name.Label),
            # prefixed names ::
            (r'(' + PN_PREFIX + r')?(\:)(' + PN_LOCAL + ')?',
             bygroups(Name.Namespace, Punctuation, Name.Tag)),
            # boolean literals ::
            (r'(true|false)', Keyword.Constant),
            # double literals ::
            (r'[+\-]?(\d+\.\d*' + EXPONENT + r'|\.?\d+' + EXPONENT + ')', Number.Float),
            # decimal literals ::
            (r'[+\-]?(\d+\.\d*|\.\d+)', Number.Float),
            # integer literals ::
            (r'[+\-]?\d+', Number.Integer),
            # operators ::
            (r'[@|$&=*+?^\-~]', Operator),
            # operator keywords ::
            (r'(?i)(and|or|not)\b', Operator.Word),
            # punctuation characters ::
            (r'[(){}.;,:^\[\]]', Punctuation),
            # line comments ::
            (r'#[^\n]*', Comment),
            # strings ::
            (r'"""', String, 'triple-double-quoted-string'),
            (r'"', String, 'single-double-quoted-string'),
            (r"'''", String, 'triple-single-quoted-string'),
            (r"'", String, 'single-single-quoted-string'),
        ],
        'triple-double-quoted-string': [
            (r'"""', String, 'end-of-string'),
            (r'[^\\]+', String),
            (r'\\', String, 'string-escape'),
        ],
        'single-double-quoted-string': [
            (r'"', String, 'end-of-string'),
            (r'[^"\\\n]+', String),
            (r'\\', String, 'string-escape'),
        ],
        'triple-single-quoted-string': [
            (r"'''", String, 'end-of-string'),
            (r'[^\\]+', String),
            (r'\\', String.Escape, 'string-escape'),
        ],
        'single-single-quoted-string': [
            (r"'", String, 'end-of-string'),
            (r"[^'\\\n]+", String),
            (r'\\', String, 'string-escape'),
        ],
        'string-escape': [
            (UCHAR_NO_BACKSLASH, String.Escape, '#pop'),
            (r'.', String.Escape, '#pop'),
        ],
        'end-of-string': [
            (r'(@)([a-zA-Z]+(?:-[a-zA-Z0-9]+)*)',
             bygroups(Operator, Name.Function), '#pop:2'),
            (r'\^\^', Operator, '#pop:2'),
            default('#pop:2'),
        ],
    }
