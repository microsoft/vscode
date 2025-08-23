# Copyright 2004-2005 Elemental Security, Inc. All Rights Reserved.
# Licensed to PSF under a Contributor Agreement.

# Modifications:
# Copyright David Halter and Contributors
# Modifications are dual-licensed: MIT and PSF.

"""
This module defines the data structures used to represent a grammar.

Specifying grammars in pgen is possible with this grammar::

    grammar: (NEWLINE | rule)* ENDMARKER
    rule: NAME ':' rhs NEWLINE
    rhs: items ('|' items)*
    items: item+
    item: '[' rhs ']' | atom ['+' | '*']
    atom: '(' rhs ')' | NAME | STRING

This grammar is self-referencing.

This parser generator (pgen2) was created by Guido Rossum and used for lib2to3.
Most of the code has been refactored to make it more Pythonic. Since this was a
"copy" of the CPython Parser parser "pgen", there was some work needed to make
it more readable. It should also be slightly faster than the original pgen2,
because we made some optimizations.
"""

from ast import literal_eval
from typing import TypeVar, Generic, Mapping, Sequence, Set, Union

from erdos.erdos._vendor.parso.pgen2.grammar_parser import GrammarParser, NFAState

_TokenTypeT = TypeVar("_TokenTypeT")


class Grammar(Generic[_TokenTypeT]):
    """
    Once initialized, this class supplies the grammar tables for the
    parsing engine implemented by parse.py.  The parsing engine
    accesses the instance variables directly.

    The only important part in this parsers are dfas and transitions between
    dfas.
    """

    def __init__(self,
                 start_nonterminal: str,
                 rule_to_dfas: Mapping[str, Sequence['DFAState[_TokenTypeT]']],
                 reserved_syntax_strings: Mapping[str, 'ReservedString']):
        self.nonterminal_to_dfas = rule_to_dfas
        self.reserved_syntax_strings = reserved_syntax_strings
        self.start_nonterminal = start_nonterminal


class DFAPlan:
    """
    Plans are used for the parser to create stack nodes and do the proper
    DFA state transitions.
    """
    def __init__(self, next_dfa: 'DFAState', dfa_pushes: Sequence['DFAState'] = []):
        self.next_dfa = next_dfa
        self.dfa_pushes = dfa_pushes

    def __repr__(self):
        return '%s(%s, %s)' % (self.__class__.__name__, self.next_dfa, self.dfa_pushes)


class DFAState(Generic[_TokenTypeT]):
    """
    The DFAState object is the core class for pretty much anything. DFAState
    are the vertices of an ordered graph while arcs and transitions are the
    edges.

    Arcs are the initial edges, where most DFAStates are not connected and
    transitions are then calculated to connect the DFA state machines that have
    different nonterminals.
    """
    def __init__(self, from_rule: str, nfa_set: Set[NFAState], final: NFAState):
        assert isinstance(nfa_set, set)
        assert isinstance(next(iter(nfa_set)), NFAState)
        assert isinstance(final, NFAState)
        self.from_rule = from_rule
        self.nfa_set = nfa_set
        # map from terminals/nonterminals to DFAState
        self.arcs: Mapping[str, DFAState] = {}
        # In an intermediary step we set these nonterminal arcs (which has the
        # same structure as arcs). These don't contain terminals anymore.
        self.nonterminal_arcs: Mapping[str, DFAState] = {}

        # Transitions are basically the only thing that  the parser is using
        # with is_final. Everyting else is purely here to create a parser.
        self.transitions: Mapping[Union[_TokenTypeT, ReservedString], DFAPlan] = {}
        self.is_final = final in nfa_set

    def add_arc(self, next_, label):
        assert isinstance(label, str)
        assert label not in self.arcs
        assert isinstance(next_, DFAState)
        self.arcs[label] = next_

    def unifystate(self, old, new):
        for label, next_ in self.arcs.items():
            if next_ is old:
                self.arcs[label] = new

    def __eq__(self, other):
        # Equality test -- ignore the nfa_set instance variable
        assert isinstance(other, DFAState)
        if self.is_final != other.is_final:
            return False
        # Can't just return self.arcs == other.arcs, because that
        # would invoke this method recursively, with cycles...
        if len(self.arcs) != len(other.arcs):
            return False
        for label, next_ in self.arcs.items():
            if next_ is not other.arcs.get(label):
                return False
        return True

    def __repr__(self):
        return '<%s: %s is_final=%s>' % (
            self.__class__.__name__, self.from_rule, self.is_final
        )


class ReservedString:
    """
    Most grammars will have certain keywords and operators that are mentioned
    in the grammar as strings (e.g. "if") and not token types (e.g. NUMBER).
    This class basically is the former.
    """

    def __init__(self, value: str):
        self.value = value

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self.value)


def _simplify_dfas(dfas):
    """
    This is not theoretically optimal, but works well enough.
    Algorithm: repeatedly look for two states that have the same
    set of arcs (same labels pointing to the same nodes) and
    unify them, until things stop changing.

    dfas is a list of DFAState instances
    """
    changes = True
    while changes:
        changes = False
        for i, state_i in enumerate(dfas):
            for j in range(i + 1, len(dfas)):
                state_j = dfas[j]
                if state_i == state_j:
                    del dfas[j]
                    for state in dfas:
                        state.unifystate(state_j, state_i)
                    changes = True
                    break


def _make_dfas(start, finish):
    """
    Uses the powerset construction algorithm to create DFA states from sets of
    NFA states.

    Also does state reduction if some states are not needed.
    """
    # To turn an NFA into a DFA, we define the states of the DFA
    # to correspond to *sets* of states of the NFA.  Then do some
    # state reduction.
    assert isinstance(start, NFAState)
    assert isinstance(finish, NFAState)

    def addclosure(nfa_state, base_nfa_set):
        assert isinstance(nfa_state, NFAState)
        if nfa_state in base_nfa_set:
            return
        base_nfa_set.add(nfa_state)
        for nfa_arc in nfa_state.arcs:
            if nfa_arc.nonterminal_or_string is None:
                addclosure(nfa_arc.next, base_nfa_set)

    base_nfa_set = set()
    addclosure(start, base_nfa_set)
    states = [DFAState(start.from_rule, base_nfa_set, finish)]
    for state in states:  # NB states grows while we're iterating
        arcs = {}
        # Find state transitions and store them in arcs.
        for nfa_state in state.nfa_set:
            for nfa_arc in nfa_state.arcs:
                if nfa_arc.nonterminal_or_string is not None:
                    nfa_set = arcs.setdefault(nfa_arc.nonterminal_or_string, set())
                    addclosure(nfa_arc.next, nfa_set)

        # Now create the dfa's with no None's in arcs anymore. All Nones have
        # been eliminated and state transitions (arcs) are properly defined, we
        # just need to create the dfa's.
        for nonterminal_or_string, nfa_set in arcs.items():
            for nested_state in states:
                if nested_state.nfa_set == nfa_set:
                    # The DFA state already exists for this rule.
                    break
            else:
                nested_state = DFAState(start.from_rule, nfa_set, finish)
                states.append(nested_state)

            state.add_arc(nested_state, nonterminal_or_string)
    return states  # List of DFAState instances; first one is start


def _dump_nfa(start, finish):
    print("Dump of NFA for", start.from_rule)
    todo = [start]
    for i, state in enumerate(todo):
        print("  State", i, state is finish and "(final)" or "")
        for arc in state.arcs:
            label, next_ = arc.nonterminal_or_string, arc.next
            if next_ in todo:
                j = todo.index(next_)
            else:
                j = len(todo)
                todo.append(next_)
            if label is None:
                print("    -> %d" % j)
            else:
                print("    %s -> %d" % (label, j))


def _dump_dfas(dfas):
    print("Dump of DFA for", dfas[0].from_rule)
    for i, state in enumerate(dfas):
        print("  State", i, state.is_final and "(final)" or "")
        for nonterminal, next_ in state.arcs.items():
            print("    %s -> %d" % (nonterminal, dfas.index(next_)))


def generate_grammar(bnf_grammar: str, token_namespace) -> Grammar:
    """
    ``bnf_text`` is a grammar in extended BNF (using * for repetition, + for
    at-least-once repetition, [] for optional parts, | for alternatives and ()
    for grouping).

    It's not EBNF according to ISO/IEC 14977. It's a dialect Python uses in its
    own parser.
    """
    rule_to_dfas = {}
    start_nonterminal = None
    for nfa_a, nfa_z in GrammarParser(bnf_grammar).parse():
        # _dump_nfa(nfa_a, nfa_z)
        dfas = _make_dfas(nfa_a, nfa_z)
        # _dump_dfas(dfas)
        # oldlen = len(dfas)
        _simplify_dfas(dfas)
        # newlen = len(dfas)
        rule_to_dfas[nfa_a.from_rule] = dfas
        # print(nfa_a.from_rule, oldlen, newlen)

        if start_nonterminal is None:
            start_nonterminal = nfa_a.from_rule

    reserved_strings: Mapping[str, ReservedString] = {}
    for nonterminal, dfas in rule_to_dfas.items():
        for dfa_state in dfas:
            for terminal_or_nonterminal, next_dfa in dfa_state.arcs.items():
                if terminal_or_nonterminal in rule_to_dfas:
                    dfa_state.nonterminal_arcs[terminal_or_nonterminal] = next_dfa
                else:
                    transition = _make_transition(
                        token_namespace,
                        reserved_strings,
                        terminal_or_nonterminal
                    )
                    dfa_state.transitions[transition] = DFAPlan(next_dfa)

    _calculate_tree_traversal(rule_to_dfas)
    return Grammar(start_nonterminal, rule_to_dfas, reserved_strings)  # type: ignore[arg-type]


def _make_transition(token_namespace, reserved_syntax_strings, label):
    """
    Creates a reserved string ("if", "for", "*", ...) or returns the token type
    (NUMBER, STRING, ...) for a given grammar terminal.
    """
    if label[0].isalpha():
        # A named token (e.g. NAME, NUMBER, STRING)
        return getattr(token_namespace, label)
    else:
        # Either a keyword or an operator
        assert label[0] in ('"', "'"), label
        assert not label.startswith('"""') and not label.startswith("'''")
        value = literal_eval(label)
        try:
            return reserved_syntax_strings[value]
        except KeyError:
            r = reserved_syntax_strings[value] = ReservedString(value)
            return r


def _calculate_tree_traversal(nonterminal_to_dfas):
    """
    By this point we know how dfas can move around within a stack node, but we
    don't know how we can add a new stack node (nonterminal transitions).
    """
    # Map from grammar rule (nonterminal) name to a set of tokens.
    first_plans = {}

    nonterminals = list(nonterminal_to_dfas.keys())
    nonterminals.sort()
    for nonterminal in nonterminals:
        if nonterminal not in first_plans:
            _calculate_first_plans(nonterminal_to_dfas, first_plans, nonterminal)

    # Now that we have calculated the first terminals, we are sure that
    # there is no left recursion.

    for dfas in nonterminal_to_dfas.values():
        for dfa_state in dfas:
            transitions = dfa_state.transitions
            for nonterminal, next_dfa in dfa_state.nonterminal_arcs.items():
                for transition, pushes in first_plans[nonterminal].items():
                    if transition in transitions:
                        prev_plan = transitions[transition]
                        # Make sure these are sorted so that error messages are
                        # at least deterministic
                        choices = sorted([
                            (
                                prev_plan.dfa_pushes[0].from_rule
                                if prev_plan.dfa_pushes
                                else prev_plan.next_dfa.from_rule
                            ),
                            (
                                pushes[0].from_rule
                                if pushes else next_dfa.from_rule
                            ),
                        ])
                        raise ValueError(
                            "Rule %s is ambiguous; given a %s token, we "
                            "can't determine if we should evaluate %s or %s."
                            % (
                                (
                                    dfa_state.from_rule,
                                    transition,
                                ) + tuple(choices)
                            )
                        )
                    transitions[transition] = DFAPlan(next_dfa, pushes)


def _calculate_first_plans(nonterminal_to_dfas, first_plans, nonterminal):
    """
    Calculates the first plan in the first_plans dictionary for every given
    nonterminal. This is going to be used to know when to create stack nodes.
    """
    dfas = nonterminal_to_dfas[nonterminal]
    new_first_plans = {}
    first_plans[nonterminal] = None  # dummy to detect left recursion
    # We only need to check the first dfa. All the following ones are not
    # interesting to find first terminals.
    state = dfas[0]
    for transition, next_ in state.transitions.items():
        # It's a string. We have finally found a possible first token.
        new_first_plans[transition] = [next_.next_dfa]

    for nonterminal2, next_ in state.nonterminal_arcs.items():
        # It's a nonterminal and we have either a left recursion issue
        # in the grammar or we have to recurse.
        try:
            first_plans2 = first_plans[nonterminal2]
        except KeyError:
            first_plans2 = _calculate_first_plans(nonterminal_to_dfas, first_plans, nonterminal2)
        else:
            if first_plans2 is None:
                raise ValueError("left recursion for rule %r" % nonterminal)

        for t, pushes in first_plans2.items():
            new_first_plans[t] = [next_] + pushes

    first_plans[nonterminal] = new_first_plans
    return new_first_plans
