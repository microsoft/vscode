/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import AbstractWorker, {IRawModelData} from './worker';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import {IModelContentChangedEvent2} from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import URI from 'vs/base/common/uri';
import 'vs/text!vs/languages/typescript/common/lib/lib.d.ts';
import 'vs/text!vs/languages/typescript/common/lib/lib.es6.d.ts';

class TypeScriptWorker extends AbstractWorker implements ts.LanguageServiceHost {

	// --- model sync -----------------------

	private _models: { [uri: string]: MirrorModel2 } = Object.create(null);
	private _languageService = ts.createLanguageService(this);
	private _compilerOptions: ts.CompilerOptions;

	acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel2(URI.parse(data.url),
			data.value.lines,
			data.value.EOL, data.versionId);
	}

	acceptModelChanged(uri: string, events: IModelContentChangedEvent2[]): void {
		const model = this._models[uri];
		if (model) {
			model.onEvents(events);
		}
	}

	acceptRemovedModel(uri: string): void {
		delete this._models[uri];
	}

	// --- language service host ---------------

	acceptCompilerOptions(options: ts.CompilerOptions): TPromise<void> {
		this._compilerOptions = options;
		return undefined;
	}

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getScriptFileNames(): string[] {
		return Object.keys(this._models);
	}

	getScriptVersion(fileName: string): string {
		if (fileName in this._models) {
			return this._models[fileName].version.toString();
		} else if (this.isDefaultLibFileName(fileName)) {
			return '1';
		}
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		let text: string;
		if (fileName in this._models) {
			text = this._models[fileName].getText();

		} else if (this.isDefaultLibFileName(fileName)) {
			// load lib(.es6)?.d.ts as module
			text = require(fileName);
		} else {
			return;
		}

		return <ts.IScriptSnapshot>{
			getText: (start, end) => text.substring(start, end),
			getLength: () => text.length,
			getChangeRange: () => undefined
		};
	}

	getCurrentDirectory(): string {
		return '';
	}

	getDefaultLibFileName(options: ts.CompilerOptions): string {
		return options.target > ts.ScriptTarget.ES5
			? 'vs/text!vs/languages/typescript/common/lib/lib.es6.d.ts'
			: 'vs/text!vs/languages/typescript/common/lib/lib.d.ts';
	}

	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this._compilerOptions);
	}

	// --- language features

	getCompletionsAtPosition(fileName: string, position:number): TPromise<ts.CompletionInfo> {
		return TPromise.as(this._languageService.getCompletionsAtPosition(fileName, position));
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): TPromise<ts.CompletionEntryDetails> {
		return TPromise.as(this._languageService.getCompletionEntryDetails(fileName, position, entry));
	}

	getSignatureHelpItems(fileName: string, position:number): TPromise<ts.SignatureHelpItems> {
		return TPromise.as(this._languageService.getSignatureHelpItems(fileName, position));
	}

	getQuickInfoAtPosition(fileName: string, position: number): TPromise<ts.QuickInfo> {
		return TPromise.as(this._languageService.getQuickInfoAtPosition(fileName, position));
	}

	getOccurrencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		return TPromise.as(this._languageService.getOccurrencesAtPosition(fileName, position));
	}

	getDefinitionAtPosition(fileName: string, position: number): TPromise<ts.DefinitionInfo[]> {
		return TPromise.as(this._languageService.getDefinitionAtPosition(fileName, position));
	}

	getReferencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		return TPromise.as(this._languageService.getReferencesAtPosition(fileName, position));
	}

}

export function create(): AbstractWorker {
	return new TypeScriptWorker();
}