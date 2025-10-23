; Order matters! Place lower precedence first.
[
  "?"
  "="
  "!"
] @keyword.operator.regexp

[
  "("
  ")"
] @punctuation.definition.group.regexp

[
  ">"
  "{"
  "}"
] @punctuation.regexp

[
  "["
  "]"
] @punctuation.definition.character-class.regexp

(
  ([
    "(?<"
  ] @punctuation.definition.group.assertion.regexp)
  .
  [
    "="
    "!"
  ] @punctuation.definition.group.assertion.regexp
) @meta.assertion.look-behind.regexp

(
  ([
    "(?"
  ] @punctuation.definition.group.assertion.regexp)
  .
  [
    "="
    "!"
  ] @punctuation.definition.group.assertion.regexp
) @meta.assertion.look-ahead.regexp

"(?:" @punctuation.definition.group.regexp @punctuation.definition.group.no-capture.regexp

(lookaround_assertion ("!") @punctuation.definition.group.assertion.regexp)

(named_capturing_group) @punctuation.definition.group.regexp

(group_name) @variable.other.regexp

[
  (control_letter_escape)
  (non_boundary_assertion)
] @string.escape.regexp

[
  (start_assertion)
  (end_assertion)
  (boundary_assertion)
] @keyword.control.anchor.regexp

(class_character) @constant.character-class.regexp

(identity_escape) @constant.character.escape.regexp

[
  ((identity_escape) @internal.regexp (#match? @internal.regexp "\\[^ux]"))
] @constant.character.escape.regexp

(
  ((identity_escape) @internal.regexp (#eq? @internal.regexp "\\u"))
  .
  (pattern_character) @constant.character.numeric.regexp
  .
  (pattern_character) @constant.character.numeric.regexp
  .
  (pattern_character) @constant.character.numeric.regexp
  .
  (pattern_character) @constant.character.numeric.regexp
) @constant.character.numeric.regexp

(
  ((identity_escape) @internal.regexp (#eq? @internal.regexp "\\x"))
  .
  (pattern_character) @constant.character.numeric.regexp
  .
  (pattern_character) @constant.character.numeric.regexp
) @constant.character.numeric.regexp

(
  ((identity_escape) @internal.regexp (#eq? @internal.regexp "\\x"))
  .
  (class_character) @constant.character.numeric.regexp
  .
  (class_character) @constant.character.numeric.regexp
) @constant.character.numeric.regexp

(control_escape) @constant.other.character-class.regexp

(character_class_escape) @constant.character.escape.regexp

(decimal_escape) @keyword.other.back-reference.regexp

("|") @keyword.operator.or.regexp

[
  "*"
  "+"
] @keyword.operator.quantifier.regexp

(count_quantifier) @keyword.operator.quantifier.regexp

[
  (lazy)
] @keyword.operator.quantifier.regexp

(optional ("?") @keyword.operator.quantifier.regexp)

(character_class
  [
    "^" @keyword.operator.negation.regexp
    (class_range "-" @constant.other.character-class.range.regexp)
  ])
