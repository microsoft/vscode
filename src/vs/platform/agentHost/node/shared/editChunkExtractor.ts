/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Extracts the explicit AI-written text chunks from a file-edit tool's
 * input payload. Both Claude (via @anthropic-ai/claude-agent-sdk) and
 * Copilot CLI (via @github/copilot-sdk) accept canonical tool schemas
 * whose shapes we can read structurally — Claude uses PascalCase names
 * (`Write`, `Edit`, `MultiEdit`) with `_string` fields, Copilot uses
 * snake_case (`create`, `edit`, `str_replace`, `insert`,
 * `str_replace_editor` command-dispatched, `apply_patch` /
 * `git_apply_patch` V4A patch body) with `_str` / `file_text` fields.
 *
 * Returning an empty array means "we couldn't read this — fall back to
 * whole-file scoring." Defensive against malformed SDK input: every
 * branch checks the value shape before reading.
 *
 * Coverage invariant: every tool the agent host currently treats as a
 * file-edit tool (`isClaudeFileEditTool`, `isEditTool` in Copilot) has
 * a matching case below — so in practice every edit gets chunked
 * scoring. The whole-file fallback is a safety net for SDK shape drift
 * (a tool input changes shape) and for newly added tools (a new edit
 * tool added to one of those gates without a matching case here). If
 * you add a new file-edit tool to either gate, add a case here too so
 * the survival reporter keeps producing chunked scores.
 */

/**
 * Returns the AI-written text chunks for a known file-edit tool, or
 * `[]` if the tool / input shape is not recognised. Callers should
 * treat `[]` as "fall back to whole-file scoring."
 *
 * Supported Claude SDK tools (one file per call):
 *  - `Write { content }`                       → `[content]`
 *  - `Edit { new_string }`                     → `[new_string]`
 *  - `MultiEdit { edits: [{ new_string }] }`   → one chunk per edit
 *
 * Supported Copilot CLI tools (one file per call unless noted):
 *  - `create { file_text }`                    → `[file_text]`
 *  - `edit`, `str_replace { new_str }`         → `[new_str]`
 *  - `insert { new_str }`                      → `[new_str]`
 *  - `str_replace_editor { command, ... }`     → dispatch on command
 *  - `apply_patch`, `git_apply_patch`          → `+` lines from the
 *    V4A patch body, scoped to {@link forFilePath} when supplied
 *    (the patch may touch multiple files; we only want chunks for
 *    the file we're sampling).
 *
 * `NotebookEdit` is not handled here: the reporter currently skips
 * `.ipynb` files at launch time, so notebook tool inputs never reach
 * the survival math. Add a branch here if we extend tracking to
 * notebooks.
 *
 * @param toolName  Tool identifier (Claude PascalCase or Copilot
 *   snake_case; tools we don't recognise just return `[]`).
 * @param input     The tool input. May be `unknown`, a JSON object,
 *   or — for `apply_patch` — a bare V4A patch string. Defensive
 *   against all three.
 * @param forFilePath Optional. When supplied and the tool is a
 *   multi-file patch (`apply_patch` / `git_apply_patch`), only the
 *   `+` lines under that file's header contribute. Single-file tools
 *   ignore this argument.
 */
export function extractAiChunks(toolName: string, input: unknown, forFilePath?: string): string[] {
	switch (toolName) {
		// ---- Claude SDK -------------------------------------------------
		case 'Write':
			return readStringField(input, 'content');
		case 'Edit':
			return readStringField(input, 'new_string');
		case 'MultiEdit':
			return readMultiEdit(input, 'new_string');

		// ---- Copilot CLI ------------------------------------------------
		case 'create':
			return readStringField(input, 'file_text');
		case 'edit':
		case 'str_replace':
		case 'insert':
			return readStringField(input, 'new_str');
		case 'str_replace_editor':
			return readStrReplaceEditor(input);
		case 'apply_patch':
		case 'git_apply_patch':
			return readApplyPatch(input, forFilePath);

		default:
			return [];
	}
}

function readStringField(input: unknown, field: string): string[] {
	if (typeof input !== 'object' || input === null) {
		return [];
	}
	const value = (input as Record<string, unknown>)[field];
	return typeof value === 'string' ? [value] : [];
}

function readMultiEdit(input: unknown, field: string): string[] {
	if (typeof input !== 'object' || input === null) {
		return [];
	}
	const edits = (input as Record<string, unknown>).edits;
	if (!Array.isArray(edits)) {
		return [];
	}
	const chunks: string[] = [];
	for (const entry of edits) {
		if (typeof entry === 'object' && entry !== null) {
			const value = (entry as Record<string, unknown>)[field];
			if (typeof value === 'string') {
				chunks.push(value);
			}
		}
	}
	return chunks;
}

/**
 * `str_replace_editor` dispatches on `command`. We extract chunks per
 * command type — `view` and `undo_edit` produce no chunks.
 */
function readStrReplaceEditor(input: unknown): string[] {
	if (typeof input !== 'object' || input === null) {
		return [];
	}
	const obj = input as Record<string, unknown>;
	switch (obj.command) {
		case 'create':
			return typeof obj.file_text === 'string' ? [obj.file_text] : [];
		case 'str_replace':
		case 'insert':
			return typeof obj.new_str === 'string' ? [obj.new_str] : [];
		default:
			return [];
	}
}

/**
 * Headers of the V4A patch format the Copilot `apply_patch` tool
 * accepts. Mirrors {@link copilotToolDisplay.APPLY_PATCH_FILE_HEADERS};
 * kept duplicated here so this module stays free of cross-provider
 * imports.
 */
const APPLY_PATCH_FILE_HEADERS = [
	/^\s*\*\*\*\s+Update File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Add File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Delete File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Move to:\s*(.+?)\s*$/,
];

/**
 * Extracts the AI-written additions from a V4A patch body, grouped by
 * the file header that introduced them. When `forFilePath` is set,
 * only that file's additions are returned (joined into a single
 * chunk); otherwise every file's additions are returned, in document
 * order.
 *
 * The Copilot SDK delivers `apply_patch` with `arguments` as a raw
 * patch string (custom tool format), not as a JSON object, so the
 * string fallback is the common case for apply_patch.
 */
function readApplyPatch(input: unknown, forFilePath?: string): string[] {
	let text: string | undefined;
	if (typeof input === 'string') {
		text = input;
	} else if (typeof input === 'object' && input !== null) {
		const obj = input as Record<string, unknown>;
		if (typeof obj.input === 'string') {
			text = obj.input;
		} else if (typeof obj.patch === 'string') {
			text = obj.patch;
		}
	}
	if (!text) {
		return [];
	}

	const additionsByFile = new Map<string, string[]>();
	const order: string[] = [];
	let currentFile: string | undefined;

	for (const line of text.split('\n')) {
		let matchedHeader = false;
		for (const re of APPLY_PATCH_FILE_HEADERS) {
			const m = re.exec(line);
			if (m && m[1]) {
				currentFile = m[1];
				if (!additionsByFile.has(currentFile)) {
					additionsByFile.set(currentFile, []);
					order.push(currentFile);
				}
				matchedHeader = true;
				break;
			}
		}
		if (matchedHeader || !currentFile) {
			continue;
		}
		// V4A addition lines start with a single '+' and are NOT the
		// '+++' file marker (which V4A doesn't use, but guard anyway).
		if (line.startsWith('+') && !line.startsWith('+++')) {
			additionsByFile.get(currentFile)!.push(line.slice(1));
		}
	}

	const joinLines = (lines: string[]) => lines.length === 0 ? '' : lines.join('\n') + '\n';

	if (forFilePath !== undefined) {
		const lines = additionsByFile.get(forFilePath);
		if (!lines || lines.length === 0) {
			return [];
		}
		return [joinLines(lines)];
	}

	const out: string[] = [];
	for (const file of order) {
		const joined = joinLines(additionsByFile.get(file)!);
		if (joined.length > 0) {
			out.push(joined);
		}
	}
	return out;
}

