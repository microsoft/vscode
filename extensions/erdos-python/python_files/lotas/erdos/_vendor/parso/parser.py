# Copyright 2004-2005 Elemental Security, Inc. All Rights Reserved.
# Licensed to PSF under a Contributor Agreement.

# Modifications:
# Copyright David Halter and Contributors
# Modifications are dual-licensed: MIT and PSF.
# 99% of the code is different from pgen2, now.

"""
The ``Parser`` tries to convert the available Python code in an easy to read
format, something like an abstract syntax tree. The classes who represent this
tree, are sitting in the :mod:`parso.tree` module.

The Python module ``tokenize`` is a very important part in the ``Parser``,
because it splits the code into different words (tokens).  Sometimes it looks a
bit messy. Sorry for that! You might ask now: "Why didn't you use the ``ast``
module for this? Well, ``ast`` does a very good job understanding proper Python
code, but fails to work as soon as there's a single line of broken code.

There's one important optimization that needs to be known: Statements are not
being parsed completely. ``Statement`` is just a representation of the tokens
within the statement. This lowers memory usage and cpu time and reduces the
complexity of the ``Parser`` (there's another parser sitting inside
``Statement``, which produces ``Array`` and ``Call``).
"""
from typing import Dict, Type

from erdos._vendor.parso import tree
from erdos._vendor.parso.pgen2.generator import ReservedString


class ParserSyntaxError(Exception):
    """
    Contains error information about the parser tree.

    May be raised as an exception.
    """
    def __init__(self, message, error_leaf):
        self.message = message
        self.error_leaf = error_leaf


class InternalParseError(Exception):
    """
    Exception to signal the parser is stuck and error recovery didn't help.
    Basically this shouldn't happen. It's a sign that something is really
    wrong.
    """

    def __init__(self, msg, type_, value, start_pos):
        Exception.__init__(self, "%s: type=%r, value=%r, start_pos=%r" %
                           (msg, type_.name, value, start_pos))
        self.msg = msg
        self.type = type
        self.value = value
        self.start_pos = start_pos


class Stack(list):
    def _allowed_transition_names_and_token_types(self):
        def iterate():
            # An API just for Jedi.
            for stack_node in reversed(self):
                for transition in stack_node.dfa.transitions:
                    if isinstance(transition, ReservedString):
                        yield transition.value
                    else:
                        yield transition  # A token type

                if not stack_node.dfa.is_final:
                    break

        return list(iterate())


class StackNode:
    def __init__(self, dfa):
        self.dfa = dfa
        self.nodes = []

    @property
    def nonterminal(self):
        return self.dfa.from_rule

    def __repr__(self):
        return '%s(%s, %s)' % (self.__class__.__name__, self.dfa, self.nodes)


def _token_to_transition(grammar, type_, value):
    # Map from token to label
    if type_.value.contains_syntax:
        # Check for reserved words (keywords)
        try:
            return grammar.reserved_syntax_strings[value]
        except KeyError:
            pass

    return type_


class BaseParser:
    """Parser engine.

    A Parser instance contains state pertaining to the current token
    sequence, and should not be used concurrently by different threads
    to parse separate token sequences.

    See python/tokenize.py for how to get input tokens by a string.

    When a syntax error occurs, error_recovery() is called.
    """

    node_map: Dict[str, Type[tree.BaseNode]] = {}
    default_node = tree.Node

    leaf_map: Dict[str, Type[tree.Leaf]] = {}
    default_leaf = tree.Leaf

    def __init__(self, pgen_grammar, start_nonterminal='file_input', error_recovery=False):
        self._pgen_grammar = pgen_grammar
        self._start_nonterminal = start_nonterminal
        self._error_recovery = error_recovery

    def parse(self, tokens):
        first_dfa = self._pgen_grammar.nonterminal_to_dfas[self._start_nonterminal][0]
        self.stack = Stack([StackNode(first_dfa)])

        for token in tokens:
            self._add_token(token)

        while True:
            tos = self.stack[-1]
            if not tos.dfa.is_final:
                # We never broke out -- EOF is too soon -- Unfinished statement.
                # However, the error recovery might have added the token again, if
                # the stack is empty, we're fine.
                raise InternalParseError(
                    "incomplete input", token.type, token.string, token.start_pos
                )

            if len(self.stack) > 1:
                self._pop()
            else:
                return self.convert_node(tos.nonterminal, tos.nodes)

    def error_recovery(self, token):
        if self._error_recovery:
            raise NotImplementedError("Error Recovery is not implemented")
        else:
            type_, value, start_pos, prefix = token
            error_leaf = tree.ErrorLeaf(type_, value, start_pos, prefix)
            raise ParserSyntaxError('SyntaxError: invalid syntax', error_leaf)

    def convert_node(self, nonterminal, children):
        try:
            node = self.node_map[nonterminal](children)
        except KeyError:
            node = self.default_node(nonterminal, children)
        return node

    def convert_leaf(self, type_, value, prefix, start_pos):
        try:
            return self.leaf_map[type_](value, start_pos, prefix)
        except KeyError:
            return self.default_leaf(value, start_pos, prefix)

    def _add_token(self, token):
        """
        This is the only core function for parsing. Here happens basically
        everything. Everything is well prepared by the parser generator and we
        only apply the necessary steps here.
        """
        grammar = self._pgen_grammar
        stack = self.stack
        type_, value, start_pos, prefix = token
        transition = _token_to_transition(grammar, type_, value)

        while True:
            try:
                plan = stack[-1].dfa.transitions[transition]
                break
            except KeyError:
                if stack[-1].dfa.is_final:
                    self._pop()
                else:
                    self.error_recovery(token)
                    return
            except IndexError:
                raise InternalParseError("too much input", type_, value, start_pos)

        stack[-1].dfa = plan.next_dfa

        for push in plan.dfa_pushes:
            stack.append(StackNode(push))

        leaf = self.convert_leaf(type_, value, prefix, start_pos)
        stack[-1].nodes.append(leaf)

    def _pop(self):
        tos = self.stack.pop()
        # If there's exactly one child, return that child instead of
        # creating a new node.  We still create expr_stmt and
        # file_input though, because a lot of Jedi depends on its
        # logic.
        if len(tos.nodes) == 1:
            new_node = tos.nodes[0]
        else:
            new_node = self.convert_node(tos.dfa.from_rule, tos.nodes)

        self.stack[-1].nodes.append(new_node)
