"""
    pygments.lexers.stata
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Stata

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re
from erdos._vendor.pygments.lexer import RegexLexer, default, include, words
from erdos._vendor.pygments.token import Comment, Keyword, Name, Number, \
    String, Text, Operator

from erdos._vendor.pygments.lexers._stata_builtins import builtins_base, builtins_functions

__all__ = ['StataLexer']


class StataLexer(RegexLexer):
    """
    For Stata do files.
    """
    # Syntax based on
    # - http://fmwww.bc.edu/RePEc/bocode/s/synlightlist.ado
    # - https://github.com/isagalaev/highlight.js/blob/master/src/languages/stata.js
    # - https://github.com/jpitblado/vim-stata/blob/master/syntax/stata.vim

    name = 'Stata'
    url = 'http://www.stata.com/'
    version_added = '2.2'
    aliases   = ['stata', 'do']
    filenames = ['*.do', '*.ado']
    mimetypes = ['text/x-stata', 'text/stata', 'application/x-stata']
    flags     = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            include('comments'),
            include('strings'),
            include('macros'),
            include('numbers'),
            include('keywords'),
            include('operators'),
            include('format'),
            (r'.', Text),
        ],
        # Comments are a complicated beast in Stata because they can be
        # nested and there are a few corner cases with that. See:
        # - github.com/kylebarron/language-stata/issues/90
        # - statalist.org/forums/forum/general-stata-discussion/general/1448244
        'comments': [
            (r'(^//|(?<=\s)//)(?!/)', Comment.Single, 'comments-double-slash'),
            (r'^\s*\*', Comment.Single, 'comments-star'),
            (r'/\*', Comment.Multiline, 'comments-block'),
            (r'(^///|(?<=\s)///)', Comment.Special, 'comments-triple-slash')
        ],
        'comments-block': [
            (r'/\*', Comment.Multiline, '#push'),
            # this ends and restarts a comment block. but need to catch this so
            # that it doesn\'t start _another_ level of comment blocks
            (r'\*/\*', Comment.Multiline),
            (r'(\*/\s+\*(?!/)[^\n]*)|(\*/)', Comment.Multiline, '#pop'),
            # Match anything else as a character inside the comment
            (r'.', Comment.Multiline),
        ],
        'comments-star': [
            (r'///.*?\n', Comment.Single,
                ('#pop', 'comments-triple-slash')),
            (r'(^//|(?<=\s)//)(?!/)', Comment.Single,
                ('#pop', 'comments-double-slash')),
            (r'/\*', Comment.Multiline, 'comments-block'),
            (r'.(?=\n)', Comment.Single, '#pop'),
            (r'.', Comment.Single),
        ],
        'comments-triple-slash': [
            (r'\n', Comment.Special, '#pop'),
            # A // breaks out of a comment for the rest of the line
            (r'//.*?(?=\n)', Comment.Single, '#pop'),
            (r'.', Comment.Special),
        ],
        'comments-double-slash': [
            (r'\n', Text, '#pop'),
            (r'.', Comment.Single),
        ],
        # `"compound string"' and regular "string"; note the former are
        # nested.
        'strings': [
            (r'`"', String, 'string-compound'),
            (r'(?<!`)"', String, 'string-regular'),
        ],
        'string-compound': [
            (r'`"', String, '#push'),
            (r'"\'', String, '#pop'),
            (r'\\\\|\\"|\\\$|\\`|\\\n', String.Escape),
            include('macros'),
            (r'.', String)
        ],
        'string-regular': [
            (r'(")(?!\')|(?=\n)', String, '#pop'),
            (r'\\\\|\\"|\\\$|\\`|\\\n', String.Escape),
            include('macros'),
            (r'.', String)
        ],
        # A local is usually
        #     `\w{0,31}'
        #     `:extended macro'
        #     `=expression'
        #     `[rsen](results)'
        #     `(++--)scalar(++--)'
        #
        # However, there are all sorts of weird rules wrt edge
        # cases. Instead of writing 27 exceptions, anything inside
        # `' is a local.
        #
        # A global is more restricted, so we do follow rules. Note only
        # locals explicitly enclosed ${} can be nested.
        'macros': [
            (r'\$(\{|(?=[$`]))', Name.Variable.Global, 'macro-global-nested'),
            (r'\$', Name.Variable.Global,  'macro-global-name'),
            (r'`', Name.Variable, 'macro-local'),
        ],
        'macro-local': [
            (r'`', Name.Variable, '#push'),
            (r"'", Name.Variable, '#pop'),
            (r'\$(\{|(?=[$`]))', Name.Variable.Global, 'macro-global-nested'),
            (r'\$', Name.Variable.Global, 'macro-global-name'),
            (r'.', Name.Variable),  # fallback
        ],
        'macro-global-nested': [
            (r'\$(\{|(?=[$`]))', Name.Variable.Global, '#push'),
            (r'\}', Name.Variable.Global, '#pop'),
            (r'\$', Name.Variable.Global, 'macro-global-name'),
            (r'`', Name.Variable, 'macro-local'),
            (r'\w', Name.Variable.Global),  # fallback
            default('#pop'),
        ],
        'macro-global-name': [
            (r'\$(\{|(?=[$`]))', Name.Variable.Global, 'macro-global-nested', '#pop'),
            (r'\$', Name.Variable.Global, 'macro-global-name', '#pop'),
            (r'`', Name.Variable, 'macro-local', '#pop'),
            (r'\w{1,32}', Name.Variable.Global, '#pop'),
        ],
        # Built in functions and statements
        'keywords': [
            (words(builtins_functions, prefix = r'\b', suffix = r'(?=\()'),
             Name.Function),
            (words(builtins_base, prefix = r'(^\s*|\s)', suffix = r'\b'),
             Keyword),
        ],
        # http://www.stata.com/help.cgi?operators
        'operators': [
            (r'-|==|<=|>=|<|>|&|!=', Operator),
            (r'\*|\+|\^|/|!|~|==|~=', Operator)
        ],
        # Stata numbers
        'numbers': [
            # decimal number
            (r'\b[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+|\.)([eE][+-]?[0-9]+)?[i]?\b',
             Number),
        ],
        # Stata formats
        'format': [
            (r'%-?\d{1,2}(\.\d{1,2})?[gfe]c?', Name.Other),
            (r'%(21x|16H|16L|8H|8L)', Name.Other),
            (r'%-?(tc|tC|td|tw|tm|tq|th|ty|tg)\S{0,32}', Name.Other),
            (r'%[-~]?\d{1,4}s', Name.Other),
        ]
    }
