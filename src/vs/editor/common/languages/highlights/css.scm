; Order matters! Place lower precedence first.

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.css

(comment) @comment.block.css

; Selectors

(selectors) @meta.selector.css

(class_selector) @entity.other.attribute-name.class.css

(tag_name) @entity.name.tag.css

(pseudo_class_selector) @entity.other.attribute-name.pseudo-class.css

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

; Functions

("@import") @keyword.control.at-rule.import.css

(keyword_query) @support.constant.media.css

(function_name) @support.function.css

(arguments
  (plain_value) @variable.parameter.css)

; Deprecated - TODO: Do we want to add these?
