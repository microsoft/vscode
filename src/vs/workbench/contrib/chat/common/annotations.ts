/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';
import { IChatProgressRenderableResponseContent, IChatProgressResponseContent, appendMarkdownString, canMergeMarkdownStrings } from './chatModel.js';
import { IChatAgentVulnerabilityDetails, IChatMarkdownContent } from './chatService.js';

export const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI

export type ContentRefData =
	| { readonly kind: 'symbol'; readonly symbol: IWorkspaceSymbol }
	| {
		readonly kind?: undefined;
		readonly uri: URI;
		readonly range?: IRange;
	};

export function annotateSpecialMarkdownContent(response: ReadonlyArray<IChatProgressResponseContent>): IChatProgressRenderableResponseContent[] {
	const result: IChatProgressRenderableResponseContent[] = [];
	for (const item of response) {
		const previousItem = result[result.length - 1];
		if (item.kind === 'inlineReference') {
			const location: ContentRefData = 'uri' in item.inlineReference
				? item.inlineReference
				: 'name' in item.inlineReference
					? { kind: 'symbol', symbol: item.inlineReference }
					: { uri: item.inlineReference };

			const printUri = URI.parse(contentRefUrl).with({ fragment: JSON.stringify(location) });
			let label: string | undefined = item.name;
			if (!label) {
				if (location.kind === 'symbol') {
					label = location.symbol.name;
				} else {
					label = basename(location.uri);
				}
			}

			const markdownText = `[${label}](${printUri.toString()})`;
			if (previousItem?.kind === 'markdownContent') {
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				result[result.length - 1] = { content: merged, kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		} else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent' && canMergeMarkdownStrings(previousItem.content, item.content)) {
			const merged = appendMarkdownString(previousItem.content, item.content);
			result[result.length - 1] = { content: merged, kind: 'markdownContent' };
		} else if (item.kind === 'markdownVuln') {
			const vulnText = encodeURIComponent(JSON.stringify(item.vulnerabilities));
			const markdownText = `<vscode_annotation details='${vulnText}'>${item.content.value}</vscode_annotation>`;
			if (previousItem?.kind === 'markdownContent') {
				// Since this is inside a codeblock, it needs to be merged into the previous markdown content.
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				result[result.length - 1] = { content: merged, kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		} else if (item.kind === 'codeblockUri') {
			if (previousItem?.kind === 'markdownContent') {
				const markdownText = `<vscode_codeblock_uri>${item.uri.toString()}</vscode_codeblock_uri>`;
				const merged = appendMarkdownString(previousItem.content, new MarkdownString(markdownText));
				result[result.length - 1] = { content: merged, kind: 'markdownContent' };
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

export function extractCodeblockUrisFromText(text: string): { uri: URI; textWithoutResult: string } | undefined {
	const match = /<vscode_codeblock_uri>(.*?)<\/vscode_codeblock_uri>/ms.exec(text);
	if (match && match[1]) {
		const result = URI.parse(match[1]);
		const textWithoutResult = text.substring(0, match.index) + text.substring(match.index + match[0].length);
		return { uri: result, textWithoutResult };
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
