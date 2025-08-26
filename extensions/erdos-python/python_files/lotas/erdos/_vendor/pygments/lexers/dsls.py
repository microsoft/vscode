"""
    pygments.lexers.dsls
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for various domain-specific languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import ExtendedRegexLexer, RegexLexer, bygroups, words, \
    include, default, this, using, combined
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['ProtoBufLexer', 'ZeekLexer', 'PuppetLexer', 'RslLexer',
           'MscgenLexer', 'VGLLexer', 'AlloyLexer', 'PanLexer',
           'CrmshLexer', 'ThriftLexer', 'FlatlineLexer', 'SnowballLexer']


class ProtoBufLexer(RegexLexer):
    """
    Lexer for Protocol Buffer definition files.
    """

    name = 'Protocol Buffer'
    url = 'https://developers.google.com/protocol-buffers/'
    aliases = ['protobuf', 'proto']
    filenames = ['*.proto']
    version_added = '1.4'

    tokens = {
        'root': [
            (r'[ \t]+', Whitespace),
            (r'[,;{}\[\]()<>]', Punctuation),
            (r'/(\\\n)?/(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?\*(.|\n)*?\*(\\\n)?/', Comment.Multiline),
            (words((
                'import', 'option', 'optional', 'required', 'repeated',
                'reserved', 'default', 'packed', 'ctype', 'extensions', 'to',
                'max', 'rpc', 'returns', 'oneof', 'syntax'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words((
                'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64',
                'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
                'float', 'double', 'bool', 'string', 'bytes'), suffix=r'\b'),
             Keyword.Type),
            (r'(true|false)\b', Keyword.Constant),
            (r'(package)(\s+)', bygroups(Keyword.Namespace, Whitespace), 'package'),
            (r'(message|extend)(\s+)',
             bygroups(Keyword.Declaration, Whitespace), 'message'),
            (r'(enum|group|service)(\s+)',
             bygroups(Keyword.Declaration, Whitespace), 'type'),
            (r'\".*?\"', String),
            (r'\'.*?\'', String),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[LlUu]*', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'(\-?(inf|nan))\b', Number.Float),
            (r'0x[0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'0[0-7]+[LlUu]*', Number.Oct),
            (r'\d+[LlUu]*', Number.Integer),
            (r'[+-=]', Operator),
            (r'([a-zA-Z_][\w.]*)([ \t]*)(=)',
             bygroups(Name.Attribute, Whitespace, Operator)),
            (r'[a-zA-Z_][\w.]*', Name),
        ],
        'package': [
            (r'[a-zA-Z_]\w*', Name.Namespace, '#pop'),
            default('#pop'),
        ],
        'message': [
            (r'[a-zA-Z_]\w*', Name.Class, '#pop'),
            default('#pop'),
        ],
        'type': [
            (r'[a-zA-Z_]\w*', Name, '#pop'),
            default('#pop'),
        ],
    }


class ThriftLexer(RegexLexer):
    """
    For Thrift interface definitions.
    """
    name = 'Thrift'
    url = 'https://thrift.apache.org/'
    aliases = ['thrift']
    filenames = ['*.thrift']
    mimetypes = ['application/x-thrift']
    version_added = '2.1'

    tokens = {
        'root': [
            include('whitespace'),
            include('comments'),
            (r'"', String.Double, combined('stringescape', 'dqs')),
            (r'\'', String.Single, combined('stringescape', 'sqs')),
            (r'(namespace)(\s+)',
                bygroups(Keyword.Namespace, Whitespace), 'namespace'),
            (r'(enum|union|struct|service|exception)(\s+)',
                bygroups(Keyword.Declaration, Whitespace), 'class'),
            (r'((?:(?:[^\W\d]|\$)[\w.\[\]$<>]*\s+)+?)'  # return arguments
             r'((?:[^\W\d]|\$)[\w$]*)'                  # method name
             r'(\s*)(\()',                              # signature start
             bygroups(using(this), Name.Function, Whitespace, Operator)),
            include('keywords'),
            include('numbers'),
            (r'[&=]', Operator),
            (r'[:;,{}()<>\[\]]', Punctuation),
            (r'[a-zA-Z_](\.\w|\w)*', Name),
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
        ],
        'comments': [
            (r'#.*$', Comment),
            (r'//.*?\n', Comment),
            (r'/\*[\w\W]*?\*/', Comment.Multiline),
        ],
        'stringescape': [
            (r'\\([\\nrt"\'])', String.Escape),
        ],
        'dqs': [
            (r'"', String.Double, '#pop'),
            (r'[^\\"\n]+', String.Double),
        ],
        'sqs': [
            (r"'", String.Single, '#pop'),
            (r'[^\\\'\n]+', String.Single),
        ],
        'namespace': [
            (r'[a-z*](\.\w|\w)*', Name.Namespace, '#pop'),
            default('#pop'),
        ],
        'class': [
            (r'[a-zA-Z_]\w*', Name.Class, '#pop'),
            default('#pop'),
        ],
        'keywords': [
            (r'(async|oneway|extends|throws|required|optional)\b', Keyword),
            (r'(true|false)\b', Keyword.Constant),
            (r'(const|typedef)\b', Keyword.Declaration),
            (words((
                'cpp_namespace', 'cpp_include', 'cpp_type', 'java_package',
                'cocoa_prefix', 'csharp_namespace', 'delphi_namespace',
                'php_namespace', 'py_module', 'perl_package',
                'ruby_namespace', 'smalltalk_category', 'smalltalk_prefix',
                'xsd_all', 'xsd_optional', 'xsd_nillable', 'xsd_namespace',
                'xsd_attrs', 'include'), suffix=r'\b'),
             Keyword.Namespace),
            (words((
                'void', 'bool', 'byte', 'i16', 'i32', 'i64', 'double',
                'string', 'binary', 'map', 'list', 'set', 'slist',
                'senum'), suffix=r'\b'),
             Keyword.Type),
            (words((
                'BEGIN', 'END', '__CLASS__', '__DIR__', '__FILE__',
                '__FUNCTION__', '__LINE__', '__METHOD__', '__NAMESPACE__',
                'abstract', 'alias', 'and', 'args', 'as', 'assert', 'begin',
                'break', 'case', 'catch', 'class', 'clone', 'continue',
                'declare', 'def', 'default', 'del', 'delete', 'do', 'dynamic',
                'elif', 'else', 'elseif', 'elsif', 'end', 'enddeclare',
                'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile',
                'ensure', 'except', 'exec', 'finally', 'float', 'for',
                'foreach', 'function', 'global', 'goto', 'if', 'implements',
                'import', 'in', 'inline', 'instanceof', 'interface', 'is',
                'lambda', 'module', 'native', 'new', 'next', 'nil', 'not',
                'or', 'pass', 'public', 'print', 'private', 'protected',
                'raise', 'redo', 'rescue', 'retry', 'register', 'return',
                'self', 'sizeof', 'static', 'super', 'switch', 'synchronized',
                'then', 'this', 'throw', 'transient', 'try', 'undef',
                'unless', 'unsigned', 'until', 'use', 'var', 'virtual',
                'volatile', 'when', 'while', 'with', 'xor', 'yield'),
                prefix=r'\b', suffix=r'\b'),
             Keyword.Reserved),
        ],
        'numbers': [
            (r'[+-]?(\d+\.\d+([eE][+-]?\d+)?|\.?\d+[eE][+-]?\d+)', Number.Float),
            (r'[+-]?0x[0-9A-Fa-f]+', Number.Hex),
            (r'[+-]?[0-9]+', Number.Integer),
        ],
    }


class ZeekLexer(RegexLexer):
    """
    For Zeek scripts.
    """
    name = 'Zeek'
    url = 'https://www.zeek.org/'
    aliases = ['zeek', 'bro']
    filenames = ['*.zeek', '*.bro']
    version_added = '2.5'

    _hex = r'[0-9a-fA-F]'
    _float = r'((\d*\.?\d+)|(\d+\.?\d*))([eE][-+]?\d+)?'
    _h = r'[A-Za-z0-9][-A-Za-z0-9]*'

    tokens = {
        'root': [
            include('whitespace'),
            include('comments'),
            include('directives'),
            include('attributes'),
            include('types'),
            include('keywords'),
            include('literals'),
            include('operators'),
            include('punctuation'),
            (r'((?:[A-Za-z_]\w*)(?:::(?:[A-Za-z_]\w*))*)(?=\s*\()',
                Name.Function),
            include('identifiers'),
        ],

        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(Text, Whitespace)),
        ],

        'comments': [
            (r'#.*$', Comment),
        ],

        'directives': [
            (r'@(load-plugin|load-sigs|load|unload)\b.*$', Comment.Preproc),
            (r'@(DEBUG|DIR|FILENAME|deprecated|if|ifdef|ifndef|else|endif)\b', Comment.Preproc),
            (r'(@prefixes)(\s*)((\+?=).*)$', bygroups(Comment.Preproc,
                Whitespace, Comment.Preproc)),
        ],

        'attributes': [
            (words(('redef', 'priority', 'log', 'optional', 'default', 'add_func',
                    'delete_func', 'expire_func', 'read_expire', 'write_expire',
                    'create_expire', 'synchronized', 'persistent', 'rotate_interval',
                    'rotate_size', 'encrypt', 'raw_output', 'mergeable', 'error_handler',
                    'type_column', 'deprecated'),
                prefix=r'&', suffix=r'\b'),
             Keyword.Pseudo),
        ],

        'types': [
            (words(('any',
                    'enum', 'record', 'set', 'table', 'vector',
                    'function', 'hook', 'event',
                    'addr', 'bool', 'count', 'double', 'file', 'int', 'interval',
                    'pattern', 'port', 'string', 'subnet', 'time'),
                suffix=r'\b'),
             Keyword.Type),

            (r'(opaque)(\s+)(of)(\s+)((?:[A-Za-z_]\w*)(?:::(?:[A-Za-z_]\w*))*)\b',
                bygroups(Keyword.Type, Whitespace, Operator.Word, Whitespace, Keyword.Type)),

            (r'(type)(\s+)((?:[A-Za-z_]\w*)(?:::(?:[A-Za-z_]\w*))*)(\s*)(:)(\s*)\b(record|enum)\b',
                bygroups(Keyword, Whitespace, Name.Class, Whitespace, Operator, Whitespace, Keyword.Type)),

            (r'(type)(\s+)((?:[A-Za-z_]\w*)(?:::(?:[A-Za-z_]\w*))*)(\s*)(:)',
                bygroups(Keyword, Whitespace, Name, Whitespace, Operator)),

            (r'(redef)(\s+)(record|enum)(\s+)((?:[A-Za-z_]\w*)(?:::(?:[A-Za-z_]\w*))*)\b',
                bygroups(Keyword, Whitespace, Keyword.Type, Whitespace, Name.Class)),
        ],

        'keywords': [
            (words(('redef', 'export', 'if', 'else', 'for', 'while',
                    'return', 'break', 'next', 'continue', 'fallthrough',
                    'switch', 'default', 'case',
                    'add', 'delete',
                    'when', 'timeout', 'schedule'),
                suffix=r'\b'),
             Keyword),
            (r'(print)\b', Keyword),
            (r'(global|local|const|option)\b', Keyword.Declaration),
            (r'(module)(\s+)(([A-Za-z_]\w*)(?:::([A-Za-z_]\w*))*)\b',
                bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
        ],

        'literals': [
            (r'"', String, 'string'),

            # Not the greatest match for patterns, but generally helps
            # disambiguate between start of a pattern and just a division
            # operator.
            (r'/(?=.*/)', String.Regex, 'regex'),

            (r'(T|F)\b', Keyword.Constant),

            # Port
            (r'\d{1,5}/(udp|tcp|icmp|unknown)\b', Number),

            # IPv4 Address
            (r'(\d{1,3}.){3}(\d{1,3})\b', Number),

            # IPv6 Address
            (r'\[([0-9a-fA-F]{0,4}:){2,7}([0-9a-fA-F]{0,4})?((\d{1,3}.){3}(\d{1,3}))?\]', Number),

            # Numeric
            (r'0[xX]' + _hex + r'+\b', Number.Hex),
            (_float + r'\s*(day|hr|min|sec|msec|usec)s?\b', Number.Float),
            (_float + r'\b', Number.Float),
            (r'(\d+)\b', Number.Integer),

            # Hostnames
            (_h + r'(\.' + _h + r')+', String),
        ],

        'operators': [
            (r'[!%*/+<=>~|&^-]', Operator),
            (r'([-+=&|]{2}|[+=!><-]=)', Operator),
            (r'(in|as|is|of)\b', Operator.Word),
            (r'\??\$', Operator),
        ],

        'punctuation': [
            (r'[{}()\[\],;.]', Punctuation),
            # The "ternary if", which uses '?' and ':', could instead be
            # treated as an Operator, but colons are more frequently used to
            # separate field/identifier names from their types, so the (often)
            # less-prominent Punctuation is used even with '?' for consistency.
            (r'[?:]', Punctuation),
        ],

        'identifiers': [
            (r'([a-zA-Z_]\w*)(::)', bygroups(Name, Punctuation)),
            (r'[a-zA-Z_]\w*', Name)
        ],

        'string': [
            (r'\\.', String.Escape),
            (r'%-?[0-9]*(\.[0-9]+)?[DTd-gsx]', String.Escape),
            (r'"', String, '#pop'),
            (r'.', String),
        ],

        'regex': [
            (r'\\.', String.Escape),
            (r'/', String.Regex, '#pop'),
            (r'.', String.Regex),
        ],
    }


BroLexer = ZeekLexer


class PuppetLexer(RegexLexer):
    """
    For Puppet configuration DSL.
    """
    name = 'Puppet'
    url = 'https://puppet.com/'
    aliases = ['puppet']
    filenames = ['*.pp']
    version_added = '1.6'

    tokens = {
        'root': [
            include('comments'),
            include('keywords'),
            include('names'),
            include('numbers'),
            include('operators'),
            include('strings'),

            (r'[]{}:(),;[]', Punctuation),
            (r'\s+', Whitespace),
        ],

        'comments': [
            (r'(\s*)(#.*)$', bygroups(Whitespace, Comment)),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
        ],

        'operators': [
            (r'(=>|\?|<|>|=|\+|-|/|\*|~|!|\|)', Operator),
            (r'(in|and|or|not)\b', Operator.Word),
        ],

        'names': [
            (r'[a-zA-Z_]\w*', Name.Attribute),
            (r'(\$\S+)(\[)(\S+)(\])', bygroups(Name.Variable, Punctuation,
                                               String, Punctuation)),
            (r'\$\S+', Name.Variable),
        ],

        'numbers': [
            # Copypasta from the Python lexer
            (r'(\d+\.\d*|\d*\.\d+)([eE][+-]?[0-9]+)?j?', Number.Float),
            (r'\d+[eE][+-]?[0-9]+j?', Number.Float),
            (r'0[0-7]+j?', Number.Oct),
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (r'\d+L', Number.Integer.Long),
            (r'\d+j?', Number.Integer)
        ],

        'keywords': [
            # Left out 'group' and 'require'
            # Since they're often used as attributes
            (words((
                'absent', 'alert', 'alias', 'audit', 'augeas', 'before', 'case',
                'check', 'class', 'computer', 'configured', 'contained',
                'create_resources', 'crit', 'cron', 'debug', 'default',
                'define', 'defined', 'directory', 'else', 'elsif', 'emerg',
                'err', 'exec', 'extlookup', 'fail', 'false', 'file',
                'filebucket', 'fqdn_rand', 'generate', 'host', 'if', 'import',
                'include', 'info', 'inherits', 'inline_template', 'installed',
                'interface', 'k5login', 'latest', 'link', 'loglevel',
                'macauthorization', 'mailalias', 'maillist', 'mcx', 'md5',
                'mount', 'mounted', 'nagios_command', 'nagios_contact',
                'nagios_contactgroup', 'nagios_host', 'nagios_hostdependency',
                'nagios_hostescalation', 'nagios_hostextinfo', 'nagios_hostgroup',
                'nagios_service', 'nagios_servicedependency', 'nagios_serviceescalation',
                'nagios_serviceextinfo', 'nagios_servicegroup', 'nagios_timeperiod',
                'node', 'noop', 'notice', 'notify', 'package', 'present', 'purged',
                'realize', 'regsubst', 'resources', 'role', 'router', 'running',
                'schedule', 'scheduled_task', 'search', 'selboolean', 'selmodule',
                'service', 'sha1', 'shellquote', 'split', 'sprintf',
                'ssh_authorized_key', 'sshkey', 'stage', 'stopped', 'subscribe',
                'tag', 'tagged', 'template', 'tidy', 'true', 'undef', 'unmounted',
                'user', 'versioncmp', 'vlan', 'warning', 'yumrepo', 'zfs', 'zone',
                'zpool'), prefix='(?i)', suffix=r'\b'),
             Keyword),
        ],

        'strings': [
            (r'"([^"])*"', String),
            (r"'(\\'|[^'])*'", String),
        ],

    }


class RslLexer(RegexLexer):
    """
    RSL is the formal specification
    language used in RAISE (Rigorous Approach to Industrial Software Engineering)
    method.
    """
    name = 'RSL'
    url = 'http://en.wikipedia.org/wiki/RAISE'
    aliases = ['rsl']
    filenames = ['*.rsl']
    mimetypes = ['text/rsl']
    version_added = '2.0'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            (words((
                'Bool', 'Char', 'Int', 'Nat', 'Real', 'Text', 'Unit', 'abs',
                'all', 'always', 'any', 'as', 'axiom', 'card', 'case', 'channel',
                'chaos', 'class', 'devt_relation', 'dom', 'elems', 'else', 'elif',
                'end', 'exists', 'extend', 'false', 'for', 'hd', 'hide', 'if',
                'in', 'is', 'inds', 'initialise', 'int', 'inter', 'isin', 'len',
                'let', 'local', 'ltl_assertion', 'object', 'of', 'out', 'post',
                'pre', 'read', 'real', 'rng', 'scheme', 'skip', 'stop', 'swap',
                'then', 'theory', 'test_case', 'tl', 'transition_system', 'true',
                'type', 'union', 'until', 'use', 'value', 'variable', 'while',
                'with', 'write', '~isin', '-inflist', '-infset', '-list',
                '-set'), prefix=r'\b', suffix=r'\b'),
             Keyword),
            (r'(variable|value)\b', Keyword.Declaration),
            (r'--.*?\n', Comment),
            (r'<:.*?:>', Comment),
            (r'\{!.*?!\}', Comment),
            (r'/\*.*?\*/', Comment),
            (r'^([ \t]*)([\w]+)([ \t]*)(:[^:])', bygroups(Whitespace,
                Name.Function, Whitespace, Name.Function)),
            (r'(^[ \t]*)([\w]+)([ \t]*)(\([\w\s,]*\))([ \t]*)(is|as)',
             bygroups(Whitespace, Name.Function, Whitespace, Text,
                 Whitespace, Keyword)),
            (r'\b[A-Z]\w*\b', Keyword.Type),
            (r'(true|false)\b', Keyword.Constant),
            (r'".*"', String),
            (r'\'.\'', String.Char),
            (r'(><|->|-m->|/\\|<=|<<=|<\.|\|\||\|\^\||-~->|-~m->|\\/|>=|>>|'
             r'\.>|\+\+|-\\|<->|=>|:-|~=|\*\*|<<|>>=|\+>|!!|\|=\||#)',
             Operator),
            (r'[0-9]+\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'0x[0-9a-f]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
    }

    def analyse_text(text):
        """
        Check for the most common text in the beginning of a RSL file.
        """
        if re.search(r'scheme\s*.*?=\s*class\s*type', text, re.I) is not None:
            return 1.0


class MscgenLexer(RegexLexer):
    """
    For Mscgen files.
    """
    name = 'Mscgen'
    url = 'http://www.mcternan.me.uk/mscgen/'
    aliases = ['mscgen', 'msc']
    filenames = ['*.msc']
    version_added = '1.6'

    _var = r'(\w+|"(?:\\"|[^"])*")'

    tokens = {
        'root': [
            (r'msc\b', Keyword.Type),
            # Options
            (r'(hscale|HSCALE|width|WIDTH|wordwraparcs|WORDWRAPARCS'
             r'|arcgradient|ARCGRADIENT)\b', Name.Property),
            # Operators
            (r'(abox|ABOX|rbox|RBOX|box|BOX|note|NOTE)\b', Operator.Word),
            (r'(\.|-|\|){3}', Keyword),
            (r'(?:-|=|\.|:){2}'
             r'|<<=>>|<->|<=>|<<>>|<:>'
             r'|->|=>>|>>|=>|:>|-x|-X'
             r'|<-|<<=|<<|<=|<:|x-|X-|=', Operator),
            # Names
            (r'\*', Name.Builtin),
            (_var, Name.Variable),
            # Other
            (r'\[', Punctuation, 'attrs'),
            (r'\{|\}|,|;', Punctuation),
            include('comments')
        ],
        'attrs': [
            (r'\]', Punctuation, '#pop'),
            (_var + r'(\s*)(=)(\s*)' + _var,
             bygroups(Name.Attribute, Whitespace, Operator, Whitespace,
                      String)),
            (r',', Punctuation),
            include('comments')
        ],
        'comments': [
            (r'(?://|#).*?\n', Comment.Single),
            (r'/\*(?:.|\n)*?\*/', Comment.Multiline),
            (r'[ \t\r\n]+', Whitespace)
        ]
    }


class VGLLexer(RegexLexer):
    """
    For SampleManager VGL source code.
    """
    name = 'VGL'
    url = 'http://www.thermoscientific.com/samplemanager'
    aliases = ['vgl']
    filenames = ['*.rpf']
    version_added = '1.6'

    flags = re.MULTILINE | re.DOTALL | re.IGNORECASE

    tokens = {
        'root': [
            (r'\{[^}]*\}', Comment.Multiline),
            (r'declare', Keyword.Constant),
            (r'(if|then|else|endif|while|do|endwhile|and|or|prompt|object'
             r'|create|on|line|with|global|routine|value|endroutine|constant'
             r'|global|set|join|library|compile_option|file|exists|create|copy'
             r'|delete|enable|windows|name|notprotected)(?! *[=<>.,()])',
             Keyword),
            (r'(true|false|null|empty|error|locked)', Keyword.Constant),
            (r'[~^*#!%&\[\]()<>|+=:;,./?-]', Operator),
            (r'"[^"]*"', String),
            (r'(\.)([a-z_$][\w$]*)', bygroups(Operator, Name.Attribute)),
            (r'[0-9][0-9]*(\.[0-9]+(e[+\-]?[0-9]+)?)?', Number),
            (r'[a-z_$][\w$]*', Name),
            (r'[\r\n]+', Whitespace),
            (r'\s+', Whitespace)
        ]
    }


class AlloyLexer(RegexLexer):
    """
    For Alloy source code.
    """

    name = 'Alloy'
    url = 'http://alloy.mit.edu'
    aliases = ['alloy']
    filenames = ['*.als']
    mimetypes = ['text/x-alloy']
    version_added = '2.0'

    flags = re.MULTILINE | re.DOTALL

    iden_rex = r'[a-zA-Z_][\w]*"*'
    string_rex = r'"\b(\\\\|\\[^\\]|[^"\\])*"'
    text_tuple = (r'[^\S\n]+', Whitespace)

    tokens = {
        'sig': [
            (r'(extends)\b', Keyword, '#pop'),
            (iden_rex, Name),
            text_tuple,
            (r',', Punctuation),
            (r'\{', Operator, '#pop'),
        ],
        'module': [
            text_tuple,
            (iden_rex, Name, '#pop'),
        ],
        'fun': [
            text_tuple,
            (r'\{', Operator, '#pop'),
            (iden_rex, Name, '#pop'),
        ],
        'fact': [
            include('fun'),
            (string_rex, String, '#pop'),
        ],
        'root': [
            (r'--.*?$', Comment.Single),
            (r'//.*?$', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline),
            text_tuple,
            (r'(module|open)(\s+)', bygroups(Keyword.Namespace, Whitespace),
                'module'),
            (r'(sig|enum)(\s+)', bygroups(Keyword.Declaration, Whitespace), 'sig'),
            (r'(iden|univ|none)\b', Keyword.Constant),
            (r'(int|Int)\b', Keyword.Type),
            (r'(var|this|abstract|extends|set|seq|one|lone|let)\b', Keyword),
            (r'(all|some|no|sum|disj|when|else)\b', Keyword),
            (r'(run|check|for|but|exactly|expect|as|steps)\b', Keyword),
            (r'(always|after|eventually|until|release)\b', Keyword), # future time operators
            (r'(historically|before|once|since|triggered)\b', Keyword), # past time operators
            (r'(and|or|implies|iff|in)\b', Operator.Word),
            (r'(fun|pred|assert)(\s+)', bygroups(Keyword, Whitespace), 'fun'),
            (r'(fact)(\s+)', bygroups(Keyword, Whitespace), 'fact'),
            (r'!|#|&&|\+\+|<<|>>|>=|<=>|<=|\.\.|\.|->', Operator),
            (r'[-+/*%=<>&!^|~{}\[\]().\';]', Operator),
            (iden_rex, Name),
            (r'[:,]', Punctuation),
            (r'[0-9]+', Number.Integer),
            (string_rex, String),
            (r'\n', Whitespace),
        ]
    }


class PanLexer(RegexLexer):
    """
    Lexer for pan source files.

    Based on tcsh lexer.
    """

    name = 'Pan'
    url = 'https://github.com/quattor/pan/'
    aliases = ['pan']
    filenames = ['*.pan']
    version_added = '2.0'

    tokens = {
        'root': [
            include('basic'),
            (r'\(', Keyword, 'paren'),
            (r'\{', Keyword, 'curly'),
            include('data'),
        ],
        'basic': [
            (words((
                'if', 'for', 'with', 'else', 'type', 'bind', 'while', 'valid', 'final',
                'prefix', 'unique', 'object', 'foreach', 'include', 'template',
                'function', 'variable', 'structure', 'extensible', 'declaration'),
                prefix=r'\b', suffix=r'\b'),
             Keyword),
            (words((
                'file_contents', 'format', 'index', 'length', 'match', 'matches',
                'replace', 'splice', 'split', 'substr', 'to_lowercase', 'to_uppercase',
                'debug', 'error', 'traceback', 'deprecated', 'base64_decode',
                'base64_encode', 'digest', 'escape', 'unescape', 'append', 'create',
                'first', 'nlist', 'key', 'list', 'merge', 'next', 'prepend', 'is_boolean',
                'is_defined', 'is_double', 'is_list', 'is_long', 'is_nlist', 'is_null',
                'is_number', 'is_property', 'is_resource', 'is_string', 'to_boolean',
                'to_double', 'to_long', 'to_string', 'clone', 'delete', 'exists',
                'path_exists', 'if_exists', 'return', 'value'),
                prefix=r'\b', suffix=r'\b'),
             Name.Builtin),
            (r'#.*', Comment),
            (r'\\[\w\W]', String.Escape),
            (r'(\b\w+)(\s*)(=)', bygroups(Name.Variable, Whitespace, Operator)),
            (r'[\[\]{}()=]+', Operator),
            (r'<<\s*(\'?)\\?(\w+)[\w\W]+?\2', String),
            (r';', Punctuation),
        ],
        'data': [
            (r'(?s)"(\\\\|\\[0-7]+|\\.|[^"\\])*"', String.Double),
            (r"(?s)'(\\\\|\\[0-7]+|\\.|[^'\\])*'", String.Single),
            (r'\s+', Whitespace),
            (r'[^=\s\[\]{}()$"\'`\\;#]+', Text),
            (r'\d+(?= |\Z)', Number),
        ],
        'curly': [
            (r'\}', Keyword, '#pop'),
            (r':-', Keyword),
            (r'\w+', Name.Variable),
            (r'[^}:"\'`$]+', Punctuation),
            (r':', Punctuation),
            include('root'),
        ],
        'paren': [
            (r'\)', Keyword, '#pop'),
            include('root'),
        ],
    }


class CrmshLexer(RegexLexer):
    """
    Lexer for crmsh configuration files for Pacemaker clusters.
    """
    name = 'Crmsh'
    url = 'http://crmsh.github.io/'
    aliases = ['crmsh', 'pcmk']
    filenames = ['*.crmsh', '*.pcmk']
    mimetypes = []
    version_added = '2.1'

    elem = words((
        'node', 'primitive', 'group', 'clone', 'ms', 'location',
        'colocation', 'order', 'fencing_topology', 'rsc_ticket',
        'rsc_template', 'property', 'rsc_defaults',
        'op_defaults', 'acl_target', 'acl_group', 'user', 'role',
        'tag'), suffix=r'(?![\w#$-])')
    sub = words((
        'params', 'meta', 'operations', 'op', 'rule',
        'attributes', 'utilization'), suffix=r'(?![\w#$-])')
    acl = words(('read', 'write', 'deny'), suffix=r'(?![\w#$-])')
    bin_rel = words(('and', 'or'), suffix=r'(?![\w#$-])')
    un_ops = words(('defined', 'not_defined'), suffix=r'(?![\w#$-])')
    date_exp = words(('in_range', 'date', 'spec', 'in'), suffix=r'(?![\w#$-])')
    acl_mod = (r'(?:tag|ref|reference|attribute|type|xpath)')
    bin_ops = (r'(?:lt|gt|lte|gte|eq|ne)')
    val_qual = (r'(?:string|version|number)')
    rsc_role_action = (r'(?:Master|Started|Slave|Stopped|'
                       r'start|promote|demote|stop)')

    tokens = {
        'root': [
            (r'^(#.*)(\n)?', bygroups(Comment, Whitespace)),
            # attr=value (nvpair)
            (r'([\w#$-]+)(=)("(?:""|[^"])*"|\S+)',
                bygroups(Name.Attribute, Punctuation, String)),
            # need this construct, otherwise numeric node ids
            # are matched as scores
            # elem id:
            (r'(node)(\s+)([\w#$-]+)(:)',
                bygroups(Keyword, Whitespace, Name, Punctuation)),
            # scores
            (r'([+-]?([0-9]+|inf)):', Number),
            # keywords (elements and other)
            (elem, Keyword),
            (sub, Keyword),
            (acl, Keyword),
            # binary operators
            (rf'(?:{val_qual}:)?({bin_ops})(?![\w#$-])', Operator.Word),
            # other operators
            (bin_rel, Operator.Word),
            (un_ops, Operator.Word),
            (date_exp, Operator.Word),
            # builtin attributes (e.g. #uname)
            (r'#[a-z]+(?![\w#$-])', Name.Builtin),
            # acl_mod:blah
            (rf'({acl_mod})(:)("(?:""|[^"])*"|\S+)',
             bygroups(Keyword, Punctuation, Name)),
            # rsc_id[:(role|action)]
            # NB: this matches all other identifiers
            (rf'([\w#$-]+)(?:(:)({rsc_role_action}))?(?![\w#$-])',
             bygroups(Name, Punctuation, Operator.Word)),
            # punctuation
            (r'(\\(?=\n)|[\[\](){}/:@])', Punctuation),
            (r'\s+|\n', Whitespace),
        ],
    }


class FlatlineLexer(RegexLexer):
    """
    Lexer for Flatline expressions.
    """
    name = 'Flatline'
    url = 'https://github.com/bigmlcom/flatline'
    aliases = ['flatline']
    filenames = []
    mimetypes = ['text/x-flatline']
    version_added = '2.2'

    special_forms = ('let',)

    builtins = (
        "!=", "*", "+", "-", "<", "<=", "=", ">", ">=", "abs", "acos", "all",
        "all-but", "all-with-defaults", "all-with-numeric-default", "and",
        "asin", "atan", "avg", "avg-window", "bin-center", "bin-count", "call",
        "category-count", "ceil", "cond", "cond-window", "cons", "cos", "cosh",
        "count", "diff-window", "div", "ensure-value", "ensure-weighted-value",
        "epoch", "epoch-day", "epoch-fields", "epoch-hour", "epoch-millisecond",
        "epoch-minute", "epoch-month", "epoch-second", "epoch-weekday",
        "epoch-year", "exp", "f", "field", "field-prop", "fields", "filter",
        "first", "floor", "head", "if", "in", "integer", "language", "length",
        "levenshtein", "linear-regression", "list", "ln", "log", "log10", "map",
        "matches", "matches?", "max", "maximum", "md5", "mean", "median", "min",
        "minimum", "missing", "missing-count", "missing?", "missing_count",
        "mod", "mode", "normalize", "not", "nth", "occurrences", "or",
        "percentile", "percentile-label", "population", "population-fraction",
        "pow", "preferred", "preferred?", "quantile-label", "rand", "rand-int",
        "random-value", "re-quote", "real", "replace", "replace-first", "rest",
        "round", "row-number", "segment-label", "sha1", "sha256", "sin", "sinh",
        "sqrt", "square", "standard-deviation", "standard_deviation", "str",
        "subs", "sum", "sum-squares", "sum-window", "sum_squares", "summary",
        "summary-no", "summary-str", "tail", "tan", "tanh", "to-degrees",
        "to-radians", "variance", "vectorize", "weighted-random-value", "window",
        "winnow", "within-percentiles?", "z-score",
    )

    valid_name = r'(?!#)[\w!$%*+<=>?/.#-]+'

    tokens = {
        'root': [
            # whitespaces - usually not relevant
            (r'[,]+', Text),
            (r'\s+', Whitespace),

            # numbers
            (r'-?\d+\.\d+', Number.Float),
            (r'-?\d+', Number.Integer),
            (r'0x-?[a-f\d]+', Number.Hex),

            # strings, symbols and characters
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            (r"\\(.|[a-z]+)", String.Char),

            # expression template placeholder
            (r'_', String.Symbol),

            # highlight the special forms
            (words(special_forms, suffix=' '), Keyword),

            # highlight the builtins
            (words(builtins, suffix=' '), Name.Builtin),

            # the remaining functions
            (r'(?<=\()' + valid_name, Name.Function),

            # find the remaining variables
            (valid_name, Name.Variable),

            # parentheses
            (r'(\(|\))', Punctuation),
        ],
    }


class SnowballLexer(ExtendedRegexLexer):
    """
    Lexer for Snowball source code.
    """

    name = 'Snowball'
    url = 'https://snowballstem.org/'
    aliases = ['snowball']
    filenames = ['*.sbl']
    version_added = '2.2'

    _ws = r'\n\r\t '

    def __init__(self, **options):
        self._reset_stringescapes()
        ExtendedRegexLexer.__init__(self, **options)

    def _reset_stringescapes(self):
        self._start = "'"
        self._end = "'"

    def _string(do_string_first):
        def callback(lexer, match, ctx):
            s = match.start()
            text = match.group()
            string = re.compile(rf'([^{re.escape(lexer._start)}]*)(.)').match
            escape = re.compile(rf'([^{re.escape(lexer._end)}]*)(.)').match
            pos = 0
            do_string = do_string_first
            while pos < len(text):
                if do_string:
                    match = string(text, pos)
                    yield s + match.start(1), String.Single, match.group(1)
                    if match.group(2) == "'":
                        yield s + match.start(2), String.Single, match.group(2)
                        ctx.stack.pop()
                        break
                    yield s + match.start(2), String.Escape, match.group(2)
                    pos = match.end()
                match = escape(text, pos)
                yield s + match.start(), String.Escape, match.group()
                if match.group(2) != lexer._end:
                    ctx.stack[-1] = 'escape'
                    break
                pos = match.end()
                do_string = True
            ctx.pos = s + match.end()
        return callback

    def _stringescapes(lexer, match, ctx):
        lexer._start = match.group(3)
        lexer._end = match.group(5)
        return bygroups(Keyword.Reserved, Whitespace, String.Escape, Whitespace,
                        String.Escape)(lexer, match, ctx)

    tokens = {
        'root': [
            (r'len\b', Name.Builtin),
            (r'lenof\b', Operator.Word),
            include('root1'),
        ],
        'root1': [
            (rf'[{_ws}]+', Whitespace),
            (r'\d+', Number.Integer),
            (r"'", String.Single, 'string'),
            (r'[()]', Punctuation),
            (r'/\*[\w\W]*?\*/', Comment.Multiline),
            (r'//.*', Comment.Single),
            (r'[!*+\-/<=>]=|[-=]>|<[+-]|[$*+\-/<=>?\[\]]', Operator),
            (words(('as', 'get', 'hex', 'among', 'define', 'decimal',
                    'backwardmode'), suffix=r'\b'),
             Keyword.Reserved),
            (words(('strings', 'booleans', 'integers', 'routines', 'externals',
                    'groupings'), suffix=r'\b'),
             Keyword.Reserved, 'declaration'),
            (words(('do', 'or', 'and', 'for', 'hop', 'non', 'not', 'set', 'try',
                    'fail', 'goto', 'loop', 'next', 'test', 'true',
                    'false', 'unset', 'atmark', 'attach', 'delete', 'gopast',
                    'insert', 'repeat', 'sizeof', 'tomark', 'atleast',
                    'atlimit', 'reverse', 'setmark', 'tolimit', 'setlimit',
                    'backwards', 'substring'), suffix=r'\b'),
             Operator.Word),
            (words(('size', 'limit', 'cursor', 'maxint', 'minint'),
                   suffix=r'\b'),
             Name.Builtin),
            (rf'(stringdef\b)([{_ws}]*)([^{_ws}]+)',
             bygroups(Keyword.Reserved, Whitespace, String.Escape)),
            (rf'(stringescapes\b)([{_ws}]*)(.)([{_ws}]*)(.)',
             _stringescapes),
            (r'[A-Za-z]\w*', Name),
        ],
        'declaration': [
            (r'\)', Punctuation, '#pop'),
            (words(('len', 'lenof'), suffix=r'\b'), Name,
             ('root1', 'declaration')),
            include('root1'),
        ],
        'string': [
            (r"[^']*'", _string(True)),
        ],
        'escape': [
            (r"[^']*'", _string(False)),
        ],
    }

    def get_tokens_unprocessed(self, text=None, context=None):
        self._reset_stringescapes()
        return ExtendedRegexLexer.get_tokens_unprocessed(self, text, context)
