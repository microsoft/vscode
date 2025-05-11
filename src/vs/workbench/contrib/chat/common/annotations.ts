/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IChatProgressRenderableResponseContent, IChatProgressResponseContent, appendMarkdownString, canMergeMarkdownStrings } from './chatModel.js';
import { IChatAgentVulnerabilityDetails, IChatMarkdownContent } from './chatService.js';

export const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI

export function annotateSpecialMarkdownContent(response: Iterable<IChatProgressResponseContent>): IChatProgressRenderableResponseContent[] {
	let refIdPool = 0;

	const result: IChatProgressRenderableResponseContent[] = [];
	for (const item of response) {
		const previousItem = result.filter(p => p.kind !== 'textEditGroup').at(-1);
		const previousItemIndex = result.findIndex(p => p === previousItem);
		if (item.kind === 'inlineReference') {
			let label: string | undefined = item.name;
			if (!label) {
				if (URI.isUri(item.inlineReference)) {
					label = basename(item.inlineReference);
				} else if ('name' in item.inlineReference) {
					label = item.inlineReference.name;
				} else {
					label = basename(item.inlineReference.uri);
				}
			}

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
		} else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent' && canMergeMarkdownStrings(previousItem.content, item.content)) {
			const merged = appendMarkdownString(previousItem.content, item.content);
			result[previousItemIndex] = { ...previousItem, content: merged };
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
				const markdownText = `<vscode_codeblock_uri${isEditText}>${item.uri.toString()}</vscode_codeblock_uri>`;
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				result[previousItemIndex] = { ...previousItem, content: merged };
			}
		} else {
			result.push(item);
		}
	}

	return result;
}

export interface IMarkdownVulnerability {
	readonly title: string;
	readonly description: string;
	readonly range: IRange;
}

export function annotateVulnerabilitiesInText(response: ReadonlyArray<IChatProgressResponseContent>): readonly IChatMarkdownContent[] {
	const result: IChatMarkdownContent[] = [];
	for (const item of response) {
		const previousItem = result[result.length - 1];
		if (item.kind === 'markdownContent') {
			if (previousItem?.kind === 'markdownContent') {
				result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + item.content.value, { isTrusted: previousItem.content.isTrusted }), kind: 'markdownContent' };
			} else {
				result.push(item);
			}
		} else if (item.kind === 'markdownVuln') {
			const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
			const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
			if (previousItem?.kind === 'markdownContent') {
				result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + markdownText, { isTrusted: previousItem.content.isTrusted }), kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		}
	}

	return result;
}

export function extractCodeblockUrisFromText(text: string): { uri: URI; isEdit?: boolean; textWithoutResult: string } | undefined {
	const match = /<vscode_codeblock_uri( isEdit)?>(.*?)<\/vscode_codeblock_uri>/ms.exec(text);
	if (match) {
		const [all, isEdit, uriString] = match;
		if (uriString) {
			const result = URI.parse(uriString);
			const textWithoutResult = text.substring(0, match.index) + text.substring(match.index + all.length);
			return { uri: result, textWithoutResult, isEdit: !!isEdit };
		}
	}
	return undefined;
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
