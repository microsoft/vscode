"""
    pygments.lexers.thingsdb
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the ThingsDB language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, String, Text, \
    Operator, Punctuation, Whitespace

__all__ = ['ThingsDBLexer']


class ThingsDBLexer(RegexLexer):
    """
    Lexer for the ThingsDB programming language.
    """
    name = 'ThingsDB'
    aliases = ['ti', 'thingsdb']
    filenames = ['*.ti']
    url = 'https://www.thingsdb.net'
    version_added = '2.9'

    tokens = {
        'root': [
            include('expression'),
        ],
        'expression': [
            include('comments'),
            include('whitespace'),

            # numbers
            (r'[-+]?0b[01]+', Number.Bin),
            (r'[-+]?0o[0-8]+', Number.Oct),
            (r'([-+]?0x[0-9a-fA-F]+)', Number.Hex),
            (r'[-+]?[0-9]+', Number.Integer),
            (r'[-+]?((inf|nan)([^0-9A-Za-z_]|$)|[0-9]*\.[0-9]+(e[+-][0-9]+)?)',
             Number.Float),

            # strings
            (r'(?:"(?:[^"]*)")+', String.Double),
            (r"(?:'(?:[^']*)')+", String.Single),
            (r"(?:`(?:[^`]*)`)+", String.Backtick),

            # literals
            (r'(true|false|nil)\b', Keyword.Constant),

            # name constants
            (r'(FULL|USER|GRANT|CHANGE|JOIN|RUN|QUERY|'
             r'DEBUG|INFO|WARNING|ERROR|CRITICAL|'
             r'NO_IDS|INT_MIN|INT_MAX)\b', Name.Constant),

            # regular expressions
            (r'(/[^/\\]*(?:\\.[^/\\]*)*/i?)', String.Regex),

            # name, assignments and functions
            include('names'),

            (r'[(){}\[\],;]', Punctuation),
            (r'[+\-*/%&|<>^!~@=:?]', Operator),
        ],
        'names': [
            (r'(\.)'
             r'(first|last|then|else|load|at|again_in|again_at|err|cancel|'
             r'closure|set_closure|args|set_args|owner|set_owner|equals|copy|'
             r'dup|assign|week|weekday|yday|zone|len|call|doc|emit|extract|'
             r'choice|code|format|msg|each|every|extend|extend_unique|filter|'
             r'find|flat|find_index|has|index_of|count|sum|is_unique|unique|'
             r'join|map|map_id|map_wrap|map_type|vmap|move|pop|push|fill|'
             r'remove|replace|restrict|restriction|shift|sort|splice|to|add|'
             r'one|clear|contains|ends_with|name|lower|replace|reverse|'
             r'starts_with|split|test|trim|trim_left|trim_right|upper|del|ren|'
             r'to_type|to_thing|get|id|keys|reduce|set|some|value|values|wrap|'
             r'unshift|unwrap|search)'
             r'(\()',
             bygroups(Name.Function, Name.Function, Punctuation), 'arguments'),
            (r'(alt_raise|assert|base64_encode|base64_decode|bool|bytes|'
             r'closure|datetime|deep|future|is_future|del_enum|del_type|room|'
             r'is_room|task|tasks|is_task|is_email|is_url|is_tel|is_time_zone|'
             r'timeit|enum|enum_info|enum_map|enums_info|err|regex|is_regex|'
             r'change_id|float|has_enum|has_type|int|is_array|is_ascii|'
             r'is_float|is_bool|is_bytes|is_closure|is_datetime|is_enum|'
             r'is_err|is_mpdata|is_inf|is_int|is_list|is_nan|is_nil|is_raw|'
             r'is_set|is_str|is_thing|is_timeval|is_tuple|is_utf8|json_dump|'
             r'json_load|list|log|import|export|root|mod_enum|mod_type|new|'
             r'new_type|now|raise|rand|range|randint|randstr|refs|rename_enum|'
             r'set|set_enum|set_type|str|thing|timeval|try|type|type_assert|'
             r'type_count|type_info|types_info|nse|wse|backup_info|'
             r'backups_info|backups_ok|counters|del_backup|has_backup|'
             r'new_backup|node_info|nodes_info|reset_counters|restart_module|'
             r'set_log_level|shutdown|has_module|del_module|module_info|'
             r'modules_info|new_module|deploy_module|rename_module|'
             r'refresh_module|set_module_conf|set_module_scope|'
             r'collections_info|del_collection|del_expired|del_node|del_token|'
             r'del_user|grant|has_collection|has_node|has_token|has_user|'
             r'new_collection|new_node|new_token|new_user|rename_collection|'
             r'rename_user|restore|revoke|set_password|set_time_zone|'
             r'set_default_deep|time_zones_info|user_info|users_info|'
             r'del_procedure|has_procedure|new_procedure|mod_procedure|'
             r'procedure_doc|procedure_info|procedures_info|rename_procedure|'
             r'run|assert_err|auth_err|bad_data_err|cancelled_err|'
             r'rename_type|forbidden_err|lookup_err|max_quota_err|node_err|'
             r'num_arguments_err|operation_err|overflow_err|syntax_err|'
             r'collection_info|type_err|value_err|zero_div_err)'
             r'(\()',
             bygroups(Name.Function, Punctuation),
             'arguments'),
            (r'(\.[A-Za-z_][0-9A-Za-z_]*)'
             r'(\s*)(=)',
             bygroups(Name.Attribute, Text, Operator)),
            (r'\.[A-Za-z_][0-9A-Za-z_]*', Name.Attribute),
            (r'([A-Za-z_][0-9A-Za-z_]*)(\s*)(=)',
             bygroups(Name.Variable, Text, Operator)),
            (r'[A-Za-z_][0-9A-Za-z_]*', Name.Variable),
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
        ],
        'comments': [
            (r'//(.*?)\n', Comment.Single),
            (r'/\*', Comment.Multiline, 'comment'),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'arguments': [
            include('expression'),
            (',', Punctuation),
            (r'\(', Punctuation, '#push'),
            (r'\)', Punctuation, '#pop'),
        ],
    }
