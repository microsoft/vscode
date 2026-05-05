/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import { type RawSourceMap } from 'source-map';

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
	let fieldCount = 0;
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
	return { code: parts.join(''), classCount, fieldCount: fieldCount, editCount: edits.length, elapsed: Date.now() - t1, edits };

	// --- AST walking ---

	function visit(node: ts.Node): void {
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
			visitClass(node);
			return;
		}
		ts.forEachChild(node, visit);
	}

	function visitClass(node: ts.ClassDeclaration | ts.ClassExpression): void {
		// 1) Collect public member names so generated names don't collide
		const publicNames = new Set<string>();
		for (const member of node.members) {
			if (!member.name) {
				continue;
			}
			if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
				publicNames.add(member.name.text);
				continue;
			}
			if (ts.isComputedPropertyName(member.name) && ts.isStringLiteral(member.name.expression)) {
				publicNames.add(member.name.expression.text);
			}
		}

		// 2) Collect all private field/method/accessor declarations in THIS class,
		//    skipping generated names that collide with existing public members.
		const scope: ClassScope = new Map();
		for (const member of node.members) {
			if (member.name && ts.isPrivateIdentifier(member.name)) {
				const name = member.name.text;
				if (!scope.has(name)) {
					let shortName: string;
					do {
						shortName = generateShortName(nameCounter++);
					} while (publicNames.has(shortName));
					scope.set(name, shortName);
					fieldCount++;
				}
			}
		}

		if (scope.size > 0) {
			classCount++;
		}

		// 3) Walk heritage clauses BEFORE pushing this class's scope.
		//    The `extends` expression is evaluated in the enclosing lexical scope,
		//    so any private-field references there belong to an outer class.
		const walkInClass = createWalkInClass(node);
		for (const clause of node.heritageClauses ?? []) {
			ts.forEachChild(clause, walkInClass);
		}

		// 4) Now push the scope and walk the class members
		classStack.push(scope);
		for (const member of node.members) {
			ts.forEachChild(member, walkInClass);
		}
		classStack.pop();
	}

	function createWalkInClass(classNode: ts.ClassDeclaration | ts.ClassExpression) {
		return function walkInClass(child: ts.Node): void {
			// Nested class: process independently with its own scope
			if ((ts.isClassDeclaration(child) || ts.isClassExpression(child)) && child !== classNode) {
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
					const start = child.getStart(sourceFile);
					edits.push({
						start,
						end: child.getEnd(),
						// In minified code, `async#run()` has no space before `#`.
						// The `#` naturally starts a new token, but `$` does not —
						// `async$a` would fuse into one identifier. Insert a space
						// when the preceding character is an identifier character.
						newText: (start > 0 && isIdentifierChar(code.charCodeAt(start - 1))) ? ' ' + resolved : resolved
					});
				}
				return;
			}

			ts.forEachChild(child, walkInClass);
		};
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

function isIdentifierChar(ch: number): boolean {
	// a-z, A-Z, 0-9, _, $
	return (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90) || (ch >= 48 && ch <= 57) || ch === 95 || ch === 36;
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
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const charToInteger = new Int8Array(128);
charToInteger.fill(-1);
for (let i = 0; i < chars.length; i++) { charToInteger[chars.charCodeAt(i)] = i; }

interface AbsoluteSegment {
	genCol: number;
	source?: number;
	origLine?: number;
	origCol?: number;
	name?: number;
}

interface OrderedSegment extends AbsoluteSegment {
	order: number;
}

function readBase64Digit(str: string, index: number): number {
	if (index >= str.length) {
		throw new Error(`Malformed source map mappings: unexpected end of VLQ segment at offset ${index}`);
	}
	const charCode = str.charCodeAt(index);
	const digit = charCode < charToInteger.length ? charToInteger[charCode] : -1;
	if (digit < 0) {
		throw new Error(`Malformed source map mappings: invalid base64 digit at offset ${index}`);
	}
	return digit;
}

function decodeMappings(str: string): AbsoluteSegment[][] {
	let index = 0;
	const len = str.length;
	let prevGenCol = 0, prevSource = 0, prevOrigLine = 0, prevOrigCol = 0, prevName = 0;
	const lines: AbsoluteSegment[][] = [];
	let currentLine: AbsoluteSegment[] = [];
	lines.push(currentLine);
	while (index < len) {
		const char = str.charCodeAt(index);
		if (char === 59) {
			prevGenCol = 0;
			currentLine = [];
			lines.push(currentLine);
			index++;
			continue;
		}
		if (char === 44) {
			index++;
			continue;
		}
		const segment: number[] = [];
		for (let i = 0; i < 5; i++) {
			if (index >= len) { break; }
			const c = str.charCodeAt(index);
			if (c === 59 || c === 44) { break; }
			let result = 0, shift = 0, continuation = false;
			do {
				const digit = readBase64Digit(str, index++);
				continuation = (digit & 32) !== 0;
				result += (digit & 31) << shift;
				shift += 5;
			} while (continuation);
			const isNegative = (result & 1) === 1;
			result >>= 1;
			segment.push(isNegative ? -result : result);
		}
		if (segment.length !== 1 && segment.length !== 4 && segment.length !== 5) {
			throw new Error(`Malformed source map mappings: invalid segment length ${segment.length} at offset ${index}`);
		}
		prevGenCol += segment[0];
		const absolute: AbsoluteSegment = { genCol: prevGenCol };
		if (segment.length > 1) {
			prevSource += segment[1];
			prevOrigLine += segment[2];
			prevOrigCol += segment[3];
			absolute.source = prevSource;
			absolute.origLine = prevOrigLine;
			absolute.origCol = prevOrigCol;
			if (segment.length > 4) {
				prevName += segment[4];
				absolute.name = prevName;
			}
		}
		currentLine.push(absolute);
	}
	return lines;
}

function encodeMappings(lines: AbsoluteSegment[][]): string {
	const resultLines: string[] = [];
	let prevSource = 0, prevOrigLine = 0, prevOrigCol = 0, prevName = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.length === 0) {
			resultLines.push('');
			continue;
		}
		let result = '';
		let prevGenCol = 0;
		for (let j = 0; j < line.length; j++) {
			if (j > 0) { result += ','; }
			const seg = line[j];
			const encodeVLQ = (num: number) => {
				let vlq = num < 0 ? ((-num) << 1) | 1 : (num << 1);
				do {
					let digit = vlq & 31;
					vlq >>= 5;
					if (vlq > 0) { digit |= 32; }
					result += chars[digit];
				} while (vlq > 0);
			};
			encodeVLQ(seg.genCol - prevGenCol);
			prevGenCol = seg.genCol;
			if (seg.source !== undefined && seg.origLine !== undefined && seg.origCol !== undefined) {
				encodeVLQ(seg.source - prevSource);
				prevSource = seg.source;
				encodeVLQ(seg.origLine - prevOrigLine);
				prevOrigLine = seg.origLine;
				encodeVLQ(seg.origCol - prevOrigCol);
				prevOrigCol = seg.origCol;
				if (seg.name !== undefined) {
					encodeVLQ(seg.name - prevName);
					prevName = seg.name;
				}
			}
		}
		resultLines.push(result);
	}
	return resultLines.join(';');
}

export function adjustSourceMap(
	sourceMapJson: RawSourceMap,
	originalCode: string,
	edits: readonly TextEdit[]
): RawSourceMap {
	if (edits.length === 0) {
		return sourceMapJson;
	}

	// Build line-offset tables for the original code and the code after edits.
	// When edits span newlines (e.g. NLS replacing a multi-line template literal
	// with `null`), subsequent lines shift up and columns change. We handle this
	// by converting each mapping's old generated (line, col) to a byte offset,
	// adjusting the offset for the edits, then converting back to (line, col) in
	// the post-edit coordinate system.

	const oldLineStarts = buildLineStarts(originalCode);
	const newLineStarts = buildLineStartsAfterEdits(originalCode, edits);

	// Precompute cumulative byte-shift after each edit for binary search
	const n = edits.length;
	const editStarts: number[] = new Array(n);
	const editEnds: number[] = new Array(n);
	const cumShifts: number[] = new Array(n); // cumulative shift *after* edit[i]
	let cumShift = 0;
	for (let i = 0; i < n; i++) {
		editStarts[i] = edits[i].start;
		editEnds[i] = edits[i].end;
		cumShift += edits[i].newText.length - (edits[i].end - edits[i].start);
		cumShifts[i] = cumShift;
	}

	function adjustOffset(oldOff: number): number {
		// Binary search: find last edit with start <= oldOff
		let lo = 0, hi = n - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (editStarts[mid] <= oldOff) {
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		// hi = index of last edit where start <= oldOff, or -1 if none
		if (hi < 0) {
			return oldOff;
		}
		if (oldOff < editEnds[hi]) {
			// Inside edit range — clamp to edit start in new coordinates
			const prevShift = hi > 0 ? cumShifts[hi - 1] : 0;
			return editStarts[hi] + prevShift;
		}
		return oldOff + cumShifts[hi];
	}

	function offsetToLineCol(lineStarts: readonly number[], offset: number): { line: number; col: number } {
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

	// Use custom string encoder instead of source map consumer
	const oldLines = decodeMappings(sourceMapJson.mappings);
	const newLines: OrderedSegment[][] = [];
	let order = 0;

	for (let oldLineIdx = 0; oldLineIdx < oldLines.length; oldLineIdx++) {
		const lineSegments = oldLines[oldLineIdx];
		const oldLineStart = oldLineIdx < oldLineStarts.length ? oldLineStarts[oldLineIdx] : oldLineStarts[oldLineStarts.length - 1];

		for (const seg of lineSegments) {
			const oldOff = oldLineStart + seg.genCol;
			const newOff = adjustOffset(oldOff);
			const newPos = offsetToLineCol(newLineStarts, newOff);

			while (newLines.length <= newPos.line) {
				newLines.push([]);
			}
			newLines[newPos.line].push({
				genCol: newPos.col,
				source: seg.source,
				origLine: seg.origLine,
				origCol: seg.origCol,
				name: seg.name,
				order: order++
			});
		}
	}

	for (const line of newLines) {
		line.sort((a, b) => a.genCol - b.genCol || a.order - b.order);
	}

	return {
		version: sourceMapJson.version,
		file: sourceMapJson.file,
		sourceRoot: sourceMapJson.sourceRoot,
		sources: sourceMapJson.sources,
		sourcesContent: sourceMapJson.sourcesContent,
		names: sourceMapJson.names,
		mappings: encodeMappings(newLines)
	};
}

function buildLineStarts(text: string): number[] {
	const starts: number[] = [0];
	let pos = 0;
	while (true) {
		const nl = text.indexOf('\n', pos);
		if (nl === -1) {
			break;
		}
		starts.push(nl + 1);
		pos = nl + 1;
	}
	return starts;
}

/**
 * Compute line starts for the code that results from applying `edits` to
 * `originalCode`, without materialising the full new string.
 */
function buildLineStartsAfterEdits(originalCode: string, edits: readonly TextEdit[]): number[] {
	const starts: number[] = [0];
	let oldPos = 0;
	let newPos = 0;

	for (const edit of edits) {
		// Scan unchanged region [oldPos, edit.start) for newlines
		let from = oldPos;
		while (true) {
			const nl = originalCode.indexOf('\n', from);
			if (nl === -1 || nl >= edit.start) {
				break;
			}
			starts.push(newPos + (nl - oldPos) + 1);
			from = nl + 1;
		}
		newPos += edit.start - oldPos;

		// Scan replacement text for newlines
		let replFrom = 0;
		while (true) {
			const nl = edit.newText.indexOf('\n', replFrom);
			if (nl === -1) {
				break;
			}
			starts.push(newPos + nl + 1);
			replFrom = nl + 1;
		}
		newPos += edit.newText.length;

		oldPos = edit.end;
	}

	// Scan remaining unchanged text after last edit
	let from = oldPos;
	while (true) {
		const nl = originalCode.indexOf('\n', from);
		if (nl === -1) {
			break;
		}
		starts.push(newPos + (nl - oldPos) + 1);
		from = nl + 1;
	}

	return starts;
}
