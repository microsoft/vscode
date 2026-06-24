/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { t } from '@vscode/l10n';
import * as vscode from 'vscode';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { collapseRangeToStart } from '../../../util/common/range';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { combinedDisposable } from '../../../util/vs/base/common/lifecycle';
import { UriComponents } from '../../../util/vs/base/common/uri';
import { openFileLinkCommand, OpenFileLinkCommandArgs, openSymbolInFileCommand, OpenSymbolInFileCommandArgs } from '../common/commands';
import { findBestSymbolByPath } from './findSymbol';

export const openSymbolFromReferencesCommand = '_github.copilot.openSymbolFromReferences';

export type OpenSymbolFromReferencesCommandArgs = [_word_unused: string, locations: ReadonlyArray<{ uri: UriComponents; pos: vscode.Position }>, requestId: string | undefined];


export function registerLinkCommands(
	telemetryService: ITelemetryService,
) {
	return combinedDisposable(
		vscode.commands.registerCommand(openFileLinkCommand, async (...[path, requestId]: OpenFileLinkCommandArgs) => {
			/* __GDPR__
				"panel.action.filelink" : {
					"owner": "digitarald",
					"comment": "Clicks on file links in the panel response",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id of the chat request." }
				}
			*/
			telemetryService.sendMSFTTelemetryEvent('panel.action.filelink', {
				requestId
			});

			const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
			if (!workspaceRoot) {
				return;
			}
			const fileUri = typeof path === 'string' ? vscode.Uri.joinPath(workspaceRoot, path) : vscode.Uri.from(path);

			if (await isDirectory(fileUri)) {
				await vscode.commands.executeCommand('revealInExplorer', fileUri);
			} else {
				return vscode.commands.executeCommand('vscode.open', fileUri);
			}

			async function isDirectory(uri: vscode.Uri): Promise<boolean> {
				if (uri.path.endsWith('/')) {
					return true;
				}

				try {
					const stat = await vscode.workspace.fs.stat(uri);
					return stat.type === vscode.FileType.Directory;
				} catch {
					return false;
				}
			}
		}),

		// Command used when we have a symbol name and file path but not a line number
		// This is currently used by the symbol for links such as: [`symbol`](file.ts)
		vscode.commands.registerCommand(openSymbolInFileCommand, async (...[inFileUri, symbolText, requestId]: OpenSymbolInFileCommandArgs) => {
			const fileUri = vscode.Uri.from(inFileUri);

			let symbols: Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined;
			try {
				symbols = await vscode.commands.executeCommand<Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined>('vscode.executeDocumentSymbolProvider', fileUri);
			} catch (e) {
				console.error(e);
			}

			if (symbols?.length) {
				const matchingSymbol = findBestSymbolByPath(symbols, symbolText);

				/* __GDPR__
					"panel.action.symbollink" : {
						"owner": "digitarald",
						"comment": "Clicks on symbol links in the panel response",
						"hadMatch": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the symbol was found." },
						"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id of the chat request." }
					}
				*/
				telemetryService.sendMSFTTelemetryEvent('panel.action.symbollink', {
					requestId,
				}, {
					hadMatch: matchingSymbol ? 1 : 0
				});
				if (matchingSymbol) {
					const range = matchingSymbol instanceof vscode.SymbolInformation ? matchingSymbol.location.range : matchingSymbol.selectionRange;
					return vscode.commands.executeCommand('vscode.open', fileUri, {
						selection: new vscode.Range(range.start, range.start), // Move cursor to the start of the symbol
					} satisfies vscode.TextDocumentShowOptions);
				}
			}

			return vscode.commands.executeCommand('vscode.open', fileUri);
		}),

		// Command used when we have already resolved the link to a location.
		// This is currently used by the inline code linkifier for links such as `symbolName`
		vscode.commands.registerCommand(openSymbolFromReferencesCommand, async (...[_word, locations, requestId]: OpenSymbolFromReferencesCommandArgs) => {
			const dest = await resolveSymbolFromReferences(locations, undefined, CancellationToken.None);

			/* __GDPR__
				"panel.action.openSymbolFromReferencesLink" : {
					"owner": "mjbvz",
					"comment": "Clicks on symbol links in the panel response",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id of the chat request." },
					"resolvedDestinationType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the link was actually resolved." }
				}
			*/
			telemetryService.sendMSFTTelemetryEvent('panel.action.openSymbolFromReferencesLink', {
				requestId,
				resolvedDestinationType: dest?.type ?? 'unresolved',
			});

			if (dest) {
				const selectionRange = dest.loc.targetSelectionRange ?? dest.loc.targetRange;
				return vscode.commands.executeCommand('vscode.open', dest.loc.targetUri, {
					selection: collapseRangeToStart(selectionRange),
				} satisfies vscode.TextDocumentShowOptions);
			} else {
				return vscode.window.showWarningMessage(t('Could not resolve this symbol in the current workspace.'));
			}
		})
	);
}

function toLocationLink(def: vscode.Location | vscode.LocationLink): vscode.LocationLink {
	if ('uri' in def) {
		return { targetUri: def.uri, targetRange: def.range };
	} else {
		return def;
	}
}

function findSymbolByName(symbols: Array<vscode.SymbolInformation | vscode.DocumentSymbol>, symbolName: string, maxDepth: number = 5): vscode.SymbolInformation | vscode.DocumentSymbol | undefined {
	for (const symbol of symbols) {
		if (symbol.name === symbolName) {
			return symbol;
		}
		// Check children if it's a DocumentSymbol and we haven't exceeded max depth
		if (maxDepth > 0 && 'children' in symbol && symbol.children) {
			const found = findSymbolByName(symbol.children, symbolName, maxDepth - 1);
			if (found) {
				return found;
			}
		}
	}
	return undefined;
}

export async function resolveSymbolFromReferences(locations: ReadonlyArray<{ uri: UriComponents; pos: vscode.Position }>, symbolText: string | undefined, token: CancellationToken) {
	let dest: {
		type: 'definition' | 'firstOccurrence' | 'unresolved';
		loc: vscode.LocationLink;
	} | undefined;

	// Extract the rightmost part from qualified symbol like "TextModel.undo()"
	const symbolParts = symbolText ? Array.from(symbolText.matchAll(/[#\w$][\w\d$]*/g), x => x[0]) : [];
	const targetSymbolName = symbolParts.length >= 2 ? symbolParts[symbolParts.length - 1] : undefined;

	// TODO: These locations may no longer be valid if the user has edited the file since the references were found.
	for (const loc of locations) {
		try {
			const def = (await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>('vscode.executeDefinitionProvider', vscode.Uri.from(loc.uri), loc.pos)).at(0);
			if (token.isCancellationRequested) {
				return;
			}

			if (def) {
				const defLoc = toLocationLink(def);

				// If we have a qualified name like "TextModel.undo()", try to find the specific symbol in the file
				if (targetSymbolName && symbolParts.length >= 2) {
					try {
						const symbols = await vscode.commands.executeCommand<Array<vscode.SymbolInformation | vscode.DocumentSymbol> | undefined>('vscode.executeDocumentSymbolProvider', defLoc.targetUri);
						if (symbols) {
							// Search for the target symbol in the document symbols
							const targetSymbol = findSymbolByName(symbols, targetSymbolName);
							if (targetSymbol) {
								let targetRange: vscode.Range;
								if ('selectionRange' in targetSymbol) {
									targetRange = targetSymbol.selectionRange;
								} else {
									targetRange = targetSymbol.location.range;
								}
								dest = {
									type: 'definition',
									loc: { targetUri: defLoc.targetUri, targetRange: targetRange, targetSelectionRange: targetRange },
								};
								break;
							}
						}
					} catch {
						// Failed to find symbol, fall through to use the first definition
					}
				}

				dest = {
					type: 'definition',
					loc: defLoc,
				};
				break;
			}
		} catch (e) {
			console.error(e);
		}
	}

	if (!dest) {
		const firstLoc = locations.at(0);
		if (firstLoc) {
			dest = {
				type: 'firstOccurrence',
				loc: { targetUri: vscode.Uri.from(firstLoc.uri), targetRange: new vscode.Range(firstLoc.pos, firstLoc.pos) }
			};
		}
	}

	return dest;
}
