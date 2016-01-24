# Copyright 2015 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""PyTreeUnwrapper - produces a list of unwrapped lines from a pytree.

[for a description of what an unwrapped line is, see unwrapped_line.py]

This is a pytree visitor that goes over a parse tree and produces a list of
UnwrappedLine containers from it, each with its own depth and containing all
the tokens that could fit on the line if there were no maximal line-length
limitations.

Note: a precondition to running this visitor and obtaining correct results is
for the tree to have its comments spliced in as nodes. Prefixes are ignored.

For most uses, the convenience function UnwrapPyTree should be sufficient.
"""

# The word "token" is overloaded within this module, so for clarity rename
# the imported pgen2.token module.
from lib2to3 import pytree
from lib2to3.pgen2 import token as grammar_token

from yapf.yapflib import pytree_utils
from yapf.yapflib import pytree_visitor
from yapf.yapflib import split_penalty
from yapf.yapflib import unwrapped_line


def UnwrapPyTree(tree):
  """Create and return a list of unwrapped lines from the given pytree.

  Arguments:
    tree: the top-level pytree node to unwrap.

  Returns:
    A list of UnwrappedLine objects.
  """
  unwrapper = PyTreeUnwrapper()
  unwrapper.Visit(tree)
  uwlines = unwrapper.GetUnwrappedLines()
  uwlines.sort(key=lambda x: x.lineno)
  return uwlines

# Grammar tokens considered as whitespace for the purpose of unwrapping.
_WHITESPACE_TOKENS = frozenset([grammar_token.NEWLINE, grammar_token.DEDENT,
                                grammar_token.INDENT, grammar_token.ENDMARKER])


class PyTreeUnwrapper(pytree_visitor.PyTreeVisitor):
  """PyTreeUnwrapper - see file-level docstring for detailed description.

  Note: since this implements PyTreeVisitor and node names in lib2to3 are
  underscore_separated, the visiting methods of this class are named as
  Visit_node_name. invalid-name pragmas are added to each such method to silence
  a style warning. This is forced on us by the usage of lib2to3, and re-munging
  method names to make them different from actual node names sounded like a
  confusing and brittle affair that wasn't worth it for this small & controlled
  deviation from the style guide.

  To understand the connection between visitor methods in this class, some
  familiarity with the Python grammar is required.
  """

  def __init__(self):
    # A list of all unwrapped lines finished visiting so far.
    self._unwrapped_lines = []

    # Builds up a "current" unwrapped line while visiting pytree nodes. Some
    # nodes will finish a line and start a new one.
    self._cur_unwrapped_line = unwrapped_line.UnwrappedLine(0)

    # Current indentation depth.
    self._cur_depth = 0

  def GetUnwrappedLines(self):
    """Fetch the result of the tree walk.

    Note: only call this after visiting the whole tree.

    Returns:
      A list of UnwrappedLine objects.
    """
    # Make sure the last line that was being populated is flushed.
    self._StartNewLine()
    return self._unwrapped_lines

  def _StartNewLine(self):
    """Finish current line and start a new one.

    Place the currently accumulated line into the _unwrapped_lines list and
    start a new one.
    """
    if self._cur_unwrapped_line.tokens:
      self._unwrapped_lines.append(self._cur_unwrapped_line)
      _MatchBrackets(self._cur_unwrapped_line)
      _AdjustSplitPenalty(self._cur_unwrapped_line)
    self._cur_unwrapped_line = unwrapped_line.UnwrappedLine(self._cur_depth)

  # pylint: disable=invalid-name,missing-docstring
  def Visit_simple_stmt(self, node):
    # A 'simple_stmt' conveniently represents a non-compound Python statement,
    # i.e. a statement that does not contain other statements.

    # When compound nodes have a single statement as their suite, the parser
    # can leave it in the tree directly without creating a suite. But we have
    # to increase depth in these cases as well. However, don't increase the
    # depth of we have a simple_stmt that's a comment node. This represents a
    # standalone comment and in the case of it coming directly after the
    # funcdef, it is a "top" comment for the whole function.
    # TODO(eliben): add more relevant compound statements here.
    single_stmt_suite = (node.parent and pytree_utils.NodeName(node.parent) in {
        'if_stmt', 'while_stmt', 'for_stmt', 'try_stmt', 'expect_clause',
        'with_stmt', 'funcdef', 'classdef'
    })
    is_comment_stmt = pytree_utils.NodeName(node.children[0]) == 'COMMENT'
    if single_stmt_suite and not is_comment_stmt:
      self._cur_depth += 1
    self._StartNewLine()
    self.DefaultNodeVisit(node)
    if single_stmt_suite and not is_comment_stmt:
      self._cur_depth -= 1

  def _VisitCompoundStatement(self, node, substatement_names):
    """Helper for visiting compound statements.

    Python compound statements serve as containers for other statements. Thus,
    when we encounter a new compound statement we start a new unwrapped line.

    Arguments:
      node: the node to visit.
      substatement_names: set of node names. A compound statement will be
        recognized as a NAME node with a name in this set.
    """
    for child in node.children:
      # A pytree is structured in such a way that a single 'if_stmt' node will
      # contain all the 'if', 'elif' and 'else' nodes as children (similar
      # structure applies to 'while' statements, 'try' blocks, etc). Therefore,
      # we visit all children here and create a new line before the requested
      # set of nodes.
      if (child.type == grammar_token.NAME and
          child.value in substatement_names):
        self._StartNewLine()
      self.Visit(child)

  def Visit_if_stmt(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'if', 'else', 'elif'})

  def Visit_while_stmt(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'while', 'else'})

  def Visit_for_stmt(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'for', 'else'})

  def Visit_try_stmt(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'try', 'except', 'else', 'finally'})

  def Visit_except_clause(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'except'})

  def Visit_funcdef(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'def'})

  def Visit_classdef(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'class'})

  def Visit_decorators(self, node):  # pylint: disable=invalid-name
    for child in node.children:
      self._StartNewLine()
      self.Visit(child)

  def Visit_decorated(self, node):  # pylint: disable=invalid-name
    for child in node.children:
      self._StartNewLine()
      self.Visit(child)

  def Visit_with_stmt(self, node):  # pylint: disable=invalid-name
    self._VisitCompoundStatement(node, {'with'})

  def Visit_suite(self, node):  # pylint: disable=invalid-name
    # A 'suite' starts a new indentation level in Python.
    self._cur_depth += 1
    self._StartNewLine()
    self.DefaultNodeVisit(node)
    self._cur_depth -= 1

  def Visit_listmaker(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def Visit_dictsetmaker(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def Visit_import_as_names(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def Visit_testlist_gexp(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def Visit_arglist(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def Visit_typedargslist(self, node):  # pylint: disable=invalid-name
    _DetermineMustSplitAnnotation(node)
    self.DefaultNodeVisit(node)

  def DefaultLeafVisit(self, leaf):
    """Default visitor for tree leaves.

    A tree leaf is always just gets appended to the current unwrapped line.

    Arguments:
      leaf: the leaf to visit.
    """
    if leaf.type in _WHITESPACE_TOKENS:
      self._StartNewLine()
    elif leaf.type != grammar_token.COMMENT or leaf.value.strip():
      if leaf.value == ';':
        # Split up multiple statements on one line.
        self._StartNewLine()
      else:
        # Add non-whitespace tokens and comments that aren't empty.
        self._cur_unwrapped_line.AppendNode(leaf)


_BRACKET_MATCH = {')': '(', '}': '{', ']': '['}


def _MatchBrackets(uwline):
  """Visit the node and match the brackets.

  For every open bracket ('[', '{', or '('), find the associated closing bracket
  and "match" them up. I.e., save in the token a pointer to its associated open
  or close bracket.

  Arguments:
    uwline: (UnwrappedLine) An unwrapped line.
  """
  bracket_stack = []
  for token in uwline.tokens:
    if token.value in pytree_utils.OPENING_BRACKETS:
      bracket_stack.append(token)
    elif token.value in pytree_utils.CLOSING_BRACKETS:
      assert _BRACKET_MATCH[token.value] == bracket_stack[-1].value
      bracket_stack[-1].matching_bracket = token
      token.matching_bracket = bracket_stack[-1]
      bracket_stack.pop()


def _AdjustSplitPenalty(uwline):
  """Visit the node and adjust the split penalties if needed.

  A token shouldn't be split if it's not within a bracket pair. Mark any token
  that's not within a bracket pair as "unbreakable".

  Arguments:
    uwline: (UnwrappedLine) An unwrapped line.
  """
  bracket_level = 0
  for index, token in enumerate(uwline.tokens):
    if index and not bracket_level:
      pytree_utils.SetNodeAnnotation(token.GetPytreeNode(),
                                     pytree_utils.Annotation.SPLIT_PENALTY,
                                     split_penalty.UNBREAKABLE)
    if token.value in pytree_utils.OPENING_BRACKETS:
      bracket_level += 1
    elif token.value in pytree_utils.CLOSING_BRACKETS:
      bracket_level -= 1


def _DetermineMustSplitAnnotation(node):
  """Enforce a split in the list if the list ends with a comma."""
  if not (_ContainsComments(node) or (isinstance(node.children[-1], pytree.Leaf)
                                      and node.children[-1].value == ',')):
    return
  num_children = len(node.children)
  index = 0
  while index < num_children - 1:
    child = node.children[index]
    if isinstance(child, pytree.Leaf) and child.value == ',':
      next_child = node.children[index + 1]
      if pytree_utils.NodeName(next_child) == 'COMMENT':
        index += 1
        if index >= num_children - 1:
          break
      _SetMustSplitOnFirstLeaf(node.children[index + 1])
    index += 1


def _ContainsComments(node):
  """Return True if the list has a comment in it."""
  if isinstance(node, pytree.Leaf):
    return pytree_utils.NodeName(node) == 'COMMENT'
  contains_comments = False
  for child in node.children:
    contains_comments = contains_comments or _ContainsComments(child)
  return contains_comments


def _SetMustSplitOnFirstLeaf(node):
  """Set the "must split" annotation on the first leaf node."""

  def FindFirstLeaf(node):
    if isinstance(node, pytree.Leaf):
      return node

    return FindFirstLeaf(node.children[0])

  pytree_utils.SetNodeAnnotation(
      FindFirstLeaf(node), pytree_utils.Annotation.MUST_SPLIT, True)
