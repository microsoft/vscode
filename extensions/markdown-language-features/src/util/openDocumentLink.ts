/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLanguageClient } from '../client/client';
import * as proto from '../client/protocol';

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

interface MdLinkOpenerOptions {
	readonly allowAbsoluteFilePathFallback?: boolean;
	readonly fileSystem?: Pick<typeof vscode.workspace.fs, 'stat'>;
}

type ResourceStat =
	| { readonly kind: 'found'; readonly stat: vscode.FileStat }
	| { readonly kind: 'notFound' }
	| { readonly kind: 'unavailable' };

export class MdLinkOpener {

	readonly #client: Pick<MdLanguageClient, 'resolveLinkTarget'>;
	readonly #allowAbsoluteFilePathFallback: boolean;
	readonly #fileSystem: Pick<typeof vscode.workspace.fs, 'stat'>;

	constructor(
		client: Pick<MdLanguageClient, 'resolveLinkTarget'>,
		options: MdLinkOpenerOptions = {},
	) {
		this.#client = client;
		this.#allowAbsoluteFilePathFallback = options.allowAbsoluteFilePathFallback ?? false;
		this.#fileSystem = options.fileSystem ?? vscode.workspace.fs;
	}

	public async resolveDocumentLink(
		linkText: string,
		fromResource: vscode.Uri,
	): Promise<proto.ResolvedDocumentLinkTarget | undefined> {
		const resolved = await this.#client.resolveLinkTarget(linkText, fromResource);
		if (!this.#allowAbsoluteFilePathFallback) {
			return resolved;
		}

		const absoluteFileUri = getAbsoluteFileUri(linkText, fromResource);
		if (!absoluteFileUri || resolved?.kind === 'external') {
			return resolved;
		}

		const absoluteFileResource = absoluteFileUri.with({ query: '', fragment: '' });
		const resolvedResource = resolved
			? vscode.Uri.from(resolved.uri).with({ query: '', fragment: '' })
			: undefined;
		// Preserve normal Markdown resolution whenever it points at an existing
		// resource. Only then reinterpret the link as a filesystem-absolute path.
		if (resolvedResource?.toString() === absoluteFileResource.toString()) {
			return resolved;
		}
		if (resolvedResource) {
			const resolvedStat = await this.#stat(resolvedResource);
			if (resolvedStat.kind !== 'notFound') {
				return resolved;
			}
		}

		const absoluteFileStat = await this.#stat(absoluteFileResource);
		if (absoluteFileStat.kind !== 'found' || absoluteFileStat.stat.type & vscode.FileType.Directory) {
			return resolved;
		}
		return { kind: 'file', uri: absoluteFileResource };
	}

	public async openDocumentLink(
		linkText: string,
		fromResource: vscode.Uri,
		viewColumn?: vscode.ViewColumn,
	): Promise<void> {
		const absoluteUri = getAbsoluteUri(linkText);
		if (absoluteUri && absoluteUri.scheme !== 'file') {
			await openExternal(absoluteUri);
			return;
		}

		const resolved = await this.resolveDocumentLink(linkText, fromResource);
		if (!resolved) {
			return;
		}

		let uri = vscode.Uri.from(resolved.uri);
		let rangeSelection: vscode.Range | undefined;
		if (resolved.kind === 'file' && !resolved.position) {
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
					selection: resolved.position
						? new vscode.Range(resolved.position.line, resolved.position.character, resolved.position.line, resolved.position.character)
						: rangeSelection,
					viewColumn: viewColumn ?? getViewColumn(fromResource),
				} satisfies vscode.TextDocumentShowOptions);
			}
		}
	}

	async #stat(resource: vscode.Uri): Promise<ResourceStat> {
		try {
			return { kind: 'found', stat: await this.#fileSystem.stat(resource) };
		} catch (error) {
			if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
				return { kind: 'notFound' };
			}
			// This is a speculative fallback. If a provider cannot stat the resource,
			// preserve the normal Markdown resolution instead of breaking the click.
			return { kind: 'unavailable' };
		}
	}
}

async function openExternal(uri: vscode.Uri): Promise<void> {
	if (uri.scheme === 'http' || uri.scheme === 'https') {
		await vscode.env.openExternal(uri, { allowContributedOpeners: true });
	} else {
		await vscode.commands.executeCommand('vscode.open', uri);
	}
}

export function getAbsoluteUri(linkText: string): vscode.Uri | undefined {
	return !/^[a-z]:[\\/]/i.test(linkText) && /^[a-z][a-z0-9+.-]*:/i.test(linkText)
		? vscode.Uri.parse(linkText, true)
		: undefined;
}

function getAbsoluteFileUri(linkText: string, fromResource: vscode.Uri): vscode.Uri | undefined {
	const absoluteUri = getAbsoluteUri(linkText);
	if (absoluteUri) {
		return absoluteUri.scheme === 'file' ? absoluteUri : undefined;
	}

	if ((fromResource.scheme !== 'file' && fromResource.scheme !== 'vscode-remote')
		|| linkText.startsWith('//')
		|| linkText.startsWith('\\\\')) {
		return undefined;
	}

	let parsed: vscode.Uri;
	try {
		parsed = vscode.Uri.parse(`markdown-link:${linkText}`);
	} catch {
		return undefined;
	}
	if (parsed.authority) {
		return undefined;
	}
	if (!parsed.path.startsWith('/') && !/^[a-z]:[\\/]/i.test(parsed.path)) {
		return undefined;
	}
	if (parsed.path.replace(/\\/g, '/').startsWith('//')) {
		return undefined;
	}

	const fileUri = vscode.Uri.file(parsed.path);
	if (fileUri.authority) {
		return undefined;
	}
	return fileUri.with({
		scheme: fromResource.scheme,
		authority: fromResource.authority,
		query: parsed.query,
		fragment: parsed.fragment,
	});
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
