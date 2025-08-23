"""
    pygments.lexers.kuin
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the Kuin language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, using, this, bygroups, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
        Number, Punctuation, Whitespace

__all__ = ['KuinLexer']


class KuinLexer(RegexLexer):
    """
    For Kuin source code.
    """
    name = 'Kuin'
    url = 'https://github.com/kuina/Kuin'
    aliases = ['kuin']
    filenames = ['*.kn']
    version_added = '2.9'

    tokens = {
        'root': [
            include('statement'),
        ],
        'statement': [
            # Whitespace / Comment
            include('whitespace'),

            # Block-statement
            (r'(\+?)([ \t]*)(\*?)([ \t]*)(\bfunc)([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*)',
             bygroups(Keyword,Whitespace, Keyword, Whitespace,  Keyword,
                      using(this), Name.Function), 'func_'),
            (r'\b(class)([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*)',
             bygroups(Keyword, using(this), Name.Class), 'class_'),
            (r'\b(enum)([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*)',
             bygroups(Keyword, using(this), Name.Constant), 'enum_'),
            (r'\b(block)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'block_'),
            (r'\b(ifdef)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'ifdef_'),
            (r'\b(if)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'if_'),
            (r'\b(switch)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'switch_'),
            (r'\b(while)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'while_'),
            (r'\b(for)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'for_'),
            (r'\b(foreach)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'foreach_'),
            (r'\b(try)\b(?:([ \t]+(?:\n\s*\|)*[ \t]*)([a-zA-Z_][0-9a-zA-Z_]*))?',
             bygroups(Keyword, using(this), Name.Other), 'try_'),

            # Line-statement
            (r'\b(do)\b', Keyword, 'do'),
            (r'(\+?[ \t]*\bvar)\b', Keyword, 'var'),
            (r'\b(const)\b', Keyword, 'const'),
            (r'\b(ret)\b', Keyword, 'ret'),
            (r'\b(throw)\b', Keyword, 'throw'),
            (r'\b(alias)\b', Keyword, 'alias'),
            (r'\b(assert)\b', Keyword, 'assert'),
            (r'\|', Text, 'continued_line'),
            (r'[ \t]*\n', Whitespace),
        ],

        # Whitespace / Comment
        'whitespace': [
            (r'^([ \t]*)(;.*)', bygroups(Comment.Single, Whitespace)),
            (r'[ \t]+(?![; \t])', Whitespace),
            (r'\{', Comment.Multiline, 'multiline_comment'),
        ],
        'multiline_comment': [
            (r'\{', Comment.Multiline, 'multiline_comment'),
            (r'(?:\s*;.*|[^{}\n]+)', Comment.Multiline),
            (r'\n', Comment.Multiline),
            (r'\}', Comment.Multiline, '#pop'),
        ],

        # Block-statement
        'func_': [
            include('expr'),
            (r'\n', Whitespace, 'func'),
        ],
        'func': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(func)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
        ],
        'class_': [
            include('expr'),
            (r'\n', Whitespace, 'class'),
        ],
        'class': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(class)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
        ],
        'enum_': [
            include('expr'),
            (r'\n', Whitespace, 'enum'),
        ],
        'enum': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(enum)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('expr'),
            (r'\n', Whitespace),
        ],
        'block_': [
            include('expr'),
            (r'\n', Whitespace, 'block'),
        ],
        'block': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(block)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'ifdef_': [
            include('expr'),
            (r'\n', Whitespace, 'ifdef'),
        ],
        'ifdef': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(ifdef)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            (words(('rls', 'dbg'), prefix=r'\b', suffix=r'\b'),
             Keyword.Constant, 'ifdef_sp'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'ifdef_sp': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'if_': [
            include('expr'),
            (r'\n', Whitespace, 'if'),
        ],
        'if': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(if)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            (words(('elif', 'else'), prefix=r'\b', suffix=r'\b'), Keyword, 'if_sp'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'if_sp': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'switch_': [
            include('expr'),
            (r'\n', Whitespace, 'switch'),
        ],
        'switch': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(switch)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            (words(('case', 'default', 'to'), prefix=r'\b', suffix=r'\b'),
             Keyword, 'switch_sp'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'switch_sp': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'while_': [
            include('expr'),
            (r'\n', Whitespace, 'while'),
        ],
        'while': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(while)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'for_': [
            include('expr'),
            (r'\n', Whitespace, 'for'),
        ],
        'for': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(for)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'foreach_': [
            include('expr'),
            (r'\n', Whitespace, 'foreach'),
        ],
        'foreach': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(foreach)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'try_': [
            include('expr'),
            (r'\n', Whitespace, 'try'),
        ],
        'try': [
            (r'\b(end)([ \t]+(?:\n\s*\|)*[ \t]*)(try)\b',
             bygroups(Keyword, using(this), Keyword), '#pop:2'),
            (words(('catch', 'finally', 'to'), prefix=r'\b', suffix=r'\b'),
             Keyword, 'try_sp'),
            include('statement'),
            include('break'),
            include('skip'),
        ],
        'try_sp': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],

        # Line-statement
        'break': [
            (r'\b(break)\b([ \t]+)([a-zA-Z_][0-9a-zA-Z_]*)',
             bygroups(Keyword, using(this), Name.Other)),
        ],
        'skip': [
            (r'\b(skip)\b([ \t]+)([a-zA-Z_][0-9a-zA-Z_]*)',
             bygroups(Keyword, using(this), Name.Other)),
        ],
        'alias': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'assert': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'const': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'do': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'ret': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'throw': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'var': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],
        'continued_line': [
            include('expr'),
            (r'\n', Whitespace, '#pop'),
        ],

        'expr': [
            # Whitespace / Comment
            include('whitespace'),

            # Punctuation
            (r'\(', Punctuation,),
            (r'\)', Punctuation,),
            (r'\[', Punctuation,),
            (r'\]', Punctuation,),
            (r',', Punctuation),

            # Keyword
            (words((
                'true', 'false', 'null', 'inf'
                ), prefix=r'\b', suffix=r'\b'), Keyword.Constant),
            (words((
                'me'
                ), prefix=r'\b', suffix=r'\b'), Keyword),
            (words((
                'bit16', 'bit32', 'bit64', 'bit8', 'bool',
                'char', 'class', 'dict', 'enum', 'float', 'func',
                'int', 'list', 'queue', 'stack'
                ), prefix=r'\b', suffix=r'\b'), Keyword.Type),

            # Number
            (r'\b[0-9]\.[0-9]+(?!\.)(:?e[\+-][0-9]+)?\b', Number.Float),
            (r'\b2#[01]+(?:b(?:8|16|32|64))?\b', Number.Bin),
            (r'\b8#[0-7]+(?:b(?:8|16|32|64))?\b', Number.Oct),
            (r'\b16#[0-9A-F]+(?:b(?:8|16|32|64))?\b', Number.Hex),
            (r'\b[0-9]+(?:b(?:8|16|32|64))?\b', Number.Decimal),

            # String / Char
            (r'"', String.Double, 'string'),
            (r"'(?:\\.|.)+?'", String.Char),

            # Operator
            (r'(?:\.|\$(?:>|<)?)', Operator),
            (r'(?:\^)', Operator),
            (r'(?:\+|-|!|##?)', Operator),
            (r'(?:\*|/|%)', Operator),
            (r'(?:~)', Operator),
            (r'(?:(?:=|<>)(?:&|\$)?|<=?|>=?)', Operator),
            (r'(?:&)', Operator),
            (r'(?:\|)', Operator),
            (r'(?:\?)', Operator),
            (r'(?::(?::|\+|-|\*|/|%|\^|~)?)', Operator),

            # Identifier
            (r"\b([a-zA-Z_][0-9a-zA-Z_]*)(?=@)\b", Name),
            (r"(@)?\b([a-zA-Z_][0-9a-zA-Z_]*)\b",
             bygroups(Name.Other, Name.Variable)),
        ],

        # String
        'string': [
            (r'(?:\\[^{\n]|[^"\\])+', String.Double),
            (r'\\\{', String.Double, 'toStrInString'),
            (r'"', String.Double, '#pop'),
        ],
        'toStrInString': [
            include('expr'),
            (r'\}', String.Double, '#pop'),
        ],
    }
