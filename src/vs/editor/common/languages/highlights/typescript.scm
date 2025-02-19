; Order matters! Place lower precedence first.
; Adapted from https://github.com/zed-industries/zed/blob/main/crates/languages/src/typescript/highlights.scm

; Variables

(identifier) @variable

; Literals

(this) @variable.language.this
(super) @variable.language.super

(comment) @comment

; TODO: This doesn't seem to be working
(escape_sequence) @constant.character.escape

[
  (string)
  (template_string)
  (template_literal_type)
] @string

; NOTE: the typescript grammar doesn't break regex into nice parts so as to capture parts of it separately
(regex) @string.regexp
(number) @constant.numeric

; Properties

(member_expression
  object: (this)
  property: (property_identifier) @variable)

(member_expression
  property: (property_identifier) @variable.other.constant
  (#match? @variable.other.constant "^[A-Z][A-Z_]+$"))

[
  (property_identifier)
  (shorthand_property_identifier)
  (shorthand_property_identifier_pattern)] @variable

; Function and method definitions

(function_expression
  name: (identifier) @entity.name.function)
(function_declaration
  name: (identifier) @entity.name.function)
(method_definition
  name: (property_identifier) @meta.definition.method @entity.name.function
  (#not-eq? @entity.name.function "constructor"))
(method_definition
  name: (property_identifier) @meta.definition.method @storage.type
  (#eq? @storage.type "constructor"))
(method_signature
  name: (property_identifier) @meta.definition.method @entity.name.function)

(pair
  key: (property_identifier) @entity.name.function
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (member_expression
    property: (property_identifier) @entity.name.function)
  right: [(function_expression) (arrow_function)])

(variable_declarator
  name: (identifier) @entity.name.function
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (identifier) @entity.name.function
  right: [(function_expression) (arrow_function)])

; Function and method calls

(call_expression
  function: (identifier) @entity.name.function)

(call_expression
  function: (member_expression
  	object: (identifier) @support.class.promise)
    (#eq? @support.class.promise "Promise"))

(call_expression
  function: (member_expression
    property: (property_identifier) @entity.name.function))

(new_expression
  constructor: (identifier) @entity.name.function)


; Special identifiers

(predefined_type) @support.type
(predefined_type (["string" "boolean" "number" "any"])) @support.type.primitive
(type_identifier) @entity.name.type

([
  (identifier)
  (shorthand_property_identifier)
  (shorthand_property_identifier_pattern)] @variable.other.constant
  (#match? @variable.other.constant "^[A-Z][A-Z_]+$"))

(extends_clause
  value: (identifier) @entity.other.inherited-class)

; Tokens

[
  ";"
  "?."
  "."
  ","
  ":"
  "?"
] @punctuation.delimiter

[
  "!"
  "~"
  "==="
  "!=="
  "&&"
  "||"
  "??"
] @keyword.operator.logical

(binary_expression ([
  "-"
  "+"
  "*"
  "/"
  "%"
  "^"
]) @keyword.operator.arithmetic)

(binary_expression ([
  "<"
  "<="
  ">"
  ">="
]) @keyword.operator.relational)

[
  "="
] @keyword.operator.assignment

(augmented_assignment_expression ([
  "-="
  "+="
  "*="
  "/="
  "%="
  "^="
  "&="
  "|="
  "&&="
  "||="
  "??="
]) @keyword.operator.assignment.compound)

[
  "++"
] @keyword.operator.increment

[
  "--"
] @keyword.operator.decrement

[
  "**"
  "**="
  "<<"
  "<<="
  "=="
  "!="
  ">>"
  ">>="
  ">>>"
  ">>>="
  "~"
  "&"
  "|"
] @keyword.operator

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation

(template_substitution
  "${" @punctuation.definition.template-expression.begin
  "}" @punctuation.definition.template-expression.end)

(template_type
  "${" @punctuation.definition.template-expression.begin
  "}" @punctuation.definition.template-expression.end)

(type_arguments
  "<" @punctuation.bracket
  ">" @punctuation.bracket)

; Keywords

("typeof") @keyword.operator.expression.typeof

(binary_expression "instanceof" @keyword.operator.expression.instanceof)

("of") @keyword.operator.expression.of

("is") @keyword.operator.expression.is

[
  "delete"
  "in"
  "infer"
  "keyof"
] @keyword.operator.expression

[
  "as"
  "await"
  "break"
  "case"
  "catch"
  "continue"
  "default"
  "do"
  "else"
  "export"
  "finally"
  "for"
  "from"
  "if"
  "import"
  "require"
  "return"
  "satisfies"
  "switch"
  "throw"
  "try"
  "type"
  "while"
  "yield"
] @keyword.control

[
  "abstract"
  "async"
  "declare"
  "extends"
  "implements"
  "override"
  "private"
  "protected"
  "public"
  "readonly"
  "static"
] @storage.modifier

[
  "=>"
  "class"
  "const"
  "enum"
  "function"
  "get"
  "interface"
  "let"
  "namespace"
  "set"
  "var"
] @storage.type

[
  "debugger"
  "target"
  "with"
] @keyword

(regex_flags) @keyword

[
  "void"
] @support.type.primitive

[
  "new"
] @keyword.operator.new

(public_field_definition
  ("?") @keyword.operator.optional)

(optional_parameter)
  ([
    "?"
    ":"
  ]) @keyword.operator.optional

(ternary_expression
  ([
    "?"
    ":"
  ]) @keyword.operator.ternary)

(optional_chain
  ("?.") @punctuation.accessor.optional)

(rest_pattern) @keyword.operator.rest

(spread_element
  ("...") @keyword.operator.spread)

; Language constants

[
  (null)
  (undefined)
] @constant.language

[
  (true)
] @constant.language.boolean.true

[
  (false)
] @constant.language.boolean.false

(namespace_import
  "*" @constant.language)
