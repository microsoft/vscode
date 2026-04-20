/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { collapseRangeToStart } from '../../../util/common/range';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { SymbolInformation, Uri } from '../../../vscodeTypes';
import { LinkifiedPart, LinkifiedText, LinkifySymbolAnchor } from '../common/linkifiedText';
import { IContributedLinkifier, LinkifierContext } from '../common/linkifyService';
import { findBestSymbolByPath } from './findSymbol';

/**
 * Linkifies symbol paths in responses. For example:
 *
 * ```
 * [`symbol`](file.md)
 * ```
 */
export class SymbolLinkifier implements IContributedLinkifier {

	constructor(
		@IFileSystemService private readonly fileSystem: IFileSystemService,
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

		const out: LinkifiedPart[] = [];

		let endLastMatch = 0;
		for (const match of text.matchAll(/\[`([^`\[\]]+?)`]\((\S+?\.\w+)\)/g)) {
			const prefix = text.slice(endLastMatch, match.index);
			if (prefix) {
				out.push(prefix);
			}

			const symbolText = match[1];
			let symbolPath = match[2];
			try {
				symbolPath = decodeURIComponent(symbolPath);
			} catch {
				// noop
			}

			const resolvedUri = await this.resolveInWorkspace(symbolPath, workspaceFolders);

			if (resolvedUri) {
				const info: SymbolInformation = {
					name: symbolText,
					containerName: '',
					kind: vscode.SymbolKind.Variable,
					location: new vscode.Location(resolvedUri, new vscode.Position(0, 0))
				};

				out.push(new LinkifySymbolAnchor(info, async (token) => {
					let symbols: Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined;
					try {
						symbols = await vscode.commands.executeCommand<Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined>('vscode.executeDocumentSymbolProvider', resolvedUri);
					} catch (e) {
						// Noop
					}

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
				}));
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

	private async resolveInWorkspace(symbolPath: string, workspaceFolders: readonly Uri[]): Promise<Uri | undefined> {
		const candidates = workspaceFolders.map(folder => Uri.joinPath(folder, symbolPath));
		const results = await Promise.all(candidates.map(uri => this.exists(uri).then(exists => exists ? uri : undefined)));
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
