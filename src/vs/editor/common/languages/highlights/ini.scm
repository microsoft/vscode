; Order matters! Place lower precedence first.

(section_name (text) @entity.name.section.group-title)

(setting_name) @keyword.other.definition

(setting ("=") @punctuation.separator.key-value)

(comment) @comment.line.semicolon

((setting_value) @string.quoted.double
  (#match? @string.quoted.double "^\".*\""))
