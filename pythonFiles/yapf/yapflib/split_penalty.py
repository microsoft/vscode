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
"""Computation of split penalties before/between tokens."""

from lib2to3 import pytree

from yapf.yapflib import py3compat
from yapf.yapflib import pytree_utils
from yapf.yapflib import pytree_visitor
from yapf.yapflib import style

# TODO(morbo): Document the annotations in a centralized place. E.g., the
# README file.
UNBREAKABLE = 1000 * 1000
STRONGLY_CONNECTED = 2000
CONTIGUOUS_LIST = 500

NOT_TEST = 242
COMPARISON_EXPRESSION = 842
ARITHMETIC_EXPRESSION = 942


def ComputeSplitPenalties(tree):
  """Compute split penalties on tokens in the given parse tree.

  Arguments:
    tree: the top-level pytree node to annotate with penalties.
  """
  _TreePenaltyAssigner().Visit(tree)


class _TreePenaltyAssigner(pytree_visitor.PyTreeVisitor):
  """Assigns split penalties to tokens, based on parse tree structure.

  Split penalties are attached as annotations to tokens.
  """

  def Visit_import_as_names(self, node):  # pyline: disable=invalid-name
    # import_as_names ::= import_as_name (',' import_as_name)* [',']
    self.DefaultNodeVisit(node)
    prev_child = None
    for child in node.children:
      if (prev_child and isinstance(prev_child, pytree.Leaf) and
          prev_child.value == ','):
        pytree_utils.SetNodeAnnotation(child,
                                       pytree_utils.Annotation.SPLIT_PENALTY,
                                       style.Get('SPLIT_PENALTY_IMPORT_NAMES'))
      prev_child = child

  def Visit_classdef(self, node):  # pylint: disable=invalid-name
    # classdef ::= 'class' NAME ['(' [arglist] ')'] ':' suite
    #
    # NAME
    self._SetUnbreakable(node.children[1])
    if len(node.children) > 4:
      # opening '('
      self._SetUnbreakable(node.children[2])
    # ':'
    self._SetUnbreakable(node.children[-2])
    self.DefaultNodeVisit(node)

  def Visit_funcdef(self, node):  # pylint: disable=invalid-name
    # funcdef ::= 'def' NAME parameters ['->' test] ':' suite
    #
    # Can't break before the function name and before the colon. The parameters
    # are handled by child iteration.
    colon_idx = 1
    while pytree_utils.NodeName(node.children[colon_idx]) == 'simple_stmt':
      colon_idx += 1
    self._SetUnbreakable(node.children[colon_idx])
    while colon_idx < len(node.children):
      if (isinstance(node.children[colon_idx], pytree.Leaf) and
          node.children[colon_idx].value == ':'):
        break
      colon_idx += 1
    self._SetUnbreakable(node.children[colon_idx])
    self.DefaultNodeVisit(node)

  def Visit_lambdef(self, node):  # pylint: disable=invalid-name
    # lambdef ::= 'lambda' [varargslist] ':' test
    # Loop over the lambda up to and including the colon.
    self._SetUnbreakableOnChildren(node)

  def Visit_parameters(self, node):  # pylint: disable=invalid-name
    # parameters ::= '(' [typedargslist] ')'
    self.DefaultNodeVisit(node)

    # Can't break before the opening paren of a parameter list.
    self._SetUnbreakable(node.children[0])
    self._SetStronglyConnected(node.children[-1])

  def Visit_argument(self, node):  # pylint: disable=invalid-name
    # argument ::= test [comp_for] | test '=' test  # Really [keyword '='] test
    self.DefaultNodeVisit(node)

    index = 0
    while index < len(node.children) - 1:
      next_child = node.children[index + 1]
      if isinstance(next_child, pytree.Leaf) and next_child.value == '=':
        self._SetStronglyConnected(node.children[index + 1],
                                   node.children[index + 2])
      index += 1

  def Visit_dotted_name(self, node):  # pylint: disable=invalid-name
    # dotted_name ::= NAME ('.' NAME)*
    self._SetUnbreakableOnChildren(node)

  def Visit_dictsetmaker(self, node):  # pylint: disable=invalid-name
    # dictsetmaker ::= ( (test ':' test
    #                      (comp_for | (',' test ':' test)* [','])) |
    #                    (test (comp_for | (',' test)* [','])) )
    prev_child = None
    for child in node.children:
      self.Visit(child)
      if pytree_utils.NodeName(child) == 'COLON':
        # This is a key to a dictionary. We don't want to split the key if at
        # all possible.
        self._SetStronglyConnected(prev_child, child)
      prev_child = child

  def Visit_trailer(self, node):  # pylint: disable=invalid-name
    # trailer ::= '(' [arglist] ')' | '[' subscriptlist ']' | '.' NAME
    self.DefaultNodeVisit(node)
    if node.children[0].value == '.':
      self._SetUnbreakableOnChildren(node)
    elif len(node.children) == 2:
      # Don't split an empty argument list if at all possible.
      self._SetStronglyConnected(node.children[1])
    elif len(node.children) == 3:
      if (pytree_utils.NodeName(node.children[1]) not in {'arglist', 'argument',
                                                          'term'}):
        # Don't split an argument list with one element if at all possible.
        self._SetStronglyConnected(node.children[1], node.children[2])
      if pytree_utils.NodeName(node.children[-1]) == 'RSQB':
        # Don't split the ending bracket of a subscript list.
        self._SetStronglyConnected(node.children[-1])

  def Visit_power(self, node):  # pylint: disable=invalid-name,missing-docstring
    # power ::= atom trailer* ['**' factor]
    self.DefaultNodeVisit(node)

    # When atom is followed by a trailer, we can not break between them.
    # E.g. arr[idx] - no break allowed between 'arr' and '['.
    if (len(node.children) > 1 and
        pytree_utils.NodeName(node.children[1]) == 'trailer'):
      # children[1] itself is a whole trailer: we don't want to
      # mark all of it as unbreakable, only its first token: (, [ or .
      self._SetUnbreakable(node.children[1].children[0])

      # A special case when there are more trailers in the sequence. Given:
      #   atom tr1 tr2
      # The last token of tr1 and the first token of tr2 comprise an unbreakable
      # region. For example: foo.bar.baz(1)
      # We can't put breaks between either of the '.', '(', or '[' and the names
      # *preceding* them.
      prev_trailer_idx = 1
      while prev_trailer_idx < len(node.children) - 1:
        cur_trailer_idx = prev_trailer_idx + 1
        cur_trailer = node.children[cur_trailer_idx]
        if pytree_utils.NodeName(cur_trailer) == 'trailer':
          # Now we know we have two trailers one after the other
          prev_trailer = node.children[prev_trailer_idx]
          if prev_trailer.children[-1].value != ')':
            # Set the previous node unbreakable if it's not a function call:
            #   atom tr1() tr2
            # It may be necessary (though undesirable) to split up a previous
            # function call's parentheses to the next line.
            self._SetUnbreakable(prev_trailer.children[-1])
          self._SetUnbreakable(cur_trailer.children[0])
          prev_trailer_idx = cur_trailer_idx
        else:
          break

    # We don't want to split before the last ')' of a function call. This also
    # takes care of the special case of:
    #   atom tr1 tr2 ... trn
    # where the 'tr#' are trailers that may end in a ')'.
    for trailer in node.children[1:]:
      if pytree_utils.NodeName(trailer) != 'trailer':
        break
      if trailer.children[0].value in '([':
        if len(trailer.children) > 2:
          self._SetUnbreakable(trailer.children[-1])
          if _FirstChildNode(trailer).lineno == _LastChildNode(trailer).lineno:
            # If the trailer was originally on one line, then try to keep it
            # like that.
            self._SetExpressionPenalty(trailer, CONTIGUOUS_LIST)
        else:
          # If the trailer's children are '()', then make it a strongly
          # connected region.  It's sometimes necessary, though undesirable, to
          # split the two.
          self._SetStronglyConnected(trailer.children[-1])

    # If the original source has a "builder" style calls, then we should allow
    # the reformatter to retain that.
    _AllowBuilderStyleCalls(node)

  def Visit_subscript(self, node):  # pylint: disable=invalid-name
    # subscript ::= test | [test] ':' [test] [sliceop]
    self._SetStronglyConnected(*node.children)
    self.DefaultNodeVisit(node)

  def Visit_comp_for(self, node):  # pylint: disable=invalid-name
    # comp_for ::= 'for' exprlist 'in' testlist_safe [comp_iter]
    pytree_utils.SetNodeAnnotation(_FirstChildNode(node),
                                   pytree_utils.Annotation.SPLIT_PENALTY, 0)
    self._SetStronglyConnected(*node.children[1:])
    self.DefaultNodeVisit(node)

  def Visit_comp_if(self, node):  # pylint: disable=invalid-name
    # comp_if ::= 'if' old_test [comp_iter]
    pytree_utils.SetNodeAnnotation(node.children[0],
                                   pytree_utils.Annotation.SPLIT_PENALTY, 0)
    self._SetStronglyConnected(*node.children[1:])
    self.DefaultNodeVisit(node)

  def Visit_not_test(self, node):  # pylint: disable=invalid-name
    # not_test ::= 'not' not_test | comparison
    self.DefaultNodeVisit(node)
    self._SetExpressionPenalty(node, NOT_TEST)

  def Visit_comparison(self, node):  # pylint: disable=invalid-name
    # comparison ::= expr (comp_op expr)*
    self.DefaultNodeVisit(node)
    self._SetExpressionPenalty(node, COMPARISON_EXPRESSION)

  def Visit_arith_expr(self, node):  # pylint: disable=invalid-name
    # arith_expr ::= term (('+'|'-') term)*
    self.DefaultNodeVisit(node)
    self._SetExpressionPenalty(node, ARITHMETIC_EXPRESSION)

  def Visit_atom(self, node):  # pylint: disable=invalid-name
    # atom ::= ('(' [yield_expr|testlist_gexp] ')'
    #           '[' [listmaker] ']' |
    #           '{' [dictsetmaker] '}')
    self.DefaultNodeVisit(node)
    if node.children[0].value == '(':
      if node.children[0].lineno == node.children[-1].lineno:
        self._SetExpressionPenalty(node, CONTIGUOUS_LIST)
      if node.children[-1].value == ')':
        if pytree_utils.NodeName(node.parent) == 'if_stmt':
          pytree_utils.SetNodeAnnotation(node.children[-1],
                                         pytree_utils.Annotation.SPLIT_PENALTY,
                                         UNBREAKABLE)
        else:
          pytree_utils.SetNodeAnnotation(node.children[-1],
                                         pytree_utils.Annotation.SPLIT_PENALTY,
                                         STRONGLY_CONNECTED)
    elif node.children[0].value in '[{':
      # Keep empty containers together if we can.
      lbracket = node.children[0]
      rbracket = node.children[-1]
      if len(node.children) == 2:
        self._SetUnbreakable(node.children[-1])
      elif (rbracket.value in ']}' and
            lbracket.get_lineno() == rbracket.get_lineno() and
            rbracket.column - lbracket.column < style.Get('COLUMN_LIMIT')):
        self._SetExpressionPenalty(node, CONTIGUOUS_LIST)

  ############################################################################
  # Helper methods that set the annotations.

  def _SetUnbreakable(self, node):
    """Set an UNBREAKABLE penalty annotation for the given node."""
    _RecAnnotate(node, pytree_utils.Annotation.SPLIT_PENALTY, UNBREAKABLE)

  def _SetStronglyConnected(self, *nodes):
    """Set a STRONGLY_CONNECTED penalty annotation for the given nodes."""
    for node in nodes:
      _RecAnnotate(node, pytree_utils.Annotation.SPLIT_PENALTY,
                   STRONGLY_CONNECTED)

  def _SetUnbreakableOnChildren(self, node):
    """Set an UNBREAKABLE penalty annotation on children of node."""
    for child in node.children:
      self.Visit(child)
    start = 2 if hasattr(node.children[0], 'is_pseudo') else 1
    for i in py3compat.range(start, len(node.children)):
      self._SetUnbreakable(node.children[i])

  def _SetExpressionPenalty(self, node, penalty):
    """Set an ARITHMETIC_EXPRESSION penalty annotation children nodes."""

    def RecArithmeticExpression(node, first_child_leaf):
      if node is first_child_leaf:
        return

      if isinstance(node, pytree.Leaf):
        if node.value in {'(', 'for', 'if'}:
          return
        penalty_annotation = pytree_utils.GetNodeAnnotation(
            node,
            pytree_utils.Annotation.SPLIT_PENALTY,
            default=0)
        if penalty_annotation < penalty:
          pytree_utils.SetNodeAnnotation(
              node, pytree_utils.Annotation.SPLIT_PENALTY, penalty)
      else:
        for child in node.children:
          RecArithmeticExpression(child, first_child_leaf)

    RecArithmeticExpression(node, _FirstChildNode(node))


def _RecAnnotate(tree, annotate_name, annotate_value):
  """Recursively set the given annotation on all leafs of the subtree.

  Takes care to only increase the penalty. If the node already has a higher
  or equal penalty associated with it, this is a no-op.

  Args:
    tree: subtree to annotate
    annotate_name: name of the annotation to set
    annotate_value: value of the annotation to set
  """
  for child in tree.children:
    _RecAnnotate(child, annotate_name, annotate_value)
  if isinstance(tree, pytree.Leaf):
    cur_annotate = pytree_utils.GetNodeAnnotation(tree,
                                                  annotate_name,
                                                  default=0)
    if cur_annotate < annotate_value:
      pytree_utils.SetNodeAnnotation(tree, annotate_name, annotate_value)


def _AllowBuilderStyleCalls(node):
  """Allow splitting before '.' if it's a builder style function call."""

  def RecGetLeaves(node):
    if isinstance(node, pytree.Leaf):
      return [node]
    children = []
    for child in node.children:
      children += RecGetLeaves(child)
    return children

  list_of_children = RecGetLeaves(node)
  prev_child = None
  for child in list_of_children:
    if child.value == '.':
      if prev_child.lineno != child.lineno:
        pytree_utils.SetNodeAnnotation(child,
                                       pytree_utils.Annotation.SPLIT_PENALTY, 0)
    prev_child = child


def _FirstChildNode(node):
  if isinstance(node, pytree.Leaf):
    return node
  return _FirstChildNode(node.children[0])


def _LastChildNode(node):
  if isinstance(node, pytree.Leaf):
    return node
  return _LastChildNode(node.children[-1])
