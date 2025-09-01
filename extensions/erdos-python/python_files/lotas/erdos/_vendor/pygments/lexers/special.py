"""
    pygments.lexers.special
    ~~~~~~~~~~~~~~~~~~~~~~~

    Special lexers.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import ast

from erdos._vendor.pygments.lexer import Lexer, line_re
from erdos._vendor.pygments.token import Token, Error, Text, Generic
from erdos._vendor.pygments.util import get_choice_opt


__all__ = ['TextLexer', 'OutputLexer', 'RawTokenLexer']


class TextLexer(Lexer):
    """
    "Null" lexer, doesn't highlight anything.
    """
    name = 'Text only'
    aliases = ['text']
    filenames = ['*.txt']
    mimetypes = ['text/plain']
    url = ""
    version_added = ''

    priority = 0.01

    def get_tokens_unprocessed(self, text):
        yield 0, Text, text

    def analyse_text(text):
        return TextLexer.priority


class OutputLexer(Lexer):
    """
    Simple lexer that highlights everything as ``Token.Generic.Output``.
    """
    name = 'Text output'
    aliases = ['output']
    url = ""
    version_added = '2.10'
    _example = "output/output"

    def get_tokens_unprocessed(self, text):
        yield 0, Generic.Output, text


_ttype_cache = {}


class RawTokenLexer(Lexer):
    """
    Recreate a token stream formatted with the `RawTokenFormatter`.

    Additional options accepted:

    `compress`
        If set to ``"gz"`` or ``"bz2"``, decompress the token stream with
        the given compression algorithm before lexing (default: ``""``).
    """
    name = 'Raw token data'
    aliases = []
    filenames = []
    mimetypes = ['application/x-pygments-tokens']
    url = 'https://pygments.org/docs/formatters/#RawTokenFormatter'
    version_added = ''

    def __init__(self, **options):
        self.compress = get_choice_opt(options, 'compress',
                                       ['', 'none', 'gz', 'bz2'], '')
        Lexer.__init__(self, **options)

    def get_tokens(self, text):
        if self.compress:
            if isinstance(text, str):
                text = text.encode('latin1')
            try:
                if self.compress == 'gz':
                    import gzip
                    text = gzip.decompress(text)
                elif self.compress == 'bz2':
                    import bz2
                    text = bz2.decompress(text)
            except OSError:
                yield Error, text.decode('latin1')
        if isinstance(text, bytes):
            text = text.decode('latin1')

        # do not call Lexer.get_tokens() because stripping is not optional.
        text = text.strip('\n') + '\n'
        for i, t, v in self.get_tokens_unprocessed(text):
            yield t, v

    def get_tokens_unprocessed(self, text):
        length = 0
        for match in line_re.finditer(text):
            try:
                ttypestr, val = match.group().rstrip().split('\t', 1)
                ttype = _ttype_cache.get(ttypestr)
                if not ttype:
                    ttype = Token
                    ttypes = ttypestr.split('.')[1:]
                    for ttype_ in ttypes:
                        if not ttype_ or not ttype_[0].isupper():
                            raise ValueError('malformed token name')
                        ttype = getattr(ttype, ttype_)
                    _ttype_cache[ttypestr] = ttype
                val = ast.literal_eval(val)
                if not isinstance(val, str):
                    raise ValueError('expected str')
            except (SyntaxError, ValueError):
                val = match.group()
                ttype = Error
            yield length, ttype, val
            length += len(val)
