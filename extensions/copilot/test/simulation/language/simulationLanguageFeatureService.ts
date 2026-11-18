/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';
import { ILanguageFeaturesService, NoopLanguageFeaturesService } from '../../../src/platform/languages/common/languageFeaturesService';
import { SimulationWorkspace } from '../../../src/platform/test/node/simulationWorkspace';
import { getLanguageForResource } from '../../../src/util/common/languages';
import { URI } from '../../../src/util/vs/base/common/uri';
import { Range, Uri } from '../../../src/vscodeTypes';
import { computeSHA256 } from '../../base/hash';
import { TestingCacheSalts } from '../../base/salts';
import { CacheScope, ICachingResourceFetcher } from '../../base/simulationContext';
import { TSServerClient } from './tsServerClient';


export class SimulationLanguageFeaturesService implements ILanguageFeaturesService {
	_serviceBrand: undefined;
	private readonly _tsService: TSServerLanguageFeaturesService;
	private readonly _noOpService: NoopLanguageFeaturesService;

	constructor(
		readonly _workspace: SimulationWorkspace,
		@ICachingResourceFetcher _cachingResourceFetcher: ICachingResourceFetcher
	) {
		this._tsService = new TSServerLanguageFeaturesService(_workspace, _cachingResourceFetcher);
		this._noOpService = new NoopLanguageFeaturesService();
	}


	private getLanguageFeatures(uri: vscode.Uri) {
		const language = getLanguageForResource(uri);
		switch (language?.languageId) {
			case 'javascript':
			case 'javascriptreact':
			case 'typescript':
			case 'typescriptreact':
				return this._tsService;
			default:
				return this._noOpService;
		}
	}

	getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
		return this.getLanguageFeatures(uri).getDocumentSymbols(uri);
	}
	getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return this.getLanguageFeatures(uri).getDefinitions(uri, position);
	}
	getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return this.getLanguageFeatures(uri).getImplementations(uri, position);
	}
	getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
		return this.getLanguageFeatures(uri).getReferences(uri, position);
	}
	getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
		return this.getLanguageFeatures(uri).getDiagnostics(uri);
	}
	getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		return Promise.resolve([]);
	}
	dispose(): void {
		this._tsService.teardown().catch(err => {
			console.error(err);
		});
	}
	teardown(): Promise<void> {
		return this._tsService.teardown();
	}
}

class TSServerLanguageFeaturesService implements ILanguageFeaturesService {
	_serviceBrand: undefined;

	private _tsServerClient: TSServerClient | undefined;

	constructor(
		private _workspace: SimulationWorkspace,
		@ICachingResourceFetcher private readonly _cachingResourceFetcher: ICachingResourceFetcher
	) {
	}

	public async teardown() {
		try {
			await this._tsServerClient?.teardown();
		} catch {
			// ignored
		}
	}

	public async getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<vscode.LocationLink[]> {
		return (await this.cachedGetFromTSServer(uri, position, 'def', async (tsserver, currentFile, position) => {
			const definitions = await tsserver.findDefinitions(currentFile, position);
			return definitions.map(def => {
				return {
					targetUri: this._workspace.getUriFromFilePath(def.fileName),
					targetRange: def.range
				};
			});
		})).map((def: any) => {
			return {
				...def,
				targetUri: URI.isUri(def.targetUri) ? def.targetUri : Uri.file(def.targetUri.path),
				targetRange: def.targetRange instanceof Range ? def.targetRange : new Range(def.targetRange[0].line, def.targetRange[0].character, def.targetRange[1].line, def.targetRange[1].character),
			};
		});
	}

	public async getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
		return (await this.cachedGetFromTSServer(uri, position, 'ref', async (tsserver, currentFile, position) => {
			const references = await tsserver.findReferences(currentFile, position);
			return references.map(ref => {
				return {
					uri: this._workspace.getUriFromFilePath(ref.fileName),
					range: ref.range
				};
			});
		})).map((ref: any) => {
			return {
				...ref,
				uri: URI.isUri(ref.uri) ? ref.uri : Uri.file(ref.uri.path),
				range: ref.range instanceof Range ? ref.range : new Range(ref.range[0].line, ref.range[0].character, ref.range[1].line, ref.range[1].character),
			};
		});
	}

	private async cachedGetFromTSServer<T extends vscode.LocationLink | vscode.Location>(
		uri: vscode.Uri,
		position: vscode.Position,
		target: 'ref' | 'def',
		f: (tsserver: TSServerClient, currentFile: string, pos: vscode.Position) => Promise<T[]>): Promise<T[]> {
		const currentFile = this._workspace.getFilePath(uri);
		const files = this._workspace.documents.map(d => ({ fileName: this._workspace.getFilePath(d.document.uri), fileContents: d.getText() }));
		const serializablePosition = { line: position.line, character: position.character };

		const cacheKey = computeSHA256(`${TSServerClient.id}-v${TSServerClient.cacheVersion}-${target}-${JSON.stringify({ files, currentFile, serializablePosition })}`);

		const getFromTSServer = async () => {
			try {
				if (this._tsServerClient === undefined) {
					this._tsServerClient = new TSServerClient(files);
				}
				return f(this._tsServerClient, currentFile, position);
			} catch (error) {
				console.error(error);
				return [];
			}
		};
		return this._cachingResourceFetcher.invokeWithCache(CacheScope.TSC, undefined, TestingCacheSalts.tscCacheSalt, cacheKey, getFromTSServer);
	}

	getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.Location | vscode.LocationLink)[]> {
		return Promise.resolve([]);
	}
	getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		return Promise.resolve([]);
	}
	getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
		return Promise.resolve([]);
	}
	getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
		return [];
	}
}
