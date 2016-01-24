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
"""Generic visitor pattern for pytrees.

The lib2to3 parser produces a "pytree" - syntax tree consisting of Node
and Leaf types. This module implements a visitor pattern for such trees.

It also exports a basic "dumping" visitor that dumps a textual representation of
a pytree into a stream.

  PyTreeVisitor: a generic visitor pattern fo pytrees.
  PyTreeDumper: a configurable "dumper" for displaying pytrees.
  DumpPyTree(): a convenience function to dump a pytree.
"""

import sys

from lib2to3 import pytree

from yapf.yapflib import pytree_utils


class PyTreeVisitor(object):
  """Visitor pattern for pytree trees.

  Methods named Visit_XXX will be invoked when a node with type XXX is
  encountered in the tree. The type is either a token type (for Leaf nodes) or
  grammar symbols (for Node nodes). The return value of Visit_XXX methods is
  ignored by the visitor.

  Visitors can modify node contents but must not change the tree structure
  (e.g. add/remove children and move nodes around).

  This is a very common visitor pattern in Python code; it's also used in the
  Python standard library ast module for providing AST visitors.

  Note: this makes names that aren't style conformant, so such visitor methods
  need to be marked with # pylint: disable=invalid-name We don't have a choice
  here, because lib2to3 nodes have under_separated names.

  For more complex behavior, the visit, DefaultNodeVisit and DefaultLeafVisit
  methods can be overridden. Don't forget to invoke DefaultNodeVisit for nodes
  that may have children - otherwise the children will not be visited.
  """

  def Visit(self, node):
    """Visit a node."""
    method = 'Visit_{0}'.format(pytree_utils.NodeName(node))
    if hasattr(self, method):
      # Found a specific visitor for this node
      getattr(self, method)(node)
    else:
      if isinstance(node, pytree.Leaf):
        self.DefaultLeafVisit(node)
      else:
        self.DefaultNodeVisit(node)

  def DefaultNodeVisit(self, node):
    """Default visitor for Node: visits the node's children depth-first.

    This method is invoked when no specific visitor for the node is defined.

    Arguments:
      node: the node to visit
    """
    for child in node.children:
      self.Visit(child)

  def DefaultLeafVisit(self, leaf):
    """Default visitor for Leaf: no-op.

    This method is invoked when no specific visitor for the leaf is defined.

    Arguments:
      leaf: the leaf to visit
    """
    pass


def DumpPyTree(tree, target_stream=sys.stdout):
  """Convenience function for dumping a given pytree.

  This function presents a very minimal interface. For more configurability (for
  example, controlling how specific node types are displayed), use PyTreeDumper
  directly.

  Arguments:
    tree: the tree to dump.
    target_stream: the stream to dump the tree to. A file-like object. By
      default will dump into stdout.
  """
  dumper = PyTreeDumper(target_stream)
  dumper.Visit(tree)


class PyTreeDumper(PyTreeVisitor):
  """Visitor that dumps the tree to a stream.

  Implements the PyTreeVisitor interface.
  """

  def __init__(self, target_stream=sys.stdout):
    """Create a tree dumper.

    Arguments:
      target_stream: the stream to dump the tree to. A file-like object. By
        default will dump into stdout.
    """
    self._target_stream = target_stream
    self._current_indent = 0

  def _DumpString(self, s):
    self._target_stream.write('{0}{1}\n'.format(' ' * self._current_indent, s))

  def DefaultNodeVisit(self, node):
    # Dump information about the current node, and then use the generic
    # DefaultNodeVisit visitor to dump each of its children.
    self._DumpString(pytree_utils.DumpNodeToString(node))
    self._current_indent += 2
    super(PyTreeDumper, self).DefaultNodeVisit(node)
    self._current_indent -= 2

  def DefaultLeafVisit(self, leaf):
    self._DumpString(pytree_utils.DumpNodeToString(leaf))
