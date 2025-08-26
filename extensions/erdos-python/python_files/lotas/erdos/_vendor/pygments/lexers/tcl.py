"""
    pygments.lexers.tcl
    ~~~~~~~~~~~~~~~~~~~

    Lexers for Tcl and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Whitespace
from lotas.erdos._vendor.pygments.util import shebang_matches

__all__ = ['TclLexer']


class TclLexer(RegexLexer):
    """
    For Tcl source code.
    """

    keyword_cmds_re = words((
        'after', 'apply', 'array', 'break', 'catch', 'continue', 'elseif',
        'else', 'error', 'eval', 'expr', 'for', 'foreach', 'global', 'if',
        'namespace', 'proc', 'rename', 'return', 'set', 'switch', 'then',
        'trace', 'unset', 'update', 'uplevel', 'upvar', 'variable', 'vwait',
        'while'), prefix=r'\b', suffix=r'\b')

    builtin_cmds_re = words((
        'append', 'bgerror', 'binary', 'cd', 'chan', 'clock', 'close',
        'concat', 'dde', 'dict', 'encoding', 'eof', 'exec', 'exit', 'fblocked',
        'fconfigure', 'fcopy', 'file', 'fileevent', 'flush', 'format', 'gets',
        'glob', 'history', 'http', 'incr', 'info', 'interp', 'join', 'lappend',
        'lassign', 'lindex', 'linsert', 'list', 'llength', 'load', 'loadTk',
        'lrange', 'lrepeat', 'lreplace', 'lreverse', 'lsearch', 'lset', 'lsort',
        'mathfunc', 'mathop', 'memory', 'msgcat', 'open', 'package', 'pid',
        'pkg::create', 'pkg_mkIndex', 'platform', 'platform::shell', 'puts',
        'pwd', 're_syntax', 'read', 'refchan', 'regexp', 'registry', 'regsub',
        'scan', 'seek', 'socket', 'source', 'split', 'string', 'subst', 'tell',
        'time', 'tm', 'unknown', 'unload'), prefix=r'\b', suffix=r'\b')

    name = 'Tcl'
    url = 'https://www.tcl.tk/about/language.html'
    aliases = ['tcl']
    filenames = ['*.tcl', '*.rvt']
    mimetypes = ['text/x-tcl', 'text/x-script.tcl', 'application/x-tcl']
    version_added = '0.10'

    def _gen_command_rules(keyword_cmds_re, builtin_cmds_re, context=""):
        return [
            (keyword_cmds_re, Keyword, 'params' + context),
            (builtin_cmds_re, Name.Builtin, 'params' + context),
            (r'([\w.-]+)', Name.Variable, 'params' + context),
            (r'#', Comment, 'comment'),
        ]

    tokens = {
        'root': [
            include('command'),
            include('basic'),
            include('data'),
            (r'\}', Keyword),  # HACK: somehow we miscounted our braces
        ],
        'command': _gen_command_rules(keyword_cmds_re, builtin_cmds_re),
        'command-in-brace': _gen_command_rules(keyword_cmds_re,
                                               builtin_cmds_re,
                                               "-in-brace"),
        'command-in-bracket': _gen_command_rules(keyword_cmds_re,
                                                 builtin_cmds_re,
                                                 "-in-bracket"),
        'command-in-paren': _gen_command_rules(keyword_cmds_re,
                                               builtin_cmds_re,
                                               "-in-paren"),
        'basic': [
            (r'\(', Keyword, 'paren'),
            (r'\[', Keyword, 'bracket'),
            (r'\{', Keyword, 'brace'),
            (r'"', String.Double, 'string'),
            (r'(eq|ne|in|ni)\b', Operator.Word),
            (r'!=|==|<<|>>|<=|>=|&&|\|\||\*\*|[-+~!*/%<>&^|?:]', Operator),
        ],
        'data': [
            (r'\s+', Whitespace),
            (r'0x[a-fA-F0-9]+', Number.Hex),
            (r'0[0-7]+', Number.Oct),
            (r'\d+\.\d+', Number.Float),
            (r'\d+', Number.Integer),
            (r'\$[\w.:-]+', Name.Variable),
            (r'\$\{[\w.:-]+\}', Name.Variable),
            (r'[\w.,@:-]+', Text),
        ],
        'params': [
            (r';', Keyword, '#pop'),
            (r'\n', Text, '#pop'),
            (r'(else|elseif|then)\b', Keyword),
            include('basic'),
            include('data'),
        ],
        'params-in-brace': [
            (r'\}', Keyword, ('#pop', '#pop')),
            include('params')
        ],
        'params-in-paren': [
            (r'\)', Keyword, ('#pop', '#pop')),
            include('params')
        ],
        'params-in-bracket': [
            (r'\]', Keyword, ('#pop', '#pop')),
            include('params')
        ],
        'string': [
            (r'\[', String.Double, 'string-square'),
            (r'(?s)(\\\\|\\[0-7]+|\\.|[^"\\])', String.Double),
            (r'"', String.Double, '#pop')
        ],
        'string-square': [
            (r'\[', String.Double, 'string-square'),
            (r'(?s)(\\\\|\\[0-7]+|\\.|\\\n|[^\]\\])', String.Double),
            (r'\]', String.Double, '#pop')
        ],
        'brace': [
            (r'\}', Keyword, '#pop'),
            include('command-in-brace'),
            include('basic'),
            include('data'),
        ],
        'paren': [
            (r'\)', Keyword, '#pop'),
            include('command-in-paren'),
            include('basic'),
            include('data'),
        ],
        'bracket': [
            (r'\]', Keyword, '#pop'),
            include('command-in-bracket'),
            include('basic'),
            include('data'),
        ],
        'comment': [
            (r'.*[^\\]\n', Comment, '#pop'),
            (r'.*\\\n', Comment),
        ],
    }

    def analyse_text(text):
        return shebang_matches(text, r'(tcl)')
