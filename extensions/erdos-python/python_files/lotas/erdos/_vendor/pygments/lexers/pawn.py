"""
    pygments.lexers.pawn
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the Pawn languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation
from erdos._vendor.pygments.util import get_bool_opt

__all__ = ['SourcePawnLexer', 'PawnLexer']


class SourcePawnLexer(RegexLexer):
    """
    For SourcePawn source code with preprocessor directives.
    """
    name = 'SourcePawn'
    aliases = ['sp']
    filenames = ['*.sp']
    mimetypes = ['text/x-sourcepawn']
    url = 'https://github.com/alliedmodders/sourcepawn'
    version_added = '1.6'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//.*?\n|/\*.*?\*/)+'
    #: only one /* */ style comment
    _ws1 = r'\s*(?:/[*].*?[*]/\s*)*'

    tokens = {
        'root': [
            # preprocessor directives: without whitespace
            (r'^#if\s+0', Comment.Preproc, 'if0'),
            ('^#', Comment.Preproc, 'macro'),
            # or with whitespace
            ('^' + _ws1 + r'#if\s+0', Comment.Preproc, 'if0'),
            ('^' + _ws1 + '#', Comment.Preproc, 'macro'),
            (r'\n', Text),
            (r'\s+', Text),
            (r'\\\n', Text),  # line continuation
            (r'/(\\\n)?/(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?\*(.|\n)*?\*(\\\n)?/', Comment.Multiline),
            (r'[{}]', Punctuation),
            (r'L?"', String, 'string'),
            (r"L?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[LlUu]*', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'0[0-7]+[LlUu]*', Number.Oct),
            (r'\d+[LlUu]*', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'[()\[\],.;]', Punctuation),
            (r'(case|const|continue|native|'
             r'default|else|enum|for|if|new|operator|'
             r'public|return|sizeof|static|decl|struct|switch)\b', Keyword),
            (r'(bool|Float)\b', Keyword.Type),
            (r'(true|false)\b', Keyword.Constant),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),       # line continuation
            (r'\\', String),         # stray backslash
        ],
        'macro': [
            (r'[^/\n]+', Comment.Preproc),
            (r'/\*(.|\n)*?\*/', Comment.Multiline),
            (r'//.*?\n', Comment.Single, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Comment.Preproc, '#pop'),
        ],
        'if0': [
            (r'^\s*#if.*?(?<!\\)\n', Comment.Preproc, '#push'),
            (r'^\s*#endif.*?(?<!\\)\n', Comment.Preproc, '#pop'),
            (r'.*?\n', Comment),
        ]
    }

    SM_TYPES = {'Action', 'bool', 'Float', 'Plugin', 'String', 'any',
                'AdminFlag', 'OverrideType', 'OverrideRule', 'ImmunityType',
                'GroupId', 'AdminId', 'AdmAccessMode', 'AdminCachePart',
                'CookieAccess', 'CookieMenu', 'CookieMenuAction', 'NetFlow',
                'ConVarBounds', 'QueryCookie', 'ReplySource',
                'ConVarQueryResult', 'ConVarQueryFinished', 'Function',
                'Action', 'Identity', 'PluginStatus', 'PluginInfo', 'DBResult',
                'DBBindType', 'DBPriority', 'PropType', 'PropFieldType',
                'MoveType', 'RenderMode', 'RenderFx', 'EventHookMode',
                'EventHook', 'FileType', 'FileTimeMode', 'PathType',
                'ParamType', 'ExecType', 'DialogType', 'Handle', 'KvDataTypes',
                'NominateResult', 'MapChange', 'MenuStyle', 'MenuAction',
                'MenuSource', 'RegexError', 'SDKCallType', 'SDKLibrary',
                'SDKFuncConfSource', 'SDKType', 'SDKPassMethod', 'RayType',
                'TraceEntityFilter', 'ListenOverride', 'SortOrder', 'SortType',
                'SortFunc2D', 'APLRes', 'FeatureType', 'FeatureStatus',
                'SMCResult', 'SMCError', 'TFClassType', 'TFTeam', 'TFCond',
                'TFResourceType', 'Timer', 'TopMenuAction', 'TopMenuObjectType',
                'TopMenuPosition', 'TopMenuObject', 'UserMsg'}

    def __init__(self, **options):
        self.smhighlighting = get_bool_opt(options,
                                           'sourcemod', True)

        self._functions = set()
        if self.smhighlighting:
            from erdos._vendor.pygments.lexers._sourcemod_builtins import FUNCTIONS
            self._functions.update(FUNCTIONS)
        RegexLexer.__init__(self, **options)

    def get_tokens_unprocessed(self, text):
        for index, token, value in \
                RegexLexer.get_tokens_unprocessed(self, text):
            if token is Name:
                if self.smhighlighting:
                    if value in self.SM_TYPES:
                        token = Keyword.Type
                    elif value in self._functions:
                        token = Name.Builtin
            yield index, token, value


class PawnLexer(RegexLexer):
    """
    For Pawn source code.
    """

    name = 'Pawn'
    aliases = ['pawn']
    filenames = ['*.p', '*.pwn', '*.inc']
    mimetypes = ['text/x-pawn']
    url = 'https://www.compuphase.com/pawn/pawn.htm'
    version_added = '2.0'

    #: optional Comment or Whitespace
    _ws = r'(?:\s|//.*?\n|/[*][\w\W]*?[*]/)+'
    #: only one /* */ style comment
    _ws1 = r'\s*(?:/[*].*?[*]/\s*)*'

    tokens = {
        'root': [
            # preprocessor directives: without whitespace
            (r'^#if\s+0', Comment.Preproc, 'if0'),
            ('^#', Comment.Preproc, 'macro'),
            # or with whitespace
            ('^' + _ws1 + r'#if\s+0', Comment.Preproc, 'if0'),
            ('^' + _ws1 + '#', Comment.Preproc, 'macro'),
            (r'\n', Text),
            (r'\s+', Text),
            (r'\\\n', Text),  # line continuation
            (r'/(\\\n)?/(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?\*[\w\W]*?\*(\\\n)?/', Comment.Multiline),
            (r'[{}]', Punctuation),
            (r'L?"', String, 'string'),
            (r"L?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'", String.Char),
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[LlUu]*', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'0[0-7]+[LlUu]*', Number.Oct),
            (r'\d+[LlUu]*', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'[()\[\],.;]', Punctuation),
            (r'(switch|case|default|const|new|static|char|continue|break|'
             r'if|else|for|while|do|operator|enum|'
             r'public|return|sizeof|tagof|state|goto)\b', Keyword),
            (r'(bool|Float)\b', Keyword.Type),
            (r'(true|false)\b', Keyword.Constant),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),       # line continuation
            (r'\\', String),         # stray backslash
        ],
        'macro': [
            (r'[^/\n]+', Comment.Preproc),
            (r'/\*(.|\n)*?\*/', Comment.Multiline),
            (r'//.*?\n', Comment.Single, '#pop'),
            (r'/', Comment.Preproc),
            (r'(?<=\\)\n', Comment.Preproc),
            (r'\n', Comment.Preproc, '#pop'),
        ],
        'if0': [
            (r'^\s*#if.*?(?<!\\)\n', Comment.Preproc, '#push'),
            (r'^\s*#endif.*?(?<!\\)\n', Comment.Preproc, '#pop'),
            (r'.*?\n', Comment),
        ]
    }

    def analyse_text(text):
        """This is basically C. There is a keyword which doesn't exist in C
        though and is nearly unique to this language."""
        if 'tagof' in text:
            return 0.01
