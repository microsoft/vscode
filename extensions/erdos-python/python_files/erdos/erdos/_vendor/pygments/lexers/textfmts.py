"""
    pygments.lexers.textfmts
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for various text formats.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexers import guess_lexer, get_lexer_by_name
from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default, include
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Generic, Literal, Punctuation
from erdos.erdos._vendor.pygments.util import ClassNotFound

__all__ = ['IrcLogsLexer', 'TodotxtLexer', 'HttpLexer', 'GettextLexer',
           'NotmuchLexer', 'KernelLogLexer']


class IrcLogsLexer(RegexLexer):
    """
    Lexer for IRC logs in *irssi*, *xchat* or *weechat* style.
    """

    name = 'IRC logs'
    aliases = ['irc']
    filenames = ['*.weechatlog']
    mimetypes = ['text/x-irclog']
    url = 'https://en.wikipedia.org/wiki/Internet_Relay_Chat'
    version_added = ''

    flags = re.VERBOSE | re.MULTILINE
    timestamp = r"""
        (
          # irssi / xchat and others
          (?: \[|\()?                  # Opening bracket or paren for the timestamp
            (?:                        # Timestamp
                (?: (?:\d{1,4} [-/])*  # Date as - or /-separated groups of digits
                    (?:\d{1,4})
                 [T ])?                # Date/time separator: T or space
                (?: \d?\d [:.])*       # Time as :/.-separated groups of 1 or 2 digits
                    (?: \d?\d)
            )
          (?: \]|\))?\s+               # Closing bracket or paren for the timestamp
        |
          # weechat
          \d{4}\s\w{3}\s\d{2}\s        # Date
          \d{2}:\d{2}:\d{2}\s+         # Time + Whitespace
        |
          # xchat
          \w{3}\s\d{2}\s               # Date
          \d{2}:\d{2}:\d{2}\s+         # Time + Whitespace
        )?
    """
    tokens = {
        'root': [
            # log start/end
            (r'^\*\*\*\*(.*)\*\*\*\*$', Comment),
            # hack
            ("^" + timestamp + r'(\s*<[^>]*>\s*)$', bygroups(Comment.Preproc, Name.Tag)),
            # normal msgs
            ("^" + timestamp + r"""
                (\s*<.*?>\s*)          # Nick """,
             bygroups(Comment.Preproc, Name.Tag), 'msg'),
            # /me msgs
            ("^" + timestamp + r"""
                (\s*[*]\s+)            # Star
                (\S+\s+.*?\n)          # Nick + rest of message """,
             bygroups(Comment.Preproc, Keyword, Generic.Inserted)),
            # join/part msgs
            ("^" + timestamp + r"""
                (\s*(?:\*{3}|<?-[!@=P]?->?)\s*)  # Star(s) or symbols
                (\S+\s+)                     # Nick + Space
                (.*?\n)                         # Rest of message """,
             bygroups(Comment.Preproc, Keyword, String, Comment)),
            (r"^.*?\n", Text),
        ],
        'msg': [
            (r"\S+:(?!//)", Name.Attribute),  # Prefix
            (r".*\n", Text, '#pop'),
        ],
    }


class GettextLexer(RegexLexer):
    """
    Lexer for Gettext catalog files.
    """
    name = 'Gettext Catalog'
    aliases = ['pot', 'po']
    filenames = ['*.pot', '*.po']
    mimetypes = ['application/x-gettext', 'text/x-gettext', 'text/gettext']
    url = 'https://www.gnu.org/software/gettext'
    version_added = '0.9'

    tokens = {
        'root': [
            (r'^#,\s.*?$', Keyword.Type),
            (r'^#:\s.*?$', Keyword.Declaration),
            # (r'^#$', Comment),
            (r'^(#|#\.\s|#\|\s|#~\s|#\s).*$', Comment.Single),
            (r'^(")([A-Za-z-]+:)(.*")$',
             bygroups(String, Name.Property, String)),
            (r'^".*"$', String),
            (r'^(msgid|msgid_plural|msgstr|msgctxt)(\s+)(".*")$',
             bygroups(Name.Variable, Text, String)),
            (r'^(msgstr\[)(\d)(\])(\s+)(".*")$',
             bygroups(Name.Variable, Number.Integer, Name.Variable, Text, String)),
        ]
    }


class HttpLexer(RegexLexer):
    """
    Lexer for HTTP sessions.
    """

    name = 'HTTP'
    aliases = ['http']
    url = 'https://httpwg.org/specs'
    version_added = '1.5'

    flags = re.DOTALL

    def get_tokens_unprocessed(self, text, stack=('root',)):
        """Reset the content-type state."""
        self.content_type = None
        return RegexLexer.get_tokens_unprocessed(self, text, stack)

    def header_callback(self, match):
        if match.group(1).lower() == 'content-type':
            content_type = match.group(5).strip()
            if ';' in content_type:
                content_type = content_type[:content_type.find(';')].strip()
            self.content_type = content_type
        yield match.start(1), Name.Attribute, match.group(1)
        yield match.start(2), Text, match.group(2)
        yield match.start(3), Operator, match.group(3)
        yield match.start(4), Text, match.group(4)
        yield match.start(5), Literal, match.group(5)
        yield match.start(6), Text, match.group(6)

    def continuous_header_callback(self, match):
        yield match.start(1), Text, match.group(1)
        yield match.start(2), Literal, match.group(2)
        yield match.start(3), Text, match.group(3)

    def content_callback(self, match):
        content_type = getattr(self, 'content_type', None)
        content = match.group()
        offset = match.start()
        if content_type:
            from erdos.erdos._vendor.pygments.lexers import get_lexer_for_mimetype
            possible_lexer_mimetypes = [content_type]
            if '+' in content_type:
                # application/calendar+xml can be treated as application/xml
                # if there's not a better match.
                general_type = re.sub(r'^(.*)/.*\+(.*)$', r'\1/\2',
                                      content_type)
                possible_lexer_mimetypes.append(general_type)

            for i in possible_lexer_mimetypes:
                try:
                    lexer = get_lexer_for_mimetype(i)
                except ClassNotFound:
                    pass
                else:
                    for idx, token, value in lexer.get_tokens_unprocessed(content):
                        yield offset + idx, token, value
                    return
        yield offset, Text, content

    tokens = {
        'root': [
            (r'([a-zA-Z][-_a-zA-Z]+)( +)([^ ]+)( +)'
             r'(HTTP)(/)(1\.[01]|2(?:\.0)?|3)(\r?\n|\Z)',
             bygroups(Name.Function, Text, Name.Namespace, Text,
                      Keyword.Reserved, Operator, Number, Text),
             'headers'),
            (r'(HTTP)(/)(1\.[01]|2(?:\.0)?|3)( +)(\d{3})(?:( +)([^\r\n]*))?(\r?\n|\Z)',
             bygroups(Keyword.Reserved, Operator, Number, Text, Number, Text,
                      Name.Exception, Text),
             'headers'),
        ],
        'headers': [
            (r'([^\s:]+)( *)(:)( *)([^\r\n]*)(\r?\n|\Z)', header_callback),
            (r'([\t ]+)([^\r\n]+)(\r?\n|\Z)', continuous_header_callback),
            (r'\r?\n', Text, 'content')
        ],
        'content': [
            (r'.+', content_callback)
        ]
    }

    def analyse_text(text):
        return any (
            re.search(pattern, text) is not None
            for pattern in (
                r'^([a-zA-Z][-_a-zA-Z]+)( +)([^ ]+)( +)(HTTP)(/)(1\.[01]|2(?:\.0)?|3)(\r?\n|\Z)',
                r'^(HTTP)(/)(1\.[01]|2(?:\.0)?|3)( +)(\d{3})(?:( +)([^\r\n]*))?(\r?\n|\Z)',
            )
        )


class TodotxtLexer(RegexLexer):
    """
    Lexer for Todo.txt todo list format.
    """

    name = 'Todotxt'
    url = 'http://todotxt.com/'
    aliases = ['todotxt']
    version_added = '2.0'
    # *.todotxt is not a standard extension for Todo.txt files; including it
    # makes testing easier, and also makes autodetecting file type easier.
    filenames = ['todo.txt', '*.todotxt']
    mimetypes = ['text/x-todo']

    # Aliases mapping standard token types of Todo.txt format concepts
    CompleteTaskText = Operator  # Chosen to de-emphasize complete tasks
    IncompleteTaskText = Text    # Incomplete tasks should look like plain text

    # Priority should have most emphasis to indicate importance of tasks
    Priority = Generic.Heading
    # Dates should have next most emphasis because time is important
    Date = Generic.Subheading

    # Project and context should have equal weight, and be in different colors
    Project = Generic.Error
    Context = String

    # If tag functionality is added, it should have the same weight as Project
    # and Context, and a different color. Generic.Traceback would work well.

    # Regex patterns for building up rules; dates, priorities, projects, and
    # contexts are all atomic
    # TODO: Make date regex more ISO 8601 compliant
    date_regex = r'\d{4,}-\d{2}-\d{2}'
    priority_regex = r'\([A-Z]\)'
    project_regex = r'\+\S+'
    context_regex = r'@\S+'

    # Compound regex expressions
    complete_one_date_regex = r'(x )(' + date_regex + r')'
    complete_two_date_regex = (complete_one_date_regex + r'( )(' +
                               date_regex + r')')
    priority_date_regex = r'(' + priority_regex + r')( )(' + date_regex + r')'

    tokens = {
        # Should parse starting at beginning of line; each line is a task
        'root': [
            # Complete task entry points: two total:
            # 1. Complete task with two dates
            (complete_two_date_regex, bygroups(CompleteTaskText, Date,
                                               CompleteTaskText, Date),
             'complete'),
            # 2. Complete task with one date
            (complete_one_date_regex, bygroups(CompleteTaskText, Date),
             'complete'),

            # Incomplete task entry points: six total:
            # 1. Priority plus date
            (priority_date_regex, bygroups(Priority, IncompleteTaskText, Date),
             'incomplete'),
            # 2. Priority only
            (priority_regex, Priority, 'incomplete'),
            # 3. Leading date
            (date_regex, Date, 'incomplete'),
            # 4. Leading context
            (context_regex, Context, 'incomplete'),
            # 5. Leading project
            (project_regex, Project, 'incomplete'),
            # 6. Non-whitespace catch-all
            (r'\S+', IncompleteTaskText, 'incomplete'),
        ],

        # Parse a complete task
        'complete': [
            # Newline indicates end of task, should return to root
            (r'\s*\n', CompleteTaskText, '#pop'),
            # Tokenize contexts and projects
            (context_regex, Context),
            (project_regex, Project),
            # Tokenize non-whitespace text
            (r'\S+', CompleteTaskText),
            # Tokenize whitespace not containing a newline
            (r'\s+', CompleteTaskText),
        ],

        # Parse an incomplete task
        'incomplete': [
            # Newline indicates end of task, should return to root
            (r'\s*\n', IncompleteTaskText, '#pop'),
            # Tokenize contexts and projects
            (context_regex, Context),
            (project_regex, Project),
            # Tokenize non-whitespace text
            (r'\S+', IncompleteTaskText),
            # Tokenize whitespace not containing a newline
            (r'\s+', IncompleteTaskText),
        ],
    }


class NotmuchLexer(RegexLexer):
    """
    For Notmuch email text format.

    Additional options accepted:

    `body_lexer`
        If given, highlight the contents of the message body with the specified
        lexer, else guess it according to the body content (default: ``None``).
    """

    name = 'Notmuch'
    url = 'https://notmuchmail.org/'
    aliases = ['notmuch']
    version_added = '2.5'

    def _highlight_code(self, match):
        code = match.group(1)

        try:
            if self.body_lexer:
                lexer = get_lexer_by_name(self.body_lexer)
            else:
                lexer = guess_lexer(code.strip())
        except ClassNotFound:
            lexer = get_lexer_by_name('text')

        yield from lexer.get_tokens_unprocessed(code)

    tokens = {
        'root': [
            (r'\fmessage\{\s*', Keyword, ('message', 'message-attr')),
        ],
        'message-attr': [
            (r'(\s*id:\s*)(\S+)', bygroups(Name.Attribute, String)),
            (r'(\s*(?:depth|match|excluded):\s*)(\d+)',
             bygroups(Name.Attribute, Number.Integer)),
            (r'(\s*filename:\s*)(.+\n)',
             bygroups(Name.Attribute, String)),
            default('#pop'),
        ],
        'message': [
            (r'\fmessage\}\n', Keyword, '#pop'),
            (r'\fheader\{\n', Keyword, 'header'),
            (r'\fbody\{\n', Keyword, 'body'),
        ],
        'header': [
            (r'\fheader\}\n', Keyword, '#pop'),
            (r'((?:Subject|From|To|Cc|Date):\s*)(.*\n)',
             bygroups(Name.Attribute, String)),
            (r'(.*)(\s*\(.*\))(\s*\(.*\)\n)',
             bygroups(Generic.Strong, Literal, Name.Tag)),
        ],
        'body': [
            (r'\fpart\{\n', Keyword, 'part'),
            (r'\f(part|attachment)\{\s*', Keyword, ('part', 'part-attr')),
            (r'\fbody\}\n', Keyword, '#pop'),
        ],
        'part-attr': [
            (r'(ID:\s*)(\d+)', bygroups(Name.Attribute, Number.Integer)),
            (r'(,\s*)((?:Filename|Content-id):\s*)([^,]+)',
             bygroups(Punctuation, Name.Attribute, String)),
            (r'(,\s*)(Content-type:\s*)(.+\n)',
             bygroups(Punctuation, Name.Attribute, String)),
            default('#pop'),
        ],
        'part': [
            (r'\f(?:part|attachment)\}\n', Keyword, '#pop'),
            (r'\f(?:part|attachment)\{\s*', Keyword, ('#push', 'part-attr')),
            (r'^Non-text part: .*\n', Comment),
            (r'(?s)(.*?(?=\f(?:part|attachment)\}\n))', _highlight_code),
        ],
    }

    def analyse_text(text):
        return 1.0 if text.startswith('\fmessage{') else 0.0

    def __init__(self, **options):
        self.body_lexer = options.get('body_lexer', None)
        RegexLexer.__init__(self, **options)


class KernelLogLexer(RegexLexer):
    """
    For Linux Kernel log ("dmesg") output.
    """
    name = 'Kernel log'
    aliases = ['kmsg', 'dmesg']
    filenames = ['*.kmsg', '*.dmesg']
    url = 'https://fr.wikipedia.org/wiki/Dmesg'
    version_added = '2.6'

    tokens = {
        'root': [
            (r'^[^:]+:debug : (?=\[)', Text, 'debug'),
            (r'^[^:]+:info  : (?=\[)', Text, 'info'),
            (r'^[^:]+:warn  : (?=\[)', Text, 'warn'),
            (r'^[^:]+:notice: (?=\[)', Text, 'warn'),
            (r'^[^:]+:err   : (?=\[)', Text, 'error'),
            (r'^[^:]+:crit  : (?=\[)', Text, 'error'),
            (r'^(?=\[)', Text, 'unknown'),
        ],
        'unknown': [
            (r'^(?=.+(warning|notice|audit|deprecated))', Text, 'warn'),
            (r'^(?=.+(error|critical|fail|Bug))', Text, 'error'),
            default('info'),
        ],
        'base': [
            (r'\[[0-9. ]+\] ', Number),
            (r'(?<=\] ).+?:', Keyword),
            (r'\n', Text, '#pop'),
        ],
        'debug': [
            include('base'),
            (r'.+\n', Comment, '#pop')
        ],
        'info': [
            include('base'),
            (r'.+\n', Text, '#pop')
        ],
        'warn': [
            include('base'),
            (r'.+\n', Generic.Strong, '#pop')
        ],
        'error': [
            include('base'),
            (r'.+\n', Generic.Error, '#pop')
        ]
    }
