/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { IChatProgressRenderableResponseContent, IChatProgressResponseContent, appendMarkdownString, canMergeMarkdownStrings } from '../model/chatModel.js';
import { IChatAgentVulnerabilityDetails } from '../chatService/chatService.js';

export const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI

export function annotateSpecialMarkdownContent(response: Iterable<IChatProgressResponseContent>): IChatProgressRenderableResponseContent[] {
	let refIdPool = 0;

	const result: IChatProgressRenderableResponseContent[] = [];
	for (const item of response) {
		const previousItemIndex = result.findLastIndex(p => p.kind !== 'textEditGroup' && p.kind !== 'undoStop');
		const previousItem = result[previousItemIndex];
		if (item.kind === 'inlineReference') {
			let label: string | undefined = item.name;
			if (!label) {
				if (URI.isUri(item.inlineReference)) {
					label = basename(item.inlineReference);
				} else if (isLocation(item.inlineReference)) {
					label = basename(item.inlineReference.uri);
				} else {
					label = item.inlineReference.name;
				}
			}

			// When the preceding markdown ends inside a code context (inline code span
			// or fenced code block), markdown links won't be parsed, they render as
			// literal text like [file](http://_vscodecontentref_/1). In that case, emit
			// just the plain label so the output stays readable.
			const previousText = previousItem?.kind === 'markdownContent' ? previousItem.content.value : '';
			if (isInsideCodeContext(previousText)) {
				if (previousItem?.kind === 'markdownContent') {
					const merged = appendMarkdownString(previousItem.content, new MarkdownString(label));
					result[previousItemIndex] = { ...previousItem, content: merged };
				} else {
					result.push({ content: new MarkdownString(label), kind: 'markdownContent' });
				}
			} else {
				const refId = refIdPool++;
				const printUri = URI.parse(contentRefUrl).with({ path: String(refId) });
				const markdownText = `[${label}](${printUri.toString()})`;

				const annotationMetadata = { [refId]: item };

				if (previousItem?.kind === 'markdownContent') {
					const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
					result[previousItemIndex] = { ...previousItem, content: merged, inlineReferences: { ...annotationMetadata, ...(previousItem.inlineReferences || {}) } };
				} else {
					result.push({ content: new MarkdownString(markdownText), inlineReferences: annotationMetadata, kind: 'markdownContent' });
				}
			}
		} else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent') {
			if (canMergeMarkdownStrings(previousItem.content, item.content)) {
				const merged = appendMarkdownString(previousItem.content, item.content);
				result[previousItemIndex] = { ...previousItem, content: merged };
			} else if (previousItem.inlineReferences && isContentRefOnly(previousItem.content.value)) {
				// The previous item is a standalone inline reference whose MarkdownString
				// was synthesized with default properties that don't match the incoming
				// markdown (e.g., different isTrusted). Prepend the reference text and
				// adopt the incoming item's properties so they render together in one block.
				result[previousItemIndex] = {
					...previousItem,
					content: {
						...item.content,
						value: previousItem.content.value + item.content.value,
					},
				};
			} else {
				result.push(item);
			}
		} else if (item.kind === 'markdownVuln') {
			const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
			const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
			if (previousItem?.kind === 'markdownContent') {
				// Since this is inside a codeblock, it needs to be merged into the previous markdown content.
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				result[previousItemIndex] = { ...previousItem, content: merged };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		} else if (item.kind === 'codeblockUri') {
			if (previousItem?.kind === 'markdownContent') {
				const isEditText = item.isEdit ? ` isEdit` : '';
				const subAgentText = item.subAgentInvocationId ? ` subAgentInvocationId="${encodeURIComponent(item.subAgentInvocationId)}"` : '';
				const markdownText = `<vscode_codeblock_uri${isEditText}${subAgentText}>${item.uri.toString()}</vscode_codeblock_uri>`;
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				// delete the previous and append to ensure that we don't reorder the edit before the undo stop containing it
				result.splice(previousItemIndex, 1);
				result.push({ ...previousItem, content: merged });
			}
		} else {
			result.push(item);
		}
	}

	return result;
}

const contentRefPattern = new RegExp(`^(\\[.*?\\]\\(${contentRefUrl}/\\d+\\))+$`);

/**
 * Returns true when the text consists entirely of synthesized content-ref
 * links (e.g. `[file.ts](http://_vscodecontentref_/0)`), with no other
 * markdown text mixed in. Used to decide whether the MarkdownString
 * properties are "synthetic defaults" that can safely be replaced.
 */
function isContentRefOnly(text: string): boolean {
	return contentRefPattern.test(text);
}

/**
 * Checks whether the end of a markdown string is inside a code context
 * (fenced code block or inline code span) where markdown link syntax
 * would be rendered as literal text.
 */
export function isInsideCodeContext(text: string): boolean {
	const lines = text.split('\n');
	let inFencedBlock = false;
	let fenceChar = '';
	let fenceLength = 0;
	const unfencedLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trimStart();

		if (inFencedBlock) {
			// Check for closing fence: same char, at least same length, only whitespace after
			const closeLength = countLeadingChar(trimmed, fenceChar);
			if (closeLength >= fenceLength && trimmed.substring(closeLength).trim() === '') {
				inFencedBlock = false;
				unfencedLines.length = 0;
			}
			continue;
		}

		// Check for opening fence (3+ backticks or tildes at start of line)
		const firstChar = trimmed[0];
		if (firstChar === '`' || firstChar === '~') {
			const openLength = countLeadingChar(trimmed, firstChar);
			// Backtick fences: info string must not contain backticks
			if (openLength >= 3 && (firstChar === '~' || !trimmed.substring(openLength).includes('`'))) {
				inFencedBlock = true;
				fenceChar = firstChar;
				fenceLength = openLength;
				unfencedLines.length = 0;
				continue;
			}
		}

		unfencedLines.push(line);
	}

	return inFencedBlock || hasUnclosedInlineCode(unfencedLines.join('\n'));
}

function countLeadingChar(text: string, char: string): number {
	let count = 0;
	while (count < text.length && text[count] === char) {
		count++;
	}
	return count;
}

/**
 * Checks whether the text has an unclosed inline code span.
 * In CommonMark, a code span opens with a backtick sequence of length N
 * and closes with the next backtick sequence of the same length N.
 */
function hasUnclosedInlineCode(text: string): boolean {
	let i = 0;
	while (i < text.length) {
		if (text[i] !== '`') {
			i++;
			continue;
		}

		const openLen = countLeadingChar(text.substring(i), '`');
		i += openLen;

		// Search for a matching closing backtick sequence of the same length
		let found = false;
		while (i < text.length) {
			if (text[i] !== '`') {
				i++;
				continue;
			}
			const closeLen = countLeadingChar(text.substring(i), '`');
			i += closeLen;
			if (closeLen === openLen) {
				found = true;
				break;
			}
		}

		if (!found) {
			return true;
		}
	}

	return false;
}

export interface IMarkdownVulnerability {
	readonly title: string;
	readonly description: string;
	readonly range: IRange;
}
export function extractCodeblockUrisFromText(text: string): { uri: URI; isEdit?: boolean; subAgentInvocationId?: string; textWithoutResult: string } | undefined {
	const match = /<vscode_codeblock_uri( isEdit)?( subAgentInvocationId="([^"]*)")?>([\s\S]*?)<\/vscode_codeblock_uri>/ms.exec(text);
	if (match) {
		const [all, isEdit, , encodedSubAgentId, uriString] = match;
		if (uriString) {
			const result = URI.parse(uriString);
			const textWithoutResult = text.substring(0, match.index) + text.substring(match.index + all.length);
			let subAgentInvocationId: string | undefined;
			if (encodedSubAgentId) {
				try {
					subAgentInvocationId = decodeURIComponent(encodedSubAgentId);
				} catch {
					subAgentInvocationId = encodedSubAgentId;
				}
			}
			return { uri: result, textWithoutResult, isEdit: !!isEdit, subAgentInvocationId };
		}
	}
	return undefined;
}

export function extractSubAgentInvocationIdFromText(text: string): string | undefined {
	const match = /<vscode_codeblock_uri[^>]* subAgentInvocationId="([^"]*)"/ms.exec(text);
	if (match) {
		try {
			return decodeURIComponent(match[1]);
		} catch {
			return match[1];
		}
	}
	return undefined;
}

export function hasCodeblockUriTag(text: string): boolean {
	return text.includes('<vscode_codeblock_uri');
}

export function extractVulnerabilitiesFromText(text: string): { newText: string; vulnerabilities: IMarkdownVulnerability[] } {
	const vulnerabilities: IMarkdownVulnerability[] = [];
	let newText = text;
	let match: RegExpExecArray | null;
	while ((match = /<vscode_annotation details='(.*?)'>(.*?)<\/vscode_annotation>/ms.exec(newText)) !== null) {
		const [full, details, content] = match;
		const start = match.index;
		const textBefore = newText.substring(0, start);
		const linesBefore = textBefore.split('\n').length - 1;
		const linesInside = content.split('\n').length - 1;

		const previousNewlineIdx = textBefore.lastIndexOf('\n');
		const startColumn = start - (previousNewlineIdx + 1) + 1;
		const endPreviousNewlineIdx = (textBefore + content).lastIndexOf('\n');
		const endColumn = start + content.length - (endPreviousNewlineIdx + 1) + 1;

		try {
			const vulnDetails: IChatAgentVulnerabilityDetails[] = JSON.parse(decodeURIComponent(details));
			vulnDetails.forEach(({ title, description }) => vulnerabilities.push({
				title, description, range: { startLineNumber: linesBefore + 1, startColumn, endLineNumber: linesBefore + linesInside + 1, endColumn }
			}));
		} catch (err) {
			// Something went wrong with encoding this text, just ignore it
		}
		newText = newText.substring(0, start) + content + newText.substring(start + full.length);
	}

	return { newText, vulnerabilities };
}
