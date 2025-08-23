"""
    pygments.lexers.hdl
    ~~~~~~~~~~~~~~~~~~~

    Lexers for hardware descriptor languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, include, using, this, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['VerilogLexer', 'SystemVerilogLexer', 'VhdlLexer']


class VerilogLexer(RegexLexer):
    """
    For verilog source code with preprocessor directives.
    """
    name = 'verilog'
    aliases = ['verilog', 'v']
    filenames = ['*.v']
    mimetypes = ['text/x-verilog']
    url = 'https://en.wikipedia.org/wiki/Verilog'
    version_added = '1.4'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//.*?\n|/[*].*?[*]/)+'

    tokens = {
        'root': [
            (r'^\s*`define', Comment.Preproc, 'macro'),
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'/(\\\n)?/(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'[{}#@]', Punctuation),
            (r'L?"', String, 'string'),
            (r"L?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[lL]?', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'([0-9]+)|(\'h)[0-9a-fA-F]+', Number.Hex),
            (r'([0-9]+)|(\'b)[01]+', Number.Bin),
            (r'([0-9]+)|(\'d)[0-9]+', Number.Integer),
            (r'([0-9]+)|(\'o)[0-7]+', Number.Oct),
            (r'\'[01xz]', Number),
            (r'\d+[Ll]?', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'[()\[\],.;\']', Punctuation),
            (r'`[a-zA-Z_]\w*', Name.Constant),

            (r'^(\s*)(package)(\s+)', bygroups(Whitespace, Keyword.Namespace, Text)),
            (r'^(\s*)(import)(\s+)', bygroups(Whitespace, Keyword.Namespace, Text),
             'import'),

            (words((
                'always', 'always_comb', 'always_ff', 'always_latch', 'and',
                'assign', 'automatic', 'begin', 'break', 'buf', 'bufif0', 'bufif1',
                'case', 'casex', 'casez', 'cmos', 'const', 'continue', 'deassign',
                'default', 'defparam', 'disable', 'do', 'edge', 'else', 'end', 'endcase',
                'endfunction', 'endgenerate', 'endmodule', 'endpackage', 'endprimitive',
                'endspecify', 'endtable', 'endtask', 'enum', 'event', 'final', 'for',
                'force', 'forever', 'fork', 'function', 'generate', 'genvar', 'highz0',
                'highz1', 'if', 'initial', 'inout', 'input', 'integer', 'join', 'large',
                'localparam', 'macromodule', 'medium', 'module', 'nand', 'negedge',
                'nmos', 'nor', 'not', 'notif0', 'notif1', 'or', 'output', 'packed',
                'parameter', 'pmos', 'posedge', 'primitive', 'pull0', 'pull1',
                'pulldown', 'pullup', 'rcmos', 'ref', 'release', 'repeat', 'return',
                'rnmos', 'rpmos', 'rtran', 'rtranif0', 'rtranif1', 'scalared', 'signed',
                'small', 'specify', 'specparam', 'strength', 'string', 'strong0',
                'strong1', 'struct', 'table', 'task', 'tran', 'tranif0', 'tranif1',
                'type', 'typedef', 'unsigned', 'var', 'vectored', 'void', 'wait',
                'weak0', 'weak1', 'while', 'xnor', 'xor'), suffix=r'\b'),
             Keyword),

            (words((
                'accelerate', 'autoexpand_vectornets', 'celldefine', 'default_nettype',
                'else', 'elsif', 'endcelldefine', 'endif', 'endprotect', 'endprotected',
                'expand_vectornets', 'ifdef', 'ifndef', 'include', 'noaccelerate',
                'noexpand_vectornets', 'noremove_gatenames', 'noremove_netnames',
                'nounconnected_drive', 'protect', 'protected', 'remove_gatenames',
                'remove_netnames', 'resetall', 'timescale', 'unconnected_drive',
                'undef'), prefix=r'`', suffix=r'\b'),
             Comment.Preproc),

            (words((
                'bits', 'bitstoreal', 'bitstoshortreal', 'countdrivers', 'display', 'fclose',
                'fdisplay', 'finish', 'floor', 'fmonitor', 'fopen', 'fstrobe', 'fwrite',
                'getpattern', 'history', 'incsave', 'input', 'itor', 'key', 'list', 'log',
                'monitor', 'monitoroff', 'monitoron', 'nokey', 'nolog', 'printtimescale',
                'random', 'readmemb', 'readmemh', 'realtime', 'realtobits', 'reset',
                'reset_count', 'reset_value', 'restart', 'rtoi', 'save', 'scale', 'scope',
                'shortrealtobits', 'showscopes', 'showvariables', 'showvars', 'sreadmemb',
                'sreadmemh', 'stime', 'stop', 'strobe', 'time', 'timeformat', 'write'),
                prefix=r'\$', suffix=r'\b'),
             Name.Builtin),

            (words((
                'byte', 'shortint', 'int', 'longint', 'integer', 'time',
                'bit', 'logic', 'reg', 'supply0', 'supply1', 'tri', 'triand',
                'trior', 'tri0', 'tri1', 'trireg', 'uwire', 'wire', 'wand', 'wor'
                'shortreal', 'real', 'realtime'), suffix=r'\b'),
             Keyword.Type),
            (r'[a-zA-Z_]\w*:(?!:)', Name.Label),
            (r'\$?[a-zA-Z_]\w*', Name),
            (r'\\(\S+)', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'\\', String),  # stray backslash
        ],
        'macro': [
            (r'[^/\n]+', Comment.Preproc),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (r'//.*?\n', Comment.Single, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Whitespace, '#pop'),
        ],
        'import': [
            (r'[\w:]+\*?', Name.Namespace, '#pop')
        ]
    }

    def analyse_text(text):
        """Verilog code will use one of reg/wire/assign for sure, and that
        is not common elsewhere."""
        result = 0
        if 'reg' in text:
            result += 0.1
        if 'wire' in text:
            result += 0.1
        if 'assign' in text:
            result += 0.1

        return result


class SystemVerilogLexer(RegexLexer):
    """
    Extends verilog lexer to recognise all SystemVerilog keywords from IEEE
    1800-2009 standard.
    """
    name = 'systemverilog'
    aliases = ['systemverilog', 'sv']
    filenames = ['*.sv', '*.svh']
    mimetypes = ['text/x-systemverilog']
    url = 'https://en.wikipedia.org/wiki/SystemVerilog'
    version_added = '1.5'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//.*?\n|/[*].*?[*]/)+'

    tokens = {
        'root': [
            (r'^(\s*)(`define)', bygroups(Whitespace, Comment.Preproc), 'macro'),
            (r'^(\s*)(package)(\s+)', bygroups(Whitespace, Keyword.Namespace, Whitespace)),
            (r'^(\s*)(import)(\s+)', bygroups(Whitespace, Keyword.Namespace, Whitespace), 'import'),

            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'/(\\\n)?/(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'[{}#@]', Punctuation),
            (r'L?"', String, 'string'),
            (r"L?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),

            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[lL]?', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),

            (r'([1-9][_0-9]*)?\s*\'[sS]?[bB]\s*[xXzZ?01][_xXzZ?01]*',
             Number.Bin),
            (r'([1-9][_0-9]*)?\s*\'[sS]?[oO]\s*[xXzZ?0-7][_xXzZ?0-7]*',
             Number.Oct),
            (r'([1-9][_0-9]*)?\s*\'[sS]?[dD]\s*[xXzZ?0-9][_xXzZ?0-9]*',
             Number.Integer),
            (r'([1-9][_0-9]*)?\s*\'[sS]?[hH]\s*[xXzZ?0-9a-fA-F][_xXzZ?0-9a-fA-F]*',
             Number.Hex),

            (r'\'[01xXzZ]', Number),
            (r'[0-9][_0-9]*', Number.Integer),

            (r'[~!%^&*+=|?:<>/-]', Operator),
            (words(('inside', 'dist'), suffix=r'\b'), Operator.Word),

            (r'[()\[\],.;\'$]', Punctuation),
            (r'`[a-zA-Z_]\w*', Name.Constant),

            (words((
                'accept_on', 'alias', 'always', 'always_comb', 'always_ff',
                'always_latch', 'and', 'assert', 'assign', 'assume', 'automatic',
                'before', 'begin', 'bind', 'bins', 'binsof', 'break', 'buf',
                'bufif0', 'bufif1', 'case', 'casex', 'casez', 'cell',
                'checker', 'clocking', 'cmos', 'config',
                'constraint', 'context', 'continue', 'cover', 'covergroup',
                'coverpoint', 'cross', 'deassign', 'default', 'defparam', 'design',
                'disable', 'do', 'edge', 'else', 'end', 'endcase',
                'endchecker', 'endclocking', 'endconfig', 'endfunction',
                'endgenerate', 'endgroup', 'endinterface', 'endmodule', 'endpackage',
                'endprimitive', 'endprogram', 'endproperty', 'endsequence',
                'endspecify', 'endtable', 'endtask', 'enum', 'eventually',
                'expect', 'export', 'extern', 'final', 'first_match',
                'for', 'force', 'foreach', 'forever', 'fork', 'forkjoin', 'function',
                'generate', 'genvar', 'global', 'highz0', 'highz1', 'if', 'iff',
                'ifnone', 'ignore_bins', 'illegal_bins', 'implies', 'implements', 'import',
                'incdir', 'include', 'initial', 'inout', 'input',
                'instance', 'interconnect', 'interface', 'intersect', 'join',
                'join_any', 'join_none', 'large', 'let', 'liblist', 'library',
                'local', 'localparam', 'macromodule', 'matches',
                'medium', 'modport', 'module', 'nand', 'negedge', 'nettype', 'new', 'nexttime',
                'nmos', 'nor', 'noshowcancelled', 'not', 'notif0', 'notif1', 'null',
                'or', 'output', 'package', 'packed', 'parameter', 'pmos', 'posedge',
                'primitive', 'priority', 'program', 'property', 'protected', 'pull0',
                'pull1', 'pulldown', 'pullup', 'pulsestyle_ondetect',
                'pulsestyle_onevent', 'pure', 'rand', 'randc', 'randcase',
                'randsequence', 'rcmos', 'ref',
                'reject_on', 'release', 'repeat', 'restrict', 'return', 'rnmos',
                'rpmos', 'rtran', 'rtranif0', 'rtranif1', 's_always', 's_eventually',
                's_nexttime', 's_until', 's_until_with', 'scalared', 'sequence',
                'showcancelled', 'small', 'soft', 'solve',
                'specify', 'specparam', 'static', 'strong', 'strong0',
                'strong1', 'struct', 'super', 'sync_accept_on',
                'sync_reject_on', 'table', 'tagged', 'task', 'this', 'throughout',
                'timeprecision', 'timeunit', 'tran', 'tranif0', 'tranif1',
                'typedef', 'union', 'unique', 'unique0', 'until',
                'until_with', 'untyped', 'use', 'vectored',
                'virtual', 'wait', 'wait_order', 'weak', 'weak0',
                'weak1', 'while', 'wildcard', 'with', 'within',
                'xnor', 'xor'),
                suffix=r'\b'),
             Keyword),

            (r'(class)(\s+)([a-zA-Z_]\w*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Class)),
            (r'(extends)(\s+)([a-zA-Z_]\w*)',
             bygroups(Keyword.Declaration, Whitespace, Name.Class)),
            (r'(endclass\b)(?:(\s*)(:)(\s*)([a-zA-Z_]\w*))?',
             bygroups(Keyword.Declaration, Whitespace, Punctuation, Whitespace, Name.Class)),

            (words((
                # Variable types
                'bit', 'byte', 'chandle', 'const', 'event', 'int', 'integer',
                'logic', 'longint', 'real', 'realtime', 'reg', 'shortint',
                'shortreal', 'signed', 'string', 'time', 'type', 'unsigned',
                'var', 'void',
                # Net types
                'supply0', 'supply1', 'tri', 'triand', 'trior', 'trireg',
                'tri0', 'tri1', 'uwire', 'wand', 'wire', 'wor'),
                suffix=r'\b'),
             Keyword.Type),

            (words((
                '`__FILE__', '`__LINE__', '`begin_keywords', '`celldefine',
                '`default_nettype', '`define', '`else', '`elsif', '`end_keywords',
                '`endcelldefine', '`endif', '`ifdef', '`ifndef', '`include',
                '`line', '`nounconnected_drive', '`pragma', '`resetall',
                '`timescale', '`unconnected_drive', '`undef', '`undefineall'),
                suffix=r'\b'),
             Comment.Preproc),

            (words((
                # Simulation control tasks (20.2)
                '$exit', '$finish', '$stop',
                # Simulation time functions (20.3)
                '$realtime', '$stime', '$time',
                # Timescale tasks (20.4)
                '$printtimescale', '$timeformat',
                # Conversion functions
                '$bitstoreal', '$bitstoshortreal', '$cast', '$itor',
                '$realtobits', '$rtoi', '$shortrealtobits', '$signed',
                '$unsigned',
                # Data query functions (20.6)
                '$bits', '$isunbounded', '$typename',
                # Array query functions (20.7)
                '$dimensions', '$high', '$increment', '$left', '$low', '$right',
                '$size', '$unpacked_dimensions',
                # Math functions (20.8)
                '$acos', '$acosh', '$asin', '$asinh', '$atan', '$atan2',
                '$atanh', '$ceil', '$clog2', '$cos', '$cosh', '$exp', '$floor',
                '$hypot', '$ln', '$log10', '$pow', '$sin', '$sinh', '$sqrt',
                '$tan', '$tanh',
                # Bit vector system functions (20.9)
                '$countbits', '$countones', '$isunknown', '$onehot', '$onehot0',
                # Severity tasks (20.10)
                '$info', '$error', '$fatal', '$warning',
                # Assertion control tasks (20.12)
                '$assertcontrol', '$assertfailoff', '$assertfailon',
                '$assertkill', '$assertnonvacuouson', '$assertoff', '$asserton',
                '$assertpassoff', '$assertpasson', '$assertvacuousoff',
                # Sampled value system functions (20.13)
                '$changed', '$changed_gclk', '$changing_gclk', '$falling_gclk',
                '$fell', '$fell_gclk', '$future_gclk', '$past', '$past_gclk',
                '$rising_gclk', '$rose', '$rose_gclk', '$sampled', '$stable',
                '$stable_gclk', '$steady_gclk',
                # Coverage control functions (20.14)
                '$coverage_control', '$coverage_get', '$coverage_get_max',
                '$coverage_merge', '$coverage_save', '$get_coverage',
                '$load_coverage_db', '$set_coverage_db_name',
                # Probabilistic distribution functions (20.15)
                '$dist_chi_square', '$dist_erlang', '$dist_exponential',
                '$dist_normal', '$dist_poisson', '$dist_t', '$dist_uniform',
                '$random',
                # Stochastic analysis tasks and functions (20.16)
                '$q_add', '$q_exam', '$q_full', '$q_initialize', '$q_remove',
                # PLA modeling tasks (20.17)
                '$async$and$array', '$async$and$plane', '$async$nand$array',
                '$async$nand$plane', '$async$nor$array', '$async$nor$plane',
                '$async$or$array', '$async$or$plane', '$sync$and$array',
                '$sync$and$plane', '$sync$nand$array', '$sync$nand$plane',
                '$sync$nor$array', '$sync$nor$plane', '$sync$or$array',
                '$sync$or$plane',
                # Miscellaneous tasks and functions (20.18)
                '$system',
                # Display tasks (21.2)
                '$display', '$displayb', '$displayh', '$displayo', '$monitor',
                '$monitorb', '$monitorh', '$monitoro', '$monitoroff',
                '$monitoron', '$strobe', '$strobeb', '$strobeh', '$strobeo',
                '$write', '$writeb', '$writeh', '$writeo',
                # File I/O tasks and functions (21.3)
                '$fclose', '$fdisplay', '$fdisplayb', '$fdisplayh',
                '$fdisplayo', '$feof', '$ferror', '$fflush', '$fgetc', '$fgets',
                '$fmonitor', '$fmonitorb', '$fmonitorh', '$fmonitoro', '$fopen',
                '$fread', '$fscanf', '$fseek', '$fstrobe', '$fstrobeb',
                '$fstrobeh', '$fstrobeo', '$ftell', '$fwrite', '$fwriteb',
                '$fwriteh', '$fwriteo', '$rewind', '$sformat', '$sformatf',
                '$sscanf', '$swrite', '$swriteb', '$swriteh', '$swriteo',
                '$ungetc',
                # Memory load tasks (21.4)
                '$readmemb', '$readmemh',
                # Memory dump tasks (21.5)
                '$writememb', '$writememh',
                # Command line input (21.6)
                '$test$plusargs', '$value$plusargs',
                # VCD tasks (21.7)
                '$dumpall', '$dumpfile', '$dumpflush', '$dumplimit', '$dumpoff',
                '$dumpon', '$dumpports', '$dumpportsall', '$dumpportsflush',
                '$dumpportslimit', '$dumpportsoff', '$dumpportson', '$dumpvars',
                ), suffix=r'\b'),
             Name.Builtin),

            (r'[a-zA-Z_]\w*:(?!:)', Name.Label),
            (r'\$?[a-zA-Z_]\w*', Name),
            (r'\\(\S+)', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'\\', String),  # stray backslash
        ],
        'macro': [
            (r'[^/\n]+', Comment.Preproc),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (r'//.*?$', Comment.Single, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Whitespace, '#pop'),
        ],
        'import': [
            (r'[\w:]+\*?', Name.Namespace, '#pop')
        ]
    }


class VhdlLexer(RegexLexer):
    """
    For VHDL source code.
    """
    name = 'vhdl'
    aliases = ['vhdl']
    filenames = ['*.vhdl', '*.vhd']
    mimetypes = ['text/x-vhdl']
    url = 'https://en.wikipedia.org/wiki/VHDL'
    version_added = '1.5'
    flags = re.MULTILINE | re.IGNORECASE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(\\)(\n)', bygroups(String.Escape, Whitespace)),  # line continuation
            (r'--.*?$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r"'(U|X|0|1|Z|W|L|H|-)'", String.Char),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r"'[a-z_]\w*", Name.Attribute),
            (r'[()\[\],.;\']', Punctuation),
            (r'"[^\n\\"]*"', String),

            (r'(library)(\s+)([a-z_]\w*)',
             bygroups(Keyword, Whitespace, Name.Namespace)),
            (r'(use)(\s+)(entity)', bygroups(Keyword, Whitespace, Keyword)),
            (r'(use)(\s+)([a-z_][\w.]*\.)(all)',
             bygroups(Keyword, Whitespace, Name.Namespace, Keyword)),
            (r'(use)(\s+)([a-z_][\w.]*)',
             bygroups(Keyword, Whitespace, Name.Namespace)),
            (r'(std|ieee)(\.[a-z_]\w*)',
             bygroups(Name.Namespace, Name.Namespace)),
            (words(('std', 'ieee', 'work'), suffix=r'\b'),
             Name.Namespace),
            (r'(entity|component)(\s+)([a-z_]\w*)',
             bygroups(Keyword, Whitespace, Name.Class)),
            (r'(architecture|configuration)(\s+)([a-z_]\w*)(\s+)'
             r'(of)(\s+)([a-z_]\w*)(\s+)(is)',
             bygroups(Keyword, Whitespace, Name.Class, Whitespace, Keyword, Whitespace,
                      Name.Class, Whitespace, Keyword)),
            (r'([a-z_]\w*)(:)(\s+)(process|for)',
             bygroups(Name.Class, Operator, Whitespace, Keyword)),
            (r'(end)(\s+)', bygroups(using(this), Whitespace), 'endblock'),

            include('types'),
            include('keywords'),
            include('numbers'),

            (r'[a-z_]\w*', Name),
        ],
        'endblock': [
            include('keywords'),
            (r'[a-z_]\w*', Name.Class),
            (r'\s+', Whitespace),
            (r';', Punctuation, '#pop'),
        ],
        'types': [
            (words((
                'boolean', 'bit', 'character', 'severity_level', 'integer', 'time',
                'delay_length', 'natural', 'positive', 'string', 'bit_vector',
                'file_open_kind', 'file_open_status', 'std_ulogic', 'std_ulogic_vector',
                'std_logic', 'std_logic_vector', 'signed', 'unsigned'), suffix=r'\b'),
             Keyword.Type),
        ],
        'keywords': [
            (words((
                'abs', 'access', 'after', 'alias', 'all', 'and',
                'architecture', 'array', 'assert', 'attribute', 'begin', 'block',
                'body', 'buffer', 'bus', 'case', 'component', 'configuration',
                'constant', 'disconnect', 'downto', 'else', 'elsif', 'end',
                'entity', 'exit', 'file', 'for', 'function', 'generate',
                'generic', 'group', 'guarded', 'if', 'impure', 'in',
                'inertial', 'inout', 'is', 'label', 'library', 'linkage',
                'literal', 'loop', 'map', 'mod', 'nand', 'new',
                'next', 'nor', 'not', 'null', 'of', 'on',
                'open', 'or', 'others', 'out', 'package', 'port',
                'postponed', 'procedure', 'process', 'pure', 'range', 'record',
                'register', 'reject', 'rem', 'return', 'rol', 'ror', 'select',
                'severity', 'signal', 'shared', 'sla', 'sll', 'sra',
                'srl', 'subtype', 'then', 'to', 'transport', 'type',
                'units', 'until', 'use', 'variable', 'wait', 'when',
                'while', 'with', 'xnor', 'xor'), suffix=r'\b'),
             Keyword),
        ],
        'numbers': [
            (r'\d{1,2}#[0-9a-f_]+#?', Number.Integer),
            (r'\d+', Number.Integer),
            (r'(\d+\.\d*|\.\d+|\d+)E[+-]?\d+', Number.Float),
            (r'X"[0-9a-f_]+"', Number.Hex),
            (r'O"[0-7_]+"', Number.Oct),
            (r'B"[01_]+"', Number.Bin),
        ],
    }
