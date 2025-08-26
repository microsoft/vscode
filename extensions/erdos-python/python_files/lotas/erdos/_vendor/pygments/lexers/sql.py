"""
    pygments.lexers.sql
    ~~~~~~~~~~~~~~~~~~~

    Lexers for various SQL dialects and related interactive sessions.

    Postgres specific lexers:

    `PostgresLexer`
        A SQL lexer for the PostgreSQL dialect. Differences w.r.t. the SQL
        lexer are:

        - keywords and data types list parsed from the PG docs (run the
          `_postgres_builtins` module to update them);
        - Content of $-strings parsed using a specific lexer, e.g. the content
          of a PL/Python function is parsed using the Python lexer;
        - parse PG specific constructs: E-strings, $-strings, U&-strings,
          different operators and punctuation.

    `PlPgsqlLexer`
        A lexer for the PL/pgSQL language. Adds a few specific construct on
        top of the PG SQL lexer (such as <<label>>).

    `PostgresConsoleLexer`
        A lexer to highlight an interactive psql session:

        - identifies the prompt and does its best to detect the end of command
          in multiline statement where not all the lines are prefixed by a
          prompt, telling them apart from the output;
        - highlights errors in the output and notification levels;
        - handles psql backslash commands.

    `PostgresExplainLexer`
        A lexer to highlight Postgres execution plan.

    The ``tests/examplefiles`` contains a few test files with data to be
    parsed by these lexers.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import collections
import re

from lotas.erdos._vendor.pygments.lexer import Lexer, RegexLexer, do_insertions, bygroups, words
from lotas.erdos._vendor.pygments.token import Punctuation, Whitespace, Text, Comment, Operator, \
    Keyword, Name, String, Number, Generic, Literal
from lotas.erdos._vendor.pygments.lexers import get_lexer_by_name, ClassNotFound

from lotas.erdos._vendor.pygments.lexers._postgres_builtins import KEYWORDS, DATATYPES, \
    PSEUDO_TYPES, PLPGSQL_KEYWORDS, EXPLAIN_KEYWORDS
from lotas.erdos._vendor.pygments.lexers._mysql_builtins import \
    MYSQL_CONSTANTS, \
    MYSQL_DATATYPES, \
    MYSQL_FUNCTIONS, \
    MYSQL_KEYWORDS, \
    MYSQL_OPTIMIZER_HINTS

from lotas.erdos._vendor.pygments.lexers import _googlesql_builtins
from lotas.erdos._vendor.pygments.lexers import _tsql_builtins


__all__ = ['GoogleSqlLexer', 'PostgresLexer', 'PlPgsqlLexer',
           'PostgresConsoleLexer', 'PostgresExplainLexer', 'SqlLexer',
           'TransactSqlLexer', 'MySqlLexer', 'SqliteConsoleLexer', 'RqlLexer']

line_re  = re.compile('.*?\n')
sqlite_prompt_re = re.compile(r'^(?:sqlite|   ...)>(?= )')

language_re = re.compile(r"\s+LANGUAGE\s+'?(\w+)'?", re.IGNORECASE)

do_re = re.compile(r'\bDO\b', re.IGNORECASE)

# Regular expressions for analyse_text()
name_between_bracket_re = re.compile(r'\[[a-zA-Z_]\w*\]')
name_between_backtick_re = re.compile(r'`[a-zA-Z_]\w*`')
tsql_go_re = re.compile(r'\bgo\b', re.IGNORECASE)
tsql_declare_re = re.compile(r'\bdeclare\s+@', re.IGNORECASE)
tsql_variable_re = re.compile(r'@[a-zA-Z_]\w*\b')

# Identifiers for analyse_text()
googlesql_identifiers = (
    _googlesql_builtins.functionnames
    + _googlesql_builtins.keywords
    + _googlesql_builtins.types)


def language_callback(lexer, match):
    """Parse the content of a $-string using a lexer

    The lexer is chosen looking for a nearby LANGUAGE or assumed as
    plpgsql if inside a DO statement and no LANGUAGE has been found.
    """
    lx = None
    m = language_re.match(lexer.text[match.end():match.end()+100])
    if m is not None:
        lx = lexer._get_lexer(m.group(1))
    else:
        m = list(language_re.finditer(
            lexer.text[max(0, match.start()-100):match.start()]))
        if m:
            lx = lexer._get_lexer(m[-1].group(1))
        else:
            m = list(do_re.finditer(
                lexer.text[max(0, match.start()-25):match.start()]))
            if m:
                lx = lexer._get_lexer('plpgsql')

    # 1 = $, 2 = delimiter, 3 = $
    yield (match.start(1), String, match.group(1))
    yield (match.start(2), String.Delimiter, match.group(2))
    yield (match.start(3), String, match.group(3))
    # 4 = string contents
    if lx:
        yield from lx.get_tokens_unprocessed(match.group(4))
    else:
        yield (match.start(4), String, match.group(4))
    # 5 = $, 6 = delimiter, 7 = $
    yield (match.start(5), String, match.group(5))
    yield (match.start(6), String.Delimiter, match.group(6))
    yield (match.start(7), String, match.group(7))


class PostgresBase:
    """Base class for Postgres-related lexers.

    This is implemented as a mixin to avoid the Lexer metaclass kicking in.
    this way the different lexer don't have a common Lexer ancestor. If they
    had, _tokens could be created on this ancestor and not updated for the
    other classes, resulting e.g. in PL/pgSQL parsed as SQL. This shortcoming
    seem to suggest that regexp lexers are not really subclassable.
    """
    def get_tokens_unprocessed(self, text, *args):
        # Have a copy of the entire text to be used by `language_callback`.
        self.text = text
        yield from super().get_tokens_unprocessed(text, *args)

    def _get_lexer(self, lang):
        if lang.lower() == 'sql':
            return get_lexer_by_name('postgresql', **self.options)

        tries = [lang]
        if lang.startswith('pl'):
            tries.append(lang[2:])
        if lang.endswith('u'):
            tries.append(lang[:-1])
        if lang.startswith('pl') and lang.endswith('u'):
            tries.append(lang[2:-1])

        for lx in tries:
            try:
                return get_lexer_by_name(lx, **self.options)
            except ClassNotFound:
                pass
        else:
            # TODO: better logging
            # print >>sys.stderr, "language not found:", lang
            return None


class PostgresLexer(PostgresBase, RegexLexer):
    """
    Lexer for the PostgreSQL dialect of SQL.
    """

    name = 'PostgreSQL SQL dialect'
    aliases = ['postgresql', 'postgres']
    mimetypes = ['text/x-postgresql']
    url = 'https://www.postgresql.org'
    version_added = '1.5'

    flags = re.IGNORECASE
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'--.*\n?', Comment.Single),
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (r'(' + '|'.join(s.replace(" ", r"\s+")
                             for s in DATATYPES + PSEUDO_TYPES) + r')\b',
             Name.Builtin),
            (words(KEYWORDS, suffix=r'\b'), Keyword),
            (r'[+*/<>=~!@#%^&|`?-]+', Operator),
            (r'::', Operator),  # cast
            (r'\$\d+', Name.Variable),
            (r'([0-9]*\.[0-9]*|[0-9]+)(e[+-]?[0-9]+)?', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r"((?:E|U&)?)(')", bygroups(String.Affix, String.Single), 'string'),
            # quoted identifier
            (r'((?:U&)?)(")', bygroups(String.Affix, String.Name), 'quoted-ident'),
            (r'(?s)(\$)([^$]*)(\$)(.*?)(\$)(\2)(\$)', language_callback),
            (r'[a-z_]\w*', Name),

            # psql variable in SQL
            (r""":(['"]?)[a-z]\w*\b\1""", Name.Variable),

            (r'[;:()\[\]{},.]', Punctuation),
        ],
        'multiline-comments': [
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[^/*]+', Comment.Multiline),
            (r'[/*]', Comment.Multiline)
        ],
        'string': [
            (r"[^']+", String.Single),
            (r"''", String.Single),
            (r"'", String.Single, '#pop'),
        ],
        'quoted-ident': [
            (r'[^"]+', String.Name),
            (r'""', String.Name),
            (r'"', String.Name, '#pop'),
        ],
    }


class PlPgsqlLexer(PostgresBase, RegexLexer):
    """
    Handle the extra syntax in Pl/pgSQL language.
    """
    name = 'PL/pgSQL'
    aliases = ['plpgsql']
    mimetypes = ['text/x-plpgsql']
    url = 'https://www.postgresql.org/docs/current/plpgsql.html'
    version_added = '1.5'

    flags = re.IGNORECASE
    # FIXME: use inheritance
    tokens = {name: state[:] for (name, state) in PostgresLexer.tokens.items()}

    # extend the keywords list
    for i, pattern in enumerate(tokens['root']):
        if pattern[1] == Keyword:
            tokens['root'][i] = (
                words(KEYWORDS + PLPGSQL_KEYWORDS, suffix=r'\b'),
                Keyword)
            del i
            break
    else:
        assert 0, "SQL keywords not found"

    # Add specific PL/pgSQL rules (before the SQL ones)
    tokens['root'][:0] = [
        (r'\%[a-z]\w*\b', Name.Builtin),     # actually, a datatype
        (r':=', Operator),
        (r'\<\<[a-z]\w*\>\>', Name.Label),
        (r'\#[a-z]\w*\b', Keyword.Pseudo),   # #variable_conflict
    ]


class PsqlRegexLexer(PostgresBase, RegexLexer):
    """
    Extend the PostgresLexer adding support specific for psql commands.

    This is not a complete psql lexer yet as it lacks prompt support
    and output rendering.
    """

    name = 'PostgreSQL console - regexp based lexer'
    aliases = []    # not public

    flags = re.IGNORECASE
    tokens = {name: state[:] for (name, state) in PostgresLexer.tokens.items()}

    tokens['root'].append(
        (r'\\[^\s]+', Keyword.Pseudo, 'psql-command'))
    tokens['psql-command'] = [
        (r'\n', Text, 'root'),
        (r'\s+', Whitespace),
        (r'\\[^\s]+', Keyword.Pseudo),
        (r""":(['"]?)[a-z]\w*\b\1""", Name.Variable),
        (r"'(''|[^'])*'", String.Single),
        (r"`([^`])*`", String.Backtick),
        (r"[^\s]+", String.Symbol),
    ]


re_prompt = re.compile(r'^(\S.*?)??[=\-\(\$\'\"][#>]')
re_psql_command = re.compile(r'\s*\\')
re_end_command = re.compile(r';\s*(--.*?)?$')
re_psql_command = re.compile(r'(\s*)(\\.+?)(\s+)$')
re_error = re.compile(r'(ERROR|FATAL):')
re_message = re.compile(
    r'((?:DEBUG|INFO|NOTICE|WARNING|ERROR|'
    r'FATAL|HINT|DETAIL|CONTEXT|LINE [0-9]+):)(.*?\n)')


class lookahead:
    """Wrap an iterator and allow pushing back an item."""
    def __init__(self, x):
        self.iter = iter(x)
        self._nextitem = None

    def __iter__(self):
        return self

    def send(self, i):
        self._nextitem = i
        return i

    def __next__(self):
        if self._nextitem is not None:
            ni = self._nextitem
            self._nextitem = None
            return ni
        return next(self.iter)
    next = __next__


class PostgresConsoleLexer(Lexer):
    """
    Lexer for psql sessions.
    """

    name = 'PostgreSQL console (psql)'
    aliases = ['psql', 'postgresql-console', 'postgres-console']
    mimetypes = ['text/x-postgresql-psql']
    url = 'https://www.postgresql.org'
    version_added = '1.5'
    _example = "psql/psql_session.txt"

    def get_tokens_unprocessed(self, data):
        sql = PsqlRegexLexer(**self.options)

        lines = lookahead(line_re.findall(data))

        # prompt-output cycle
        while 1:

            # consume the lines of the command: start with an optional prompt
            # and continue until the end of command is detected
            curcode = ''
            insertions = []
            for line in lines:
                # Identify a shell prompt in case of psql commandline example
                if line.startswith('$') and not curcode:
                    lexer = get_lexer_by_name('console', **self.options)
                    yield from lexer.get_tokens_unprocessed(line)
                    break

                # Identify a psql prompt
                mprompt = re_prompt.match(line)
                if mprompt is not None:
                    insertions.append((len(curcode),
                                       [(0, Generic.Prompt, mprompt.group())]))
                    curcode += line[len(mprompt.group()):]
                else:
                    curcode += line

                # Check if this is the end of the command
                # TODO: better handle multiline comments at the end with
                # a lexer with an external state?
                if re_psql_command.match(curcode) \
                   or re_end_command.search(curcode):
                    break

            # Emit the combined stream of command and prompt(s)
            yield from do_insertions(insertions,
                                     sql.get_tokens_unprocessed(curcode))

            # Emit the output lines
            out_token = Generic.Output
            for line in lines:
                mprompt = re_prompt.match(line)
                if mprompt is not None:
                    # push the line back to have it processed by the prompt
                    lines.send(line)
                    break

                mmsg = re_message.match(line)
                if mmsg is not None:
                    if mmsg.group(1).startswith("ERROR") \
                       or mmsg.group(1).startswith("FATAL"):
                        out_token = Generic.Error
                    yield (mmsg.start(1), Generic.Strong, mmsg.group(1))
                    yield (mmsg.start(2), out_token, mmsg.group(2))
                else:
                    yield (0, out_token, line)
            else:
                return


class PostgresExplainLexer(RegexLexer):
    """
    Handle PostgreSQL EXPLAIN output
    """

    name = 'PostgreSQL EXPLAIN dialect'
    aliases = ['postgres-explain']
    filenames = ['*.explain']
    mimetypes = ['text/x-postgresql-explain']
    url = 'https://www.postgresql.org/docs/current/using-explain.html'
    version_added = '2.15'

    tokens = {
        'root': [
            (r'(:|\(|\)|ms|kB|->|\.\.|\,|\/)', Punctuation),
            (r'(\s+)', Whitespace),

            # This match estimated cost and effectively measured counters with ANALYZE
            # Then, we move to instrumentation state
            (r'(cost)(=?)', bygroups(Name.Class, Punctuation), 'instrumentation'),
            (r'(actual)( )(=?)', bygroups(Name.Class, Whitespace, Punctuation), 'instrumentation'),

            # Misc keywords
            (words(('actual', 'Memory Usage', 'Disk Usage', 'Memory', 'Buckets', 'Batches',
                    'originally', 'row', 'rows', 'Hits', 'Misses',
                    'Evictions', 'Overflows', 'Planned Partitions'), suffix=r'\b'),
             Comment.Single),

            (r'(hit|read|dirtied|written|write|time|calls)(=)', bygroups(Comment.Single, Operator)),
            (r'(shared|temp|local)', Keyword.Pseudo),

            # We move to sort state in order to emphasize specific keywords (especially disk access)
            (r'(Sort Method)(: )', bygroups(Comment.Preproc, Punctuation), 'sort'),

            # These keywords can be followed by an object, like a table
            (r'(Sort Key|Group Key|Presorted Key|Hash Key)(:)( )',
             bygroups(Comment.Preproc, Punctuation, Whitespace), 'object_name'),
            (r'(Cache Key|Cache Mode)(:)( )', bygroups(Comment, Punctuation, Whitespace), 'object_name'),

            # These keywords can be followed by a predicate
            (words(('Join Filter', 'Subplans Removed', 'Filter', 'Merge Cond',
                    'Hash Cond', 'Index Cond', 'Recheck Cond', 'Heap Blocks',
                    'TID Cond', 'Run Condition', 'Order By', 'Function Call',
                    'Table Function Call', 'Inner Unique', 'Params Evaluated',
                    'Single Copy', 'Sampling', 'One-Time Filter', 'Output',
                    'Relations', 'Remote SQL'), suffix=r'\b'),
             Comment.Preproc, 'predicate'),

            # Special keyword to handle ON CONFLICT
            (r'Conflict ', Comment.Preproc, 'conflict'),

            # Special keyword for InitPlan or SubPlan
            (r'(InitPlan|SubPlan)( )(\d+)( )',
             bygroups(Keyword, Whitespace, Number.Integer, Whitespace),
             'init_plan'),

            (words(('Sort Method', 'Join Filter', 'Planning time',
                    'Planning Time', 'Execution time', 'Execution Time',
                    'Workers Planned', 'Workers Launched', 'Buffers',
                    'Planning', 'Worker', 'Query Identifier', 'Time',
                    'Full-sort Groups', 'Pre-sorted Groups'), suffix=r'\b'), Comment.Preproc),

            # Emphasize these keywords

            (words(('Rows Removed by Join Filter', 'Rows Removed by Filter',
                    'Rows Removed by Index Recheck',
                    'Heap Fetches', 'never executed'),
                   suffix=r'\b'), Name.Exception),
            (r'(I/O Timings)(:)( )', bygroups(Name.Exception, Punctuation, Whitespace)),

            (words(EXPLAIN_KEYWORDS, suffix=r'\b'), Keyword),

            # join keywords
            (r'((Right|Left|Full|Semi|Anti) Join)', Keyword.Type),
            (r'(Parallel |Async |Finalize |Partial )', Comment.Preproc),
            (r'Backward', Comment.Preproc),
            (r'(Intersect|Except|Hash)', Comment.Preproc),

            (r'(CTE)( )(\w*)?', bygroups(Comment, Whitespace, Name.Variable)),


            # Treat "on" and "using" as a punctuation
            (r'(on|using)', Punctuation, 'object_name'),


            # strings
            (r"'(''|[^'])*'", String.Single),
            # numbers
            (r'-?\d+\.\d+', Number.Float),
            (r'(-?\d+)', Number.Integer),

            # boolean
            (r'(true|false)', Name.Constant),
            # explain header
            (r'\s*QUERY PLAN\s*\n\s*-+', Comment.Single),
            # Settings
            (r'(Settings)(:)( )', bygroups(Comment.Preproc, Punctuation, Whitespace), 'setting'),

            # Handle JIT counters
            (r'(JIT|Functions|Options|Timing)(:)', bygroups(Comment.Preproc, Punctuation)),
            (r'(Inlining|Optimization|Expressions|Deforming|Generation|Emission|Total)', Keyword.Pseudo),

            # Handle Triggers counters
            (r'(Trigger)( )(\S*)(:)( )',
             bygroups(Comment.Preproc, Whitespace, Name.Variable, Punctuation, Whitespace)),

        ],
        'expression': [
            # matches any kind of parenthesized expression
            # the first opening paren is matched by the 'caller'
            (r'\(', Punctuation, '#push'),
            (r'\)', Punctuation, '#pop'),
            (r'(never executed)', Name.Exception),
            (r'[^)(]+', Comment),
        ],
        'object_name': [

            # This is a cost or analyze measure
            (r'(\(cost)(=?)', bygroups(Name.Class, Punctuation), 'instrumentation'),
            (r'(\(actual)( )(=?)', bygroups(Name.Class, Whitespace, Punctuation), 'instrumentation'),

            # if object_name is parenthesized, mark opening paren as
            # punctuation, call 'expression', and exit state
            (r'\(', Punctuation, 'expression'),
            (r'(on)', Punctuation),
            # matches possibly schema-qualified table and column names
            (r'\w+(\.\w+)*( USING \S+| \w+ USING \S+)', Name.Variable),
            (r'\"?\w+\"?(?:\.\"?\w+\"?)?', Name.Variable),
            (r'\'\S*\'', Name.Variable),

            # if we encounter a comma, another object is listed
            (r',\n', Punctuation, 'object_name'),
            (r',', Punctuation, 'object_name'),

            # special case: "*SELECT*"
            (r'"\*SELECT\*( \d+)?"(.\w+)?', Name.Variable),
            (r'"\*VALUES\*(_\d+)?"(.\w+)?', Name.Variable),
            (r'"ANY_subquery"', Name.Variable),

            # Variable $1 ...
            (r'\$\d+', Name.Variable),
            # cast
            (r'::\w+', Name.Variable),
            (r' +', Whitespace),
            (r'"', Punctuation),
            (r'\[\.\.\.\]', Punctuation),
            (r'\)', Punctuation, '#pop'),
        ],
        'predicate': [
            # if predicate is parenthesized, mark paren as punctuation
            (r'(\()([^\n]*)(\))', bygroups(Punctuation, Name.Variable, Punctuation), '#pop'),
            # otherwise color until newline
            (r'[^\n]*', Name.Variable, '#pop'),
        ],
        'instrumentation': [
            (r'=|\.\.', Punctuation),
            (r' +', Whitespace),
            (r'(rows|width|time|loops)', Name.Class),
            (r'\d+\.\d+', Number.Float),
            (r'(\d+)', Number.Integer),
            (r'\)', Punctuation, '#pop'),
        ],
        'conflict': [
            (r'(Resolution: )(\w+)', bygroups(Comment.Preproc, Name.Variable)),
            (r'(Arbiter \w+:)', Comment.Preproc, 'object_name'),
            (r'(Filter: )', Comment.Preproc, 'predicate'),
        ],
        'setting': [
            (r'([a-z_]*?)(\s*)(=)(\s*)(\'.*?\')', bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String)),
            (r'\, ', Punctuation),
        ],
        'init_plan': [
            (r'\(', Punctuation),
            (r'returns \$\d+(,\$\d+)?', Name.Variable),
            (r'\)', Punctuation, '#pop'),
        ],
        'sort': [
            (r':|kB', Punctuation),
            (r'(quicksort|top-N|heapsort|Average|Memory|Peak)', Comment.Prepoc),
            (r'(external|merge|Disk|sort)', Name.Exception),
            (r'(\d+)', Number.Integer),
            (r' +', Whitespace),
        ],
    }


class SqlLexer(RegexLexer):
    """
    Lexer for Structured Query Language. Currently, this lexer does
    not recognize any special syntax except ANSI SQL.
    """

    name = 'SQL'
    aliases = ['sql']
    filenames = ['*.sql']
    mimetypes = ['text/x-sql']
    url = 'https://en.wikipedia.org/wiki/SQL'
    version_added = ''

    flags = re.IGNORECASE
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'--.*\n?', Comment.Single),
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (words((
                'ABORT', 'ABS', 'ABSOLUTE', 'ACCESS', 'ADA', 'ADD', 'ADMIN', 'AFTER',
                'AGGREGATE', 'ALIAS', 'ALL', 'ALLOCATE', 'ALTER', 'ANALYSE', 'ANALYZE',
                'AND', 'ANY', 'ARE', 'AS', 'ASC', 'ASENSITIVE', 'ASSERTION', 'ASSIGNMENT',
                'ASYMMETRIC', 'AT', 'ATOMIC', 'AUTHORIZATION', 'AVG', 'BACKWARD',
                'BEFORE', 'BEGIN', 'BETWEEN', 'BITVAR', 'BIT_LENGTH', 'BOTH', 'BREADTH',
                'BY', 'C', 'CACHE', 'CALL', 'CALLED', 'CARDINALITY', 'CASCADE',
                'CASCADED', 'CASE', 'CAST', 'CATALOG', 'CATALOG_NAME', 'CHAIN',
                'CHARACTERISTICS', 'CHARACTER_LENGTH', 'CHARACTER_SET_CATALOG',
                'CHARACTER_SET_NAME', 'CHARACTER_SET_SCHEMA', 'CHAR_LENGTH', 'CHECK',
                'CHECKED', 'CHECKPOINT', 'CLASS', 'CLASS_ORIGIN', 'CLOB', 'CLOSE',
                'CLUSTER', 'COALESCE', 'COBOL', 'COLLATE', 'COLLATION',
                'COLLATION_CATALOG', 'COLLATION_NAME', 'COLLATION_SCHEMA', 'COLUMN',
                'COLUMN_NAME', 'COMMAND_FUNCTION', 'COMMAND_FUNCTION_CODE', 'COMMENT',
                'COMMIT', 'COMMITTED', 'COMPLETION', 'CONDITION_NUMBER', 'CONNECT',
                'CONNECTION', 'CONNECTION_NAME', 'CONSTRAINT', 'CONSTRAINTS',
                'CONSTRAINT_CATALOG', 'CONSTRAINT_NAME', 'CONSTRAINT_SCHEMA',
                'CONSTRUCTOR', 'CONTAINS', 'CONTINUE', 'CONVERSION', 'CONVERT',
                'COPY', 'CORRESPONDING', 'COUNT', 'CREATE', 'CREATEDB', 'CREATEUSER',
                'CROSS', 'CUBE', 'CURRENT', 'CURRENT_DATE', 'CURRENT_PATH',
                'CURRENT_ROLE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'CURRENT_USER',
                'CURSOR', 'CURSOR_NAME', 'CYCLE', 'DATA', 'DATABASE',
                'DATETIME_INTERVAL_CODE', 'DATETIME_INTERVAL_PRECISION', 'DAY',
                'DEALLOCATE', 'DECLARE', 'DEFAULT', 'DEFAULTS', 'DEFERRABLE',
                'DEFERRED', 'DEFINED', 'DEFINER', 'DELETE', 'DELIMITER', 'DELIMITERS',
                'DEREF', 'DESC', 'DESCRIBE', 'DESCRIPTOR', 'DESTROY', 'DESTRUCTOR',
                'DETERMINISTIC', 'DIAGNOSTICS', 'DICTIONARY', 'DISCONNECT', 'DISPATCH',
                'DISTINCT', 'DO', 'DOMAIN', 'DROP', 'DYNAMIC', 'DYNAMIC_FUNCTION',
                'DYNAMIC_FUNCTION_CODE', 'EACH', 'ELSE', 'ELSIF', 'ENCODING',
                'ENCRYPTED', 'END', 'END-EXEC', 'EQUALS', 'ESCAPE', 'EVERY', 'EXCEPTION',
                'EXCEPT', 'EXCLUDING', 'EXCLUSIVE', 'EXEC', 'EXECUTE', 'EXISTING',
                'EXISTS', 'EXPLAIN', 'EXTERNAL', 'EXTRACT', 'FALSE', 'FETCH', 'FINAL',
                'FIRST', 'FOR', 'FORCE', 'FOREIGN', 'FORTRAN', 'FORWARD', 'FOUND', 'FREE',
                'FREEZE', 'FROM', 'FULL', 'FUNCTION', 'G', 'GENERAL', 'GENERATED', 'GET',
                'GLOBAL', 'GO', 'GOTO', 'GRANT', 'GRANTED', 'GROUP', 'GROUPING',
                'HANDLER', 'HAVING', 'HIERARCHY', 'HOLD', 'HOST', 'IDENTITY', 'IF',
                'IGNORE', 'ILIKE', 'IMMEDIATE', 'IMMEDIATELY', 'IMMUTABLE', 'IMPLEMENTATION', 'IMPLICIT',
                'IN', 'INCLUDING', 'INCREMENT', 'INDEX', 'INDITCATOR', 'INFIX',
                'INHERITS', 'INITIALIZE', 'INITIALLY', 'INNER', 'INOUT', 'INPUT',
                'INSENSITIVE', 'INSERT', 'INSTANTIABLE', 'INSTEAD', 'INTERSECT', 'INTO',
                'INVOKER', 'IS', 'ISNULL', 'ISOLATION', 'ITERATE', 'JOIN', 'KEY',
                'KEY_MEMBER', 'KEY_TYPE', 'LANCOMPILER', 'LANGUAGE', 'LARGE', 'LAST',
                'LATERAL', 'LEADING', 'LEFT', 'LENGTH', 'LESS', 'LEVEL', 'LIKE', 'LIMIT',
                'LISTEN', 'LOAD', 'LOCAL', 'LOCALTIME', 'LOCALTIMESTAMP', 'LOCATION',
                'LOCATOR', 'LOCK', 'LOWER', 'MAP', 'MATCH', 'MAX', 'MAXVALUE',
                'MESSAGE_LENGTH', 'MESSAGE_OCTET_LENGTH', 'MESSAGE_TEXT', 'METHOD', 'MIN',
                'MINUTE', 'MINVALUE', 'MOD', 'MODE', 'MODIFIES', 'MODIFY', 'MONTH',
                'MORE', 'MOVE', 'MUMPS', 'NAMES', 'NATIONAL', 'NATURAL', 'NCHAR', 'NCLOB',
                'NEW', 'NEXT', 'NO', 'NOCREATEDB', 'NOCREATEUSER', 'NONE', 'NOT',
                'NOTHING', 'NOTIFY', 'NOTNULL', 'NULL', 'NULLABLE', 'NULLIF', 'OBJECT',
                'OCTET_LENGTH', 'OF', 'OFF', 'OFFSET', 'OIDS', 'OLD', 'ON', 'ONLY',
                'OPEN', 'OPERATION', 'OPERATOR', 'OPTION', 'OPTIONS', 'OR', 'ORDER',
                'ORDINALITY', 'OUT', 'OUTER', 'OUTPUT', 'OVERLAPS', 'OVERLAY',
                'OVERRIDING', 'OWNER', 'PAD', 'PARAMETER', 'PARAMETERS', 'PARAMETER_MODE',
                'PARAMETER_NAME', 'PARAMETER_ORDINAL_POSITION',
                'PARAMETER_SPECIFIC_CATALOG', 'PARAMETER_SPECIFIC_NAME',
                'PARAMETER_SPECIFIC_SCHEMA', 'PARTIAL', 'PASCAL', 'PENDANT', 'PERIOD', 'PLACING',
                'PLI', 'POSITION', 'POSTFIX', 'PRECEEDS', 'PRECISION', 'PREFIX', 'PREORDER',
                'PREPARE', 'PRESERVE', 'PRIMARY', 'PRIOR', 'PRIVILEGES', 'PROCEDURAL',
                'PROCEDURE', 'PUBLIC', 'READ', 'READS', 'RECHECK', 'RECURSIVE', 'REF',
                'REFERENCES', 'REFERENCING', 'REINDEX', 'RELATIVE', 'RENAME',
                'REPEATABLE', 'REPLACE', 'RESET', 'RESTART', 'RESTRICT', 'RESULT',
                'RETURN', 'RETURNED_LENGTH', 'RETURNED_OCTET_LENGTH', 'RETURNED_SQLSTATE',
                'RETURNS', 'REVOKE', 'RIGHT', 'ROLE', 'ROLLBACK', 'ROLLUP', 'ROUTINE',
                'ROUTINE_CATALOG', 'ROUTINE_NAME', 'ROUTINE_SCHEMA', 'ROW', 'ROWS',
                'ROW_COUNT', 'RULE', 'SAVE_POINT', 'SCALE', 'SCHEMA', 'SCHEMA_NAME',
                'SCOPE', 'SCROLL', 'SEARCH', 'SECOND', 'SECURITY', 'SELECT', 'SELF',
                'SENSITIVE', 'SERIALIZABLE', 'SERVER_NAME', 'SESSION', 'SESSION_USER',
                'SET', 'SETOF', 'SETS', 'SHARE', 'SHOW', 'SIMILAR', 'SIMPLE', 'SIZE',
                'SOME', 'SOURCE', 'SPACE', 'SPECIFIC', 'SPECIFICTYPE', 'SPECIFIC_NAME',
                'SQL', 'SQLCODE', 'SQLERROR', 'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNINIG',
                'STABLE', 'START', 'STATE', 'STATEMENT', 'STATIC', 'STATISTICS', 'STDIN',
                'STDOUT', 'STORAGE', 'STRICT', 'STRUCTURE', 'STYPE', 'SUBCLASS_ORIGIN',
                'SUBLIST', 'SUBSTRING', 'SUCCEEDS', 'SUM', 'SYMMETRIC', 'SYSID', 'SYSTEM',
                'SYSTEM_USER', 'TABLE', 'TABLE_NAME', ' TEMP', 'TEMPLATE', 'TEMPORARY',
                'TERMINATE', 'THAN', 'THEN', 'TIME', 'TIMESTAMP', 'TIMEZONE_HOUR',
                'TIMEZONE_MINUTE', 'TO', 'TOAST', 'TRAILING', 'TRANSACTION',
                'TRANSACTIONS_COMMITTED', 'TRANSACTIONS_ROLLED_BACK', 'TRANSACTION_ACTIVE',
                'TRANSFORM', 'TRANSFORMS', 'TRANSLATE', 'TRANSLATION', 'TREAT', 'TRIGGER',
                'TRIGGER_CATALOG', 'TRIGGER_NAME', 'TRIGGER_SCHEMA', 'TRIM', 'TRUE',
                'TRUNCATE', 'TRUSTED', 'TYPE', 'UNCOMMITTED', 'UNDER', 'UNENCRYPTED',
                'UNION', 'UNIQUE', 'UNKNOWN', 'UNLISTEN', 'UNNAMED', 'UNNEST', 'UNTIL',
                'UPDATE', 'UPPER', 'USAGE', 'USER', 'USER_DEFINED_TYPE_CATALOG',
                'USER_DEFINED_TYPE_NAME', 'USER_DEFINED_TYPE_SCHEMA', 'USING', 'VACUUM',
                'VALID', 'VALIDATOR', 'VALUES', 'VARIABLE', 'VERBOSE',
                'VERSION', 'VERSIONS', 'VERSIONING', 'VIEW',
                'VOLATILE', 'WHEN', 'WHENEVER', 'WHERE', 'WITH', 'WITHOUT', 'WORK',
                'WRITE', 'YEAR', 'ZONE'), suffix=r'\b'),
             Keyword),
            (words((
                'ARRAY', 'BIGINT', 'BINARY', 'BIT', 'BLOB', 'BOOLEAN', 'CHAR',
                'CHARACTER', 'DATE', 'DEC', 'DECIMAL', 'FLOAT', 'INT', 'INTEGER',
                'INTERVAL', 'NUMBER', 'NUMERIC', 'REAL', 'SERIAL', 'SMALLINT',
                'VARCHAR', 'VARYING', 'INT8', 'SERIAL8', 'TEXT'), suffix=r'\b'),
             Name.Builtin),
            (r'[+*/<>=~!@#%^&|`?-]', Operator),
            (r'[0-9]+', Number.Integer),
            # TODO: Backslash escapes?
            (r"'(''|[^'])*'", String.Single),
            (r'"(""|[^"])*"', String.Symbol),  # not a real string literal in ANSI SQL
            (r'[a-z_][\w$]*', Name),  # allow $s in strings for Oracle
            (r'[;:()\[\],.]', Punctuation)
        ],
        'multiline-comments': [
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[^/*]+', Comment.Multiline),
            (r'[/*]', Comment.Multiline)
        ]
    }

    def analyse_text(self, text):
        return


class TransactSqlLexer(RegexLexer):
    """
    Transact-SQL (T-SQL) is Microsoft's and Sybase's proprietary extension to
    SQL.

    The list of keywords includes ODBC and keywords reserved for future use..
    """

    name = 'Transact-SQL'
    aliases = ['tsql', 't-sql']
    filenames = ['*.sql']
    mimetypes = ['text/x-tsql']
    url = 'https://www.tsql.info'
    version_added = ''

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'--.*[$|\n]?', Comment.Single),
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (words(_tsql_builtins.OPERATORS), Operator),
            (words(_tsql_builtins.OPERATOR_WORDS, suffix=r'\b'), Operator.Word),
            (words(_tsql_builtins.TYPES, suffix=r'\b'), Name.Class),
            (words(_tsql_builtins.FUNCTIONS, suffix=r'\b'), Name.Function),
            (r'(goto)(\s+)(\w+\b)', bygroups(Keyword, Whitespace, Name.Label)),
            (words(_tsql_builtins.KEYWORDS, suffix=r'\b'), Keyword),
            (r'(\[)([^]]+)(\])', bygroups(Operator, Name, Operator)),
            (r'0x[0-9a-f]+', Number.Hex),
            # Float variant 1, for example: 1., 1.e2, 1.2e3
            (r'[0-9]+\.[0-9]*(e[+-]?[0-9]+)?', Number.Float),
            # Float variant 2, for example: .1, .1e2
            (r'\.[0-9]+(e[+-]?[0-9]+)?', Number.Float),
            # Float variant 3, for example: 123e45
            (r'[0-9]+e[+-]?[0-9]+', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r"'(''|[^'])*'", String.Single),
            (r'"(""|[^"])*"', String.Symbol),
            (r'[;(),.]', Punctuation),
            # Below we use \w even for the first "real" character because
            # tokens starting with a digit have already been recognized
            # as Number above.
            (r'@@\w+', Name.Builtin),
            (r'@\w+', Name.Variable),
            (r'(\w+)(:)', bygroups(Name.Label, Punctuation)),
            (r'#?#?\w+', Name),  # names for temp tables and anything else
            (r'\?', Name.Variable.Magic),  # parameter for prepared statements
        ],
        'multiline-comments': [
            (r'/\*', Comment.Multiline, 'multiline-comments'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[^/*]+', Comment.Multiline),
            (r'[/*]', Comment.Multiline)
        ]
    }

    def analyse_text(text):
        rating = 0
        if tsql_declare_re.search(text):
            # Found T-SQL variable declaration.
            rating = 1.0
        else:
            name_between_backtick_count = len(
                name_between_backtick_re.findall(text))
            name_between_bracket_count = len(
                name_between_bracket_re.findall(text))
            # We need to check if there are any names using
            # backticks or brackets, as otherwise both are 0
            # and 0 >= 2 * 0, so we would always assume it's true
            dialect_name_count = name_between_backtick_count + name_between_bracket_count
            if dialect_name_count >= 1 and \
               name_between_bracket_count >= 2 * name_between_backtick_count:
                # Found at least twice as many [name] as `name`.
                rating += 0.5
            elif name_between_bracket_count > name_between_backtick_count:
                rating += 0.2
            elif name_between_bracket_count > 0:
                rating += 0.1
            if tsql_variable_re.search(text) is not None:
                rating += 0.1
            if tsql_go_re.search(text) is not None:
                rating += 0.1
        return rating


class MySqlLexer(RegexLexer):
    """The Oracle MySQL lexer.

    This lexer does not attempt to maintain strict compatibility with
    MariaDB syntax or keywords. Although MySQL and MariaDB's common code
    history suggests there may be significant overlap between the two,
    compatibility between the two is not a target for this lexer.
    """

    name = 'MySQL'
    aliases = ['mysql']
    mimetypes = ['text/x-mysql']
    url = 'https://www.mysql.com'
    version_added = ''

    flags = re.IGNORECASE
    tokens = {
        'root': [
            (r'\s+', Whitespace),

            # Comments
            (r'(?:#|--\s+).*', Comment.Single),
            (r'/\*\+', Comment.Special, 'optimizer-hints'),
            (r'/\*', Comment.Multiline, 'multiline-comment'),

            # Hexadecimal literals
            (r"x'([0-9a-f]{2})+'", Number.Hex),  # MySQL requires paired hex characters in this form.
            (r'0x[0-9a-f]+', Number.Hex),

            # Binary literals
            (r"b'[01]+'", Number.Bin),
            (r'0b[01]+', Number.Bin),

            # Numeric literals
            (r'[0-9]+\.[0-9]*(e[+-]?[0-9]+)?', Number.Float),  # Mandatory integer, optional fraction and exponent
            (r'[0-9]*\.[0-9]+(e[+-]?[0-9]+)?', Number.Float),  # Mandatory fraction, optional integer and exponent
            (r'[0-9]+e[+-]?[0-9]+', Number.Float),  # Exponents with integer significands are still floats
            (r'[0-9]+(?=[^0-9a-z$_\u0080-\uffff])', Number.Integer),  # Integers that are not in a schema object name

            # Date literals
            (r"\{\s*d\s*(?P<quote>['\"])\s*\d{2}(\d{2})?.?\d{2}.?\d{2}\s*(?P=quote)\s*\}",
             Literal.Date),

            # Time literals
            (r"\{\s*t\s*(?P<quote>['\"])\s*(?:\d+\s+)?\d{1,2}.?\d{1,2}.?\d{1,2}(\.\d*)?\s*(?P=quote)\s*\}",
             Literal.Date),

            # Timestamp literals
            (
                r"\{\s*ts\s*(?P<quote>['\"])\s*"
                r"\d{2}(?:\d{2})?.?\d{2}.?\d{2}"  # Date part
                r"\s+"  # Whitespace between date and time
                r"\d{1,2}.?\d{1,2}.?\d{1,2}(\.\d*)?"  # Time part
                r"\s*(?P=quote)\s*\}",
                Literal.Date
            ),

            # String literals
            (r"'", String.Single, 'single-quoted-string'),
            (r'"', String.Double, 'double-quoted-string'),

            # Variables
            (r'@@(?:global\.|persist\.|persist_only\.|session\.)?[a-z_]+', Name.Variable),
            (r'@[a-z0-9_$.]+', Name.Variable),
            (r"@'", Name.Variable, 'single-quoted-variable'),
            (r'@"', Name.Variable, 'double-quoted-variable'),
            (r"@`", Name.Variable, 'backtick-quoted-variable'),
            (r'\?', Name.Variable),  # For demonstrating prepared statements

            # Operators
            (r'[!%&*+/:<=>^|~-]+', Operator),

            # Exceptions; these words tokenize differently in different contexts.
            (r'\b(set)(?!\s*\()', Keyword),
            (r'\b(character)(\s+)(set)\b', bygroups(Keyword, Whitespace, Keyword)),
            # In all other known cases, "SET" is tokenized by MYSQL_DATATYPES.

            (words(MYSQL_CONSTANTS, prefix=r'\b', suffix=r'\b'), Name.Constant),
            (words(MYSQL_DATATYPES, prefix=r'\b', suffix=r'\b'), Keyword.Type),
            (words(MYSQL_KEYWORDS, prefix=r'\b', suffix=r'\b'), Keyword),
            (words(MYSQL_FUNCTIONS, prefix=r'\b', suffix=r'\b(\s*)(\()'),
             bygroups(Name.Function, Whitespace, Punctuation)),

            # Schema object names
            #
            # Note: Although the first regex supports unquoted all-numeric
            # identifiers, this will not be a problem in practice because
            # numeric literals have already been handled above.
            #
            ('[0-9a-z$_\u0080-\uffff]+', Name),
            (r'`', Name.Quoted, 'schema-object-name'),

            # Punctuation
            (r'[(),.;]', Punctuation),
        ],

        # Multiline comment substates
        # ---------------------------

        'optimizer-hints': [
            (r'[^*a-z]+', Comment.Special),
            (r'\*/', Comment.Special, '#pop'),
            (words(MYSQL_OPTIMIZER_HINTS, suffix=r'\b'), Comment.Preproc),
            ('[a-z]+', Comment.Special),
            (r'\*', Comment.Special),
        ],

        'multiline-comment': [
            (r'[^*]+', Comment.Multiline),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'\*', Comment.Multiline),
        ],

        # String substates
        # ----------------

        'single-quoted-string': [
            (r"[^'\\]+", String.Single),
            (r"''", String.Escape),
            (r"""\\[0'"bnrtZ\\%_]""", String.Escape),
            (r"'", String.Single, '#pop'),
        ],

        'double-quoted-string': [
            (r'[^"\\]+', String.Double),
            (r'""', String.Escape),
            (r"""\\[0'"bnrtZ\\%_]""", String.Escape),
            (r'"', String.Double, '#pop'),
        ],

        # Variable substates
        # ------------------

        'single-quoted-variable': [
            (r"[^']+", Name.Variable),
            (r"''", Name.Variable),
            (r"'", Name.Variable, '#pop'),
        ],

        'double-quoted-variable': [
            (r'[^"]+', Name.Variable),
            (r'""', Name.Variable),
            (r'"', Name.Variable, '#pop'),
        ],

        'backtick-quoted-variable': [
            (r'[^`]+', Name.Variable),
            (r'``', Name.Variable),
            (r'`', Name.Variable, '#pop'),
        ],

        # Schema object name substates
        # ----------------------------
        #
        # "Name.Quoted" and "Name.Quoted.Escape" are non-standard but
        # formatters will style them as "Name" by default but add
        # additional styles based on the token name. This gives users
        # flexibility to add custom styles as desired.
        #
        'schema-object-name': [
            (r'[^`]+', Name.Quoted),
            (r'``', Name.Quoted.Escape),
            (r'`', Name.Quoted, '#pop'),
        ],
    }

    def analyse_text(text):
        rating = 0
        name_between_backtick_count = len(
            name_between_backtick_re.findall(text))
        name_between_bracket_count = len(
            name_between_bracket_re.findall(text))
        # Same logic as above in the TSQL analysis
        dialect_name_count = name_between_backtick_count + name_between_bracket_count
        if dialect_name_count >= 1 and \
           name_between_backtick_count >= 2 * name_between_bracket_count:
            # Found at least twice as many `name` as [name].
            rating += 0.5
        elif name_between_backtick_count > name_between_bracket_count:
            rating += 0.2
        elif name_between_backtick_count > 0:
            rating += 0.1
        return rating


class GoogleSqlLexer(RegexLexer):
    """
    GoogleSQL is Google's standard SQL dialect, formerly known as ZetaSQL.

    The list of keywords includes reserved words for future use.
    """

    name = 'GoogleSQL'
    aliases = ['googlesql', 'zetasql']
    filenames = ['*.googlesql', '*.googlesql.sql']
    mimetypes = ['text/x-google-sql', 'text/x-google-sql-aux']
    url = 'https://cloud.google.com/bigquery/googlesql'
    version_added = '2.19'

    flags = re.IGNORECASE
    tokens = {
        'root': [
            (r'\s+', Whitespace),

            # Comments
            (r'(?:#|--\s+).*', Comment.Single),
            (r'/\*', Comment.Multiline, 'multiline-comment'),

            # Hexadecimal literals
            (r"x'([0-9a-f]{2})+'", Number.Hex),
            (r'0x[0-9a-f]+', Number.Hex),

            # Binary literals
            (r"b'[01]+'", Number.Bin),
            (r'0b[01]+', Number.Bin),

            # Numeric literals
            (r'[0-9]+\.[0-9]*(e[+-]?[0-9]+)?', Number.Float),  # Mandatory integer, optional fraction and exponent
            (r'[0-9]*\.[0-9]+(e[+-]?[0-9]+)?', Number.Float),  # Mandatory fraction, optional integer and exponent
            (r'[0-9]+e[+-]?[0-9]+', Number.Float),  # Exponents with integer significands are still floats
            (r'[0-9]+(?=[^0-9a-z$_\u0080-\uffff])', Number.Integer),  # Integers that are not in a schema object name

            # Date literals
            (r"\{\s*d\s*(?P<quote>['\"])\s*\d{2}(\d{2})?.?\d{2}.?\d{2}\s*(?P=quote)\s*\}",
             Literal.Date),

            # Time literals
            (r"\{\s*t\s*(?P<quote>['\"])\s*(?:\d+\s+)?\d{1,2}.?\d{1,2}.?\d{1,2}(\.\d*)?\s*(?P=quote)\s*\}",
             Literal.Date),

            # Timestamp literals
            (
                r"\{\s*ts\s*(?P<quote>['\"])\s*"
                r"\d{2}(?:\d{2})?.?\d{2}.?\d{2}"  # Date part
                r"\s+"  # Whitespace between date and time
                r"\d{1,2}.?\d{1,2}.?\d{1,2}(\.\d*)?"  # Time part
                r"\s*(?P=quote)\s*\}",
                Literal.Date
            ),

            # String literals
            (r"'", String.Single, 'single-quoted-string'),
            (r'"', String.Double, 'double-quoted-string'),

            # Variables
            (r'@@(?:global\.|persist\.|persist_only\.|session\.)?[a-z_]+', Name.Variable),
            (r'@[a-z0-9_$.]+', Name.Variable),
            (r"@'", Name.Variable, 'single-quoted-variable'),
            (r'@"', Name.Variable, 'double-quoted-variable'),
            (r"@`", Name.Variable, 'backtick-quoted-variable'),
            (r'\?', Name.Variable),  # For demonstrating prepared statements

            # Exceptions; these words tokenize differently in different contexts.
            (r'\b(set)(?!\s*\()', Keyword),
            (r'\b(character)(\s+)(set)\b', bygroups(Keyword, Whitespace, Keyword)),

            # Constants, types, keywords, functions, operators
            (words(_googlesql_builtins.constants, prefix=r'\b', suffix=r'\b'), Name.Constant),
            (words(_googlesql_builtins.types, prefix=r'\b', suffix=r'\b'), Keyword.Type),
            (words(_googlesql_builtins.keywords, prefix=r'\b', suffix=r'\b'), Keyword),
            (words(_googlesql_builtins.functionnames, prefix=r'\b', suffix=r'\b(\s*)(\()'),
             bygroups(Name.Function, Whitespace, Punctuation)),
            (words(_googlesql_builtins.operators, prefix=r'\b', suffix=r'\b'), Operator),

            # Schema object names
            #
            # Note: Although the first regex supports unquoted all-numeric
            # identifiers, this will not be a problem in practice because
            # numeric literals have already been handled above.
            #
            ('[0-9a-z$_\u0080-\uffff]+', Name),
            (r'`', Name.Quoted, 'schema-object-name'),

            # Punctuation
            (r'[(),.;]', Punctuation),
        ],

        # Multiline comment substates
        # ---------------------------

        'multiline-comment': [
            (r'[^*]+', Comment.Multiline),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'\*', Comment.Multiline),
        ],

        # String substates
        # ----------------

        'single-quoted-string': [
            (r"[^'\\]+", String.Single),
            (r"''", String.Escape),
            (r"""\\[0'"bnrtZ\\%_]""", String.Escape),
            (r"'", String.Single, '#pop'),
        ],

        'double-quoted-string': [
            (r'[^"\\]+', String.Double),
            (r'""', String.Escape),
            (r"""\\[0'"bnrtZ\\%_]""", String.Escape),
            (r'"', String.Double, '#pop'),
        ],

        # Variable substates
        # ------------------

        'single-quoted-variable': [
            (r"[^']+", Name.Variable),
            (r"''", Name.Variable),
            (r"'", Name.Variable, '#pop'),
        ],

        'double-quoted-variable': [
            (r'[^"]+', Name.Variable),
            (r'""', Name.Variable),
            (r'"', Name.Variable, '#pop'),
        ],

        'backtick-quoted-variable': [
            (r'[^`]+', Name.Variable),
            (r'``', Name.Variable),
            (r'`', Name.Variable, '#pop'),
        ],

        # Schema object name substates
        # ----------------------------
        #
        # "Name.Quoted" and "Name.Quoted.Escape" are non-standard but
        # formatters will style them as "Name" by default but add
        # additional styles based on the token name. This gives users
        # flexibility to add custom styles as desired.
        #
        'schema-object-name': [
            (r'[^`]+', Name.Quoted),
            (r'``', Name.Quoted.Escape),
            (r'`', Name.Quoted, '#pop'),
        ],
    }

    def analyse_text(text):
        tokens = collections.Counter(text.split())
        return 0.001 * sum(count for t, count in tokens.items()
                           if t in googlesql_identifiers)


class SqliteConsoleLexer(Lexer):
    """
    Lexer for example sessions using sqlite3.
    """

    name = 'sqlite3con'
    aliases = ['sqlite3']
    filenames = ['*.sqlite3-console']
    mimetypes = ['text/x-sqlite3-console']
    url = 'https://www.sqlite.org'
    version_added = '0.11'
    _example = "sqlite3/sqlite3.sqlite3-console"

    def get_tokens_unprocessed(self, data):
        sql = SqlLexer(**self.options)

        curcode = ''
        insertions = []
        for match in line_re.finditer(data):
            line = match.group()
            prompt_match = sqlite_prompt_re.match(line)
            if prompt_match is not None:
                insertions.append((len(curcode),
                                   [(0, Generic.Prompt, line[:7])]))
                insertions.append((len(curcode),
                                   [(7, Whitespace, ' ')]))
                curcode += line[8:]
            else:
                if curcode:
                    yield from do_insertions(insertions,
                                             sql.get_tokens_unprocessed(curcode))
                    curcode = ''
                    insertions = []
                if line.startswith('SQL error: '):
                    yield (match.start(), Generic.Traceback, line)
                else:
                    yield (match.start(), Generic.Output, line)
        if curcode:
            yield from do_insertions(insertions,
                                     sql.get_tokens_unprocessed(curcode))


class RqlLexer(RegexLexer):
    """
    Lexer for Relation Query Language.
    """
    name = 'RQL'
    url = 'http://www.logilab.org/project/rql'
    aliases = ['rql']
    filenames = ['*.rql']
    mimetypes = ['text/x-rql']
    version_added = '2.0'

    flags = re.IGNORECASE
    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(DELETE|SET|INSERT|UNION|DISTINCT|WITH|WHERE|BEING|OR'
             r'|AND|NOT|GROUPBY|HAVING|ORDERBY|ASC|DESC|LIMIT|OFFSET'
             r'|TODAY|NOW|TRUE|FALSE|NULL|EXISTS)\b', Keyword),
            (r'[+*/<>=%-]', Operator),
            (r'(Any|is|instance_of|CWEType|CWRelation)\b', Name.Builtin),
            (r'[0-9]+', Number.Integer),
            (r'[A-Z_]\w*\??', Name),
            (r"'(''|[^'])*'", String.Single),
            (r'"(""|[^"])*"', String.Single),
            (r'[;:()\[\],.]', Punctuation)
        ],
    }
