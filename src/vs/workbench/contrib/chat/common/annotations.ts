/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from 'vs/base/common/htmlContent';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { IChatProgressRenderableResponseContent, IChatProgressResponseContent, canMergeMarkdownStrings } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatAgentMarkdownContentWithVulnerability, IChatAgentVulnerabilityDetails, IChatContentInlineReference, IChatMarkdownContent } from 'vs/workbench/contrib/chat/common/chatService';

export const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI

export function annotateSpecialMarkdownContent(response: ReadonlyArray<IChatProgressResponseContent>): ReadonlyArray<IChatProgressRenderableResponseContent> {
	const result: Exclude<IChatProgressResponseContent, IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability>[] = [];
	for (const item of response) {
		const previousItem = result[result.length - 1];
		if (item.kind === 'inlineReference') {
			const location = 'uri' in item.inlineReference ? item.inlineReference : { uri: item.inlineReference };
			const printUri = URI.parse(contentRefUrl).with({ fragment: JSON.stringify(location) });
			const markdownText = `[${item.name || basename(location.uri)}](${printUri.toString()})`;
			if (previousItem?.kind === 'markdownContent') {
				result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + markdownText), kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		} else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent' && canMergeMarkdownStrings(previousItem.content, item.content)) {
			result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + item.content.value), kind: 'markdownContent' };
		} else if (item.kind === 'markdownVuln') {
			const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
			const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
			if (previousItem?.kind === 'markdownContent') {
				// Since this is inside a codeblock, it needs to be merged into the previous markdown content.
				result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + markdownText, { isTrusted: previousItem.content.isTrusted }), kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
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
