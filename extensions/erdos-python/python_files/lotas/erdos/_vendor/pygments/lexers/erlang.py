"""
    pygments.lexers.erlang
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Erlang.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import Lexer, RegexLexer, bygroups, words, do_insertions, \
    include, default, line_re
from lotas.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace

__all__ = ['ErlangLexer', 'ErlangShellLexer', 'ElixirConsoleLexer',
           'ElixirLexer']


class ErlangLexer(RegexLexer):
    """
    For the Erlang functional programming language.
    """

    name = 'Erlang'
    url = 'https://www.erlang.org/'
    aliases = ['erlang']
    filenames = ['*.erl', '*.hrl', '*.es', '*.escript']
    mimetypes = ['text/x-erlang']
    version_added = '0.9'

    keywords = (
        'after', 'begin', 'case', 'catch', 'cond', 'end', 'fun', 'if',
        'let', 'of', 'query', 'receive', 'try', 'when',
    )

    builtins = (  # See erlang(3) man page
        'abs', 'append_element', 'apply', 'atom_to_list', 'binary_to_list',
        'bitstring_to_list', 'binary_to_term', 'bit_size', 'bump_reductions',
        'byte_size', 'cancel_timer', 'check_process_code', 'delete_module',
        'demonitor', 'disconnect_node', 'display', 'element', 'erase', 'exit',
        'float', 'float_to_list', 'fun_info', 'fun_to_list',
        'function_exported', 'garbage_collect', 'get', 'get_keys',
        'group_leader', 'hash', 'hd', 'integer_to_list', 'iolist_to_binary',
        'iolist_size', 'is_atom', 'is_binary', 'is_bitstring', 'is_boolean',
        'is_builtin', 'is_float', 'is_function', 'is_integer', 'is_list',
        'is_number', 'is_pid', 'is_port', 'is_process_alive', 'is_record',
        'is_reference', 'is_tuple', 'length', 'link', 'list_to_atom',
        'list_to_binary', 'list_to_bitstring', 'list_to_existing_atom',
        'list_to_float', 'list_to_integer', 'list_to_pid', 'list_to_tuple',
        'load_module', 'localtime_to_universaltime', 'make_tuple', 'md5',
        'md5_final', 'md5_update', 'memory', 'module_loaded', 'monitor',
        'monitor_node', 'node', 'nodes', 'open_port', 'phash', 'phash2',
        'pid_to_list', 'port_close', 'port_command', 'port_connect',
        'port_control', 'port_call', 'port_info', 'port_to_list',
        'process_display', 'process_flag', 'process_info', 'purge_module',
        'put', 'read_timer', 'ref_to_list', 'register', 'resume_process',
        'round', 'send', 'send_after', 'send_nosuspend', 'set_cookie',
        'setelement', 'size', 'spawn', 'spawn_link', 'spawn_monitor',
        'spawn_opt', 'split_binary', 'start_timer', 'statistics',
        'suspend_process', 'system_flag', 'system_info', 'system_monitor',
        'system_profile', 'term_to_binary', 'tl', 'trace', 'trace_delivered',
        'trace_info', 'trace_pattern', 'trunc', 'tuple_size', 'tuple_to_list',
        'universaltime_to_localtime', 'unlink', 'unregister', 'whereis'
    )

    operators = r'(\+\+?|--?|\*|/|<|>|/=|=:=|=/=|=<|>=|==?|<-|!|\?)'
    word_operators = (
        'and', 'andalso', 'band', 'bnot', 'bor', 'bsl', 'bsr', 'bxor',
        'div', 'not', 'or', 'orelse', 'rem', 'xor'
    )

    atom_re = r"(?:[a-z]\w*|'[^\n']*[^\\]')"

    variable_re = r'(?:[A-Z_]\w*)'

    esc_char_re = r'[bdefnrstv\'"\\]'
    esc_octal_re = r'[0-7][0-7]?[0-7]?'
    esc_hex_re = r'(?:x[0-9a-fA-F]{2}|x\{[0-9a-fA-F]+\})'
    esc_ctrl_re = r'\^[a-zA-Z]'
    escape_re = r'(?:\\(?:'+esc_char_re+r'|'+esc_octal_re+r'|'+esc_hex_re+r'|'+esc_ctrl_re+r'))'

    macro_re = r'(?:'+variable_re+r'|'+atom_re+r')'

    base_re = r'(?:[2-9]|[12][0-9]|3[0-6])'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'(%.*)(\n)', bygroups(Comment, Whitespace)),
            (words(keywords, suffix=r'\b'), Keyword),
            (words(builtins, suffix=r'\b'), Name.Builtin),
            (words(word_operators, suffix=r'\b'), Operator.Word),
            (r'^-', Punctuation, 'directive'),
            (operators, Operator),
            (r'"', String, 'string'),
            (r'<<', Name.Label),
            (r'>>', Name.Label),
            ('(' + atom_re + ')(:)', bygroups(Name.Namespace, Punctuation)),
            ('(?:^|(?<=:))(' + atom_re + r')(\s*)(\()',
             bygroups(Name.Function, Whitespace, Punctuation)),
            (r'[+-]?' + base_re + r'#[0-9a-zA-Z]+', Number.Integer),
            (r'[+-]?\d+', Number.Integer),
            (r'[+-]?\d+.\d+', Number.Float),
            (r'[]\[:_@\".{}()|;,]', Punctuation),
            (variable_re, Name.Variable),
            (atom_re, Name),
            (r'\?'+macro_re, Name.Constant),
            (r'\$(?:'+escape_re+r'|\\[ %]|[^\\])', String.Char),
            (r'#'+atom_re+r'(:?\.'+atom_re+r')?', Name.Label),

            # Erlang script shebang
            (r'\A#!.+\n', Comment.Hashbang),

            # EEP 43: Maps
            # http://www.erlang.org/eeps/eep-0043.html
            (r'#\{', Punctuation, 'map_key'),
        ],
        'string': [
            (escape_re, String.Escape),
            (r'"', String, '#pop'),
            (r'~[0-9.*]*[~#+BPWXb-ginpswx]', String.Interpol),
            (r'[^"\\~]+', String),
            (r'~', String),
        ],
        'directive': [
            (r'(define)(\s*)(\()('+macro_re+r')',
             bygroups(Name.Entity, Whitespace, Punctuation, Name.Constant), '#pop'),
            (r'(record)(\s*)(\()('+macro_re+r')',
             bygroups(Name.Entity, Whitespace, Punctuation, Name.Label), '#pop'),
            (atom_re, Name.Entity, '#pop'),
        ],
        'map_key': [
            include('root'),
            (r'=>', Punctuation, 'map_val'),
            (r':=', Punctuation, 'map_val'),
            (r'\}', Punctuation, '#pop'),
        ],
        'map_val': [
            include('root'),
            (r',', Punctuation, '#pop'),
            (r'(?=\})', Punctuation, '#pop'),
        ],
    }


class ErlangShellLexer(Lexer):
    """
    Shell sessions in erl (for Erlang code).
    """
    name = 'Erlang erl session'
    aliases = ['erl']
    filenames = ['*.erl-sh']
    mimetypes = ['text/x-erl-shellsession']
    url = 'https://www.erlang.org/'
    version_added = '1.1'

    _prompt_re = re.compile(r'(?:\([\w@_.]+\))?\d+>(?=\s|\Z)')

    def get_tokens_unprocessed(self, text):
        erlexer = ErlangLexer(**self.options)

        curcode = ''
        insertions = []
        for match in line_re.finditer(text):
            line = match.group()
            m = self._prompt_re.match(line)
            if m is not None:
                end = m.end()
                insertions.append((len(curcode),
                                   [(0, Generic.Prompt, line[:end])]))
                curcode += line[end:]
            else:
                if curcode:
                    yield from do_insertions(insertions,
                                             erlexer.get_tokens_unprocessed(curcode))
                    curcode = ''
                    insertions = []
                if line.startswith('*'):
                    yield match.start(), Generic.Traceback, line
                else:
                    yield match.start(), Generic.Output, line
        if curcode:
            yield from do_insertions(insertions,
                                     erlexer.get_tokens_unprocessed(curcode))


def gen_elixir_string_rules(name, symbol, token):
    states = {}
    states['string_' + name] = [
        (rf'[^#{symbol}\\]+', token),
        include('escapes'),
        (r'\\.', token),
        (rf'({symbol})', bygroups(token), "#pop"),
        include('interpol')
    ]
    return states


def gen_elixir_sigstr_rules(term, term_class, token, interpol=True):
    if interpol:
        return [
            (rf'[^#{term_class}\\]+', token),
            include('escapes'),
            (r'\\.', token),
            (rf'{term}[a-zA-Z]*', token, '#pop'),
            include('interpol')
        ]
    else:
        return [
            (rf'[^{term_class}\\]+', token),
            (r'\\.', token),
            (rf'{term}[a-zA-Z]*', token, '#pop'),
        ]


class ElixirLexer(RegexLexer):
    """
    For the Elixir language.
    """

    name = 'Elixir'
    url = 'https://elixir-lang.org'
    aliases = ['elixir', 'ex', 'exs']
    filenames = ['*.ex', '*.eex', '*.exs', '*.leex']
    mimetypes = ['text/x-elixir']
    version_added = '1.5'

    KEYWORD = ('fn', 'do', 'end', 'after', 'else', 'rescue', 'catch')
    KEYWORD_OPERATOR = ('not', 'and', 'or', 'when', 'in')
    BUILTIN = (
        'case', 'cond', 'for', 'if', 'unless', 'try', 'receive', 'raise',
        'quote', 'unquote', 'unquote_splicing', 'throw', 'super',
    )
    BUILTIN_DECLARATION = (
        'def', 'defp', 'defmodule', 'defprotocol', 'defmacro', 'defmacrop',
        'defdelegate', 'defexception', 'defstruct', 'defimpl', 'defcallback',
    )

    BUILTIN_NAMESPACE = ('import', 'require', 'use', 'alias')
    CONSTANT = ('nil', 'true', 'false')

    PSEUDO_VAR = ('_', '__MODULE__', '__DIR__', '__ENV__', '__CALLER__')

    OPERATORS3 = (
        '<<<', '>>>', '|||', '&&&', '^^^', '~~~', '===', '!==',
        '~>>', '<~>', '|~>', '<|>',
    )
    OPERATORS2 = (
        '==', '!=', '<=', '>=', '&&', '||', '<>', '++', '--', '|>', '=~',
        '->', '<-', '|', '.', '=', '~>', '<~',
    )
    OPERATORS1 = ('<', '>', '+', '-', '*', '/', '!', '^', '&')

    PUNCTUATION = (
        '\\\\', '<<', '>>', '=>', '(', ')', ':', ';', ',', '[', ']',
    )

    def get_tokens_unprocessed(self, text):
        for index, token, value in RegexLexer.get_tokens_unprocessed(self, text):
            if token is Name:
                if value in self.KEYWORD:
                    yield index, Keyword, value
                elif value in self.KEYWORD_OPERATOR:
                    yield index, Operator.Word, value
                elif value in self.BUILTIN:
                    yield index, Keyword, value
                elif value in self.BUILTIN_DECLARATION:
                    yield index, Keyword.Declaration, value
                elif value in self.BUILTIN_NAMESPACE:
                    yield index, Keyword.Namespace, value
                elif value in self.CONSTANT:
                    yield index, Name.Constant, value
                elif value in self.PSEUDO_VAR:
                    yield index, Name.Builtin.Pseudo, value
                else:
                    yield index, token, value
            else:
                yield index, token, value

    def gen_elixir_sigil_rules():
        # all valid sigil terminators (excluding heredocs)
        terminators = [
            (r'\{', r'\}', '}',   'cb'),
            (r'\[', r'\]', r'\]', 'sb'),
            (r'\(', r'\)', ')',   'pa'),
            ('<',   '>',   '>',   'ab'),
            ('/',   '/',   '/',   'slas'),
            (r'\|', r'\|', '|',   'pipe'),
            ('"',   '"',   '"',   'quot'),
            ("'",   "'",   "'",   'apos'),
        ]

        # heredocs have slightly different rules
        triquotes = [(r'"""', 'triquot'), (r"'''", 'triapos')]

        token = String.Other
        states = {'sigils': []}

        for term, name in triquotes:
            states['sigils'] += [
                (rf'(~[a-z])({term})', bygroups(token, String.Heredoc),
                    (name + '-end', name + '-intp')),
                (rf'(~[A-Z])({term})', bygroups(token, String.Heredoc),
                    (name + '-end', name + '-no-intp')),
            ]

            states[name + '-end'] = [
                (r'[a-zA-Z]+', token, '#pop'),
                default('#pop'),
            ]
            states[name + '-intp'] = [
                (r'^(\s*)(' + term + ')', bygroups(Whitespace, String.Heredoc), '#pop'),
                include('heredoc_interpol'),
            ]
            states[name + '-no-intp'] = [
                (r'^(\s*)(' + term +')', bygroups(Whitespace, String.Heredoc), '#pop'),
                include('heredoc_no_interpol'),
            ]

        for lterm, rterm, rterm_class, name in terminators:
            states['sigils'] += [
                (r'~[a-z]' + lterm, token, name + '-intp'),
                (r'~[A-Z]' + lterm, token, name + '-no-intp'),
            ]
            states[name + '-intp'] = \
                gen_elixir_sigstr_rules(rterm, rterm_class, token)
            states[name + '-no-intp'] = \
                gen_elixir_sigstr_rules(rterm, rterm_class, token, interpol=False)

        return states

    op3_re = "|".join(re.escape(s) for s in OPERATORS3)
    op2_re = "|".join(re.escape(s) for s in OPERATORS2)
    op1_re = "|".join(re.escape(s) for s in OPERATORS1)
    ops_re = rf'(?:{op3_re}|{op2_re}|{op1_re})'
    punctuation_re = "|".join(re.escape(s) for s in PUNCTUATION)
    alnum = r'\w'
    name_re = rf'(?:\.\.\.|[a-z_]{alnum}*[!?]?)'
    modname_re = rf'[A-Z]{alnum}*(?:\.[A-Z]{alnum}*)*'
    complex_name_re = rf'(?:{name_re}|{modname_re}|{ops_re})'
    special_atom_re = r'(?:\.\.\.|<<>>|%\{\}|%|\{\})'

    long_hex_char_re = r'(\\x\{)([\da-fA-F]+)(\})'
    hex_char_re = r'(\\x[\da-fA-F]{1,2})'
    escape_char_re = r'(\\[abdefnrstv])'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#.*$', Comment.Single),

            # Various kinds of characters
            (r'(\?)' + long_hex_char_re,
                bygroups(String.Char,
                         String.Escape, Number.Hex, String.Escape)),
            (r'(\?)' + hex_char_re,
                bygroups(String.Char, String.Escape)),
            (r'(\?)' + escape_char_re,
                bygroups(String.Char, String.Escape)),
            (r'\?\\?.', String.Char),

            # '::' has to go before atoms
            (r':::', String.Symbol),
            (r'::', Operator),

            # atoms
            (r':' + special_atom_re, String.Symbol),
            (r':' + complex_name_re, String.Symbol),
            (r':"', String.Symbol, 'string_double_atom'),
            (r":'", String.Symbol, 'string_single_atom'),

            # [keywords: ...]
            (rf'({special_atom_re}|{complex_name_re})(:)(?=\s|\n)',
                bygroups(String.Symbol, Punctuation)),

            # @attributes
            (r'@' + name_re, Name.Attribute),

            # identifiers
            (name_re, Name),
            (rf'(%?)({modname_re})', bygroups(Punctuation, Name.Class)),

            # operators and punctuation
            (op3_re, Operator),
            (op2_re, Operator),
            (punctuation_re, Punctuation),
            (r'&\d', Name.Entity),   # anon func arguments
            (op1_re, Operator),

            # numbers
            (r'0b[01]+', Number.Bin),
            (r'0o[0-7]+', Number.Oct),
            (r'0x[\da-fA-F]+', Number.Hex),
            (r'\d(_?\d)*\.\d(_?\d)*([eE][-+]?\d(_?\d)*)?', Number.Float),
            (r'\d(_?\d)*', Number.Integer),

            # strings and heredocs
            (r'(""")(\s*)', bygroups(String.Heredoc, Whitespace),
                'heredoc_double'),
            (r"(''')(\s*)$", bygroups(String.Heredoc, Whitespace),
                'heredoc_single'),
            (r'"', String.Double, 'string_double'),
            (r"'", String.Single, 'string_single'),

            include('sigils'),

            (r'%\{', Punctuation, 'map_key'),
            (r'\{', Punctuation, 'tuple'),
        ],
        'heredoc_double': [
            (r'^(\s*)(""")', bygroups(Whitespace, String.Heredoc), '#pop'),
            include('heredoc_interpol'),
        ],
        'heredoc_single': [
            (r"^\s*'''", String.Heredoc, '#pop'),
            include('heredoc_interpol'),
        ],
        'heredoc_interpol': [
            (r'[^#\\\n]+', String.Heredoc),
            include('escapes'),
            (r'\\.', String.Heredoc),
            (r'\n+', String.Heredoc),
            include('interpol'),
        ],
        'heredoc_no_interpol': [
            (r'[^\\\n]+', String.Heredoc),
            (r'\\.', String.Heredoc),
            (r'\n+', Whitespace),
        ],
        'escapes': [
            (long_hex_char_re,
                bygroups(String.Escape, Number.Hex, String.Escape)),
            (hex_char_re, String.Escape),
            (escape_char_re, String.Escape),
        ],
        'interpol': [
            (r'#\{', String.Interpol, 'interpol_string'),
        ],
        'interpol_string': [
            (r'\}', String.Interpol, "#pop"),
            include('root')
        ],
        'map_key': [
            include('root'),
            (r':', Punctuation, 'map_val'),
            (r'=>', Punctuation, 'map_val'),
            (r'\}', Punctuation, '#pop'),
        ],
        'map_val': [
            include('root'),
            (r',', Punctuation, '#pop'),
            (r'(?=\})', Punctuation, '#pop'),
        ],
        'tuple': [
            include('root'),
            (r'\}', Punctuation, '#pop'),
        ],
    }
    tokens.update(gen_elixir_string_rules('double', '"', String.Double))
    tokens.update(gen_elixir_string_rules('single', "'", String.Single))
    tokens.update(gen_elixir_string_rules('double_atom', '"', String.Symbol))
    tokens.update(gen_elixir_string_rules('single_atom', "'", String.Symbol))
    tokens.update(gen_elixir_sigil_rules())


class ElixirConsoleLexer(Lexer):
    """
    For Elixir interactive console (iex) output like:

    .. sourcecode:: iex

        iex> [head | tail] = [1,2,3]
        [1,2,3]
        iex> head
        1
        iex> tail
        [2,3]
        iex> [head | tail]
        [1,2,3]
        iex> length [head | tail]
        3
    """

    name = 'Elixir iex session'
    aliases = ['iex']
    mimetypes = ['text/x-elixir-shellsession']
    url = 'https://elixir-lang.org'
    version_added = '1.5'

    _prompt_re = re.compile(r'(iex|\.{3})((?:\([\w@_.]+\))?\d+|\(\d+\))?> ')

    def get_tokens_unprocessed(self, text):
        exlexer = ElixirLexer(**self.options)

        curcode = ''
        in_error = False
        insertions = []
        for match in line_re.finditer(text):
            line = match.group()
            if line.startswith('** '):
                in_error = True
                insertions.append((len(curcode),
                                   [(0, Generic.Error, line[:-1])]))
                curcode += line[-1:]
            else:
                m = self._prompt_re.match(line)
                if m is not None:
                    in_error = False
                    end = m.end()
                    insertions.append((len(curcode),
                                       [(0, Generic.Prompt, line[:end])]))
                    curcode += line[end:]
                else:
                    if curcode:
                        yield from do_insertions(
                            insertions, exlexer.get_tokens_unprocessed(curcode))
                        curcode = ''
                        insertions = []
                    token = Generic.Error if in_error else Generic.Output
                    yield match.start(), token, line
        if curcode:
            yield from do_insertions(
                insertions, exlexer.get_tokens_unprocessed(curcode))
