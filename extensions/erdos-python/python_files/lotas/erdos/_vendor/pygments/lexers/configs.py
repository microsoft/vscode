"""
    pygments.lexers.configs
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for configuration file formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import ExtendedRegexLexer, RegexLexer, default, words, \
    bygroups, include, using, line_re
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace, Literal, Error, Generic
from lotas.erdos._vendor.pygments.lexers.shell import BashLexer
from lotas.erdos._vendor.pygments.lexers.data import JsonLexer

__all__ = ['IniLexer', 'SystemdLexer', 'DesktopLexer', 'RegeditLexer', 'PropertiesLexer',
           'KconfigLexer', 'Cfengine3Lexer', 'ApacheConfLexer', 'SquidConfLexer',
           'NginxConfLexer', 'LighttpdConfLexer', 'DockerLexer',
           'TerraformLexer', 'TermcapLexer', 'TerminfoLexer',
           'PkgConfigLexer', 'PacmanConfLexer', 'AugeasLexer', 'TOMLLexer',
           'NestedTextLexer', 'SingularityLexer', 'UnixConfigLexer']


class IniLexer(RegexLexer):
    """
    Lexer for configuration files in INI style.
    """

    name = 'INI'
    aliases = ['ini', 'cfg', 'dosini']
    filenames = [
        '*.ini', '*.cfg', '*.inf', '.editorconfig',
    ]
    mimetypes = ['text/x-ini', 'text/inf']
    url = 'https://en.wikipedia.org/wiki/INI_file'
    version_added = ''

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'[;#].*', Comment.Single),
            (r'(\[.*?\])([ \t]*)$', bygroups(Keyword, Whitespace)),
            (r'''(.*?)([ \t]*)([=:])([ \t]*)(["'])''',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String),
             "quoted_value"),
            (r'(.*?)([ \t]*)([=:])([ \t]*)([^;#\n]*)(\\)(\s+)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String,
                      Text, Whitespace),
             "value"),
            (r'(.*?)([ \t]*)([=:])([ \t]*)([^ ;#\n]*(?: +[^ ;#\n]+)*)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String)),
            # standalone option, supported by some INI parsers
            (r'(.+?)$', Name.Attribute),
        ],
        'quoted_value': [
            (r'''([^"'\n]*)(["'])(\s*)''',
             bygroups(String, String, Whitespace), "#pop"),
            (r'[;#].*', Comment.Single),
            (r'$', String, "#pop"),
        ],
        'value': [     # line continuation
            (r'\s+', Whitespace),
            (r'(\s*)(.*)(\\)([ \t]*)',
             bygroups(Whitespace, String, Text, Whitespace)),
            (r'.*$', String, "#pop"),
        ],
    }

    def analyse_text(text):
        npos = text.find('\n')
        if npos < 3:
            return False
        if text[0] == '[' and text[npos-1] == ']':
            return 0.8
        return False


class DesktopLexer(RegexLexer):
    """
    Lexer for .desktop files.
    """

    name = 'Desktop file'
    url = "https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html"
    aliases = ['desktop']
    filenames = ['*.desktop']
    mimetypes = ['application/x-desktop']
    version_added = '2.16'

    tokens = {
        'root': [
            (r'^[ \t]*\n', Whitespace),
            (r'^(#.*)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'(\[[^\]\n]+\])(\n)', bygroups(Keyword, Whitespace)),
            (r'([-A-Za-z0-9]+)(\[[^\] \t=]+\])?([ \t]*)(=)([ \t]*)([^\n]*)([ \t\n]*\n)',
             bygroups(Name.Attribute, Name.Namespace, Whitespace, Operator, Whitespace, String, Whitespace)),
        ],
    }

    def analyse_text(text):
        if text.startswith("[Desktop Entry]"):
            return 1.0
        if re.search(r"^\[Desktop Entry\][ \t]*$", text[:500], re.MULTILINE) is not None:
            return 0.9
        return 0.0


class SystemdLexer(RegexLexer):
    """
    Lexer for systemd unit files.
    """

    name = 'Systemd'
    url = "https://www.freedesktop.org/software/systemd/man/systemd.syntax.html"
    aliases = ['systemd']
    filenames = [
        '*.service', '*.socket', '*.device', '*.mount', '*.automount',
        '*.swap', '*.target', '*.path', '*.timer', '*.slice', '*.scope',
    ]
    version_added = '2.16'

    tokens = {
        'root': [
            (r'^[ \t]*\n', Whitespace),
            (r'^([;#].*)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'(\[[^\]\n]+\])(\n)', bygroups(Keyword, Whitespace)),
            (r'([^=]+)([ \t]*)(=)([ \t]*)([^\n]*)(\\)(\n)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String,
                      Text, Whitespace),
             "value"),
            (r'([^=]+)([ \t]*)(=)([ \t]*)([^\n]*)(\n)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace, String, Whitespace)),
        ],
        'value': [
            # line continuation
            (r'^([;#].*)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'([ \t]*)([^\n]*)(\\)(\n)',
             bygroups(Whitespace, String, Text, Whitespace)),
            (r'([ \t]*)([^\n]*)(\n)',
             bygroups(Whitespace, String, Whitespace), "#pop"),
        ],
    }

    def analyse_text(text):
        if text.startswith("[Unit]"):
            return 1.0
        if re.search(r"^\[Unit\][ \t]*$", text[:500], re.MULTILINE) is not None:
            return 0.9
        return 0.0


class RegeditLexer(RegexLexer):
    """
    Lexer for Windows Registry files produced by regedit.
    """

    name = 'reg'
    url = 'http://en.wikipedia.org/wiki/Windows_Registry#.REG_files'
    aliases = ['registry']
    filenames = ['*.reg']
    mimetypes = ['text/x-windows-registry']
    version_added = '1.6'

    tokens = {
        'root': [
            (r'Windows Registry Editor.*', Text),
            (r'\s+', Whitespace),
            (r'[;#].*', Comment.Single),
            (r'(\[)(-?)(HKEY_[A-Z_]+)(.*?\])$',
             bygroups(Keyword, Operator, Name.Builtin, Keyword)),
            # String keys, which obey somewhat normal escaping
            (r'("(?:\\"|\\\\|[^"])+")([ \t]*)(=)([ \t]*)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace),
             'value'),
            # Bare keys (includes @)
            (r'(.*?)([ \t]*)(=)([ \t]*)',
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace),
             'value'),
        ],
        'value': [
            (r'-', Operator, '#pop'),  # delete value
            (r'(dword|hex(?:\([0-9a-fA-F]\))?)(:)([0-9a-fA-F,]+)',
             bygroups(Name.Variable, Punctuation, Number), '#pop'),
            # As far as I know, .reg files do not support line continuation.
            (r'.+', String, '#pop'),
            default('#pop'),
        ]
    }

    def analyse_text(text):
        return text.startswith('Windows Registry Editor')


class PropertiesLexer(RegexLexer):
    """
    Lexer for configuration files in Java's properties format.

    Note: trailing whitespace counts as part of the value as per spec
    """

    name = 'Properties'
    aliases = ['properties', 'jproperties']
    filenames = ['*.properties']
    mimetypes = ['text/x-java-properties']
    url = 'https://en.wikipedia.org/wiki/.properties'
    version_added = '1.4'

    tokens = {
        'root': [
            # comments
            (r'[!#].*|/{2}.*', Comment.Single),
            # ending a comment or whitespace-only line
            (r'\n', Whitespace),
            # eat whitespace at the beginning of a line
            (r'^[^\S\n]+', Whitespace),
            # start lexing a key
            default('key'),
        ],
        'key': [
            # non-escaped key characters
            (r'[^\\:=\s]+', Name.Attribute),
            # escapes
            include('escapes'),
            # separator is the first non-escaped whitespace or colon or '=' on the line;
            # if it's whitespace, = and : are gobbled after it
            (r'([^\S\n]*)([:=])([^\S\n]*)',
             bygroups(Whitespace, Operator, Whitespace),
             ('#pop', 'value')),
            (r'[^\S\n]+', Whitespace, ('#pop', 'value')),
            # maybe we got no value after all
            (r'\n', Whitespace, '#pop'),
        ],
        'value': [
            # non-escaped value characters
            (r'[^\\\n]+', String),
            # escapes
            include('escapes'),
            # end the value on an unescaped newline
            (r'\n', Whitespace, '#pop'),
        ],
        'escapes': [
            # line continuations; these gobble whitespace at the beginning of the next line
            (r'(\\\n)([^\S\n]*)', bygroups(String.Escape, Whitespace)),
            # other escapes
            (r'\\(.|\n)', String.Escape),
        ],
    }


def _rx_indent(level):
    # Kconfig *always* interprets a tab as 8 spaces, so this is the default.
    # Edit this if you are in an environment where KconfigLexer gets expanded
    # input (tabs expanded to spaces) and the expansion tab width is != 8,
    # e.g. in connection with Trac (trac.ini, [mimeviewer], tab_width).
    # Value range here is 2 <= {tab_width} <= 8.
    tab_width = 8
    # Regex matching a given indentation {level}, assuming that indentation is
    # a multiple of {tab_width}. In other cases there might be problems.
    if tab_width == 2:
        space_repeat = '+'
    else:
        space_repeat = '{1,%d}' % (tab_width - 1)
    if level == 1:
        level_repeat = ''
    else:
        level_repeat = f'{{{level}}}'
    return rf'(?:\t| {space_repeat}\t| {{{tab_width}}}){level_repeat}.*\n'


class KconfigLexer(RegexLexer):
    """
    For Linux-style Kconfig files.
    """

    name = 'Kconfig'
    aliases = ['kconfig', 'menuconfig', 'linux-config', 'kernel-config']
    version_added = '1.6'
    # Adjust this if new kconfig file names appear in your environment
    filenames = ['Kconfig*', '*Config.in*', 'external.in*',
                 'standard-modules.in']
    mimetypes = ['text/x-kconfig']
    url = 'https://www.kernel.org/doc/html/latest/kbuild/kconfig-language.html'

    # No re.MULTILINE, indentation-aware help text needs line-by-line handling
    flags = 0

    def call_indent(level):
        # If indentation >= {level} is detected, enter state 'indent{level}'
        return (_rx_indent(level), String.Doc, f'indent{level}')

    def do_indent(level):
        # Print paragraphs of indentation level >= {level} as String.Doc,
        # ignoring blank lines. Then return to 'root' state.
        return [
            (_rx_indent(level), String.Doc),
            (r'\s*\n', Text),
            default('#pop:2')
        ]

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#.*?\n', Comment.Single),
            (words((
                'mainmenu', 'config', 'menuconfig', 'choice', 'endchoice',
                'comment', 'menu', 'endmenu', 'visible if', 'if', 'endif',
                'source', 'prompt', 'select', 'depends on', 'default',
                'range', 'option'), suffix=r'\b'),
             Keyword),
            (r'(---help---|help)[\t ]*\n', Keyword, 'help'),
            (r'(bool|tristate|string|hex|int|defconfig_list|modules|env)\b',
             Name.Builtin),
            (r'[!=&|]', Operator),
            (r'[()]', Punctuation),
            (r'[0-9]+', Number.Integer),
            (r"'(''|[^'])*'", String.Single),
            (r'"(""|[^"])*"', String.Double),
            (r'\S+', Text),
        ],
        # Help text is indented, multi-line and ends when a lower indentation
        # level is detected.
        'help': [
            # Skip blank lines after help token, if any
            (r'\s*\n', Text),
            # Determine the first help line's indentation level heuristically(!).
            # Attention: this is not perfect, but works for 99% of "normal"
            # indentation schemes up to a max. indentation level of 7.
            call_indent(7),
            call_indent(6),
            call_indent(5),
            call_indent(4),
            call_indent(3),
            call_indent(2),
            call_indent(1),
            default('#pop'),  # for incomplete help sections without text
        ],
        # Handle text for indentation levels 7 to 1
        'indent7': do_indent(7),
        'indent6': do_indent(6),
        'indent5': do_indent(5),
        'indent4': do_indent(4),
        'indent3': do_indent(3),
        'indent2': do_indent(2),
        'indent1': do_indent(1),
    }


class Cfengine3Lexer(RegexLexer):
    """
    Lexer for CFEngine3 policy files.
    """

    name = 'CFEngine3'
    url = 'http://cfengine.org'
    aliases = ['cfengine3', 'cf3']
    filenames = ['*.cf']
    mimetypes = []
    version_added = '1.5'

    tokens = {
        'root': [
            (r'#.*?\n', Comment),
            (r'(body)(\s+)(\S+)(\s+)(control)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(body|bundle)(\s+)(\S+)(\s+)(\w+)(\()',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Name.Function, Punctuation),
             'arglist'),
            (r'(body|bundle)(\s+)(\S+)(\s+)(\w+)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Name.Function)),
            (r'(")([^"]+)(")(\s+)(string|slist|int|real)(\s*)(=>)(\s*)',
             bygroups(Punctuation, Name.Variable, Punctuation,
                      Whitespace, Keyword.Type, Whitespace, Operator, Whitespace)),
            (r'(\S+)(\s*)(=>)(\s*)',
             bygroups(Keyword.Reserved, Whitespace, Operator, Text)),
            (r'"', String, 'string'),
            (r'(\w+)(\()', bygroups(Name.Function, Punctuation)),
            (r'([\w.!&|()]+)(::)', bygroups(Name.Class, Punctuation)),
            (r'(\w+)(:)', bygroups(Keyword.Declaration, Punctuation)),
            (r'@[{(][^)}]+[})]', Name.Variable),
            (r'[(){},;]', Punctuation),
            (r'=>', Operator),
            (r'->', Operator),
            (r'\d+\.\d+', Number.Float),
            (r'\d+', Number.Integer),
            (r'\w+', Name.Function),
            (r'\s+', Whitespace),
        ],
        'string': [
            (r'\$[{(]', String.Interpol, 'interpol'),
            (r'\\.', String.Escape),
            (r'"', String, '#pop'),
            (r'\n', String),
            (r'.', String),
        ],
        'interpol': [
            (r'\$[{(]', String.Interpol, '#push'),
            (r'[})]', String.Interpol, '#pop'),
            (r'[^${()}]+', String.Interpol),
        ],
        'arglist': [
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation),
            (r'\w+', Name.Variable),
            (r'\s+', Whitespace),
        ],
    }


class ApacheConfLexer(RegexLexer):
    """
    Lexer for configuration files following the Apache config file
    format.
    """

    name = 'ApacheConf'
    aliases = ['apacheconf', 'aconf', 'apache']
    filenames = ['.htaccess', 'apache.conf', 'apache2.conf']
    mimetypes = ['text/x-apacheconf']
    url = 'https://httpd.apache.org/docs/current/configuring.html'
    version_added = '0.6'
    flags = re.MULTILINE | re.IGNORECASE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#(.*\\\n)+.*$|(#.*?)$', Comment),
            (r'(<[^\s>/][^\s>]*)(?:(\s+)(.*))?(>)',
             bygroups(Name.Tag, Whitespace, String, Name.Tag)),
            (r'(</[^\s>]+)(>)',
             bygroups(Name.Tag, Name.Tag)),
            (r'[a-z]\w*', Name.Builtin, 'value'),
            (r'\.+', Text),
        ],
        'value': [
            (r'\\\n', Text),
            (r'\n+', Whitespace, '#pop'),
            (r'\\', Text),
            (r'[^\S\n]+', Whitespace),
            (r'\d+\.\d+\.\d+\.\d+(?:/\d+)?', Number),
            (r'\d+', Number),
            (r'/([*a-z0-9][*\w./-]+)', String.Other),
            (r'(on|off|none|any|all|double|email|dns|min|minimal|'
             r'os|productonly|full|emerg|alert|crit|error|warn|'
             r'notice|info|debug|registry|script|inetd|standalone|'
             r'user|group)\b', Keyword),
            (r'"([^"\\]*(?:\\(.|\n)[^"\\]*)*)"', String.Double),
            (r'[^\s"\\]+', Text)
        ],
    }


class SquidConfLexer(RegexLexer):
    """
    Lexer for squid configuration files.
    """

    name = 'SquidConf'
    url = 'http://www.squid-cache.org/'
    aliases = ['squidconf', 'squid.conf', 'squid']
    filenames = ['squid.conf']
    mimetypes = ['text/x-squidconf']
    version_added = '0.9'
    flags = re.IGNORECASE

    keywords = (
        "access_log", "acl", "always_direct", "announce_host",
        "announce_period", "announce_port", "announce_to", "anonymize_headers",
        "append_domain", "as_whois_server", "auth_param_basic",
        "authenticate_children", "authenticate_program", "authenticate_ttl",
        "broken_posts", "buffered_logs", "cache_access_log", "cache_announce",
        "cache_dir", "cache_dns_program", "cache_effective_group",
        "cache_effective_user", "cache_host", "cache_host_acl",
        "cache_host_domain", "cache_log", "cache_mem", "cache_mem_high",
        "cache_mem_low", "cache_mgr", "cachemgr_passwd", "cache_peer",
        "cache_peer_access", "cache_replacement_policy", "cache_stoplist",
        "cache_stoplist_pattern", "cache_store_log", "cache_swap",
        "cache_swap_high", "cache_swap_log", "cache_swap_low", "client_db",
        "client_lifetime", "client_netmask", "connect_timeout", "coredump_dir",
        "dead_peer_timeout", "debug_options", "delay_access", "delay_class",
        "delay_initial_bucket_level", "delay_parameters", "delay_pools",
        "deny_info", "dns_children", "dns_defnames", "dns_nameservers",
        "dns_testnames", "emulate_httpd_log", "err_html_text",
        "fake_user_agent", "firewall_ip", "forwarded_for", "forward_snmpd_port",
        "fqdncache_size", "ftpget_options", "ftpget_program", "ftp_list_width",
        "ftp_passive", "ftp_user", "half_closed_clients", "header_access",
        "header_replace", "hierarchy_stoplist", "high_response_time_warning",
        "high_page_fault_warning", "hosts_file", "htcp_port", "http_access",
        "http_anonymizer", "httpd_accel", "httpd_accel_host",
        "httpd_accel_port", "httpd_accel_uses_host_header",
        "httpd_accel_with_proxy", "http_port", "http_reply_access",
        "icp_access", "icp_hit_stale", "icp_port", "icp_query_timeout",
        "ident_lookup", "ident_lookup_access", "ident_timeout",
        "incoming_http_average", "incoming_icp_average", "inside_firewall",
        "ipcache_high", "ipcache_low", "ipcache_size", "local_domain",
        "local_ip", "logfile_rotate", "log_fqdn", "log_icp_queries",
        "log_mime_hdrs", "maximum_object_size", "maximum_single_addr_tries",
        "mcast_groups", "mcast_icp_query_timeout", "mcast_miss_addr",
        "mcast_miss_encode_key", "mcast_miss_port", "memory_pools",
        "memory_pools_limit", "memory_replacement_policy", "mime_table",
        "min_http_poll_cnt", "min_icp_poll_cnt", "minimum_direct_hops",
        "minimum_object_size", "minimum_retry_timeout", "miss_access",
        "negative_dns_ttl", "negative_ttl", "neighbor_timeout",
        "neighbor_type_domain", "netdb_high", "netdb_low", "netdb_ping_period",
        "netdb_ping_rate", "never_direct", "no_cache", "passthrough_proxy",
        "pconn_timeout", "pid_filename", "pinger_program", "positive_dns_ttl",
        "prefer_direct", "proxy_auth", "proxy_auth_realm", "query_icmp",
        "quick_abort", "quick_abort_max", "quick_abort_min",
        "quick_abort_pct", "range_offset_limit", "read_timeout",
        "redirect_children", "redirect_program",
        "redirect_rewrites_host_header", "reference_age",
        "refresh_pattern", "reload_into_ims", "request_body_max_size",
        "request_size", "request_timeout", "shutdown_lifetime",
        "single_parent_bypass", "siteselect_timeout", "snmp_access",
        "snmp_incoming_address", "snmp_port", "source_ping", "ssl_proxy",
        "store_avg_object_size", "store_objects_per_bucket",
        "strip_query_terms", "swap_level1_dirs", "swap_level2_dirs",
        "tcp_incoming_address", "tcp_outgoing_address", "tcp_recv_bufsize",
        "test_reachability", "udp_hit_obj", "udp_hit_obj_size",
        "udp_incoming_address", "udp_outgoing_address", "unique_hostname",
        "unlinkd_program", "uri_whitespace", "useragent_log",
        "visible_hostname", "wais_relay", "wais_relay_host", "wais_relay_port",
    )

    opts = (
        "proxy-only", "weight", "ttl", "no-query", "default", "round-robin",
        "multicast-responder", "on", "off", "all", "deny", "allow", "via",
        "parent", "no-digest", "heap", "lru", "realm", "children", "q1", "q2",
        "credentialsttl", "none", "disable", "offline_toggle", "diskd",
    )

    actions = (
        "shutdown", "info", "parameter", "server_list", "client_list",
        r'squid.conf',
    )

    actions_stats = (
        "objects", "vm_objects", "utilization", "ipcache", "fqdncache", "dns",
        "redirector", "io", "reply_headers", "filedescriptors", "netdb",
    )

    actions_log = ("status", "enable", "disable", "clear")

    acls = (
        "url_regex", "urlpath_regex", "referer_regex", "port", "proto",
        "req_mime_type", "rep_mime_type", "method", "browser", "user", "src",
        "dst", "time", "dstdomain", "ident", "snmp_community",
    )

    ipv4_group = r'(\d+|0x[0-9a-f]+)'
    ipv4 = rf'({ipv4_group}(\.{ipv4_group}){{3}})'
    ipv6_group = r'([0-9a-f]{0,4})'
    ipv6 = rf'({ipv6_group}(:{ipv6_group}){{1,7}})'
    bare_ip = rf'({ipv4}|{ipv6})'
    # XXX: /integer is a subnet mark, but what is /IP ?
    # There is no test where it is used.
    ip = rf'{bare_ip}(/({bare_ip}|\d+))?'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#', Comment, 'comment'),
            (words(keywords, prefix=r'\b', suffix=r'\b'), Keyword),
            (words(opts, prefix=r'\b', suffix=r'\b'), Name.Constant),
            # Actions
            (words(actions, prefix=r'\b', suffix=r'\b'), String),
            (words(actions_stats, prefix=r'stats/', suffix=r'\b'), String),
            (words(actions_log, prefix=r'log/', suffix=r'='), String),
            (words(acls, prefix=r'\b', suffix=r'\b'), Keyword),
            (ip, Number.Float),
            (r'(?:\b\d+\b(?:-\b\d+|%)?)', Number),
            (r'\S+', Text),
        ],
        'comment': [
            (r'\s*TAG:.*', String.Escape, '#pop'),
            (r'.+', Comment, '#pop'),
            default('#pop'),
        ],
    }


class NginxConfLexer(RegexLexer):
    """
    Lexer for Nginx configuration files.
    """
    name = 'Nginx configuration file'
    url = 'http://nginx.net/'
    aliases = ['nginx']
    filenames = ['nginx.conf']
    mimetypes = ['text/x-nginx-conf']
    version_added = '0.11'

    tokens = {
        'root': [
            (r'(include)(\s+)([^\s;]+)', bygroups(Keyword, Whitespace, Name)),
            (r'[^\s;#]+', Keyword, 'stmt'),
            include('base'),
        ],
        'block': [
            (r'\}', Punctuation, '#pop:2'),
            (r'[^\s;#]+', Keyword.Namespace, 'stmt'),
            include('base'),
        ],
        'stmt': [
            (r'\{', Punctuation, 'block'),
            (r';', Punctuation, '#pop'),
            include('base'),
        ],
        'base': [
            (r'#.*\n', Comment.Single),
            (r'on|off', Name.Constant),
            (r'\$[^\s;#()]+', Name.Variable),
            (r'([a-z0-9.-]+)(:)([0-9]+)',
             bygroups(Name, Punctuation, Number.Integer)),
            (r'[a-z-]+/[a-z-+]+', String),  # mimetype
            # (r'[a-zA-Z._-]+', Keyword),
            (r'[0-9]+[km]?\b', Number.Integer),
            (r'(~)(\s*)([^\s{]+)', bygroups(Punctuation, Whitespace, String.Regex)),
            (r'[:=~]', Punctuation),
            (r'[^\s;#{}$]+', String),  # catch all
            (r'/[^\s;#]*', Name),  # pathname
            (r'\s+', Whitespace),
            (r'[$;]', Text),  # leftover characters
        ],
    }


class LighttpdConfLexer(RegexLexer):
    """
    Lexer for Lighttpd configuration files.
    """
    name = 'Lighttpd configuration file'
    url = 'http://lighttpd.net/'
    aliases = ['lighttpd', 'lighty']
    filenames = ['lighttpd.conf']
    mimetypes = ['text/x-lighttpd-conf']
    version_added = '0.11'

    tokens = {
        'root': [
            (r'#.*\n', Comment.Single),
            (r'/\S*', Name),  # pathname
            (r'[a-zA-Z._-]+', Keyword),
            (r'\d+\.\d+\.\d+\.\d+(?:/\d+)?', Number),
            (r'[0-9]+', Number),
            (r'=>|=~|\+=|==|=|\+', Operator),
            (r'\$[A-Z]+', Name.Builtin),
            (r'[(){}\[\],]', Punctuation),
            (r'"([^"\\]*(?:\\.[^"\\]*)*)"', String.Double),
            (r'\s+', Whitespace),
        ],

    }


class DockerLexer(RegexLexer):
    """
    Lexer for Docker configuration files.
    """
    name = 'Docker'
    url = 'http://docker.io'
    aliases = ['docker', 'dockerfile']
    filenames = ['Dockerfile', '*.docker']
    mimetypes = ['text/x-dockerfile-config']
    version_added = '2.0'

    _keywords = (r'(?:MAINTAINER|EXPOSE|WORKDIR|USER|STOPSIGNAL)')
    _bash_keywords = (r'(?:RUN|CMD|ENTRYPOINT|ENV|ARG|LABEL|ADD|COPY)')
    _lb = r'(?:\s*\\?\s*)'  # dockerfile line break regex
    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'root': [
            (r'#.*', Comment),
            (r'(FROM)([ \t]*)(\S*)([ \t]*)(?:(AS)([ \t]*)(\S*))?',
             bygroups(Keyword, Whitespace, String, Whitespace, Keyword, Whitespace, String)),
            (rf'(ONBUILD)(\s+)({_lb})', bygroups(Keyword, Whitespace, using(BashLexer))),
            (rf'(HEALTHCHECK)(\s+)(({_lb}--\w+=\w+{_lb})*)',
                bygroups(Keyword, Whitespace, using(BashLexer))),
            (rf'(VOLUME|ENTRYPOINT|CMD|SHELL)(\s+)({_lb})(\[.*?\])',
                bygroups(Keyword, Whitespace, using(BashLexer), using(JsonLexer))),
            (rf'(LABEL|ENV|ARG)(\s+)(({_lb}\w+=\w+{_lb})*)',
                bygroups(Keyword, Whitespace, using(BashLexer))),
            (rf'({_keywords}|VOLUME)\b(\s+)(.*)', bygroups(Keyword, Whitespace, String)),
            (rf'({_bash_keywords})(\s+)', bygroups(Keyword, Whitespace)),
            (r'(.*\\\n)*.+', using(BashLexer)),
        ]
    }


class TerraformLexer(ExtendedRegexLexer):
    """
    Lexer for terraformi ``.tf`` files.
    """

    name = 'Terraform'
    url = 'https://www.terraform.io/'
    aliases = ['terraform', 'tf', 'hcl']
    filenames = ['*.tf', '*.hcl']
    mimetypes = ['application/x-tf', 'application/x-terraform']
    version_added = '2.1'

    classes = ('backend', 'data', 'module', 'output', 'provider',
               'provisioner', 'resource', 'variable')
    classes_re = "({})".format(('|').join(classes))

    types = ('string', 'number', 'bool', 'list', 'tuple', 'map', 'set', 'object', 'null')

    numeric_functions = ('abs', 'ceil', 'floor', 'log', 'max',
                         'mix', 'parseint', 'pow', 'signum')

    string_functions = ('chomp', 'format', 'formatlist', 'indent',
                        'join', 'lower', 'regex', 'regexall', 'replace',
                        'split', 'strrev', 'substr', 'title', 'trim',
                        'trimprefix', 'trimsuffix', 'trimspace', 'upper'
                        )

    collection_functions = ('alltrue', 'anytrue', 'chunklist', 'coalesce',
                            'coalescelist', 'compact', 'concat', 'contains',
                            'distinct', 'element', 'flatten', 'index', 'keys',
                            'length', 'list', 'lookup', 'map', 'matchkeys',
                            'merge', 'range', 'reverse', 'setintersection',
                            'setproduct', 'setsubtract', 'setunion', 'slice',
                            'sort', 'sum', 'transpose', 'values', 'zipmap'
                            )

    encoding_functions = ('base64decode', 'base64encode', 'base64gzip',
                          'csvdecode', 'jsondecode', 'jsonencode', 'textdecodebase64',
                          'textencodebase64', 'urlencode', 'yamldecode', 'yamlencode')

    filesystem_functions = ('abspath', 'dirname', 'pathexpand', 'basename',
                            'file', 'fileexists', 'fileset', 'filebase64', 'templatefile')

    date_time_functions = ('formatdate', 'timeadd', 'timestamp')

    hash_crypto_functions = ('base64sha256', 'base64sha512', 'bcrypt', 'filebase64sha256',
                             'filebase64sha512', 'filemd5', 'filesha1', 'filesha256', 'filesha512',
                             'md5', 'rsadecrypt', 'sha1', 'sha256', 'sha512', 'uuid', 'uuidv5')

    ip_network_functions = ('cidrhost', 'cidrnetmask', 'cidrsubnet', 'cidrsubnets')

    type_conversion_functions = ('can', 'defaults', 'tobool', 'tolist', 'tomap',
                                 'tonumber', 'toset', 'tostring', 'try')

    builtins = numeric_functions + string_functions + collection_functions + encoding_functions +\
        filesystem_functions + date_time_functions + hash_crypto_functions + ip_network_functions +\
        type_conversion_functions
    builtins_re = "({})".format(('|').join(builtins))

    def heredoc_callback(self, match, ctx):
        # Parse a terraform heredoc
        # match: 1 = <<[-]?, 2 = name 3 = rest of line

        start = match.start(1)
        yield start, Operator, match.group(1)        # <<[-]?
        yield match.start(2), String.Delimiter, match.group(2)  # heredoc name

        ctx.pos = match.start(3)
        ctx.end = match.end(3)
        yield ctx.pos, String.Heredoc, match.group(3)
        ctx.pos = match.end()

        hdname = match.group(2)
        tolerant = True  # leading whitespace is always accepted

        lines = []

        for match in line_re.finditer(ctx.text, ctx.pos):
            if tolerant:
                check = match.group().strip()
            else:
                check = match.group().rstrip()
            if check == hdname:
                for amatch in lines:
                    yield amatch.start(), String.Heredoc, amatch.group()
                yield match.start(), String.Delimiter, match.group()
                ctx.pos = match.end()
                break
            else:
                lines.append(match)
        else:
            # end of heredoc not found -- error!
            for amatch in lines:
                yield amatch.start(), Error, amatch.group()
        ctx.end = len(ctx.text)

    tokens = {
        'root': [
            include('basic'),
            include('whitespace'),

            # Strings
            (r'(".*")', bygroups(String.Double)),

            # Constants
            (words(('true', 'false'), prefix=r'\b', suffix=r'\b'), Name.Constant),

            # Types
            (words(types, prefix=r'\b', suffix=r'\b'), Keyword.Type),

            include('identifier'),
            include('punctuation'),
            (r'[0-9]+', Number),
        ],
        'basic': [
            (r'\s*/\*', Comment.Multiline, 'comment'),
            (r'\s*(#|//).*\n', Comment.Single),
            include('whitespace'),

            # e.g. terraform {
            # e.g. egress {
            (r'(\s*)([0-9a-zA-Z-_]+)(\s*)(=?)(\s*)(\{)',
             bygroups(Whitespace, Name.Builtin, Whitespace, Operator, Whitespace, Punctuation)),

            # Assignment with attributes, e.g. something = ...
            (r'(\s*)([0-9a-zA-Z-_]+)(\s*)(=)(\s*)',
             bygroups(Whitespace, Name.Attribute, Whitespace, Operator, Whitespace)),

            # Assignment with environment variables and similar, e.g. "something" = ...
            # or key value assignment, e.g. "SlotName" : ...
            (r'(\s*)("\S+")(\s*)([=:])(\s*)',
             bygroups(Whitespace, Literal.String.Double, Whitespace, Operator, Whitespace)),

            # Functions, e.g. jsonencode(element("value"))
            (builtins_re + r'(\()', bygroups(Name.Function, Punctuation)),

            # List of attributes, e.g. ignore_changes = [last_modified, filename]
            (r'(\[)([a-z_,\s]+)(\])', bygroups(Punctuation, Name.Builtin, Punctuation)),

            # e.g. resource "aws_security_group" "allow_tls" {
            # e.g. backend "consul" {
            (classes_re + r'(\s+)("[0-9a-zA-Z-_]+")?(\s*)("[0-9a-zA-Z-_]+")(\s+)(\{)',
             bygroups(Keyword.Reserved, Whitespace, Name.Class, Whitespace, Name.Variable, Whitespace, Punctuation)),

            # here-doc style delimited strings
            (r'(<<-?)\s*([a-zA-Z_]\w*)(.*?\n)', heredoc_callback),
        ],
        'identifier': [
            (r'\b(var\.[0-9a-zA-Z-_\.\[\]]+)\b', bygroups(Name.Variable)),
            (r'\b([0-9a-zA-Z-_\[\]]+\.[0-9a-zA-Z-_\.\[\]]+)\b',
             bygroups(Name.Variable)),
        ],
        'punctuation': [
            (r'[\[\]()\{\},.?:!=]', Punctuation),
        ],
        'comment': [
            (r'[^*/]', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline)
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),
        ],
    }


class TermcapLexer(RegexLexer):
    """
    Lexer for termcap database source.

    This is very simple and minimal.
    """
    name = 'Termcap'
    aliases = ['termcap']
    filenames = ['termcap', 'termcap.src']
    mimetypes = []
    url = 'https://en.wikipedia.org/wiki/Termcap'
    version_added = '2.1'

    # NOTE:
    #   * multiline with trailing backslash
    #   * separator is ':'
    #   * to embed colon as data, we must use \072
    #   * space after separator is not allowed (mayve)
    tokens = {
        'root': [
            (r'^#.*', Comment),
            (r'^[^\s#:|]+', Name.Tag, 'names'),
            (r'\s+', Whitespace),
        ],
        'names': [
            (r'\n', Whitespace, '#pop'),
            (r':', Punctuation, 'defs'),
            (r'\|', Punctuation),
            (r'[^:|]+', Name.Attribute),
        ],
        'defs': [
            (r'(\\)(\n[ \t]*)', bygroups(Text, Whitespace)),
            (r'\n[ \t]*', Whitespace, '#pop:2'),
            (r'(#)([0-9]+)', bygroups(Operator, Number)),
            (r'=', Operator, 'data'),
            (r':', Punctuation),
            (r'[^\s:=#]+', Name.Class),
        ],
        'data': [
            (r'\\072', Literal),
            (r':', Punctuation, '#pop'),
            (r'[^:\\]+', Literal),  # for performance
            (r'.', Literal),
        ],
    }


class TerminfoLexer(RegexLexer):
    """
    Lexer for terminfo database source.

    This is very simple and minimal.
    """
    name = 'Terminfo'
    aliases = ['terminfo']
    filenames = ['terminfo', 'terminfo.src']
    mimetypes = []
    url = 'https://en.wikipedia.org/wiki/Terminfo'
    version_added = '2.1'

    # NOTE:
    #   * multiline with leading whitespace
    #   * separator is ','
    #   * to embed comma as data, we can use \,
    #   * space after separator is allowed
    tokens = {
        'root': [
            (r'^#.*$', Comment),
            (r'^[^\s#,|]+', Name.Tag, 'names'),
            (r'\s+', Whitespace),
        ],
        'names': [
            (r'\n', Whitespace, '#pop'),
            (r'(,)([ \t]*)', bygroups(Punctuation, Whitespace), 'defs'),
            (r'\|', Punctuation),
            (r'[^,|]+', Name.Attribute),
        ],
        'defs': [
            (r'\n[ \t]+', Whitespace),
            (r'\n', Whitespace, '#pop:2'),
            (r'(#)([0-9]+)', bygroups(Operator, Number)),
            (r'=', Operator, 'data'),
            (r'(,)([ \t]*)', bygroups(Punctuation, Whitespace)),
            (r'[^\s,=#]+', Name.Class),
        ],
        'data': [
            (r'\\[,\\]', Literal),
            (r'(,)([ \t]*)', bygroups(Punctuation, Whitespace), '#pop'),
            (r'[^\\,]+', Literal),  # for performance
            (r'.', Literal),
        ],
    }


class PkgConfigLexer(RegexLexer):
    """
    Lexer for pkg-config
    (see also `manual page <http://linux.die.net/man/1/pkg-config>`_).
    """

    name = 'PkgConfig'
    url = 'http://www.freedesktop.org/wiki/Software/pkg-config/'
    aliases = ['pkgconfig']
    filenames = ['*.pc']
    mimetypes = []
    version_added = '2.1'

    tokens = {
        'root': [
            (r'#.*$', Comment.Single),

            # variable definitions
            (r'^(\w+)(=)', bygroups(Name.Attribute, Operator)),

            # keyword lines
            (r'^([\w.]+)(:)',
             bygroups(Name.Tag, Punctuation), 'spvalue'),

            # variable references
            include('interp'),

            # fallback
            (r'\s+', Whitespace),
            (r'[^${}#=:\n.]+', Text),
            (r'.', Text),
        ],
        'interp': [
            # you can escape literal "$" as "$$"
            (r'\$\$', Text),

            # variable references
            (r'\$\{', String.Interpol, 'curly'),
        ],
        'curly': [
            (r'\}', String.Interpol, '#pop'),
            (r'\w+', Name.Attribute),
        ],
        'spvalue': [
            include('interp'),

            (r'#.*$', Comment.Single, '#pop'),
            (r'\n', Whitespace, '#pop'),

            # fallback
            (r'\s+', Whitespace),
            (r'[^${}#\n\s]+', Text),
            (r'.', Text),
        ],
    }


class PacmanConfLexer(RegexLexer):
    """
    Lexer for pacman.conf.

    Actually, IniLexer works almost fine for this format,
    but it yield error token. It is because pacman.conf has
    a form without assignment like:

        UseSyslog
        Color
        TotalDownload
        CheckSpace
        VerbosePkgLists

    These are flags to switch on.
    """

    name = 'PacmanConf'
    url = 'https://www.archlinux.org/pacman/pacman.conf.5.html'
    aliases = ['pacmanconf']
    filenames = ['pacman.conf']
    mimetypes = []
    version_added = '2.1'

    tokens = {
        'root': [
            # comment
            (r'#.*$', Comment.Single),

            # section header
            (r'^(\s*)(\[.*?\])(\s*)$', bygroups(Whitespace, Keyword, Whitespace)),

            # variable definitions
            # (Leading space is allowed...)
            (r'(\w+)(\s*)(=)',
             bygroups(Name.Attribute, Whitespace, Operator)),

            # flags to on
            (r'^(\s*)(\w+)(\s*)$',
             bygroups(Whitespace, Name.Attribute, Whitespace)),

            # built-in special values
            (words((
                '$repo',  # repository
                '$arch',  # architecture
                '%o',     # outfile
                '%u',     # url
                ), suffix=r'\b'),
             Name.Variable),

            # fallback
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
    }


class AugeasLexer(RegexLexer):
    """
    Lexer for Augeas.
    """
    name = 'Augeas'
    url = 'http://augeas.net'
    aliases = ['augeas']
    filenames = ['*.aug']
    version_added = '2.4'

    tokens = {
        'root': [
            (r'(module)(\s*)([^\s=]+)', bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
            (r'(let)(\s*)([^\s=]+)', bygroups(Keyword.Declaration, Whitespace, Name.Variable)),
            (r'(del|store|value|counter|seq|key|label|autoload|incl|excl|transform|test|get|put)(\s+)', bygroups(Name.Builtin, Whitespace)),
            (r'(\()([^:]+)(\:)(unit|string|regexp|lens|tree|filter)(\))', bygroups(Punctuation, Name.Variable, Punctuation, Keyword.Type, Punctuation)),
            (r'\(\*', Comment.Multiline, 'comment'),
            (r'[*+\-.;=?|]', Operator),
            (r'[()\[\]{}]', Operator),
            (r'"', String.Double, 'string'),
            (r'\/', String.Regex, 'regex'),
            (r'([A-Z]\w*)(\.)(\w+)', bygroups(Name.Namespace, Punctuation, Name.Variable)),
            (r'.', Name.Variable),
            (r'\s+', Whitespace),
        ],
        'string': [
            (r'\\.', String.Escape),
            (r'[^"]', String.Double),
            (r'"', String.Double, '#pop'),
        ],
        'regex': [
            (r'\\.', String.Escape),
            (r'[^/]', String.Regex),
            (r'\/', String.Regex, '#pop'),
        ],
        'comment': [
            (r'[^*)]', Comment.Multiline),
            (r'\(\*', Comment.Multiline, '#push'),
            (r'\*\)', Comment.Multiline, '#pop'),
            (r'[)*]', Comment.Multiline)
        ],
    }


class TOMLLexer(RegexLexer):
    """
    Lexer for TOML, a simple language for config files.
    """

    name = 'TOML'
    aliases = ['toml']
    filenames = ['*.toml', 'Pipfile', 'poetry.lock']
    mimetypes = ['application/toml']
    url = 'https://toml.io'
    version_added = '2.4'

    # Based on the TOML spec: https://toml.io/en/v1.0.0

    # The following is adapted from CPython's tomllib:
    _time = r"\d\d:\d\d:\d\d(\.\d+)?"
    _datetime = rf"""(?x)
                  \d\d\d\d-\d\d-\d\d # date, e.g., 1988-10-27
                (
                  [Tt ] {_time} # optional time
                  (
                    [Zz]|[+-]\d\d:\d\d # optional time offset
                  )?
                )?
              """

    tokens = {
        'root': [
            # Note that we make an effort in order to distinguish
            # moments at which we're parsing a key and moments at
            # which we're parsing a value. In the TOML code
            #
            #   1234 = 1234
            #
            # the first "1234" should be Name, the second Integer.

            # Whitespace
            (r'\s+', Whitespace),

            # Comment
            (r'#.*', Comment.Single),

            # Assignment keys
            include('key'),

            # After "=", find a value
            (r'(=)(\s*)', bygroups(Operator, Whitespace), 'value'),

            # Table header
            (r'\[\[?', Keyword, 'table-key'),
        ],
        'key': [
            # Start of bare key (only ASCII is allowed here).
            (r'[A-Za-z0-9_-]+', Name),
            # Quoted key
            (r'"', String.Double, 'basic-string'),
            (r"'", String.Single, 'literal-string'),
            # Dots act as separators in keys
            (r'\.', Punctuation),
        ],
        'table-key': [
            # This is like 'key', but highlights the name components
            # and separating dots as Keyword because it looks better
            # when the whole table header is Keyword. We do highlight
            # strings as strings though.
            # Start of bare key (only ASCII is allowed here).
            (r'[A-Za-z0-9_-]+', Keyword),
            (r'"', String.Double, 'basic-string'),
            (r"'", String.Single, 'literal-string'),
            (r'\.', Keyword),
            (r'\]\]?', Keyword, '#pop'),

            # Inline whitespace allowed
            (r'[ \t]+', Whitespace),
        ],
        'value': [
            # Datetime, baretime
            (_datetime, Literal.Date, '#pop'),
            (_time, Literal.Date, '#pop'),

            # Recognize as float if there is a fractional part
            # and/or an exponent.
            (r'[+-]?\d[0-9_]*[eE][+-]?\d[0-9_]*', Number.Float, '#pop'),
            (r'[+-]?\d[0-9_]*\.\d[0-9_]*([eE][+-]?\d[0-9_]*)?',
             Number.Float, '#pop'),

            # Infinities and NaN
            (r'[+-]?(inf|nan)', Number.Float, '#pop'),

            # Integers
            (r'-?0b[01_]+', Number.Bin, '#pop'),
            (r'-?0o[0-7_]+', Number.Oct, '#pop'),
            (r'-?0x[0-9a-fA-F_]+', Number.Hex, '#pop'),
            (r'[+-]?[0-9_]+', Number.Integer, '#pop'),

            # Strings
            (r'"""', String.Double, ('#pop', 'multiline-basic-string')),
            (r'"', String.Double, ('#pop', 'basic-string')),
            (r"'''", String.Single, ('#pop', 'multiline-literal-string')),
            (r"'", String.Single, ('#pop', 'literal-string')),

            # Booleans
            (r'true|false', Keyword.Constant, '#pop'),

            # Start of array
            (r'\[', Punctuation, ('#pop', 'array')),

            # Start of inline table
            (r'\{', Punctuation, ('#pop', 'inline-table')),
        ],
        'array': [
            # Whitespace, including newlines, is ignored inside arrays,
            # and comments are allowed.
            (r'\s+', Whitespace),
            (r'#.*', Comment.Single),

            # Delimiters
            (r',', Punctuation),

            # End of array
            (r'\]', Punctuation, '#pop'),

            # Parse a value and come back
            default('value'),
        ],
        'inline-table': [
            # Note that unlike inline arrays, inline tables do not
            # allow newlines or comments.
            (r'[ \t]+', Whitespace),

            # Keys
            include('key'),

            # Values
            (r'(=)(\s*)', bygroups(Punctuation, Whitespace), 'value'),

            # Delimiters
            (r',', Punctuation),

            # End of inline table
            (r'\}', Punctuation, '#pop'),
        ],
        'basic-string': [
            (r'"', String.Double, '#pop'),
            include('escapes'),
            (r'[^"\\]+', String.Double),
        ],
        'literal-string': [
            (r".*?'", String.Single, '#pop'),
        ],
        'multiline-basic-string': [
            (r'"""', String.Double, '#pop'),
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),
            include('escapes'),
            (r'[^"\\]+', String.Double),
            (r'"', String.Double),
        ],
        'multiline-literal-string': [
            (r"'''", String.Single, '#pop'),
            (r"[^']+", String.Single),
            (r"'", String.Single),
        ],
        'escapes': [
            (r'\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}', String.Escape),
            (r'\\.', String.Escape),
        ],
    }

class NestedTextLexer(RegexLexer):
    """
    Lexer for *NextedText*, a human-friendly data format.

    .. versionchanged:: 2.16
        Added support for *NextedText* v3.0.
    """

    name = 'NestedText'
    url = 'https://nestedtext.org'
    aliases = ['nestedtext', 'nt']
    filenames = ['*.nt']
    version_added = '2.9'

    tokens = {
        'root': [
            # Comment: # ...
            (r'^([ ]*)(#.*)$', bygroups(Whitespace, Comment)),

            # Inline dictionary: {...}
            (r'^([ ]*)(\{)', bygroups(Whitespace, Punctuation), 'inline_dict'),

            # Inline list: [...]
            (r'^([ ]*)(\[)', bygroups(Whitespace, Punctuation), 'inline_list'),

            # empty multiline string item: >
            (r'^([ ]*)(>)$', bygroups(Whitespace, Punctuation)),

            # multiline string item: > ...
            (r'^([ ]*)(>)( )(.*?)([ \t]*)$', bygroups(Whitespace, Punctuation, Whitespace, Text, Whitespace)),

            # empty list item: -
            (r'^([ ]*)(-)$', bygroups(Whitespace, Punctuation)),

            # list item: - ...
            (r'^([ ]*)(-)( )(.*?)([ \t]*)$', bygroups(Whitespace, Punctuation, Whitespace, Text, Whitespace)),

            # empty multiline key item: :
            (r'^([ ]*)(:)$', bygroups(Whitespace, Punctuation)),

            # multiline key item: : ...
            (r'^([ ]*)(:)( )([^\n]*?)([ \t]*)$', bygroups(Whitespace, Punctuation, Whitespace, Name.Tag, Whitespace)),

            # empty dict key item: ...:
            (r'^([ ]*)([^\{\[\s].*?)(:)$', bygroups(Whitespace, Name.Tag, Punctuation)),

            # dict key item: ...: ...
            (r'^([ ]*)([^\{\[\s].*?)(:)( )(.*?)([ \t]*)$', bygroups(Whitespace, Name.Tag, Punctuation, Whitespace, Text, Whitespace)),
        ],
        'inline_list': [
            include('whitespace'),
            (r'[^\{\}\[\],\s]+', Text),
            include('inline_value'),
            (r',', Punctuation),
            (r'\]', Punctuation, '#pop'),
            (r'\n', Error, '#pop'),
        ],
        'inline_dict': [
            include('whitespace'),
            (r'[^\{\}\[\],:\s]+', Name.Tag),
            (r':', Punctuation, 'inline_dict_value'),
            (r'\}', Punctuation, '#pop'),
            (r'\n', Error, '#pop'),
        ],
        'inline_dict_value': [
            include('whitespace'),
            (r'[^\{\}\[\],:\s]+', Text),
            include('inline_value'),
            (r',', Punctuation, '#pop'),
            (r'\}', Punctuation, '#pop:2'),
        ],
        'inline_value': [
            include('whitespace'),
            (r'\{', Punctuation, 'inline_dict'),
            (r'\[', Punctuation, 'inline_list'),
        ],
        'whitespace': [
            (r'[ \t]+', Whitespace),
        ],
    }


class SingularityLexer(RegexLexer):
    """
    Lexer for Singularity definition files.
    """

    name = 'Singularity'
    url = 'https://www.sylabs.io/guides/3.0/user-guide/definition_files.html'
    aliases = ['singularity']
    filenames = ['*.def', 'Singularity']
    version_added = '2.6'
    flags = re.IGNORECASE | re.MULTILINE | re.DOTALL

    _headers = r'^(\s*)(bootstrap|from|osversion|mirrorurl|include|registry|namespace|includecmd)(:)'
    _section = r'^(%(?:pre|post|setup|environment|help|labels|test|runscript|files|startscript))(\s*)'
    _appsect = r'^(%app(?:install|help|run|labels|env|test|files))(\s*)'

    tokens = {
        'root': [
            (_section, bygroups(Generic.Heading, Whitespace), 'script'),
            (_appsect, bygroups(Generic.Heading, Whitespace), 'script'),
            (_headers, bygroups(Whitespace, Keyword, Text)),
            (r'\s*#.*?\n', Comment),
            (r'\b(([0-9]+\.?[0-9]*)|(\.[0-9]+))\b', Number),
            (r'[ \t]+', Whitespace),
            (r'(?!^\s*%).', Text),
        ],
        'script': [
            (r'(.+?(?=^\s*%))|(.*)', using(BashLexer), '#pop'),
        ],
    }

    def analyse_text(text):
        """This is a quite simple script file, but there are a few keywords
        which seem unique to this language."""
        result = 0
        if re.search(r'\b(?:osversion|includecmd|mirrorurl)\b', text, re.IGNORECASE):
            result += 0.5

        if re.search(SingularityLexer._section[1:], text):
            result += 0.49

        return result


class UnixConfigLexer(RegexLexer):
    """
    Lexer for Unix/Linux config files using colon-separated values, e.g.

    * ``/etc/group``
    * ``/etc/passwd``
    * ``/etc/shadow``
    """

    name = 'Unix/Linux config files'
    aliases = ['unixconfig', 'linuxconfig']
    filenames = []
    url = 'https://en.wikipedia.org/wiki/Configuration_file#Unix_and_Unix-like_operating_systems'
    version_added = '2.12'

    tokens = {
        'root': [
            (r'^#.*', Comment),
            (r'\n', Whitespace),
            (r':', Punctuation),
            (r'[0-9]+', Number),
            (r'((?!\n)[a-zA-Z0-9\_\-\s\(\),]){2,}', Text),
            (r'[^:\n]+', String),
        ],
    }
