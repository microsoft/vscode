; Order matters! Place lower precedence first.
; Adapted from https://github.com/zed-industries/zed/blob/main/crates/languages/src/typescript/highlights.scm

; Variables

(identifier) @variable.ts

(_
  object: (identifier) @variable.other.object.ts)

; Literals

(this) @variable.language.this.ts
(super) @variable.language.super.ts

(comment) @comment.ts

; TODO: This doesn't seem to be working
(escape_sequence) @constant.character.escape.ts

((string) @string.quoted.single.ts
  (#match? @string.quoted.single.ts "^'[^']*'$"))

((string) @string.quoted.double.ts
  (#match? @string.quoted.double.ts "^\"[^\"]*\"$"))

([
  (template_string)
  (template_literal_type)
] @string.template.ts)

(string .
  ([
    "\""
    "'"
  ]) @punctuation.definition.string.begin.ts)

(string
  ([
    "\""
    "'"
  ]) @punctuation.definition.string.end.ts .)

(template_string . ("`") @punctuation.definition.string.template.begin.ts)

(template_string ("`") @punctuation.definition.string.template.end.ts .)

; NOTE: the typescript grammar doesn't break regex into nice parts so as to capture parts of it separately
(regex) @string.regexp.ts
(number) @constant.numeric.ts

; Properties

(member_expression
  object: (this)
  property: (property_identifier) @variable.ts)

(member_expression
  property: (property_identifier) @variable.other.constant.ts
  (#match? @variable.other.constant.ts "^[A-Z][A-Z_]+$"))

[
  (property_identifier)
  (shorthand_property_identifier)
  (shorthand_property_identifier_pattern)] @variable.ts

; Function and method definitions

(function_expression
  name: (identifier) @entity.name.function.ts)
(function_declaration
  name: (identifier) @entity.name.function.ts)
(method_definition
  name: (property_identifier) @meta.definition.method.ts @entity.name.function.ts
  (#not-eq? @entity.name.function.ts "constructor"))
(method_definition
  name: (property_identifier) @meta.definition.method.ts @storage.type.ts
  (#eq? @storage.type.ts "constructor"))
(method_signature
  name: (property_identifier) @meta.definition.method.ts @entity.name.function.ts)

(pair
  key: (property_identifier) @entity.name.function.ts
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (member_expression
    property: (property_identifier) @entity.name.function.ts)
  right: [(function_expression) (arrow_function)])

(variable_declarator
  name: (identifier) @entity.name.function.ts
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (identifier) @entity.name.function.ts
  right: [(function_expression) (arrow_function)])

(required_parameter
  (identifier) @variable.parameter.ts)

(required_parameter
  (rest_pattern
    (identifier) @variable.parameter.ts))

(optional_parameter
  (identifier) @variable.parameter.ts)

(catch_clause
  parameter: (identifier) @variable.parameter.ts)

; Function and method calls

(call_expression
  function: (identifier) @entity.name.function.ts)

(call_expression
  function: (member_expression
  	object: (identifier) @support.class.promise.ts)
    (#eq? @support.class.promise.ts "Promise"))

(call_expression
  function: (member_expression
    property: (property_identifier) @entity.name.function.ts))

(new_expression) @new.expr.ts

(new_expression
  constructor: (identifier) @entity.name.function.ts)


; Special identifiers

(predefined_type) @support.type.ts
(predefined_type (["string" "boolean" "number" "any" "unknown"])) @support.type.primitive.ts
(type_identifier) @entity.name.type.ts
(internal_module
  name: (identifier) @entity.name.type.ts)

(
  [
    (_ name: (identifier))
    (shorthand_property_identifier)
    (shorthand_property_identifier_pattern)
  ] @variable.other.constant.ts
  (#match? @variable.other.constant.ts "^[A-Z][A-Z_]+$"))

(extends_clause
  value: (identifier) @entity.other.inherited-class.ts)

(implements_clause
  (type_identifier) @entity.other.inherited-class.ts)

; Tokens

[
  ";"
  "?."
  "."
  ","
  ":"
  "?"
] @punctuation.delimiter.ts

[
  "!"
  "~"
  "==="
  "!=="
  "&&"
  "||"
  "??"
] @keyword.operator.logical.ts

(binary_expression ([
  "-"
  "+"
  "*"
  "/"
  "%"
  "^"
]) @keyword.operator.arithmetic.ts)

(binary_expression ([
  "<"
  "<="
  ">"
  ">="
]) @keyword.operator.relational.ts)

[
  "="
] @keyword.operator.assignment.ts

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
]) @keyword.operator.assignment.compound.ts)

[
  "++"
] @keyword.operator.increment.ts

[
  "--"
] @keyword.operator.decrement.ts

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
] @keyword.operator.ts

(union_type
  ("|") @keyword.operator.type.ts)

(intersection_type
  ("&") @keyword.operator.type.ts)

(type_annotation
  (":") @keyword.operator.type.annotation.ts)

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.ts

(template_substitution
  "${" @punctuation.definition.template-expression.begin.ts
  "}" @punctuation.definition.template-expression.end.ts)

(template_type
  "${" @punctuation.definition.template-expression.begin.ts
  "}" @punctuation.definition.template-expression.end.ts)

(type_arguments
  "<" @punctuation.definition.typeparameters.ts
  ">" @punctuation.definition.typeparameters.ts)

; Keywords

("typeof") @keyword.operator.expression.typeof.ts

(binary_expression "instanceof" @keyword.operator.expression.instanceof.ts)

("of") @keyword.operator.expression.of.ts

("is") @keyword.operator.expression.is.ts

[
  "delete"
  "in"
  "infer"
  "keyof"
] @keyword.operator.expression.ts

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
] @keyword.control.ts

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
] @storage.modifier.ts

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
] @storage.type.ts

[
  "module"
] @storage.type.namespace.ts

[
  "debugger"
  "target"
  "with"
] @keyword.ts

(regex_flags) @keyword.ts

[
  "void"
] @support.type.primitive.ts

[
  "new"
] @keyword.operator.new.ts

(public_field_definition
  ("?") @keyword.operator.optional.ts)

(property_signature
  ("?") @keyword.operator.optional.ts)

(optional_parameter
  ([
    "?"
    ":"
  ]) @keyword.operator.optional.ts)

(ternary_expression
  ([
    "?"
    ":"
  ]) @keyword.operator.ternary.ts)

(optional_chain
  ("?.") @punctuation.accessor.optional.ts)

(rest_pattern
  ("...") @keyword.operator.rest.ts)

(spread_element
  ("...") @keyword.operator.spread.ts)

; Language constants

[
  (null)
] @constant.language.null.ts

[
  (undefined)
] @constant.language.undefined.ts

((identifier) @constant.language.nan.ts
  (#eq? @constant.language.nan.ts "NaN"))

((identifier) @constant.language.infinity.ts
  (#eq? @constant.language.infinity.ts "Infinity"))

[
  (true)
] @constant.language.boolean.true.ts

[
  (false)
] @constant.language.boolean.false.ts

(literal_type
  [
    (null)
    (undefined)
    (true)
    (false)
  ] @support.type.builtin.ts)

(namespace_import
  "*" @constant.language.ts)
