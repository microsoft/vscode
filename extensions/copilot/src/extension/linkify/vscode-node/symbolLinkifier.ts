/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IParserService } from '../../../platform/parser/node/parserService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { collapseRangeToStart } from '../../../util/common/range';
import { Limiter } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isEqualOrParent } from '../../../util/vs/base/common/resources';
import { SymbolInformation, Uri } from '../../../vscodeTypes';
import { LinkifiedPart, LinkifiedText, LinkifySymbolAnchor } from '../common/linkifiedText';
import { IContributedLinkifier, LinkifierContext } from '../common/linkifyService';
import { findBestSymbolByPath } from './findSymbol';
import { findSymbolLocationInFile, type SymbolFileCache } from './findWord';

const maxParallelSymbolLinkResolutions = 10;

interface ResolvedSymbolLinkMatch {
	readonly match: RegExpExecArray;
	readonly symbolText: string;
	readonly resolvedUri: Uri | undefined;
	readonly initialLocation: vscode.Location | undefined;
}

/**
 * Linkifies symbol paths in responses. For example:
 *
 * ```
 * [`symbol`](file.md)
 * ```
 */
export class SymbolLinkifier implements IContributedLinkifier {

	private readonly symbolFileCache: SymbolFileCache = new Map();

	constructor(
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IParserService private readonly parserService: IParserService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) { }

	async linkify(
		text: string,
		context: LinkifierContext,
		token: CancellationToken,
	): Promise<LinkifiedText | undefined> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (!workspaceFolders.length) {
			return;
		}

		const matches = [...text.matchAll(/\[`([^`\[\]]+?)`]\((\S+?\.\w+)\)/g)];
		const resolvedMatches = await this.resolveMatches(matches, workspaceFolders, token);

		const out: LinkifiedPart[] = [];
		let endLastMatch = 0;
		for (const { match, symbolText, resolvedUri, initialLocation } of resolvedMatches) {
			const prefix = text.slice(endLastMatch, match.index);
			if (prefix) {
				out.push(prefix);
			}

			if (resolvedUri) {
				out.push(this.createSymbolAnchor(symbolText, resolvedUri, initialLocation));
			} else {
				out.push('`' + symbolText + '`');
			}

			endLastMatch = match.index + match[0].length;
		}

		const suffix = text.slice(endLastMatch);
		if (suffix) {
			out.push(suffix);
		}

		return { parts: out };
	}

	private async resolveMatches(
		matches: readonly RegExpExecArray[],
		workspaceFolders: readonly Uri[],
		token: CancellationToken
	): Promise<ResolvedSymbolLinkMatch[]> {
		const limiter = new Limiter<ResolvedSymbolLinkMatch>(maxParallelSymbolLinkResolutions);
		try {
			const resolvedMatches = await Promise.all(matches.map(match => limiter.queue(() => this.resolveMatch(match, workspaceFolders, token))));
			return resolvedMatches;
		} finally {
			limiter.dispose();
		}
	}

	private async resolveMatch(
		match: RegExpExecArray,
		workspaceFolders: readonly Uri[],
		token: CancellationToken
	): Promise<ResolvedSymbolLinkMatch> {
		const symbolText = match[1];
		let symbolPath = match[2];
		try {
			symbolPath = decodeURIComponent(symbolPath);
		} catch {
			// noop
		}

		const resolvedUri = await this.resolveInWorkspace(symbolPath, workspaceFolders);
		const initialLocation = resolvedUri
			? await findSymbolLocationInFile(this.parserService, resolvedUri, symbolText, token, this.symbolFileCache).catch(() => undefined)
			: undefined;

		return { match, symbolText, resolvedUri, initialLocation };
	}

	private createSymbolAnchor(symbolText: string, resolvedUri: Uri, initialLocation: vscode.Location | undefined): LinkifySymbolAnchor {
		const info: SymbolInformation = {
			name: symbolText,
			containerName: '',
			kind: vscode.SymbolKind.Variable,
			location: initialLocation ?? new vscode.Location(resolvedUri, new vscode.Position(0, 0))
		};

		return new LinkifySymbolAnchor(info, async (token) => {
			let symbols: Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined;
			try {
				symbols = await vscode.commands.executeCommand<Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined>('vscode.executeDocumentSymbolProvider', resolvedUri);
			} catch {
				// noop
			}

			// Tree-sitter gives a best-effort initial location. Document symbols remain
			// the richer source for symbol kind and nested same-name disambiguation.
			if (symbols?.length) {
				const matchingSymbol = findBestSymbolByPath(symbols, symbolText);
				if (matchingSymbol) {
					info.kind = matchingSymbol.kind;

					// Not a real instance of 'vscode.DocumentSymbol' so use cast to check
					if ((matchingSymbol as vscode.DocumentSymbol).children) {
						const symbol = matchingSymbol as vscode.DocumentSymbol;
						info.location = new vscode.Location(resolvedUri, collapseRangeToStart(symbol.selectionRange));
					} else {
						const symbol = matchingSymbol as vscode.SymbolInformation;
						info.location = new vscode.Location(symbol.location.uri, collapseRangeToStart(symbol.location.range));
					}
				}
			}
			return info;
		});
	}

	private async resolveInWorkspace(symbolPath: string, workspaceFolders: readonly Uri[]): Promise<Uri | undefined> {
		const candidates = workspaceFolders.map(folder => Uri.joinPath(folder, symbolPath));
		const results = await Promise.all(candidates.map((uri, index) => {
			const workspaceFolder = workspaceFolders[index];
			if (!isEqualOrParent(uri, workspaceFolder)) {
				return undefined;
			}
			return this.exists(uri).then(exists => exists ? uri : undefined);
		}));
		return results.find((uri): uri is Uri => uri !== undefined);
	}

	private async exists(uri: Uri) {
		try {
			await this.fileSystem.stat(uri);
			return true;
		} catch {
			return false;
		}
	}
}
