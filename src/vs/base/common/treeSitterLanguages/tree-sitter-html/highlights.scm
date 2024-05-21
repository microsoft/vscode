(tag_name) @entity.name.tag
(attribute_name) @entity.other.attribute-name
(attribute_value) @string
"\"" @string
(comment) @comment

"=" @punctuation.separator.key-value

[
  "<"
  ">"
  "<!"
  "</"
  "/>"
] @meta.tag
