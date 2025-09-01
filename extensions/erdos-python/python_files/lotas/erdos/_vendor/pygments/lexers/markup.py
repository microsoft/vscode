"""
    pygments.lexers.markup
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for non-HTML markup languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexers.html import XmlLexer
from erdos._vendor.pygments.lexers.javascript import JavascriptLexer
from erdos._vendor.pygments.lexers.css import CssLexer
from erdos._vendor.pygments.lexers.lilypond import LilyPondLexer
from erdos._vendor.pygments.lexers.data import JsonLexer

from erdos._vendor.pygments.lexer import RegexLexer, DelegatingLexer, include, bygroups, \
    using, this, do_insertions, default, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Other, Whitespace, Literal
from erdos._vendor.pygments.util import get_bool_opt, ClassNotFound

__all__ = ['BBCodeLexer', 'MoinWikiLexer', 'RstLexer', 'TexLexer', 'GroffLexer',
           'MozPreprocHashLexer', 'MozPreprocPercentLexer',
           'MozPreprocXulLexer', 'MozPreprocJavascriptLexer',
           'MozPreprocCssLexer', 'MarkdownLexer', 'OrgLexer', 'TiddlyWiki5Lexer',
           'WikitextLexer']


class BBCodeLexer(RegexLexer):
    """
    A lexer that highlights BBCode(-like) syntax.
    """

    name = 'BBCode'
    aliases = ['bbcode']
    mimetypes = ['text/x-bbcode']
    url = 'https://www.bbcode.org/'
    version_added = '0.6'

    tokens = {
        'root': [
            (r'[^[]+', Text),
            # tag/end tag begin
            (r'\[/?\w+', Keyword, 'tag'),
            # stray bracket
            (r'\[', Text),
        ],
        'tag': [
            (r'\s+', Text),
            # attribute with value
            (r'(\w+)(=)("?[^\s"\]]+"?)',
             bygroups(Name.Attribute, Operator, String)),
            # tag argument (a la [color=green])
            (r'(=)("?[^\s"\]]+"?)',
             bygroups(Operator, String)),
            # tag end
            (r'\]', Keyword, '#pop'),
        ],
    }


class MoinWikiLexer(RegexLexer):
    """
    For MoinMoin (and Trac) Wiki markup.
    """

    name = 'MoinMoin/Trac Wiki markup'
    aliases = ['trac-wiki', 'moin']
    filenames = []
    mimetypes = ['text/x-trac-wiki']
    url = 'https://moinmo.in'
    version_added = '0.7'

    flags = re.MULTILINE | re.IGNORECASE

    tokens = {
        'root': [
            (r'^#.*$', Comment),
            (r'(!)(\S+)', bygroups(Keyword, Text)),  # Ignore-next
            # Titles
            (r'^(=+)([^=]+)(=+)(\s*#.+)?$',
             bygroups(Generic.Heading, using(this), Generic.Heading, String)),
            # Literal code blocks, with optional shebang
            (r'(\{\{\{)(\n#!.+)?', bygroups(Name.Builtin, Name.Namespace), 'codeblock'),
            (r'(\'\'\'?|\|\||`|__|~~|\^|,,|::)', Comment),  # Formatting
            # Lists
            (r'^( +)([.*-])( )', bygroups(Text, Name.Builtin, Text)),
            (r'^( +)([a-z]{1,5}\.)( )', bygroups(Text, Name.Builtin, Text)),
            # Other Formatting
            (r'\[\[\w+.*?\]\]', Keyword),  # Macro
            (r'(\[[^\s\]]+)(\s+[^\]]+?)?(\])',
             bygroups(Keyword, String, Keyword)),  # Link
            (r'^----+$', Keyword),  # Horizontal rules
            (r'[^\n\'\[{!_~^,|]+', Text),
            (r'\n', Text),
            (r'.', Text),
        ],
        'codeblock': [
            (r'\}\}\}', Name.Builtin, '#pop'),
            # these blocks are allowed to be nested in Trac, but not MoinMoin
            (r'\{\{\{', Text, '#push'),
            (r'[^{}]+', Comment.Preproc),  # slurp boring text
            (r'.', Comment.Preproc),  # allow loose { or }
        ],
    }


class RstLexer(RegexLexer):
    """
    For reStructuredText markup.

    Additional options accepted:

    `handlecodeblocks`
        Highlight the contents of ``.. sourcecode:: language``,
        ``.. code:: language`` and ``.. code-block:: language``
        directives with a lexer for the given language (default:
        ``True``).

        .. versionadded:: 0.8
    """
    name = 'reStructuredText'
    url = 'https://docutils.sourceforge.io/rst.html'
    aliases = ['restructuredtext', 'rst', 'rest']
    filenames = ['*.rst', '*.rest']
    mimetypes = ["text/x-rst", "text/prs.fallenstein.rst"]
    version_added = '0.7'
    flags = re.MULTILINE

    def _handle_sourcecode(self, match):
        from erdos._vendor.pygments.lexers import get_lexer_by_name

        # section header
        yield match.start(1), Punctuation, match.group(1)
        yield match.start(2), Text, match.group(2)
        yield match.start(3), Operator.Word, match.group(3)
        yield match.start(4), Punctuation, match.group(4)
        yield match.start(5), Text, match.group(5)
        yield match.start(6), Keyword, match.group(6)
        yield match.start(7), Text, match.group(7)

        # lookup lexer if wanted and existing
        lexer = None
        if self.handlecodeblocks:
            try:
                lexer = get_lexer_by_name(match.group(6).strip())
            except ClassNotFound:
                pass
        indention = match.group(8)
        indention_size = len(indention)
        code = (indention + match.group(9) + match.group(10) + match.group(11))

        # no lexer for this language. handle it like it was a code block
        if lexer is None:
            yield match.start(8), String, code
            return

        # highlight the lines with the lexer.
        ins = []
        codelines = code.splitlines(True)
        code = ''
        for line in codelines:
            if len(line) > indention_size:
                ins.append((len(code), [(0, Text, line[:indention_size])]))
                code += line[indention_size:]
            else:
                code += line
        yield from do_insertions(ins, lexer.get_tokens_unprocessed(code))

    # from docutils.parsers.rst.states
    closers = '\'")]}>\u2019\u201d\xbb!?'
    unicode_delimiters = '\u2010\u2011\u2012\u2013\u2014\u00a0'
    end_string_suffix = (rf'((?=$)|(?=[-/:.,; \n\x00{re.escape(unicode_delimiters)}{re.escape(closers)}]))')

    tokens = {
        'root': [
            # Heading with overline
            (r'^(=+|-+|`+|:+|\.+|\'+|"+|~+|\^+|_+|\*+|\++|#+)([ \t]*\n)'
             r'(.+)(\n)(\1)(\n)',
             bygroups(Generic.Heading, Text, Generic.Heading,
                      Text, Generic.Heading, Text)),
            # Plain heading
            (r'^(\S.*)(\n)(={3,}|-{3,}|`{3,}|:{3,}|\.{3,}|\'{3,}|"{3,}|'
             r'~{3,}|\^{3,}|_{3,}|\*{3,}|\+{3,}|#{3,})(\n)',
             bygroups(Generic.Heading, Text, Generic.Heading, Text)),
            # Bulleted lists
            (r'^(\s*)([-*+])( .+\n(?:\1  .+\n)*)',
             bygroups(Text, Number, using(this, state='inline'))),
            # Numbered lists
            (r'^(\s*)([0-9#ivxlcmIVXLCM]+\.)( .+\n(?:\1  .+\n)*)',
             bygroups(Text, Number, using(this, state='inline'))),
            (r'^(\s*)(\(?[0-9#ivxlcmIVXLCM]+\))( .+\n(?:\1  .+\n)*)',
             bygroups(Text, Number, using(this, state='inline'))),
            # Numbered, but keep words at BOL from becoming lists
            (r'^(\s*)([A-Z]+\.)( .+\n(?:\1  .+\n)+)',
             bygroups(Text, Number, using(this, state='inline'))),
            (r'^(\s*)(\(?[A-Za-z]+\))( .+\n(?:\1  .+\n)+)',
             bygroups(Text, Number, using(this, state='inline'))),
            # Line blocks
            (r'^(\s*)(\|)( .+\n(?:\|  .+\n)*)',
             bygroups(Text, Operator, using(this, state='inline'))),
            # Sourcecode directives
            (r'^( *\.\.)(\s*)((?:source)?code(?:-block)?)(::)([ \t]*)([^\n]+)'
             r'(\n[ \t]*\n)([ \t]+)(.*)(\n)((?:(?:\8.*)?\n)+)',
             _handle_sourcecode),
            # A directive
            (r'^( *\.\.)(\s*)([\w:-]+?)(::)(?:([ \t]*)(.*))',
             bygroups(Punctuation, Text, Operator.Word, Punctuation, Text,
                      using(this, state='inline'))),
            # A reference target
            (r'^( *\.\.)(\s*)(_(?:[^:\\]|\\.)+:)(.*?)$',
             bygroups(Punctuation, Text, Name.Tag, using(this, state='inline'))),
            # A footnote/citation target
            (r'^( *\.\.)(\s*)(\[.+\])(.*?)$',
             bygroups(Punctuation, Text, Name.Tag, using(this, state='inline'))),
            # A substitution def
            (r'^( *\.\.)(\s*)(\|.+\|)(\s*)([\w:-]+?)(::)(?:([ \t]*)(.*))',
             bygroups(Punctuation, Text, Name.Tag, Text, Operator.Word,
                      Punctuation, Text, using(this, state='inline'))),
            # Comments
            (r'^ *\.\..*(\n( +.*\n|\n)+)?', Comment),
            # Field list marker
            (r'^( *)(:(?:\\\\|\\:|[^:\n])+:(?=\s))([ \t]*)',
             bygroups(Text, Name.Class, Text)),
            # Definition list
            (r'^(\S.*(?<!::)\n)((?:(?: +.*)\n)+)',
             bygroups(using(this, state='inline'), using(this, state='inline'))),
            # Code blocks
            (r'(::)(\n[ \t]*\n)([ \t]+)(.*)(\n)((?:(?:\3.*)?\n)+)',
             bygroups(String.Escape, Text, String, String, Text, String)),
            include('inline'),
        ],
        'inline': [
            (r'\\.', Text),  # escape
            (r'``', String, 'literal'),  # code
            (r'(`.+?)(<.+?>)(`__?)',  # reference with inline target
             bygroups(String, String.Interpol, String)),
            (r'`.+?`__?', String),  # reference
            (r'(`.+?`)(:[a-zA-Z0-9:-]+?:)?',
             bygroups(Name.Variable, Name.Attribute)),  # role
            (r'(:[a-zA-Z0-9:-]+?:)(`.+?`)',
             bygroups(Name.Attribute, Name.Variable)),  # role (content first)
            (r'\*\*.+?\*\*', Generic.Strong),  # Strong emphasis
            (r'\*.+?\*', Generic.Emph),  # Emphasis
            (r'\[.*?\]_', String),  # Footnote or citation
            (r'<.+?>', Name.Tag),   # Hyperlink
            (r'[^\\\n\[*`:]+', Text),
            (r'.', Text),
        ],
        'literal': [
            (r'[^`]+', String),
            (r'``' + end_string_suffix, String, '#pop'),
            (r'`', String),
        ]
    }

    def __init__(self, **options):
        self.handlecodeblocks = get_bool_opt(options, 'handlecodeblocks', True)
        RegexLexer.__init__(self, **options)

    def analyse_text(text):
        if text[:2] == '..' and text[2:3] != '.':
            return 0.3
        p1 = text.find("\n")
        p2 = text.find("\n", p1 + 1)
        if (p2 > -1 and              # has two lines
                p1 * 2 + 1 == p2 and     # they are the same length
                text[p1+1] in '-=' and   # the next line both starts and ends with
                text[p1+1] == text[p2-1]):  # ...a sufficiently high header
            return 0.5


class TexLexer(RegexLexer):
    """
    Lexer for the TeX and LaTeX typesetting languages.
    """

    name = 'TeX'
    aliases = ['tex', 'latex']
    filenames = ['*.tex', '*.aux', '*.toc']
    mimetypes = ['text/x-tex', 'text/x-latex']
    url = 'https://tug.org'
    version_added = ''

    tokens = {
        'general': [
            (r'%.*?\n', Comment),
            (r'[{}]', Name.Builtin),
            (r'[&_^]', Name.Builtin),
        ],
        'root': [
            (r'\\\[', String.Backtick, 'displaymath'),
            (r'\\\(', String, 'inlinemath'),
            (r'\$\$', String.Backtick, 'displaymath'),
            (r'\$', String, 'inlinemath'),
            (r'\\([a-zA-Z@_:]+|\S?)', Keyword, 'command'),
            (r'\\$', Keyword),
            include('general'),
            (r'[^\\$%&_^{}]+', Text),
        ],
        'math': [
            (r'\\([a-zA-Z]+|\S?)', Name.Variable),
            include('general'),
            (r'[0-9]+', Number),
            (r'[-=!+*/()\[\]]', Operator),
            (r'[^=!+*/()\[\]\\$%&_^{}0-9-]+', Name.Builtin),
        ],
        'inlinemath': [
            (r'\\\)', String, '#pop'),
            (r'\$', String, '#pop'),
            include('math'),
        ],
        'displaymath': [
            (r'\\\]', String, '#pop'),
            (r'\$\$', String, '#pop'),
            (r'\$', Name.Builtin),
            include('math'),
        ],
        'command': [
            (r'\[.*?\]', Name.Attribute),
            (r'\*', Keyword),
            default('#pop'),
        ],
    }

    def analyse_text(text):
        for start in ("\\documentclass", "\\input", "\\documentstyle",
                      "\\relax"):
            if text[:len(start)] == start:
                return True


class GroffLexer(RegexLexer):
    """
    Lexer for the (g)roff typesetting language, supporting groff
    extensions. Mainly useful for highlighting manpage sources.
    """

    name = 'Groff'
    aliases = ['groff', 'nroff', 'man']
    filenames = ['*.[1-9]', '*.man', '*.1p', '*.3pm']
    mimetypes = ['application/x-troff', 'text/troff']
    url = 'https://www.gnu.org/software/groff'
    version_added = '0.6'

    tokens = {
        'root': [
            (r'(\.)(\w+)', bygroups(Text, Keyword), 'request'),
            (r'\.', Punctuation, 'request'),
            # Regular characters, slurp till we find a backslash or newline
            (r'[^\\\n]+', Text, 'textline'),
            default('textline'),
        ],
        'textline': [
            include('escapes'),
            (r'[^\\\n]+', Text),
            (r'\n', Text, '#pop'),
        ],
        'escapes': [
            # groff has many ways to write escapes.
            (r'\\"[^\n]*', Comment),
            (r'\\[fn]\w', String.Escape),
            (r'\\\(.{2}', String.Escape),
            (r'\\.\[.*\]', String.Escape),
            (r'\\.', String.Escape),
            (r'\\\n', Text, 'request'),
        ],
        'request': [
            (r'\n', Text, '#pop'),
            include('escapes'),
            (r'"[^\n"]+"', String.Double),
            (r'\d+', Number),
            (r'\S+', String),
            (r'\s+', Text),
        ],
    }

    def analyse_text(text):
        if text[:1] != '.':
            return False
        if text[:3] == '.\\"':
            return True
        if text[:4] == '.TH ':
            return True
        if text[1:3].isalnum() and text[3].isspace():
            return 0.9


class MozPreprocHashLexer(RegexLexer):
    """
    Lexer for Mozilla Preprocessor files (with '#' as the marker).

    Other data is left untouched.
    """
    name = 'mozhashpreproc'
    aliases = [name]
    filenames = []
    mimetypes = []
    url = 'https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html'
    version_added = '2.0'

    tokens = {
        'root': [
            (r'^#', Comment.Preproc, ('expr', 'exprstart')),
            (r'.+', Other),
        ],
        'exprstart': [
            (r'(literal)(.*)', bygroups(Comment.Preproc, Text), '#pop:2'),
            (words((
                'define', 'undef', 'if', 'ifdef', 'ifndef', 'else', 'elif',
                'elifdef', 'elifndef', 'endif', 'expand', 'filter', 'unfilter',
                'include', 'includesubst', 'error')),
             Comment.Preproc, '#pop'),
        ],
        'expr': [
            (words(('!', '!=', '==', '&&', '||')), Operator),
            (r'(defined)(\()', bygroups(Keyword, Punctuation)),
            (r'\)', Punctuation),
            (r'[0-9]+', Number.Decimal),
            (r'__\w+?__', Name.Variable),
            (r'@\w+?@', Name.Class),
            (r'\w+', Name),
            (r'\n', Text, '#pop'),
            (r'\s+', Text),
            (r'\S', Punctuation),
        ],
    }


class MozPreprocPercentLexer(MozPreprocHashLexer):
    """
    Lexer for Mozilla Preprocessor files (with '%' as the marker).

    Other data is left untouched.
    """
    name = 'mozpercentpreproc'
    aliases = [name]
    filenames = []
    mimetypes = []
    url = 'https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html'
    version_added = '2.0'

    tokens = {
        'root': [
            (r'^%', Comment.Preproc, ('expr', 'exprstart')),
            (r'.+', Other),
        ],
    }


class MozPreprocXulLexer(DelegatingLexer):
    """
    Subclass of the `MozPreprocHashLexer` that highlights unlexed data with the
    `XmlLexer`.
    """
    name = "XUL+mozpreproc"
    aliases = ['xul+mozpreproc']
    filenames = ['*.xul.in']
    mimetypes = []
    url = 'https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html'
    version_added = '2.0'

    def __init__(self, **options):
        super().__init__(XmlLexer, MozPreprocHashLexer, **options)


class MozPreprocJavascriptLexer(DelegatingLexer):
    """
    Subclass of the `MozPreprocHashLexer` that highlights unlexed data with the
    `JavascriptLexer`.
    """
    name = "Javascript+mozpreproc"
    aliases = ['javascript+mozpreproc']
    filenames = ['*.js.in']
    mimetypes = []
    url = 'https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html'
    version_added = '2.0'

    def __init__(self, **options):
        super().__init__(JavascriptLexer, MozPreprocHashLexer, **options)


class MozPreprocCssLexer(DelegatingLexer):
    """
    Subclass of the `MozPreprocHashLexer` that highlights unlexed data with the
    `CssLexer`.
    """
    name = "CSS+mozpreproc"
    aliases = ['css+mozpreproc']
    filenames = ['*.css.in']
    mimetypes = []
    url = 'https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html'
    version_added = '2.0'

    def __init__(self, **options):
        super().__init__(CssLexer, MozPreprocPercentLexer, **options)


class MarkdownLexer(RegexLexer):
    """
    For Markdown markup.
    """
    name = 'Markdown'
    url = 'https://daringfireball.net/projects/markdown/'
    aliases = ['markdown', 'md']
    filenames = ['*.md', '*.markdown']
    mimetypes = ["text/x-markdown"]
    version_added = '2.2'
    flags = re.MULTILINE

    def _handle_codeblock(self, match):
        from erdos._vendor.pygments.lexers import get_lexer_by_name

        yield match.start('initial'), String.Backtick, match.group('initial')
        yield match.start('lang'), String.Backtick, match.group('lang')
        if match.group('afterlang') is not None:
            yield match.start('whitespace'), Whitespace, match.group('whitespace')
            yield match.start('extra'), Text, match.group('extra')
        yield match.start('newline'), Whitespace, match.group('newline')

        # lookup lexer if wanted and existing
        lexer = None
        if self.handlecodeblocks:
            try:
                lexer = get_lexer_by_name(match.group('lang').strip())
            except ClassNotFound:
                pass
        code = match.group('code')
        # no lexer for this language. handle it like it was a code block
        if lexer is None:
            yield match.start('code'), String, code
        else:
            # FIXME: aren't the offsets wrong?
            yield from do_insertions([], lexer.get_tokens_unprocessed(code))

        yield match.start('terminator'), String.Backtick, match.group('terminator')

    tokens = {
        'root': [
            # heading with '#' prefix (atx-style)
            (r'(^#[^#].+)(\n)', bygroups(Generic.Heading, Text)),
            # subheading with '#' prefix (atx-style)
            (r'(^#{2,6}[^#].+)(\n)', bygroups(Generic.Subheading, Text)),
            # heading with '=' underlines (Setext-style)
            (r'^(.+)(\n)(=+)(\n)', bygroups(Generic.Heading, Text, Generic.Heading, Text)),
            # subheading with '-' underlines (Setext-style)
            (r'^(.+)(\n)(-+)(\n)', bygroups(Generic.Subheading, Text, Generic.Subheading, Text)),
            # task list
            (r'^(\s*)([*-] )(\[[ xX]\])( .+\n)',
            bygroups(Whitespace, Keyword, Keyword, using(this, state='inline'))),
            # bulleted list
            (r'^(\s*)([*-])(\s)(.+\n)',
            bygroups(Whitespace, Keyword, Whitespace, using(this, state='inline'))),
            # numbered list
            (r'^(\s*)([0-9]+\.)( .+\n)',
            bygroups(Whitespace, Keyword, using(this, state='inline'))),
            # quote
            (r'^(\s*>\s)(.+\n)', bygroups(Keyword, Generic.Emph)),
            # code block fenced by 3 backticks
            (r'^(\s*```\n[\w\W]*?^\s*```$\n)', String.Backtick),
            # code block with language
            # Some tools include extra stuff after the language name, just
            # highlight that as text. For example: https://docs.enola.dev/use/execmd
            (r'''(?x)
              ^(?P<initial>\s*```)
              (?P<lang>[\w\-]+)
              (?P<afterlang>
                 (?P<whitespace>[^\S\n]+)
                 (?P<extra>.*))?
              (?P<newline>\n)
              (?P<code>(.|\n)*?)
              (?P<terminator>^\s*```$\n)
              ''',
             _handle_codeblock),

            include('inline'),
        ],
        'inline': [
            # escape
            (r'\\.', Text),
            # inline code
            (r'([^`]?)(`[^`\n]+`)', bygroups(Text, String.Backtick)),
            # warning: the following rules eat outer tags.
            # eg. **foo _bar_ baz** => foo and baz are not recognized as bold
            # bold fenced by '**'
            (r'([^\*]?)(\*\*[^* \n][^*\n]*\*\*)', bygroups(Text, Generic.Strong)),
            # bold fenced by '__'
            (r'([^_]?)(__[^_ \n][^_\n]*__)', bygroups(Text, Generic.Strong)),
            # italics fenced by '*'
            (r'([^\*]?)(\*[^* \n][^*\n]*\*)', bygroups(Text, Generic.Emph)),
            # italics fenced by '_'
            (r'([^_]?)(_[^_ \n][^_\n]*_)', bygroups(Text, Generic.Emph)),
            # strikethrough
            (r'([^~]?)(~~[^~ \n][^~\n]*~~)', bygroups(Text, Generic.Deleted)),
            # mentions and topics (twitter and github stuff)
            (r'[@#][\w/:]+', Name.Entity),
            # (image?) links eg: ![Image of Yaktocat](https://octodex.github.com/images/yaktocat.png)
            (r'(!?\[)([^]]+)(\])(\()([^)]+)(\))',
             bygroups(Text, Name.Tag, Text, Text, Name.Attribute, Text)),
            # reference-style links, e.g.:
            #   [an example][id]
            #   [id]: http://example.com/
            (r'(\[)([^]]+)(\])(\[)([^]]*)(\])',
             bygroups(Text, Name.Tag, Text, Text, Name.Label, Text)),
            (r'^(\s*\[)([^]]*)(\]:\s*)(.+)',
             bygroups(Text, Name.Label, Text, Name.Attribute)),

            # general text, must come last!
            (r'[^\\\s]+', Text),
            (r'.', Text),
        ],
    }

    def __init__(self, **options):
        self.handlecodeblocks = get_bool_opt(options, 'handlecodeblocks', True)
        RegexLexer.__init__(self, **options)

class OrgLexer(RegexLexer):
    """
    For Org Mode markup.
    """
    name = 'Org Mode'
    url = 'https://orgmode.org'
    aliases = ['org', 'orgmode', 'org-mode']
    filenames = ['*.org']
    mimetypes = ["text/org"]
    version_added = '2.18'

    def _inline(start, end):
        return rf'(?<!\w){start}(.|\n(?!\n))+?{end}(?!\w)'

    tokens = {
        'root': [
            (r'^# .*', Comment.Single),

            # Headings
            (r'^(\* )(COMMENT)( .*)',
             bygroups(Generic.Heading, Comment.Preproc, Generic.Heading)),
            (r'^(\*\*+ )(COMMENT)( .*)',
             bygroups(Generic.Subheading, Comment.Preproc, Generic.Subheading)),
            (r'^(\* )(DONE)( .*)',
             bygroups(Generic.Heading, Generic.Deleted, Generic.Heading)),
            (r'^(\*\*+ )(DONE)( .*)',
             bygroups(Generic.Subheading, Generic.Deleted, Generic.Subheading)),
            (r'^(\* )(TODO)( .*)',
             bygroups(Generic.Heading, Generic.Error, Generic.Heading)),
            (r'^(\*\*+ )(TODO)( .*)',
             bygroups(Generic.Subheading, Generic.Error, Generic.Subheading)),

            (r'^(\* .+?)( :[a-zA-Z0-9_@:]+:)?$', bygroups(Generic.Heading, Generic.Emph)),
            (r'^(\*\*+ .+?)( :[a-zA-Z0-9_@:]+:)?$', bygroups(Generic.Subheading, Generic.Emph)),

            # Unordered lists items, including TODO items and description items
            (r'^(?:( *)([+-] )|( +)(\* ))(\[[ X-]\])?(.+ ::)?',
             bygroups(Whitespace, Keyword, Whitespace, Keyword, Generic.Prompt, Name.Label)),

            # Ordered list items
            (r'^( *)([0-9]+[.)])( \[@[0-9]+\])?', bygroups(Whitespace, Keyword, Generic.Emph)),

            # Dynamic blocks
            (r'(?i)^( *#\+begin: *)((?:.|\n)*?)(^ *#\+end: *$)',
             bygroups(Operator.Word, using(this), Operator.Word)),

            # Comment blocks
            (r'(?i)^( *#\+begin_comment *\n)((?:.|\n)*?)(^ *#\+end_comment *$)',
             bygroups(Operator.Word, Comment.Multiline, Operator.Word)),

            # Source code blocks
            # TODO: language-dependent syntax highlighting (see Markdown lexer)
            (r'(?i)^( *#\+begin_src .*)((?:.|\n)*?)(^ *#\+end_src *$)',
             bygroups(Operator.Word, Text, Operator.Word)),

            # Other blocks
            (r'(?i)^( *#\+begin_\w+)( *\n)((?:.|\n)*?)(^ *#\+end_\w+)( *$)',
             bygroups(Operator.Word, Whitespace, Text, Operator.Word, Whitespace)),

            # Keywords
            (r'^(#\+\w+:)(.*)$', bygroups(Name.Namespace, Text)),

            # Properties and drawers
            (r'(?i)^( *:\w+: *\n)((?:.|\n)*?)(^ *:end: *$)',
             bygroups(Name.Decorator, Comment.Special, Name.Decorator)),

            # Line break operator
            (r'\\\\$', Operator),

            # Deadline, Scheduled, CLOSED
            (r'(?i)^( *(?:DEADLINE|SCHEDULED): )(<.+?> *)$',
             bygroups(Generic.Error, Literal.Date)),
            (r'(?i)^( *CLOSED: )(\[.+?\] *)$',
             bygroups(Generic.Deleted, Literal.Date)),

            # Bold
            (_inline(r'\*', r'\*+'), Generic.Strong),
            # Italic
            (_inline(r'/', r'/'), Generic.Emph),
            # Verbatim
            (_inline(r'=', r'='), String), # TODO token
            # Code
            (_inline(r'~', r'~'), String),
            # Strikethrough
            (_inline(r'\+', r'\+'), Generic.Deleted),
            # Underline
            (_inline(r'_', r'_+'), Generic.EmphStrong),

            # Dates
            (r'<.+?>', Literal.Date),
            # Macros
            (r'\{\{\{.+?\}\}\}', Comment.Preproc),
            # Footnotes
            (r'(?<!\[)\[fn:.+?\]', Name.Tag),
            # Links
            (r'(?s)(\[\[)(.*?)(\]\[)(.*?)(\]\])',
             bygroups(Punctuation, Name.Attribute, Punctuation, Name.Tag, Punctuation)),
            (r'(?s)(\[\[)(.+?)(\]\])', bygroups(Punctuation, Name.Attribute, Punctuation)),
            (r'(<<)(.+?)(>>)', bygroups(Punctuation, Name.Attribute, Punctuation)),

            # Tables
            (r'^( *)(\|[ -].*?[ -]\|)$', bygroups(Whitespace, String)),

            # Any other text
            (r'[^#*+\-0-9:\\/=~_<{\[|\n]+', Text),
            (r'[#*+\-0-9:\\/=~_<{\[|\n]', Text),
        ],
    }

class TiddlyWiki5Lexer(RegexLexer):
    """
    For TiddlyWiki5 markup.
    """
    name = 'tiddler'
    url = 'https://tiddlywiki.com/#TiddlerFiles'
    aliases = ['tid']
    filenames = ['*.tid']
    mimetypes = ["text/vnd.tiddlywiki"]
    version_added = '2.7'
    flags = re.MULTILINE

    def _handle_codeblock(self, match):
        """
        match args: 1:backticks, 2:lang_name, 3:newline, 4:code, 5:backticks
        """
        from erdos._vendor.pygments.lexers import get_lexer_by_name

        # section header
        yield match.start(1), String, match.group(1)
        yield match.start(2), String, match.group(2)
        yield match.start(3), Text,   match.group(3)

        # lookup lexer if wanted and existing
        lexer = None
        if self.handlecodeblocks:
            try:
                lexer = get_lexer_by_name(match.group(2).strip())
            except ClassNotFound:
                pass
        code = match.group(4)

        # no lexer for this language. handle it like it was a code block
        if lexer is None:
            yield match.start(4), String, code
            return

        yield from do_insertions([], lexer.get_tokens_unprocessed(code))

        yield match.start(5), String, match.group(5)

    def _handle_cssblock(self, match):
        """
        match args: 1:style tag 2:newline, 3:code, 4:closing style tag
        """
        from erdos._vendor.pygments.lexers import get_lexer_by_name

        # section header
        yield match.start(1), String, match.group(1)
        yield match.start(2), String, match.group(2)

        lexer = None
        if self.handlecodeblocks:
            try:
                lexer = get_lexer_by_name('css')
            except ClassNotFound:
                pass
        code = match.group(3)

        # no lexer for this language. handle it like it was a code block
        if lexer is None:
            yield match.start(3), String, code
            return

        yield from do_insertions([], lexer.get_tokens_unprocessed(code))

        yield match.start(4), String, match.group(4)

    tokens = {
        'root': [
            # title in metadata section
            (r'^(title)(:\s)(.+\n)', bygroups(Keyword, Text, Generic.Heading)),
            # headings
            (r'^(!)([^!].+\n)', bygroups(Generic.Heading, Text)),
            (r'^(!{2,6})(.+\n)', bygroups(Generic.Subheading, Text)),
            # bulleted or numbered lists or single-line block quotes
            # (can be mixed)
            (r'^(\s*)([*#>]+)(\s*)(.+\n)',
             bygroups(Text, Keyword, Text, using(this, state='inline'))),
            # multi-line block quotes
            (r'^(<<<.*\n)([\w\W]*?)(^<<<.*$)', bygroups(String, Text, String)),
            # table header
            (r'^(\|.*?\|h)$', bygroups(Generic.Strong)),
            # table footer or caption
            (r'^(\|.*?\|[cf])$', bygroups(Generic.Emph)),
            # table class
            (r'^(\|.*?\|k)$', bygroups(Name.Tag)),
            # definitions
            (r'^(;.*)$', bygroups(Generic.Strong)),
            # text block
            (r'^(```\n)([\w\W]*?)(^```$)', bygroups(String, Text, String)),
            # code block with language
            (r'^(```)(\w+)(\n)([\w\W]*?)(^```$)', _handle_codeblock),
            # CSS style block
            (r'^(<style>)(\n)([\w\W]*?)(^</style>$)', _handle_cssblock),

            include('keywords'),
            include('inline'),
        ],
        'keywords': [
            (words((
                '\\define', '\\end', 'caption', 'created', 'modified', 'tags',
                'title', 'type'), prefix=r'^', suffix=r'\b'),
             Keyword),
        ],
        'inline': [
            # escape
            (r'\\.', Text),
            # created or modified date
            (r'\d{17}', Number.Integer),
            # italics
            (r'(\s)(//[^/]+//)((?=\W|\n))',
             bygroups(Text, Generic.Emph, Text)),
            # superscript
            (r'(\s)(\^\^[^\^]+\^\^)', bygroups(Text, Generic.Emph)),
            # subscript
            (r'(\s)(,,[^,]+,,)', bygroups(Text, Generic.Emph)),
            # underscore
            (r'(\s)(__[^_]+__)', bygroups(Text, Generic.Strong)),
            # bold
            (r"(\s)(''[^']+'')((?=\W|\n))",
             bygroups(Text, Generic.Strong, Text)),
            # strikethrough
            (r'(\s)(~~[^~]+~~)((?=\W|\n))',
             bygroups(Text, Generic.Deleted, Text)),
            # TiddlyWiki variables
            (r'<<[^>]+>>', Name.Tag),
            (r'\$\$[^$]+\$\$', Name.Tag),
            (r'\$\([^)]+\)\$', Name.Tag),
            # TiddlyWiki style or class
            (r'^@@.*$', Name.Tag),
            # HTML tags
            (r'</?[^>]+>', Name.Tag),
            # inline code
            (r'`[^`]+`', String.Backtick),
            # HTML escaped symbols
            (r'&\S*?;', String.Regex),
            # Wiki links
            (r'(\[{2})([^]\|]+)(\]{2})', bygroups(Text, Name.Tag, Text)),
            # External links
            (r'(\[{2})([^]\|]+)(\|)([^]\|]+)(\]{2})',
            bygroups(Text, Name.Tag, Text, Name.Attribute, Text)),
            # Transclusion
            (r'(\{{2})([^}]+)(\}{2})', bygroups(Text, Name.Tag, Text)),
            # URLs
            (r'(\b.?.?tps?://[^\s"]+)', bygroups(Name.Attribute)),

            # general text, must come last!
            (r'[\w]+', Text),
            (r'.', Text)
        ],
    }

    def __init__(self, **options):
        self.handlecodeblocks = get_bool_opt(options, 'handlecodeblocks', True)
        RegexLexer.__init__(self, **options)


class WikitextLexer(RegexLexer):
    """
    For MediaWiki Wikitext.

    Parsing Wikitext is tricky, and results vary between different MediaWiki
    installations, so we only highlight common syntaxes (built-in or from
    popular extensions), and also assume templates produce no unbalanced
    syntaxes.
    """
    name = 'Wikitext'
    url = 'https://www.mediawiki.org/wiki/Wikitext'
    aliases = ['wikitext', 'mediawiki']
    filenames = []
    mimetypes = ['text/x-wiki']
    version_added = '2.15'
    flags = re.MULTILINE

    def nowiki_tag_rules(tag_name):
        return [
            (rf'(?i)(</)({tag_name})(\s*)(>)', bygroups(Punctuation,
             Name.Tag, Whitespace, Punctuation), '#pop'),
            include('entity'),
            include('text'),
        ]

    def plaintext_tag_rules(tag_name):
        return [
            (rf'(?si)(.*?)(</)({tag_name})(\s*)(>)', bygroups(Text,
             Punctuation, Name.Tag, Whitespace, Punctuation), '#pop'),
        ]

    def delegate_tag_rules(tag_name, lexer, **lexer_kwargs):
        return [
            (rf'(?i)(</)({tag_name})(\s*)(>)', bygroups(Punctuation,
             Name.Tag, Whitespace, Punctuation), '#pop'),
            (rf'(?si).+?(?=</{tag_name}\s*>)', using(lexer, **lexer_kwargs)),
        ]

    def text_rules(token):
        return [
            (r'\w+', token),
            (r'[^\S\n]+', token),
            (r'(?s).', token),
        ]

    def handle_syntaxhighlight(self, match, ctx):
        from erdos._vendor.pygments.lexers import get_lexer_by_name

        attr_content = match.group()
        start = 0
        index = 0
        while True:
            index = attr_content.find('>', start)
            # Exclude comment end (-->)
            if attr_content[index-2:index] != '--':
                break
            start = index + 1

        if index == -1:
            # No tag end
            yield from self.get_tokens_unprocessed(attr_content, stack=['root', 'attr'])
            return
        attr = attr_content[:index]
        yield from self.get_tokens_unprocessed(attr, stack=['root', 'attr'])
        yield match.start(3) + index, Punctuation, '>'

        lexer = None
        content = attr_content[index+1:]
        lang_match = re.findall(r'\blang=("|\'|)(\w+)(\1)', attr)

        if len(lang_match) >= 1:
            # Pick the last match in case of multiple matches
            lang = lang_match[-1][1]
            try:
                lexer = get_lexer_by_name(lang)
            except ClassNotFound:
                pass

        if lexer is None:
            yield match.start() + index + 1, Text, content
        else:
            yield from lexer.get_tokens_unprocessed(content)

    def handle_score(self, match, ctx):
        attr_content = match.group()
        start = 0
        index = 0
        while True:
            index = attr_content.find('>', start)
            # Exclude comment end (-->)
            if attr_content[index-2:index] != '--':
                break
            start = index + 1

        if index == -1:
            # No tag end
            yield from self.get_tokens_unprocessed(attr_content, stack=['root', 'attr'])
            return
        attr = attr_content[:index]
        content = attr_content[index+1:]
        yield from self.get_tokens_unprocessed(attr, stack=['root', 'attr'])
        yield match.start(3) + index, Punctuation, '>'

        lang_match = re.findall(r'\blang=("|\'|)(\w+)(\1)', attr)
        # Pick the last match in case of multiple matches
        lang = lang_match[-1][1] if len(lang_match) >= 1 else 'lilypond'

        if lang == 'lilypond':  # Case sensitive
            yield from LilyPondLexer().get_tokens_unprocessed(content)
        else:  # ABC
            # FIXME: Use ABC lexer in the future
            yield match.start() + index + 1, Text, content

    # a-z removed to prevent linter from complaining, REMEMBER to use (?i)
    title_char = r' %!"$&\'()*,\-./0-9:;=?@A-Z\\\^_`~+\u0080-\uFFFF'
    nbsp_char = r'(?:\t|&nbsp;|&\#0*160;|&\#[Xx]0*[Aa]0;|[ \xA0\u1680\u2000-\u200A\u202F\u205F\u3000])'
    link_address = r'(?:[0-9.]+|\[[0-9a-f:.]+\]|[^\x00-\x20"<>\[\]\x7F\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFFFD])'
    link_char_class = r'[^\x00-\x20"<>\[\]\x7F\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFFFD]'
    double_slashes_i = {
        '__FORCETOC__', '__NOCONTENTCONVERT__', '__NOCC__', '__NOEDITSECTION__', '__NOGALLERY__',
        '__NOTITLECONVERT__', '__NOTC__', '__NOTOC__', '__TOC__',
    }
    double_slashes = {
        '__EXPECTUNUSEDCATEGORY__',  '__HIDDENCAT__', '__INDEX__',  '__NEWSECTIONLINK__',
        '__NOINDEX__',  '__NONEWSECTIONLINK__',  '__STATICREDIRECT__', '__NOGLOBAL__',
        '__DISAMBIG__', '__EXPECTED_UNCONNECTED_PAGE__',
    }
    protocols = {
        'bitcoin:', 'ftp://', 'ftps://', 'geo:', 'git://', 'gopher://', 'http://', 'https://',
        'irc://', 'ircs://', 'magnet:', 'mailto:', 'mms://', 'news:', 'nntp://', 'redis://',
        'sftp://', 'sip:', 'sips:', 'sms:', 'ssh://', 'svn://', 'tel:', 'telnet://', 'urn:',
        'worldwind://', 'xmpp:', '//',
    }
    non_relative_protocols = protocols - {'//'}
    html_tags = {
        'abbr', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code',
        'data', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5',
        'h6', 'hr', 'i', 'ins', 'kbd', 'li', 'link', 'mark', 'meta', 'ol', 'p', 'q', 'rb', 'rp',
        'rt', 'rtc', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup',
        'table', 'td', 'th', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
    }
    parser_tags = {
        'graph', 'charinsert', 'rss', 'chem', 'categorytree', 'nowiki', 'inputbox', 'math',
        'hiero', 'score', 'pre', 'ref', 'translate', 'imagemap', 'templatestyles', 'languages',
        'noinclude', 'mapframe', 'section', 'poem', 'syntaxhighlight', 'includeonly', 'tvar',
        'onlyinclude', 'templatedata', 'langconvert', 'timeline', 'dynamicpagelist', 'gallery',
        'maplink', 'ce', 'references',
    }
    variant_langs = {
        # ZhConverter.php
        'zh', 'zh-hans', 'zh-hant', 'zh-cn', 'zh-hk', 'zh-mo', 'zh-my', 'zh-sg', 'zh-tw',
        # WuuConverter.php
        'wuu', 'wuu-hans', 'wuu-hant',
        # UzConverter.php
        'uz', 'uz-latn', 'uz-cyrl',
        # TlyConverter.php
        'tly', 'tly-cyrl',
        # TgConverter.php
        'tg', 'tg-latn',
        # SrConverter.php
        'sr', 'sr-ec', 'sr-el',
        # ShiConverter.php
        'shi', 'shi-tfng', 'shi-latn',
        # ShConverter.php
        'sh-latn', 'sh-cyrl',
        # KuConverter.php
        'ku', 'ku-arab', 'ku-latn',
        # IuConverter.php
        'iu', 'ike-cans', 'ike-latn',
        # GanConverter.php
        'gan', 'gan-hans', 'gan-hant',
        # EnConverter.php
        'en', 'en-x-piglatin',
        # CrhConverter.php
        'crh', 'crh-cyrl', 'crh-latn',
        # BanConverter.php
        'ban', 'ban-bali', 'ban-x-dharma', 'ban-x-palmleaf', 'ban-x-pku',
    }
    magic_vars_i = {
        'ARTICLEPATH', 'INT', 'PAGEID', 'SCRIPTPATH', 'SERVER', 'SERVERNAME', 'STYLEPATH',
    }
    magic_vars = {
        '!', '=', 'BASEPAGENAME', 'BASEPAGENAMEE', 'CASCADINGSOURCES', 'CONTENTLANGUAGE',
        'CONTENTLANG', 'CURRENTDAY', 'CURRENTDAY2', 'CURRENTDAYNAME', 'CURRENTDOW', 'CURRENTHOUR',
        'CURRENTMONTH', 'CURRENTMONTH2', 'CURRENTMONTH1', 'CURRENTMONTHABBREV', 'CURRENTMONTHNAME',
        'CURRENTMONTHNAMEGEN', 'CURRENTTIME', 'CURRENTTIMESTAMP', 'CURRENTVERSION', 'CURRENTWEEK',
        'CURRENTYEAR', 'DIRECTIONMARK', 'DIRMARK', 'FULLPAGENAME', 'FULLPAGENAMEE', 'LOCALDAY',
        'LOCALDAY2', 'LOCALDAYNAME', 'LOCALDOW', 'LOCALHOUR', 'LOCALMONTH', 'LOCALMONTH2',
        'LOCALMONTH1', 'LOCALMONTHABBREV', 'LOCALMONTHNAME', 'LOCALMONTHNAMEGEN', 'LOCALTIME',
        'LOCALTIMESTAMP', 'LOCALWEEK', 'LOCALYEAR', 'NAMESPACE', 'NAMESPACEE', 'NAMESPACENUMBER',
        'NUMBEROFACTIVEUSERS', 'NUMBEROFADMINS', 'NUMBEROFARTICLES', 'NUMBEROFEDITS',
        'NUMBEROFFILES', 'NUMBEROFPAGES', 'NUMBEROFUSERS', 'PAGELANGUAGE', 'PAGENAME', 'PAGENAMEE',
        'REVISIONDAY', 'REVISIONDAY2', 'REVISIONID', 'REVISIONMONTH', 'REVISIONMONTH1',
        'REVISIONSIZE', 'REVISIONTIMESTAMP', 'REVISIONUSER', 'REVISIONYEAR', 'ROOTPAGENAME',
        'ROOTPAGENAMEE', 'SITENAME', 'SUBJECTPAGENAME', 'ARTICLEPAGENAME', 'SUBJECTPAGENAMEE',
        'ARTICLEPAGENAMEE', 'SUBJECTSPACE', 'ARTICLESPACE', 'SUBJECTSPACEE', 'ARTICLESPACEE',
        'SUBPAGENAME', 'SUBPAGENAMEE', 'TALKPAGENAME', 'TALKPAGENAMEE', 'TALKSPACE', 'TALKSPACEE',
    }
    parser_functions_i = {
        'ANCHORENCODE', 'BIDI', 'CANONICALURL', 'CANONICALURLE', 'FILEPATH', 'FORMATNUM',
        'FULLURL', 'FULLURLE', 'GENDER', 'GRAMMAR', 'INT', r'\#LANGUAGE', 'LC', 'LCFIRST', 'LOCALURL',
        'LOCALURLE', 'NS', 'NSE', 'PADLEFT', 'PADRIGHT', 'PAGEID', 'PLURAL', 'UC', 'UCFIRST',
        'URLENCODE',
    }
    parser_functions = {
        'BASEPAGENAME', 'BASEPAGENAMEE', 'CASCADINGSOURCES', 'DEFAULTSORT', 'DEFAULTSORTKEY',
        'DEFAULTCATEGORYSORT', 'FULLPAGENAME', 'FULLPAGENAMEE', 'NAMESPACE', 'NAMESPACEE',
        'NAMESPACENUMBER', 'NUMBERINGROUP', 'NUMINGROUP', 'NUMBEROFACTIVEUSERS', 'NUMBEROFADMINS',
        'NUMBEROFARTICLES', 'NUMBEROFEDITS', 'NUMBEROFFILES', 'NUMBEROFPAGES', 'NUMBEROFUSERS',
        'PAGENAME', 'PAGENAMEE', 'PAGESINCATEGORY', 'PAGESINCAT', 'PAGESIZE', 'PROTECTIONEXPIRY',
        'PROTECTIONLEVEL', 'REVISIONDAY', 'REVISIONDAY2', 'REVISIONID', 'REVISIONMONTH',
        'REVISIONMONTH1', 'REVISIONTIMESTAMP', 'REVISIONUSER', 'REVISIONYEAR', 'ROOTPAGENAME',
        'ROOTPAGENAMEE', 'SUBJECTPAGENAME', 'ARTICLEPAGENAME', 'SUBJECTPAGENAMEE',
        'ARTICLEPAGENAMEE', 'SUBJECTSPACE', 'ARTICLESPACE', 'SUBJECTSPACEE', 'ARTICLESPACEE',
        'SUBPAGENAME', 'SUBPAGENAMEE', 'TALKPAGENAME', 'TALKPAGENAMEE', 'TALKSPACE', 'TALKSPACEE',
        'INT', 'DISPLAYTITLE', 'PAGESINNAMESPACE', 'PAGESINNS',
    }

    tokens = {
        'root': [
            # Redirects
            (r"""(?xi)
                (\A\s*?)(\#REDIRECT:?) # may contain a colon
                (\s+)(\[\[) (?=[^\]\n]* \]\]$)
            """,
             bygroups(Whitespace, Keyword, Whitespace, Punctuation), 'redirect-inner'),
            # Subheadings
            (r'^(={2,6})(.+?)(\1)(\s*$\n)',
             bygroups(Generic.Subheading, Generic.Subheading, Generic.Subheading, Whitespace)),
            # Headings
            (r'^(=.+?=)(\s*$\n)',
             bygroups(Generic.Heading, Whitespace)),
            # Double-slashed magic words
            (words(double_slashes_i, prefix=r'(?i)'), Name.Function.Magic),
            (words(double_slashes), Name.Function.Magic),
            # Raw URLs
            (r'(?i)\b(?:{}){}{}*'.format('|'.join(protocols),
             link_address, link_char_class), Name.Label),
            # Magic links
            (rf'\b(?:RFC|PMID){nbsp_char}+[0-9]+\b',
             Name.Function.Magic),
            (r"""(?x)
                \bISBN {nbsp_char}
                (?: 97[89] {nbsp_dash}? )?
                (?: [0-9] {nbsp_dash}? ){{9}} # escape format()
                [0-9Xx]\b
            """.format(nbsp_char=nbsp_char, nbsp_dash=f'(?:-|{nbsp_char})'), Name.Function.Magic),
            include('list'),
            include('inline'),
            include('text'),
        ],
        'redirect-inner': [
            (r'(\]\])(\s*?\n)', bygroups(Punctuation, Whitespace), '#pop'),
            (r'(\#)([^#]*?)', bygroups(Punctuation, Name.Label)),
            (rf'(?i)[{title_char}]+', Name.Tag),
        ],
        'list': [
            # Description lists
            (r'^;', Keyword, 'dt'),
            # Ordered lists, unordered lists and indents
            (r'^[#:*]+', Keyword),
            # Horizontal rules
            (r'^-{4,}', Keyword),
        ],
        'inline': [
            # Signatures
            (r'~{3,5}', Keyword),
            # Entities
            include('entity'),
            # Bold & italic
            (r"('')(''')(?!')", bygroups(Generic.Emph,
             Generic.EmphStrong), 'inline-italic-bold'),
            (r"'''(?!')", Generic.Strong, 'inline-bold'),
            (r"''(?!')", Generic.Emph, 'inline-italic'),
            # Comments & parameters & templates
            include('replaceable'),
            # Media links
            (
                r"""(?xi)
                (\[\[)
                    (File|Image) (:)
                    ((?: [{}] | \{{{{2,3}}[^{{}}]*?\}}{{2,3}} | <!--[\s\S]*?--> )*)
                    (?: (\#) ([{}]*?) )?
                """.format(title_char, f'{title_char}#'),
                bygroups(Punctuation, Name.Namespace,  Punctuation,
                         using(this, state=['wikilink-name']), Punctuation, Name.Label),
                'medialink-inner'
            ),
            # Wikilinks
            (
                r"""(?xi)
                (\[\[)(?!{}) # Should not contain URLs
                    (?: ([{}]*) (:))?
                    ((?: [{}] | \{{{{2,3}}[^{{}}]*?\}}{{2,3}} | <!--[\s\S]*?--> )*?)
                    (?: (\#) ([{}]*?) )?
                (\]\])
                """.format('|'.join(protocols), title_char.replace('/', ''),
                       title_char, f'{title_char}#'),
                bygroups(Punctuation, Name.Namespace,  Punctuation,
                         using(this, state=['wikilink-name']), Punctuation, Name.Label, Punctuation)
            ),
            (
                r"""(?xi)
                (\[\[)(?!{})
                    (?: ([{}]*) (:))?
                    ((?: [{}] | \{{{{2,3}}[^{{}}]*?\}}{{2,3}} | <!--[\s\S]*?--> )*?)
                    (?: (\#) ([{}]*?) )?
                    (\|)
                """.format('|'.join(protocols), title_char.replace('/', ''),
                       title_char, f'{title_char}#'),
                bygroups(Punctuation, Name.Namespace,  Punctuation,
                         using(this, state=['wikilink-name']), Punctuation, Name.Label, Punctuation),
                'wikilink-inner'
            ),
            # External links
            (
                r"""(?xi)
                (\[)
                    ((?:{}) {} {}*)
                    (\s*)
                """.format('|'.join(protocols), link_address, link_char_class),
                bygroups(Punctuation, Name.Label, Whitespace),
                'extlink-inner'
            ),
            # Tables
            (r'^(:*)(\s*?)(\{\|)([^\n]*)$', bygroups(Keyword,
             Whitespace, Punctuation, using(this, state=['root', 'attr'])), 'table'),
            # HTML tags
            (r'(?i)(<)({})\b'.format('|'.join(html_tags)),
             bygroups(Punctuation, Name.Tag), 'tag-inner-ordinary'),
            (r'(?i)(</)({})\b(\s*)(>)'.format('|'.join(html_tags)),
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
            # <nowiki>
            (r'(?i)(<)(nowiki)\b', bygroups(Punctuation,
             Name.Tag), ('tag-nowiki', 'tag-inner')),
            # <pre>
            (r'(?i)(<)(pre)\b', bygroups(Punctuation,
             Name.Tag), ('tag-pre', 'tag-inner')),
            # <categorytree>
            (r'(?i)(<)(categorytree)\b', bygroups(
                Punctuation, Name.Tag), ('tag-categorytree', 'tag-inner')),
            # <hiero>
            (r'(?i)(<)(hiero)\b', bygroups(Punctuation,
             Name.Tag), ('tag-hiero', 'tag-inner')),
            # <math>
            (r'(?i)(<)(math)\b', bygroups(Punctuation,
             Name.Tag), ('tag-math', 'tag-inner')),
            # <chem>
            (r'(?i)(<)(chem)\b', bygroups(Punctuation,
             Name.Tag), ('tag-chem', 'tag-inner')),
            # <ce>
            (r'(?i)(<)(ce)\b', bygroups(Punctuation,
             Name.Tag), ('tag-ce', 'tag-inner')),
            # <charinsert>
            (r'(?i)(<)(charinsert)\b', bygroups(
                Punctuation, Name.Tag), ('tag-charinsert', 'tag-inner')),
            # <templatedata>
            (r'(?i)(<)(templatedata)\b', bygroups(
                Punctuation, Name.Tag), ('tag-templatedata', 'tag-inner')),
            # <gallery>
            (r'(?i)(<)(gallery)\b', bygroups(
                Punctuation, Name.Tag), ('tag-gallery', 'tag-inner')),
            # <graph>
            (r'(?i)(<)(gallery)\b', bygroups(
                Punctuation, Name.Tag), ('tag-graph', 'tag-inner')),
            # <dynamicpagelist>
            (r'(?i)(<)(dynamicpagelist)\b', bygroups(
                Punctuation, Name.Tag), ('tag-dynamicpagelist', 'tag-inner')),
            # <inputbox>
            (r'(?i)(<)(inputbox)\b', bygroups(
                Punctuation, Name.Tag), ('tag-inputbox', 'tag-inner')),
            # <rss>
            (r'(?i)(<)(rss)\b', bygroups(
                Punctuation, Name.Tag), ('tag-rss', 'tag-inner')),
            # <imagemap>
            (r'(?i)(<)(imagemap)\b', bygroups(
                Punctuation, Name.Tag), ('tag-imagemap', 'tag-inner')),
            # <syntaxhighlight>
            (r'(?i)(</)(syntaxhighlight)\b(\s*)(>)',
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
            (r'(?si)(<)(syntaxhighlight)\b([^>]*?(?<!/)>.*?)(?=</\2\s*>)',
             bygroups(Punctuation, Name.Tag, handle_syntaxhighlight)),
            # <syntaxhighlight>: Fallback case for self-closing tags
            (r'(?i)(<)(syntaxhighlight)\b(\s*?)((?:[^>]|-->)*?)(/\s*?(?<!--)>)', bygroups(
                Punctuation, Name.Tag, Whitespace, using(this, state=['root', 'attr']), Punctuation)),
            # <source>
            (r'(?i)(</)(source)\b(\s*)(>)',
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
            (r'(?si)(<)(source)\b([^>]*?(?<!/)>.*?)(?=</\2\s*>)',
             bygroups(Punctuation, Name.Tag, handle_syntaxhighlight)),
            # <source>: Fallback case for self-closing tags
            (r'(?i)(<)(source)\b(\s*?)((?:[^>]|-->)*?)(/\s*?(?<!--)>)', bygroups(
                Punctuation, Name.Tag, Whitespace, using(this, state=['root', 'attr']), Punctuation)),
            # <score>
            (r'(?i)(</)(score)\b(\s*)(>)',
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
            (r'(?si)(<)(score)\b([^>]*?(?<!/)>.*?)(?=</\2\s*>)',
             bygroups(Punctuation, Name.Tag, handle_score)),
            # <score>: Fallback case for self-closing tags
            (r'(?i)(<)(score)\b(\s*?)((?:[^>]|-->)*?)(/\s*?(?<!--)>)', bygroups(
                Punctuation, Name.Tag, Whitespace, using(this, state=['root', 'attr']), Punctuation)),
            # Other parser tags
            (r'(?i)(<)({})\b'.format('|'.join(parser_tags)),
             bygroups(Punctuation, Name.Tag), 'tag-inner-ordinary'),
            (r'(?i)(</)({})\b(\s*)(>)'.format('|'.join(parser_tags)),
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
            # LanguageConverter markups
            (
                r"""(?xi)
                (-\{{) # Use {{ to escape format()
                    ([^|]) (\|)
                    (?:
                        (?: ([^;]*?) (=>))?
                        (\s* (?:{variants}) \s*) (:)
                    )?
                """.format(variants='|'.join(variant_langs)),
                bygroups(Punctuation, Keyword, Punctuation,
                         using(this, state=['root', 'lc-raw']),
                         Operator, Name.Label, Punctuation),
                'lc-inner'
            ),
            # LanguageConverter markups: composite conversion grammar
            (
                r"""(?xi)
                (-\{)
                    ([a-z\s;-]*?) (\|)
                """,
                bygroups(Punctuation,
                         using(this, state=['root', 'lc-flag']),
                         Punctuation),
                'lc-raw'
            ),
            # LanguageConverter markups: fallbacks
            (
                r"""(?xi)
                (-\{{) (?!\{{) # Use {{ to escape format()
                    (?: (\s* (?:{variants}) \s*) (:))?
                """.format(variants='|'.join(variant_langs)),
                bygroups(Punctuation, Name.Label, Punctuation),
                'lc-inner'
            ),
        ],
        'wikilink-name': [
            include('replaceable'),
            (r'[^{<]+', Name.Tag),
            (r'(?s).', Name.Tag),
        ],
        'wikilink-inner': [
            # Quit in case of another wikilink
            (r'(?=\[\[)', Punctuation, '#pop'),
            (r'\]\]', Punctuation, '#pop'),
            include('inline'),
            include('text'),
        ],
        'medialink-inner': [
            (r'\]\]', Punctuation, '#pop'),
            (r'(\|)([^\n=|]*)(=)',
             bygroups(Punctuation, Name.Attribute, Operator)),
            (r'\|', Punctuation),
            include('inline'),
            include('text'),
        ],
        'quote-common': [
            # Quit in case of link/template endings
            (r'(?=\]\]|\{\{|\}\})', Punctuation, '#pop'),
            (r'\n', Text, '#pop'),
        ],
        'inline-italic': [
            include('quote-common'),
            (r"('')(''')(?!')", bygroups(Generic.Emph,
             Generic.Strong), ('#pop', 'inline-bold')),
            (r"'''(?!')", Generic.EmphStrong, ('#pop', 'inline-italic-bold')),
            (r"''(?!')", Generic.Emph, '#pop'),
            include('inline'),
            include('text-italic'),
        ],
        'inline-bold': [
            include('quote-common'),
            (r"(''')('')(?!')", bygroups(
                Generic.Strong, Generic.Emph), ('#pop', 'inline-italic')),
            (r"'''(?!')", Generic.Strong, '#pop'),
            (r"''(?!')", Generic.EmphStrong, ('#pop', 'inline-bold-italic')),
            include('inline'),
            include('text-bold'),
        ],
        'inline-bold-italic': [
            include('quote-common'),
            (r"('')(''')(?!')", bygroups(Generic.EmphStrong,
             Generic.Strong), '#pop'),
            (r"'''(?!')", Generic.EmphStrong, ('#pop', 'inline-italic')),
            (r"''(?!')", Generic.EmphStrong, ('#pop', 'inline-bold')),
            include('inline'),
            include('text-bold-italic'),
        ],
        'inline-italic-bold': [
            include('quote-common'),
            (r"(''')('')(?!')", bygroups(
                Generic.EmphStrong, Generic.Emph), '#pop'),
            (r"'''(?!')", Generic.EmphStrong, ('#pop', 'inline-italic')),
            (r"''(?!')", Generic.EmphStrong, ('#pop', 'inline-bold')),
            include('inline'),
            include('text-bold-italic'),
        ],
        'lc-flag': [
            (r'\s+', Whitespace),
            (r';', Punctuation),
            *text_rules(Keyword),
        ],
        'lc-inner': [
            (
                r"""(?xi)
                (;)
                (?: ([^;]*?) (=>))?
                (\s* (?:{variants}) \s*) (:)
                """.format(variants='|'.join(variant_langs)),
                bygroups(Punctuation, using(this, state=['root', 'lc-raw']),
                         Operator, Name.Label, Punctuation)
            ),
            (r';?\s*?\}-', Punctuation, '#pop'),
            include('inline'),
            include('text'),
        ],
        'lc-raw': [
            (r'\}-', Punctuation, '#pop'),
            include('inline'),
            include('text'),
        ],
        'replaceable': [
            # Comments
            (r'<!--[\s\S]*?(?:-->|\Z)', Comment.Multiline),
            # Parameters
            (
                r"""(?x)
                (\{{3})
                    ([^|]*?)
                    (?=\}{3}|\|)
                """,
                bygroups(Punctuation, Name.Variable),
                'parameter-inner',
            ),
            # Magic variables
            (r'(?i)(\{{\{{)(\s*)({})(\s*)(\}}\}})'.format('|'.join(magic_vars_i)),
             bygroups(Punctuation, Whitespace, Name.Function, Whitespace, Punctuation)),
            (r'(\{{\{{)(\s*)({})(\s*)(\}}\}})'.format('|'.join(magic_vars)),
                bygroups(Punctuation, Whitespace, Name.Function, Whitespace, Punctuation)),
            # Parser functions & templates
            (r'\{\{', Punctuation, 'template-begin-space'),
            # <tvar> legacy syntax
            (r'(?i)(<)(tvar)\b(\|)([^>]*?)(>)', bygroups(Punctuation,
             Name.Tag, Punctuation, String, Punctuation)),
            (r'</>', Punctuation, '#pop'),
            # <tvar>
            (r'(?i)(<)(tvar)\b', bygroups(Punctuation, Name.Tag), 'tag-inner-ordinary'),
            (r'(?i)(</)(tvar)\b(\s*)(>)',
             bygroups(Punctuation, Name.Tag, Whitespace, Punctuation)),
        ],
        'parameter-inner': [
            (r'\}{3}', Punctuation, '#pop'),
            (r'\|', Punctuation),
            include('inline'),
            include('text'),
        ],
        'template-begin-space': [
            # Templates allow line breaks at the beginning, and due to how MediaWiki handles
            # comments, an extra state is required to handle things like {{\n<!---->\n name}}
            (r'<!--[\s\S]*?(?:-->|\Z)', Comment.Multiline),
            (r'\s+', Whitespace),
            # Parser functions
            (
                r'(?i)(\#[{}]*?|{})(:)'.format(title_char,
                                           '|'.join(parser_functions_i)),
                bygroups(Name.Function, Punctuation), ('#pop', 'template-inner')
            ),
            (
                r'({})(:)'.format('|'.join(parser_functions)),
                bygroups(Name.Function, Punctuation), ('#pop', 'template-inner')
            ),
            # Templates
            (
                rf'(?i)([{title_char}]*?)(:)',
                bygroups(Name.Namespace, Punctuation), ('#pop', 'template-name')
            ),
            default(('#pop', 'template-name'),),
        ],
        'template-name': [
            (r'(\s*?)(\|)', bygroups(Text, Punctuation), ('#pop', 'template-inner')),
            (r'\}\}', Punctuation, '#pop'),
            (r'\n', Text, '#pop'),
            include('replaceable'),
            *text_rules(Name.Tag),
        ],
        'template-inner': [
            (r'\}\}', Punctuation, '#pop'),
            (r'\|', Punctuation),
            (
                r"""(?x)
                    (?<=\|)
                    ( (?: (?! \{\{ | \}\} )[^=\|<])*? ) # Exclude templates and tags
                    (=)
                """,
                bygroups(Name.Label, Operator)
            ),
            include('inline'),
            include('text'),
        ],
        'table': [
            # Use [ \t\n\r\0\x0B] instead of \s to follow PHP trim() behavior
            # Endings
            (r'^([ \t\n\r\0\x0B]*?)(\|\})',
             bygroups(Whitespace, Punctuation), '#pop'),
            # Table rows
            (r'^([ \t\n\r\0\x0B]*?)(\|-+)(.*)$', bygroups(Whitespace, Punctuation,
             using(this, state=['root', 'attr']))),
            # Captions
            (
                r"""(?x)
                ^([ \t\n\r\0\x0B]*?)(\|\+)
                # Exclude links, template and tags
                (?: ( (?: (?! \[\[ | \{\{ )[^|\n<] )*? )(\|) )?
                (.*?)$
                """,
                bygroups(Whitespace, Punctuation, using(this, state=[
                         'root', 'attr']), Punctuation, Generic.Heading),
            ),
            # Table data
            (
                r"""(?x)
                ( ^(?:[ \t\n\r\0\x0B]*?)\| | \|\| )
                (?: ( (?: (?! \[\[ | \{\{ )[^|\n<] )*? )(\|)(?!\|) )?
                """,
                bygroups(Punctuation, using(this, state=[
                         'root', 'attr']), Punctuation),
            ),
            # Table headers
            (
                r"""(?x)
                ( ^(?:[ \t\n\r\0\x0B]*?)!  )
                (?: ( (?: (?! \[\[ | \{\{ )[^|\n<] )*? )(\|)(?!\|) )?
                """,
                bygroups(Punctuation, using(this, state=[
                         'root', 'attr']), Punctuation),
                'table-header',
            ),
            include('list'),
            include('inline'),
            include('text'),
        ],
        'table-header': [
            # Requires another state for || handling inside headers
            (r'\n', Text, '#pop'),
            (
                r"""(?x)
                (!!|\|\|)
                (?:
                    ( (?: (?! \[\[ | \{\{ )[^|\n<] )*? )
                    (\|)(?!\|)
                )?
                """,
                bygroups(Punctuation, using(this, state=[
                         'root', 'attr']), Punctuation)
            ),
            *text_rules(Generic.Subheading),
        ],
        'entity': [
            (r'&\S*?;', Name.Entity),
        ],
        'dt': [
            (r'\n', Text, '#pop'),
            include('inline'),
            (r':', Keyword, '#pop'),
            include('text'),
        ],
        'extlink-inner': [
            (r'\]', Punctuation, '#pop'),
            include('inline'),
            include('text'),
        ],
        'nowiki-ish': [
            include('entity'),
            include('text'),
        ],
        'attr': [
            include('replaceable'),
            (r'\s+', Whitespace),
            (r'(=)(\s*)(")', bygroups(Operator, Whitespace, String.Double), 'attr-val-2'),
            (r"(=)(\s*)(')", bygroups(Operator, Whitespace, String.Single), 'attr-val-1'),
            (r'(=)(\s*)', bygroups(Operator, Whitespace), 'attr-val-0'),
            (r'[\w:-]+', Name.Attribute),

        ],
        'attr-val-0': [
            (r'\s', Whitespace, '#pop'),
            include('replaceable'),
            *text_rules(String),
        ],
        'attr-val-1': [
            (r"'", String.Single, '#pop'),
            include('replaceable'),
            *text_rules(String.Single),
        ],
        'attr-val-2': [
            (r'"', String.Double, '#pop'),
            include('replaceable'),
            *text_rules(String.Double),
        ],
        'tag-inner-ordinary': [
            (r'/?\s*>', Punctuation, '#pop'),
            include('tag-attr'),
        ],
        'tag-inner': [
            # Return to root state for self-closing tags
            (r'/\s*>', Punctuation, '#pop:2'),
            (r'\s*>', Punctuation, '#pop'),
            include('tag-attr'),
        ],
        # There states below are just like their non-tag variants, the key difference is
        # they forcibly quit when encountering tag closing markup
        'tag-attr': [
            include('replaceable'),
            (r'\s+', Whitespace),
            (r'(=)(\s*)(")', bygroups(Operator,
             Whitespace, String.Double), 'tag-attr-val-2'),
            (r"(=)(\s*)(')", bygroups(Operator,
             Whitespace, String.Single), 'tag-attr-val-1'),
            (r'(=)(\s*)', bygroups(Operator, Whitespace), 'tag-attr-val-0'),
            (r'[\w:-]+', Name.Attribute),

        ],
        'tag-attr-val-0': [
            (r'\s', Whitespace, '#pop'),
            (r'/?>', Punctuation, '#pop:2'),
            include('replaceable'),
            *text_rules(String),
        ],
        'tag-attr-val-1': [
            (r"'", String.Single, '#pop'),
            (r'/?>', Punctuation, '#pop:2'),
            include('replaceable'),
            *text_rules(String.Single),
        ],
        'tag-attr-val-2': [
            (r'"', String.Double, '#pop'),
            (r'/?>', Punctuation, '#pop:2'),
            include('replaceable'),
            *text_rules(String.Double),
        ],
        'tag-nowiki': nowiki_tag_rules('nowiki'),
        'tag-pre': nowiki_tag_rules('pre'),
        'tag-categorytree': plaintext_tag_rules('categorytree'),
        'tag-dynamicpagelist': plaintext_tag_rules('dynamicpagelist'),
        'tag-hiero': plaintext_tag_rules('hiero'),
        'tag-inputbox': plaintext_tag_rules('inputbox'),
        'tag-imagemap': plaintext_tag_rules('imagemap'),
        'tag-charinsert': plaintext_tag_rules('charinsert'),
        'tag-timeline': plaintext_tag_rules('timeline'),
        'tag-gallery': plaintext_tag_rules('gallery'),
        'tag-graph': plaintext_tag_rules('graph'),
        'tag-rss': plaintext_tag_rules('rss'),
        'tag-math': delegate_tag_rules('math', TexLexer, state='math'),
        'tag-chem': delegate_tag_rules('chem', TexLexer, state='math'),
        'tag-ce': delegate_tag_rules('ce', TexLexer, state='math'),
        'tag-templatedata': delegate_tag_rules('templatedata', JsonLexer),
        'text-italic': text_rules(Generic.Emph),
        'text-bold': text_rules(Generic.Strong),
        'text-bold-italic': text_rules(Generic.EmphStrong),
        'text': text_rules(Text),
    }
