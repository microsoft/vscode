/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SyntaxNode } from 'web-tree-sitter';
import { WASMLanguage } from './treeSitterLanguages';

/**
 * IF YOU WANT LINTING FOR YOUR TREE-SITTER QUERIES:
 *
 * Annotating a query template string with `treeSitterQuery.<WASMLanguage>` (see example below)
 * will allow the vscode-tree-sitter-query extension to provide linting (diagnostics) for this query.
 *
 * @example
 * ```ts
 * 	treeSitterQuery.typescript`(function_declaration) @function`
 * ```
 *
 * @remark don't forget to install the `vscode-tree-sitter-query` extension (and activate it, e.g., by opening a .scm file)
 */
const treeSitterQuery =
	(() => {
		/** default template string behavior */
		function defaultBehavior(query: TemplateStringsArray, ...values: any[]) {
			return query.length === 1 // no interpolations
				? query[0]
				: query.reduce((result, string, i) => `${result}${string}${values[i] || ''}`, '');
		}
		return {
			typescript: defaultBehavior,
			javascript: defaultBehavior,
			python: defaultBehavior,
			go: defaultBehavior,
			ruby: defaultBehavior,
			csharp: defaultBehavior,
			cpp: defaultBehavior,
			java: defaultBehavior,
			rust: defaultBehavior,
		};
	})();


function forLanguages<Lang extends WASMLanguage, T>(languages: readonly Lang[], query: T) {
	return Object.fromEntries(languages.map(language => [language, query])) as { [k in Lang]: T };
}

type LanguageQueryMap = { [wasmLanguage in WASMLanguage]: string[]; };

export const allKnownQueries: LanguageQueryMap = {
	[WASMLanguage.JavaScript]: [],
	[WASMLanguage.TypeScript]: [],
	[WASMLanguage.TypeScriptTsx]: [],
	[WASMLanguage.Python]: [],
	[WASMLanguage.Csharp]: [],
	[WASMLanguage.Go]: [],
	[WASMLanguage.Java]: [],
	[WASMLanguage.Ruby]: [],
	[WASMLanguage.Cpp]: [],
	[WASMLanguage.Rust]: [],
};
/**
 * register queries
 */
function q<T extends Partial<LanguageQueryMap>>(queryMap: T): T {
	for (const key in queryMap) {
		const queries = queryMap[key as WASMLanguage]!;
		allKnownQueries[key as WASMLanguage].push(...queries);
	}
	return queryMap;
}

export const callExpressionQuery: LanguageQueryMap = q({
	...forLanguages([WASMLanguage.JavaScript, WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		`[
			(call_expression
				function: (identifier) @identifier)
			(call_expression
				function: (member_expression
					(property_identifier) @identifier))
		] @call_expression`
	]),
	[WASMLanguage.Python]: [
		`[
			(call
				function: (identifier) @identifier)
			(call
				function: (attribute
					attribute: (identifier) @identifier))
		] @call_expression`
	],
	[WASMLanguage.Csharp]: [
		`[
			(invocation_expression
				function: (identifier) @identifier)
			(invocation_expression
				function: (member_access_expression
					name: (identifier) @identifier))
		] @call_expression`
	],
	[WASMLanguage.Go]: [
		`[
			(call_expression
				((selector_expression
					(field_identifier) @identifier)))
			(call_expression
				(identifier) @identifier)
		] @call_expression`
	],
	[WASMLanguage.Java]: [
		`[
			(method_invocation
				name: (identifier) @identifier)
		] @call_expression`
	],
	[WASMLanguage.Ruby]: [
		/**
		 * TODO@joyceerhl figure out how to support matching
		 * direct method calls i.e.
		 * ```
		 * def say_hello
		 *	puts "Hello, world!"
		 *	end
		 * say_hello
		 * ```
		 * which is matchable only by the `identifier` syntax node
		 * and could have performance implications
		 */
		`[
			(call (identifier) @identifier
				(#not-match? @identifier "new|send|public_send|method"))
			(call
				receiver: (identifier)
				method: (identifier) @method
				(#match? @method "^(send|public_send|method)")
				arguments: (argument_list
					(simple_symbol) @symbol))
		] @call_expression`
	],
	[WASMLanguage.Cpp]: [
		`[
			(function_declarator
				(identifier) @identifier)
			(function_declarator
				(field_identifier) @identifier)
			(call_expression (identifier) @identifier)
			(call_expression
				(field_expression
					field: (field_identifier) @identifier))
			(call_expression
				(call_expression
					(primitive_type)
					(argument_list
						(pointer_expression
						(identifier) @identifier))))
		] @call_expression`
	],
	[WASMLanguage.Rust]: [
		`[
			(call_expression (identifier) @identifier)
			(call_expression (field_expression (identifier) (field_identifier) @identifier))
			(call_expression (scoped_identifier (identifier) (identifier) @identifier (#not-match? @identifier "new")))
		] @call_expression`
	]
});

export const classDeclarationQuery: LanguageQueryMap = q({
	...forLanguages([WASMLanguage.JavaScript, WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		`(class_declaration) @class_declaration`
	]),
	[WASMLanguage.Java]: [
		`(class_declaration) @class_declaration`
	],
	[WASMLanguage.Csharp]: [
		`(class_declaration) @class_declaration`
	],
	[WASMLanguage.Python]: [
		`(class_definition) @class_declaration`
	],
	[WASMLanguage.Cpp]: [
		`(class_specifier) @class_declaration`
	],
	[WASMLanguage.Ruby]: [
		`(class) @class_declaration`
	],
	[WASMLanguage.Go]: [
		`(type_declaration
			(type_spec
				(type_identifier) @type_identifier)) @class_declaration`
	],
	[WASMLanguage.Rust]: [
		`(impl_item (type_identifier) @type_identifier) @class_declaration`
	]
});

export const typeDeclarationQuery: { [language: string]: string[] } = q({
	// No types in JavaScript
	[WASMLanguage.TypeScript]: [
		`[
			(interface_declaration)
			(type_alias_declaration)
		] @type_declaration`
	],
	[WASMLanguage.Csharp]: [
		`(interface_declaration
			(identifier) @type_identifier) @type_declaration`
	],
	[WASMLanguage.Cpp]: [
		`[
			(struct_specifier
				(type_identifier) @type_identifier)
			(union_specifier
				(type_identifier) @type_identifier)
			(enum_specifier
				(type_identifier) @type_identifier)
		] @type_declaration`
	],
	[WASMLanguage.Java]: [
		`(interface_declaration
			(identifier) @type_identifier) @type_declaration`
	],
	[WASMLanguage.Go]: [
		`(type_declaration
			(type_spec
				(type_identifier) @type_identifier)) @type_declaration`
	],
	[WASMLanguage.Ruby]: [
		`((constant) @type_identifier) @type_declaration`
	],
	[WASMLanguage.Python]: [
		`(class_definition
			(identifier) @type_identifier) @type_declaration`
	],
});

export const typeReferenceQuery: { [language: string]: string[] } = q({
	// No types in JavaScript
	[WASMLanguage.TypeScript]: [
		`(type_identifier) @type_identifier`
	],
	[WASMLanguage.Go]: [
		`(type_identifier) @type_identifier`
	],
	[WASMLanguage.Ruby]: [
		`(constant) @type_identifier`
	],
	[WASMLanguage.Csharp]: [
		`[
			(base_list
				(identifier) @type_identifier)
			(variable_declaration
				(identifier) @type_identifier)
		]`
	],
	[WASMLanguage.Cpp]: [
		`(type_identifier) @type_identifier`
	],
	[WASMLanguage.Java]: [
		`(type_identifier) @type_identifier`
	],
	[WASMLanguage.Python]: [
		`[
			(type (identifier) @type_identifier)
			(argument_list
				(identifier) @type_identifier)
		]`
	]
});

export const classReferenceQuery: LanguageQueryMap = q({
	...forLanguages([WASMLanguage.JavaScript, WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		`(new_expression
			constructor: (identifier) @new_expression)`
	]),
	[WASMLanguage.Python]: [
		`(call
			function: (identifier) @new_expression)`
	],
	[WASMLanguage.Csharp]: [
		`(object_creation_expression
			(identifier) @new_expression)`
	],
	[WASMLanguage.Java]: [
		`(object_creation_expression
			(type_identifier) @new_expression)`
	],
	[WASMLanguage.Cpp]: [
		`[
			(declaration
				(type_identifier) @new_expression)
			(class_specifier
				(type_identifier) @new_expression)
		]`
	],
	[WASMLanguage.Go]: [
		`(composite_literal (type_identifier) @new_expression)`
	],
	[WASMLanguage.Ruby]: [
		`((call
			receiver: ((constant) @new_expression)
			method: (identifier) @method)
				(#eq? @method "new"))`
	],
	[WASMLanguage.Rust]: [
		`(call_expression
			(scoped_identifier
				(identifier) @new_expression
				(identifier) @identifier
				(#eq? @identifier "new")))`
	],
});

export const functionQuery: LanguageQueryMap = q({
	python: [
		// `(function_definition)` is defined in python grammar:
		// https://github.com/tree-sitter/tree-sitter-python/blob/c4282ba411d990d313c5f8e7850bcaaf46fbf7da/grammar.js#L325-L338
		// docstring is represented in grammar as an optional `(initial expression_statement (string))`
		// at the start of the body block
		`[
			(function_definition
				name: (identifier) @identifier
				body: (block
						(expression_statement (string))? @docstring) @body)
			(assignment
				left: (identifier) @identifier
				right: (lambda) @body)
		] @function`,

		// handle malformed defs - no trailing semicolon or no body
		`(ERROR ("def" (identifier) (parameters))) @function`,
	],
	...forLanguages([WASMLanguage.JavaScript, WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		// function patterns defined in javascript grammar which is shared by ts
		// https://github.com/tree-sitter/tree-sitter-javascript/blob/3d9fe9786ee74fa5067577f138e1a7129f80fb41/grammar.js#L595-L629
		// include `arrow_function` as well
		`[
			(function_expression
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(function_declaration
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(generator_function
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(generator_function_declaration
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(method_definition
				name: (property_identifier)? @identifier
				body: (statement_block) @body)
			(arrow_function
				body: (statement_block) @body)
		] @function`,
	]),
	go: [
		// function patterns defined in go grammar:
		// https://github.com/tree-sitter/tree-sitter-go/blob/b0c78230146705e867034e49a5ece20245b33490/grammar.js#L194-L209
		`[
			(function_declaration
				name: (identifier) @identifier
				body: (block) @body)
			(method_declaration
				name: (field_identifier) @identifier
				body: (block) @body)
		] @function`,
	],
	ruby: [
		// function patterns defined in ruby grammar:
		// https://github.com/tree-sitter/tree-sitter-ruby/blob/master/grammar.js
		// NOTE: Use a @params label for optional parameters to avoid capturing as
		// 	part of @body if parameters are present.
		`[
			(method
				name: (_) @identifier
				parameters: (method_parameters)? @params
				[(_)+ "end"] @body)
			(singleton_method
				name: (_) @identifier
				parameters: (method_parameters)? @params
				[(_)+ "end"] @body)
		] @function`,
	],
	csharp: [
		// function patterns defined in csharp grammar:
		// https://github.com/tree-sitter/tree-sitter-c-sharp/blob/master/grammar.js
		`[
			(constructor_declaration
				(identifier) @identifier
				(block) @body)
			(destructor_declaration
				(identifier) @identifier
				(block) @body)
			(operator_declaration
				(block) @body)
			(method_declaration
				(identifier) @identifier
				(block) @body)
			(local_function_statement
				(identifier) @identifier
				(block) @body)
		] @function`,
	],
	cpp: [
		// function patterns defined in cpp grammar:
		// https://github.com/tree-sitter/tree-sitter-cpp/blob/master/grammar.js
		`[
			(function_definition
				(_
					(identifier) @identifier)
					(compound_statement) @body)
			(function_definition
				(function_declarator
					(qualified_identifier
						(identifier) @identifier))
					(compound_statement) @body)
		] @function`,
	],
	java: [
		`[
			(constructor_declaration
				name: (identifier) @identifier
				body: (constructor_body) @body)
			(method_declaration
				name: (_) @identifier
				body: (block) @body)
			(lambda_expression
				body: (block) @body)
		] @function`
	],
	rust: [
		`[
			(function_item (identifier) @identifier)
			(let_declaration (identifier) @identifier)
		] @function`
	]
});

export const docCommentQueries: LanguageQueryMap = q({
	[WASMLanguage.JavaScript]: [
		treeSitterQuery.javascript`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
	],
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		treeSitterQuery.typescript`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
	]),
	[WASMLanguage.Java]: [
		treeSitterQuery.java`((block_comment) @block_comment
			(#match? @block_comment "^\\\\/\\\\*\\\\*")) @docComment`
	],
	[WASMLanguage.Cpp]: [
		treeSitterQuery.cpp`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
	],
	[WASMLanguage.Csharp]: [
		treeSitterQuery.csharp`(
			((comment) @c
				(#match? @c "^\\\\/\\\\/\\\\/"))+
		) @docComment`
	],
	[WASMLanguage.Rust]: [
		treeSitterQuery.rust`((line_comment) @comment
			(#match? @comment "^\/\/\/|^\/\/!"))+ @docComment`
	],
	// note: golang & ruby have same prefix for a doc comment and line comment
	[WASMLanguage.Go]: [
		treeSitterQuery.go`((comment)+) @docComment`
	],
	[WASMLanguage.Ruby]: [
		treeSitterQuery.ruby`((comment)+) @docComment`
	],

	// NOT yet supported:

	// we don't support python with this yet because of its placement of a docstring (under signature)
	[WASMLanguage.Python]: [
		`(expression_statement
			(string) @docComment)`
	],
});

export const testableNodeQueries: LanguageQueryMap = q({
	[WASMLanguage.JavaScript]: [
		treeSitterQuery.javascript`[
			(function_declaration
				(identifier) @function.identifier
			) @function

			(generator_function_declaration
				name: (identifier) @generator_function.identifier
			) @generator_function

			(class_declaration
				name: (identifier) @class.identifier ;; note: (type_identifier) in typescript
				body: (class_body
							(method_definition
								name: (property_identifier) @method.identifier
							) @method
						)
			) @class
		]`
	],
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx],
		[treeSitterQuery.typescript`[
				(function_declaration
					(identifier) @function.identifier
				) @function

				(generator_function_declaration
					name: (identifier) @generator_function.identifier
				) @generator_function

				(class_declaration
					name: (type_identifier) @class.identifier
					body: (class_body
								(method_definition
									(accessibility_modifier)? @method.accessibility_modifier
									name: (property_identifier) @method.identifier
									(#not-eq? @method.accessibility_modifier "private")
								) @method
							)
				) @class
			]`]
	),
	[WASMLanguage.Python]: [
		treeSitterQuery.python`[
				(function_definition
					name: (identifier) @function.identifier
				) @function
			]`
	],
	[WASMLanguage.Go]: [
		treeSitterQuery.go`[
				(function_declaration
					name: (identifier) @function.identifier
				) @function

				(method_declaration
					name: (field_identifier) @method.identifier
				) @method
			]`
	],
	[WASMLanguage.Ruby]: [
		treeSitterQuery.ruby`[
				(method
					name: (identifier) @method.identifier
				) @method

				(singleton_method
					name: (_) @singleton_method.identifier
				) @singleton_method
			]`
	],
	[WASMLanguage.Csharp]: [
		treeSitterQuery.csharp`[
				(constructor_declaration
					(identifier) @constructor.identifier
				) @constructor

				(destructor_declaration
					(identifier) @destructor.identifier
				) @destructor

				(method_declaration
					(identifier) @method.identifier
				) @method

				(local_function_statement
					(identifier) @local_function.identifier
				) @local_function
			]`
	],
	[WASMLanguage.Cpp]: [ // FIXME@ulugbekna: #7769 enrich with class/methods
		treeSitterQuery.cpp`[
				(function_definition
					(_
						(identifier) @identifier)
				) @function
			]`
	],
	[WASMLanguage.Java]: [
		treeSitterQuery.java`(class_declaration
			name: (_) @class.identifier
			body: (_
						[
							(constructor_declaration
								(modifiers)? @constructor.modifiers
								(#not-eq? @constructor.modifiers "private")
								name: (identifier) @constructor.identifier
							) @constructor

							(method_declaration
								(modifiers)? @method.modifiers
								(#not-eq? @method.modifiers "private")
								name: (identifier) @method.identifier
							) @method
						]
					)
		) @class`
	],
	[WASMLanguage.Rust]: [
		treeSitterQuery.rust`[
				(function_item
					(identifier) @function.identifier
				) @function
			]`
	]
});

export const symbolQueries: LanguageQueryMap = q({
	[WASMLanguage.JavaScript]: [
		treeSitterQuery.javascript`[
			(identifier) @symbol
			(property_identifier) @symbol
			(private_property_identifier) @symbol
		]`
	],
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		treeSitterQuery.typescript`[
			(identifier) @symbol
			(type_identifier) @symbol
			(property_identifier) @symbol
			(private_property_identifier) @symbol
		]`
	]),
	[WASMLanguage.Cpp]: [
		treeSitterQuery.cpp`[
			(identifier) @symbol
			(type_identifier) @symbol
		]`
	],
	[WASMLanguage.Csharp]: [
		treeSitterQuery.csharp`[
			(identifier) @symbol
		]`
	],
	[WASMLanguage.Go]: [
		treeSitterQuery.go`[
			(identifier) @symbol
		]`
	],
	[WASMLanguage.Java]: [
		treeSitterQuery.java`[
			(identifier) @symbol
		]`
	],
	[WASMLanguage.Python]: [
		treeSitterQuery.python`[
			(identifier) @symbol
		]`
	],
	[WASMLanguage.Ruby]: [
		treeSitterQuery.ruby`[
			(identifier) @symbol
		]`
	],
	[WASMLanguage.Rust]: [
		treeSitterQuery.rust`[
			(identifier) @symbol
		]`
	],
});

export const syntacticallyValidAtoms: LanguageQueryMap = q({
	[WASMLanguage.TypeScript]: [
		treeSitterQuery.typescript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related
				(public_field_definition) @public_field_definition
				(method_definition) @method_definition
				(class_declaration (_ (method_signature) @method_signature))
				(abstract_method_signature) @abstract_method_signature

				;; enum declaration related
				(enum_assignment) @enum_assignment

				;; interface declaration related
				(interface_declaration (_ (method_signature) @method_signature))
				(interface_declaration (_ (property_signature) @property_signature))

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(if_statement
					consequence: [
						(expression_statement)
						(if_statement)
					] @if_statement.exclude_captures)
				(else_clause
					[
						(expression_statement)
						(if_statement) ; for if-else chains
					] @else_clause.exclude_captures)
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement
			]
		`
	],
	[WASMLanguage.TypeScriptTsx]: [
		treeSitterQuery.typescript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related
				(public_field_definition) @public_field_definition
				(method_definition) @method_definition
				(class_declaration (_ (method_signature) @method_signature))
				(abstract_method_signature) @abstract_method_signature

				;; enum declaration related
				(enum_assignment) @enum_assignment

				;; interface declaration related
				(interface_declaration (_ (method_signature) @method_signature))
				(interface_declaration (_ (property_signature) @property_signature))

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(if_statement
					consequence: [
						(expression_statement)
						(if_statement)
					] @if_statement.exclude_captures)
				(else_clause
					[
						(expression_statement)
						(if_statement) ; for if-else chains
					] @else_clause.exclude_captures)
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement

				;; jsx
				(jsx_element) @jsx_element
				(jsx_element (_ (jsx_expression) @jsx_expression))
			]
		`
	],
	[WASMLanguage.Python]: [
		treeSitterQuery.python`
			[
				(comment) @comment

				;; simple statements
				(assert_statement) @assert_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(delete_statement) @delete_statement
				(exec_statement) @exec_statement
				(expression_statement) @expression_statement
				(future_import_statement) @future_import_statement
				(global_statement) @global_statement
				(import_from_statement) @import_from_statement
				(import_statement) @import_statement
				(nonlocal_statement) @nonlocal_statement
				(pass_statement) @pass_statement
				(print_statement) @print_statement
				(raise_statement) @raise_statement
				(return_statement) @return_statement
				(type_alias_statement) @type_alias_statement


				;; compound statements

				(class_definition) @class_definition
				(decorated_definition) @decorated_definition
				(for_statement) @for_statement
				(function_definition) @function_definition
				(if_statement) @if_statement
				(try_statement) @try_statement
				(while_statement) @while_statement
				(with_statement) @with_statement


				;; expressions

				(expression_list) @expression_list
				(expression_statement) @expression_statement
			]
		`
	],
	[WASMLanguage.JavaScript]: [
		treeSitterQuery.javascript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related

				(field_definition) @field_definition
				(method_definition) @method_definition

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement
			]`
	],
	[WASMLanguage.Go]: [
		treeSitterQuery.go`
		[
			(_statement) @statement
			(function_declaration) @function_declaration
			(import_declaration) @import_declaration
			(method_declaration) @method_declaration
			(package_clause) @package_clause

			(if_statement
				initializer: (_) @for_statement.exclude_captures) @for_statement

			(expression_case) @expression_case ;; e.g., case 0:
		]
		`
	],
	[WASMLanguage.Ruby]: [
		treeSitterQuery.ruby`
			[
				(comment) @comment

				(assignment) @assignment

				(if) @if

				(call) @call

				(case) @case

				(when) @when

				(while) @while

				(for) @for

				(method) @method

				(class) @class

				(module) @module

				(begin) @begin
			]
		`
	],
	[WASMLanguage.Csharp]: [
		treeSitterQuery.csharp`
			[
				(comment) @comment

				(class_declaration) @class_declaration
				(constructor_declaration) @constructor_declaration
				(method_declaration) @method_declaration
				(delegate_declaration) @delegate_declaration
				(enum_declaration) @enum_declaration
				(extern_alias_directive) @extern_alias_directive
				(file_scoped_namespace_declaration) @file_scoped_namespace_declaration
				(global_attribute) @global_attribute
				(global_statement) @global_statement
				(interface_declaration) @interface_declaration
				(namespace_declaration) @namespace_declaration
				(record_declaration) @record_declaration
				(struct_declaration) @struct_declaration
				(using_directive) @using_directive

				(local_declaration_statement) @local_declaration_statement
				(expression_statement) @expression_statement
				(for_statement) @for_statement
				(foreach_statement) @foreach_statement
				(continue_statement) @continue_statement
				(break_statement) @break_statement
				(throw_statement) @throw_statement
				(return_statement) @return_statement
				(try_statement) @try_statement
			]
		`
	],
	[WASMLanguage.Cpp]: [
		treeSitterQuery.cpp`
			[
				(preproc_ifdef) @preproc_ifdef
				(preproc_call) @preproc_call
				(preproc_def) @preproc_def
				(type_definition) @type_definition
				(type_definition
					type:(_) @type_definition.exclude_captures) @type_definition

				(declaration) @declaration

				(expression_statement) @expression_statement

				(comment) @comment

				(preproc_include) @preproc_include

				(namespace_definition) @namespace_definition

				(enum_specifier) @enum_specifier

				(struct_specifier) @struct_specifier

				(template_declaration) @template_declaration

				(function_definition) @function_definition

				(return_statement) @return_statement

				(class_specifier) @class_specifier

				(try_statement) @try_statement

				(throw_statement) @throw_statement

				(for_statement) @for_statement
				(for_statement
					initializer:(_) @for_statement.exclude_captures) @for_statement

				(for_range_loop) @for_range_loop

				(while_statement) @while_statement
				(do_statement) @do_statement
				(if_statement) @if_statement

				(labeled_statement) @labeled_statement
				(goto_statement) @goto_statement

				(break_statement) @break_statement
			]
		`
	],
	[WASMLanguage.Java]: [
		treeSitterQuery.java`
		[
			(statement) @statement ;; @ulugbekna: this includes (declaration); but somehow it can't capture inner classes

			(line_comment) @line_comment
			(block_comment) @block_comment

			(for_statement
				init: (_) @for_statement.exclude_captures)

			(block) @block.exclude_captures

			(class_declaration) @class_declaration

			(constructor_declaration) @constructor_declaration

			(field_declaration) @field_declaration

			(method_declaration) @method_declaration
		]
		`
	],
	[WASMLanguage.Rust]: [
		// treeSitterQuery.rust`
		// [
		// 	(line_comment) @line_comment

		// 	(let_declaration) @let_declaration
		// 	(extern_crate_declaration) @extern_crate_declaration
		// 	(use_declaration) @use_declaration

		// 	(attribute_item) @attribute_item
		// 	(const_item) @const_item
		// 	(enum_item) @enum_item
		// 	(foreign_mod_item) @foreign_mod_item
		// 	(function_item) @function_item
		// 	(function_signature_item) @function_signature_item
		// 	(impl_item) @impl_item
		// 	(inner_attribute_item) @inner_attribute_item
		// 	(mod_item) @mod_item
		// 	(static_item) @static_item
		// 	(struct_item) @struct_item
		// 	(trait_item) @trait_item
		// 	(type_item) @type_item
		// 	(union_item) @union_item

		// 	(macro_definition) @macro_definition

		// 	(empty_statement) @empty_statement

		// 	(compound_assignment_expr) @compound_assignment_expr
		// 	(generic_function) @generic_function
		// 	(metavariable) @metavariable

		// 	(match_arm) @match_arm

		// 	(async_block) @async_block
		// 	(const_block) @const_block
		// 	(unsafe_block) @unsafe_block

		// 	(block) @block.exclude_captures
		// ]
		// `
	]
});

export const coarseScopeTypes: { [wasmLanguage in WASMLanguage]: string[] } = {
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		'program',
		'interface_declaration',
		'class_declaration',
		'function_declaration',
		'function_expression',
		'type_alias_declaration',
		'method_definition',
	]),
	[WASMLanguage.JavaScript]: [
		'program',
		'class_declaration',
		'function_declaration',
		'function_expression',
		'method_definition',
	],
	[WASMLanguage.Java]: [
		'program',
		'class_declaration',
		'interface_declaration',
		'method_declaration',
	],
	[WASMLanguage.Cpp]: [
		'translation_unit',
		'class_specifier',
		'function_definition',
	],
	[WASMLanguage.Csharp]: [
		'compilation_unit',
		'class_declaration',
		'interface_declaration',
		'method_declaration',
	],
	[WASMLanguage.Python]: [
		'module',
		'class_definition',
		'function_definition',
	],
	[WASMLanguage.Go]: [
		'source_file',
		'type_declaration',
		'function_declaration',
		'method_declaration',
	],
	[WASMLanguage.Ruby]: [
		'program',
		'method',
		'class',
		'method',
	],
	[WASMLanguage.Rust]: [
		'source_file',
		'function_item',
		'impl_item',
		'let_declaration',
	],
};

export const coarseScopesQuery: LanguageQueryMap = q({
	[WASMLanguage.TypeScript]: [
		coarseScopesQueryForLanguage(WASMLanguage.TypeScript)
	],
	[WASMLanguage.TypeScriptTsx]: [
		coarseScopesQueryForLanguage(WASMLanguage.TypeScriptTsx)
	],
	[WASMLanguage.JavaScript]: [
		coarseScopesQueryForLanguage(WASMLanguage.JavaScript)
	],
	[WASMLanguage.Java]: [
		coarseScopesQueryForLanguage(WASMLanguage.Java)
	],
	[WASMLanguage.Cpp]: [
		coarseScopesQueryForLanguage(WASMLanguage.Cpp)
	],
	[WASMLanguage.Csharp]: [
		coarseScopesQueryForLanguage(WASMLanguage.Csharp)
	],
	[WASMLanguage.Python]: [
		coarseScopesQueryForLanguage(WASMLanguage.Python)
	],
	[WASMLanguage.Go]: [
		coarseScopesQueryForLanguage(WASMLanguage.Go)
	],
	[WASMLanguage.Ruby]: [
		coarseScopesQueryForLanguage(WASMLanguage.Ruby)
	],
	[WASMLanguage.Rust]: [
		coarseScopesQueryForLanguage(WASMLanguage.Rust)
	],
});

export const fineScopeTypes: { [wasmLanguage in WASMLanguage]: string[] } = {
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx, WASMLanguage.JavaScript], [
		'for_in_statement',
		'for_statement',
		'if_statement',
		'while_statement',
		'do_statement',
		'try_statement',
		'switch_statement'
	]),
	[WASMLanguage.Java]: [
		'for_statement',
		'enhanced_for_statement',
		'if_statement',
		'while_statement',
		'do_statement',
		'try_statement',
		'switch_expression'
	],
	[WASMLanguage.Cpp]: [
		'for_statement',
		'for_range_loop',
		'if_statement',
		'while_statement',
		'do_statement',
		'try_statement',
		'switch_statement'
	],
	[WASMLanguage.Csharp]: [
		'for_statement',
		'for_each_statement',
		'if_statement',
		'while_statement',
		'do_statement',
		'try_statement',
		'switch_expression'
	],
	[WASMLanguage.Python]: [
		'for_statement',
		'if_statement',
		'while_statement',
		'try_statement'
	],
	[WASMLanguage.Go]: [
		'for_statement',
		'if_statement',
		'type_switch_statement'
	],
	[WASMLanguage.Ruby]: [
		'while',
		'for',
		'if',
		'case'
	],
	[WASMLanguage.Rust]: [
		'for_statement',
		'if_statement',
		'while_statement',
		'loop_statement',
		'match_expression',
	],
};

export const statementTypes: { [wasmLanguage in WASMLanguage]: string[] } = {
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		'lexical_declaration',
		'expression_statement',
		'public_field_definition',
	]),
	[WASMLanguage.JavaScript]: [
		'call_expression',
		'expression_statement',
		'variable_declaration',
		'public_field_definition'
	],
	[WASMLanguage.Java]: [
		'expression_statement',
		'local_variable_declaration',
		'field_declaration'
	],
	[WASMLanguage.Cpp]: [
		'field_declaration',
		'expression_statement',
		'declaration'
	],
	[WASMLanguage.Csharp]: [
		'field_declaration',
		'expression_statement'
	],
	[WASMLanguage.Python]: [
		'expression_statement'
	],
	[WASMLanguage.Go]: [
		'short_var_declaration',
		'call_expression'
	],
	[WASMLanguage.Ruby]: [
		'call',
		'assignment'
	],
	[WASMLanguage.Rust]: [
		'expression_statement',
		'let_declaration',
		'use_declaration',
		'assignment_expression',
		'macro_definition',
		'extern_crate_declaration'
	],
};

const semanticChunkTargetTypes: { [wasmLanguage in WASMLanguage]: string[] } = {
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		'class_declaration',
		'function_declaration',
		'generator_function_declaration',
		'interface_declaration',
		'internal_module',
		'method_definition',
		'abstract_class_declaration',
		'abstract_method_signature',
		'enum_declaration'
	]),
	[WASMLanguage.JavaScript]: [
		'class_declaration',
		'function_declaration',
		'generator_function_declaration',
		'method_definition',
	],
	[WASMLanguage.Java]: [
		'class_declaration',
		'constructor_declaration',
		'enum_declaration',
		'interface_declaration',
		'method_declaration',
		'module_declaration',
	],
	[WASMLanguage.Cpp]: [
		'class_specifier',
		'function_definition',
		'namespace_definition',
		'struct_specifier'
	],
	[WASMLanguage.Csharp]: [
		'class_declaration',
		'constructor_declaration',
		'destructor_declaration',
		'enum_declaration',
		'interface_declaration',
		'method_declaration',
		'namespace_declaration',
		'struct_declaration',
	],
	[WASMLanguage.Python]: [
		'function_definition',
		'class_definition',
	],
	[WASMLanguage.Go]: [
		'function_declaration',
		'method_declaration'
	],
	[WASMLanguage.Ruby]: [
		'class',
		'method',
		'module'
	],
	[WASMLanguage.Rust]: [
		'function_item',
		'impl_item',
		'mod_item',
		'struct_item',
		'trait_item',
		'union_item',
	],
};

export const semanticChunkingTargetQuery: LanguageQueryMap = q({
	[WASMLanguage.TypeScript]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.TypeScript)
	],
	[WASMLanguage.TypeScriptTsx]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.TypeScriptTsx)
	],
	[WASMLanguage.JavaScript]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.JavaScript)
	],
	[WASMLanguage.Java]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Java)
	],
	[WASMLanguage.Cpp]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Cpp)
	],
	[WASMLanguage.Csharp]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Csharp)
	],
	[WASMLanguage.Python]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Python)
	],
	[WASMLanguage.Go]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Go)
	],
	[WASMLanguage.Rust]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Rust)
	],
	[WASMLanguage.Ruby]: [
		semanticChunkingTargetQueryForLanguage(WASMLanguage.Ruby)
	]
});


function coarseScopesQueryForLanguage(language: WASMLanguage): string {
	return coarseScopeTypes[language].map((scope) => `(${scope}) @scope`).join('\n');
}

function semanticChunkingTargetQueryForLanguage(language: WASMLanguage): string {
	const blocks = semanticChunkTargetTypes[language].map((blockType) => `(${blockType})`).join('\n');
	return `[
		${blocks}
	] @definition`;
}

export function _isScope(language: WASMLanguage, node: SyntaxNode): boolean {
	return coarseScopeTypes[language].includes(node.type) || fineScopeTypes[language].includes(node.type);
}

export function _isFineScope(language: WASMLanguage, node: SyntaxNode): boolean {
	return fineScopeTypes[language].includes(node.type);
}

export function _isStatement(language: WASMLanguage, node: SyntaxNode): boolean {
	return statementTypes[language].includes(node.type);
}

export const testInSuiteQueries: { [wasmLanguage in WASMLanguage]: string[] } = {
	...forLanguages([WASMLanguage.TypeScript, WASMLanguage.TypeScriptTsx], [
		treeSitterQuery.typescript`[
			(expression_statement
				(call_expression
					function: (identifier) @fn
					(#any-of? @fn "test" "it")
				)
			) @test
		]`
	]),
	[WASMLanguage.JavaScript]: [
		// same as typescript, but we want different tree-sitter query linting to prevent breakages in future
		treeSitterQuery.javascript`[
			(call_expression
				function: (identifier) @fn
				(#any-of? @fn "test" "it")
			) @test
		]`
	],
	[WASMLanguage.Python]: [
		treeSitterQuery.python`[
			(function_definition
				name: (identifier) @fn
				(#match? @fn "^test_")
			) @test
		]`
	],
	[WASMLanguage.Java]: [
		treeSitterQuery.java`[
			(method_declaration
				name: (identifier) @fn
				(#match? @fn "^test")
			) @test
		]`
	],
	[WASMLanguage.Go]: [
		treeSitterQuery.go`[
			(function_declaration
				name: (identifier) @fn
				(#match? @fn "^Test")
			) @test
		]`
	],
	[WASMLanguage.Ruby]: [],
	[WASMLanguage.Csharp]: [],
	[WASMLanguage.Cpp]: [],
	[WASMLanguage.Rust]: []
};
