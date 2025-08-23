"""
    pygments.lexers.cplint
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexer for the cplint language

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import bygroups, inherit, words
from erdos.erdos._vendor.pygments.lexers import PrologLexer
from erdos.erdos._vendor.pygments.token import Operator, Keyword, Name, String, Punctuation

__all__ = ['CplintLexer']


class CplintLexer(PrologLexer):
    """
    Lexer for cplint files, including CP-logic, Logic Programs with Annotated
    Disjunctions, Distributional Clauses syntax, ProbLog, DTProbLog.
    """
    name = 'cplint'
    url = 'https://cplint.eu'
    aliases = ['cplint']
    filenames = ['*.ecl', '*.prolog', '*.pro', '*.pl', '*.P', '*.lpad', '*.cpl']
    mimetypes = ['text/x-cplint']
    version_added = '2.12'

    tokens = {
        'root': [
            (r'map_query', Keyword),
            (words(('gaussian', 'uniform_dens', 'dirichlet', 'gamma', 'beta',
                    'poisson', 'binomial', 'geometric', 'exponential', 'pascal',
                    'multinomial', 'user', 'val', 'uniform', 'discrete',
                    'finite')), Name.Builtin),
            # annotations of atoms
            (r'([a-z]+)(:)', bygroups(String.Atom, Punctuation)),
            (r':(-|=)|::?|~=?|=>', Operator),
            (r'\?', Name.Builtin),
            inherit,
        ],
    }
