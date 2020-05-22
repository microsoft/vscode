/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';
import type * as Proto from '../protocol';

function regexConcat(re: RegExp[], flags?: string, sep: string = '') {
	return new RegExp(re.map(re => re.source).join(sep), flags);
}

const LINK_SEARCHES = [
	/\{@(link|linkplain|linkcode)\s+([^}]*)\}/, // {@link <link>}
	/(\[[^\]]*\]\([^)]*\))/, // match markdown url so we dont replace it twice [<text>](<link>)
	/(?=(?:workspace|project|file):\/\/)([^\s{}\)\[\]]+)/, // match supported top level links
];

const LINK_REGEXP = regexConcat(LINK_SEARCHES, 'gi', '|');

function parseLinkMatch(match: unknown, definition?: Proto.DefinitionResponse['body']): [null, string?] | [string, string, string?] {
	const editor = vscode.window.activeTextEditor;

	if (!editor || typeof match !== 'string') {
		return [null];
	}

	let nameSepIdx = match.indexOf('|');
	nameSepIdx = nameSepIdx === -1 ? match.indexOf(' ') : nameSepIdx;
	const linkSegment = nameSepIdx !== -1 ? match.substring(0, nameSepIdx) : match;

	let link = linkSegment;
	let text = nameSepIdx !== -1 ? match.substring(nameSepIdx + 1).trim() : undefined;

	const uri = vscode.Uri.parse(link);
	let rootUri: vscode.Uri | undefined;

	switch (uri.scheme) {
		case 'http':
		case 'https':
			return [link, text || linkSegment];
		case 'workspace': {
			link = uri.path;
			if (!text) {
				text = linkSegment;
			}
			rootUri = (vscode.workspace.workspaceFolders || []).find(workspaceFolder => workspaceFolder.name === uri.authority)?.uri;
			if (!rootUri) {
				// when workspace not found
				return [linkSegment, `~_${linkSegment}_~`, `Unknown Workspace: ${uri.authority}`];
			}
			break;
		}
		case 'file':
		case 'project': {
			const isRelativeAuthority = uri.authority === '.' || uri.authority === '..';
			const definitionFile = definition?.[0]?.file;

			rootUri = definitionFile ? vscode.Uri.file(definitionFile) : editor.document.uri;
			link = isRelativeAuthority || uri.scheme === 'project' ? uri.authority + uri.path : uri.path;

			if (isRelativeAuthority || /^\/?\.\.?\//.test(link)) {
				// when definition is not provided we can not reliably render a relative path due to a limitation of
				// the LSP server. This is due to completions providing no way of resolving the definition of the
				// type which is being completed so it is not possible to know where to resolve relative to.
				if (!definitionFile) {
					return [null, text || linkSegment];
				}
				if (!text) {
					// remove proto in preview if custom text not given and
					// path is relative (project|file)://./types.ts -> ./types.ts
					text = uri.authority + uri.path;
				}
				rootUri = rootUri.with({
					path: path.dirname(rootUri.path)
				});
			} else if (uri.scheme === 'project') {
				rootUri = vscode.workspace.getWorkspaceFolder(rootUri)?.uri;
			} else {
				rootUri = vscode.Uri.parse('file:///', true);
			}
			break;
		}
	}

	if (rootUri) {
		rootUri = rootUri.with({
			path: vscode.Uri.joinPath(rootUri, link).path,
			query: uri.query,
			fragment: uri.fragment
		});
	}

	console.log({ rootUri, uri, linkSegment });
	return [rootUri?.toString() || link, text || link];

}

function parseMarkdownLink(str: string) {
	const [, text, link] = str.match(/\[([^\]]*)\]\((?=\s*(?:workspace|project|file):\/\/)([^\)]*)\)/) || [];
	if (!link) {
		return;
	}
	return `${link.trim()}${text ? `|${text}` : ''}`;
}

function replaceLinks(text: string, definition?: Proto.DefinitionResponse['body']): string {
	return (
		text.replace(LINK_REGEXP, (_, tag: string, ...matches: unknown[]) => {
			let match = matches[0] || matches[2];
			if (!match && typeof matches[1] === 'string') {
				// we need to handle any protocol links or they will be resolved by markdown
				match = parseMarkdownLink(matches[1]);
			}
			const result = parseLinkMatch(match, definition);
			console.log(result);
			if (result[0] === null) {
				return result[1] || _;
			}
			switch (tag) {
				case 'linkcode':
					return `[\`${result[1]}\`](${result[0]}${result[2] ? ` "${result[2]}"` : ''})`;
				default:
					return `[${result[1]}](${result[0]}${result[2] ? ` "${result[2]}"` : ''})`;
			}
		})
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
