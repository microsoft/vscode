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
"""Comment splicer for lib2to3 trees.

The lib2to3 syntax tree produced by the parser holds comments and whitespace in
prefix attributes of nodes, rather than nodes themselves. This module provides
functionality to splice comments out of prefixes and into nodes of their own,
making them easier to process.

  SpliceComments(): the main function exported by this module.
"""

from lib2to3 import pygram
from lib2to3 import pytree
from lib2to3.pgen2 import token

from yapf.yapflib import pytree_utils


def SpliceComments(tree):
  """Given a pytree, splice comments into nodes of their own right.

  Extract comments from the prefixes where they are housed after parsing.
  The prefixes that previously housed the comments become empty.

  Args:
    tree: a pytree.Node - the tree to work on. The tree is modified by this
        function.
  """
  # The previous leaf node encountered in the traversal.
  # This is a list because Python 2.x doesn't have 'nonlocal' :)
  prev_leaf = [None]
  _AnnotateIndents(tree)

  def _VisitNodeRec(node):
    # This loop may insert into node.children, so we'll iterate over a copy.
    for child in node.children[:]:
      if isinstance(child, pytree.Node):
        # Nodes don't have prefixes.
        _VisitNodeRec(child)
      else:
        if child.prefix.lstrip().startswith('#'):
          # We have a comment prefix in this child, so splicing is needed.
          comment_prefix = child.prefix
          comment_lineno = child.lineno - comment_prefix.count('\n')
          comment_column = child.column

          # Remember the leading indentation of this prefix and clear it.
          # Mopping up the prefix is important because we may go over this same
          # child in the next iteration...
          child_prefix = child.prefix.lstrip('\n')
          prefix_indent = child_prefix[:child_prefix.find('#')]
          child.prefix = ''

          if child.type == token.NEWLINE:
            # If the prefix was on a NEWLINE leaf, it's part of the line so it
            # will be inserted after the previously encountered leaf.
            # We can't just insert it before the NEWLINE node, because as a
            # result of the way pytrees are organized, this node can be under
            # an inappropriate parent.
            assert prev_leaf[0] is not None
            comment_column -= len(comment_prefix)
            comment_column += len(comment_prefix) - len(comment_prefix.lstrip())
            pytree_utils.InsertNodesAfter(
                _CreateCommentsFromPrefix(comment_prefix,
                                          comment_lineno,
                                          comment_column,
                                          standalone=False),
                prev_leaf[0])
          elif child.type == token.DEDENT:
            # Comment prefixes on DEDENT nodes also deserve special treatment,
            # because their final placement depends on their prefix.
            # We'll look for an ancestor of this child with a matching
            # indentation, and insert the comment after it.
            ancestor_at_indent = _FindAncestorAtIndent(child, prefix_indent)
            if ancestor_at_indent.type == token.DEDENT:
              # Special case where the comment is inserted in the same
              # indentation level as the DEDENT it was originally attached to.
              pytree_utils.InsertNodesBefore(
                  _CreateCommentsFromPrefix(comment_prefix,
                                            comment_lineno,
                                            comment_column,
                                            standalone=True),
                  ancestor_at_indent)
            else:
              pytree_utils.InsertNodesAfter(
                  _CreateCommentsFromPrefix(comment_prefix,
                                            comment_lineno,
                                            comment_column,
                                            standalone=True),
                  ancestor_at_indent)
          else:
            # Otherwise there are two cases.
            #
            # 1. The comment is on its own line
            # 2. The comment is part of an expression.
            #
            # Unfortunately, it's fairly difficult to distinguish between the
            # two in lib2to3 trees. The algorithm here is to determine whether
            # child is the first leaf in the statement it belongs to. If it is,
            # then the comment (which is a prefix) belongs on a separate line.
            # If it is not, it means the comment is buried deep in the statement
            # and is part of some expression.
            stmt_parent = _FindStmtParent(child)

            for leaf_in_parent in stmt_parent.leaves():
              if leaf_in_parent.type == token.NEWLINE:
                continue
              elif id(leaf_in_parent) == id(child):
                # This comment stands on its own line, and it has to be inserted
                # into the appropriate parent. We'll have to find a suitable
                # parent to insert into. See comments above
                # _STANDALONE_LINE_NODES for more details.
                node_with_line_parent = _FindNodeWithStandaloneLineParent(child)
                pytree_utils.InsertNodesBefore(
                    _CreateCommentsFromPrefix(comment_prefix,
                                              comment_lineno,
                                              0,
                                              standalone=True),
                    node_with_line_parent)
                break
              else:
                if comment_lineno == prev_leaf[0].lineno:
                  comment_lines = comment_prefix.splitlines()
                  value = comment_lines[0].lstrip()
                  comment_column = prev_leaf[0].column + 1
                  comment_column += (
                      len(comment_lines[0]) - len(comment_lines[0].lstrip()))
                  comment_leaf = pytree.Leaf(
                      type=token.COMMENT,
                      value=value.rstrip('\n'),
                      context=('', (comment_lineno, comment_column)))
                  pytree_utils.InsertNodesAfter([comment_leaf], prev_leaf[0])
                  comment_prefix = '\n'.join(comment_lines[1:])
                  comment_lineno += 1

                rindex = (0 if '\n' not in comment_prefix.rstrip() else
                          comment_prefix.rstrip().rindex('\n') + 1)
                comment_column = (
                    len(comment_prefix[rindex:]) -
                    len(comment_prefix[rindex:].lstrip()))
                comments = _CreateCommentsFromPrefix(comment_prefix,
                                                     comment_lineno,
                                                     comment_column,
                                                     standalone=False)
                pytree_utils.InsertNodesBefore(comments, child)
                break

        prev_leaf[0] = child

  _VisitNodeRec(tree)


def _CreateCommentsFromPrefix(comment_prefix,
                              comment_lineno,
                              comment_column,
                              standalone=False):
  """Create pytree nodes to represent the given comment prefix.

  Args:
    comment_prefix: (unicode) the text of the comment from the node's prefix.
    comment_lineno: (int) the line number for the start of the comment.
    comment_column: (int) the column for the start of the comment.
    standalone: (bool) determines if the comment is standalone or not.

  Returns:
    The simple_stmt nodes if this is a standalone comment, otherwise a list of
    new COMMENT leafs. The prefix may consist of multiple comment blocks,
    separated by blank lines. Each block gets its own leaf.
  """
  # The comment is stored in the prefix attribute, with no lineno of its
  # own. So we only know at which line it ends. To find out at which line it
  # starts, look at how many newlines the comment itself contains.
  comments = []

  lines = comment_prefix.split('\n')
  index = 0
  while index < len(lines):
    comment_block = []
    while index < len(lines) and lines[index].lstrip().startswith('#'):
      comment_block.append(lines[index])
      index += 1

    if comment_block:
      new_lineno = comment_lineno + index - 1
      comment_block[0] = comment_block[0].lstrip()
      comment_block[-1] = comment_block[-1].rstrip('\n')
      comment_leaf = pytree.Leaf(type=token.COMMENT,
                                 value='\n'.join(comment_block),
                                 context=('', (new_lineno, comment_column)))
      comment_node = comment_leaf if not standalone else pytree.Node(
          pygram.python_symbols.simple_stmt, [comment_leaf])
      comments.append(comment_node)

    while index < len(lines) and not lines[index].lstrip():
      index += 1

  return comments

# "Standalone line nodes" are tree nodes that have to start a new line in Python
# code (and cannot follow a ';' or ':'). Other nodes, like 'expr_stmt', serve as
# parents of other nodes but can come later in a line. This is a list of
# standalone line nodes in the grammar. It is meant to be exhaustive
# *eventually*, and we'll modify it with time as we discover more corner cases
# in the parse tree.
#
# When splicing a standalone comment (i.e. a comment that appears on its own
# line, not on the same line with other code), it's important to insert it into
# an appropriate parent of the node it's attached to. An appropriate parent
# is the first "standaline line node" in the parent chain of a node.
_STANDALONE_LINE_NODES = frozenset(
    ['suite', 'if_stmt', 'while_stmt', 'for_stmt', 'try_stmt', 'with_stmt',
     'funcdef', 'classdef', 'decorated', 'file_input'])


def _FindNodeWithStandaloneLineParent(node):
  """Find a node whose parent is a 'standalone line' node.

  See the comment above _STANDALONE_LINE_NODES for more details.

  Arguments:
    node: node to start from

  Returns:
    Suitable node that's either the node itself or one of its ancestors.
  """
  if pytree_utils.NodeName(node.parent) in _STANDALONE_LINE_NODES:
    return node
  else:
    # This is guaranteed to terminate because 'file_input' is the root node of
    # any pytree.
    return _FindNodeWithStandaloneLineParent(node.parent)

# "Statement nodes" are standalone statements. The don't have to start a new
# line.
_STATEMENT_NODES = frozenset(['simple_stmt']) | _STANDALONE_LINE_NODES


def _FindStmtParent(node):
  """Find the nearest parent of node that is a statement node.

  Arguments:
    node: node to start from

  Returns:
    Nearest parent (or node itself, if suitable).
  """
  if pytree_utils.NodeName(node) in _STATEMENT_NODES:
    return node
  else:
    return _FindStmtParent(node.parent)


def _FindAncestorAtIndent(node, indent):
  """Find an ancestor of node with the given indentation.

  Arguments:
    node: node to start from. This must not be the tree root.
    indent: indentation string for the ancestor we're looking for.
        See _AnnotateIndents for more details.

  Returns:
    An ancestor node with suitable indentation. If no suitable ancestor is
    found, the closest ancestor to the tree root is returned.
  """
  if node.parent.parent is None:
    # Our parent is the tree root, so there's nowhere else to go.
    return node
  else:
    # If the parent has an indent annotation, and it's shorter than node's
    # indent, this is a suitable ancestor.
    # The reason for "shorter" rather than "equal" is that comments may be
    # improperly indented (i.e. by three spaces, where surrounding statements
    # have either zero or two or four), and we don't want to propagate them all
    # the way to the root.
    parent_indent = pytree_utils.GetNodeAnnotation(
        node.parent, pytree_utils.Annotation.CHILD_INDENT)
    if parent_indent is not None and indent.startswith(parent_indent):
      return node
    else:
      # Keep looking up the tree.
      return _FindAncestorAtIndent(node.parent, indent)


def _AnnotateIndents(tree):
  """Annotate the tree with child_indent annotations.

  A child_indent annotation on a node specifies the indentation (as a string,
  like "  ") of its children. It is inferred from the INDENT child of a node.

  Arguments:
    tree: root of a pytree. The pytree is modified to add annotations to nodes.

  Raises:
    RuntimeError: if the tree is malformed.
  """
  # Annotate the root of the tree with zero indent.
  if tree.parent is None:
    pytree_utils.SetNodeAnnotation(tree, pytree_utils.Annotation.CHILD_INDENT,
                                   '')
  for child in tree.children:
    if child.type == token.INDENT:
      child_indent = pytree_utils.GetNodeAnnotation(
          tree, pytree_utils.Annotation.CHILD_INDENT)
      if child_indent is not None and child_indent != child.value:
        raise RuntimeError('inconsistent indentation for child', (tree, child))
      pytree_utils.SetNodeAnnotation(tree, pytree_utils.Annotation.CHILD_INDENT,
                                     child.value)
    _AnnotateIndents(child)
