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
"""Insert "continuation" nodes into lib2to3 tree.

The "backslash-newline" continuation marker is shoved into the node's prefix.
Pull them out and make it into nodes of their own.

  SpliceContinuations(): the main funciton exported by this module.
"""

from lib2to3 import pytree

from yapf.yapflib import format_token


def SpliceContinuations(tree):
  """Given a pytree, splice the continuation marker into nodes.

  Arguments:
    tree: (pytree.Node) The tree to work on. The tree is modified by this
      function.
  """

  def RecSplicer(node):
    if isinstance(node, pytree.Leaf):
      if node.prefix.lstrip().startswith('\\\n'):
        new_lineno = node.lineno - node.prefix.count('\n')
        return pytree.Leaf(type=format_token.CONTINUATION,
                           value=node.prefix,
                           context=('', (new_lineno, 0)))
      return None
    num_inserted = 0
    for index, child in enumerate(node.children[:]):
      continuation_node = RecSplicer(child)
      if continuation_node:
        node.children.insert(index + num_inserted, continuation_node)
        num_inserted += 1

  RecSplicer(tree)
