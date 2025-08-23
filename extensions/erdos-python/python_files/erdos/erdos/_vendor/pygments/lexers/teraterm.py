"""
    pygments.lexers.teraterm
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for Tera Term macro files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Name, String, \
    Number, Keyword, Error

__all__ = ['TeraTermLexer']


class TeraTermLexer(RegexLexer):
    """
    For Tera Term macro source code.
    """
    name = 'Tera Term macro'
    url = 'https://ttssh2.osdn.jp/'
    aliases = ['teratermmacro', 'teraterm', 'ttl']
    filenames = ['*.ttl']
    mimetypes = ['text/x-teratermmacro']
    version_added = '2.4'

    tokens = {
        'root': [
            include('comments'),
            include('labels'),
            include('commands'),
            include('builtin-variables'),
            include('user-variables'),
            include('operators'),
            include('numeric-literals'),
            include('string-literals'),
            include('all-whitespace'),
            (r'\S', Text),
        ],
        'comments': [
            (r';[^\r\n]*', Comment.Single),
            (r'/\*', Comment.Multiline, 'in-comment'),
        ],
        'in-comment': [
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[^*/]+', Comment.Multiline),
            (r'[*/]', Comment.Multiline)
        ],
        'labels': [
            (r'(?i)^(\s*)(:[a-z0-9_]+)', bygroups(Text.Whitespace, Name.Label)),
        ],
        'commands': [
            (
                r'(?i)\b('
                r'basename|'
                r'beep|'
                r'bplusrecv|'
                r'bplussend|'
                r'break|'
                r'bringupbox|'
                # 'call' is handled separately.
                r'callmenu|'
                r'changedir|'
                r'checksum16|'
                r'checksum16file|'
                r'checksum32|'
                r'checksum32file|'
                r'checksum8|'
                r'checksum8file|'
                r'clearscreen|'
                r'clipb2var|'
                r'closesbox|'
                r'closett|'
                r'code2str|'
                r'connect|'
                r'continue|'
                r'crc16|'
                r'crc16file|'
                r'crc32|'
                r'crc32file|'
                r'cygconnect|'
                r'delpassword|'
                r'dirname|'
                r'dirnamebox|'
                r'disconnect|'
                r'dispstr|'
                r'do|'
                r'else|'
                r'elseif|'
                r'enablekeyb|'
                r'end|'
                r'endif|'
                r'enduntil|'
                r'endwhile|'
                r'exec|'
                r'execcmnd|'
                r'exit|'
                r'expandenv|'
                r'fileclose|'
                r'fileconcat|'
                r'filecopy|'
                r'filecreate|'
                r'filedelete|'
                r'filelock|'
                r'filemarkptr|'
                r'filenamebox|'
                r'fileopen|'
                r'fileread|'
                r'filereadln|'
                r'filerename|'
                r'filesearch|'
                r'fileseek|'
                r'fileseekback|'
                r'filestat|'
                r'filestrseek|'
                r'filestrseek2|'
                r'filetruncate|'
                r'fileunlock|'
                r'filewrite|'
                r'filewriteln|'
                r'findclose|'
                r'findfirst|'
                r'findnext|'
                r'flushrecv|'
                r'foldercreate|'
                r'folderdelete|'
                r'foldersearch|'
                r'for|'
                r'getdate|'
                r'getdir|'
                r'getenv|'
                r'getfileattr|'
                r'gethostname|'
                r'getipv4addr|'
                r'getipv6addr|'
                r'getmodemstatus|'
                r'getpassword|'
                r'getspecialfolder|'
                r'gettime|'
                r'gettitle|'
                r'getttdir|'
                r'getver|'
                # 'goto' is handled separately.
                r'if|'
                r'ifdefined|'
                r'include|'
                r'inputbox|'
                r'int2str|'
                r'intdim|'
                r'ispassword|'
                r'kmtfinish|'
                r'kmtget|'
                r'kmtrecv|'
                r'kmtsend|'
                r'listbox|'
                r'loadkeymap|'
                r'logautoclosemode|'
                r'logclose|'
                r'loginfo|'
                r'logopen|'
                r'logpause|'
                r'logrotate|'
                r'logstart|'
                r'logwrite|'
                r'loop|'
                r'makepath|'
                r'messagebox|'
                r'mpause|'
                r'next|'
                r'passwordbox|'
                r'pause|'
                r'quickvanrecv|'
                r'quickvansend|'
                r'random|'
                r'recvln|'
                r'regexoption|'
                r'restoresetup|'
                r'return|'
                r'rotateleft|'
                r'rotateright|'
                r'scprecv|'
                r'scpsend|'
                r'send|'
                r'sendbreak|'
                r'sendbroadcast|'
                r'sendfile|'
                r'sendkcode|'
                r'sendln|'
                r'sendlnbroadcast|'
                r'sendlnmulticast|'
                r'sendmulticast|'
                r'setbaud|'
                r'setdate|'
                r'setdebug|'
                r'setdir|'
                r'setdlgpos|'
                r'setdtr|'
                r'setecho|'
                r'setenv|'
                r'setexitcode|'
                r'setfileattr|'
                r'setflowctrl|'
                r'setmulticastname|'
                r'setpassword|'
                r'setrts|'
                r'setspeed|'
                r'setsync|'
                r'settime|'
                r'settitle|'
                r'show|'
                r'showtt|'
                r'sprintf|'
                r'sprintf2|'
                r'statusbox|'
                r'str2code|'
                r'str2int|'
                r'strcompare|'
                r'strconcat|'
                r'strcopy|'
                r'strdim|'
                r'strinsert|'
                r'strjoin|'
                r'strlen|'
                r'strmatch|'
                r'strremove|'
                r'strreplace|'
                r'strscan|'
                r'strspecial|'
                r'strsplit|'
                r'strtrim|'
                r'testlink|'
                r'then|'
                r'tolower|'
                r'toupper|'
                r'unlink|'
                r'until|'
                r'uptime|'
                r'var2clipb|'
                r'wait|'
                r'wait4all|'
                r'waitevent|'
                r'waitln|'
                r'waitn|'
                r'waitrecv|'
                r'waitregex|'
                r'while|'
                r'xmodemrecv|'
                r'xmodemsend|'
                r'yesnobox|'
                r'ymodemrecv|'
                r'ymodemsend|'
                r'zmodemrecv|'
                r'zmodemsend'
                r')\b',
                Keyword,
            ),
            (r'(?i)(call|goto)([ \t]+)([a-z0-9_]+)',
             bygroups(Keyword, Text.Whitespace, Name.Label)),
        ],
        'builtin-variables': [
            (
                r'(?i)('
                r'groupmatchstr1|'
                r'groupmatchstr2|'
                r'groupmatchstr3|'
                r'groupmatchstr4|'
                r'groupmatchstr5|'
                r'groupmatchstr6|'
                r'groupmatchstr7|'
                r'groupmatchstr8|'
                r'groupmatchstr9|'
                r'inputstr|'
                r'matchstr|'
                r'mtimeout|'
                r'param1|'
                r'param2|'
                r'param3|'
                r'param4|'
                r'param5|'
                r'param6|'
                r'param7|'
                r'param8|'
                r'param9|'
                r'paramcnt|'
                r'params|'
                r'result|'
                r'timeout'
                r')\b',
                Name.Builtin
            ),
        ],
        'user-variables': [
            (r'(?i)[a-z_][a-z0-9_]*', Name.Variable),
        ],
        'numeric-literals': [
            (r'(-?)([0-9]+)', bygroups(Operator, Number.Integer)),
            (r'(?i)\$[0-9a-f]+', Number.Hex),
        ],
        'string-literals': [
            (r'(?i)#(?:[0-9]+|\$[0-9a-f]+)', String.Char),
            (r"'[^'\n]*'", String.Single),
            (r'"[^"\n]*"', String.Double),
            # Opening quotes without a closing quote on the same line are errors.
            (r"('[^']*)(\n)", bygroups(Error, Text.Whitespace)),
            (r'("[^"]*)(\n)', bygroups(Error, Text.Whitespace)),
        ],
        'operators': [
            (r'and|not|or|xor', Operator.Word),
            (r'[!%&*+<=>^~\|\/-]+', Operator),
            (r'[()]', String.Symbol),
        ],
        'all-whitespace': [
            (r'\s+', Text.Whitespace),
        ],
    }

    # Turtle and Tera Term macro files share the same file extension
    # but each has a recognizable and distinct syntax.
    def analyse_text(text):
        if re.search(TeraTermLexer.tokens['commands'][0][0], text):
            return 0.01
