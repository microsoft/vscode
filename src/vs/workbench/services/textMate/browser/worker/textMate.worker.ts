/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import { IWorkerContext } from 'vs/editor/common/services/editorSimpleWorker';
import type { StateDeltas, TextMateWorkerHost } from 'vs/workbench/services/textMate/browser/workerHost/textMateWorkerHost';
import { ICreateGrammarResult, TMGrammarFactory } from 'vs/workbench/services/textMate/common/TMGrammarFactory';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, IValidTokenTypeMap } from 'vs/workbench/services/textMate/common/TMScopeRegistry';
import type { IOnigLib, IRawTheme } from 'vscode-textmate';
import { TextMateWorkerModel } from './textMateWorkerModel';

export interface ICreateData {
	grammarDefinitions: IValidGrammarDefinitionDTO[];
	textmateMainUri: string;
	onigurumaMainUri: string;
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

export class TextMateTokenizationWorker {

	private readonly _host: TextMateWorkerHost;
	private readonly _models: { [uri: string]: TextMateWorkerModel } = Object.create(null);
	private readonly _grammarCache: Promise<ICreateGrammarResult>[] = [];
	private readonly _grammarFactory: Promise<TMGrammarFactory | null>;

	constructor(ctx: IWorkerContext<TextMateWorkerHost>, private readonly createData: ICreateData) {
		this._host = ctx.host;
		const grammarDefinitions = createData.grammarDefinitions.map<IValidGrammarDefinition>((def) => {
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
		this._grammarFactory = this._loadTMGrammarFactory(grammarDefinitions);
	}

	private async _loadTMGrammarFactory(grammarDefinitions: IValidGrammarDefinition[]): Promise<TMGrammarFactory> {
		const uri = this.createData.textmateMainUri;
		const vscodeTextmate = await import(uri);
		const vscodeOniguruma = await import(this.createData.onigurumaMainUri);
		const response = await fetch(this.createData.onigurumaWASMUri);

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
			logError: (msg: string, err: any) => console.error(msg, err),
			readFile: (resource: URI) => this._host.readFile(resource)
		}, grammarDefinitions, vscodeTextmate, onigLib);
	}

	// #region called by renderer

	public acceptNewModel(data: IRawModelData): void {
		const uri = URI.revive(data.uri);
		const key = uri.toString();
		this._models[key] = new TextMateWorkerModel(uri, data.lines, data.EOL, data.versionId, this, data.languageId, data.encodedLanguageId, data.maxTokenizationLineLength);
	}

	public acceptModelChanged(strURL: string, e: IModelChangedEvent): void {
		this._models[strURL].onEvents(e);
	}

	public retokenize(strURL: string, startLineNumber: number, endLineNumberExclusive: number): void {
		this._models[strURL].retokenize(startLineNumber, endLineNumberExclusive);
	}

	public acceptModelLanguageChanged(strURL: string, newLanguageId: string, newEncodedLanguageId: LanguageId): void {
		this._models[strURL].onLanguageId(newLanguageId, newEncodedLanguageId);
	}

	public acceptRemovedModel(strURL: string): void {
		if (this._models[strURL]) {
			this._models[strURL].dispose();
			delete this._models[strURL];
		}
	}

	public async acceptTheme(theme: IRawTheme, colorMap: string[]): Promise<void> {
		const grammarFactory = await this._grammarFactory;
		grammarFactory?.setTheme(theme, colorMap);
	}

	public acceptMaxTokenizationLineLength(strURL: string, value: number): void {
		this._models[strURL].acceptMaxTokenizationLineLength(value);
	}

	// #endregion

	// #region called by worker model

	public async getOrCreateGrammar(languageId: string, encodedLanguageId: LanguageId): Promise<ICreateGrammarResult | null> {
		const grammarFactory = await this._grammarFactory;
		if (!grammarFactory) {
			return Promise.resolve(null);
		}
		if (!this._grammarCache[encodedLanguageId]) {
			this._grammarCache[encodedLanguageId] = grammarFactory.createGrammar(languageId, encodedLanguageId);
		}
		return this._grammarCache[encodedLanguageId];
	}

	public setTokensAndStates(resource: URI, versionId: number, tokens: Uint8Array, stateDeltas: StateDeltas[]): void {
		this._host.setTokensAndStates(resource, versionId, tokens, stateDeltas);
	}

	public reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number): void {
		this._host.reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength);
	}

	// #endregion
}

export interface IRawModelData {
	uri: UriComponents;
	versionId: number;
	lines: string[];
	EOL: string;
	languageId: string;
	encodedLanguageId: LanguageId;
	maxTokenizationLineLength: number;
}

export function create(ctx: IWorkerContext<TextMateWorkerHost>, createData: ICreateData): TextMateTokenizationWorker {
	return new TextMateTokenizationWorker(ctx, createData);
}
