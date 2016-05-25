/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {contents as libdts} from 'vs/languages/typescript/common/lib/lib-ts';
import {contents as libes6ts} from 'vs/languages/typescript/common/lib/lib-es6-ts';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {TypeScriptWorkerProtocol, IRawModelData} from './typescript';
import {IModelContentChangedEvent2} from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';

const DEFAULT_LIB = {
	NAME: 'defaultLib:lib.d.ts',
	CONTENTS: libdts
};

const ES6_LIB = {
	NAME: 'defaultLib:lib.es6.d.ts',
	CONTENTS: libes6ts
};

class TypeScriptWorker extends TypeScriptWorkerProtocol implements ts.LanguageServiceHost {

	// --- model sync -----------------------

	private _models: { [uri: string]: MirrorModel2 } = Object.create(null);
	private _extraLibs: { [fileName: string]: string } = Object.create(null);
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

	// --- default ---------

	acceptDefaults(options:ts.CompilerOptions, extraLibs:{ [path: string]: string }): TPromise<void> {
		this._compilerOptions = options;
		this._extraLibs = extraLibs;
		return;
	}

	// --- language service host ---------------

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getScriptFileNames(): string[] {
		return Object.keys(this._models).concat(Object.keys(this._extraLibs));
	}

	getScriptVersion(fileName: string): string {
		if (fileName in this._models) {
			// version changes on type
			return this._models[fileName].version.toString();

		} else if (this.isDefaultLibFileName(fileName) || fileName in this._extraLibs) {
			// extra lib and default lib are static
			return '1';
		}
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		let text: string;
		if (fileName in this._models) {
			// a true editor model
			text = this._models[fileName].getText();

		} else if (fileName in this._extraLibs) {
			// static extra lib
			text = this._extraLibs[fileName];

		} else if (fileName === DEFAULT_LIB.NAME) {
			text = DEFAULT_LIB.CONTENTS;
		} else if (fileName === ES6_LIB.NAME) {
			text = ES6_LIB.CONTENTS;
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
		// TODO@joh support lib.es7.d.ts
		return options.target > ts.ScriptTarget.ES5 ? DEFAULT_LIB.NAME : ES6_LIB.NAME;
	}

	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this._compilerOptions);
	}

	// --- language features

	getSyntacticDiagnostics(fileName: string): TPromise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSyntacticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return TPromise.as(diagnostics);
	}

	getSemanticDiagnostics(fileName: string): TPromise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSemanticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return TPromise.as(diagnostics);
	}

	getCompilerOptionsDiagnostics(fileName: string): TPromise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getCompilerOptionsDiagnostics();
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return TPromise.as(diagnostics);
	}

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

	getNavigationBarItems(fileName: string): TPromise<ts.NavigationBarItem[]> {
		return TPromise.as(this._languageService.getNavigationBarItems(fileName));
	}

	getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		return TPromise.as(this._languageService.getFormattingEditsForDocument(fileName, options));
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		return TPromise.as(this._languageService.getFormattingEditsForRange(fileName, start, end, options));
	}

	getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		return TPromise.as(this._languageService.getFormattingEditsAfterKeystroke(fileName, postion, ch, options));
	}

	getEmitOutput(fileName: string): TPromise<ts.EmitOutput> {
		return TPromise.as(this._languageService.getEmitOutput(fileName));
	}
}

export function create(): TypeScriptWorkerProtocol {
	return new TypeScriptWorker();
}