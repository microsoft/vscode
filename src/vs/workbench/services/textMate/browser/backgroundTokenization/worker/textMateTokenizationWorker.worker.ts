/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { LanguageId } from '../../../../../../editor/common/encodedTokenAttributes.js';
import { IModelChangedEvent } from '../../../../../../editor/common/model/mirrorTextModel.js';
import { ICreateGrammarResult, TMGrammarFactory } from '../../../common/TMGrammarFactory.js';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, IValidTokenTypeMap } from '../../../common/TMScopeRegistry.js';
import type { IOnigLib, IRawTheme, StackDiff } from 'vscode-textmate';
import { TextMateWorkerTokenizer } from './textMateWorkerTokenizer.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { IWebWorkerServerRequestHandler, IWebWorkerServer } from '../../../../../../base/common/worker/webWorker.js';
import { TextMateWorkerHost } from './textMateWorkerHost.js';

export function create(workerServer: IWebWorkerServer): TextMateTokenizationWorker {
	return new TextMateTokenizationWorker(workerServer);
}

export interface ICreateData {
	grammarDefinitions: IValidGrammarDefinitionDTO[];
	onigurumaWASMUri: string;
}

export interface IValidGrammarDefinitionDTO {
	location: UriComponents;
	language?: string;
	scopeName: string;
	embeddedLanguages: IValidEmbeddedLanguagesMap;
	tokenTypes: IValidTokenTypeMap;
	injectTo?: string[];
	balancedBracketSelectors: string[];
	unbalancedBracketSelectors: string[];
	sourceExtensionId?: string;
}

export interface StateDeltas {
	startLineNumber: number;
	// null means the state for that line did not change
	stateDeltas: (StackDiff | null)[];
}

export class TextMateTokenizationWorker implements IWebWorkerServerRequestHandler {
	_requestHandlerBrand: void = undefined;

	private readonly _host: TextMateWorkerHost;
	private readonly _models = new Map</* controllerId */ number, TextMateWorkerTokenizer>();
	private readonly _grammarCache: Promise<ICreateGrammarResult>[] = [];
	private _grammarFactory: Promise<TMGrammarFactory | null> = Promise.resolve(null);

	constructor(workerServer: IWebWorkerServer) {
		this._host = TextMateWorkerHost.getChannel(workerServer);
	}

	public async $init(_createData: ICreateData): Promise<void> {
		const grammarDefinitions = _createData.grammarDefinitions.map<IValidGrammarDefinition>((def) => {
			return {
				location: URI.revive(def.location),
				language: def.language,
				scopeName: def.scopeName,
				embeddedLanguages: def.embeddedLanguages,
				tokenTypes: def.tokenTypes,
				injectTo: def.injectTo,
				balancedBracketSelectors: def.balancedBracketSelectors,
				unbalancedBracketSelectors: def.unbalancedBracketSelectors,
				sourceExtensionId: def.sourceExtensionId,
			};
		});
		this._grammarFactory = this._loadTMGrammarFactory(grammarDefinitions, _createData.onigurumaWASMUri);
	}

	private async _loadTMGrammarFactory(grammarDefinitions: IValidGrammarDefinition[], onigurumaWASMUri: string): Promise<TMGrammarFactory> {
		const vscodeTextmate = await importAMDNodeModule<typeof import('vscode-textmate')>('vscode-textmate', 'release/main.js');
		const vscodeOniguruma = await importAMDNodeModule<typeof import('vscode-oniguruma')>('vscode-oniguruma', 'release/main.js');
		const response = await fetch(onigurumaWASMUri);

		// Using the response directly only works if the server sets the MIME type 'application/wasm'.
		// Otherwise, a TypeError is thrown when using the streaming compiler.
		// We therefore use the non-streaming compiler :(.
		const bytes = await response.arrayBuffer();
		await vscodeOniguruma.loadWASM(bytes);

		const onigLib: Promise<IOnigLib> = Promise.resolve({
			createOnigScanner: (sources) => vscodeOniguruma.createOnigScanner(sources),
			createOnigString: (str) => vscodeOniguruma.createOnigString(str)
		});

		return new TMGrammarFactory({
			logTrace: (msg: string) => {/* console.log(msg) */ },
			logError: (msg: string, err: unknown) => console.error(msg, err),
			readFile: (resource: URI) => this._host.$readFile(resource)
		}, grammarDefinitions, vscodeTextmate, onigLib);
	}

	// These methods are called by the renderer

	public $acceptNewModel(data: IRawModelData): void {
		const uri = URI.revive(data.uri);
		const that = this;
		this._models.set(data.controllerId, new TextMateWorkerTokenizer(uri, data.lines, data.EOL, data.versionId, {
			async getOrCreateGrammar(languageId: string, encodedLanguageId: LanguageId): Promise<ICreateGrammarResult | null> {
				const grammarFactory = await that._grammarFactory;
				if (!grammarFactory) {
					return Promise.resolve(null);
				}
				if (!that._grammarCache[encodedLanguageId]) {
					that._grammarCache[encodedLanguageId] = grammarFactory.createGrammar(languageId, encodedLanguageId);
				}
				return that._grammarCache[encodedLanguageId];
			},
			setTokensAndStates(versionId: number, tokens: Uint8Array, stateDeltas: StateDeltas[]): void {
				that._host.$setTokensAndStates(data.controllerId, versionId, tokens, stateDeltas);
			},
			reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void {
				that._host.$reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, isRandomSample);
			},
		}, data.languageId, data.encodedLanguageId, data.maxTokenizationLineLength));
	}

	public $acceptModelChanged(controllerId: number, e: IModelChangedEvent): void {
		this._models.get(controllerId)!.onEvents(e);
	}

	public $retokenize(controllerId: number, startLineNumber: number, endLineNumberExclusive: number): void {
		this._models.get(controllerId)!.retokenize(startLineNumber, endLineNumberExclusive);
	}

	public $acceptModelLanguageChanged(controllerId: number, newLanguageId: string, newEncodedLanguageId: LanguageId): void {
		this._models.get(controllerId)!.onLanguageId(newLanguageId, newEncodedLanguageId);
	}

	public $acceptRemovedModel(controllerId: number): void {
		const model = this._models.get(controllerId);
		if (model) {
			model.dispose();
			this._models.delete(controllerId);
		}
	}

	public async $acceptTheme(theme: IRawTheme, colorMap: string[]): Promise<void> {
		const grammarFactory = await this._grammarFactory;
		grammarFactory?.setTheme(theme, colorMap);
	}

	public $acceptMaxTokenizationLineLength(controllerId: number, value: number): void {
		this._models.get(controllerId)!.acceptMaxTokenizationLineLength(value);
	}
}

export interface IRawModelData {
	uri: UriComponents;
	versionId: number;
	lines: string[];
	EOL: string;
	languageId: string;
	encodedLanguageId: LanguageId;
	maxTokenizationLineLength: number;
	controllerId: number;
}
