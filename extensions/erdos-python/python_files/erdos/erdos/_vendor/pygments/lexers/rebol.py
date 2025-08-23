"""
    pygments.lexers.rebol
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for the REBOL and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Generic, Whitespace

__all__ = ['RebolLexer', 'RedLexer']


class RebolLexer(RegexLexer):
    """
    A REBOL lexer.
    """
    name = 'REBOL'
    aliases = ['rebol']
    filenames = ['*.r', '*.r3', '*.reb']
    mimetypes = ['text/x-rebol']
    url = 'http://www.rebol.com'
    version_added = '1.1'

    flags = re.IGNORECASE | re.MULTILINE

    escape_re = r'(?:\^\([0-9a-f]{1,4}\)*)'

    def word_callback(lexer, match):
        word = match.group()

        if re.match(".*:$", word):
            yield match.start(), Generic.Subheading, word
        elif re.match(
            r'(native|alias|all|any|as-string|as-binary|bind|bound\?|case|'
            r'catch|checksum|comment|debase|dehex|exclude|difference|disarm|'
            r'either|else|enbase|foreach|remove-each|form|free|get|get-env|if|'
            r'in|intersect|loop|minimum-of|maximum-of|mold|new-line|'
            r'new-line\?|not|now|prin|print|reduce|compose|construct|repeat|'
            r'reverse|save|script\?|set|shift|switch|throw|to-hex|trace|try|'
            r'type\?|union|unique|unless|unprotect|unset|until|use|value\?|'
            r'while|compress|decompress|secure|open|close|read|read-io|'
            r'write-io|write|update|query|wait|input\?|exp|log-10|log-2|'
            r'log-e|square-root|cosine|sine|tangent|arccosine|arcsine|'
            r'arctangent|protect|lowercase|uppercase|entab|detab|connected\?|'
            r'browse|launch|stats|get-modes|set-modes|to-local-file|'
            r'to-rebol-file|encloak|decloak|create-link|do-browser|bind\?|'
            r'hide|draw|show|size-text|textinfo|offset-to-caret|'
            r'caret-to-offset|local-request-file|rgb-to-hsv|hsv-to-rgb|'
            r'crypt-strength\?|dh-make-key|dh-generate-key|dh-compute-key|'
            r'dsa-make-key|dsa-generate-key|dsa-make-signature|'
            r'dsa-verify-signature|rsa-make-key|rsa-generate-key|'
            r'rsa-encrypt)$', word):
            yield match.start(), Name.Builtin, word
        elif re.match(
            r'(add|subtract|multiply|divide|remainder|power|and~|or~|xor~|'
            r'minimum|maximum|negate|complement|absolute|random|head|tail|'
            r'next|back|skip|at|pick|first|second|third|fourth|fifth|sixth|'
            r'seventh|eighth|ninth|tenth|last|path|find|select|make|to|copy\*|'
            r'insert|remove|change|poke|clear|trim|sort|min|max|abs|cp|'
            r'copy)$', word):
            yield match.start(), Name.Function, word
        elif re.match(
            r'(error|source|input|license|help|install|echo|Usage|with|func|'
            r'throw-on-error|function|does|has|context|probe|\?\?|as-pair|'
            r'mod|modulo|round|repend|about|set-net|append|join|rejoin|reform|'
            r'remold|charset|array|replace|move|extract|forskip|forall|alter|'
            r'first+|also|take|for|forever|dispatch|attempt|what-dir|'
            r'change-dir|clean-path|list-dir|dirize|rename|split-path|delete|'
            r'make-dir|delete-dir|in-dir|confirm|dump-obj|upgrade|what|'
            r'build-tag|process-source|build-markup|decode-cgi|read-cgi|'
            r'write-user|save-user|set-user-name|protect-system|parse-xml|'
            r'cvs-date|cvs-version|do-boot|get-net-info|desktop|layout|'
            r'scroll-para|get-face|alert|set-face|uninstall|unfocus|'
            r'request-dir|center-face|do-events|net-error|decode-url|'
            r'parse-header|parse-header-date|parse-email-addrs|import-email|'
            r'send|build-attach-body|resend|show-popup|hide-popup|open-events|'
            r'find-key-face|do-face|viewtop|confine|find-window|'
            r'insert-event-func|remove-event-func|inform|dump-pane|dump-face|'
            r'flag-face|deflag-face|clear-fields|read-net|vbug|path-thru|'
            r'read-thru|load-thru|do-thru|launch-thru|load-image|'
            r'request-download|do-face-alt|set-font|set-para|get-style|'
            r'set-style|make-face|stylize|choose|hilight-text|hilight-all|'
            r'unlight-text|focus|scroll-drag|clear-face|reset-face|scroll-face|'
            r'resize-face|load-stock|load-stock-block|notify|request|flash|'
            r'request-color|request-pass|request-text|request-list|'
            r'request-date|request-file|dbug|editor|link-relative-path|'
            r'emailer|parse-error)$', word):
            yield match.start(), Keyword.Namespace, word
        elif re.match(
            r'(halt|quit|do|load|q|recycle|call|run|ask|parse|view|unview|'
            r'return|exit|break)$', word):
            yield match.start(), Name.Exception, word
        elif re.match('REBOL$', word):
            yield match.start(), Generic.Heading, word
        elif re.match("to-.*", word):
            yield match.start(), Keyword, word
        elif re.match(r'(\+|-|\*|/|//|\*\*|and|or|xor|=\?|=|==|<>|<|>|<=|>=)$',
                      word):
            yield match.start(), Operator, word
        elif re.match(r".*\?$", word):
            yield match.start(), Keyword, word
        elif re.match(r".*\!$", word):
            yield match.start(), Keyword.Type, word
        elif re.match("'.*", word):
            yield match.start(), Name.Variable.Instance, word  # lit-word
        elif re.match("#.*", word):
            yield match.start(), Name.Label, word  # issue
        elif re.match("%.*", word):
            yield match.start(), Name.Decorator, word  # file
        else:
            yield match.start(), Name.Variable, word

    tokens = {
        'root': [
            (r'\s+', Text),
            (r'#"', String.Char, 'char'),
            (r'#\{[0-9a-f]*\}', Number.Hex),
            (r'2#\{', Number.Hex, 'bin2'),
            (r'64#\{[0-9a-z+/=\s]*\}', Number.Hex),
            (r'"', String, 'string'),
            (r'\{', String, 'string2'),
            (r';#+.*\n', Comment.Special),
            (r';\*+.*\n', Comment.Preproc),
            (r';.*\n', Comment),
            (r'%"', Name.Decorator, 'stringFile'),
            (r'%[^(^{")\s\[\]]+', Name.Decorator),
            (r'[+-]?([a-z]{1,3})?\$\d+(\.\d+)?', Number.Float),  # money
            (r'[+-]?\d+\:\d+(\:\d+)?(\.\d+)?', String.Other),    # time
            (r'\d+[\-/][0-9a-z]+[\-/]\d+(\/\d+\:\d+((\:\d+)?'
             r'([.\d+]?([+-]?\d+:\d+)?)?)?)?', String.Other),   # date
            (r'\d+(\.\d+)+\.\d+', Keyword.Constant),             # tuple
            (r'\d+X\d+', Keyword.Constant),                   # pair
            (r'[+-]?\d+(\'\d+)?([.,]\d*)?E[+-]?\d+', Number.Float),
            (r'[+-]?\d+(\'\d+)?[.,]\d*', Number.Float),
            (r'[+-]?\d+(\'\d+)?', Number),
            (r'[\[\]()]', Generic.Strong),
            (r'[a-z]+[^(^{"\s:)]*://[^(^{"\s)]*', Name.Decorator),  # url
            (r'mailto:[^(^{"@\s)]+@[^(^{"@\s)]+', Name.Decorator),  # url
            (r'[^(^{"@\s)]+@[^(^{"@\s)]+', Name.Decorator),         # email
            (r'comment\s"', Comment, 'commentString1'),
            (r'comment\s\{', Comment, 'commentString2'),
            (r'comment\s\[', Comment, 'commentBlock'),
            (r'comment\s[^(\s{"\[]+', Comment),
            (r'/[^(^{")\s/[\]]*', Name.Attribute),
            (r'([^(^{")\s/[\]]+)(?=[:({"\s/\[\]])', word_callback),
            (r'<[\w:.-]*>', Name.Tag),
            (r'<[^(<>\s")]+', Name.Tag, 'tag'),
            (r'([^(^{")\s]+)', Text),
        ],
        'string': [
            (r'[^(^")]+', String),
            (escape_re, String.Escape),
            (r'[(|)]+', String),
            (r'\^.', String.Escape),
            (r'"', String, '#pop'),
        ],
        'string2': [
            (r'[^(^{})]+', String),
            (escape_re, String.Escape),
            (r'[(|)]+', String),
            (r'\^.', String.Escape),
            (r'\{', String, '#push'),
            (r'\}', String, '#pop'),
        ],
        'stringFile': [
            (r'[^(^")]+', Name.Decorator),
            (escape_re, Name.Decorator),
            (r'\^.', Name.Decorator),
            (r'"', Name.Decorator, '#pop'),
        ],
        'char': [
            (escape_re + '"', String.Char, '#pop'),
            (r'\^."', String.Char, '#pop'),
            (r'."', String.Char, '#pop'),
        ],
        'tag': [
            (escape_re, Name.Tag),
            (r'"', Name.Tag, 'tagString'),
            (r'[^(<>\r\n")]+', Name.Tag),
            (r'>', Name.Tag, '#pop'),
        ],
        'tagString': [
            (r'[^(^")]+', Name.Tag),
            (escape_re, Name.Tag),
            (r'[(|)]+', Name.Tag),
            (r'\^.', Name.Tag),
            (r'"', Name.Tag, '#pop'),
        ],
        'tuple': [
            (r'(\d+\.)+', Keyword.Constant),
            (r'\d+', Keyword.Constant, '#pop'),
        ],
        'bin2': [
            (r'\s+', Number.Hex),
            (r'([01]\s*){8}', Number.Hex),
            (r'\}', Number.Hex, '#pop'),
        ],
        'commentString1': [
            (r'[^(^")]+', Comment),
            (escape_re, Comment),
            (r'[(|)]+', Comment),
            (r'\^.', Comment),
            (r'"', Comment, '#pop'),
        ],
        'commentString2': [
            (r'[^(^{})]+', Comment),
            (escape_re, Comment),
            (r'[(|)]+', Comment),
            (r'\^.', Comment),
            (r'\{', Comment, '#push'),
            (r'\}', Comment, '#pop'),
        ],
        'commentBlock': [
            (r'\[', Comment, '#push'),
            (r'\]', Comment, '#pop'),
            (r'"', Comment, "commentString1"),
            (r'\{', Comment, "commentString2"),
            (r'[^(\[\]"{)]+', Comment),
        ],
    }

    def analyse_text(text):
        """
        Check if code contains REBOL header and so it probably not R code
        """
        if re.match(r'^\s*REBOL\s*\[', text, re.IGNORECASE):
            # The code starts with REBOL header
            return 1.0
        elif re.search(r'\s*REBOL\s*\[', text, re.IGNORECASE):
            # The code contains REBOL header but also some text before it
            return 0.5


class RedLexer(RegexLexer):
    """
    A Red-language lexer.
    """
    name = 'Red'
    aliases = ['red', 'red/system']
    filenames = ['*.red', '*.reds']
    mimetypes = ['text/x-red', 'text/x-red-system']
    url = 'https://www.red-lang.org'
    version_added = '2.0'

    flags = re.IGNORECASE | re.MULTILINE

    escape_re = r'(?:\^\([0-9a-f]{1,4}\)*)'

    def word_callback(lexer, match):
        word = match.group()

        if re.match(".*:$", word):
            yield match.start(), Generic.Subheading, word
        elif re.match(r'(if|unless|either|any|all|while|until|loop|repeat|'
                      r'foreach|forall|func|function|does|has|switch|'
                      r'case|reduce|compose|get|set|print|prin|equal\?|'
                      r'not-equal\?|strict-equal\?|lesser\?|greater\?|lesser-or-equal\?|'
                      r'greater-or-equal\?|same\?|not|type\?|stats|'
                      r'bind|union|replace|charset|routine)$', word):
            yield match.start(), Name.Builtin, word
        elif re.match(r'(make|random|reflect|to|form|mold|absolute|add|divide|multiply|negate|'
                      r'power|remainder|round|subtract|even\?|odd\?|and~|complement|or~|xor~|'
                      r'append|at|back|change|clear|copy|find|head|head\?|index\?|insert|'
                      r'length\?|next|pick|poke|remove|reverse|select|sort|skip|swap|tail|tail\?|'
                      r'take|trim|create|close|delete|modify|open|open\?|query|read|rename|'
                      r'update|write)$', word):
            yield match.start(), Name.Function, word
        elif re.match(r'(yes|on|no|off|true|false|tab|cr|lf|newline|escape|slash|sp|space|null|'
                      r'none|crlf|dot|null-byte)$', word):
            yield match.start(), Name.Builtin.Pseudo, word
        elif re.match(r'(#system-global|#include|#enum|#define|#either|#if|#import|#export|'
                      r'#switch|#default|#get-definition)$', word):
            yield match.start(), Keyword.Namespace, word
        elif re.match(r'(system|halt|quit|quit-return|do|load|q|recycle|call|run|ask|parse|'
                      r'raise-error|return|exit|break|alias|push|pop|probe|\?\?|spec-of|body-of|'
                      r'quote|forever)$', word):
            yield match.start(), Name.Exception, word
        elif re.match(r'(action\?|block\?|char\?|datatype\?|file\?|function\?|get-path\?|zero\?|'
                      r'get-word\?|integer\?|issue\?|lit-path\?|lit-word\?|logic\?|native\?|'
                      r'op\?|paren\?|path\?|refinement\?|set-path\?|set-word\?|string\?|unset\?|'
                      r'any-struct\?|none\?|word\?|any-series\?)$', word):
            yield match.start(), Keyword, word
        elif re.match(r'(JNICALL|stdcall|cdecl|infix)$', word):
            yield match.start(), Keyword.Namespace, word
        elif re.match("to-.*", word):
            yield match.start(), Keyword, word
        elif re.match(r'(\+|-\*\*|-|\*\*|//|/|\*|and|or|xor|=\?|===|==|=|<>|<=|>=|'
                      r'<<<|>>>|<<|>>|<|>%)$', word):
            yield match.start(), Operator, word
        elif re.match(r".*\!$", word):
            yield match.start(), Keyword.Type, word
        elif re.match("'.*", word):
            yield match.start(), Name.Variable.Instance, word  # lit-word
        elif re.match("#.*", word):
            yield match.start(), Name.Label, word  # issue
        elif re.match("%.*", word):
            yield match.start(), Name.Decorator, word  # file
        elif re.match(":.*", word):
            yield match.start(), Generic.Subheading, word  # get-word
        else:
            yield match.start(), Name.Variable, word

    tokens = {
        'root': [
            (r'\s+', Text),
            (r'#"', String.Char, 'char'),
            (r'#\{[0-9a-f\s]*\}', Number.Hex),
            (r'2#\{', Number.Hex, 'bin2'),
            (r'64#\{[0-9a-z+/=\s]*\}', Number.Hex),
            (r'([0-9a-f]+)(h)((\s)|(?=[\[\]{}"()]))',
             bygroups(Number.Hex, Name.Variable, Whitespace)),
            (r'"', String, 'string'),
            (r'\{', String, 'string2'),
            (r';#+.*\n', Comment.Special),
            (r';\*+.*\n', Comment.Preproc),
            (r';.*\n', Comment),
            (r'%"', Name.Decorator, 'stringFile'),
            (r'%[^(^{")\s\[\]]+', Name.Decorator),
            (r'[+-]?([a-z]{1,3})?\$\d+(\.\d+)?', Number.Float),  # money
            (r'[+-]?\d+\:\d+(\:\d+)?(\.\d+)?', String.Other),    # time
            (r'\d+[\-/][0-9a-z]+[\-/]\d+(/\d+:\d+((:\d+)?'
             r'([\.\d+]?([+-]?\d+:\d+)?)?)?)?', String.Other),   # date
            (r'\d+(\.\d+)+\.\d+', Keyword.Constant),             # tuple
            (r'\d+X\d+', Keyword.Constant),                   # pair
            (r'[+-]?\d+(\'\d+)?([.,]\d*)?E[+-]?\d+', Number.Float),
            (r'[+-]?\d+(\'\d+)?[.,]\d*', Number.Float),
            (r'[+-]?\d+(\'\d+)?', Number),
            (r'[\[\]()]', Generic.Strong),
            (r'[a-z]+[^(^{"\s:)]*://[^(^{"\s)]*', Name.Decorator),  # url
            (r'mailto:[^(^{"@\s)]+@[^(^{"@\s)]+', Name.Decorator),  # url
            (r'[^(^{"@\s)]+@[^(^{"@\s)]+', Name.Decorator),         # email
            (r'comment\s"', Comment, 'commentString1'),
            (r'comment\s\{', Comment, 'commentString2'),
            (r'comment\s\[', Comment, 'commentBlock'),
            (r'comment\s[^(\s{"\[]+', Comment),
            (r'/[^(^{^")\s/[\]]*', Name.Attribute),
            (r'([^(^{^")\s/[\]]+)(?=[:({"\s/\[\]])', word_callback),
            (r'<[\w:.-]*>', Name.Tag),
            (r'<[^(<>\s")]+', Name.Tag, 'tag'),
            (r'([^(^{")\s]+)', Text),
        ],
        'string': [
            (r'[^(^")]+', String),
            (escape_re, String.Escape),
            (r'[(|)]+', String),
            (r'\^.', String.Escape),
            (r'"', String, '#pop'),
        ],
        'string2': [
            (r'[^(^{})]+', String),
            (escape_re, String.Escape),
            (r'[(|)]+', String),
            (r'\^.', String.Escape),
            (r'\{', String, '#push'),
            (r'\}', String, '#pop'),
        ],
        'stringFile': [
            (r'[^(^")]+', Name.Decorator),
            (escape_re, Name.Decorator),
            (r'\^.', Name.Decorator),
            (r'"', Name.Decorator, '#pop'),
        ],
        'char': [
            (escape_re + '"', String.Char, '#pop'),
            (r'\^."', String.Char, '#pop'),
            (r'."', String.Char, '#pop'),
        ],
        'tag': [
            (escape_re, Name.Tag),
            (r'"', Name.Tag, 'tagString'),
            (r'[^(<>\r\n")]+', Name.Tag),
            (r'>', Name.Tag, '#pop'),
        ],
        'tagString': [
            (r'[^(^")]+', Name.Tag),
            (escape_re, Name.Tag),
            (r'[(|)]+', Name.Tag),
            (r'\^.', Name.Tag),
            (r'"', Name.Tag, '#pop'),
        ],
        'tuple': [
            (r'(\d+\.)+', Keyword.Constant),
            (r'\d+', Keyword.Constant, '#pop'),
        ],
        'bin2': [
            (r'\s+', Number.Hex),
            (r'([01]\s*){8}', Number.Hex),
            (r'\}', Number.Hex, '#pop'),
        ],
        'commentString1': [
            (r'[^(^")]+', Comment),
            (escape_re, Comment),
            (r'[(|)]+', Comment),
            (r'\^.', Comment),
            (r'"', Comment, '#pop'),
        ],
        'commentString2': [
            (r'[^(^{})]+', Comment),
            (escape_re, Comment),
            (r'[(|)]+', Comment),
            (r'\^.', Comment),
            (r'\{', Comment, '#push'),
            (r'\}', Comment, '#pop'),
        ],
        'commentBlock': [
            (r'\[', Comment, '#push'),
            (r'\]', Comment, '#pop'),
            (r'"', Comment, "commentString1"),
            (r'\{', Comment, "commentString2"),
            (r'[^(\[\]"{)]+', Comment),
        ],
    }
