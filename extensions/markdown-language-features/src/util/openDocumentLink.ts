/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient';
import { MdLanguageClient } from '../client/client';
import * as proto from '../client/protocol';

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

/**
 * Resolves Markdown links relative to a source resource and opens the resulting typed target.
 */
export class MdLinkOpener {

	readonly #client: Pick<MdLanguageClient, 'resolveLinkTarget'>;

	constructor(
		client: Pick<MdLanguageClient, 'resolveLinkTarget'>,
	) {
		this.#client = client;
	}

	/**
	 * Resolves a link without opening it, returning `undefined` when no target exists.
	 * Absolute non-file URIs bypass the Markdown language service.
	 */
	public async resolveDocumentLink(linkText: string, fromResource: vscode.Uri): Promise<proto.ResolvedDocumentLinkTarget | undefined> {
		const absoluteUri = getAbsoluteUri(linkText);
		if (absoluteUri && absoluteUri.scheme !== 'file') {
			return { kind: 'external', uri: absoluteUri };
		}
		return this.#client.resolveLinkTarget(linkText, fromResource);
	}

	/**
	 * Resolves and opens a Markdown link, doing nothing when it cannot be resolved.
	 */
	public async openDocumentLink(linkText: string, fromResource: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
		const resolved = await this.resolveDocumentLink(linkText, fromResource);
		await this.openResolvedDocumentLink(linkText, fromResource, resolved, viewColumn);
	}

	/**
	 * Opens an already resolved target without repeating link resolution.
	 * The original link text supplies a location fragment when a file target has no explicit position.
	 */
	public async openResolvedDocumentLink(
		linkText: string,
		fromResource: vscode.Uri,
		resolved: proto.ResolvedDocumentLinkTarget | undefined,
		viewColumn?: vscode.ViewColumn,
	): Promise<void> {
		if (!resolved) {
			return;
		}

		let uri = vscode.Uri.from(resolved.uri);
		let rangeSelection = resolved.kind === 'file' ? getRangeFromPositionOrRange(resolved.positionOrRange) : undefined;
		if (resolved.kind === 'file' && !rangeSelection) {
			if (uri.fragment) {
				rangeSelection = getSelectionFromLocationFragment(uri.fragment);
			} else {
				const locationFragment = getLocationFragmentFromLinkText(linkText);
				if (locationFragment) {
					uri = uri.with({ fragment: locationFragment });
					rangeSelection = getSelectionFromLocationFragment(locationFragment);
				}
			}
		}

		switch (resolved.kind) {
			case 'external':
				await openExternal(uri);
				return;

			case 'folder':
				return vscode.commands.executeCommand('revealInExplorer', uri);

			case 'file': {
				// If no explicit viewColumn is given, check if the editor is already open in a tab
				if (typeof viewColumn === 'undefined') {
					for (const tab of vscode.window.tabGroups.all.flatMap(x => x.tabs)) {
						if (tab.input instanceof vscode.TabInputText) {
							if (tab.input.uri.fsPath === uri.fsPath) {
								viewColumn = tab.group.viewColumn;
								break;
							}
						}
					}
				}

				return vscode.commands.executeCommand('vscode.open', uri, {
					selection: rangeSelection,
					viewColumn: viewColumn ?? getViewColumn(fromResource),
				} satisfies vscode.TextDocumentShowOptions);
			}
		}
	}
}

/**
 * Converts a language-server position or range to a VS Code range.
 * Returns `undefined` for absent targets or positions with invalid coordinates.
 */
export function getRangeFromPositionOrRange(positionOrRange: lsp.Position | lsp.Range | undefined): vscode.Range | undefined {
	if (!positionOrRange) {
		return undefined;
	}
	const range = lsp.Range.is(positionOrRange)
		? positionOrRange
		: { start: positionOrRange, end: positionOrRange };
	if (!isValidPosition(range.start) || !isValidPosition(range.end)) {
		return undefined;
	}
	return new vscode.Range(
		range.start.line,
		range.start.character,
		range.end.line,
		range.end.character,
	);
}

function isValidPosition(position: lsp.Position): boolean {
	return Number.isInteger(position.line) && position.line >= 0
		&& Number.isInteger(position.character) && position.character >= 0;
}

async function openExternal(uri: vscode.Uri): Promise<void> {
	if (uri.scheme === 'http' || uri.scheme === 'https') {
		await vscode.env.openExternal(uri, { allowContributedOpeners: true });
	} else {
		await vscode.commands.executeCommand('vscode.open', uri);
	}
}

/**
 * Parses URI-like absolute links while leaving Windows drive paths unresolved.
 */
export function getAbsoluteUri(linkText: string): vscode.Uri | undefined {
	return !/^[a-z]:[\\/]/i.test(linkText) && /^[a-z][a-z0-9+.-]*:/i.test(linkText)
		? vscode.Uri.parse(linkText, true)
		: undefined;
}

function getSelectionFromLocationFragment(fragment: string): vscode.Range | undefined {
	const match = /^L?(\d+)(?:,(\d+))?(?:-L?(\d+)(?:,(\d+))?)?$/i.exec(fragment);
	if (!match) {
		return undefined;
	}

	const startLineNumber = parseInt(match[1], 10);
	if (isNaN(startLineNumber) || startLineNumber <= 0) {
		return undefined;
	}

	const startColumn = match[2] ? parseInt(match[2], 10) : 1;
	const endLineNumberRaw = match[3] ? parseInt(match[3], 10) : undefined;
	if (typeof endLineNumberRaw !== 'undefined' && endLineNumberRaw <= 0) {
		return undefined;
	}
	const endLineNumber = endLineNumberRaw;
	const endColumn = match[3] ? (match[4] ? parseInt(match[4], 10) : 1) : undefined;

	let normalizedStartLine = startLineNumber;
	let normalizedStartColumn = startColumn;
	let normalizedEndLine = endLineNumber;
	let normalizedEndColumn = endColumn ?? 1;

	if (typeof normalizedEndLine === 'number') {
		if (normalizedEndLine < normalizedStartLine || (normalizedEndLine === normalizedStartLine && normalizedEndColumn < normalizedStartColumn)) {
			const tmpLine = normalizedStartLine;
			const tmpColumn = normalizedStartColumn;
			normalizedStartLine = normalizedEndLine;
			normalizedStartColumn = normalizedEndColumn;
			normalizedEndLine = tmpLine;
			normalizedEndColumn = tmpColumn;
		}
	}

	const start = new vscode.Position(normalizedStartLine - 1, Math.max(0, normalizedStartColumn - 1));
	const end = typeof normalizedEndLine === 'number'
		? new vscode.Position(normalizedEndLine - 1, Math.max(0, normalizedEndColumn - 1))
		: start;

	return new vscode.Range(start, end);
}

function getLocationFragmentFromLinkText(linkText: string): string | undefined {
	const fragmentStart = linkText.indexOf('#');
	if (fragmentStart < 0) {
		return undefined;
	}

	let fragment: string;
	try {
		fragment = decodeURIComponent(linkText.slice(fragmentStart + 1));
	} catch {
		return undefined;
	}
	if (!fragment) {
		return undefined;
	}

	if (/^L?\d+(?:,\d+)?(?:-L?\d+(?:,\d+)?)?$/i.test(fragment)) {
		return fragment;
	}

	return undefined;
}

function getViewColumn(resource: vscode.Uri): vscode.ViewColumn {
	const config = vscode.workspace.getConfiguration('markdown', resource);
	const openLinks = config.get<OpenMarkdownLinks>('links.openLocation', OpenMarkdownLinks.currentGroup);
	switch (openLinks) {
		case OpenMarkdownLinks.beside:
			return vscode.ViewColumn.Beside;
		case OpenMarkdownLinks.currentGroup:
		default:
			return vscode.ViewColumn.Active;
	}
}
