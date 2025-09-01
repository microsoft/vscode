"""
    pygments.lexers.installers
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for installer/packager DSLs and formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, this, default
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Punctuation, Generic, Number, Whitespace

__all__ = ['NSISLexer', 'RPMSpecLexer',
           'DebianSourcesLexer', 'SourcesListLexer',
           'DebianControlLexer']


class NSISLexer(RegexLexer):
    """
    For NSIS scripts.
    """
    name = 'NSIS'
    url = 'http://nsis.sourceforge.net/'
    aliases = ['nsis', 'nsi', 'nsh']
    filenames = ['*.nsi', '*.nsh']
    mimetypes = ['text/x-nsis']
    version_added = '1.6'

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r'([;#].*)(\n)', bygroups(Comment, Whitespace)),
            (r"'.*?'", String.Single),
            (r'"', String.Double, 'str_double'),
            (r'`', String.Backtick, 'str_backtick'),
            include('macro'),
            include('interpol'),
            include('basic'),
            (r'\$\{[a-z_|][\w|]*\}', Keyword.Pseudo),
            (r'/[a-z_]\w*', Name.Attribute),
            (r'\s+', Whitespace),
            (r'[\w.]+', Text),
        ],
        'basic': [
            (r'(\n)(Function)(\s+)([._a-z][.\w]*)\b',
             bygroups(Whitespace, Keyword, Whitespace, Name.Function)),
            (r'\b([_a-z]\w*)(::)([a-z][a-z0-9]*)\b',
             bygroups(Keyword.Namespace, Punctuation, Name.Function)),
            (r'\b([_a-z]\w*)(:)', bygroups(Name.Label, Punctuation)),
            (r'(\b[ULS]|\B)([!<>=]?=|\<\>?|\>)\B', Operator),
            (r'[|+-]', Operator),
            (r'\\', Punctuation),
            (r'\b(Abort|Add(?:BrandingImage|Size)|'
             r'Allow(?:RootDirInstall|SkipFiles)|AutoCloseWindow|'
             r'BG(?:Font|Gradient)|BrandingText|BringToFront|Call(?:InstDLL)?|'
             r'(?:Sub)?Caption|ChangeUI|CheckBitmap|ClearErrors|CompletedText|'
             r'ComponentText|CopyFiles|CRCCheck|'
             r'Create(?:Directory|Font|Shortcut)|Delete(?:INI(?:Sec|Str)|'
             r'Reg(?:Key|Value))?|DetailPrint|DetailsButtonText|'
             r'Dir(?:Show|Text|Var|Verify)|(?:Disabled|Enabled)Bitmap|'
             r'EnableWindow|EnumReg(?:Key|Value)|Exch|Exec(?:Shell|Wait)?|'
             r'ExpandEnvStrings|File(?:BufSize|Close|ErrorText|Open|'
             r'Read(?:Byte)?|Seek|Write(?:Byte)?)?|'
             r'Find(?:Close|First|Next|Window)|FlushINI|Function(?:End)?|'
             r'Get(?:CurInstType|CurrentAddress|DlgItem|DLLVersion(?:Local)?|'
             r'ErrorLevel|FileTime(?:Local)?|FullPathName|FunctionAddress|'
             r'InstDirError|LabelAddress|TempFileName)|'
             r'Goto|HideWindow|Icon|'
             r'If(?:Abort|Errors|FileExists|RebootFlag|Silent)|'
             r'InitPluginsDir|Install(?:ButtonText|Colors|Dir(?:RegKey)?)|'
             r'Inst(?:ProgressFlags|Type(?:[GS]etText)?)|Int(?:CmpU?|Fmt|Op)|'
             r'IsWindow|LangString(?:UP)?|'
             r'License(?:BkColor|Data|ForceSelection|LangString|Text)|'
             r'LoadLanguageFile|LockWindow|Log(?:Set|Text)|MessageBox|'
             r'MiscButtonText|Name|Nop|OutFile|(?:Uninst)?Page(?:Ex(?:End)?)?|'
             r'PluginDir|Pop|Push|Quit|Read(?:(?:Env|INI|Reg)Str|RegDWORD)|'
             r'Reboot|(?:Un)?RegDLL|Rename|RequestExecutionLevel|ReserveFile|'
             r'Return|RMDir|SearchPath|Section(?:Divider|End|'
             r'(?:(?:Get|Set)(?:Flags|InstTypes|Size|Text))|Group(?:End)?|In)?|'
             r'SendMessage|Set(?:AutoClose|BrandingImage|Compress(?:ionLevel|'
             r'or(?:DictSize)?)?|CtlColors|CurInstType|DatablockOptimize|'
             r'DateSave|Details(?:Print|View)|Error(?:s|Level)|FileAttributes|'
             r'Font|OutPath|Overwrite|PluginUnload|RebootFlag|ShellVarContext|'
             r'Silent|StaticBkColor)|'
             r'Show(?:(?:I|Uni)nstDetails|Window)|Silent(?:Un)?Install|Sleep|'
             r'SpaceTexts|Str(?:CmpS?|Cpy|Len)|SubSection(?:End)?|'
             r'Uninstall(?:ButtonText|(?:Sub)?Caption|EXEName|Icon|Text)|'
             r'UninstPage|Var|VI(?:AddVersionKey|ProductVersion)|WindowIcon|'
             r'Write(?:INIStr|Reg(:?Bin|DWORD|(?:Expand)?Str)|Uninstaller)|'
             r'XPStyle)\b', Keyword),
            (r'\b(CUR|END|(?:FILE_ATTRIBUTE_)?'
             r'(?:ARCHIVE|HIDDEN|NORMAL|OFFLINE|READONLY|SYSTEM|TEMPORARY)|'
             r'HK(CC|CR|CU|DD|LM|PD|U)|'
             r'HKEY_(?:CLASSES_ROOT|CURRENT_(?:CONFIG|USER)|DYN_DATA|'
             r'LOCAL_MACHINE|PERFORMANCE_DATA|USERS)|'
             r'ID(?:ABORT|CANCEL|IGNORE|NO|OK|RETRY|YES)|'
             r'MB_(?:ABORTRETRYIGNORE|DEFBUTTON[1-4]|'
             r'ICON(?:EXCLAMATION|INFORMATION|QUESTION|STOP)|'
             r'OK(?:CANCEL)?|RETRYCANCEL|RIGHT|SETFOREGROUND|TOPMOST|USERICON|'
             r'YESNO(?:CANCEL)?)|SET|SHCTX|'
             r'SW_(?:HIDE|SHOW(?:MAXIMIZED|MINIMIZED|NORMAL))|'
             r'admin|all|auto|both|bottom|bzip2|checkbox|colored|current|false|'
             r'force|hide|highest|if(?:diff|newer)|lastused|leave|left|'
             r'listonly|lzma|nevershow|none|normal|off|on|pop|push|'
             r'radiobuttons|right|show|silent|silentlog|smooth|textonly|top|'
             r'true|try|user|zlib)\b', Name.Constant),
        ],
        'macro': [
            (r'\!(addincludedir(?:dir)?|addplugindir|appendfile|cd|define|'
             r'delfilefile|echo(?:message)?|else|endif|error|execute|'
             r'if(?:macro)?n?(?:def)?|include|insertmacro|macro(?:end)?|packhdr|'
             r'search(?:parse|replace)|system|tempfilesymbol|undef|verbose|'
             r'warning)\b', Comment.Preproc),
        ],
        'interpol': [
            (r'\$(R?[0-9])', Name.Builtin.Pseudo),    # registers
            (r'\$(ADMINTOOLS|APPDATA|CDBURN_AREA|COOKIES|COMMONFILES(?:32|64)|'
             r'DESKTOP|DOCUMENTS|EXE(?:DIR|FILE|PATH)|FAVORITES|FONTS|HISTORY|'
             r'HWNDPARENT|INTERNET_CACHE|LOCALAPPDATA|MUSIC|NETHOOD|PICTURES|'
             r'PLUGINSDIR|PRINTHOOD|PROFILE|PROGRAMFILES(?:32|64)|QUICKLAUNCH|'
             r'RECENT|RESOURCES(?:_LOCALIZED)?|SENDTO|SM(?:PROGRAMS|STARTUP)|'
             r'STARTMENU|SYSDIR|TEMP(?:LATES)?|VIDEOS|WINDIR|\{NSISDIR\})',
             Name.Builtin),
            (r'\$(CMDLINE|INSTDIR|OUTDIR|LANGUAGE)', Name.Variable.Global),
            (r'\$[a-z_]\w*', Name.Variable),
        ],
        'str_double': [
            (r'"', String.Double, '#pop'),
            (r'\$(\\[nrt"]|\$)', String.Escape),
            include('interpol'),
            (r'[^"]+', String.Double),
        ],
        'str_backtick': [
            (r'`', String.Double, '#pop'),
            (r'\$(\\[nrt"]|\$)', String.Escape),
            include('interpol'),
            (r'[^`]+', String.Double),
        ],
    }


class RPMSpecLexer(RegexLexer):
    """
    For RPM ``.spec`` files.
    """

    name = 'RPMSpec'
    aliases = ['spec']
    filenames = ['*.spec']
    mimetypes = ['text/x-rpm-spec']
    url = 'https://rpm-software-management.github.io/rpm/manual/spec.html'
    version_added = '1.6'

    _directives = ('(?:package|prep|build|install|clean|check|pre[a-z]*|'
                   'post[a-z]*|trigger[a-z]*|files)')

    tokens = {
        'root': [
            (r'#.*$', Comment),
            include('basic'),
        ],
        'description': [
            (r'^(%' + _directives + ')(.*)$',
             bygroups(Name.Decorator, Text), '#pop'),
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
        'changelog': [
            (r'\*.*$', Generic.Subheading),
            (r'^(%' + _directives + ')(.*)$',
             bygroups(Name.Decorator, Text), '#pop'),
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
        'string': [
            (r'"', String.Double, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            include('interpol'),
            (r'.', String.Double),
        ],
        'basic': [
            include('macro'),
            (r'(?i)^(Name|Version|Release|Epoch|Summary|Group|License|Packager|'
             r'Vendor|Icon|URL|Distribution|Prefix|Patch[0-9]*|Source[0-9]*|'
             r'Requires\(?[a-z]*\)?|[a-z]+Req|Obsoletes|Suggests|Provides|Conflicts|'
             r'Build[a-z]+|[a-z]+Arch|Auto[a-z]+)(:)(.*)$',
             bygroups(Generic.Heading, Punctuation, using(this))),
            (r'^%description', Name.Decorator, 'description'),
            (r'^%changelog', Name.Decorator, 'changelog'),
            (r'^(%' + _directives + ')(.*)$', bygroups(Name.Decorator, Text)),
            (r'%(attr|defattr|dir|doc(?:dir)?|setup|config(?:ure)?|'
             r'make(?:install)|ghost|patch[0-9]+|find_lang|exclude|verify)',
             Keyword),
            include('interpol'),
            (r"'.*?'", String.Single),
            (r'"', String.Double, 'string'),
            (r'\s+', Whitespace),
            (r'.', Text),
        ],
        'macro': [
            (r'%define.*$', Comment.Preproc),
            (r'%\{\!\?.*%define.*\}', Comment.Preproc),
            (r'(%(?:if(?:n?arch)?|else(?:if)?|endif))(.*)$',
             bygroups(Comment.Preproc, Text)),
        ],
        'interpol': [
            (r'%\{?__[a-z_]+\}?', Name.Function),
            (r'%\{?_([a-z_]+dir|[a-z_]+path|prefix)\}?', Keyword.Pseudo),
            (r'%\{\?\w+\}', Name.Variable),
            (r'\$\{?RPM_[A-Z0-9_]+\}?', Name.Variable.Global),
            (r'%\{[a-zA-Z]\w+\}', Keyword.Constant),
        ]
    }


class DebianSourcesLexer(RegexLexer):
    """
    Lexer that highlights debian.sources files.
    """

    name = 'Debian Sources file'
    aliases = ['debian.sources']
    filenames = ['*.sources']
    version_added = '2.19'
    url = 'https://manpages.debian.org/bookworm/apt/sources.list.5.en.html#THE_DEB_AND_DEB-SRC_TYPES:_GENERAL_FORMAT'

    tokens = {
        'root': [
            (r'^(Signed-By)(:)(\s*)', bygroups(Keyword, Punctuation, Whitespace), 'signed-by'),
            (r'^([a-zA-Z\-0-9\.]*?)(:)(\s*)(.*?)$',
             bygroups(Keyword, Punctuation, Whitespace, String)),
        ],
        'signed-by': [
            (r' -----END PGP PUBLIC KEY BLOCK-----\n', Text, '#pop'),
            (r'.+\n', Text),
        ],        
    }


class SourcesListLexer(RegexLexer):
    """
    Lexer that highlights debian sources.list files.
    """

    name = 'Debian Sourcelist'
    aliases = ['debsources', 'sourceslist', 'sources.list']
    filenames = ['sources.list']
    version_added = '0.7'
    mimetype = ['application/x-debian-sourceslist']
    url = 'https://wiki.debian.org/SourcesList'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#.*?$', Comment),
            (r'^(deb(?:-src)?)(\s+)',
             bygroups(Keyword, Whitespace), 'distribution')
        ],
        'distribution': [
            (r'#.*?$', Comment, '#pop'),
            (r'\$\(ARCH\)', Name.Variable),
            (r'[^\s$[]+', String),
            (r'\[', String.Other, 'escaped-distribution'),
            (r'\$', String),
            (r'\s+', Whitespace, 'components')
        ],
        'escaped-distribution': [
            (r'\]', String.Other, '#pop'),
            (r'\$\(ARCH\)', Name.Variable),
            (r'[^\]$]+', String.Other),
            (r'\$', String.Other)
        ],
        'components': [
            (r'#.*?$', Comment, '#pop:2'),
            (r'$', Text, '#pop:2'),
            (r'\s+', Whitespace),
            (r'\S+', Keyword.Pseudo),
        ]
    }

    def analyse_text(text):
        for line in text.splitlines():
            line = line.strip()
            if line.startswith('deb ') or line.startswith('deb-src '):
                return True


class DebianControlLexer(RegexLexer):
    """
    Lexer for Debian ``control`` files and ``apt-cache show <pkg>`` outputs.
    """
    name = 'Debian Control file'
    url = 'https://www.debian.org/doc/debian-policy/ch-controlfields.html'
    aliases = ['debcontrol', 'control']
    filenames = ['control']
    version_added = '0.9'

    tokens = {
        'root': [
            (r'^(Description)', Keyword, 'description'),
            (r'^(Maintainer|Uploaders|Changed-By)(:)(\s*)',
             bygroups(Keyword, Punctuation, Whitespace),
             'maintainer'),
            (r'^((?:Build-|Pre-)?Depends(?:-Indep|-Arch)?)(:)(\s*)',
             bygroups(Keyword, Punctuation, Whitespace), 'package_list'),
            (r'^(Recommends|Suggests|Enhances|Breaks|Replaces|Provides|Conflicts)(:)(\s*)',
             bygroups(Keyword, Punctuation, Whitespace), 'package_list'),
            (r'^((?:Python-)?Version)(:)(\s*)(\S+)$',
             bygroups(Keyword, Punctuation, Whitespace, Number)),
            (r'^((?:Installed-)?Size)(:)(\s*)(\S+)$',
             bygroups(Keyword, Punctuation, Whitespace, Number)),
            (r'^(MD5Sum|SHA1|SHA256)(:)(\s*)(\S+)$',
             bygroups(Keyword, Punctuation, Whitespace, Number)),
            (r'^([a-zA-Z\-0-9\.]*?)(:)(\s*)(.*?)$',
             bygroups(Keyword, Punctuation, Whitespace, String)),
        ],
        'maintainer': [
            (r'<[^>]+>$', Generic.Strong, '#pop'),
            (r'<[^>]+>', Generic.Strong),
            (r',\n?', Whitespace),
            (r'[^,<]+$', Text, '#pop'),
            (r'[^,<]+', Text),
        ],
        'description': [
            (r'(.*)(Homepage)(: )(\S+)',
             bygroups(Text, String, Name, Name.Class)),
            (r':.*\n', Generic.Strong),
            (r' .*\n', Text),
            default('#pop'),
        ],
        'package_list': [
            (r'(\$)(\{)(\w+)(\s*)(:)(\s*)(\w+)(\})',
             bygroups(Operator, Punctuation, Name.Entity, Whitespace,
                      Punctuation, Whitespace, Text, Punctuation)),
            (r'\(', Punctuation, 'package_list_vers'),
            (r'\|', Operator),
            (r'\n\s', Whitespace),
            (r'\n', Whitespace, '#pop'),
            (r'[,\s]', Text),
            (r'[+.a-zA-Z0-9-]+', Name.Function),
            (r'\[.*?\]', Name.Entity),
        ],
        'package_list_vers': [
            (r'\)', Punctuation, '#pop'),
            (r'([><=]+)(\s*)([^)]+)', bygroups(Operator, Whitespace, Number)),
        ]
    }
