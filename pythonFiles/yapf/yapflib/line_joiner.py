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
"""Join unwrapped lines together.

Determine how many lines can be joined into one line. For instance, we could
join these statements into one line:

  if a == 42:
    continue

like this:

  if a == 42: continue

There are a few restrictions:

  1. The lines should have been joined in the original source.
  2. The joined lines must not go over the column boundary if placed on the same
     line.
  3. They need to be very simple statements.

Note: Because we don't allow the use of a semicolon to separate statements, it
follows that there can only be at most two lines to join.
"""

from yapf.yapflib import style

_CLASS_OR_FUNC = frozenset({'def', 'class'})


def CanMergeMultipleLines(lines, last_was_merged=False):
  """Determine if multiple lines can be joined into one.

  Arguments:
    lines: (list of UnwrappedLine) This is a splice of UnwrappedLines from the
      full code base.
    last_was_merged: (bool) The last line was merged.

  Returns:
    True if two consecutive lines can be joined together. In reality, this will
    only happen if two consecutive lines can be joined, due to the style guide.
  """
  # The indentation amount for the starting line (number of spaces).
  indent_amt = lines[0].depth * style.Get('INDENT_WIDTH')
  if len(lines) == 1 or indent_amt > style.Get('COLUMN_LIMIT'):
    return False

  if (len(lines) >= 3 and lines[2].depth >= lines[1].depth and
      lines[0].depth != lines[2].depth):
    # If lines[2]'s depth is greater than or equal to line[1]'s depth, we're not
    # looking at a single statement (e.g., if-then, while, etc.). A following
    # line with the same depth as the first line isn't part of the lines we
    # would want to combine.
    return False  # Don't merge more than two lines together.

  if lines[0].first.value in _CLASS_OR_FUNC:
    # Don't join lines onto the starting line of a class or function.
    return False

  limit = style.Get('COLUMN_LIMIT') - indent_amt
  if lines[0].last.total_length < limit:
    limit -= lines[0].last.total_length

    if lines[0].first.value == 'if':
      return _CanMergeLineIntoIfStatement(lines, limit)
    if last_was_merged and lines[0].first.value in {'elif', 'else'}:
      return _CanMergeLineIntoIfStatement(lines, limit)

  # TODO(morbo): Other control statements?

  return False


def _CanMergeLineIntoIfStatement(lines, limit):
  """Determine if we can merge a short if-then statement into one line.

  Two lines of an if-then statement can be merged if they were that way in the
  original source, fit on the line without going over the column limit, and are
  considered "simple" statements --- typically statements like 'pass',
  'continue', and 'break'.

  Arguments:
    lines: (list of UnwrappedLine) The lines we are wanting to merge.
    limit: (int) The amount of space remaining on the line.

  Returns:
    True if the lines can be merged, False otherwise.
  """
  if len(lines[1].tokens) == 1 and lines[1].last.is_multiline_string:
    # This might be part of a multiline shebang.
    return True
  if lines[0].lineno != lines[1].lineno:
    # Don't merge lines if the original lines weren't merged.
    return False
  if lines[1].last.total_length >= limit:
    # Don't merge lines if the result goes over the column limit.
    return False
  return style.Get('JOIN_MULTIPLE_LINES')
