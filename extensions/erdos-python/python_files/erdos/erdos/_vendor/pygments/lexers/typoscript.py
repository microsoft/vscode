"""
    pygments.lexers.typoscript
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for TypoScript

    `TypoScriptLexer`
        A TypoScript lexer.

    `TypoScriptCssDataLexer`
        Lexer that highlights markers, constants and registers within css.

    `TypoScriptHtmlDataLexer`
        Lexer that highlights markers, constants and registers within html tags.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using
from erdos.erdos._vendor.pygments.token import Text, Comment, Name, String, Number, \
    Operator, Punctuation

__all__ = ['TypoScriptLexer', 'TypoScriptCssDataLexer', 'TypoScriptHtmlDataLexer']


class TypoScriptCssDataLexer(RegexLexer):
    """
    Lexer that highlights markers, constants and registers within css blocks.
    """

    name = 'TypoScriptCssData'
    aliases = ['typoscriptcssdata']
    url = 'http://docs.typo3.org/typo3cms/TyposcriptReference/'
    version_added = '2.2'

    tokens = {
        'root': [
            # marker: ###MARK###
            (r'(.*)(###\w+###)(.*)', bygroups(String, Name.Constant, String)),
            # constant: {$some.constant}
            (r'(\{)(\$)((?:[\w\-]+\.)*)([\w\-]+)(\})',
             bygroups(String.Symbol, Operator, Name.Constant,
                      Name.Constant, String.Symbol)),  # constant
            # constant: {register:somevalue}
            (r'(.*)(\{)([\w\-]+)(\s*:\s*)([\w\-]+)(\})(.*)',
             bygroups(String, String.Symbol, Name.Constant, Operator,
                      Name.Constant, String.Symbol, String)),  # constant
            # whitespace
            (r'\s+', Text),
            # comments
            (r'/\*(?:(?!\*/).)*\*/', Comment),
            (r'(?<!(#|\'|"))(?:#(?!(?:[a-fA-F0-9]{6}|[a-fA-F0-9]{3}))[^\n#]+|//[^\n]*)',
             Comment),
            # other
            (r'[<>,:=.*%+|]', String),
            (r'[\w"\-!/&;(){}]+', String),
        ]
    }


class TypoScriptHtmlDataLexer(RegexLexer):
    """
    Lexer that highlights markers, constants and registers within html tags.
    """

    name = 'TypoScriptHtmlData'
    aliases = ['typoscripthtmldata']
    url = 'http://docs.typo3.org/typo3cms/TyposcriptReference/'
    version_added = '2.2'

    tokens = {
        'root': [
            # INCLUDE_TYPOSCRIPT
            (r'(INCLUDE_TYPOSCRIPT)', Name.Class),
            # Language label or extension resource FILE:... or LLL:... or EXT:...
            (r'(EXT|FILE|LLL):[^}\n"]*', String),
            # marker: ###MARK###
            (r'(.*)(###\w+###)(.*)', bygroups(String, Name.Constant, String)),
            # constant: {$some.constant}
            (r'(\{)(\$)((?:[\w\-]+\.)*)([\w\-]+)(\})',
             bygroups(String.Symbol, Operator, Name.Constant,
                      Name.Constant, String.Symbol)),  # constant
            # constant: {register:somevalue}
            (r'(.*)(\{)([\w\-]+)(\s*:\s*)([\w\-]+)(\})(.*)',
             bygroups(String, String.Symbol, Name.Constant, Operator,
                      Name.Constant, String.Symbol, String)),  # constant
            # whitespace
            (r'\s+', Text),
            # other
            (r'[<>,:=.*%+|]', String),
            (r'[\w"\-!/&;(){}#]+', String),
        ]
    }


class TypoScriptLexer(RegexLexer):
    """
    Lexer for TypoScript code.
    """

    name = 'TypoScript'
    url = 'http://docs.typo3.org/typo3cms/TyposcriptReference/'
    aliases = ['typoscript']
    filenames = ['*.typoscript']
    mimetypes = ['text/x-typoscript']
    version_added = '2.2'

    flags = re.DOTALL | re.MULTILINE

    tokens = {
        'root': [
            include('comment'),
            include('constant'),
            include('html'),
            include('label'),
            include('whitespace'),
            include('keywords'),
            include('punctuation'),
            include('operator'),
            include('structure'),
            include('literal'),
            include('other'),
        ],
        'keywords': [
            # Conditions
            (r'(?i)(\[)(browser|compatVersion|dayofmonth|dayofweek|dayofyear|'
             r'device|ELSE|END|GLOBAL|globalString|globalVar|hostname|hour|IP|'
             r'language|loginUser|loginuser|minute|month|page|PIDinRootline|'
             r'PIDupinRootline|system|treeLevel|useragent|userFunc|usergroup|'
             r'version)([^\]]*)(\])',
             bygroups(String.Symbol, Name.Constant, Text, String.Symbol)),
            # Functions
            (r'(?=[\w\-])(HTMLparser|HTMLparser_tags|addParams|cache|encapsLines|'
             r'filelink|if|imageLinkWrap|imgResource|makelinks|numRows|numberFormat|'
             r'parseFunc|replacement|round|select|split|stdWrap|strPad|tableStyle|'
             r'tags|textStyle|typolink)(?![\w\-])', Name.Function),
            # Toplevel objects and _*
            (r'(?:(=?\s*<?\s+|^\s*))(cObj|field|config|content|constants|FEData|'
             r'file|frameset|includeLibs|lib|page|plugin|register|resources|sitemap|'
             r'sitetitle|styles|temp|tt_[^:.\s]*|types|xmlnews|INCLUDE_TYPOSCRIPT|'
             r'_CSS_DEFAULT_STYLE|_DEFAULT_PI_VARS|_LOCAL_LANG)(?![\w\-])',
             bygroups(Operator, Name.Builtin)),
            # Content objects
            (r'(?=[\w\-])(CASE|CLEARGIF|COA|COA_INT|COBJ_ARRAY|COLUMNS|CONTENT|'
             r'CTABLE|EDITPANEL|FILE|FILES|FLUIDTEMPLATE|FORM|HMENU|HRULER|HTML|'
             r'IMAGE|IMGTEXT|IMG_RESOURCE|LOAD_REGISTER|MEDIA|MULTIMEDIA|OTABLE|'
             r'PAGE|QTOBJECT|RECORDS|RESTORE_REGISTER|SEARCHRESULT|SVG|SWFOBJECT|'
             r'TEMPLATE|TEXT|USER|USER_INT)(?![\w\-])', Name.Class),
            # Menu states
            (r'(?=[\w\-])(ACTIFSUBRO|ACTIFSUB|ACTRO|ACT|CURIFSUBRO|CURIFSUB|CURRO|'
             r'CUR|IFSUBRO|IFSUB|NO|SPC|USERDEF1RO|USERDEF1|USERDEF2RO|USERDEF2|'
             r'USRRO|USR)', Name.Class),
            # Menu objects
            (r'(?=[\w\-])(GMENU_FOLDOUT|GMENU_LAYERS|GMENU|IMGMENUITEM|IMGMENU|'
             r'JSMENUITEM|JSMENU|TMENUITEM|TMENU_LAYERS|TMENU)', Name.Class),
            # PHP objects
            (r'(?=[\w\-])(PHP_SCRIPT(_EXT|_INT)?)', Name.Class),
            (r'(?=[\w\-])(userFunc)(?![\w\-])', Name.Function),
        ],
        'whitespace': [
            (r'\s+', Text),
        ],
        'html': [
            (r'<\S[^\n>]*>', using(TypoScriptHtmlDataLexer)),
            (r'&[^;\n]*;', String),
            (r'(?s)(_CSS_DEFAULT_STYLE)(\s*)(\()(.*(?=\n\)))',
             bygroups(Name.Class, Text, String.Symbol, using(TypoScriptCssDataLexer))),
        ],
        'literal': [
            (r'0x[0-9A-Fa-f]+t?', Number.Hex),
            # (r'[0-9]*\.[0-9]+([eE][0-9]+)?[fd]?\s*(?:[^=])', Number.Float),
            (r'[0-9]+', Number.Integer),
            (r'(###\w+###)', Name.Constant),
        ],
        'label': [
            # Language label or extension resource FILE:... or LLL:... or EXT:...
            (r'(EXT|FILE|LLL):[^}\n"]*', String),
            # Path to a resource
            (r'(?![^\w\-])([\w\-]+(?:/[\w\-]+)+/?)(\S*\n)',
             bygroups(String, String)),
        ],
        'punctuation': [
            (r'[,.]', Punctuation),
        ],
        'operator': [
            (r'[<>,:=.*%+|]', Operator),
        ],
        'structure': [
            # Brackets and braces
            (r'[{}()\[\]\\]', String.Symbol),
        ],
        'constant': [
            # Constant: {$some.constant}
            (r'(\{)(\$)((?:[\w\-]+\.)*)([\w\-]+)(\})',
                bygroups(String.Symbol, Operator, Name.Constant,
                         Name.Constant, String.Symbol)),  # constant
            # Constant: {register:somevalue}
            (r'(\{)([\w\-]+)(\s*:\s*)([\w\-]+)(\})',
                bygroups(String.Symbol, Name.Constant, Operator,
                         Name.Constant, String.Symbol)),  # constant
            # Hex color: #ff0077
            (r'(#[a-fA-F0-9]{6}\b|#[a-fA-F0-9]{3}\b)', String.Char)
        ],
        'comment': [
            (r'(?<!(#|\'|"))(?:#(?!(?:[a-fA-F0-9]{6}|[a-fA-F0-9]{3}))[^\n#]+|//[^\n]*)',
             Comment),
            (r'/\*(?:(?!\*/).)*\*/', Comment),
            (r'(\s*#\s*\n)', Comment),
        ],
        'other': [
            (r'[\w"\-!/&;]+', Text),
        ],
    }
