"""
    pygments.lexers.trafficscript
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for RiverBed's TrafficScript (RTS) language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer
from erdos._vendor.pygments.token import String, Number, Name, Keyword, Operator, Text, Comment

__all__ = ['RtsLexer']


class RtsLexer(RegexLexer):
    """
    For Riverbed Stingray Traffic Manager
    """
    name = 'TrafficScript'
    aliases = ['trafficscript', 'rts']
    filenames = ['*.rts']
    url = 'https://riverbed.com'
    version_added = '2.1'

    tokens = {
        'root' : [
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String),
            (r'"', String, 'escapable-string'),
            (r'(0x[0-9a-fA-F]+|\d+)', Number),
            (r'\d+\.\d+', Number.Float),
            (r'\$[a-zA-Z](\w|_)*', Name.Variable),
            (r'(if|else|for(each)?|in|while|do|break|sub|return|import)', Keyword),
            (r'[a-zA-Z][\w.]*', Name.Function),
            (r'[-+*/%=,;(){}<>^.!~|&\[\]\?\:]', Operator),
            (r'(>=|<=|==|!=|'
             r'&&|\|\||'
             r'\+=|.=|-=|\*=|/=|%=|<<=|>>=|&=|\|=|\^=|'
             r'>>|<<|'
             r'\+\+|--|=>)', Operator),
            (r'[ \t\r]+', Text),
            (r'#[^\n]*', Comment),
        ],
        'escapable-string' : [
            (r'\\[tsn]', String.Escape),
            (r'[^"]', String),
            (r'"', String, '#pop'),
        ],

    }
