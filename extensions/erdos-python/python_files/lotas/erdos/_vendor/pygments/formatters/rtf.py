"""
    pygments.formatters.rtf
    ~~~~~~~~~~~~~~~~~~~~~~~

    A formatter that generates RTF files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from collections import OrderedDict
from erdos._vendor.pygments.formatter import Formatter
from erdos._vendor.pygments.style import _ansimap
from erdos._vendor.pygments.util import get_bool_opt, get_int_opt, get_list_opt, surrogatepair


__all__ = ['RtfFormatter']


class RtfFormatter(Formatter):
    """
    Format tokens as RTF markup. This formatter automatically outputs full RTF
    documents with color information and other useful stuff. Perfect for Copy and
    Paste into Microsoft(R) Word(R) documents.

    Please note that ``encoding`` and ``outencoding`` options are ignored.
    The RTF format is ASCII natively, but handles unicode characters correctly
    thanks to escape sequences.

    .. versionadded:: 0.6

    Additional options accepted:

    `style`
        The style to use, can be a string or a Style subclass (default:
        ``'default'``).

    `fontface`
        The used font family, for example ``Bitstream Vera Sans``. Defaults to
        some generic font which is supposed to have fixed width.

    `fontsize`
        Size of the font used. Size is specified in half points. The
        default is 24 half-points, giving a size 12 font.

        .. versionadded:: 2.0

    `linenos`
        Turn on line numbering (default: ``False``).

        .. versionadded:: 2.18

    `lineno_fontsize`
        Font size for line numbers. Size is specified in half points
        (default: `fontsize`). 

        .. versionadded:: 2.18

    `lineno_padding`
        Number of spaces between the (inline) line numbers and the
        source code (default: ``2``).

        .. versionadded:: 2.18

    `linenostart`
        The line number for the first line (default: ``1``).

        .. versionadded:: 2.18

    `linenostep`
        If set to a number n > 1, only every nth line number is printed.

        .. versionadded:: 2.18

    `lineno_color`
        Color for line numbers specified as a hex triplet, e.g. ``'5e5e5e'``. 
        Defaults to the style's line number color if it is a hex triplet, 
        otherwise ansi bright black.

        .. versionadded:: 2.18

    `hl_lines`
        Specify a list of lines to be highlighted, as line numbers separated by
        spaces, e.g. ``'3 7 8'``. The line numbers are relative to the input 
        (i.e. the first line is line 1) unless `hl_linenostart` is set.

        .. versionadded:: 2.18

    `hl_color`
        Color for highlighting the lines specified in `hl_lines`, specified as 
        a hex triplet (default: style's `highlight_color`).

        .. versionadded:: 2.18

    `hl_linenostart`
        If set to ``True`` line numbers in `hl_lines` are specified
        relative to `linenostart` (default ``False``).

        .. versionadded:: 2.18
    """
    name = 'RTF'
    aliases = ['rtf']
    filenames = ['*.rtf']

    def __init__(self, **options):
        r"""
        Additional options accepted:

        ``fontface``
            Name of the font used. Could for example be ``'Courier New'``
            to further specify the default which is ``'\fmodern'``. The RTF
            specification claims that ``\fmodern`` are "Fixed-pitch serif
            and sans serif fonts". Hope every RTF implementation thinks
            the same about modern...

        """
        Formatter.__init__(self, **options)
        self.fontface = options.get('fontface') or ''
        self.fontsize = get_int_opt(options, 'fontsize', 0)
        self.linenos = get_bool_opt(options, 'linenos', False)
        self.lineno_fontsize = get_int_opt(options, 'lineno_fontsize',
                                           self.fontsize)
        self.lineno_padding = get_int_opt(options, 'lineno_padding', 2)
        self.linenostart = abs(get_int_opt(options, 'linenostart', 1))
        self.linenostep = abs(get_int_opt(options, 'linenostep', 1))
        self.hl_linenostart = get_bool_opt(options, 'hl_linenostart', False)

        self.hl_color = options.get('hl_color', '')
        if not self.hl_color:
            self.hl_color = self.style.highlight_color

        self.hl_lines = []
        for lineno in get_list_opt(options, 'hl_lines', []):
            try:
                lineno = int(lineno)
                if self.hl_linenostart:
                    lineno = lineno - self.linenostart + 1
                self.hl_lines.append(lineno)
            except ValueError:
                pass

        self.lineno_color = options.get('lineno_color', '')
        if not self.lineno_color:
            if  self.style.line_number_color == 'inherit':
                # style color is the css value 'inherit'
                # default to ansi bright-black
                self.lineno_color = _ansimap['ansibrightblack']
            else:
                # style color is assumed to be a hex triplet as other
                # colors in pygments/style.py
                self.lineno_color = self.style.line_number_color

        self.color_mapping = self._create_color_mapping()

    def _escape(self, text):
        return text.replace('\\', '\\\\') \
                   .replace('{', '\\{') \
                   .replace('}', '\\}')

    def _escape_text(self, text):
        # empty strings, should give a small performance improvement
        if not text:
            return ''

        # escape text
        text = self._escape(text)

        buf = []
        for c in text:
            cn = ord(c)
            if cn < (2**7):
                # ASCII character
                buf.append(str(c))
            elif (2**7) <= cn < (2**16):
                # single unicode escape sequence
                buf.append('{\\u%d}' % cn)
            elif (2**16) <= cn:
                # RTF limits unicode to 16 bits.
                # Force surrogate pairs
                buf.append('{\\u%d}{\\u%d}' % surrogatepair(cn))

        return ''.join(buf).replace('\n', '\\par')

    @staticmethod
    def hex_to_rtf_color(hex_color):
        if hex_color[0] == "#":
            hex_color = hex_color[1:]

        return '\\red%d\\green%d\\blue%d;' % (
                        int(hex_color[0:2], 16),
                        int(hex_color[2:4], 16),
                        int(hex_color[4:6], 16)
                    )

    def _split_tokens_on_newlines(self, tokensource):
        """
        Split tokens containing newline characters into multiple token
        each representing a line of the input file. Needed for numbering
        lines of e.g. multiline comments.
        """
        for ttype, value in tokensource:
            if value == '\n':
                yield (ttype, value)
            elif "\n" in value:
                lines = value.split("\n")
                for line in lines[:-1]:
                    yield (ttype, line+"\n")
                if lines[-1]:
                    yield (ttype, lines[-1])
            else:
                yield (ttype, value)

    def _create_color_mapping(self):
        """
        Create a mapping of style hex colors to index/offset in
        the RTF color table.
        """
        color_mapping = OrderedDict()
        offset = 1

        if self.linenos:
            color_mapping[self.lineno_color] = offset
            offset += 1

        if self.hl_lines:
            color_mapping[self.hl_color] = offset
            offset += 1

        for _, style in self.style:
            for color in style['color'], style['bgcolor'], style['border']:
                if color and color not in color_mapping:
                    color_mapping[color] = offset
                    offset += 1

        return color_mapping

    @property
    def _lineno_template(self):
        if self.lineno_fontsize != self.fontsize:
            return '{{\\fs{} \\cf{} %s{}}}'.format(self.lineno_fontsize,
                          self.color_mapping[self.lineno_color],
                          " " * self.lineno_padding)

        return '{{\\cf{} %s{}}}'.format(self.color_mapping[self.lineno_color],
                      " " * self.lineno_padding)

    @property
    def _hl_open_str(self):
        return rf'{{\highlight{self.color_mapping[self.hl_color]} '

    @property
    def _rtf_header(self):
        lines = []
        # rtf 1.8 header
        lines.append('{\\rtf1\\ansi\\uc0\\deff0'
                     '{\\fonttbl{\\f0\\fmodern\\fprq1\\fcharset0%s;}}'
                     % (self.fontface and ' '
                        + self._escape(self.fontface) or ''))

        # color table
        lines.append('{\\colortbl;')
        for color, _ in self.color_mapping.items():
            lines.append(self.hex_to_rtf_color(color))
        lines.append('}')

        # font and fontsize
        lines.append('\\f0\\sa0')
        if self.fontsize:
            lines.append('\\fs%d' % self.fontsize)

        # ensure Libre Office Writer imports and renders consecutive
        # space characters the same width, needed for line numbering.
        # https://bugs.documentfoundation.org/show_bug.cgi?id=144050
        lines.append('\\dntblnsbdb')

        return lines

    def format_unencoded(self, tokensource, outfile):
        for line in self._rtf_header:
            outfile.write(line + "\n")

        tokensource = self._split_tokens_on_newlines(tokensource)

        # first pass of tokens to count lines, needed for line numbering
        if self.linenos:
            line_count = 0
            tokens = [] # for copying the token source generator
            for ttype, value in tokensource:
                tokens.append((ttype, value))
                if value.endswith("\n"):
                    line_count += 1

            # width of line number strings (for padding with spaces)
            linenos_width = len(str(line_count+self.linenostart-1))

            tokensource = tokens

        # highlight stream
        lineno = 1
        start_new_line = True
        for ttype, value in tokensource:
            if start_new_line and lineno in self.hl_lines:
                outfile.write(self._hl_open_str)

            if start_new_line and self.linenos:
                if (lineno-self.linenostart+1)%self.linenostep == 0:
                    current_lineno = lineno + self.linenostart - 1
                    lineno_str = str(current_lineno).rjust(linenos_width)
                else:
                    lineno_str = "".rjust(linenos_width)
                outfile.write(self._lineno_template % lineno_str)

            while not self.style.styles_token(ttype) and ttype.parent:
                ttype = ttype.parent
            style = self.style.style_for_token(ttype)
            buf = []
            if style['bgcolor']:
                buf.append('\\cb%d' % self.color_mapping[style['bgcolor']])
            if style['color']:
                buf.append('\\cf%d' % self.color_mapping[style['color']])
            if style['bold']:
                buf.append('\\b')
            if style['italic']:
                buf.append('\\i')
            if style['underline']:
                buf.append('\\ul')
            if style['border']:
                buf.append('\\chbrdr\\chcfpat%d' %
                           self.color_mapping[style['border']])
            start = ''.join(buf)
            if start:
                outfile.write(f'{{{start} ')
            outfile.write(self._escape_text(value))
            if start:
                outfile.write('}')
            start_new_line = False

            # complete line of input
            if value.endswith("\n"):
                # close line highlighting
                if lineno in self.hl_lines:
                    outfile.write('}')
                # newline in RTF file after closing }
                outfile.write("\n")

                start_new_line = True
                lineno += 1

        outfile.write('}\n')
