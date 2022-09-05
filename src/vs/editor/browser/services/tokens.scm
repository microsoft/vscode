(comment) @comment


(method_signature name: (property_identifier) @function)
(function_declaration name: (identifier) @function)
(method_definition name: (property_identifier) @function)
(call_expression function: (member_expression property: (property_identifier) @function))
(call_expression function: (identifier) @function)


(number) @number


(string) @string

[
  "class"
  "const"
  "let"
  "extends"
  "static"
  "readonly"
  "new"
  "interface"
  "type"
  "namespace"
  "keyof"
  "implements"
  "extends"
  "declare"
  "enum"
  "private"
  "public"
  "readonly"
  "protected"
] @keywords1


[
	"import"
	"from"
	"export"
	"while"
	"if"
	"else"
	"for"
	"return"
] @keywords2


(import_specifier name : (identifier) @variable)
(public_field_definition name: (property_identifier) @variable)
(assignment_expression left : (member_expression property: (property_identifier) @variable))
(assignment_expression right: (identifier) @variable)
(lexical_declaration (variable_declarator name: (identifier) @variable))
(arguments (identifier) @variable)
(binary_expression left: (identifier) @variable)
(binary_expression right: (identifier) @variable)
(arrow_function parameter: (identifier) @variable)
(member_expression object: (identifier) @variable property: (property_identifier) @variable)
(call_expression function: (member_expression object: (identifier) @variable))


(type_annotation (predefined_type) @type)
(type_identifier) @type
(enum_declaration name: (identifier) @type)
(internal_module name: (identifier) @type)
(new_expression constructor: (identifier) @type)
