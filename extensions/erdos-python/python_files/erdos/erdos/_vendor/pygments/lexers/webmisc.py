"""
    pygments.lexers.webmisc
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for misc. web stuff.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, ExtendedRegexLexer, include, bygroups, \
    default, using
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Literal, Whitespace

from erdos.erdos._vendor.pygments.lexers.css import _indentation, _starts_block
from erdos.erdos._vendor.pygments.lexers.html import HtmlLexer
from erdos.erdos._vendor.pygments.lexers.javascript import JavascriptLexer
from erdos.erdos._vendor.pygments.lexers.ruby import RubyLexer

__all__ = ['DuelLexer', 'SlimLexer', 'XQueryLexer', 'QmlLexer', 'CirruLexer']


class DuelLexer(RegexLexer):
    """
    Lexer for Duel Views Engine (formerly JBST) markup with JavaScript code blocks.
    """

    name = 'Duel'
    url = 'http://duelengine.org/'
    aliases = ['duel', 'jbst', 'jsonml+bst']
    filenames = ['*.duel', '*.jbst']
    mimetypes = ['text/x-duel', 'text/x-jbst']
    version_added = '1.4'

    flags = re.DOTALL

    tokens = {
        'root': [
            (r'(<%[@=#!:]?)(.*?)(%>)',
             bygroups(Name.Tag, using(JavascriptLexer), Name.Tag)),
            (r'(<%\$)(.*?)(:)(.*?)(%>)',
             bygroups(Name.Tag, Name.Function, Punctuation, String, Name.Tag)),
            (r'(<%--)(.*?)(--%>)',
             bygroups(Name.Tag, Comment.Multiline, Name.Tag)),
            (r'(<script.*?>)(.*?)(</script>)',
             bygroups(using(HtmlLexer),
                      using(JavascriptLexer), using(HtmlLexer))),
            (r'(.+?)(?=<)', using(HtmlLexer)),
            (r'.+', using(HtmlLexer)),
        ],
    }


class XQueryLexer(ExtendedRegexLexer):
    """
    An XQuery lexer, parsing a stream and outputting the tokens needed to
    highlight xquery code.
    """
    name = 'XQuery'
    url = 'https://www.w3.org/XML/Query/'
    aliases = ['xquery', 'xqy', 'xq', 'xql', 'xqm']
    filenames = ['*.xqy', '*.xquery', '*.xq', '*.xql', '*.xqm']
    mimetypes = ['text/xquery', 'application/xquery']
    version_added = '1.4'

    xquery_parse_state = []

    # FIX UNICODE LATER
    # ncnamestartchar = (
    #    r"[A-Z]|_|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|"
    #    r"[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|"
    #    r"[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|"
    #    r"[\u10000-\uEFFFF]"
    # )
    ncnamestartchar = r"(?:[A-Z]|_|[a-z])"
    # FIX UNICODE LATER
    # ncnamechar = ncnamestartchar + (r"|-|\.|[0-9]|\u00B7|[\u0300-\u036F]|"
    #                                 r"[\u203F-\u2040]")
    ncnamechar = r"(?:" + ncnamestartchar + r"|-|\.|[0-9])"
    ncname = f"(?:{ncnamestartchar}+{ncnamechar}*)"
    pitarget_namestartchar = r"(?:[A-KN-WYZ]|_|:|[a-kn-wyz])"
    pitarget_namechar = r"(?:" + pitarget_namestartchar + r"|-|\.|[0-9])"
    pitarget = f"{pitarget_namestartchar}+{pitarget_namechar}*"
    prefixedname = f"{ncname}:{ncname}"
    unprefixedname = ncname
    qname = f"(?:{prefixedname}|{unprefixedname})"

    entityref = r'(?:&(?:lt|gt|amp|quot|apos|nbsp);)'
    charref = r'(?:&#[0-9]+;|&#x[0-9a-fA-F]+;)'

    stringdouble = r'(?:"(?:' + entityref + r'|' + charref + r'|""|[^&"])*")'
    stringsingle = r"(?:'(?:" + entityref + r"|" + charref + r"|''|[^&'])*')"

    # FIX UNICODE LATER
    # elementcontentchar = (r'\t|\r|\n|[\u0020-\u0025]|[\u0028-\u003b]|'
    #                       r'[\u003d-\u007a]|\u007c|[\u007e-\u007F]')
    elementcontentchar = r'[A-Za-z]|\s|\d|[!"#$%()*+,\-./:;=?@\[\\\]^_\'`|~]'
    # quotattrcontentchar = (r'\t|\r|\n|[\u0020-\u0021]|[\u0023-\u0025]|'
    #                        r'[\u0027-\u003b]|[\u003d-\u007a]|\u007c|[\u007e-\u007F]')
    quotattrcontentchar = r'[A-Za-z]|\s|\d|[!#$%()*+,\-./:;=?@\[\\\]^_\'`|~]'
    # aposattrcontentchar = (r'\t|\r|\n|[\u0020-\u0025]|[\u0028-\u003b]|'
    #                        r'[\u003d-\u007a]|\u007c|[\u007e-\u007F]')
    aposattrcontentchar = r'[A-Za-z]|\s|\d|[!"#$%()*+,\-./:;=?@\[\\\]^_`|~]'

    # CHAR elements - fix the above elementcontentchar, quotattrcontentchar,
    #                 aposattrcontentchar
    # x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]

    flags = re.DOTALL | re.MULTILINE

    def punctuation_root_callback(lexer, match, ctx):
        yield match.start(), Punctuation, match.group(1)
        # transition to root always - don't pop off stack
        ctx.stack = ['root']
        ctx.pos = match.end()

    def operator_root_callback(lexer, match, ctx):
        yield match.start(), Operator, match.group(1)
        # transition to root always - don't pop off stack
        ctx.stack = ['root']
        ctx.pos = match.end()

    def popstate_tag_callback(lexer, match, ctx):
        yield match.start(), Name.Tag, match.group(1)
        if lexer.xquery_parse_state:
            ctx.stack.append(lexer.xquery_parse_state.pop())
        ctx.pos = match.end()

    def popstate_xmlcomment_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append(lexer.xquery_parse_state.pop())
        ctx.pos = match.end()

    def popstate_kindtest_callback(lexer, match, ctx):
        yield match.start(), Punctuation, match.group(1)
        next_state = lexer.xquery_parse_state.pop()
        if next_state == 'occurrenceindicator':
            if re.match("[?*+]+", match.group(2)):
                yield match.start(), Punctuation, match.group(2)
                ctx.stack.append('operator')
                ctx.pos = match.end()
            else:
                ctx.stack.append('operator')
                ctx.pos = match.end(1)
        else:
            ctx.stack.append(next_state)
            ctx.pos = match.end(1)

    def popstate_callback(lexer, match, ctx):
        yield match.start(), Punctuation, match.group(1)
        # if we have run out of our state stack, pop whatever is on the pygments
        # state stack
        if len(lexer.xquery_parse_state) == 0:
            ctx.stack.pop()
            if not ctx.stack:
                # make sure we have at least the root state on invalid inputs
                ctx.stack = ['root']
        elif len(ctx.stack) > 1:
            ctx.stack.append(lexer.xquery_parse_state.pop())
        else:
            # i don't know if i'll need this, but in case, default back to root
            ctx.stack = ['root']
        ctx.pos = match.end()

    def pushstate_element_content_starttag_callback(lexer, match, ctx):
        yield match.start(), Name.Tag, match.group(1)
        lexer.xquery_parse_state.append('element_content')
        ctx.stack.append('start_tag')
        ctx.pos = match.end()

    def pushstate_cdata_section_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('cdata_section')
        lexer.xquery_parse_state.append(ctx.state.pop)
        ctx.pos = match.end()

    def pushstate_starttag_callback(lexer, match, ctx):
        yield match.start(), Name.Tag, match.group(1)
        lexer.xquery_parse_state.append(ctx.state.pop)
        ctx.stack.append('start_tag')
        ctx.pos = match.end()

    def pushstate_operator_order_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        ctx.stack = ['root']
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_operator_map_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        ctx.stack = ['root']
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_operator_root_validate(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        ctx.stack = ['root']
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_operator_root_validate_withmode(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Keyword, match.group(3)
        ctx.stack = ['root']
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_operator_processing_instruction_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('processing_instruction')
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_element_content_processing_instruction_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('processing_instruction')
        lexer.xquery_parse_state.append('element_content')
        ctx.pos = match.end()

    def pushstate_element_content_cdata_section_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('cdata_section')
        lexer.xquery_parse_state.append('element_content')
        ctx.pos = match.end()

    def pushstate_operator_cdata_section_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('cdata_section')
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_element_content_xmlcomment_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('xml_comment')
        lexer.xquery_parse_state.append('element_content')
        ctx.pos = match.end()

    def pushstate_operator_xmlcomment_callback(lexer, match, ctx):
        yield match.start(), String.Doc, match.group(1)
        ctx.stack.append('xml_comment')
        lexer.xquery_parse_state.append('operator')
        ctx.pos = match.end()

    def pushstate_kindtest_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        lexer.xquery_parse_state.append('kindtest')
        ctx.stack.append('kindtest')
        ctx.pos = match.end()

    def pushstate_operator_kindtestforpi_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        lexer.xquery_parse_state.append('operator')
        ctx.stack.append('kindtestforpi')
        ctx.pos = match.end()

    def pushstate_operator_kindtest_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        lexer.xquery_parse_state.append('operator')
        ctx.stack.append('kindtest')
        ctx.pos = match.end()

    def pushstate_occurrenceindicator_kindtest_callback(lexer, match, ctx):
        yield match.start(), Name.Tag, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        lexer.xquery_parse_state.append('occurrenceindicator')
        ctx.stack.append('kindtest')
        ctx.pos = match.end()

    def pushstate_operator_starttag_callback(lexer, match, ctx):
        yield match.start(), Name.Tag, match.group(1)
        lexer.xquery_parse_state.append('operator')
        ctx.stack.append('start_tag')
        ctx.pos = match.end()

    def pushstate_operator_root_callback(lexer, match, ctx):
        yield match.start(), Punctuation, match.group(1)
        lexer.xquery_parse_state.append('operator')
        ctx.stack = ['root']
        ctx.pos = match.end()

    def pushstate_operator_root_construct_callback(lexer, match, ctx):
        yield match.start(), Keyword, match.group(1)
        yield match.start(), Whitespace, match.group(2)
        yield match.start(), Punctuation, match.group(3)
        lexer.xquery_parse_state.append('operator')
        ctx.stack = ['root']
        ctx.pos = match.end()

    def pushstate_root_callback(lexer, match, ctx):
        yield match.start(), Punctuation, match.group(1)
        cur_state = ctx.stack.pop()
        lexer.xquery_parse_state.append(cur_state)
        ctx.stack = ['root']
        ctx.pos = match.end()

    def pushstate_operator_attribute_callback(lexer, match, ctx):
        yield match.start(), Name.Attribute, match.group(1)
        ctx.stack.append('operator')
        ctx.pos = match.end()

    tokens = {
        'comment': [
            # xquery comments
            (r'[^:()]+', Comment),
            (r'\(:', Comment, '#push'),
            (r':\)', Comment, '#pop'),
            (r'[:()]', Comment),
        ],
        'whitespace': [
            (r'\s+', Whitespace),
        ],
        'operator': [
            include('whitespace'),
            (r'(\})', popstate_callback),
            (r'\(:', Comment, 'comment'),

            (r'(\{)', pushstate_root_callback),
            (r'then|else|external|at|div|except', Keyword, 'root'),
            (r'order by', Keyword, 'root'),
            (r'group by', Keyword, 'root'),
            (r'is|mod|order\s+by|stable\s+order\s+by', Keyword, 'root'),
            (r'and|or', Operator.Word, 'root'),
            (r'(eq|ge|gt|le|lt|ne|idiv|intersect|in)(?=\b)',
             Operator.Word, 'root'),
            (r'return|satisfies|to|union|where|count|preserve\s+strip',
             Keyword, 'root'),
            (r'(>=|>>|>|<=|<<|<|-|\*|!=|\+|\|\||\||:=|=|!)',
             operator_root_callback),
            (r'(::|:|;|\[|//|/|,)',
             punctuation_root_callback),
            (r'(castable|cast)(\s+)(as)\b',
             bygroups(Keyword, Whitespace, Keyword), 'singletype'),
            (r'(instance)(\s+)(of)\b',
             bygroups(Keyword, Whitespace, Keyword), 'itemtype'),
            (r'(treat)(\s+)(as)\b',
             bygroups(Keyword, Whitespace, Keyword), 'itemtype'),
            (r'(case)(\s+)(' + stringdouble + ')',
             bygroups(Keyword, Whitespace, String.Double), 'itemtype'),
            (r'(case)(\s+)(' + stringsingle + ')',
             bygroups(Keyword, Whitespace, String.Single), 'itemtype'),
            (r'(case|as)\b', Keyword, 'itemtype'),
            (r'(\))(\s*)(as)',
             bygroups(Punctuation, Whitespace, Keyword), 'itemtype'),
            (r'\$', Name.Variable, 'varname'),
            (r'(for|let|previous|next)(\s+)(\$)',
             bygroups(Keyword, Whitespace, Name.Variable), 'varname'),
            (r'(for)(\s+)(tumbling|sliding)(\s+)(window)(\s+)(\$)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword,
                      Whitespace, Name.Variable),
             'varname'),
            # (r'\)|\?|\]', Punctuation, '#push'),
            (r'\)|\?|\]', Punctuation),
            (r'(empty)(\s+)(greatest|least)',
             bygroups(Keyword, Whitespace, Keyword)),
            (r'ascending|descending|default', Keyword, '#push'),
            (r'(allowing)(\s+)(empty)',
             bygroups(Keyword, Whitespace, Keyword)),
            (r'external', Keyword),
            (r'(start|when|end)', Keyword, 'root'),
            (r'(only)(\s+)(end)', bygroups(Keyword, Whitespace, Keyword),
             'root'),
            (r'collation', Keyword, 'uritooperator'),

            # eXist specific XQUF
            (r'(into|following|preceding|with)', Keyword, 'root'),

            # support for current context on rhs of Simple Map Operator
            (r'\.', Operator),

            # finally catch all string literals and stay in operator state
            (stringdouble, String.Double),
            (stringsingle, String.Single),

            (r'(catch)(\s*)', bygroups(Keyword, Whitespace), 'root'),
        ],
        'uritooperator': [
            (stringdouble, String.Double, '#pop'),
            (stringsingle, String.Single, '#pop'),
        ],
        'namespacedecl': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (r'(at)(\s+)('+stringdouble+')',
             bygroups(Keyword, Whitespace, String.Double)),
            (r"(at)(\s+)("+stringsingle+')',
             bygroups(Keyword, Whitespace, String.Single)),
            (stringdouble, String.Double),
            (stringsingle, String.Single),
            (r',', Punctuation),
            (r'=', Operator),
            (r';', Punctuation, 'root'),
            (ncname, Name.Namespace),
        ],
        'namespacekeyword': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (stringdouble, String.Double, 'namespacedecl'),
            (stringsingle, String.Single, 'namespacedecl'),
            (r'inherit|no-inherit', Keyword, 'root'),
            (r'namespace', Keyword, 'namespacedecl'),
            (r'(default)(\s+)(element)', bygroups(Keyword, Text, Keyword)),
            (r'preserve|no-preserve', Keyword),
            (r',', Punctuation),
        ],
        'annotationname': [
            (r'\(:', Comment, 'comment'),
            (qname, Name.Decorator),
            (r'(\()(' + stringdouble + ')', bygroups(Punctuation, String.Double)),
            (r'(\()(' + stringsingle + ')', bygroups(Punctuation, String.Single)),
            (r'(\,)(\s+)(' + stringdouble + ')',
             bygroups(Punctuation, Text, String.Double)),
            (r'(\,)(\s+)(' + stringsingle + ')',
             bygroups(Punctuation, Text, String.Single)),
            (r'\)', Punctuation),
            (r'(\s+)(\%)', bygroups(Text, Name.Decorator), 'annotationname'),
            (r'(\s+)(variable)(\s+)(\$)',
             bygroups(Text, Keyword.Declaration, Text, Name.Variable), 'varname'),
            (r'(\s+)(function)(\s+)',
             bygroups(Text, Keyword.Declaration, Text), 'root')
        ],
        'varname': [
            (r'\(:', Comment, 'comment'),
            (r'(' + qname + r')(\()?', bygroups(Name, Punctuation), 'operator'),
        ],
        'singletype': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (ncname + r'(:\*)', Name.Variable, 'operator'),
            (qname, Name.Variable, 'operator'),
        ],
        'itemtype': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (r'\$', Name.Variable, 'varname'),
            (r'(void)(\s*)(\()(\s*)(\))',
             bygroups(Keyword, Text, Punctuation, Text, Punctuation), 'operator'),
            (r'(element|attribute|schema-element|schema-attribute|comment|text|'
             r'node|binary|document-node|empty-sequence)(\s*)(\()',
             pushstate_occurrenceindicator_kindtest_callback),
            # Marklogic specific type?
            (r'(processing-instruction)(\s*)(\()',
             bygroups(Keyword, Text, Punctuation),
             ('occurrenceindicator', 'kindtestforpi')),
            (r'(item)(\s*)(\()(\s*)(\))(?=[*+?])',
             bygroups(Keyword, Text, Punctuation, Text, Punctuation),
             'occurrenceindicator'),
            (r'(\(\#)(\s*)', bygroups(Punctuation, Text), 'pragma'),
            (r';', Punctuation, '#pop'),
            (r'then|else', Keyword, '#pop'),
            (r'(at)(\s+)(' + stringdouble + ')',
             bygroups(Keyword, Text, String.Double), 'namespacedecl'),
            (r'(at)(\s+)(' + stringsingle + ')',
             bygroups(Keyword, Text, String.Single), 'namespacedecl'),
            (r'except|intersect|in|is|return|satisfies|to|union|where|count',
             Keyword, 'root'),
            (r'and|div|eq|ge|gt|le|lt|ne|idiv|mod|or', Operator.Word, 'root'),
            (r':=|=|,|>=|>>|>|\[|\(|<=|<<|<|-|!=|\|\||\|', Operator, 'root'),
            (r'external|at', Keyword, 'root'),
            (r'(stable)(\s+)(order)(\s+)(by)',
             bygroups(Keyword, Text, Keyword, Text, Keyword), 'root'),
            (r'(castable|cast)(\s+)(as)',
             bygroups(Keyword, Text, Keyword), 'singletype'),
            (r'(treat)(\s+)(as)', bygroups(Keyword, Text, Keyword)),
            (r'(instance)(\s+)(of)', bygroups(Keyword, Text, Keyword)),
            (r'(case)(\s+)(' + stringdouble + ')',
             bygroups(Keyword, Text, String.Double), 'itemtype'),
            (r'(case)(\s+)(' + stringsingle + ')',
             bygroups(Keyword, Text, String.Single), 'itemtype'),
            (r'case|as', Keyword, 'itemtype'),
            (r'(\))(\s*)(as)', bygroups(Operator, Text, Keyword), 'itemtype'),
            (ncname + r':\*', Keyword.Type, 'operator'),
            (r'(function|map|array)(\()', bygroups(Keyword.Type, Punctuation)),
            (qname, Keyword.Type, 'occurrenceindicator'),
        ],
        'kindtest': [
            (r'\(:', Comment, 'comment'),
            (r'\{', Punctuation, 'root'),
            (r'(\))([*+?]?)', popstate_kindtest_callback),
            (r'\*', Name, 'closekindtest'),
            (qname, Name, 'closekindtest'),
            (r'(element|schema-element)(\s*)(\()', pushstate_kindtest_callback),
        ],
        'kindtestforpi': [
            (r'\(:', Comment, 'comment'),
            (r'\)', Punctuation, '#pop'),
            (ncname, Name.Variable),
            (stringdouble, String.Double),
            (stringsingle, String.Single),
        ],
        'closekindtest': [
            (r'\(:', Comment, 'comment'),
            (r'(\))', popstate_callback),
            (r',', Punctuation),
            (r'(\{)', pushstate_operator_root_callback),
            (r'\?', Punctuation),
        ],
        'xml_comment': [
            (r'(-->)', popstate_xmlcomment_callback),
            (r'[^-]{1,2}', Literal),
            (r'\t|\r|\n|[\u0020-\uD7FF]|[\uE000-\uFFFD]|[\U00010000-\U0010FFFF]',
             Literal),
        ],
        'processing_instruction': [
            (r'\s+', Text, 'processing_instruction_content'),
            (r'\?>', String.Doc, '#pop'),
            (pitarget, Name),
        ],
        'processing_instruction_content': [
            (r'\?>', String.Doc, '#pop'),
            (r'\t|\r|\n|[\u0020-\uD7FF]|[\uE000-\uFFFD]|[\U00010000-\U0010FFFF]',
             Literal),
        ],
        'cdata_section': [
            (r']]>', String.Doc, '#pop'),
            (r'\t|\r|\n|[\u0020-\uD7FF]|[\uE000-\uFFFD]|[\U00010000-\U0010FFFF]',
             Literal),
        ],
        'start_tag': [
            include('whitespace'),
            (r'(/>)', popstate_tag_callback),
            (r'>', Name.Tag, 'element_content'),
            (r'"', Punctuation, 'quot_attribute_content'),
            (r"'", Punctuation, 'apos_attribute_content'),
            (r'=', Operator),
            (qname, Name.Tag),
        ],
        'quot_attribute_content': [
            (r'"', Punctuation, 'start_tag'),
            (r'(\{)', pushstate_root_callback),
            (r'""', Name.Attribute),
            (quotattrcontentchar, Name.Attribute),
            (entityref, Name.Attribute),
            (charref, Name.Attribute),
            (r'\{\{|\}\}', Name.Attribute),
        ],
        'apos_attribute_content': [
            (r"'", Punctuation, 'start_tag'),
            (r'\{', Punctuation, 'root'),
            (r"''", Name.Attribute),
            (aposattrcontentchar, Name.Attribute),
            (entityref, Name.Attribute),
            (charref, Name.Attribute),
            (r'\{\{|\}\}', Name.Attribute),
        ],
        'element_content': [
            (r'</', Name.Tag, 'end_tag'),
            (r'(\{)', pushstate_root_callback),
            (r'(<!--)', pushstate_element_content_xmlcomment_callback),
            (r'(<\?)', pushstate_element_content_processing_instruction_callback),
            (r'(<!\[CDATA\[)', pushstate_element_content_cdata_section_callback),
            (r'(<)', pushstate_element_content_starttag_callback),
            (elementcontentchar, Literal),
            (entityref, Literal),
            (charref, Literal),
            (r'\{\{|\}\}', Literal),
        ],
        'end_tag': [
            include('whitespace'),
            (r'(>)', popstate_tag_callback),
            (qname, Name.Tag),
        ],
        'xmlspace_decl': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (r'preserve|strip', Keyword, '#pop'),
        ],
        'declareordering': [
            (r'\(:', Comment, 'comment'),
            include('whitespace'),
            (r'ordered|unordered', Keyword, '#pop'),
        ],
        'xqueryversion': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (stringdouble, String.Double),
            (stringsingle, String.Single),
            (r'encoding', Keyword),
            (r';', Punctuation, '#pop'),
        ],
        'pragma': [
            (qname, Name.Variable, 'pragmacontents'),
        ],
        'pragmacontents': [
            (r'#\)', Punctuation, 'operator'),
            (r'\t|\r|\n|[\u0020-\uD7FF]|[\uE000-\uFFFD]|[\U00010000-\U0010FFFF]',
             Literal),
            (r'(\s+)', Whitespace),
        ],
        'occurrenceindicator': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),
            (r'\*|\?|\+', Operator, 'operator'),
            (r':=', Operator, 'root'),
            default('operator'),
        ],
        'option': [
            include('whitespace'),
            (qname, Name.Variable, '#pop'),
        ],
        'qname_braren': [
            include('whitespace'),
            (r'(\{)', pushstate_operator_root_callback),
            (r'(\()', Punctuation, 'root'),
        ],
        'element_qname': [
            (qname, Name.Variable, 'root'),
        ],
        'attribute_qname': [
            (qname, Name.Variable, 'root'),
        ],
        'root': [
            include('whitespace'),
            (r'\(:', Comment, 'comment'),

            # handle operator state
            # order on numbers matters - handle most complex first
            (r'\d+(\.\d*)?[eE][+-]?\d+', Number.Float, 'operator'),
            (r'(\.\d+)[eE][+-]?\d+', Number.Float, 'operator'),
            (r'(\.\d+|\d+\.\d*)', Number.Float, 'operator'),
            (r'(\d+)', Number.Integer, 'operator'),
            (r'(\.\.|\.|\))', Punctuation, 'operator'),
            (r'(declare)(\s+)(construction)',
             bygroups(Keyword.Declaration, Text, Keyword.Declaration), 'operator'),
            (r'(declare)(\s+)(default)(\s+)(order)',
             bygroups(Keyword.Declaration, Text, Keyword.Declaration, Text, Keyword.Declaration), 'operator'),
            (r'(declare)(\s+)(context)(\s+)(item)',
             bygroups(Keyword.Declaration, Text, Keyword.Declaration, Text, Keyword.Declaration), 'operator'),
            (ncname + r':\*', Name, 'operator'),
            (r'\*:'+ncname, Name.Tag, 'operator'),
            (r'\*', Name.Tag, 'operator'),
            (stringdouble, String.Double, 'operator'),
            (stringsingle, String.Single, 'operator'),

            (r'(\}|\])', popstate_callback),

            # NAMESPACE DECL
            (r'(declare)(\s+)(default)(\s+)(collation)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration,
                      Whitespace, Keyword.Declaration)),
            (r'(module|declare)(\s+)(namespace)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration),
             'namespacedecl'),
            (r'(declare)(\s+)(base-uri)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration),
             'namespacedecl'),

            # NAMESPACE KEYWORD
            (r'(declare)(\s+)(default)(\s+)(element|function)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration,
                      Whitespace, Keyword.Declaration),
             'namespacekeyword'),
            (r'(import)(\s+)(schema|module)',
             bygroups(Keyword.Pseudo, Whitespace, Keyword.Pseudo),
             'namespacekeyword'),
            (r'(declare)(\s+)(copy-namespaces)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration),
             'namespacekeyword'),

            # VARNAMEs
            (r'(for|let|some|every)(\s+)(\$)',
             bygroups(Keyword, Whitespace, Name.Variable), 'varname'),
            (r'(for)(\s+)(tumbling|sliding)(\s+)(window)(\s+)(\$)',
             bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword,
                      Whitespace, Name.Variable),
             'varname'),
            (r'\$', Name.Variable, 'varname'),
            (r'(declare)(\s+)(variable)(\s+)(\$)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration,
                      Whitespace, Name.Variable),
             'varname'),

            # ANNOTATED GLOBAL VARIABLES AND FUNCTIONS
            (r'(declare)(\s+)(\%)', bygroups(Keyword.Declaration, Whitespace,
                                             Name.Decorator),
             'annotationname'),

            # ITEMTYPE
            (r'(\))(\s+)(as)', bygroups(Operator, Whitespace, Keyword),
             'itemtype'),

            (r'(element|attribute|schema-element|schema-attribute|comment|'
             r'text|node|document-node|empty-sequence)(\s+)(\()',
             pushstate_operator_kindtest_callback),

            (r'(processing-instruction)(\s+)(\()',
             pushstate_operator_kindtestforpi_callback),

            (r'(<!--)', pushstate_operator_xmlcomment_callback),

            (r'(<\?)', pushstate_operator_processing_instruction_callback),

            (r'(<!\[CDATA\[)', pushstate_operator_cdata_section_callback),

            # (r'</', Name.Tag, 'end_tag'),
            (r'(<)', pushstate_operator_starttag_callback),

            (r'(declare)(\s+)(boundary-space)',
             bygroups(Keyword.Declaration, Text, Keyword.Declaration), 'xmlspace_decl'),

            (r'(validate)(\s+)(lax|strict)',
             pushstate_operator_root_validate_withmode),
            (r'(validate)(\s*)(\{)', pushstate_operator_root_validate),
            (r'(typeswitch)(\s*)(\()', bygroups(Keyword, Whitespace,
                                                Punctuation)),
            (r'(switch)(\s*)(\()', bygroups(Keyword, Whitespace, Punctuation)),
            (r'(element|attribute|namespace)(\s*)(\{)',
             pushstate_operator_root_construct_callback),

            (r'(document|text|processing-instruction|comment)(\s*)(\{)',
             pushstate_operator_root_construct_callback),
            # ATTRIBUTE
            (r'(attribute)(\s+)(?=' + qname + r')',
             bygroups(Keyword, Whitespace), 'attribute_qname'),
            # ELEMENT
            (r'(element)(\s+)(?=' + qname + r')',
             bygroups(Keyword, Whitespace), 'element_qname'),
            # PROCESSING_INSTRUCTION
            (r'(processing-instruction|namespace)(\s+)(' + ncname + r')(\s*)(\{)',
             bygroups(Keyword, Whitespace, Name.Variable, Whitespace,
                      Punctuation),
             'operator'),

            (r'(declare|define)(\s+)(function)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration)),

            (r'(\{|\[)', pushstate_operator_root_callback),

            (r'(unordered|ordered)(\s*)(\{)',
             pushstate_operator_order_callback),

            (r'(map|array)(\s*)(\{)',
             pushstate_operator_map_callback),

            (r'(declare)(\s+)(ordering)',
             bygroups(Keyword.Declaration, Whitespace, Keyword.Declaration),
             'declareordering'),

            (r'(xquery)(\s+)(version)',
             bygroups(Keyword.Pseudo, Whitespace, Keyword.Pseudo),
             'xqueryversion'),

            (r'(\(#)(\s*)', bygroups(Punctuation, Whitespace), 'pragma'),

            # sometimes return can occur in root state
            (r'return', Keyword),

            (r'(declare)(\s+)(option)', bygroups(Keyword.Declaration,
                                                 Whitespace,
                                                 Keyword.Declaration),
             'option'),

            # URI LITERALS - single and double quoted
            (r'(at)(\s+)('+stringdouble+')', String.Double, 'namespacedecl'),
            (r'(at)(\s+)('+stringsingle+')', String.Single, 'namespacedecl'),

            (r'(ancestor-or-self|ancestor|attribute|child|descendant-or-self)(::)',
             bygroups(Keyword, Punctuation)),
            (r'(descendant|following-sibling|following|parent|preceding-sibling'
             r'|preceding|self)(::)', bygroups(Keyword, Punctuation)),

            (r'(if)(\s*)(\()', bygroups(Keyword, Whitespace, Punctuation)),

            (r'then|else', Keyword),

            # eXist specific XQUF
            (r'(update)(\s*)(insert|delete|replace|value|rename)',
             bygroups(Keyword, Whitespace, Keyword)),
            (r'(into|following|preceding|with)', Keyword),

            # Marklogic specific
            (r'(try)(\s*)', bygroups(Keyword, Whitespace), 'root'),
            (r'(catch)(\s*)(\()(\$)',
             bygroups(Keyword, Whitespace, Punctuation, Name.Variable),
             'varname'),


            (r'(@'+qname+')', Name.Attribute, 'operator'),
            (r'(@'+ncname+')', Name.Attribute, 'operator'),
            (r'@\*:'+ncname, Name.Attribute, 'operator'),
            (r'@\*', Name.Attribute, 'operator'),
            (r'(@)', Name.Attribute, 'operator'),

            (r'//|/|\+|-|;|,|\(|\)', Punctuation),

            # STANDALONE QNAMES
            (qname + r'(?=\s*\{)', Name.Tag, 'qname_braren'),
            (qname + r'(?=\s*\([^:])', Name.Function, 'qname_braren'),
            (r'(' + qname + ')(#)([0-9]+)', bygroups(Name.Function, Keyword.Type, Number.Integer)),
            (qname, Name.Tag, 'operator'),
        ]
    }


class QmlLexer(RegexLexer):
    """
    For QML files.
    """

    # QML is based on javascript, so much of this is taken from the
    # JavascriptLexer above.

    name = 'QML'
    url = 'https://doc.qt.io/qt-6/qmlapplications.html'
    aliases = ['qml', 'qbs']
    filenames = ['*.qml', '*.qbs']
    mimetypes = ['application/x-qml', 'application/x-qt.qbs+qml']
    version_added = '1.6'

    # pasted from JavascriptLexer, with some additions
    flags = re.DOTALL | re.MULTILINE

    tokens = {
        'commentsandwhitespace': [
            (r'\s+', Text),
            (r'<!--', Comment),
            (r'//.*?\n', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline)
        ],
        'slashstartsregex': [
            include('commentsandwhitespace'),
            (r'/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/'
             r'([gim]+\b|\B)', String.Regex, '#pop'),
            (r'(?=/)', Text, ('#pop', 'badregex')),
            default('#pop')
        ],
        'badregex': [
            (r'\n', Text, '#pop')
        ],
        'root': [
            (r'^(?=\s|/|<!--)', Text, 'slashstartsregex'),
            include('commentsandwhitespace'),
            (r'\+\+|--|~|&&|\?|:|\|\||\\(?=\n)|'
             r'(<<|>>>?|==?|!=?|[-<>+*%&|^/])=?', Operator, 'slashstartsregex'),
            (r'[{(\[;,]', Punctuation, 'slashstartsregex'),
            (r'[})\].]', Punctuation),

            # QML insertions
            (r'\bid\s*:\s*[A-Za-z][\w.]*', Keyword.Declaration,
             'slashstartsregex'),
            (r'\b[A-Za-z][\w.]*\s*:', Keyword, 'slashstartsregex'),

            # the rest from JavascriptLexer
            (r'(for|in|while|do|break|return|continue|switch|case|default|if|else|'
             r'throw|try|catch|finally|new|delete|typeof|instanceof|void|'
             r'this)\b', Keyword, 'slashstartsregex'),
            (r'(var|let|with|function)\b', Keyword.Declaration, 'slashstartsregex'),
            (r'(abstract|boolean|byte|char|class|const|debugger|double|enum|export|'
             r'extends|final|float|goto|implements|import|int|interface|long|native|'
             r'package|private|protected|public|short|static|super|synchronized|throws|'
             r'transient|volatile)\b', Keyword.Reserved),
            (r'(true|false|null|NaN|Infinity|undefined)\b', Keyword.Constant),
            (r'(Array|Boolean|Date|Error|Function|Math|netscape|'
             r'Number|Object|Packages|RegExp|String|sun|decodeURI|'
             r'decodeURIComponent|encodeURI|encodeURIComponent|'
             r'Error|eval|isFinite|isNaN|parseFloat|parseInt|document|this|'
             r'window)\b', Name.Builtin),
            (r'[$a-zA-Z_]\w*', Name.Other),
            (r'[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
        ]
    }


class CirruLexer(RegexLexer):
    r"""
    * using ``()`` for expressions, but restricted in a same line
    * using ``""`` for strings, with ``\`` for escaping chars
    * using ``$`` as folding operator
    * using ``,`` as unfolding operator
    * using indentations for nested blocks
    """

    name = 'Cirru'
    url = 'http://cirru.org/'
    aliases = ['cirru']
    filenames = ['*.cirru']
    mimetypes = ['text/x-cirru']
    version_added = '2.0'
    flags = re.MULTILINE

    tokens = {
        'string': [
            (r'[^"\\\n]+', String),
            (r'\\', String.Escape, 'escape'),
            (r'"', String, '#pop'),
        ],
        'escape': [
            (r'.', String.Escape, '#pop'),
        ],
        'function': [
            (r'\,', Operator, '#pop'),
            (r'[^\s"()]+', Name.Function, '#pop'),
            (r'\)', Operator, '#pop'),
            (r'(?=\n)', Text, '#pop'),
            (r'\(', Operator, '#push'),
            (r'"', String, ('#pop', 'string')),
            (r'[ ]+', Text.Whitespace),
        ],
        'line': [
            (r'(?<!\w)\$(?!\w)', Operator, 'function'),
            (r'\(', Operator, 'function'),
            (r'\)', Operator),
            (r'\n', Text, '#pop'),
            (r'"', String, 'string'),
            (r'[ ]+', Text.Whitespace),
            (r'[+-]?[\d.]+\b', Number),
            (r'[^\s"()]+', Name.Variable)
        ],
        'root': [
            (r'^\n+', Text.Whitespace),
            default(('line', 'function')),
        ]
    }


class SlimLexer(ExtendedRegexLexer):
    """
    For Slim markup.
    """

    name = 'Slim'
    aliases = ['slim']
    filenames = ['*.slim']
    mimetypes = ['text/x-slim']
    url = 'https://slim-template.github.io'
    version_added = '2.0'

    flags = re.IGNORECASE
    _dot = r'(?: \|\n(?=.* \|)|.)'
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
            (r'([ \t]*==?)(.*\n)',
             bygroups(Punctuation, using(RubyLexer)),
             'root'),
            (r'[ \t]+[\w:-]+(?==)', Name.Attribute, 'html-attributes'),
            default('plain'),
        ],

        'content': [
            include('css'),
            (r'[\w:-]+:[ \t]*\n', Text, 'plain'),
            (r'(-)(.*\n)',
             bygroups(Punctuation, using(RubyLexer)),
             '#pop'),
            (r'\|' + _dot + r'*\n', _starts_block(Text, 'plain'), '#pop'),
            (r'/' + _dot + r'*\n', _starts_block(Comment.Preproc, 'slim-comment-block'), '#pop'),
            (r'[\w:-]+', Name.Tag, 'tag'),
            include('eval-or-plain'),
        ],

        'tag': [
            include('css'),
            (r'[<>]{1,2}(?=[ \t=])', Punctuation),
            (r'[ \t]+\n', Punctuation, '#pop:2'),
            include('eval-or-plain'),
        ],

        'plain': [
            (r'([^#\n]|#[^{\n]|(\\\\)*\\#\{)+', Text),
            (r'(#\{)(.*?)(\})',
             bygroups(String.Interpol, using(RubyLexer), String.Interpol)),
            (r'\n', Text, 'root'),
        ],

        'html-attributes': [
            (r'=', Punctuation),
            (r'"[^"]+"', using(RubyLexer), 'tag'),
            (r'\'[^\']+\'', using(RubyLexer), 'tag'),
            (r'\w+', Text, 'tag'),
        ],

        'slim-comment-block': [
            (_dot + '+', Comment.Preproc),
            (r'\n', Text, 'root'),
        ],
    }
