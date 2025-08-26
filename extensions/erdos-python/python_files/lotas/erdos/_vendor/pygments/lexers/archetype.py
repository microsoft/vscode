"""
    pygments.lexers.archetype
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Archetype-related syntaxes, including ODIN, ADL and cADL.

    For uses of this syntax, see the openEHR archetypes <http://www.openEHR.org/ckm>

    Contributed by Thomas Beale <https://github.com/wolandscat>,
    <https://bitbucket.org/thomas_beale>.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, default
from lotas.erdos._vendor.pygments.token import Text, Comment, Name, Literal, Number, String, \
    Punctuation, Keyword, Operator, Generic, Whitespace

__all__ = ['OdinLexer', 'CadlLexer', 'AdlLexer']


class AtomsLexer(RegexLexer):
    """
    Lexer for Values used in ADL and ODIN.

    .. versionadded:: 2.1
    """

    tokens = {
        # ----- pseudo-states for inclusion -----
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'([ \t]*)(--.*)$', bygroups(Whitespace, Comment)),
        ],
        'archetype_id': [
            (r'([ \t]*)(([a-zA-Z]\w+(\.[a-zA-Z]\w+)*::)?[a-zA-Z]\w+(-[a-zA-Z]\w+){2}'
             r'\.\w+[\w-]*\.v\d+(\.\d+){,2}((-[a-z]+)(\.\d+)?)?)',
             bygroups(Whitespace, Name.Decorator)),
        ],
        'date_constraints': [
            # ISO 8601-based date/time constraints
            (r'[Xx?YyMmDdHhSs\d]{2,4}([:-][Xx?YyMmDdHhSs\d]{2}){2}', Literal.Date),
            # ISO 8601-based duration constraints + optional trailing slash
            (r'(P[YyMmWwDd]+(T[HhMmSs]+)?|PT[HhMmSs]+)/?', Literal.Date),
        ],
        'ordered_values': [
            # ISO 8601 date with optional 'T' ligature
            (r'\d{4}-\d{2}-\d{2}T?', Literal.Date),
            # ISO 8601 time
            (r'\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{4}|Z)?', Literal.Date),
            # ISO 8601 duration
            (r'P((\d*(\.\d+)?[YyMmWwDd]){1,3}(T(\d*(\.\d+)?[HhMmSs]){,3})?|'
             r'T(\d*(\.\d+)?[HhMmSs]){,3})', Literal.Date),
            (r'[+-]?(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+', Number.Float),
            (r'[+-]?\d*\.\d+%?', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[+-]?\d+%?', Number.Integer),
        ],
        'values': [
            include('ordered_values'),
            (r'([Tt]rue|[Ff]alse)', Literal),
            (r'"', String, 'string'),
            (r"'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),
            (r'[a-z][a-z0-9+.-]*:', Literal, 'uri'),
            # term code
            (r'(\[)(\w[\w-]*(?:\([^)\n]+\))?)(::)(\w[\w-]*)(\])',
             bygroups(Punctuation, Name.Decorator, Punctuation, Name.Decorator,
                      Punctuation)),
            (r'\|', Punctuation, 'interval'),
            # list continuation
            (r'\.\.\.', Punctuation),
        ],
        'constraint_values': [
            (r'(\[)(\w[\w-]*(?:\([^)\n]+\))?)(::)',
             bygroups(Punctuation, Name.Decorator, Punctuation), 'adl14_code_constraint'),
            # ADL 1.4 ordinal constraint
            (r'(\d*)(\|)(\[\w[\w-]*::\w[\w-]*\])((?:[,;])?)',
             bygroups(Number, Punctuation, Name.Decorator, Punctuation)),
            include('date_constraints'),
            include('values'),
        ],

        # ----- real states -----
        'string': [
            ('"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|'
             r'u[a-fA-F0-9]{4}|U[a-fA-F0-9]{8}|[0-7]{1,3})', String.Escape),
            # all other characters
            (r'[^\\"]+', String),
            # stray backslash
            (r'\\', String),
        ],
        'uri': [
            # effective URI terminators
            (r'[,>\s]', Punctuation, '#pop'),
            (r'[^>\s,]+', Literal),
        ],
        'interval': [
            (r'\|', Punctuation, '#pop'),
            include('ordered_values'),
            (r'\.\.', Punctuation),
            (r'[<>=] *', Punctuation),
            # handle +/-
            (r'\+/-', Punctuation),
            (r'\s+', Whitespace),
        ],
        'any_code': [
            include('archetype_id'),
            # if it is a code
            (r'[a-z_]\w*[0-9.]+(@[^\]]+)?', Name.Decorator),
            # if it is tuple with attribute names
            (r'[a-z_]\w*', Name.Class),
            # if it is an integer, i.e. Xpath child index
            (r'[0-9]+', Text),
            (r'\|', Punctuation, 'code_rubric'),
            (r'\]', Punctuation, '#pop'),
            # handle use_archetype statement
            (r'(\s*)(,)(\s*)', bygroups(Whitespace, Punctuation, Whitespace)),
        ],
        'code_rubric': [
            (r'\|', Punctuation, '#pop'),
            (r'[^|]+', String),
        ],
        'adl14_code_constraint': [
            (r'\]', Punctuation, '#pop'),
            (r'\|', Punctuation, 'code_rubric'),
            (r'(\w[\w-]*)([;,]?)', bygroups(Name.Decorator, Punctuation)),
            include('whitespace'),
        ],
    }


class OdinLexer(AtomsLexer):
    """
    Lexer for ODIN syntax.
    """
    name = 'ODIN'
    aliases = ['odin']
    filenames = ['*.odin']
    mimetypes = ['text/odin']
    url = 'https://github.com/openEHR/odin'
    version_added = '2.1'

    tokens = {
        'path': [
            (r'>', Punctuation, '#pop'),
            # attribute name
            (r'[a-z_]\w*', Name.Class),
            (r'/', Punctuation),
            (r'\[', Punctuation, 'key'),
            (r'(\s*)(,)(\s*)', bygroups(Whitespace, Punctuation, Whitespace), '#pop'),
            (r'\s+', Whitespace, '#pop'),
        ],
        'key': [
            include('values'),
            (r'\]', Punctuation, '#pop'),
        ],
        'type_cast': [
            (r'\)', Punctuation, '#pop'),
            (r'[^)]+',  Name.Class),
        ],
        'root': [
            include('whitespace'),
            (r'([Tt]rue|[Ff]alse)', Literal),
            include('values'),
            # x-ref path
            (r'/', Punctuation, 'path'),
            # x-ref path starting with key
            (r'\[', Punctuation, 'key'),
            # attribute name
            (r'[a-z_]\w*', Name.Class),
            (r'=', Operator),
            (r'\(', Punctuation, 'type_cast'),
            (r',', Punctuation),
            (r'<', Punctuation),
            (r'>', Punctuation),
            (r';', Punctuation),
        ],
    }


class CadlLexer(AtomsLexer):
    """
    Lexer for cADL syntax.
    """
    name = 'cADL'
    aliases = ['cadl']
    filenames = ['*.cadl']
    url = 'https://specifications.openehr.org/releases/AM/latest/ADL2.html#_cadl_constraint_adl'
    version_added = '2.1'

    tokens = {
        'path': [
            # attribute name
            (r'[a-z_]\w*', Name.Class),
            (r'/', Punctuation),
            (r'\[', Punctuation, 'any_code'),
            (r'\s+', Punctuation, '#pop'),
        ],
        'root': [
            include('whitespace'),
            (r'(cardinality|existence|occurrences|group|include|exclude|'
             r'allow_archetype|use_archetype|use_node)\W', Keyword.Type),
            (r'(and|or|not|there_exists|xor|implies|for_all)\W', Keyword.Type),
            (r'(after|before|closed)\W', Keyword.Type),
            (r'(not)\W', Operator),
            (r'(matches|is_in)\W', Operator),
            # is_in / not is_in char
            ('(\u2208|\u2209)', Operator),
            # there_exists / not there_exists / for_all / and / or
            ('(\u2203|\u2204|\u2200|\u2227|\u2228|\u22BB|\223C)',
             Operator),
            # regex in slot or as string constraint
            (r'(\{)(\s*)(/[^}]+/)(\s*)(\})',
             bygroups(Punctuation, Whitespace, String.Regex, Whitespace, Punctuation)),
            # regex in slot or as string constraint
            (r'(\{)(\s*)(\^[^}]+\^)(\s*)(\})',
             bygroups(Punctuation, Whitespace, String.Regex, Whitespace, Punctuation)),
            (r'/', Punctuation, 'path'),
            # for cardinality etc
            (r'(\{)((?:\d+\.\.)?(?:\d+|\*))'
             r'((?:\s*;\s*(?:ordered|unordered|unique)){,2})(\})',
             bygroups(Punctuation, Number, Number, Punctuation)),
            # [{ is start of a tuple value
            (r'\[\{', Punctuation),
            (r'\}\]', Punctuation),
            (r'\{', Punctuation),
            (r'\}', Punctuation),
            include('constraint_values'),
            # type name
            (r'[A-Z]\w+(<[A-Z]\w+([A-Za-z_<>]*)>)?',  Name.Class),
            # attribute name
            (r'[a-z_]\w*', Name.Class),
            (r'\[', Punctuation, 'any_code'),
            (r'(~|//|\\\\|\+|-|/|\*|\^|!=|=|<=|>=|<|>]?)', Operator),
            (r'\(', Punctuation),
            (r'\)', Punctuation),
            # for lists of values
            (r',', Punctuation),
            (r'"', String, 'string'),
            # for assumed value
            (r';', Punctuation),
        ],
    }


class AdlLexer(AtomsLexer):
    """
    Lexer for ADL syntax.
    """

    name = 'ADL'
    aliases = ['adl']
    filenames = ['*.adl', '*.adls', '*.adlf', '*.adlx']
    url = 'https://specifications.openehr.org/releases/AM/latest/ADL2.html'
    version_added = '2.1'

    tokens = {
        'whitespace': [
            # blank line ends
            (r'\s*\n', Whitespace),
            # comment-only line
            (r'^([ \t]*)(--.*)$', bygroups(Whitespace, Comment)),
        ],
        'odin_section': [
            # repeating the following two rules from the root state enable multi-line
            # strings that start in the first column to be dealt with
            (r'^(language|description|ontology|terminology|annotations|'
             r'component_terminologies|revision_history)([ \t]*\n)',
             bygroups(Generic.Heading, Whitespace)),
            (r'^(definition)([ \t]*\n)', bygroups(Generic.Heading, Whitespace), 'cadl_section'),
            (r'^([ \t]*|[ \t]+.*)\n', using(OdinLexer)),
            (r'^([^"]*")(>[ \t]*\n)', bygroups(String, Punctuation)),
            # template overlay delimiter
            (r'^----------*\n', Text, '#pop'),
            (r'^.*\n', String),
            default('#pop'),
        ],
        'cadl_section': [
            (r'^([ \t]*|[ \t]+.*)\n', using(CadlLexer)),
            default('#pop'),
        ],
        'rules_section': [
            (r'^[ \t]+.*\n', using(CadlLexer)),
            default('#pop'),
        ],
        'metadata': [
            (r'\)', Punctuation, '#pop'),
            (r';', Punctuation),
            (r'([Tt]rue|[Ff]alse)', Literal),
            # numbers and version ids
            (r'\d+(\.\d+)*', Literal),
            # Guids
            (r'(\d|[a-fA-F])+(-(\d|[a-fA-F])+){3,}', Literal),
            (r'\w+', Name.Class),
            (r'"', String, 'string'),
            (r'=', Operator),
            (r'[ \t]+', Whitespace),
            default('#pop'),
        ],
        'root': [
            (r'^(archetype|template_overlay|operational_template|template|'
             r'speciali[sz]e)', Generic.Heading),
            (r'^(language|description|ontology|terminology|annotations|'
             r'component_terminologies|revision_history)[ \t]*\n',
             Generic.Heading, 'odin_section'),
            (r'^(definition)[ \t]*\n', Generic.Heading, 'cadl_section'),
            (r'^(rules)[ \t]*\n', Generic.Heading, 'rules_section'),
            include('archetype_id'),
            (r'([ \t]*)(\()', bygroups(Whitespace, Punctuation), 'metadata'),
            include('whitespace'),
        ],
    }
