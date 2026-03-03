/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import { SourceMapGenerator } from 'source-map';
import {
	TextModel,
	analyzeLocalizeCalls,
	parseLocalizeKeyOrValue
} from '../lib/nls-analysis.ts';
import type { TextEdit } from './private-to-property.ts';

// ============================================================================
// Types
// ============================================================================

interface NLSEntry {
	moduleId: string;
	key: string | { key: string; comment: string[] };
	message: string;
	placeholder: string;
}

export interface NLSPluginOptions {
	/**
	 * Base path for computing module IDs (e.g., 'src')
	 */
	baseDir: string;

	/**
	 * Shared collector for NLS entries across multiple builds.
	 * Create with createNLSCollector() and pass to multiple plugin instances.
	 */
	collector: NLSCollector;
}

/**
 * Collector for NLS entries across multiple esbuild builds.
 */
export interface NLSCollector {
	entries: Map<string, NLSEntry>;
	add(entry: NLSEntry): void;
}

/**
 * Creates a shared NLS collector that can be passed to multiple plugin instances.
 */
export function createNLSCollector(): NLSCollector {
	const entries = new Map<string, NLSEntry>();
	return {
		entries,
		add(entry: NLSEntry) {
			entries.set(entry.placeholder, entry);
		}
	};
}

/**
 * Finalizes NLS collection and writes output files.
 * Call this after all esbuild builds have completed.
 */
export async function finalizeNLS(
	collector: NLSCollector,
	outDir: string,
	alsoWriteTo?: string[]
): Promise<{ indexMap: Map<string, number>; messageCount: number }> {
	if (collector.entries.size === 0) {
		return { indexMap: new Map(), messageCount: 0 };
	}

	// Sort entries by moduleId, then by key for stable indices
	const sortedEntries = [...collector.entries.values()].sort((a, b) => {
		const aKey = typeof a.key === 'string' ? a.key : a.key.key;
		const bKey = typeof b.key === 'string' ? b.key : b.key.key;
		const moduleCompare = a.moduleId.localeCompare(b.moduleId);
		if (moduleCompare !== 0) {
			return moduleCompare;
		}
		return aKey.localeCompare(bKey);
	});

	// Create index map
	const indexMap = new Map<string, number>();
	sortedEntries.forEach((entry, idx) => {
		indexMap.set(entry.placeholder, idx);
	});

	// Build NLS metadata
	const allMessages: string[] = [];
	const moduleToKeys: Map<string, (string | { key: string; comment: string[] })[]> = new Map();
	const moduleToMessages: Map<string, string[]> = new Map();

	for (const entry of sortedEntries) {
		allMessages.push(entry.message);

		if (!moduleToKeys.has(entry.moduleId)) {
			moduleToKeys.set(entry.moduleId, []);
			moduleToMessages.set(entry.moduleId, []);
		}
		moduleToKeys.get(entry.moduleId)!.push(entry.key);
		moduleToMessages.get(entry.moduleId)!.push(entry.message);
	}

	// nls.keys.json: [["moduleId", ["key1", "key2"]], ...]
	const nlsKeysJson: [string, string[]][] = [];
	for (const [moduleId, keys] of moduleToKeys) {
		nlsKeysJson.push([moduleId, keys.map(k => typeof k === 'string' ? k : k.key)]);
	}

	// nls.metadata.json: { keys: {...}, messages: {...} }
	const nlsMetadataJson = {
		keys: Object.fromEntries(moduleToKeys),
		messages: Object.fromEntries(moduleToMessages)
	};

	// Write NLS files
	const allOutDirs = [outDir, ...(alsoWriteTo ?? [])];
	for (const dir of allOutDirs) {
		await fs.promises.mkdir(dir, { recursive: true });
	}

	await Promise.all(allOutDirs.flatMap(dir => [
		fs.promises.writeFile(
			path.join(dir, 'nls.messages.json'),
			JSON.stringify(allMessages)
		),
		fs.promises.writeFile(
			path.join(dir, 'nls.keys.json'),
			JSON.stringify(nlsKeysJson)
		),
		fs.promises.writeFile(
			path.join(dir, 'nls.metadata.json'),
			JSON.stringify(nlsMetadataJson, null, '\t')
		),
		fs.promises.writeFile(
			path.join(dir, 'nls.messages.js'),
			`/*---------------------------------------------------------\n * Copyright (C) Microsoft Corporation. All rights reserved.\n *--------------------------------------------------------*/\nglobalThis._VSCODE_NLS_MESSAGES=${JSON.stringify(allMessages)};`
		),
	]));

	console.log(`[nls] Extracted ${allMessages.length} messages from ${moduleToKeys.size} modules`);

	return { indexMap, messageCount: allMessages.length };
}

/**
 * Post-processes a JavaScript file to replace NLS placeholders with indices.
 * Returns the transformed code and the edits applied (for source map adjustment).
 */
export function postProcessNLS(
	content: string,
	indexMap: Map<string, number>,
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
	moduleId: string
): { code: string; entries: NLSEntry[]; edits: NLSEdit[] } {
	const localizeCalls = analyzeLocalizeCalls(source, 'localize');
	const localize2Calls = analyzeLocalizeCalls(source, 'localize2');

	// Tag calls with their type so we can handle them differently later
	const taggedLocalize = localizeCalls.map(call => ({ call, isLocalize2: false }));
	const taggedLocalize2 = localize2Calls.map(call => ({ call, isLocalize2: true }));
	const allCalls = [...taggedLocalize, ...taggedLocalize2].sort(
		(a, b) => a.call.keySpan.start.line - b.call.keySpan.start.line ||
			a.call.keySpan.start.character - b.call.keySpan.start.character
	);

	if (allCalls.length === 0) {
		return { code: source, entries: [], edits: [] };
	}

	const entries: NLSEntry[] = [];
	const edits: NLSEdit[] = [];
	const model = new TextModel(source);

	// Process in reverse order to preserve positions
	for (const { call, isLocalize2 } of allCalls.reverse()) {
		const keyParsed = parseLocalizeKeyOrValue(call.key) as string | { key: string; comment: string[] };
		const messageParsed = parseLocalizeKeyOrValue(call.value);
		const keyString = typeof keyParsed === 'string' ? keyParsed : keyParsed.key;

		// Use different placeholder prefix for localize vs localize2
		// localize: message will be replaced with null
		// localize2: message will be preserved (only key replaced)
		const prefix = isLocalize2 ? 'NLS2' : 'NLS';
		const placeholder = `%%${prefix}:${moduleId}#${keyString}%%`;

		entries.push({
			moduleId,
			key: keyParsed,
			message: String(messageParsed),
			placeholder
		});

		const replacementText = `"${placeholder}"`;

		// Track the edit for source map generation (positions are in original source coords)
		edits.push({
			line: call.keySpan.start.line,
			startCol: call.keySpan.start.character,
			endCol: call.keySpan.end.character,
			newLength: replacementText.length,
		});

		// Replace the key with the placeholder string
		model.apply(call.keySpan, replacementText);
	}

	// Reverse entries and edits to match source order
	entries.reverse();
	edits.reverse();

	return { code: model.toString(), entries, edits };
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
	indexMap: Map<string, number>,
	preserveEnglish: boolean
): { code: string; edits: readonly TextEdit[] } {
	// Collect all matches first, then apply from back to front so that byte
	// offsets remain valid. Each match becomes a TextEdit in terms of the
	// ORIGINAL content offsets, which is what adjustSourceMap expects.

	interface PendingEdit { start: number; end: number; replacement: string }
	const pending: PendingEdit[] = [];

	if (preserveEnglish) {
		const re = /["']%%NLS2?:([^%]+)%%["']/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			const inner = m[1];
			let placeholder = `%%NLS:${inner}%%`;
			let index = indexMap.get(placeholder);
			if (index === undefined) {
				placeholder = `%%NLS2:${inner}%%`;
				index = indexMap.get(placeholder);
			}
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

	if (pending.length === 0) {
		return { code: content, edits: [] };
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

	return { code: parts.join(''), edits };
}

// ============================================================================
// Plugin
// ============================================================================

export function nlsPlugin(options: NLSPluginOptions): esbuild.Plugin {
	const { collector } = options;

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

				// Compute module ID (e.g., "vs/editor/editor" from "src/vs/editor/editor.ts")
				const relativePath = path.relative(options.baseDir, args.path);
				const moduleId = relativePath
					.replace(/\\/g, '/')
					.replace(/\.ts$/, '');

				// Transform localize() calls to placeholders
				const { code, entries: fileEntries, edits } = transformToPlaceholders(source, moduleId);

				// Collect entries
				for (const entry of fileEntries) {
					collector.add(entry);
				}

				if (fileEntries.length > 0) {
					// Generate a source map that maps from the NLS-transformed source
					// back to the original. Embed it inline so esbuild composes it
					// with its own bundle source map, making the final map point to
					// the original TS source.
					const sourceName = relativePath.replace(/\\/g, '/');
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
