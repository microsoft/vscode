/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';
import type * as Proto from '../protocol';

function getWorkspacePath(
	definition: undefined | Proto.DefinitionResponse['body'],
	proto: string, givenPath: string,
	withText: undefined | string
): [string, string] {
	let text = withText || givenPath;

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return [givenPath, text];
	}

	let pathToUse: string | undefined = givenPath.replace(/(?:workspace|project|file):\/\//, '');
	let rootPath: string | undefined;

	switch (proto) {
		case 'workspace': {
			let workspaceName: string | undefined;
			[, workspaceName, pathToUse] = pathToUse.match(/^\/?([^\/]*)(\/[^ |]*)/) || [];
			rootPath = (vscode.workspace.workspaceFolders || []).find(workspaceFolder => workspaceFolder.name === workspaceName)?.uri.fsPath;
			break;
		}
		case 'file':
		case 'project': {
			const uri = definition?.[0]?.file ? vscode.Uri.file(definition[0].file) : editor.document.uri;
			if (/^\/?\.\.?\//.test(pathToUse)) {
				rootPath = path.dirname(uri.path);
			} else if (proto === 'file') {
				return [path.normalize(pathToUse), text];
			} else {
				rootPath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
			}
		}
	}

	return [rootPath ? path.join(rootPath, pathToUse) : givenPath, text];
}

function replaceLinks(text: string, definition?: Proto.DefinitionResponse['body']): string {
	return (
		text
			// Http(s) links
			.replace(
				/(?:\{@(link|linkplain|linkcode) ((https?|workspace|project):\/\/[^ |}]+?)(?:[| ]([^{}\n]+?))?\}|((workspace|project|file):\/\/[^\s|]*))/gi,
				(_, tag: string, _link: undefined | string, _proto: undefined | string, text: undefined | string, _link2: undefined | string, _proto2: undefined | string) => {
					const proto = _proto || _proto2;
					let link = _link || _link2;
					if (!link || !proto) {
						return _;
					}
					if (proto === 'workspace' || proto === 'project' || proto === 'file') {
						[link, text] = getWorkspacePath(definition, proto, link, text);
					}
					switch (tag) {
						case 'linkcode':
							return `[\`${text ? text.trim() : link}\`](${link})`;
						default:
							return `[${text ? text.trim() : link}](${link})`;
					}
				},
			)
	);
}

function processInlineTags(text: string, definition?: Proto.DefinitionResponse['body']): string {
	return replaceLinks(text, definition);
}

function getTagBodyText(tag: Proto.JSDocTagInfo, definition?: Proto.DefinitionResponse['body']): string | undefined {
	if (!tag.text) {
		return undefined;
	}

	// Convert to markdown code block if it is not already one
	function makeCodeblock(text: string): string {
		if (text.match(/^\s*[~`]{3}/g)) {
			return text;
		}
		return '```\n' + text + '\n```';
	}

	switch (tag.name) {
		case 'example':
			// check for caption tags, fix for #79704
			const captionTagMatches = tag.text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
			if (captionTagMatches && captionTagMatches.index === 0) {
				return captionTagMatches[1] + '\n\n' + makeCodeblock(tag.text.substr(captionTagMatches[0].length));
			} else {
				return makeCodeblock(tag.text);
			}
		case 'author':
			// fix obsucated email address, #80898
			const emailMatch = tag.text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);

			if (emailMatch === null) {
				return tag.text;
			} else {
				return `${emailMatch[1]} ${emailMatch[2]}`;
			}
		case 'default':
			return makeCodeblock(tag.text);
	}

	return processInlineTags(tag.text, definition);
}

function getTagDocumentation(tag: Proto.JSDocTagInfo, definition?: Proto.DefinitionResponse['body']): string | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'param':
		case 'template':
			const body = (tag.text || '').split(/^(\S+)\s*-?\s*/);
			if (body?.length === 3) {
				const param = body[1];
				const doc = body[2];
				const label = `*@${tag.name}* \`${param}\``;
				if (!doc) {
					return label;
				}
				return label + (doc.match(/\r\n|\n/g) ? '  \n' + processInlineTags(doc, definition) : ` — ${processInlineTags(doc, definition)}`);
			}
	}

	// Generic tag
	const label = `*@${tag.name}*`;
	const text = getTagBodyText(tag, definition);
	if (!text) {
		return label;
	}
	return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` — ${text}`);
}

export function plain(
	parts: Proto.SymbolDisplayPart[] | string,
	definition?: Proto.DefinitionResponse['body']
): string {
	return processInlineTags(
		typeof parts === 'string'
			? parts
			: parts.map(part => part.text).join(''),
		definition
	);
}

export function tagsMarkdownPreview(tags: Proto.JSDocTagInfo[], definition?: Proto.DefinitionResponse['body']): string {
	return tags.map(tag => getTagDocumentation(tag, definition)).join('  \n\n');
}

export function markdownDocumentation(
	documentation: Proto.SymbolDisplayPart[] | string,
	tags: Proto.JSDocTagInfo[],
	definition?: Proto.DefinitionResponse['body']
): vscode.MarkdownString {
	const out = new vscode.MarkdownString();
	addMarkdownDocumentation(out, documentation, tags, definition);
	return out;
}

export function addMarkdownDocumentation(
	out: vscode.MarkdownString,
	documentation: Proto.SymbolDisplayPart[] | string | undefined,
	tags: Proto.JSDocTagInfo[] | undefined,
	definition?: Proto.DefinitionResponse['body']
): vscode.MarkdownString {
	if (documentation) {
		out.appendMarkdown(plain(documentation, definition));
	}

	if (tags) {
		const tagsPreview = tagsMarkdownPreview(tags, definition);
		if (tagsPreview) {
			out.appendMarkdown('\n\n' + tagsPreview);
		}
	}
	return out;
}
