"""
    pygments.lexers.smv
    ~~~~~~~~~~~~~~~~~~~

    Lexers for the SMV languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, words
from lotas.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Operator, \
    Punctuation, Text

__all__ = ['NuSMVLexer']


class NuSMVLexer(RegexLexer):
    """
    Lexer for the NuSMV language.
    """

    name = 'NuSMV'
    aliases = ['nusmv']
    filenames = ['*.smv']
    mimetypes = []
    url = 'https://nusmv.fbk.eu'
    version_added = '2.2'

    tokens = {
        'root': [
            # Comments
            (r'(?s)\/\-\-.*?\-\-/', Comment),
            (r'--.*\n', Comment),

            # Reserved
            (words(('MODULE', 'DEFINE', 'MDEFINE', 'CONSTANTS', 'VAR', 'IVAR',
                    'FROZENVAR', 'INIT', 'TRANS', 'INVAR', 'SPEC', 'CTLSPEC',
                    'LTLSPEC', 'PSLSPEC', 'COMPUTE', 'NAME', 'INVARSPEC',
                    'FAIRNESS', 'JUSTICE', 'COMPASSION', 'ISA', 'ASSIGN',
                    'CONSTRAINT', 'SIMPWFF', 'CTLWFF', 'LTLWFF', 'PSLWFF',
                    'COMPWFF', 'IN', 'MIN', 'MAX', 'MIRROR', 'PRED',
                    'PREDICATES'), suffix=r'(?![\w$#-])'),
             Keyword.Declaration),
            (r'process(?![\w$#-])', Keyword),
            (words(('array', 'of', 'boolean', 'integer', 'real', 'word'),
                   suffix=r'(?![\w$#-])'), Keyword.Type),
            (words(('case', 'esac'), suffix=r'(?![\w$#-])'), Keyword),
            (words(('word1', 'bool', 'signed', 'unsigned', 'extend', 'resize',
                    'sizeof', 'uwconst', 'swconst', 'init', 'self', 'count',
                    'abs', 'max', 'min'), suffix=r'(?![\w$#-])'),
             Name.Builtin),
            (words(('EX', 'AX', 'EF', 'AF', 'EG', 'AG', 'E', 'F', 'O', 'G',
                    'H', 'X', 'Y', 'Z', 'A', 'U', 'S', 'V', 'T', 'BU', 'EBF',
                    'ABF', 'EBG', 'ABG', 'next', 'mod', 'union', 'in', 'xor',
                    'xnor'), suffix=r'(?![\w$#-])'),
                Operator.Word),
            (words(('TRUE', 'FALSE'), suffix=r'(?![\w$#-])'), Keyword.Constant),

            # Names
            (r'[a-zA-Z_][\w$#-]*', Name.Variable),

            # Operators
            (r':=', Operator),
            (r'[-&|+*/<>!=]', Operator),

            # Literals
            (r'\-?\d+\b', Number.Integer),
            (r'0[su][bB]\d*_[01_]+', Number.Bin),
            (r'0[su][oO]\d*_[0-7_]+', Number.Oct),
            (r'0[su][dD]\d*_[\d_]+', Number.Decimal),
            (r'0[su][hH]\d*_[\da-fA-F_]+', Number.Hex),

            # Whitespace, punctuation and the rest
            (r'\s+', Text.Whitespace),
            (r'[()\[\]{};?:.,]', Punctuation),
        ],
    }
