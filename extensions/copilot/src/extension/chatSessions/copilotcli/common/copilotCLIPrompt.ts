/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatPromptReference } from 'vscode';
import { createFilepathRegexp } from '../../../../util/common/markdown';
import { Schemas } from '../../../../util/vs/base/common/network';
import * as path from '../../../../util/vs/base/common/path';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range as EditorRange } from '../../../../util/vs/editor/common/core/range';
import { ChatReferenceDiagnostic, Diagnostic, DiagnosticSeverity, Location, Range } from '../../../../vscodeTypes';
import { PromptFileIdPrefix } from '../../../prompt/common/chatVariablesCollection';

/**
 * Parse the raw user prompt and extract diagnostics and file/line location references
 * contained inside a single <attachments>...</attachments> block.
 *
 * Recognized elements:
 *  - <error path="/abs/path.py" line=13 code="E001" severity="error">Message</error>
 *    -> Aggregated into ChatReferenceDiagnostic (maps uri -> Diagnostic[])
 *  - <attachment>Excerpt from /abs/path.py, lines X to Y: ...</attachment>
 *    or attachment blocks containing a `# filepath: /abs/path.py` comment
 *    -> Converted into vscode.Location objects.
 */
export function extractChatPromptReferences(prompt: string): ChatPromptReference[] {
	// Preserve order of items as they appear inside <attachments>...
	const attachmentsBlockMatch = prompt.match(/<attachments>([\s\S]*?)<\/attachments>/i);
	if (!attachmentsBlockMatch) {
		return [];
	}
	const block = attachmentsBlockMatch[1];

	// Helper: collect ordered tag texts (<attachment ...>...</attachment> or self-closing; <error ...>...</error>)
	function collectOrderedTags(text: string): string[] {
		const results: string[] = [];
		let i = 0;
		const len = text.length;
		while (i < len) {
			// Find next tag start
			const nextAttachment = text.indexOf('<attachment', i);
			const nextError = text.indexOf('<error', i);
			let next = -1;
			let tagType: 'attachment' | 'error' | undefined;
			if (nextAttachment !== -1 && (nextError === -1 || nextAttachment < nextError)) {
				next = nextAttachment;
				tagType = 'attachment';
			} else if (nextError !== -1) {
				next = nextError;
				tagType = 'error';
			}
			if (next === -1 || !tagType) { break; }
			// Move to end of opening tag
			const openEnd = text.indexOf('>', next);
			if (openEnd === -1) { break; }
			const openingTagText = text.slice(next, openEnd + 1);
			// Self-closing?
			const isSelfClosing = /<attachment\b[\s\S]*?\/>\s*$/i.test(openingTagText);
			if (isSelfClosing) {
				results.push(openingTagText);
				i = openEnd + 1;
				continue;
			}
			// Otherwise, find the matching closing tag, skipping fenced code blocks
			const closing = tagType === 'attachment' ? '</attachment>' : '</error>';
			let j = openEnd + 1;
			let inFence = false;
			while (j < len) {
				// Toggle on triple backticks
				if (text.startsWith('```', j)) {
					inFence = !inFence;
					j += 3;
					continue;
				}
				if (!inFence && text.startsWith(closing, j)) {
					const tagText = text.slice(next, j + closing.length);
					results.push(tagText);
					i = j + closing.length;
					break;
				}
				j++;
			}
			if (j >= len) {
				// No closing found; bail out to avoid infinite loop
				break;
			}
		}
		return results;
	}

	// Collect all tags with their positions, then delegate to specific extractors per tag
	const ordered: ChatPromptReference[] = [];
	for (const tagText of collectOrderedTags(block)) {
		if (/^<attachment\b/i.test(tagText)) {
			// Distinguish prompt attachments vs resource attachments
			const promptIdMatch = tagText.match(/<attachment\s+id="(prompt:[^"]+)"[\s\S]*?>/i);
			const ref = promptIdMatch ? extractPromptReferencesFromTag(prompt, tagText) : extractResourcesFromTag(prompt, tagText);
			if (ref) {
				ordered.push(ref);
			}
		} else if (/^<error\b/i.test(tagText)) {
			const ref = extractDiagnosticsFromTag(tagText);
			if (!ref) {
				continue;
			}
			const previousRef = ordered.length > 0 ? ordered[ordered.length - 1] : undefined;
			if (!previousRef || !(previousRef.value instanceof ChatReferenceDiagnostic) || !(ref.value instanceof ChatReferenceDiagnostic) || !isEqual(previousRef.value.diagnostics[0][0], ref.value.diagnostics[0][0])) {
				ordered.push(ref);
				continue;
			}

			// Check if the diagnostics are in intersecting ranges.
			const currentDiagnosticRange = toEditorRange(ref.value.diagnostics[0][1][0].range);
			const previousDiagnosticRange = toEditorRange(previousRef.value.diagnostics[0][1][0].range);
			if (EditorRange.areIntersectingOrTouching(previousDiagnosticRange, currentDiagnosticRange)) {
				// Merge diagnostics into previous entry
				previousRef.value.diagnostics[0][1].push(...ref.value.diagnostics[0][1]);
			} else {
				ordered.push(ref);
			}
		}
	}
	return ordered;
}

function severityToString(severity: DiagnosticSeverity): string {
	switch (severity) {
		case DiagnosticSeverity.Error: return 'error';
		case DiagnosticSeverity.Warning: return 'warning';
		case DiagnosticSeverity.Information: return 'info';
		case DiagnosticSeverity.Hint: return 'hint';
		default: return '';
	}
}
// Single-tag extractors used by ordered parsing
function extractResourcesFromTag(prompt: string, tagText: string): ChatPromptReference | undefined {
	// Self-closing attachment
	if (/^<attachment\s+[^>]*\/>$/i.test(tagText.trim())) {
		const attrs: Record<string, string> = {};
		for (const attrMatch of tagText.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) {
			attrs[attrMatch[1]] = attrMatch[2];
		}
		const isFolder = attrs['folderPath'] !== undefined && attrs['folderPath'] !== '' && attrs['filePath'] === undefined;
		const fileOrFolderpath = attrs['filePath'] || attrs['folderPath'];
		if (!fileOrFolderpath) {
			return undefined;
		}
		const uri = pathToUri(isFolder ? getFolderAttachmentPath(fileOrFolderpath) : fileOrFolderpath);
		const providedId = attrs['id'];
		const locName = providedId ?? uri.toString();
		let id = providedId ?? uri.toString();
		let range: [number, number] | undefined = undefined;
		if (providedId && prompt.includes(`#${providedId}`)) {
			const startIdx = prompt.indexOf(`#${providedId}`);
			range = [startIdx, startIdx + providedId.length];
		}
		if (providedId && providedId.startsWith('sym:')) {
			id = `vscode.symbol/${uri.toJSON()}`;
		}
		return { id, name: locName, range, value: uri };
	}

	// Normal attachment with content
	const content = tagText;
	let filePath: string | undefined;
	let providedId: string | undefined;

	const githubPRIssue = extractGitHubIssueOrPRChatReference(content);
	if (githubPRIssue) {
		return githubPRIssue;
	}

	const openingTagMatch = content.match(/<attachment\s+([^>]*)>/i);
	if (openingTagMatch) {
		const attrsStr = openingTagMatch[1];
		const idAttrMatch = attrsStr.match(/\bid\s*=\s*"([^"]+)"/);
		if (idAttrMatch) {
			providedId = idAttrMatch[1];
		}
	}
	if (providedId && providedId.startsWith('prompt:')) {
		return undefined; // prompt attachments handled elsewhere
	}
	const isUntitledFile = providedId?.startsWith('file:untitled-') || false;
	const fenceMatch = content.match(/```([^\n`]+)\n([\s\S]*?)```/);
	const fencedLanguage = fenceMatch ? fenceMatch[1].trim() : undefined;
	const codeBlockBody = fenceMatch ? fenceMatch[2] : undefined;
	if (codeBlockBody) {
		const re = createFilepathRegexp(fencedLanguage);
		for (const line of codeBlockBody.split(/\r?\n/)) {
			const lineMatch = re.exec(line);
			if (lineMatch && lineMatch[1]) { filePath = lineMatch[1].trim(); break; }
		}
	}
	if (!filePath) {
		const simpleMatch = content.match(/[#\/]\s*filepath:\s*(\S+)/);
		if (simpleMatch) { filePath = simpleMatch[1]; }
	}
	if (!filePath) {
		const excerptMatch = content.match(/Excerpt from ([^,]+),\s*lines\s+(\d+)\s+to\s+(\d+)/i);
		if (excerptMatch) { filePath = excerptMatch[1].trim(); }
	}
	const linesMatch = content.match(/Excerpt from [^,]+,\s*lines\s+(\d+)\s+to\s+(\d+)/i);
	if (!filePath) {
		// Possible this is an SCM item
		try {
			const attrs: Record<string, string> = {};
			for (const attrMatch of tagText.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) {
				attrs[attrMatch[1]] = attrMatch[2];
			}
			if (typeof attrs['filePath'] === 'string') {
				filePath = attrs['filePath'];
			}
			if (filePath?.startsWith('scm-history-item:') && typeof attrs['id'] === 'string') {
				let id = attrs['id'];
				const value = URI.parse(filePath);
				try {
					// Extract id from query.
					const historyItemId = JSON.parse(value.query).historyItemId;
					if (typeof historyItemId === 'string' && historyItemId.length > 0) {
						id = historyItemId;
					}
				} catch { }
				return {
					id,
					name: attrs['id'],
					value
				} satisfies ChatPromptReference;
			}
		} catch { }

		return undefined;
	}
	const startLine = linesMatch ? parseInt(linesMatch[1], 10) : undefined;
	const endLine = linesMatch ? parseInt(linesMatch[2], 10) : undefined;
	const uri = isUntitledFile && filePath.startsWith('untitled:') ? URI.from({ scheme: Schemas.untitled, path: filePath.substring('untitled:'.length) }) : pathToUri(filePath);
	const location = (typeof startLine === 'undefined' || typeof endLine === 'undefined' || isNaN(startLine) || isNaN(endLine)) ? undefined : new Location(uri, new Range(startLine - 1, 0, endLine - 1, 0));
	const locName = providedId ?? (location ? JSON.stringify(location) : uri.toString());
	let range: [number, number] | undefined = undefined;
	let id = (location ? JSON.stringify(location) : uri.toString());
	if (prompt.includes(`#${locName}`)) {
		const idx = prompt.indexOf(`#${locName}`);
		range = [idx, idx + locName.length];
	}
	if (locName.startsWith('sym:')) { id = `vscode.symbol/${(location ? JSON.stringify(location) : uri.toString())}`; }
	return { id, name: locName, range, value: location ?? uri };
}

function extractPromptReferencesFromTag(prompt: string, tagText: string): ChatPromptReference | undefined {
	const idAttrMatch = tagText.match(/<attachment\s+id="(prompt:[^"]+)"[\s\S]*?>/i);
	if (!idAttrMatch) { return undefined; }
	const idAttr = idAttrMatch[1];
	const contentMatch = tagText.match(/<attachment[\s\S]*?>([\s\S]*?)<\/attachment>/i);
	const content = contentMatch ? contentMatch[1] : '';

	let filePath: string | undefined;
	const filepathMatch = content.match(/^\s*\/\/+\s*filepath:\s*(.+?)(?:\r?\n|$)/im);
	if (filepathMatch) { filePath = filepathMatch[1].trim(); }
	if (!filePath) {
		const hashMatch = content.match(/^\s*#\s*filepath:\s*(.+?)(?:\r?\n|$)/im);
		if (hashMatch) { filePath = hashMatch[1].trim(); }
	}
	if (!filePath) { return undefined; }
	let uri: URI;
	if (filePath.startsWith('untitled:')) { uri = URI.parse(filePath); } else { uri = pathToUri(filePath); }
	const id = `${PromptFileIdPrefix}__${uri.toString()}`;
	const name = idAttr;
	return { id, name, value: uri, modelDescription: 'Prompt instruction file' };
}

function extractDiagnosticsFromTag(tagText: string): ChatPromptReference | undefined {
	const m = tagText.match(/<error\s+([^>]+)>([\s\S]*?)<\/error>/i);
	if (!m) { return undefined; }
	const attrText = m[1];
	const message = m[2].trim();
	const attrs: Record<string, string> = {};
	for (const attrMatch of attrText.matchAll(/(\w+)="([^"]*)"/g)) { attrs[attrMatch[1]] = attrMatch[2]; }
	for (const attrMatch of attrText.matchAll(/(\w+)=([0-9]+)/g)) { if (!attrs[attrMatch[1]]) { attrs[attrMatch[1]] = attrMatch[2]; } }
	const filePath = attrs['path'];
	const lineStr = attrs['line'];
	if (!filePath || !lineStr) { return undefined; }
	const lineNum = parseInt(lineStr, 10);
	if (isNaN(lineNum) || lineNum < 1) { return undefined; }
	const code = attrs['code'] && attrs['code'] !== 'undefined' ? attrs['code'] : undefined;
	const severityStr = (attrs['severity'] || 'error').toLowerCase();
	const severityMap: Record<string, number> = { error: DiagnosticSeverity.Error, warning: DiagnosticSeverity.Warning, info: DiagnosticSeverity.Information, hint: DiagnosticSeverity.Hint };
	const uri = pathToUri(filePath);
	const range = new Range(lineNum - 1, 0, lineNum - 1, 0);
	const diagnostic = new Diagnostic(range, message, severityMap[severityStr]);
	diagnostic.code = code;
	return {
		id: `${uri.toString()}:${severityToString(diagnostic.severity)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`,
		name: diagnostic.message,
		range: undefined,
		value: new ChatReferenceDiagnostic([[uri, [diagnostic]]])
	} as ChatPromptReference;
}

function extractGitHubIssueOrPRChatReference(content: string): ChatPromptReference | undefined {
	const openingTagMatch = content.match(/<attachment\s+([^>]*)>/i);
	if (!openingTagMatch) {
		return;
	}
	const attrsStr = openingTagMatch[1];
	const idAttrMatch = attrsStr.match(/\bid\s*=\s*"([^"]+)"/);
	if (!idAttrMatch) {
		return;
	}
	let providedId = idAttrMatch[1];
	// If only id attribute is present and inner content is pure JSON, treat as JSON reference
	const innerMatch = content.match(/<attachment[\s\S]*?>([\s\S]*?)<\/attachment>/i);
	const innerText = innerMatch ? innerMatch[1].trim() : '';
	if (!providedId || !innerText.startsWith('{') || !innerText.endsWith('}')) {
		return;
	}

	try {
		const body = JSON.parse(innerText);
		if (typeof body.issueNumber !== 'number' && typeof body.prNumber !== 'number') {
			// Not GitHub issue or PR reference
			return;
		}
		// Possible that id is JSON encoded & contains special characters that fails parsing using regex, we could improve regex, but thats risky as we don't know all possible id formats & different attributes.
		// In case of JSON content (Prs & issues, we know there's just an id attribute)
		// Sample = 'id="#17143 Kernel interrupt_mode \\"message\\" sends interrupt_request on shell channel instead of control channel"'
		const id = JSON.parse(openingTagMatch[1].substring('id='.length));
		if (typeof id === 'string' && id.length > 0) {
			providedId = id;
		}
	} catch { }
	return {
		id: providedId,
		name: providedId,
		range: undefined,
		value: innerText
	};
}

function toEditorRange(range: Range): EditorRange {
	return new EditorRange(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}

export function getFolderAttachmentPath(folderPath: string): string {
	if (folderPath.endsWith('/') || folderPath.endsWith('\\')) {
		return folderPath;
	}
	return folderPath + path.sep;
}

function pathToUri(pathStr: string): URI {
	if (process.platform === 'win32') {
		// Don't normalize valid UNC paths (starting with \\ but not with \\\\)
		if (pathStr.startsWith('\\\\') && !pathStr.startsWith('\\\\\\\\')) {
			return URI.file(pathStr);
		}
		// Normalize over-escaped paths
		if (pathStr.includes('\\\\')) {
			return URI.file(pathStr.replaceAll('\\\\', '\\'));
		}
	}
	return URI.file(pathStr);
}
