/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkerContext } from 'vs/editor/common/services/editorSimpleWorker';
import { UriComponents, URI } from 'vs/base/common/uri';
import { LanguageId } from 'vs/editor/common/modes';
import { IValidEmbeddedLanguagesMap, IValidTokenTypeMap, IValidGrammarDefinition } from 'vs/workbench/services/textMate/common/TMScopeRegistry';
import { TMGrammarFactory, ICreateGrammarResult } from 'vs/workbench/services/textMate/common/TMGrammarFactory';
import { IModelChangedEvent, MirrorTextModel } from 'vs/editor/common/model/mirrorTextModel';

export interface IValidGrammarDefinitionDTO {
	location: UriComponents;
	language?: LanguageId;
	scopeName: string;
	embeddedLanguages: IValidEmbeddedLanguagesMap;
	tokenTypes: IValidTokenTypeMap;
	injectTo?: string[];
}

export interface ICreateData {
	grammarDefinitions: IValidGrammarDefinitionDTO[];
}

export interface IRawModelData {
	uri: UriComponents;
	versionId: number;
	lines: string[];
	EOL: string;
	languageId: LanguageId;
}

class TextMateWorkerModel extends MirrorTextModel {

	private readonly _worker: TextMateWorker;
	private _languageId: LanguageId;

	constructor(uri: URI, lines: string[], eol: string, versionId: number, worker: TextMateWorker, languageId: LanguageId) {
		super(uri, lines, eol, versionId);
		this._worker = worker;
		this._languageId = languageId;
		this._resetTokenization();
	}

	onLanguageId(languageId: LanguageId): void {
		this._languageId = languageId;
		this._resetTokenization();
	}

	private _resetTokenization(): void {
		console.log(this._worker, this._languageId);
		// this._worker.getOrCreateGrammar(this._languageId).then((r) => {
		// 	console.log(r);
		// });
	}
}

export class TextMateWorker {

	private readonly _models: { [uri: string]: TextMateWorkerModel; };
	private readonly _grammarCache: Promise<ICreateGrammarResult>[];
	private readonly _grammarFactory: TMGrammarFactory;

	constructor(ctx: IWorkerContext, createData: ICreateData) {
		this._models = Object.create(null);
		this._grammarCache = [];
		const grammarDefinitions = createData.grammarDefinitions.map<IValidGrammarDefinition>((def) => {
			return {
				location: URI.revive(def.location),
				language: def.language,
				scopeName: def.scopeName,
				embeddedLanguages: def.embeddedLanguages,
				tokenTypes: def.tokenTypes,
				injectTo: def.injectTo,
			};
		});

		let vscodeTextmate: typeof import('vscode-textmate');
		const globalDefine = (<any>self).define;
		try {
			(<any>self).define.amd = undefined;
			vscodeTextmate = require.__$__nodeRequire('vscode-textmate');
		} catch (err) {
			console.error(err);
			return;
		} finally {
			(<any>self).define = globalDefine;
		}

		this._grammarFactory = new TMGrammarFactory({
			logTrace: (msg: string) => console.log(msg),
			logError: (msg: string, err: any) => console.error(msg, err),
			readFile: async (resource: URI) => {
				throw new Error(`Not implemented!`);
			}
		}, grammarDefinitions, vscodeTextmate, undefined);
	}

	public acceptNewModel(data: IRawModelData): void {
		const uri = URI.revive(data.uri);
		const key = uri.toString();
		this._models[key] = new TextMateWorkerModel(uri, data.lines, data.EOL, data.versionId, this, data.languageId);
	}

	public acceptModelChanged(strURL: string, e: IModelChangedEvent): void {
		this._models[strURL].onEvents(e);
	}

	public acceptModelLanguageChanged(strURL: string, newLanguageId: LanguageId): void {
		this._models[strURL].onLanguageId(newLanguageId);
	}

	public acceptRemovedModel(strURL: string): void {
		delete this._models[strURL];
	}

	public getOrCreateGrammar(languageId: LanguageId): Promise<ICreateGrammarResult> {
		if (!this._grammarCache[languageId]) {
			this._grammarCache[languageId] = this._grammarFactory.createGrammar(languageId);
		}
		return this._grammarCache[languageId];
	}
}

export function create(ctx: IWorkerContext, createData: ICreateData): TextMateWorker {
	return new TextMateWorker(ctx, createData);
}
