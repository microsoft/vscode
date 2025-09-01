"""
    pygments.lexers.hexdump
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for hexadecimal dumps.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, include
from erdos._vendor.pygments.token import Name, Number, String, Punctuation, Whitespace

__all__ = ['HexdumpLexer']


class HexdumpLexer(RegexLexer):
    """
    For typical hex dump output formats by the UNIX and GNU/Linux tools ``hexdump``,
    ``hd``, ``hexcat``, ``od`` and ``xxd``, and the DOS tool ``DEBUG``. For example:

    .. sourcecode:: hexdump

        00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
        00000010  02 00 3e 00 01 00 00 00  c5 48 40 00 00 00 00 00  |..>......H@.....|

    The specific supported formats are the outputs of:

    * ``hexdump FILE``
    * ``hexdump -C FILE`` -- the `canonical` format used in the example.
    * ``hd FILE`` -- same as ``hexdump -C FILE``.
    * ``hexcat FILE``
    * ``od -t x1z FILE``
    * ``xxd FILE``
    * ``DEBUG.EXE FILE.COM`` and entering ``d`` to the prompt.
    """
    name = 'Hexdump'
    aliases = ['hexdump']
    url = 'https://en.wikipedia.org/wiki/Hex_dump'
    version_added = '2.1'

    hd = r'[0-9A-Ha-h]'

    tokens = {
        'root': [
            (r'\n', Whitespace),
            include('offset'),
            (r'('+hd+r'{2})(\-)('+hd+r'{2})',
             bygroups(Number.Hex, Punctuation, Number.Hex)),
            (hd+r'{2}', Number.Hex),
            (r'(\s{2,3})(\>)(.{16})(\<)$',
             bygroups(Whitespace, Punctuation, String, Punctuation), 'bracket-strings'),
            (r'(\s{2,3})(\|)(.{16})(\|)$',
             bygroups(Whitespace, Punctuation, String, Punctuation), 'piped-strings'),
            (r'(\s{2,3})(\>)(.{1,15})(\<)$',
             bygroups(Whitespace, Punctuation, String, Punctuation)),
            (r'(\s{2,3})(\|)(.{1,15})(\|)$',
             bygroups(Whitespace, Punctuation, String, Punctuation)),
            (r'(\s{2,3})(.{1,15})$', bygroups(Whitespace, String)),
            (r'(\s{2,3})(.{16}|.{20})$', bygroups(Whitespace, String), 'nonpiped-strings'),
            (r'\s', Whitespace),
            (r'^\*', Punctuation),
        ],
        'offset': [
            (r'^('+hd+'+)(:)', bygroups(Name.Label, Punctuation), 'offset-mode'),
            (r'^'+hd+'+', Name.Label),
        ],
        'offset-mode': [
            (r'\s', Whitespace, '#pop'),
            (hd+'+', Name.Label),
            (r':', Punctuation)
        ],
        'piped-strings': [
            (r'\n', Whitespace),
            include('offset'),
            (hd+r'{2}', Number.Hex),
            (r'(\s{2,3})(\|)(.{1,16})(\|)$',
             bygroups(Whitespace, Punctuation, String, Punctuation)),
            (r'\s', Whitespace),
            (r'^\*', Punctuation),
        ],
        'bracket-strings': [
            (r'\n', Whitespace),
            include('offset'),
            (hd+r'{2}', Number.Hex),
            (r'(\s{2,3})(\>)(.{1,16})(\<)$',
             bygroups(Whitespace, Punctuation, String, Punctuation)),
            (r'\s', Whitespace),
            (r'^\*', Punctuation),
        ],
        'nonpiped-strings': [
            (r'\n', Whitespace),
            include('offset'),
            (r'('+hd+r'{2})(\-)('+hd+r'{2})',
             bygroups(Number.Hex, Punctuation, Number.Hex)),
            (hd+r'{2}', Number.Hex),
            (r'(\s{19,})(.{1,20}?)$', bygroups(Whitespace, String)),
            (r'(\s{2,3})(.{1,20})$', bygroups(Whitespace, String)),
            (r'\s', Whitespace),
            (r'^\*', Punctuation),
        ],
    }
