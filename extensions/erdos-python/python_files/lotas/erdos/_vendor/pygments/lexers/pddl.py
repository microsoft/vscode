"""
    pygments.lexers.pddl
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the Planning Domain Definition Language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""


from lotas.erdos._vendor.pygments.lexer import RegexLexer, words, include
from lotas.erdos._vendor.pygments.token import Punctuation, Keyword, Whitespace, Name, Comment, \
    Operator, Number


__all__ = ['PddlLexer']


class PddlLexer(RegexLexer):
    """
    A PDDL lexer.

    It should support up to PDDL 3.1.
    """

    name = 'PDDL'
    aliases = ['pddl']
    filenames = ['*.pddl']
    # there doesn't really seem to be a PDDL homepage.
    url = 'https://en.wikipedia.org/wiki/Planning_Domain_Definition_Language'
    version_added = '2.19'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r';.*$', Comment.Singleline),
            include('keywords'),
            include('builtins'),
            (r'[()]', Punctuation),
            (r'[=/*+><-]', Operator),
            (r'[a-zA-Z][a-zA-Z0-9_-]*', Name),
            (r'\?[a-zA-Z][a-zA-Z0-9_-]*', Name.Variable),
            (r'[0-9]+\.[0-9]+', Number.Float),
            (r'[0-9]+', Number.Integer),
        ],
        'keywords': [
            (words((
                ':requirements', ':types', ':constants',
                ':predicates', ':functions', ':action', ':agent',
                ':parameters', ':precondition', ':effect',
                ':durative-action', ':duration', ':condition',
                ':derived', ':domain', ':objects', ':init',
                ':goal', ':metric', ':length', ':serial', ':parallel',
                # the following are requirements
                ':strips', ':typing', ':negative-preconditions',
                ':disjunctive-preconditions', ':equality',
                ':existential-preconditions', ':universal-preconditions',
                ':conditional-effects', ':fluents', ':numeric-fluents',
                ':object-fluents', ':adl', ':durative-actions',
                ':continuous-effects', ':derived-predicates',
                ':time-intial-literals', ':preferences',
                ':constraints', ':action-costs', ':multi-agent',
                ':unfactored-privacy', ':factored-privacy',
                ':non-deterministic'
                ), suffix=r'\b'), Keyword)
        ],
        'builtins': [
            (words((
                'define', 'domain', 'object', 'either', 'and',
                'forall', 'preference', 'imply', 'or', 'exists',
                'not', 'when', 'assign', 'scale-up', 'scale-down',
                'increase', 'decrease', 'at', 'over', 'start',
                'end', 'all', 'problem', 'always', 'sometime',
                'within', 'at-most-once', 'sometime-after',
                'sometime-before', 'always-within', 'hold-during',
                'hold-after', 'minimize', 'maximize',
                'total-time', 'is-violated'), suffix=r'\b'),
                Name.Builtin)
        ]
    }

