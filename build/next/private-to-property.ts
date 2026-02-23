/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import { type RawSourceMap, type Mapping, SourceMapConsumer, SourceMapGenerator } from 'source-map';

/**
 * Converts native ES private fields (`#foo`) into regular JavaScript properties with short,
 * globally unique names (e.g., `$a`, `$b`). This achieves two goals:
 *
 * 1. **Performance**: Native private fields are slower than regular properties in V8.
 * 2. **Mangling**: Short replacement names reduce bundle size.
 *
 * ## Why not simply strip `#`?
 *
 * - **Inheritance collision**: If `class B extends A` and both declare `#x`, stripping `#`
 *   yields `x` on both - collision on child instances.
 * - **Public property shadowing**: `class Foo extends Error { static #name = ... }` - stripping
 *   `#` produces `name` which shadows `Error.name`.
 *
 * ## Strategy: Globally unique names with `$` prefix
 *
 * Each (class, privateFieldName) pair gets a unique name from a global counter: `$a`, `$b`, ...
 * This guarantees no inheritance collision and no shadowing of public properties.
 *
 * ## Why this is safe with syntax-only analysis
 *
 * Native `#` fields are **lexically scoped** to their declaring class body. Every declaration
 * and every usage site is syntactically inside the class body. A single AST walk is sufficient
 * to find all sites - no cross-file analysis or type checker needed.
 */

// Short name generator: $a, $b, ..., $z, $A, ..., $Z, $aa, $ab, ...
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateShortName(index: number): string {
	let name = '';
	do {
		name = CHARS[index % CHARS.length] + name;
		index = Math.floor(index / CHARS.length) - 1;
	} while (index >= 0);
	return '$' + name;
}

interface Edit {
	start: number;
	end: number;
	newText: string;
}

// Private name → replacement name per class (identified by position in file)
type ClassScope = Map<string, string>;

export interface TextEdit {
	readonly start: number;
	readonly end: number;
	readonly newText: string;
}

export interface ConvertPrivateFieldsResult {
	readonly code: string;
	readonly classCount: number;
	readonly fieldCount: number;
	readonly editCount: number;
	readonly elapsed: number;
	/** Sorted edits applied to the original code, for source map adjustment. */
	readonly edits: readonly TextEdit[];
}

/**
 * Converts all native `#` private fields/methods in the given JavaScript source to regular
 * properties with short, globally unique names.
 *
 * @param code The JavaScript source code (typically a bundled output file).
 * @param filename Used for TypeScript parser diagnostics only.
 * @returns The transformed source code with `#` fields replaced, plus stats.
 */
export function convertPrivateFields(code: string, filename: string): ConvertPrivateFieldsResult {
	const t1 = Date.now();
	// Quick bail-out: if there are no `#` characters, nothing to do
	if (!code.includes('#')) {
		return { code, classCount: 0, fieldCount: 0, editCount: 0, elapsed: Date.now() - t1, edits: [] };
	}

	const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, false, ts.ScriptKind.JS);

	// Global counter for unique name generation
	let nameCounter = 0;
	let classCount = 0;

	// Collect all edits
	const edits: Edit[] = [];

	// Class stack for resolving private names in nested classes.
	// When a PrivateIdentifier is encountered, we search from innermost to outermost
	// class scope - matching JS lexical resolution semantics.
	const classStack: ClassScope[] = [];

	visit(sourceFile);

	if (edits.length === 0) {
		return { code, classCount: 0, fieldCount: 0, editCount: 0, elapsed: Date.now() - t1, edits: [] };
	}

	// Apply edits using substring concatenation (O(N+K), not O(N*K) like char-array splice)
	edits.sort((a, b) => a.start - b.start);
	const parts: string[] = [];
	let lastEnd = 0;
	for (const edit of edits) {
		parts.push(code.substring(lastEnd, edit.start));
		parts.push(edit.newText);
		lastEnd = edit.end;
	}
	parts.push(code.substring(lastEnd));
	return { code: parts.join(''), classCount, fieldCount: nameCounter, editCount: edits.length, elapsed: Date.now() - t1, edits };

	// --- AST walking ---

	function visit(node: ts.Node): void {
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
			visitClass(node);
			return;
		}
		ts.forEachChild(node, visit);
	}

	function visitClass(node: ts.ClassDeclaration | ts.ClassExpression): void {
		// 1) Collect all private field/method/accessor declarations in THIS class
		const scope: ClassScope = new Map();
		for (const member of node.members) {
			if (member.name && ts.isPrivateIdentifier(member.name)) {
				const name = member.name.text;
				if (!scope.has(name)) {
					scope.set(name, generateShortName(nameCounter++));
				}
			}
		}

		if (scope.size > 0) {
			classCount++;
		}
		classStack.push(scope);

		// 2) Walk the class body, replacing PrivateIdentifier nodes
		ts.forEachChild(node, function walkInClass(child: ts.Node): void {
			// Nested class: process independently with its own scope
			if ((ts.isClassDeclaration(child) || ts.isClassExpression(child)) && child !== node) {
				visitClass(child);
				return;
			}

			// Handle `#field in expr` (ergonomic brand check) - needs string literal replacement
			if (ts.isBinaryExpression(child) &&
				child.operatorToken.kind === ts.SyntaxKind.InKeyword &&
				ts.isPrivateIdentifier(child.left)) {
				const resolved = resolvePrivateName(child.left.text);
				if (resolved !== undefined) {
					edits.push({
						start: child.left.getStart(sourceFile),
						end: child.left.getEnd(),
						newText: `'${resolved}'`
					});
				}
				// Still need to walk the right-hand side for any private field usages
				ts.forEachChild(child.right, walkInClass);
				return;
			}

			// Normal PrivateIdentifier usage (declaration, property access, method call)
			if (ts.isPrivateIdentifier(child)) {
				const resolved = resolvePrivateName(child.text);
				if (resolved !== undefined) {
					edits.push({
						start: child.getStart(sourceFile),
						end: child.getEnd(),
						newText: resolved
					});
				}
				return;
			}

			ts.forEachChild(child, walkInClass);
		});

		classStack.pop();
	}

	function resolvePrivateName(name: string): string | undefined {
		// Walk from innermost to outermost class scope (matches JS lexical resolution)
		for (let i = classStack.length - 1; i >= 0; i--) {
			const resolved = classStack[i].get(name);
			if (resolved !== undefined) {
				return resolved;
			}
		}
		return undefined;
	}
}

/**
 * Adjusts a source map to account for text edits applied to the generated JS.
 *
 * Each edit replaced a span `[start, end)` in the original generated JS with `newText`.
 * This shifts all subsequent columns on the same line. The source map's generated
 * columns are updated so they still point to the correct original positions.
 *
 * @param sourceMapJson The parsed source map JSON object.
 * @param originalCode The original generated JS (before edits were applied).
 * @param edits The sorted edits that were applied.
 * @returns A new source map JSON object with adjusted generated columns.
 */
export function adjustSourceMap(
	sourceMapJson: RawSourceMap,
	originalCode: string,
	edits: readonly TextEdit[]
): RawSourceMap {
	if (edits.length === 0) {
		return sourceMapJson;
	}

	// Build a line-offset table for the original code to convert byte offsets to line/column
	const lineStarts: number[] = [0];
	for (let i = 0; i < originalCode.length; i++) {
		if (originalCode.charCodeAt(i) === 10 /* \n */) {
			lineStarts.push(i + 1);
		}
	}

	function offsetToLineCol(offset: number): { line: number; col: number } {
		let lo = 0, hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= offset) {
				lo = mid;
			} else {
				hi = mid - 1;
			}
		}
		return { line: lo, col: offset - lineStarts[lo] };
	}

	// Convert edits from byte offsets to per-line column shifts
	interface LineEdit { col: number; origLen: number; newLen: number }
	const editsByLine = new Map<number, LineEdit[]>();
	for (const edit of edits) {
		const pos = offsetToLineCol(edit.start);
		const origLen = edit.end - edit.start;
		let arr = editsByLine.get(pos.line);
		if (!arr) {
			arr = [];
			editsByLine.set(pos.line, arr);
		}
		arr.push({ col: pos.col, origLen, newLen: edit.newText.length });
	}

	// Use source-map library to read, adjust, and write
	const consumer = new SourceMapConsumer(sourceMapJson);
	const generator = new SourceMapGenerator({ file: sourceMapJson.file });

	// Copy sourcesContent
	for (let i = 0; i < sourceMapJson.sources.length; i++) {
		const content = sourceMapJson.sourcesContent?.[i];
		if (content !== null && content !== undefined) {
			generator.setSourceContent(sourceMapJson.sources[i], content);
		}
	}

	// Walk every mapping, adjust the generated column, and add to the new generator
	consumer.eachMapping(mapping => {
		const lineEdits = editsByLine.get(mapping.generatedLine - 1); // 0-based for our data
		const adjustedCol = adjustColumn(mapping.generatedColumn, lineEdits);

		// Some mappings may be unmapped (no original position/source) - skip those.
		if (mapping.source !== null && mapping.originalLine !== null && mapping.originalColumn !== null) {
			const newMapping: Mapping = {
				generated: { line: mapping.generatedLine, column: adjustedCol },
				original: { line: mapping.originalLine, column: mapping.originalColumn },
				source: mapping.source,
			};
			if (mapping.name !== null) {
				newMapping.name = mapping.name;
			}
			generator.addMapping(newMapping);
		}
	});

	return JSON.parse(generator.toString());
}

function adjustColumn(col: number, lineEdits: { col: number; origLen: number; newLen: number }[] | undefined): number {
	if (!lineEdits) {
		return col;
	}
	let shift = 0;
	for (const edit of lineEdits) {
		if (edit.col + edit.origLen <= col) {
			shift += edit.newLen - edit.origLen;
		} else if (edit.col < col) {
			return edit.col + shift;
		} else {
			break;
		}
	}
	return col + shift;
}
