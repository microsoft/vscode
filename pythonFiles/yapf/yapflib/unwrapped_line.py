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
"""UnwrappedLine primitive for formatting.

An unwrapped line is the containing data structure produced by the parser. It
collects all nodes (stored in FormatToken objects) that could appear on a
single line if there were no line length restrictions. It's then used by the
parser to perform the wrapping required to comply with the style guide.
"""

from lib2to3 import pytree

from yapf.yapflib import format_token
from yapf.yapflib import pytree_utils
from yapf.yapflib import split_penalty
from yapf.yapflib import style


class UnwrappedLine(object):
  """Represents a single unwrapped line in the output.

  Attributes:
    depth: indentation depth of this line. This is just a numeric value used to
      distinguish lines that are more deeply nested than others. It is not the
      actual amount of spaces, which is style-dependent.
  """

  def __init__(self, depth, tokens=None):
    """Constructor.

    Creates a new unwrapped line with the given depth an initial list of tokens.
    Constructs the doubly-linked lists for format tokens using their built-in
    next_token and previous_token attributes.

    Arguments:
      depth: indentation depth of this line
      tokens: initial list of tokens
    """
    self.depth = depth
    self._tokens = tokens or []
    self.disable = False

    if self._tokens:
      # Set up a doubly linked list.
      for index, tok in enumerate(self._tokens[1:]):
        # Note, 'index' is the index to the previous token.
        tok.previous_token = self._tokens[index]
        self._tokens[index].next_token = tok

  def CalculateFormattingInformation(self):
    """Calculate the split penalty and total length for the tokens."""
    # Say that the first token in the line should have a space before it. This
    # means only that if this unwrapped line is joined with a predecessor line,
    # then there will be a space between them.
    self.first.spaces_required_before = 1
    self.first.total_length = len(self.first.value)

    prev_token = self.first
    prev_length = self.first.total_length
    for token in self._tokens[1:]:
      if (token.spaces_required_before == 0 and
          _SpaceRequiredBetween(prev_token, token)):
        token.spaces_required_before = 1

      token.total_length = (
          prev_length + len(token.value) + token.spaces_required_before)

      # The split penalty has to be computed before {must|can}_break_before,
      # because these may use it for their decision.
      token.split_penalty += _SplitPenalty(prev_token, token)
      token.must_break_before = _MustBreakBefore(prev_token, token)
      token.can_break_before = (token.must_break_before or
                                _CanBreakBefore(prev_token, token))

      prev_length = token.total_length
      prev_token = token

  ############################################################################
  # Token Access and Manipulation Methods                                    #
  ############################################################################

  def AppendToken(self, token):
    """Append a new FormatToken to the tokens contained in this line."""
    if self._tokens:
      token.previous_token = self.last
      self.last.next_token = token
    self._tokens.append(token)

  def AppendNode(self, node):
    """Convenience method to append a pytree node directly.

    Wraps the node with a FormatToken.

    Arguments:
      node: the node to append
    """
    assert isinstance(node, pytree.Leaf)
    self.AppendToken(format_token.FormatToken(node))

  @property
  def first(self):
    """Returns the first non-whitespace token."""
    return self._tokens[0]

  @property
  def last(self):
    """Returns the last non-whitespace token."""
    return self._tokens[-1]

  ############################################################################
  # Token -> String Methods                                                  #
  ############################################################################

  def AsCode(self, indent_per_depth=2):
    """Return a "code" representation of this line.

    The code representation shows how the line would be printed out as code.

    TODO(eliben): for now this is rudimentary for debugging - once we add
    formatting capabilities, this method will have other uses (not all tokens
    have spaces around them, for example).

    Arguments:
      indent_per_depth: how much spaces to indend per depth level.

    Returns:
      A string representing the line as code.
    """
    indent = ' ' * indent_per_depth * self.depth
    tokens_str = ' '.join(tok.value for tok in self._tokens)
    return indent + tokens_str

  def __str__(self):
    return self.AsCode()

  def __repr__(self):
    tokens_repr = ','.join(['{0}({1!r})'.format(tok.name, tok.value)
                            for tok in self._tokens])
    return 'UnwrappedLine(depth={0}, tokens=[{1}])'.format(self.depth,
                                                           tokens_repr)

  ############################################################################
  # Properties                                                               #
  ############################################################################

  @property
  def tokens(self):
    """Access the tokens contained within this line.

    The caller must not modify the tokens list returned by this method.

    Returns:
      List of tokens in this line.
    """
    return self._tokens

  @property
  def lineno(self):
    """Return the line number of this unwrapped line.

    Returns:
      The line number of the first token in this unwrapped line.
    """
    return self.first.lineno

  @property
  def is_comment(self):
    return self.first.is_comment


def _IsIdNumberStringToken(tok):
  return tok.is_keyword or tok.is_name or tok.is_number or tok.is_string


def _IsUnaryOperator(tok):
  return format_token.Subtype.UNARY_OPERATOR in tok.subtypes


def _SpaceRequiredBetween(left, right):
  """Return True if a space is required between the left and right token."""
  if (left.is_pseudo_paren and _IsIdNumberStringToken(right) and
      left.previous_token and _IsIdNumberStringToken(left.previous_token)):
    # Space between keyword... tokens and pseudo parens.
    return True
  if left.is_pseudo_paren or right.is_pseudo_paren:
    # The pseudo-parens shouldn't affect spacing.
    return False
  if left.is_continuation or right.is_continuation:
    # The continuation node's value has all of the spaces it needs.
    return False
  if right.name in pytree_utils.NONSEMANTIC_TOKENS:
    # No space before a non-semantic token.
    return False
  if _IsIdNumberStringToken(left) and _IsIdNumberStringToken(right):
    # Spaces between keyword, string, number, and identifier tokens.
    return True
  if left.value == ',' and right.value == ':':
    # We do want a space between a comma and colon.
    return True
  if right.value in ':,':
    # Otherwise, we never want a space before a colon or comma.
    return False
  if left.value == ',' and right.value in ']})':
    # Add a space between ending ',' and closing bracket if requested.
    return style.Get('SPACE_BETWEEN_ENDING_COMMA_AND_CLOSING_BRACKET')
  if left.value == ',':
    # We want a space after a comma.
    return True
  if left.value == 'from' and right.value == '.':
    # Space before the '.' in an import statement.
    return True
  if left.value == '.' and right.value == 'import':
    # Space after the '.' in an import statement.
    return True
  if ((right.is_keyword or right.is_name) and
      (left.is_keyword or left.is_name)):
    # Don't merge two keywords/identifiers.
    return True
  if left.is_string and right.value not in '[)]}.':
    # A string followed by something other than a subscript, closing bracket,
    # or dot should have a space after it.
    return True
  if left.is_binary_op and _IsUnaryOperator(right):
    # Space between the binary opertor and the unary operator.
    return True
  if _IsUnaryOperator(left) and _IsUnaryOperator(right):
    # No space between two unary operators.
    return False
  if left.is_binary_op or right.is_binary_op:
    if left.value == '**' or right.value == '**':
      # Don't add a space around the "power" operator.
      return False
    # Enforce spaces around binary operators.
    return True
  if (_IsUnaryOperator(left) and left.value != 'not' and
      (right.is_name or right.is_number or right.value == '(')):
    # The previous token was a unary op. No space is desired between it and
    # the current token.
    return False
  if (format_token.Subtype.SUBSCRIPT_COLON in left.subtypes or
      format_token.Subtype.SUBSCRIPT_COLON in right.subtypes):
    # A subscript shouldn't have spaces separating its colons.
    return False
  if (format_token.Subtype.DEFAULT_OR_NAMED_ASSIGN in left.subtypes or
      format_token.Subtype.DEFAULT_OR_NAMED_ASSIGN in right.subtypes):
    # A named argument or default parameter shouldn't have spaces around it.
    return False
  if (format_token.Subtype.VARARGS_STAR in left.subtypes or
      format_token.Subtype.KWARGS_STAR_STAR in left.subtypes):
    # Don't add a space after a vararg's star or a keyword's star-star.
    return False
  if left.value == '@':
    # Decorators shouldn't be separated from the 'at' sign.
    return False
  if left.value == '.' or right.value == '.':
    # Don't place spaces between dots.
    return False
  if ((left.value == '(' and right.value == ')') or
      (left.value == '[' and right.value == ']') or
      (left.value == '{' and right.value == '}')):
    # Empty objects shouldn't be separted by spaces.
    return False
  if (left.value in pytree_utils.OPENING_BRACKETS and
      right.value in pytree_utils.OPENING_BRACKETS):
    # Nested objects' opening brackets shouldn't be separated.
    return False
  if (left.value in pytree_utils.CLOSING_BRACKETS and
      right.value in pytree_utils.CLOSING_BRACKETS):
    # Nested objects' closing brackets shouldn't be separated.
    return False
  if left.value in pytree_utils.CLOSING_BRACKETS and right.value in '([':
    # A call, set, dictionary, or subscript that has a call or subscript after
    # it shouldn't have a space between them.
    return False
  if (left.value in pytree_utils.OPENING_BRACKETS and
      _IsIdNumberStringToken(right)):
    # Don't separate the opening bracket from the first item.
    return False
  if left.is_name and right.value in '([':
    # Don't separate a call or array access from the name.
    return False
  if right.value in pytree_utils.CLOSING_BRACKETS:
    # Don't separate the closing bracket from the last item.
    # FIXME(morbo): This might be too permissive.
    return False
  if left.value == 'print' and right.value == '(':
    # Special support for the 'print' function.
    return False
  if left.value in pytree_utils.OPENING_BRACKETS and _IsUnaryOperator(right):
    # Don't separate a unary operator from the opening bracket.
    return False
  if (left.value in pytree_utils.OPENING_BRACKETS and
      (format_token.Subtype.VARARGS_STAR in right.subtypes or
       format_token.Subtype.KWARGS_STAR_STAR in right.subtypes)):
    # Don't separate a '*' or '**' from the opening bracket.
    return False
  if right.value == ';':
    # Avoid spaces before a semicolon. (Why is there a semicolon?!)
    return False
  return True


def _MustBreakBefore(prev_token, cur_token):
  """Return True if a line break is required before the current token."""
  if prev_token.is_comment:
    # Must break if the previous token was a comment.
    return True
  if (_IsSurroundedByBrackets(cur_token) and cur_token.is_string and
      prev_token.is_string):
    # We want consecutive strings to be on separate lines. This is a
    # reasonable assumption, because otherwise they should have written them
    # all on the same line, or with a '+'.
    return True
  if style.Get('DEDENT_CLOSING_BRACKETS') and cur_token.ClosesScope():
    opening = cur_token.matching_bracket
    trailer_length = cur_token.total_length - opening.total_length
    if (trailer_length > style.Get('COLUMN_LIMIT') or
        cur_token.lineno != opening.lineno):
      # Since we're already dedenting the closing bracket, let's put a newline
      # after the opening one so that we have more horizontal space for the
      # trailer.
      opening.next_token.must_break_before = True
      return True
  return pytree_utils.GetNodeAnnotation(cur_token.node,
                                        pytree_utils.Annotation.MUST_SPLIT,
                                        default=False)


def _CanBreakBefore(prev_token, cur_token):
  """Return True if a line break may occur before the current token."""
  if cur_token.split_penalty >= split_penalty.UNBREAKABLE:
    return False
  if prev_token.value == '@':
    # Don't break right after the beginning of a decorator.
    return False
  if cur_token.value == ':':
    # Don't break before the start of a block of code.
    return False
  if cur_token.value == ',':
    # Don't break before a comma.
    return False
  if prev_token.is_name and cur_token.value == '(':
    # Don't break in the middle of a function definition or call.
    return False
  if prev_token.is_name and cur_token.value == '[':
    # Don't break in the middle of an array dereference.
    return False
  if prev_token.is_name and cur_token.value == '.':
    # Don't break before the '.' in a dotted name.
    return False
  if cur_token.is_comment and prev_token.lineno == cur_token.lineno:
    # Don't break a comment at the end of the line.
    return False
  # TODO(morbo): There may be more to add here.
  return True


def _IsSurroundedByBrackets(tok):
  """Return True if the token is surrounded by brackets."""
  paren_count = 0
  brace_count = 0
  sq_bracket_count = 0
  previous_token = tok.previous_token
  while previous_token:
    if previous_token.value == ')':
      paren_count -= 1
    elif previous_token.value == '}':
      brace_count -= 1
    elif previous_token.value == ']':
      sq_bracket_count -= 1

    if previous_token.value == '(':
      if paren_count == 0:
        return True
      paren_count += 1
    elif previous_token.value == '{':
      if brace_count == 0:
        return True
      brace_count += 1
    elif previous_token.value == '[':
      if sq_bracket_count == 0:
        return True
      sq_bracket_count += 1

    previous_token = previous_token.previous_token
  return False


_LOGICAL_OPERATORS = frozenset({'and', 'or'})
_BITWISE_OPERATORS = frozenset({'&', '|', '^'})
_TERM_OPERATORS = frozenset({'*', '/', '%', '//'})


def _SplitPenalty(prev_token, cur_token):
  """Return the penalty for breaking the line before the current token."""
  if prev_token.value == 'not':
    return split_penalty.UNBREAKABLE

  if cur_token.node_split_penalty > 0:
    return cur_token.node_split_penalty

  if style.Get('SPLIT_BEFORE_LOGICAL_OPERATOR'):
    # Prefer to split before 'and' and 'or'.
    if prev_token.value in _LOGICAL_OPERATORS:
      return style.Get('SPLIT_PENALTY_LOGICAL_OPERATOR')
    if cur_token.value in _LOGICAL_OPERATORS:
      return 0
  else:
    # Prefer to split after 'and' and 'or'.
    if prev_token.value in _LOGICAL_OPERATORS:
      return 0
    if cur_token.value in _LOGICAL_OPERATORS:
      return style.Get('SPLIT_PENALTY_LOGICAL_OPERATOR')

  if style.Get('SPLIT_BEFORE_BITWISE_OPERATOR'):
    # Prefer to split before '&', '|', and '^'.
    if prev_token.value in _BITWISE_OPERATORS:
      return style.Get('SPLIT_PENALTY_BITWISE_OPERATOR')
    if cur_token.value in _BITWISE_OPERATORS:
      return 0
  else:
    # Prefer to split after '&', '|', and '^'.
    if prev_token.value in _BITWISE_OPERATORS:
      return 0
    if cur_token.value in _BITWISE_OPERATORS:
      return style.Get('SPLIT_PENALTY_BITWISE_OPERATOR')

  if (format_token.Subtype.COMP_FOR in cur_token.subtypes or
      format_token.Subtype.COMP_IF in cur_token.subtypes):
    # We don't mind breaking before the 'for' or 'if' of a list comprehension.
    return 0
  if format_token.Subtype.UNARY_OPERATOR in prev_token.subtypes:
    # Try not to break after a unary operator.
    return style.Get('SPLIT_PENALTY_AFTER_UNARY_OPERATOR')
  if prev_token.value == ',':
    # Breaking after a comma is fine, if need be.
    return 0
  if prev_token.is_binary_op:
    # We would rather not split after an equality operator.
    return 20
  if (format_token.Subtype.VARARGS_STAR in prev_token.subtypes or
      format_token.Subtype.KWARGS_STAR_STAR in prev_token.subtypes):
    # Don't split after a varargs * or kwargs **.
    return split_penalty.UNBREAKABLE
  if prev_token.value in pytree_utils.OPENING_BRACKETS:
    # Slightly prefer
    return style.Get('SPLIT_PENALTY_AFTER_OPENING_BRACKET')
  if cur_token.value == ':':
    # Don't split before a colon.
    return split_penalty.UNBREAKABLE
  if cur_token.value == '=':
    # Don't split before an assignment.
    return split_penalty.UNBREAKABLE
  if (format_token.Subtype.DEFAULT_OR_NAMED_ASSIGN in prev_token.subtypes or
      format_token.Subtype.DEFAULT_OR_NAMED_ASSIGN in cur_token.subtypes):
    # Don't break before or after an default or named assignment.
    return split_penalty.UNBREAKABLE
  if cur_token.value == '==':
    # We would rather not split before an equality operator.
    return split_penalty.STRONGLY_CONNECTED
  if cur_token.ClosesScope():
    # Give a slight penalty for splitting before the closing scope.
    return 100
  if prev_token.value in _TERM_OPERATORS or cur_token.value in _TERM_OPERATORS:
    return 50
  return 0
