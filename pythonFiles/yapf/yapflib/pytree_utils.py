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
"""pytree-related utilities.

This module collects various utilities related to the parse trees produced by
the lib2to3 library.

  NodeName(): produces a string name for pytree nodes.
  ParseCodeToTree(): convenience wrapper around lib2to3 interfaces to parse
                     a given string with code to a pytree.
  InsertNodeBefore(): insert a node before another in a pytree.
  InsertNodeAfter(): insert a node after another in a pytree.
  {Get,Set}NodeAnnotation(): manage custom annotations on pytree nodes.
"""

import ast
from lib2to3 import pygram
from lib2to3 import pytree
from lib2to3.pgen2 import driver
from lib2to3.pgen2 import parse
from lib2to3.pgen2 import token

# TODO(eliben): We may want to get rid of this filtering at some point once we
# have a better understanding of what information we need from the tree. Then,
# these tokens may be filtered out from the tree before the tree gets to the
# unwrapper.
NONSEMANTIC_TOKENS = frozenset(['DEDENT', 'INDENT', 'NEWLINE', 'ENDMARKER'])

OPENING_BRACKETS = frozenset({'(', '[', '{'})
CLOSING_BRACKETS = frozenset({')', ']', '}'})


class Annotation(object):
  """Annotation names associated with pytrees."""
  CHILD_INDENT = 'child_indent'
  NEWLINES = 'newlines'
  MUST_SPLIT = 'must_split'
  SPLIT_PENALTY = 'split_penalty'
  SUBTYPE = 'subtype'


def NodeName(node):
  """Produce a string name for a given node.

  For a Leaf this is the token name, and for a Node this is the type.

  Arguments:
    node: a tree node

  Returns:
    Name as a string.
  """
  # Nodes with values < 256 are tokens. Values >= 256 are grammar symbols.
  if node.type < 256:
    return token.tok_name[node.type]
  else:
    return pygram.python_grammar.number2symbol[node.type]

# lib2to3 thoughtfully provides pygram.python_grammar_no_print_statement for
# parsing Python 3 code that wouldn't parse otherwise (when 'print' is used in a
# context where a keyword is disallowed).
# It forgets to do the same for 'exec' though. Luckily, Python is amenable to
# monkey-patching.
_GRAMMAR_FOR_PY3 = pygram.python_grammar_no_print_statement.copy()
del _GRAMMAR_FOR_PY3.keywords['exec']

_GRAMMAR_FOR_PY2 = pygram.python_grammar.copy()


def ParseCodeToTree(code):
  """Parse the given code to a lib2to3 pytree.

  Arguments:
    code: a string with the code to parse.

  Raises:
    SyntaxError if the code is invalid syntax.
    parse.ParseError if some other parsing failure.

  Returns:
    The root node of the parsed tree.
  """
  # This function is tiny, but the incantation for invoking the parser correctly
  # is sufficiently magical to be worth abstracting away.
  try:
    # Try to parse using a Python 3 grammar, which is more permissive (print and
    # exec are not keywords).
    parser_driver = driver.Driver(_GRAMMAR_FOR_PY3, convert=pytree.convert)
    tree = parser_driver.parse_string(code, debug=False)
  except parse.ParseError:
    # Now try to parse using a Python 2 grammar; If this fails, then
    # there's something else wrong with the code.
    try:
      parser_driver = driver.Driver(_GRAMMAR_FOR_PY2, convert=pytree.convert)
      tree = parser_driver.parse_string(code, debug=False)
    except parse.ParseError:
      # Raise a syntax error if the code is invalid python syntax.
      try:
        ast.parse(code)
      except SyntaxError as e:
        raise e
      else:
        raise
  return _WrapEndMarker(tree)


def _WrapEndMarker(tree):
  """Wrap a single ENDMARKER token in a "file_input" node.

  Arguments:
    tree: (pytree.Node) The root node of the parsed tree.

  Returns:
    The root node of the parsed tree. If the tree is a single ENDMARKER node,
    then that node is wrapped in a "file_input" node. That will ensure we don't
    skip comments attached to that node.
  """
  if isinstance(tree, pytree.Leaf) and tree.type == token.ENDMARKER:
    return pytree.Node(pygram.python_symbols.file_input, [tree])
  return tree


def InsertNodesBefore(new_nodes, target):
  """Insert new_nodes before the given target location in the tree.

  Arguments:
    new_nodes: a sequence of new nodes to insert (the nodes should not be in the
      tree).
    target: the target node before which the new node node will be inserted.

  Raises:
    RuntimeError: if the tree is corrupted, or the insertion would corrupt it.
  """
  for node in new_nodes:
    _InsertNodeAt(node, target, after=False)


def InsertNodesAfter(new_nodes, target):
  """Insert new_nodes after the given target location in the tree.

  Arguments:
    new_nodes: a sequence of new nodes to insert (the nodes should not be in the
      tree).
    target: the target node after which the new node node will be inserted.

  Raises:
    RuntimeError: if the tree is corrupted, or the insertion would corrupt it.
  """
  for node in reversed(new_nodes):
    _InsertNodeAt(node, target, after=True)


def _InsertNodeAt(new_node, target, after=False):
  """Underlying implementation for node insertion.

  Arguments:
    new_node: a new node to insert (this node should not be in the tree).
    target: the target node.
    after: if True, new_node is inserted after target. Otherwise, it's inserted
      before target.

  Returns:
    nothing

  Raises:
    RuntimeError: if the tree is corrupted, or the insertion would corrupt it.
  """

  # Protect against attempts to insert nodes which already belong to some tree.
  if new_node.parent is not None:
    raise RuntimeError('inserting node which already has a parent',
                       (new_node, new_node.parent))

  # The code here is based on pytree.Base.next_sibling
  parent_of_target = target.parent
  if parent_of_target is None:
    raise RuntimeError('expected target node to have a parent', (target,))

  for i, child in enumerate(parent_of_target.children):
    if child is target:
      insertion_index = i + 1 if after else i
      parent_of_target.insert_child(insertion_index, new_node)
      return

  raise RuntimeError('unable to find insertion point for target node',
                     (target,))

# The following constant and functions implement a simple custom annotation
# mechanism for pytree nodes. We attach new attributes to nodes. Each attribute
# is prefixed with _NODE_ANNOTATION_PREFIX. These annotations should only be
# managed through GetNodeAnnotation and SetNodeAnnotation.
_NODE_ANNOTATION_PREFIX = '_yapf_annotation_'


def GetNodeAnnotation(node, annotation, default=None):
  """Get annotation value from a node.

  Arguments:
    node: the node.
    annotation: annotation name - a string.
    default: the default value to return if there's no annotation.

  Returns:
    Value of the annotation in the given node. If the node doesn't have this
    particular annotation name yet, returns default.
  """
  return getattr(node, _NODE_ANNOTATION_PREFIX + annotation, default)


def SetNodeAnnotation(node, annotation, value):
  """Set annotation value on a node.

  Arguments:
    node: the node.
    annotation: annotation name - a string.
    value: annotation value to set.
  """
  setattr(node, _NODE_ANNOTATION_PREFIX + annotation, value)


def AppendNodeAnnotation(node, annotation, value):
  """Appends an annotation value to a list of annotations on the node.

  Arguments:
    node: the node.
    annotation: annotation name - a string.
    value: annotation value to set.
  """
  attr = GetNodeAnnotation(node, annotation, set())
  attr.add(value)
  SetNodeAnnotation(node, annotation, attr)


def RemoveSubtypeAnnotation(node, value):
  """Removes an annotation value from the subtype annotations on the node.

  Arguments:
    node: the node.
    value: annotation value to remove.
  """
  attr = GetNodeAnnotation(node, Annotation.SUBTYPE)
  if attr and value in attr:
    attr.remove(value)
    SetNodeAnnotation(node, Annotation.SUBTYPE, attr)


def DumpNodeToString(node):
  """Dump a string representation of the given node. For debugging.

  Arguments:
    node: the node.

  Returns:
    The string representation.
  """
  if isinstance(node, pytree.Leaf):
    fmt = '{name}({value}) [lineno={lineno}, column={column}, prefix={prefix}]'
    return fmt.format(name=NodeName(node),
                      value=repr(node),
                      lineno=node.lineno,
                      column=node.column,
                      prefix=repr(node.prefix))
  else:
    fmt = '{node} [{len} children] [child_indent="{indent}"]'
    return fmt.format(node=NodeName(node),
                      len=len(node.children),
                      indent=GetNodeAnnotation(node, Annotation.CHILD_INDENT))


def IsCommentStatement(node):
  return (NodeName(node) == 'simple_stmt' and
          NodeName(node.children[0]) == 'COMMENT')
