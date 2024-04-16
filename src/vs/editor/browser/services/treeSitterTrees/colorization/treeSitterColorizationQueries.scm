(comment) @comment.block.ts

(string) @string.quoted.double.ts

(number) @constant.numeric.decimal.ts

(method_signature name: (property_identifier) @entity.name.function.ts)
(function_declaration name: (identifier) @entity.name.function.ts)
(method_definition name: (property_identifier) @entity.name.function.ts)
(call_expression function: (member_expression property: (property_identifier) @entity.name.function.ts))
(call_expression function: (identifier) @entity.name.function.ts)
(new_expression constructor: (identifier) @entity.name.function.ts)
(pair key: (property_identifier) @entity.name.function.ts)

[
    "class"
] @storage.type.class.ts

[
    "const"
    "let"
] @storage.type.ts

[
    "extends"
    "static"
    "readonly"
    "implements"
    "extends"
    "declare"
    "private"
    "public"
    "readonly"
    "protected"
] @storage.modifier.ts

[
    "new"
] @keyword.operator.new.ts

[
    "interface"
] @storage.type.interface.ts

[
    "type"
] @storage.type.type.ts

[
    "namespace"
] @storage.type.namespace.ts

[
    "keyof"
] @keyword.operator.expression.keyof.ts

[
    "enum"
] @storage.type.enum.ts

[
	"import"
] @keyword.control.import.ts

[
	"from"
] @keyword.control.from.ts

[
	"export"
] @keyword.control.export.ts

[
	"while"
    "for"
] @keyword.control.loop.ts

[
	"if"
    "else"
] @keyword.control.conditional.ts

[
	"return"
] @keyword.control.flow.ts


(member_expression object: (this) @variable.language.this.ts)

(call_expression function: (super) @variable.language.super.ts)

(undefined) @constant.language.undefined.ts

(public_field_definition name: (property_identifier) @variable.object.property.ts)
(property_signature name: (property_identifier) @variable.object.property.ts)

(assignment_expression left : (member_expression property: (property_identifier) @variable.other.property.ts))

(member_expression property: (property_identifier) @variable.other.object.property.ts)

(binary_expression left: (identifier) @variable.other.object.ts)
(call_expression function: (member_expression object: (identifier) @variable.other.object.ts))

(import_specifier name : (identifier) @variable.other.readwrite.alias.ts)
(assignment_expression right: (identifier) @variable.other.readwrite.ts)
(decorator (identifier) @variable.other.readwrite.ts)
(arguments (identifier) @variable.other.readwrite.ts)
(binary_expression right: (identifier) @variable.other.readwrite.ts)
(assignment_expression left: (identifier) @variable.other.readwrite.ts)
(unary_expression argument: (identifier) @variable.other.readwrite.ts)
(variable_declarator name: (identifier) @variable.other.readwrite.ts)
(for_in_statement left: (identifier) @variable.other.readwrite.ts)
(update_expression argument: (identifier) @variable.other.readwrite.ts)
(arrow_function body: (identifier) @variable.other.readwrite.ts)
(shorthand_property_identifier) @variable.other.readwrite.ts
(pair value: (identifier) @variable.other.readwrite.ts)

(false) @constant.language.boolean.false.ts
(true) @constant.language.boolean.true.ts

(arrow_function parameter: (identifier) @variable.parameter.ts)
(required_parameter (identifier) @variable.parameter.ts)
(optional_parameter (identifier) @variable.parameter.ts)

(enum_assignment (property_identifier) @variable.other.enummember.ts)
(enum_body (property_identifier) @variable.other.enummember.ts)

(predefined_type) @support.type.primitive.ts

(type_identifier) @entity.name.type.class.ts

(pair key: (property_identifier) @meta.object-literal.key.ts)
