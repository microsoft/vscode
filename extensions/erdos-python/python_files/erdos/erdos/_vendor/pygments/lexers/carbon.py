"""
    pygments.lexers.carbon
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the Carbon programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""
import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['CarbonLexer']


class CarbonLexer(RegexLexer):
    """
    For Carbon source.
    """
    name = 'Carbon'
    url = 'https://github.com/carbon-language/carbon-lang'
    filenames = ['*.carbon']
    aliases = ['carbon']
    mimetypes = ['text/x-carbon']
    version_added = '2.15'

    flags = re.MULTILINE | re.DOTALL

    tokens = {
        'root': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'\\\n', Text),
            # comments
            (r'//(.*?)\n', Comment.Single),
            (r'/(\\\n)?[*].*?[*](\\\n)?/', Comment.Multiline),
            # Declaration
            (r'(package|import|api|namespace|library)\b', Keyword.Namespace),
            (r'(abstract|alias|fn|class|interface|let|var|virtual|external|'
             r'base|addr|extends|choice|constraint|impl)\b', Keyword.Declaration),
            # Keywords
            (words(('as', 'or', 'not', 'and', 'break', 'continue', 'case',
                    'default', 'if', 'else', 'destructor', 'for', 'forall',
                    'while', 'where', 'then', 'in', 'is', 'return', 'returned',
                    'friend', 'partial', 'private', 'protected', 'observe', 'Self',
                    'override', 'final', 'match', 'type', 'like'), suffix=r'\b'), Keyword),
            (r'(self)\b', Keyword.Pseudo),
            (r'(true|false)\b', Keyword.Constant),
            (r'(auto|bool|string|i8|i16|i32|i64|u8|u16|u32|u64|'
             r'f8|f16|f32|f64)\b', Keyword.Type),
            # numeric literals
            (r'[0-9]*[.][0-9]+', Number.Double),
            (r'0b[01]+', Number.Bin),
            (r'0o[0-7]+', Number.Oct),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),
            # string literal
            (r'"(\\.|[^"\\])*"', String),
            # char literal
            (r'\'(\\.|[^\'\\])\'', String.Char),
            # tokens
            (r'<<=|>>=|<<|>>|<=|>=|\+=|-=|\*=|/=|\%=|\|=|&=|\^=|&&|\|\||&|\||'
             r'\+\+|--|\%|\^|\~|==|!=|::|[.]{3}|->|=>|[+\-*/&]', Operator),
            (r'[|<>=!()\[\]{}.,;:\?]', Punctuation),
            # identifiers
            (r'[^\W\d]\w*', Name.Other),
        ]
    }

    def analyse_text(text):
        result = 0
        if 'forall' in text:
            result += 0.1
        if 'type' in text:
            result += 0.1
        if 'Self' in text:
            result += 0.1
        if 'observe' in text:
            result += 0.1
        if 'package' in text:
            result += 0.1
        if 'library' in text:
            result += 0.1
        if 'choice' in text:
            result += 0.1
        if 'addr' in text:
            result += 0.1
        if 'constraint' in text:
            result += 0.1
        if 'impl' in text:
            result += 0.1
        return result
