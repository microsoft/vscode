"""
    pygments.lexers.r
    ~~~~~~~~~~~~~~~~~

    Lexers for the R/S languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import Lexer, RegexLexer, include, do_insertions
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace

__all__ = ['RConsoleLexer', 'SLexer', 'RdLexer']


line_re  = re.compile('.*?\n')


class RConsoleLexer(Lexer):
    """
    For R console transcripts or R CMD BATCH output files.
    """

    name = 'RConsole'
    aliases = ['rconsole', 'rout']
    filenames = ['*.Rout']
    url = 'https://www.r-project.org'
    version_added = ''
    _example = "rconsole/r-console-transcript.Rout"

    def get_tokens_unprocessed(self, text):
        slexer = SLexer(**self.options)

        current_code_block = ''
        insertions = []

        for match in line_re.finditer(text):
            line = match.group()
            if line.startswith('>') or line.startswith('+'):
                # Colorize the prompt as such,
                # then put rest of line into current_code_block
                insertions.append((len(current_code_block),
                                   [(0, Generic.Prompt, line[:2])]))
                current_code_block += line[2:]
            else:
                # We have reached a non-prompt line!
                # If we have stored prompt lines, need to process them first.
                if current_code_block:
                    # Weave together the prompts and highlight code.
                    yield from do_insertions(
                        insertions, slexer.get_tokens_unprocessed(current_code_block))
                    # Reset vars for next code block.
                    current_code_block = ''
                    insertions = []
                # Now process the actual line itself, this is output from R.
                yield match.start(), Generic.Output, line

        # If we happen to end on a code block with nothing after it, need to
        # process the last code block. This is neither elegant nor DRY so
        # should be changed.
        if current_code_block:
            yield from do_insertions(
                insertions, slexer.get_tokens_unprocessed(current_code_block))


class SLexer(RegexLexer):
    """
    For S, S-plus, and R source code.
    """

    name = 'S'
    aliases = ['splus', 's', 'r']
    filenames = ['*.S', '*.R', '.Rhistory', '.Rprofile', '.Renviron']
    mimetypes = ['text/S-plus', 'text/S', 'text/x-r-source', 'text/x-r',
                 'text/x-R', 'text/x-r-history', 'text/x-r-profile']
    url = 'https://www.r-project.org'
    version_added = '0.10'

    valid_name = r'`[^`\\]*(?:\\.[^`\\]*)*`|(?:[a-zA-Z]|\.[A-Za-z_.])[\w.]*|\.'
    tokens = {
        'comments': [
            (r'#.*$', Comment.Single),
        ],
        'valid_name': [
            (valid_name, Name),
        ],
        'function_name': [
            (rf'({valid_name})\s*(?=\()', Name.Function),
        ],
        'punctuation': [
            (r'\[{1,2}|\]{1,2}|\(|\)|;|,', Punctuation),
        ],
        'keywords': [
            (r'(if|else|for|while|repeat|in|next|break|return|switch|function)'
             r'(?![\w.])',
             Keyword.Reserved),
        ],
        'operators': [
            (r'<<?-|->>?|-|==|<=|>=|\|>|<|>|&&?|!=|\|\|?|\?', Operator),
            (r'\*|\+|\^|/|!|%[^%]*%|=|~|\$|@|:{1,3}', Operator),
        ],
        'builtin_symbols': [
            (r'(NULL|NA(_(integer|real|complex|character)_)?|'
             r'letters|LETTERS|Inf|TRUE|FALSE|NaN|pi|\.\.(\.|[0-9]+))'
             r'(?![\w.])',
             Keyword.Constant),
            (r'(T|F)\b', Name.Builtin.Pseudo),
        ],
        'numbers': [
            # hex number
            (r'0[xX][a-fA-F0-9]+([pP][0-9]+)?[Li]?', Number.Hex),
            # decimal number
            (r'[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+|\.)([eE][+-]?[0-9]+)?[Li]?',
             Number),
        ],
        'statements': [
            include('comments'),
            # whitespaces
            (r'\s+', Whitespace),
            (r'\'', String, 'string_squote'),
            (r'\"', String, 'string_dquote'),
            include('builtin_symbols'),
            include('keywords'),
            include('function_name'),
            include('valid_name'),
            include('numbers'),
            include('punctuation'),
            include('operators'),
        ],
        'root': [
            # calls:
            include('statements'),
            # blocks:
            (r'\{|\}', Punctuation),
            # (r'\{', Punctuation, 'block'),
            (r'.', Text),
        ],
        # 'block': [
        #    include('statements'),
        #    ('\{', Punctuation, '#push'),
        #    ('\}', Punctuation, '#pop')
        # ],
        'string_squote': [
            (r'([^\'\\]|\\.)*\'', String, '#pop'),
        ],
        'string_dquote': [
            (r'([^"\\]|\\.)*"', String, '#pop'),
        ],
    }

    def analyse_text(text):
        if re.search(r'[a-z0-9_\])\s]<-(?!-)', text):
            return 0.11


class RdLexer(RegexLexer):
    """
    Pygments Lexer for R documentation (Rd) files

    This is a very minimal implementation, highlighting little more
    than the macros. A description of Rd syntax is found in `Writing R
    Extensions <http://cran.r-project.org/doc/manuals/R-exts.html>`_
    and `Parsing Rd files <http://developer.r-project.org/parseRd.pdf>`_.
    """
    name = 'Rd'
    aliases = ['rd']
    filenames = ['*.Rd']
    mimetypes = ['text/x-r-doc']
    url = 'http://cran.r-project.org/doc/manuals/R-exts.html'
    version_added = '1.6'

    # To account for verbatim / LaTeX-like / and R-like areas
    # would require parsing.
    tokens = {
        'root': [
            # catch escaped brackets and percent sign
            (r'\\[\\{}%]', String.Escape),
            # comments
            (r'%.*$', Comment),
            # special macros with no arguments
            (r'\\(?:cr|l?dots|R|tab)\b', Keyword.Constant),
            # macros
            (r'\\[a-zA-Z]+\b', Keyword),
            # special preprocessor macros
            (r'^\s*#(?:ifn?def|endif).*\b', Comment.Preproc),
            # non-escaped brackets
            (r'[{}]', Name.Builtin),
            # everything else
            (r'[^\\%\n{}]+', Text),
            (r'.', Text),
        ]
    }
