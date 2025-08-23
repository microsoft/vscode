"""
    pygments.lexers.futhark
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Futhark language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace
from erdos.erdos._vendor.pygments import unistring as uni

__all__ = ['FutharkLexer']


class FutharkLexer(RegexLexer):
    """
    A Futhark lexer
    """
    name = 'Futhark'
    url = 'https://futhark-lang.org/'
    aliases = ['futhark']
    filenames = ['*.fut']
    mimetypes = ['text/x-futhark']
    version_added = '2.8'

    num_types = ('i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64')

    other_types = ('bool', )

    reserved = ('if', 'then', 'else', 'def', 'let', 'loop', 'in', 'with',
                'type', 'type~', 'type^',
                'val', 'entry', 'for', 'while', 'do', 'case', 'match',
                'include', 'import', 'module', 'open', 'local', 'assert', '_')

    ascii = ('NUL', 'SOH', '[SE]TX', 'EOT', 'ENQ', 'ACK',
             'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'S[OI]', 'DLE',
             'DC[1-4]', 'NAK', 'SYN', 'ETB', 'CAN',
             'EM', 'SUB', 'ESC', '[FGRU]S', 'SP', 'DEL')

    num_postfix = r'({})?'.format('|'.join(num_types))

    identifier_re = '[a-zA-Z_][a-zA-Z_0-9\']*'

    # opstart_re = '+\-\*/%=\!><\|&\^'

    tokens = {
        'root': [
            (r'--(.*?)$', Comment.Single),
            (r'\s+', Whitespace),
            (r'\(\)', Punctuation),
            (r'\b({})(?!\')\b'.format('|'.join(reserved)), Keyword.Reserved),
            (r'\b({})(?!\')\b'.format('|'.join(num_types + other_types)), Keyword.Type),

            # Identifiers
            (r'#\[([a-zA-Z_\(\) ]*)\]', Comment.Preproc),
            (rf'[#!]?({identifier_re}\.)*{identifier_re}', Name),

            (r'\\', Operator),
            (r'[-+/%=!><|&*^][-+/%=!><|&*^.]*', Operator),
            (r'[][(),:;`{}?.\'~^]', Punctuation),

            #  Numbers
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*_*[pP][+-]?\d(_*\d)*' + num_postfix,
             Number.Float),
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*\.[\da-fA-F](_*[\da-fA-F])*'
             r'(_*[pP][+-]?\d(_*\d)*)?' + num_postfix, Number.Float),
            (r'\d(_*\d)*_*[eE][+-]?\d(_*\d)*' + num_postfix, Number.Float),
            (r'\d(_*\d)*\.\d(_*\d)*(_*[eE][+-]?\d(_*\d)*)?' + num_postfix, Number.Float),
            (r'0[bB]_*[01](_*[01])*' + num_postfix, Number.Bin),
            (r'0[xX]_*[\da-fA-F](_*[\da-fA-F])*' + num_postfix, Number.Hex),
            (r'\d(_*\d)*' + num_postfix, Number.Integer),

            #  Character/String Literals
            (r"'", String.Char, 'character'),
            (r'"', String, 'string'),
            #  Special
            (r'\[[a-zA-Z_\d]*\]', Keyword.Type),
            (r'\(\)', Name.Builtin),
        ],
        'character': [
            # Allows multi-chars, incorrectly.
            (r"[^\\']'", String.Char, '#pop'),
            (r"\\", String.Escape, 'escape'),
            ("'", String.Char, '#pop'),
        ],
        'string': [
            (r'[^\\"]+', String),
            (r"\\", String.Escape, 'escape'),
            ('"', String, '#pop'),
        ],

        'escape': [
            (r'[abfnrtv"\'&\\]', String.Escape, '#pop'),
            (r'\^[][' + uni.Lu + r'@^_]', String.Escape, '#pop'),
            ('|'.join(ascii), String.Escape, '#pop'),
            (r'o[0-7]+', String.Escape, '#pop'),
            (r'x[\da-fA-F]+', String.Escape, '#pop'),
            (r'\d+', String.Escape, '#pop'),
            (r'(\s+)(\\)', bygroups(Whitespace, String.Escape), '#pop'),
        ],
    }
