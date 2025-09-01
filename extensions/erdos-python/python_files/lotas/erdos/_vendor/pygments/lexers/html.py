"""
    pygments.lexers.html
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for HTML, XML and related markup.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, ExtendedRegexLexer, include, bygroups, \
    default, using, inherit, this
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Punctuation, Whitespace
from erdos._vendor.pygments.util import looks_like_xml, html_doctype_matches

from erdos._vendor.pygments.lexers.javascript import JavascriptLexer
from erdos._vendor.pygments.lexers.jvm import ScalaLexer
from erdos._vendor.pygments.lexers.css import CssLexer, _indentation, _starts_block
from erdos._vendor.pygments.lexers.ruby import RubyLexer

__all__ = ['HtmlLexer', 'DtdLexer', 'XmlLexer', 'XsltLexer', 'HamlLexer',
           'ScamlLexer', 'PugLexer', 'VueLexer', 'UrlEncodedLexer']


class HtmlLexer(RegexLexer):
    """
    For HTML 4 and XHTML 1 markup. Nested JavaScript and CSS is highlighted
    by the appropriate lexer.
    """

    name = 'HTML'
    url = 'https://html.spec.whatwg.org/'
    aliases = ['html']
    filenames = ['*.html', '*.htm', '*.xhtml', '*.xslt']
    mimetypes = ['text/html', 'application/xhtml+xml']
    version_added = ''

    flags = re.IGNORECASE | re.DOTALL
    tokens = {
        'root': [
            ('[^<&]+', Text),
            (r'&\S*?;', Name.Entity),
            (r'\<\!\[CDATA\[.*?\]\]\>', Comment.Preproc),
            (r'<!--.*?-->', Comment.Multiline),
            (r'<\?.*?\?>', Comment.Preproc),
            ('<![^>]*>', Comment.Preproc),
            (r'(<)(\s*)(script)(\s*)',
             bygroups(Punctuation, Text, Name.Tag, Text),
             ('script-content', 'tag')),
            (r'(<)(\s*)(style)(\s*)',
             bygroups(Punctuation, Text, Name.Tag, Text),
             ('style-content', 'tag')),
            # note: this allows tag names not used in HTML like <x:with-dash>,
            # this is to support yet-unknown template engines and the like
            (r'(<)(\s*)([\w:.-]+)',
             bygroups(Punctuation, Text, Name.Tag), 'tag'),
            (r'(<)(\s*)(/)(\s*)([\w:.-]+)(\s*)(>)',
             bygroups(Punctuation, Text, Punctuation, Text, Name.Tag, Text,
                      Punctuation)),
        ],
        'tag': [
            (r'\s+', Text),
            (r'([\w:-]+\s*)(=)(\s*)', bygroups(Name.Attribute, Operator, Text),
             'attr'),
            (r'[\w:-]+', Name.Attribute),
            (r'(/?)(\s*)(>)', bygroups(Punctuation, Text, Punctuation), '#pop'),
        ],
        'script-content': [
            (r'(<)(\s*)(/)(\s*)(script)(\s*)(>)',
             bygroups(Punctuation, Text, Punctuation, Text, Name.Tag, Text,
                      Punctuation), '#pop'),
            (r'.+?(?=<\s*/\s*script\s*>)', using(JavascriptLexer)),
            # fallback cases for when there is no closing script tag
            # first look for newline and then go back into root state
            # if that fails just read the rest of the file
            # this is similar to the error handling logic in lexer.py
            (r'.+?\n', using(JavascriptLexer), '#pop'),
            (r'.+', using(JavascriptLexer), '#pop'),
        ],
        'style-content': [
            (r'(<)(\s*)(/)(\s*)(style)(\s*)(>)',
             bygroups(Punctuation, Text, Punctuation, Text, Name.Tag, Text,
                      Punctuation),'#pop'),
            (r'.+?(?=<\s*/\s*style\s*>)', using(CssLexer)),
            # fallback cases for when there is no closing style tag
            # first look for newline and then go back into root state
            # if that fails just read the rest of the file
            # this is similar to the error handling logic in lexer.py
            (r'.+?\n', using(CssLexer), '#pop'),
            (r'.+', using(CssLexer), '#pop'),
        ],
        'attr': [
            ('".*?"', String, '#pop'),
            ("'.*?'", String, '#pop'),
            (r'[^\s>]+', String, '#pop'),
        ],
    }

    def analyse_text(text):
        if html_doctype_matches(text):
            return 0.5


class DtdLexer(RegexLexer):
    """
    A lexer for DTDs (Document Type Definitions).
    """

    flags = re.MULTILINE | re.DOTALL

    name = 'DTD'
    aliases = ['dtd']
    filenames = ['*.dtd']
    mimetypes = ['application/xml-dtd']
    url = 'https://en.wikipedia.org/wiki/Document_type_definition'
    version_added = '1.5'

    tokens = {
        'root': [
            include('common'),

            (r'(<!ELEMENT)(\s+)(\S+)',
                bygroups(Keyword, Text, Name.Tag), 'element'),
            (r'(<!ATTLIST)(\s+)(\S+)',
                bygroups(Keyword, Text, Name.Tag), 'attlist'),
            (r'(<!ENTITY)(\s+)(\S+)',
                bygroups(Keyword, Text, Name.Entity), 'entity'),
            (r'(<!NOTATION)(\s+)(\S+)',
                bygroups(Keyword, Text, Name.Tag), 'notation'),
            (r'(<!\[)([^\[\s]+)(\s*)(\[)',  # conditional sections
                bygroups(Keyword, Name.Entity, Text, Keyword)),

            (r'(<!DOCTYPE)(\s+)([^>\s]+)',
                bygroups(Keyword, Text, Name.Tag)),
            (r'PUBLIC|SYSTEM', Keyword.Constant),
            (r'[\[\]>]', Keyword),
        ],

        'common': [
            (r'\s+', Text),
            (r'(%|&)[^;]*;', Name.Entity),
            ('<!--', Comment, 'comment'),
            (r'[(|)*,?+]', Operator),
            (r'"[^"]*"', String.Double),
            (r'\'[^\']*\'', String.Single),
        ],

        'comment': [
            ('[^-]+', Comment),
            ('-->', Comment, '#pop'),
            ('-', Comment),
        ],

        'element': [
            include('common'),
            (r'EMPTY|ANY|#PCDATA', Keyword.Constant),
            (r'[^>\s|()?+*,]+', Name.Tag),
            (r'>', Keyword, '#pop'),
        ],

        'attlist': [
            include('common'),
            (r'CDATA|IDREFS|IDREF|ID|NMTOKENS|NMTOKEN|ENTITIES|ENTITY|NOTATION',
             Keyword.Constant),
            (r'#REQUIRED|#IMPLIED|#FIXED', Keyword.Constant),
            (r'xml:space|xml:lang', Keyword.Reserved),
            (r'[^>\s|()?+*,]+', Name.Attribute),
            (r'>', Keyword, '#pop'),
        ],

        'entity': [
            include('common'),
            (r'SYSTEM|PUBLIC|NDATA', Keyword.Constant),
            (r'[^>\s|()?+*,]+', Name.Entity),
            (r'>', Keyword, '#pop'),
        ],

        'notation': [
            include('common'),
            (r'SYSTEM|PUBLIC', Keyword.Constant),
            (r'[^>\s|()?+*,]+', Name.Attribute),
            (r'>', Keyword, '#pop'),
        ],
    }

    def analyse_text(text):
        if not looks_like_xml(text) and \
           ('<!ELEMENT' in text or '<!ATTLIST' in text or '<!ENTITY' in text):
            return 0.8


class XmlLexer(RegexLexer):
    """
    Generic lexer for XML (eXtensible Markup Language).
    """

    flags = re.MULTILINE | re.DOTALL

    name = 'XML'
    aliases = ['xml']
    filenames = ['*.xml', '*.xsl', '*.rss', '*.xslt', '*.xsd',
                 '*.wsdl', '*.wsf']
    mimetypes = ['text/xml', 'application/xml', 'image/svg+xml',
                 'application/rss+xml', 'application/atom+xml']
    url = 'https://www.w3.org/XML'
    version_added = ''

    tokens = {
        'root': [
            (r'[^<&\s]+', Text),
            (r'[^<&\S]+', Whitespace),
            (r'&\S*?;', Name.Entity),
            (r'\<\!\[CDATA\[.*?\]\]\>', Comment.Preproc),
            (r'<!--.*?-->', Comment.Multiline),
            (r'<\?.*?\?>', Comment.Preproc),
            ('<![^>]*>', Comment.Preproc),
            (r'<\s*[\w:.-]+', Name.Tag, 'tag'),
            (r'<\s*/\s*[\w:.-]+\s*>', Name.Tag),
        ],
        'tag': [
            (r'\s+', Whitespace),
            (r'[\w.:-]+\s*=', Name.Attribute, 'attr'),
            (r'/?\s*>', Name.Tag, '#pop'),
        ],
        'attr': [
            (r'\s+', Whitespace),
            ('".*?"', String, '#pop'),
            ("'.*?'", String, '#pop'),
            (r'[^\s>]+', String, '#pop'),
        ],
    }

    def analyse_text(text):
        if looks_like_xml(text):
            return 0.45  # less than HTML


class XsltLexer(XmlLexer):
    """
    A lexer for XSLT.
    """

    name = 'XSLT'
    aliases = ['xslt']
    filenames = ['*.xsl', '*.xslt', '*.xpl']  # xpl is XProc
    mimetypes = ['application/xsl+xml', 'application/xslt+xml']
    url = 'https://www.w3.org/TR/xslt-30'
    version_added = '0.10'

    EXTRA_KEYWORDS = {
        'apply-imports', 'apply-templates', 'attribute',
        'attribute-set', 'call-template', 'choose', 'comment',
        'copy', 'copy-of', 'decimal-format', 'element', 'fallback',
        'for-each', 'if', 'import', 'include', 'key', 'message',
        'namespace-alias', 'number', 'otherwise', 'output', 'param',
        'preserve-space', 'processing-instruction', 'sort',
        'strip-space', 'stylesheet', 'template', 'text', 'transform',
        'value-of', 'variable', 'when', 'with-param'
    }

    def get_tokens_unprocessed(self, text):
        for index, token, value in XmlLexer.get_tokens_unprocessed(self, text):
            m = re.match('</?xsl:([^>]*)/?>?', value)

            if token is Name.Tag and m and m.group(1) in self.EXTRA_KEYWORDS:
                yield index, Keyword, value
            else:
                yield index, token, value

    def analyse_text(text):
        if looks_like_xml(text) and '<xsl' in text:
            return 0.8


class HamlLexer(ExtendedRegexLexer):
    """
    For Haml markup.
    """

    name = 'Haml'
    aliases = ['haml']
    filenames = ['*.haml']
    mimetypes = ['text/x-haml']
    url = 'https://haml.info'
    version_added = '1.3'

    flags = re.IGNORECASE
    # Haml can include " |\n" anywhere,
    # which is ignored and used to wrap long lines.
    # To accommodate this, use this custom faux dot instead.
    _dot = r'(?: \|\n(?=.* \|)|.)'

    # In certain places, a comma at the end of the line
    # allows line wrapping as well.
    _comma_dot = r'(?:,\s*\n|' + _dot + ')'
    tokens = {
        'root': [
            (r'[ \t]*\n', Text),
            (r'[ \t]*', _indentation),
        ],

        'css': [
            (r'\.[\w:-]+', Name.Class, 'tag'),
            (r'\#[\w:-]+', Name.Function, 'tag'),
        ],

        'eval-or-plain': [
            (r'[&!]?==', Punctuation, 'plain'),
            (r'([&!]?[=~])(' + _comma_dot + r'*\n)',
             bygroups(Punctuation, using(RubyLexer)),
             'root'),
            default('plain'),
        ],

        'content': [
            include('css'),
            (r'%[\w:-]+', Name.Tag, 'tag'),
            (r'!!!' + _dot + r'*\n', Name.Namespace, '#pop'),
            (r'(/)(\[' + _dot + r'*?\])(' + _dot + r'*\n)',
             bygroups(Comment, Comment.Special, Comment),
             '#pop'),
            (r'/' + _dot + r'*\n', _starts_block(Comment, 'html-comment-block'),
             '#pop'),
            (r'-#' + _dot + r'*\n', _starts_block(Comment.Preproc,
                                                  'haml-comment-block'), '#pop'),
            (r'(-)(' + _comma_dot + r'*\n)',
             bygroups(Punctuation, using(RubyLexer)),
             '#pop'),
            (r':' + _dot + r'*\n', _starts_block(Name.Decorator, 'filter-block'),
             '#pop'),
            include('eval-or-plain'),
        ],

        'tag': [
            include('css'),
            (r'\{(,\n|' + _dot + r')*?\}', using(RubyLexer)),
            (r'\[' + _dot + r'*?\]', using(RubyLexer)),
            (r'\(', Text, 'html-attributes'),
            (r'/[ \t]*\n', Punctuation, '#pop:2'),
            (r'[<>]{1,2}(?=[ \t=])', Punctuation),
            include('eval-or-plain'),
        ],

        'plain': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Text),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(RubyLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],

        'html-attributes': [
            (r'\s+', Text),
            (r'[\w:-]+[ \t]*=', Name.Attribute, 'html-attribute-value'),
            (r'[\w:-]+', Name.Attribute),
            (r'\)', Text, '#pop'),
        ],

        'html-attribute-value': [
            (r'[ \t]+', Text),
            (r'\w+', Name.Variable, '#pop'),
            (r'@\w+', Name.Variable.Instance, '#pop'),
            (r'\$\w+', Name.Variable.Global, '#pop'),
            (r"'(\\\\|\\[^\\]|[^'\\\n])*'", String, '#pop'),
            (r'"(\\\\|\\[^\\]|[^"\\\n])*"', String, '#pop'),
        ],

        'html-comment-block': [
            (_dot + '+', Comment),
            (r'\n', Text, 'root'),
        ],

        'haml-comment-block': [
            (_dot + '+', Comment.Preproc),
            (r'\n', Text, 'root'),
        ],

        'filter-block': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Name.Decorator),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(RubyLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],
    }


class ScamlLexer(ExtendedRegexLexer):
    """
    For Scaml markup.  Scaml is Haml for Scala.
    """

    name = 'Scaml'
    aliases = ['scaml']
    filenames = ['*.scaml']
    mimetypes = ['text/x-scaml']
    url = 'https://scalate.github.io/scalate/'
    version_added = '1.4'

    flags = re.IGNORECASE
    # Scaml does not yet support the " |\n" notation to
    # wrap long lines.  Once it does, use the custom faux
    # dot instead.
    # _dot = r'(?: \|\n(?=.* \|)|.)'
    _dot = r'.'

    tokens = {
        'root': [
            (r'[ \t]*\n', Text),
            (r'[ \t]*', _indentation),
        ],

        'css': [
            (r'\.[\w:-]+', Name.Class, 'tag'),
            (r'\#[\w:-]+', Name.Function, 'tag'),
        ],

        'eval-or-plain': [
            (r'[&!]?==', Punctuation, 'plain'),
            (r'([&!]?[=~])(' + _dot + r'*\n)',
             bygroups(Punctuation, using(ScalaLexer)),
             'root'),
            default('plain'),
        ],

        'content': [
            include('css'),
            (r'%[\w:-]+', Name.Tag, 'tag'),
            (r'!!!' + _dot + r'*\n', Name.Namespace, '#pop'),
            (r'(/)(\[' + _dot + r'*?\])(' + _dot + r'*\n)',
             bygroups(Comment, Comment.Special, Comment),
             '#pop'),
            (r'/' + _dot + r'*\n', _starts_block(Comment, 'html-comment-block'),
             '#pop'),
            (r'-#' + _dot + r'*\n', _starts_block(Comment.Preproc,
                                                  'scaml-comment-block'), '#pop'),
            (r'(-@\s*)(import)?(' + _dot + r'*\n)',
             bygroups(Punctuation, Keyword, using(ScalaLexer)),
             '#pop'),
            (r'(-)(' + _dot + r'*\n)',
             bygroups(Punctuation, using(ScalaLexer)),
             '#pop'),
            (r':' + _dot + r'*\n', _starts_block(Name.Decorator, 'filter-block'),
             '#pop'),
            include('eval-or-plain'),
        ],

        'tag': [
            include('css'),
            (r'\{(,\n|' + _dot + r')*?\}', using(ScalaLexer)),
            (r'\[' + _dot + r'*?\]', using(ScalaLexer)),
            (r'\(', Text, 'html-attributes'),
            (r'/[ \t]*\n', Punctuation, '#pop:2'),
            (r'[<>]{1,2}(?=[ \t=])', Punctuation),
            include('eval-or-plain'),
        ],

        'plain': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Text),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(ScalaLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],

        'html-attributes': [
            (r'\s+', Text),
            (r'[\w:-]+[ \t]*=', Name.Attribute, 'html-attribute-value'),
            (r'[\w:-]+', Name.Attribute),
            (r'\)', Text, '#pop'),
        ],

        'html-attribute-value': [
            (r'[ \t]+', Text),
            (r'\w+', Name.Variable, '#pop'),
            (r'@\w+', Name.Variable.Instance, '#pop'),
            (r'\$\w+', Name.Variable.Global, '#pop'),
            (r"'(\\\\|\\[^\\]|[^'\\\n])*'", String, '#pop'),
            (r'"(\\\\|\\[^\\]|[^"\\\n])*"', String, '#pop'),
        ],

        'html-comment-block': [
            (_dot + '+', Comment),
            (r'\n', Text, 'root'),
        ],

        'scaml-comment-block': [
            (_dot + '+', Comment.Preproc),
            (r'\n', Text, 'root'),
        ],

        'filter-block': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Name.Decorator),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(ScalaLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],
    }


class PugLexer(ExtendedRegexLexer):
    """
    For Pug markup.
    Pug is a variant of Scaml, see:
    http://scalate.fusesource.org/documentation/scaml-reference.html
    """

    name = 'Pug'
    aliases = ['pug', 'jade']
    filenames = ['*.pug', '*.jade']
    mimetypes = ['text/x-pug', 'text/x-jade']
    url = 'https://pugjs.org'
    version_added = '1.4'

    flags = re.IGNORECASE
    _dot = r'.'

    tokens = {
        'root': [
            (r'[ \t]*\n', Text),
            (r'[ \t]*', _indentation),
        ],

        'css': [
            (r'\.[\w:-]+', Name.Class, 'tag'),
            (r'\#[\w:-]+', Name.Function, 'tag'),
        ],

        'eval-or-plain': [
            (r'[&!]?==', Punctuation, 'plain'),
            (r'([&!]?[=~])(' + _dot + r'*\n)',
             bygroups(Punctuation, using(ScalaLexer)),  'root'),
            default('plain'),
        ],

        'content': [
            include('css'),
            (r'!!!' + _dot + r'*\n', Name.Namespace, '#pop'),
            (r'(/)(\[' + _dot + r'*?\])(' + _dot + r'*\n)',
             bygroups(Comment, Comment.Special, Comment),
             '#pop'),
            (r'/' + _dot + r'*\n', _starts_block(Comment, 'html-comment-block'),
             '#pop'),
            (r'-#' + _dot + r'*\n', _starts_block(Comment.Preproc,
                                                  'scaml-comment-block'), '#pop'),
            (r'(-@\s*)(import)?(' + _dot + r'*\n)',
             bygroups(Punctuation, Keyword, using(ScalaLexer)),
             '#pop'),
            (r'(-)(' + _dot + r'*\n)',
             bygroups(Punctuation, using(ScalaLexer)),
             '#pop'),
            (r':' + _dot + r'*\n', _starts_block(Name.Decorator, 'filter-block'),
             '#pop'),
            (r'[\w:-]+', Name.Tag, 'tag'),
            (r'\|', Text, 'eval-or-plain'),
        ],

        'tag': [
            include('css'),
            (r'\{(,\n|' + _dot + r')*?\}', using(ScalaLexer)),
            (r'\[' + _dot + r'*?\]', using(ScalaLexer)),
            (r'\(', Text, 'html-attributes'),
            (r'/[ \t]*\n', Punctuation, '#pop:2'),
            (r'[<>]{1,2}(?=[ \t=])', Punctuation),
            include('eval-or-plain'),
        ],

        'plain': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Text),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(ScalaLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],

        'html-attributes': [
            (r'\s+', Text),
            (r'[\w:-]+[ \t]*=', Name.Attribute, 'html-attribute-value'),
            (r'[\w:-]+', Name.Attribute),
            (r'\)', Text, '#pop'),
        ],

        'html-attribute-value': [
            (r'[ \t]+', Text),
            (r'\w+', Name.Variable, '#pop'),
            (r'@\w+', Name.Variable.Instance, '#pop'),
            (r'\$\w+', Name.Variable.Global, '#pop'),
            (r"'(\\\\|\\[^\\]|[^'\\\n])*'", String, '#pop'),
            (r'"(\\\\|\\[^\\]|[^"\\\n])*"', String, '#pop'),
        ],

        'html-comment-block': [
            (_dot + '+', Comment),
            (r'\n', Text, 'root'),
        ],

        'scaml-comment-block': [
            (_dot + '+', Comment.Preproc),
            (r'\n', Text, 'root'),
        ],

        'filter-block': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Name.Decorator),
            (r'(#\{)(' + _dot + r'*?)(\})',
             bygroups(String.Interpol, using(ScalaLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],
    }
JadeLexer = PugLexer  # compat


class UrlEncodedLexer(RegexLexer):
    """
    Lexer for urlencoded data
    """

    name = 'urlencoded'
    aliases = ['urlencoded']
    mimetypes = ['application/x-www-form-urlencoded']
    url = 'https://en.wikipedia.org/wiki/Percent-encoding'
    version_added = '2.16'

    tokens = {
        'root': [
            ('([^&=]*)(=)([^=&]*)(&?)', bygroups(Name.Tag, Operator, String, Punctuation)),
        ],
    }
    

class VueLexer(HtmlLexer):
    """
    For Vue Single-File Component.
    """

    name = 'Vue'
    url = 'https://vuejs.org/api/sfc-spec.html'
    aliases = ['vue']
    filenames = ['*.vue']
    mimetypes = []
    version_added = '2.19'

    flags = re.IGNORECASE | re.DOTALL
    tokens = {
        'root': [
            (r'(\{\{)(.*?)(\}\})', bygroups(Comment.Preproc,
             using(JavascriptLexer), Comment.Preproc)),
            ('[^<&{]+', Text),
            inherit,
        ],
        'tag': [
            (r'\s+', Text),
            (r'((?:[@:]|v-)(?:[.\w:-]|\[[^\]]*?\])+\s*)(=)(\s*)',
             bygroups(using(this, state=['name']), Operator, Text),
             'attr-directive'),
            (r'([\w:-]+\s*)(=)(\s*)', bygroups(Name.Attribute, Operator, Text),
             'attr'),
            (r'[\w:-]+', Name.Attribute),
            (r'(/?)(\s*)(>)', bygroups(Punctuation, Text, Punctuation), '#pop'),
        ],
        'name': [
            (r'[\w-]+', Name.Attribute),
            (r'[:@.]', Punctuation),
            (r'(\[)([^\]]*?)(\])', bygroups(Comment.Preproc,
             using(JavascriptLexer), Comment.Preproc)),
        ],
        'attr-directive': [
            (r'(["\'])(.*?)(\1)', bygroups(String,
             using(JavascriptLexer), String), '#pop'),
            (r'[^\s>]+', using(JavascriptLexer), '#pop'),
        ],
    }
