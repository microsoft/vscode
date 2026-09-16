/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import { SourceMapGenerator } from 'source-map';
import { TextModel } from '../lib/nls-analysis.ts';
import { collectNLSCalls, getNLSModuleId, type NLSCatalog } from './nls-catalog.ts';
import type { TextEdit } from './private-to-property.ts';

// ============================================================================
// Types
// ============================================================================

export interface NLSPluginOptions {
	/**
	 * Base path for computing module IDs (e.g., 'src')
	 */
	baseDir: string;

	/**
	 * Immutable catalog extracted from all core sources before target bundling.
	 */
	catalog: NLSCatalog;
}

/**
 * Post-processes a JavaScript file to replace NLS placeholders with indices.
 * Returns the transformed code and the edits applied (for source map adjustment).
 */
export function postProcessNLS(
	content: string,
	indexMap: ReadonlyMap<string, number>,
	preserveEnglish: boolean
): { code: string; edits: readonly TextEdit[] } {
	return replaceInOutput(content, indexMap, preserveEnglish);
}

// ============================================================================
// Transformation
// ============================================================================

interface NLSEdit {
	line: number;       // 0-based line in original source
	startCol: number;   // 0-based start column in original
	endCol: number;     // 0-based end column in original
	newLength: number;  // length of replacement text
}

function transformToPlaceholders(
	source: string,
	moduleId: string,
	catalog: NLSCatalog
): { code: string; edits: NLSEdit[] } {
	const allCalls = collectNLSCalls(source, moduleId);

	if (allCalls.length === 0) {
		return { code: source, edits: [] };
	}

	const edits: NLSEdit[] = [];
	const model = new TextModel(source);

	// Process in reverse order to preserve positions
	for (const { entry, keySpan } of allCalls.reverse()) {
		const index = catalog.indexMap.get(entry.placeholder);
		if (index === undefined || catalog.entries[index].message !== entry.message) {
			throw new Error(`[nls] Missing or changed entry ${entry.placeholder}. Regenerate the canonical NLS catalog.`);
		}

		const replacementText = JSON.stringify(entry.placeholder);

		// Track the edit for source map generation (positions are in original source coords)
		edits.push({
			line: keySpan.start.line,
			startCol: keySpan.start.character,
			endCol: keySpan.end.character,
			newLength: replacementText.length,
		});

		// Replace the key with the placeholder string
		model.apply(keySpan, replacementText);
	}

	// Reverse edits to match source order
	edits.reverse();

	return { code: model.toString(), edits };
}

/**
 * Generates a source map that maps from the NLS-transformed source back to the
 * original source. esbuild composes this with its own bundle source map so that
 * the final source map points all the way back to the untransformed TypeScript.
 */
function generateNLSSourceMap(
	originalSource: string,
	filePath: string,
	edits: NLSEdit[]
): string {
	const generator = new SourceMapGenerator();
	generator.setSourceContent(filePath, originalSource);

	const lines = originalSource.split('\n');

	// Group edits by line
	const editsByLine = new Map<number, NLSEdit[]>();
	for (const edit of edits) {
		let arr = editsByLine.get(edit.line);
		if (!arr) {
			arr = [];
			editsByLine.set(edit.line, arr);
		}
		arr.push(edit);
	}

	for (let line = 0; line < lines.length; line++) {
		const smLine = line + 1; // source maps use 1-based lines

		// Always map start of line
		generator.addMapping({
			generated: { line: smLine, column: 0 },
			original: { line: smLine, column: 0 },
			source: filePath,
		});

		const lineEdits = editsByLine.get(line);
		if (lineEdits) {
			lineEdits.sort((a, b) => a.startCol - b.startCol);

			let cumulativeShift = 0;

			for (let i = 0; i < lineEdits.length; i++) {
				const edit = lineEdits[i];
				const origLen = edit.endCol - edit.startCol;

				// Map start of edit: the replacement begins at the same original position
				generator.addMapping({
					generated: { line: smLine, column: edit.startCol + cumulativeShift },
					original: { line: smLine, column: edit.startCol },
					source: filePath,
				});

				cumulativeShift += edit.newLength - origLen;

				// Source maps don't interpolate columns — each query resolves to the
				// last segment with generatedColumn <= queryColumn. A single mapping
				// at edit-end would cause every subsequent column on this line to
				// collapse to that one original position. Add per-column identity
				// mappings from edit-end to the next edit (or end of line) so that
				// esbuild's source-map composition preserves fine-grained accuracy.
				const nextBound = i + 1 < lineEdits.length ? lineEdits[i + 1].startCol : lines[line].length;
				for (let origCol = edit.endCol; origCol < nextBound; origCol++) {
					generator.addMapping({
						generated: { line: smLine, column: origCol + cumulativeShift },
						original: { line: smLine, column: origCol },
						source: filePath,
					});
				}
			}
		}
	}

	return generator.toString();
}

function replaceInOutput(
	content: string,
	indexMap: ReadonlyMap<string, number>,
	preserveEnglish: boolean
): { code: string; edits: readonly TextEdit[] } {
	// Collect all matches first, then apply from back to front so that byte
	// offsets remain valid. Each match becomes a TextEdit in terms of the
	// ORIGINAL content offsets, which is what adjustSourceMap expects.

	interface PendingEdit { start: number; end: number; replacement: string }
	const pending: PendingEdit[] = [];

	if (preserveEnglish) {
		const re = /["'](?<placeholder>%%NLS2?:[^%]+%%)["']/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			const index = indexMap.get(m.groups!.placeholder);
			if (index !== undefined) {
				pending.push({ start: m.index, end: m.index + m[0].length, replacement: String(index) });
			}
		}
	} else {
		// NLS (localize): replace placeholder with index AND replace message with null
		const reNLS = /["']%%NLS:([^%]+)%%["'](\s*,\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
		let m: RegExpExecArray | null;
		while ((m = reNLS.exec(content)) !== null) {
			const inner = m[1];
			const comma = m[2];
			const placeholder = `%%NLS:${inner}%%`;
			const index = indexMap.get(placeholder);
			if (index !== undefined) {
				pending.push({ start: m.index, end: m.index + m[0].length, replacement: `${index}${comma}null` });
			}
		}

		// NLS2 (localize2): replace only key, keep message
		const reNLS2 = /["']%%NLS2:([^%]+)%%["']/g;
		while ((m = reNLS2.exec(content)) !== null) {
			const inner = m[1];
			const placeholder = `%%NLS2:${inner}%%`;
			const index = indexMap.get(placeholder);
			if (index !== undefined) {
				pending.push({ start: m.index, end: m.index + m[0].length, replacement: String(index) });
			}
		}
	}

	// Sort by offset ascending, then apply back-to-front to keep offsets valid
	pending.sort((a, b) => a.start - b.start);

	// Build TextEdit[] (in original-content coordinates) and apply edits
	const edits: TextEdit[] = [];
	for (const p of pending) {
		edits.push({ start: p.start, end: p.end, newText: p.replacement });
	}

	// Apply edits using forward-scanning parts array — O(N+K) instead of
	// O(N*K) from repeated substring concatenation on large strings.
	const parts: string[] = [];
	let lastEnd = 0;
	for (const p of pending) {
		parts.push(content.substring(lastEnd, p.start));
		parts.push(p.replacement);
		lastEnd = p.end;
	}
	parts.push(content.substring(lastEnd));

	const code = parts.join('');
	const unresolved = /(?<placeholder>%%NLS2?:.*?%%)/.exec(code);
	if (unresolved) {
		throw new Error(`[nls] Unresolved placeholder ${unresolved.groups!.placeholder}`);
	}
	return { code, edits };
}

// ============================================================================
// Plugin
// ============================================================================

export function nlsPlugin(options: NLSPluginOptions): esbuild.Plugin {
	return {
		name: 'nls',
		setup(build) {
			// Transform TypeScript files to replace localize() calls with placeholders
			build.onLoad({ filter: /\.ts$/ }, async (args) => {
				// Skip .d.ts files
				if (args.path.endsWith('.d.ts')) {
					return undefined;
				}

				const source = await fs.promises.readFile(args.path, 'utf-8');

				const moduleId = getNLSModuleId(options.baseDir, args.path);

				// Transform localize() calls to placeholders
				const { code, edits } = transformToPlaceholders(source, moduleId, options.catalog);

				if (edits.length > 0) {
					// Generate a source map that maps from the NLS-transformed source
					// back to the original. Embed it inline so esbuild composes it
					// with its own bundle source map, making the final map point to
					// the original TS source.
					// This inline source map is resolved relative to esbuild's sourcefile
					// for args.path. Using the full repo-relative path here makes esbuild
					// resolve it against the file's own directory, which duplicates the
					// directory segments in the final bundled source map.
					const sourceName = path.basename(args.path);
					const sourcemap = generateNLSSourceMap(source, sourceName, edits);
					const encodedMap = Buffer.from(sourcemap).toString('base64');
					const contentsWithMap = code + `\n//# sourceMappingURL=data:application/json;base64,${encodedMap}\n`;
					return { contents: contentsWithMap, loader: 'ts' };
				}

				// No NLS calls, return undefined to let esbuild handle normally
				return undefined;
			});
		}
	};
}
