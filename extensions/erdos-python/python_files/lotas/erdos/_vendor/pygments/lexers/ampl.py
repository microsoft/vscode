"""
    pygments.lexers.ampl
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for the AMPL language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, bygroups, using, this, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['AmplLexer']


class AmplLexer(RegexLexer):
    """
    For AMPL source code.
    """
    name = 'Ampl'
    url = 'http://ampl.com/'
    aliases = ['ampl']
    filenames = ['*.run']
    version_added = '2.2'

    tokens = {
        'root': [
            (r'\n', Text),
            (r'\s+', Whitespace),
            (r'#.*?\n', Comment.Single),
            (r'/[*](.|\n)*?[*]/', Comment.Multiline),
            (words((
                'call', 'cd', 'close', 'commands', 'data', 'delete', 'display',
                'drop', 'end', 'environ', 'exit', 'expand', 'include', 'load',
                'model', 'objective', 'option', 'problem', 'purge', 'quit',
                'redeclare', 'reload', 'remove', 'reset', 'restore', 'shell',
                'show', 'solexpand', 'solution', 'solve', 'update', 'unload',
                'xref', 'coeff', 'coef', 'cover', 'obj', 'interval', 'default',
                'from', 'to', 'to_come', 'net_in', 'net_out', 'dimen',
                'dimension', 'check', 'complements', 'write', 'function',
                'pipe', 'format', 'if', 'then', 'else', 'in', 'while', 'repeat',
                'for'), suffix=r'\b'), Keyword.Reserved),
            (r'(integer|binary|symbolic|ordered|circular|reversed|INOUT|IN|OUT|LOCAL)',
             Keyword.Type),
            (r'\".*?\"', String.Double),
            (r'\'.*?\'', String.Single),
            (r'[()\[\]{},;:]+', Punctuation),
            (r'\b(\w+)(\.)(astatus|init0|init|lb0|lb1|lb2|lb|lrc|'
             r'lslack|rc|relax|slack|sstatus|status|ub0|ub1|ub2|'
             r'ub|urc|uslack|val)',
             bygroups(Name.Variable, Punctuation, Keyword.Reserved)),
            (r'(set|param|var|arc|minimize|maximize|subject to|s\.t\.|subj to|'
             r'node|table|suffix|read table|write table)(\s+)(\w+)',
             bygroups(Keyword.Declaration, Whitespace, Name.Variable)),
            (r'(param)(\s*)(:)(\s*)(\w+)(\s*)(:)(\s*)((\w|\s)+)',
             bygroups(Keyword.Declaration, Whitespace, Punctuation, Whitespace,
                      Name.Variable, Whitespace, Punctuation, Whitespace, Name.Variable)),
            (r'(let|fix|unfix)(\s*)((?:\{.*\})?)(\s*)(\w+)',
             bygroups(Keyword.Declaration, Whitespace, using(this), Whitespace,
                      Name.Variable)),
            (words((
                'abs', 'acos', 'acosh', 'alias', 'asin', 'asinh', 'atan', 'atan2',
                'atanh', 'ceil', 'ctime', 'cos', 'exp', 'floor', 'log', 'log10',
                'max', 'min', 'precision', 'round', 'sin', 'sinh', 'sqrt', 'tan',
                'tanh', 'time', 'trunc', 'Beta', 'Cauchy', 'Exponential', 'Gamma',
                'Irand224', 'Normal', 'Normal01', 'Poisson', 'Uniform', 'Uniform01',
                'num', 'num0', 'ichar', 'char', 'length', 'substr', 'sprintf',
                'match', 'sub', 'gsub', 'print', 'printf', 'next', 'nextw', 'prev',
                'prevw', 'first', 'last', 'ord', 'ord0', 'card', 'arity',
                'indexarity'), prefix=r'\b', suffix=r'\b'), Name.Builtin),
            (r'(\+|\-|\*|/|\*\*|=|<=|>=|==|\||\^|<|>|\!|\.\.|:=|\&|\!=|<<|>>)',
             Operator),
            (words((
                'or', 'exists', 'forall', 'and', 'in', 'not', 'within', 'union',
                'diff', 'difference', 'symdiff', 'inter', 'intersect',
                'intersection', 'cross', 'setof', 'by', 'less', 'sum', 'prod',
                'product', 'div', 'mod'), suffix=r'\b'),
             Keyword.Reserved),  # Operator.Name but not enough emphasized with that
            (r'(\d+\.(?!\.)\d*|\.(?!.)\d+)([eE][+-]?\d+)?', Number.Float),
            (r'\d+([eE][+-]?\d+)?', Number.Integer),
            (r'[+-]?Infinity', Number.Integer),
            (r'(\w+|(\.(?!\.)))', Text)
        ]

    }
