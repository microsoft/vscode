/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Parser, { SyntaxNode } from 'web-tree-sitter';
import { parseTreeSitter } from '../../../prompt/src/parse';

export abstract class StatementNode {
	readonly children: StatementNode[] = [];
	parent: StatementNode | undefined;
	nextSibling: StatementNode | undefined;
	protected collapsed = false;

	constructor(readonly node: SyntaxNode) { }

	addChild(child: StatementNode) {
		child.parent = this;
		child.nextSibling = undefined;
		if (this.children.length > 0) {
			this.children[this.children.length - 1].nextSibling = child;
		}
		this.children.push(child);
	}

	/**
	 * Called after the last child is added to this node when the tree is being
	 * constructed. This is a callback derived classes can use to do any additional
	 * processing once this branch of the tree is complete. The default behavior
	 * is to do nothing.
	 */
	childrenFinished() { }

	containsStatement(stmt: StatementNode): boolean {
		return this.node.startIndex <= stmt.node.startIndex && this.node.endIndex >= stmt.node.endIndex;
	}

	statementAt(offset: number): StatementNode | undefined {
		if (this.node.startIndex > offset || this.node.endIndex < offset) { return undefined; }

		let innerMatch: StatementNode | undefined = undefined;
		this.children.find(stmt => {
			innerMatch = stmt.statementAt(offset);
			return innerMatch !== undefined;
		});
		return innerMatch ?? this;
	}

	abstract get isCompoundStatementType(): boolean;

	/** Treat this node and its children as a single statement */
	protected collapse() {
		this.children.length = 0;
		this.collapsed = true;
	}

	get description(): string {
		return `${this.node.type} ([${this.node.startPosition.row},${this.node.startPosition.column}]..[${this.node.endPosition.row},${this.node.endPosition.column}]): ${JSON.stringify(this.node.text.length > 33 ? this.node.text.substring(0, 15) + '...' + this.node.text.slice(-15) : this.node.text)}`;
	}

	dump(prefix1: string = '', prefix2: string = ''): string {
		const result = [`${prefix1}${this.description}`];
		this.children.forEach(child => {
			result.push(
				child.dump(`${prefix2}+- `, child.nextSibling === undefined ? `${prefix2}   ` : `${prefix2}|  `)
			);
		});
		return result.join('\n');
	}

	dumpPath(prefix1: string = '', prefix2: string = '', forChild = false): string {
		if (this.parent) {
			const path = this.parent.dumpPath(prefix1, prefix2, true);
			const indentSize = path.length - path.lastIndexOf('\n') - 1 - prefix2.length;
			const indent = ' '.repeat(indentSize);
			const nextPrefix = forChild ? `\n${prefix2}${indent}+- ` : '';
			return path + this.description + nextPrefix;
		} else {
			const nextPrefix = forChild ? `\n${prefix2}+- ` : '';
			return prefix1 + this.description + nextPrefix;
		}
	}
}

/**
 * A simplified view of a syntax tree.
 *
 * It contains only nodes which represent complete statements. Because statements may
 * be compound, a single statement may contain other statements within it.
 *
 * "Statement" refers to a syntactic unit of the language. It represents the smallest
 * division of a code completion we would consider when truncating. It may be a simple
 * statement such as:
 *
 *   `x = 1;`
 *
 * or a compound statement such as:
 *
 *   `if (x > 0) { x = 2; }`
 *
 * where the entire string comprises the parent statement, and `x = 2;` is
 * a child statement of the parent. Note that `x > 0` is not a statement, but
 * an expression.
 *
 * The view is further constrained to a portion of the overall document (the start and
 * end offsets). This view contains all statements which intersect that region, so
 * containing statements are included in the view, even though they may extend
 * beyond the region.
 */
export abstract class StatementTree implements Disposable {
	protected tree: Parser.Tree | undefined;
	readonly statements: StatementNode[] = [];

	static isSupported(languageId: string): boolean {
		return (
			JSStatementTree.languageIds.has(languageId) ||
			TSStatementTree.languageIds.has(languageId) ||
			PyStatementTree.languageIds.has(languageId) ||
			GoStatementTree.languageIds.has(languageId) ||
			PhpStatementTree.languageIds.has(languageId) ||
			RubyStatementTree.languageIds.has(languageId) ||
			JavaStatementTree.languageIds.has(languageId) ||
			CSharpStatementTree.languageIds.has(languageId) ||
			CStatementTree.languageIds.has(languageId)
		);
	}

	static isTrimmedByDefault(languageId: string): boolean {
		return (
			JSStatementTree.languageIds.has(languageId) ||
			TSStatementTree.languageIds.has(languageId) ||
			GoStatementTree.languageIds.has(languageId)
		);
	}

	static create(languageId: string, text: string, startOffset: number, endOffset: number): StatementTree {
		if (JSStatementTree.languageIds.has(languageId)) {
			return new JSStatementTree(languageId, text, startOffset, endOffset);
		} else if (TSStatementTree.languageIds.has(languageId)) {
			return new TSStatementTree(languageId, text, startOffset, endOffset);
		} else if (PyStatementTree.languageIds.has(languageId)) {
			return new PyStatementTree(languageId, text, startOffset, endOffset);
		} else if (GoStatementTree.languageIds.has(languageId)) {
			return new GoStatementTree(languageId, text, startOffset, endOffset);
		} else if (JavaStatementTree.languageIds.has(languageId)) {
			return new JavaStatementTree(languageId, text, startOffset, endOffset);
		} else if (PhpStatementTree.languageIds.has(languageId)) {
			return new PhpStatementTree(languageId, text, startOffset, endOffset);
		} else if (RubyStatementTree.languageIds.has(languageId)) {
			return new RubyStatementTree(languageId, text, startOffset, endOffset);
		} else if (CSharpStatementTree.languageIds.has(languageId)) {
			return new CSharpStatementTree(languageId, text, startOffset, endOffset);
		} else if (CStatementTree.languageIds.has(languageId)) {
			return new CStatementTree(languageId, text, startOffset, endOffset);
		} else {
			throw new Error(`Unsupported languageId: ${languageId}`);
		}
	}

	constructor(
		private readonly languageId: string,
		private readonly text: string,
		private readonly startOffset: number,
		private readonly endOffset: number
	) { }

	[Symbol.dispose]() {
		if (this.tree) {
			this.tree.delete();
			this.tree = undefined;
		}
	}

	clear() {
		this.statements.length = 0;
	}

	statementAt(offset: number): StatementNode | undefined {
		let match: StatementNode | undefined = undefined;
		this.statements.find(stmt => {
			match = stmt.statementAt(offset);
			return match !== undefined;
		});
		return match;
	}

	async build(): Promise<void> {
		const parents: StatementNode[] = [];
		this.clear();
		const tree = await this.parse();
		const query = this.getStatementQuery(tree);
		query
			.captures(tree.rootNode, {
				startPosition: this.offsetToPosition(this.startOffset),
				endPosition: this.offsetToPosition(this.endOffset),
			})
			.forEach(capture => {
				const stmt = this.createNode(capture.node);
				while (parents.length > 0 && !parents[0].containsStatement(stmt)) {
					const completed = parents.shift(); // not a parent
					completed?.childrenFinished();
				}
				if (parents.length > 0) {
					parents[0].addChild(stmt); // this is our parent
				} else {
					this.addStatement(stmt); // top-level statement
				}
				parents.unshift(stmt); // add to the stack
			});
		// finish up
		parents.forEach(stmt => stmt.childrenFinished());
	}

	protected abstract createNode(node: SyntaxNode): StatementNode;
	protected abstract getStatementQueryText(): string;

	protected addStatement(stmt: StatementNode) {
		stmt.parent = undefined;
		stmt.nextSibling = undefined;
		if (this.statements.length > 0) {
			this.statements[this.statements.length - 1].nextSibling = stmt;
		}
		this.statements.push(stmt);
	}

	protected async parse(): Promise<Parser.Tree> {
		if (!this.tree) {
			this.tree = await parseTreeSitter(this.languageId, this.text);
		}
		return this.tree;
	}

	protected getStatementQuery(tree: Parser.Tree): Parser.Query {
		return this.getQuery(tree.getLanguage(), this.getStatementQueryText());
	}

	protected getQuery(language: Parser.Language, queryText: string): Parser.Query {
		// TODO: query objects can be cached and reused
		return language.query(queryText);
	}

	protected offsetToPosition(offset: number): Parser.Point {
		const lines = this.text.slice(0, offset).split('\n');
		const row = lines.length - 1;
		const column = lines[lines.length - 1].length;
		return { row, column };
	}

	dump(prefix: string = ''): string {
		const result: string[] = [];
		this.statements.forEach((stmt, idx) => {
			const idxStr = `[${idx}]`;
			const idxSpaces = ' '.repeat(idxStr.length);
			result.push(stmt.dump(`${prefix} ${idxStr} `, `${prefix} ${idxSpaces} `));
		});
		return result.join('\n');
	}
}

/*
 * Javascript and Typescript implementation
 */

class JSStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'function_declaration',
		'generator_function_declaration',
		'class_declaration',
		'statement_block',
		'if_statement',
		'switch_statement',
		'for_statement',
		'for_in_statement',
		'while_statement',
		'do_statement',
		'try_statement',
		'with_statement',
		'labeled_statement',
		'method_definition',
		'interface_declaration',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && JSStatementNode.compoundTypeNames.has(this.node.type);
	}

	override childrenFinished() {
		if (this.isSingleLineIfStatement()) { this.collapse(); }
	}

	private isSingleLineIfStatement(): boolean {
		// must be an if statement
		if (this.node.type !== 'if_statement') { return false; }
		// must be a single line
		if (this.node.startPosition.row !== this.node.endPosition.row) { return false; }
		// Exclude if statements with braces so that block position is correct:
		// can have a single statement without braces
		if (this.children.length === 1 && this.children[0].node.type !== 'statement_block') { return true; }
		// or two statements without braces if an else is present
		if (
			this.children.length === 2 &&
			this.node.childForFieldName('alternative') !== null &&
			this.children[0].node.type !== 'statement_block' &&
			this.children[1].node.type !== 'statement_block'
		) {
			return true;
		}

		return false;
	}
}

class JSStatementTree extends StatementTree {
	static readonly languageIds = new Set(['javascript', 'javascriptreact', 'jsx']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new JSStatementNode(node);
	}

	protected getStatementQueryText(): string {
		// From https://github.com/tree-sitter/tree-sitter-javascript/blob/fdeb68ac8d2bd5a78b943528bb68ceda3aade2eb/grammar.js#L199-L226
		// Because `statement` is declared `inline` in this version of the
		// grammar, we search for each choice from its definition plus two
		// class constructs we want to consider for trimming.
		return `[
			(export_statement)
			(import_statement)
			(debugger_statement)
			(expression_statement)
			(declaration)
			(statement_block)
			(if_statement)
			(switch_statement)
			(for_statement)
			(for_in_statement)
			(while_statement)
			(do_statement)
			(try_statement)
			(with_statement)
			(break_statement)
			(continue_statement)
			(return_statement)
			(throw_statement)
			(empty_statement)
			(labeled_statement)
			(method_definition)
			(field_definition)
		] @statement`;
	}
}

class TSStatementTree extends StatementTree {
	static readonly languageIds = new Set(['typescript', 'typescriptreact']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new JSStatementNode(node);
	}

	protected getStatementQueryText(): string {
		// From https://github.com/tree-sitter/tree-sitter-javascript/blob/fdeb68ac8d2bd5a78b943528bb68ceda3aade2eb/grammar.js#L199-L226
		// Because `statement` is declared `inline` in this version of the
		// grammar, we search for each choice from its definition plus two
		// class constructs we want to consider for trimming.
		return `[
			(export_statement)
			(import_statement)
			(debugger_statement)
			(expression_statement)
			(declaration)
			(statement_block)
			(if_statement)
			(switch_statement)
			(for_statement)
			(for_in_statement)
			(while_statement)
			(do_statement)
			(try_statement)
			(with_statement)
			(break_statement)
			(continue_statement)
			(return_statement)
			(throw_statement)
			(empty_statement)
			(labeled_statement)
			(method_definition)
			(public_field_definition)
		] @statement`;
	}
}

/*
 * Python implementation
 */
class PyStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'if_statement',
		'for_statement',
		'while_statement',
		'try_statement',
		'with_statement',
		'function_definition',
		'class_definition',
		'decorated_definition',
		'match_statement',
		'block',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && PyStatementNode.compoundTypeNames.has(this.node.type);
	}

	override childrenFinished() {
		if (this.isSingleLineIfStatement()) { this.collapse(); }
	}

	private isSingleLineIfStatement(): boolean {
		// must be an if statement
		if (this.node.type !== 'if_statement') { return false; }
		// must be a single line
		return this.node.startPosition.row === this.node.endPosition.row;
	}
}

class PyStatementTree extends StatementTree {
	static readonly languageIds = new Set(['python']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new PyStatementNode(node);
	}

	protected getStatementQueryText(): string {
		// Search for nodes of type `_simple_statement` and `_compound_statement`.
		// Because these are both inlined, we search for each choice in the two
		// definitions. It also adds `block` to more closely match the tree
		// shape of JS/TS.
		//
		// For the _simple_statement definition see: https://github.com/tree-sitter/tree-sitter-python/blob/7473026494597de8bc403735b1bfec7ca846c0d6/grammar.js#L90-L106
		// For the _compound_statement definition see: https://github.com/tree-sitter/tree-sitter-python/blob/7473026494597de8bc403735b1bfec7ca846c0d6/grammar.js#L230-L240
		return `[
			(future_import_statement)
			(import_statement)
			(import_from_statement)
			(print_statement)
			(assert_statement)
			(expression_statement)
			(return_statement)
			(delete_statement)
			(raise_statement)
			(pass_statement)
			(break_statement)
			(continue_statement)
			(global_statement)
			(nonlocal_statement)
			(exec_statement)
			(if_statement)
			(for_statement)
			(while_statement)
			(try_statement)
			(with_statement)
			(function_definition)
			(class_definition)
			(decorated_definition)
			(match_statement)
			(block)
		] @statement`;
	}
}

/*
 * Go implementation
 */
class GoStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'function_declaration',
		'method_declaration',
		'if_statement',
		'for_statement',
		'expression_switch_statement',
		'type_switch_statement',
		'select_statement',
		'block',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && GoStatementNode.compoundTypeNames.has(this.node.type);
	}
}

class GoStatementTree extends StatementTree {
	static readonly languageIds = new Set(['go']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new GoStatementNode(node);
	}

	protected getStatementQueryText(): string {
		// Search for nodes of type `_top_level_declaration` and `_statement`.
		// Because `_top_level_declaration` is inlined, we search for each
		// choice in its definition. It also adds `block` to match the tree
		// shape of JS/TS.
		//
		// For the _top_level_declaration definition see: https://github.com/tree-sitter/tree-sitter-go/blob/3c3775faa968158a8b4ac190a7fda867fd5fb748/grammar.js#L117-L122
		return `[
			(package_clause)
			(function_declaration)
			(method_declaration)
			(import_declaration)
			(_statement)
			(block)
		] @statement`;
	}
}

/**
 * Php implementation
 */
class PhpStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'if_statement',
		'else_clause',
		'else_if_clause',
		'for_statement',
		'foreach_statement',
		'while_statement',
		'do_statement',
		'switch_statement',
		'try_statement',
		'catch_clause',
		'finally_clause',
		'anonymous_function',
		'compound_statement',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && PhpStatementNode.compoundTypeNames.has(this.node.type);
	}
}

class PhpStatementTree extends StatementTree {
	static readonly languageIds = new Set(['php']);

	protected override createNode(node: SyntaxNode): StatementNode {
		return new PhpStatementNode(node);
	}
	protected override getStatementQueryText(): string {
		// Search for nodes of type `_statement` and a few other picked types.
		// `compound_statement`, `method_declaration`, `property_declaration`, `const_declaration`, and `use_declaration` are
		// not encompassed by `_statement` so we add them to the query to make multi-line reveal more useful.
		// For the _statement definition see: https://github.com/tree-sitter/tree-sitter-php/blob/eb289f127fc341ae7129902a2dd1c6c197a4c1e7/common/define-grammar.js#L141
		return `[
			(statement)
			(compound_statement)
			(method_declaration)
			(property_declaration)
			(const_declaration)
			(use_declaration)
		] @statement`;
	}
}

/**
 * Ruby implementation
 */

class RubyStatementNode extends StatementNode {
	static compoundTypeNames = new Set(['if', 'case', 'while', 'until', 'for', 'begin', 'module', 'class', 'method']);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && RubyStatementNode.compoundTypeNames.has(this.node.type);
	}
}

class RubyStatementTree extends StatementTree {
	static readonly languageIds = new Set(['ruby']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new RubyStatementNode(node);
	}
	//(if_modifier)
	protected getStatementQueryText(): string {
		return `[
			(_statement)
			(when)
		] @statement`;
	}
}

/*
 * Java implementation
 */

class JavaStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'block',
		'do_statement',
		'enhanced_for_statement',
		'for_statement',
		'if_statement',
		'labeled_statement',
		'switch_expression',
		'synchronized_statement',
		'try_statement',
		'try_with_resources_statement',
		'while_statement',
		'interface_declaration',
		'method_declaration',
		'constructor_declaration',
		'compact_constructor_declaration',
		'class_declaration',
		'annotation_type_declaration',
		'static_initializer',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && JavaStatementNode.compoundTypeNames.has(this.node.type);
	}

	override childrenFinished() {
		// Collapse if_statements on a single line
		if (this.isSingleLineIfStatement()) { this.collapse(); }
	}

	private isSingleLineIfStatement(): boolean {
		// must be an if statement
		if (this.node.type !== 'if_statement') { return false; }
		// must be a single line
		if (this.node.startPosition.row !== this.node.endPosition.row) { return false; }
		// Exclude if statements with braces so that block position is correct:
		// can have a single statement without braces
		if (this.children.length === 1 && this.children[0].node.type !== 'block') { return true; }

		return false;
	}
}

class JavaStatementTree extends StatementTree {
	// Grammar via: https://github.com/tree-sitter/tree-sitter-java/blob/master/src/grammar.json
	// Node types via: https://github.com/tree-sitter/tree-sitter-java/blob/master/src/node-types.json
	static readonly languageIds = new Set(['java']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new JavaStatementNode(node);
	}

	// _class_body_declaration is inlined, so add those subtypes to the query
	protected getStatementQueryText(): string {
		return `[
			(statement)
			(field_declaration)
			(record_declaration)
			(method_declaration)
			(compact_constructor_declaration)
			(class_declaration)
			(interface_declaration)
			(annotation_type_declaration)
			(enum_declaration)
			(block)
			(static_initializer)
			(constructor_declaration)
			] @statement`;
	}
}

/*
 * C# implementation
 */
class CSharpStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'block',
		'checked_statement',
		'class_declaration',
		'constructor_declaration',
		'destructor_declaration',
		'do_statement',
		'fixed_statement',
		'for_statement',
		'foreach_statement',
		'if_statement',
		'interface_declaration',
		'lock_statement',
		'method_declaration',
		'struct_declaration',
		'switch_statement',
		'try_statement',
		'unsafe_statement',
		'while_statement',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && CSharpStatementNode.compoundTypeNames.has(this.node.type);
	}

	override childrenFinished() {
		if (this.isSingleLineIfStatement()) { this.collapse(); }
	}

	private isSingleLineIfStatement(): boolean {
		// must be an if statement
		if (this.node.type !== 'if_statement') { return false; }
		// must be a single line
		if (this.node.startPosition.row !== this.node.endPosition.row) { return false; }
		// Exclude if statements with braces so that block position is correct:
		// can have a single statement without braces
		if (this.children.length === 1 && this.children[0].node.type !== 'block') { return true; }

		return false;
	}
}

class CSharpStatementTree extends StatementTree {
	static readonly languageIds = new Set(['csharp']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new CSharpStatementNode(node);
	}

	protected getStatementQueryText(): string {
		return `[
			(extern_alias_directive)
			(using_directive)
			(global_attribute)
			(preproc_if)
			(namespace_declaration)
			(file_scoped_namespace_declaration)
			(statement)
			(type_declaration)
			(declaration)
			(accessor_declaration)
			(block)
		] @statement`;
	}
}

/*
 * C, C++ implementation
 */

class CStatementNode extends StatementNode {
	static compoundTypeNames = new Set([
		'declaration',
		'function_definition',
		'enum_specifier',
		'field_declaration_list',
		'type_definition',
		'compound_statement',
		'if_statement',
		'switch_statement',
		'while_statement',
		'for_statement',
		'do_statement',
		'preproc_if',
		'preproc_ifdef',

		// C++ specific:
		'namespace_definition',
		'class_specifier',
		'field_declaration_list',
		'concept_definition',
		'template_declaration',
	]);

	get isCompoundStatementType(): boolean {
		return !this.collapsed && CStatementNode.compoundTypeNames.has(this.node.type);
	}

	override childrenFinished() {
		if (this.isSingleLineDeclarationStatement() || this.isSingleLineConceptDefinition()) { this.collapse(); }
	}

	private isSingleLineDeclarationStatement(): boolean {
		// must be an declaration statement
		if (this.node.type !== 'declaration') { return false; }
		// must be a single line
		if (this.node.startPosition.row !== this.node.endPosition.row) { return false; }
		return true;
	}

	private isSingleLineConceptDefinition(): boolean {
		// must be a concept definition
		if (this.node.type !== 'concept_definition') { return false; }
		// must be a single line
		if (this.node.startPosition.row !== this.node.endPosition.row) { return false; }
		return true;
	}
}

class CStatementTree extends StatementTree {
	static readonly languageIds = new Set(['c', 'cpp']);

	protected createNode(node: SyntaxNode): StatementNode {
		return new CStatementNode(node);
	}

	protected getStatementQueryText(): string {
		return `[
			(declaration)
			(function_definition)
			(type_definition)
			(field_declaration)
			(enum_specifier)
			(return_statement)
			(compound_statement)
			(if_statement)
			(expression_statement)
			(switch_statement)
			(break_statement)
			(case_statement)
			(while_statement)
			(for_statement)
			(do_statement)
			(goto_statement)
			(labeled_statement)
			(preproc_if)
			(preproc_def)
			(preproc_ifdef)
			(preproc_include)
			(preproc_call)
			(preproc_function_def)
			(continue_statement)

			;C++ specific:
			(namespace_definition)
			(class_specifier)
			(field_declaration_list)
			(field_declaration)
			(concept_definition)
			(compound_requirement)
			(template_declaration)
			(using_declaration)
			(alias_declaration)
			(static_assert_declaration)
		] @statement`;
	}
}