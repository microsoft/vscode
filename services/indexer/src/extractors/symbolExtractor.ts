// Son of Anton — Symbol Extractor
// Extracts functions, classes, types, imports, and exports from Tree-sitter ASTs.

import Parser from 'tree-sitter';
import crypto from 'crypto';

// ============================================================================
// Extracted symbol types
// ============================================================================

export interface ExtractedFunction {
	kind: 'function';
	name: string;
	qualifiedName: string;
	startLine: number;
	endLine: number;
	async: boolean;
	exported: boolean;
	isMethod: boolean;
	isStatic: boolean;
	isConstructor: boolean;
	signature: string;
	parameters: ParameterInfo[];
	returnType: string | null;
	contentHash: string;
	body: string;
}

export interface ParameterInfo {
	name: string;
	type: string | null;
	position: number;
}

export interface ExtractedClass {
	kind: 'class';
	name: string;
	startLine: number;
	endLine: number;
	abstract: boolean;
	exported: boolean;
	extends: string | null;
	implements: string[];
	methods: ExtractedFunction[];
	contentHash: string;
	body: string;
}

export interface ExtractedType {
	kind: 'type';
	name: string;
	typeKind: 'interface' | 'type' | 'enum';
	startLine: number;
	endLine: number;
	exported: boolean;
	contentHash: string;
	body: string;
}

export interface ExtractedImport {
	kind: 'import';
	source: string;
	specifiers: string[];
	isDefault: boolean;
	isNamespace: boolean;
	line: number;
}

export interface ExtractedExport {
	symbolName: string;
	isDefault: boolean;
}

export interface CallSite {
	callerName: string;
	calledName: string;
	line: number;
	column: number;
}

export interface FileExtractionResult {
	functions: ExtractedFunction[];
	classes: ExtractedClass[];
	types: ExtractedType[];
	imports: ExtractedImport[];
	exports: ExtractedExport[];
	callSites: CallSite[];
}

// ============================================================================
// Extractor
// ============================================================================

export class SymbolExtractor {

	/**
	 * Extract all symbols from a parsed AST.
	 */
	extract(tree: Parser.Tree, source: string, language: string): FileExtractionResult {
		switch (language) {
			case 'typescript':
			case 'tsx':
			case 'javascript':
				return this.extractTypeScript(tree, source);
			case 'python':
				return this.extractPython(tree, source);
			default:
				return this.extractGeneric(tree, source);
		}
	}

	// ========================================================================
	// TypeScript / JavaScript extraction
	// ========================================================================

	private extractTypeScript(tree: Parser.Tree, source: string): FileExtractionResult {
		const result: FileExtractionResult = {
			functions: [],
			classes: [],
			types: [],
			imports: [],
			exports: [],
			callSites: [],
		};

		const root = tree.rootNode;
		this.walkTypeScriptNode(root, source, result, false, null);

		return result;
	}

	private walkTypeScriptNode(
		node: Parser.SyntaxNode,
		source: string,
		result: FileExtractionResult,
		isExported: boolean,
		parentClassName: string | null
	): void {
		for (const child of node.children) {
			switch (child.type) {
				case 'export_statement': {
					// The child of an export_statement is the actual declaration
					const declaration = child.namedChildren.find(c =>
						c.type === 'function_declaration' ||
						c.type === 'class_declaration' ||
						c.type === 'interface_declaration' ||
						c.type === 'type_alias_declaration' ||
						c.type === 'enum_declaration' ||
						c.type === 'lexical_declaration'
					);
					if (declaration) {
						this.walkTypeScriptNode(
							child, source, result, true, parentClassName
						);
					} else {
						// export { ... } or export default
						this.extractTSExportClause(child, result);
					}
					break;
				}

				case 'function_declaration': {
					const fn = this.extractTSFunction(child, source, isExported, parentClassName);
					if (fn) {
						result.functions.push(fn);
						if (isExported) {
							result.exports.push({ symbolName: fn.name, isDefault: false });
						}
					}
					break;
				}

				case 'class_declaration': {
					const cls = this.extractTSClass(child, source, isExported);
					if (cls) {
						result.classes.push(cls);
						if (isExported) {
							result.exports.push({ symbolName: cls.name, isDefault: false });
						}
					}
					break;
				}

				case 'interface_declaration': {
					const iface = this.extractTSType(child, source, 'interface', isExported);
					if (iface) {
						result.types.push(iface);
						if (isExported) {
							result.exports.push({ symbolName: iface.name, isDefault: false });
						}
					}
					break;
				}

				case 'type_alias_declaration': {
					const typeAlias = this.extractTSType(child, source, 'type', isExported);
					if (typeAlias) {
						result.types.push(typeAlias);
						if (isExported) {
							result.exports.push({ symbolName: typeAlias.name, isDefault: false });
						}
					}
					break;
				}

				case 'enum_declaration': {
					const enumType = this.extractTSType(child, source, 'enum', isExported);
					if (enumType) {
						result.types.push(enumType);
						if (isExported) {
							result.exports.push({ symbolName: enumType.name, isDefault: false });
						}
					}
					break;
				}

				case 'import_statement': {
					const imp = this.extractTSImport(child);
					if (imp) {
						result.imports.push(imp);
					}
					break;
				}

				case 'lexical_declaration': {
					// Handle: export const foo = () => { ... }
					const arrowFn = this.extractTSArrowFunction(child, source, isExported);
					if (arrowFn) {
						result.functions.push(arrowFn);
						if (isExported) {
							result.exports.push({ symbolName: arrowFn.name, isDefault: false });
						}
					}
					break;
				}

				case 'call_expression': {
					const callSite = this.extractTSCallSite(child);
					if (callSite) {
						result.callSites.push(callSite);
					}
					break;
				}

				default:
					// Recurse into child nodes to find nested declarations
					if (child.namedChildCount > 0) {
						this.walkTypeScriptNode(child, source, result, isExported, parentClassName);
					}
					break;
			}
		}
	}

	private extractTSFunction(
		node: Parser.SyntaxNode,
		source: string,
		exported: boolean,
		parentClassName: string | null
	): ExtractedFunction | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const name = nameNode.text;
		const body = this.getNodeText(node, source);
		const params = this.extractTSParameters(node);
		const returnType = this.extractTSReturnType(node);
		const isAsync = node.children.some(c => c.type === 'async');

		return {
			kind: 'function',
			name,
			qualifiedName: parentClassName ? `${parentClassName}.${name}` : name,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			async: isAsync,
			exported,
			isMethod: parentClassName !== null,
			isStatic: false,
			isConstructor: name === 'constructor',
			signature: this.buildSignature(name, params, returnType, isAsync),
			parameters: params,
			returnType,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractTSClass(
		node: Parser.SyntaxNode,
		source: string,
		exported: boolean
	): ExtractedClass | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const name = nameNode.text;
		const body = this.getNodeText(node, source);
		const isAbstract = node.children.some(c => c.text === 'abstract');

		// Extract extends
		let extendsName: string | null = null;
		const heritage = node.children.find(c => c.type === 'class_heritage');
		if (heritage) {
			const extendsClause = heritage.children.find(c => c.type === 'extends_clause');
			if (extendsClause) {
				const extendsType = extendsClause.namedChildren[0];
				if (extendsType) {
					extendsName = extendsType.text;
				}
			}
		}

		// Extract implements
		const implementsList: string[] = [];
		if (heritage) {
			const implementsClause = heritage.children.find(c => c.type === 'implements_clause');
			if (implementsClause) {
				for (const child of implementsClause.namedChildren) {
					implementsList.push(child.text);
				}
			}
		}

		// Extract methods
		const methods: ExtractedFunction[] = [];
		const classBody = node.childForFieldName('body');
		if (classBody) {
			for (const member of classBody.namedChildren) {
				if (member.type === 'method_definition' || member.type === 'public_field_definition') {
					const method = this.extractTSMethod(member, source, name);
					if (method) {
						methods.push(method);
					}
				}
			}
		}

		return {
			kind: 'class',
			name,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			abstract: isAbstract,
			exported,
			extends: extendsName,
			implements: implementsList,
			methods,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractTSMethod(
		node: Parser.SyntaxNode,
		source: string,
		className: string
	): ExtractedFunction | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const name = nameNode.text;
		const body = this.getNodeText(node, source);
		const params = this.extractTSParameters(node);
		const returnType = this.extractTSReturnType(node);
		const isAsync = node.children.some(c => c.type === 'async');
		const isStatic = node.children.some(c => c.text === 'static');

		return {
			kind: 'function',
			name,
			qualifiedName: `${className}.${name}`,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			async: isAsync,
			exported: false,
			isMethod: true,
			isStatic,
			isConstructor: name === 'constructor',
			signature: this.buildSignature(name, params, returnType, isAsync),
			parameters: params,
			returnType,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractTSType(
		node: Parser.SyntaxNode,
		source: string,
		typeKind: 'interface' | 'type' | 'enum',
		exported: boolean
	): ExtractedType | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const body = this.getNodeText(node, source);

		return {
			kind: 'type',
			name: nameNode.text,
			typeKind,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			exported,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractTSImport(node: Parser.SyntaxNode): ExtractedImport | null {
		const sourceNode = node.childForFieldName('source');
		if (!sourceNode) {
			return null;
		}

		// Remove quotes from the source string
		const source = sourceNode.text.replace(/['"]/g, '');
		const specifiers: string[] = [];
		let isDefault = false;
		let isNamespace = false;

		for (const child of node.namedChildren) {
			if (child.type === 'import_clause') {
				for (const specChild of child.namedChildren) {
					if (specChild.type === 'identifier') {
						specifiers.push(specChild.text);
						isDefault = true;
					} else if (specChild.type === 'named_imports') {
						for (const importSpec of specChild.namedChildren) {
							if (importSpec.type === 'import_specifier') {
								const nameNode = importSpec.childForFieldName('name');
								if (nameNode) {
									specifiers.push(nameNode.text);
								}
							}
						}
					} else if (specChild.type === 'namespace_import') {
						const nameNode = specChild.namedChildren[0];
						if (nameNode) {
							specifiers.push(nameNode.text);
						}
						isNamespace = true;
					}
				}
			}
		}

		return {
			kind: 'import',
			source,
			specifiers,
			isDefault,
			isNamespace,
			line: node.startPosition.row + 1,
		};
	}

	private extractTSArrowFunction(
		node: Parser.SyntaxNode,
		source: string,
		exported: boolean
	): ExtractedFunction | null {
		// Look for: const name = (...) => { ... }
		for (const declarator of node.namedChildren) {
			if (declarator.type === 'variable_declarator') {
				const nameNode = declarator.childForFieldName('name');
				const valueNode = declarator.childForFieldName('value');

				if (nameNode && valueNode && valueNode.type === 'arrow_function') {
					const name = nameNode.text;
					const body = this.getNodeText(node, source);
					const params = this.extractTSParameters(valueNode);
					const returnType = this.extractTSReturnType(valueNode);
					const isAsync = valueNode.children.some(c => c.type === 'async');

					return {
						kind: 'function',
						name,
						qualifiedName: name,
						startLine: node.startPosition.row + 1,
						endLine: node.endPosition.row + 1,
						async: isAsync,
						exported,
						isMethod: false,
						isStatic: false,
						isConstructor: false,
						signature: this.buildSignature(name, params, returnType, isAsync),
						parameters: params,
						returnType,
						contentHash: this.hashContent(body),
						body,
					};
				}
			}
		}
		return null;
	}

	private extractTSExportClause(
		node: Parser.SyntaxNode,
		result: FileExtractionResult
	): void {
		for (const child of node.namedChildren) {
			if (child.type === 'export_clause') {
				for (const specifier of child.namedChildren) {
					if (specifier.type === 'export_specifier') {
						const nameNode = specifier.childForFieldName('name');
						if (nameNode) {
							result.exports.push({
								symbolName: nameNode.text,
								isDefault: false,
							});
						}
					}
				}
			}
		}
	}

	private extractTSCallSite(node: Parser.SyntaxNode): CallSite | null {
		const functionNode = node.childForFieldName('function');
		if (!functionNode) {
			return null;
		}

		let calledName: string;
		if (functionNode.type === 'member_expression') {
			const property = functionNode.childForFieldName('property');
			calledName = property ? property.text : functionNode.text;
		} else if (functionNode.type === 'identifier') {
			calledName = functionNode.text;
		} else {
			return null;
		}

		return {
			callerName: '', // Resolved later by the caller context
			calledName,
			line: node.startPosition.row + 1,
			column: node.startPosition.column,
		};
	}

	private extractTSParameters(node: Parser.SyntaxNode): ParameterInfo[] {
		const params: ParameterInfo[] = [];
		const paramsNode = node.childForFieldName('parameters');
		if (!paramsNode) {
			return params;
		}

		let position = 0;
		for (const param of paramsNode.namedChildren) {
			if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
				const nameNode = param.childForFieldName('pattern') ?? param.childForFieldName('name');
				const typeNode = param.childForFieldName('type');
				params.push({
					name: nameNode ? nameNode.text : `arg${position}`,
					type: typeNode ? typeNode.text : null,
					position,
				});
				position++;
			}
		}

		return params;
	}

	private extractTSReturnType(node: Parser.SyntaxNode): string | null {
		const returnTypeNode = node.childForFieldName('return_type');
		if (returnTypeNode) {
			// Strip the leading ': ' from type annotations
			const text = returnTypeNode.text;
			return text.startsWith(':') ? text.substring(1).trim() : text;
		}
		return null;
	}

	// ========================================================================
	// Python extraction
	// ========================================================================

	private extractPython(tree: Parser.Tree, source: string): FileExtractionResult {
		const result: FileExtractionResult = {
			functions: [],
			classes: [],
			types: [],
			imports: [],
			exports: [],
			callSites: [],
		};

		const root = tree.rootNode;
		this.walkPythonNode(root, source, result, null);

		return result;
	}

	private walkPythonNode(
		node: Parser.SyntaxNode,
		source: string,
		result: FileExtractionResult,
		parentClassName: string | null
	): void {
		for (const child of node.children) {
			switch (child.type) {
				case 'function_definition': {
					const fn = this.extractPythonFunction(child, source, parentClassName);
					if (fn) {
						result.functions.push(fn);
					}
					break;
				}

				case 'class_definition': {
					const cls = this.extractPythonClass(child, source);
					if (cls) {
						result.classes.push(cls);
					}
					break;
				}

				case 'import_statement':
				case 'import_from_statement': {
					const imp = this.extractPythonImport(child);
					if (imp) {
						result.imports.push(imp);
					}
					break;
				}

				default:
					if (child.namedChildCount > 0) {
						this.walkPythonNode(child, source, result, parentClassName);
					}
					break;
			}
		}
	}

	private extractPythonFunction(
		node: Parser.SyntaxNode,
		source: string,
		parentClassName: string | null
	): ExtractedFunction | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const name = nameNode.text;
		const body = this.getNodeText(node, source);
		const isAsync = node.type === 'async_function_definition' ||
			node.parent?.type === 'async_function_definition';
		const params = this.extractPythonParameters(node);
		const returnType = this.extractPythonReturnType(node);

		return {
			kind: 'function',
			name,
			qualifiedName: parentClassName ? `${parentClassName}.${name}` : name,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			async: isAsync,
			exported: !name.startsWith('_'),
			isMethod: parentClassName !== null,
			isStatic: false,
			isConstructor: name === '__init__',
			signature: this.buildSignature(name, params, returnType, isAsync),
			parameters: params,
			returnType,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractPythonClass(
		node: Parser.SyntaxNode,
		source: string
	): ExtractedClass | null {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return null;
		}

		const name = nameNode.text;
		const body = this.getNodeText(node, source);

		// Extract base classes
		let extendsName: string | null = null;
		const implementsList: string[] = [];
		const superclasses = node.childForFieldName('superclasses');
		if (superclasses) {
			for (let i = 0; i < superclasses.namedChildCount; i++) {
				const base = superclasses.namedChildren[i];
				if (i === 0) {
					extendsName = base.text;
				} else {
					implementsList.push(base.text);
				}
			}
		}

		// Extract methods
		const methods: ExtractedFunction[] = [];
		const classBody = node.childForFieldName('body');
		if (classBody) {
			for (const member of classBody.namedChildren) {
				if (member.type === 'function_definition') {
					const method = this.extractPythonFunction(member, source, name);
					if (method) {
						methods.push(method);
					}
				}
			}
		}

		return {
			kind: 'class',
			name,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			abstract: false,
			exported: !name.startsWith('_'),
			extends: extendsName,
			implements: implementsList,
			methods,
			contentHash: this.hashContent(body),
			body,
		};
	}

	private extractPythonImport(node: Parser.SyntaxNode): ExtractedImport | null {
		if (node.type === 'import_statement') {
			const nameNode = node.namedChildren[0];
			if (nameNode) {
				return {
					kind: 'import',
					source: nameNode.text,
					specifiers: [nameNode.text],
					isDefault: false,
					isNamespace: true,
					line: node.startPosition.row + 1,
				};
			}
		}

		if (node.type === 'import_from_statement') {
			const moduleNode = node.childForFieldName('module_name');
			const source = moduleNode ? moduleNode.text : '';
			const specifiers: string[] = [];

			for (const child of node.namedChildren) {
				if (child.type === 'dotted_name' && child !== moduleNode) {
					specifiers.push(child.text);
				} else if (child.type === 'aliased_import') {
					const nameNode = child.childForFieldName('name');
					if (nameNode) {
						specifiers.push(nameNode.text);
					}
				}
			}

			return {
				kind: 'import',
				source,
				specifiers,
				isDefault: false,
				isNamespace: false,
				line: node.startPosition.row + 1,
			};
		}

		return null;
	}

	private extractPythonParameters(node: Parser.SyntaxNode): ParameterInfo[] {
		const params: ParameterInfo[] = [];
		const paramsNode = node.childForFieldName('parameters');
		if (!paramsNode) {
			return params;
		}

		let position = 0;
		for (const param of paramsNode.namedChildren) {
			if (param.type === 'identifier') {
				params.push({ name: param.text, type: null, position });
				position++;
			} else if (param.type === 'typed_parameter') {
				const nameNode = param.namedChildren[0];
				const typeNode = param.childForFieldName('type');
				params.push({
					name: nameNode ? nameNode.text : `arg${position}`,
					type: typeNode ? typeNode.text : null,
					position,
				});
				position++;
			}
		}

		return params;
	}

	private extractPythonReturnType(node: Parser.SyntaxNode): string | null {
		const returnType = node.childForFieldName('return_type');
		if (returnType) {
			return returnType.text;
		}
		return null;
	}

	// ========================================================================
	// Generic extraction (fallback for unsupported languages)
	// ========================================================================

	private extractGeneric(tree: Parser.Tree, source: string): FileExtractionResult {
		// For languages without specific extractors, return minimal results
		return {
			functions: [],
			classes: [],
			types: [],
			imports: [],
			exports: [],
			callSites: [],
		};
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private getNodeText(node: Parser.SyntaxNode, _source: string): string {
		return node.text;
	}

	private hashContent(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex');
	}

	private buildSignature(
		name: string,
		params: ParameterInfo[],
		returnType: string | null,
		isAsync: boolean
	): string {
		const paramStr = params
			.map(p => p.type ? `${p.name}: ${p.type}` : p.name)
			.join(', ');
		const retStr = returnType ? `: ${returnType}` : '';
		const asyncPrefix = isAsync ? 'async ' : '';
		return `${asyncPrefix}${name}(${paramStr})${retStr}`;
	}
}
