; Order matters! Place lower precedence first.

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.css

[
  "*="
] @keyword.operator.css

(comment) @comment.block.css

; Selectors

(selectors) @meta.selector.css

(class_selector) @entity.other.attribute-name.class.css

(tag_name) @entity.name.tag.css

(pseudo_class_selector) @entity.other.attribute-name.pseudo-class.css

(attribute_name) @entity.other.attribute-name.css

; @ Rules

[
  ("@import")
  ("@charset")
  ("@namespace")
  ("@media")
  ("@supports")
  ("@keyframes")
] @keyword.control.at-rule.css

(keyword_query) @support.constant.media.css

(keyframes_name) @variable.parameter.keyframe-list.css

; Functions

(function_name) @support.function.css

; Properties

(property_name) @support.type.property-name.css

; Other values

(plain_value) @support.constant.property-value.css

; Strings

((string_value) @string.quoted.single.css
  (#match? @string.quoted.single.css "^'.*'$"))

((string_value) @string.quoted.double.css
  (#match? @string.quoted.double.css "^\".*\"$"))

; Numbers

([
  (integer_value)
  (float_value)
]) @constant.numeric.css

(unit) @keyword.other.unit.css

; Special values

(declaration
  ((property_name) @support.type.property-name.css
    (#eq? @support.type.property-name.css "font"))
  (plain_value) @support.constant.font-name.css)

((color_value) @constant.other.color.rgb-value.hex.css
  (#match? @constant.other.color.rgb-value.hex.css "^#.*"))

; Special Functions

(call_expression
  ((function_name) @support.function.url.css
    (#eq? @support.function.url.css "url"))
  (arguments
    (plain_value) @variable.parameter.url.css))
