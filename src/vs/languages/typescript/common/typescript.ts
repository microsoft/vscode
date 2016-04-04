/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import {notImplemented} from 'vs/base/common/errors';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';

// --- TypeScript configuration and defaults ---------

export interface DiagnosticsOptions {
	noSemanticValidation?: boolean;
	noSyntaxValidation?: boolean;
}

export class LanguageServiceDefaults {

	private _onDidChange = new Emitter<LanguageServiceDefaults>();
	private _extraLibs: { [path: string]: string };
	private _compilerOptions: ts.CompilerOptions;
	private _diagnosticsOptions: DiagnosticsOptions;

	constructor(compilerOptions: ts.CompilerOptions, diagnosticsOptions: DiagnosticsOptions) {
		this._extraLibs = Object.create(null);
		this.setCompilerOptions(compilerOptions);
		this.setDiagnosticsOptions(diagnosticsOptions);
	}

	get onDidChange(): Event<LanguageServiceDefaults>{
		return this._onDidChange.event;
	}

	get extraLibs(): { [path: string]: string } {
		return Object.freeze(this._extraLibs);
	}

	addExtraLib(content: string, filePath?: string): IDisposable {
		if (typeof filePath === 'undefined') {
			filePath = `ts:extralib-${Date.now()}`;
		}

		if (this._extraLibs[filePath]) {
			throw new Error(`${filePath} already a extra lib`);
		}

		this._extraLibs[filePath] = content;
		this._onDidChange.fire(this);

		return {
			dispose: () => {
				if (delete this._extraLibs[filePath]) {
					this._onDidChange.fire(this);
				}
			}
		};
	}

	get compilerOptions(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	setCompilerOptions(options: ts.CompilerOptions): void {
		this._compilerOptions = options || Object.create(null);
		this._onDidChange.fire(this);
	}

	get diagnosticsOptions(): DiagnosticsOptions {
		return this._diagnosticsOptions;
	}

	setDiagnosticsOptions(options: DiagnosticsOptions): void {
		this._diagnosticsOptions = options || Object.create(null);
		this._onDidChange.fire(this);
	}
}

export const typeScriptDefaults = new LanguageServiceDefaults(
	{ allowNonTsExtensions: true, target: ts.ScriptTarget.Latest },
	{ noSemanticValidation: false, noSyntaxValidation: false });

export const javaScriptDefaults = new LanguageServiceDefaults(
	{ allowNonTsExtensions: true, allowJs: true, target: ts.ScriptTarget.Latest },
	{ noSemanticValidation: true, noSyntaxValidation: false });


// --- TypeScript worker protocol ---------

export interface LanguageServiceMode {
	getLanguageServiceWorker(...resources: URI[]): TPromise<TypeScriptWorkerProtocol>;
}

export interface IRawModelData {
	url:string;
	versionId:number;
	value:editorCommon.IRawText;
}

export abstract class TypeScriptWorkerProtocol implements IRequestHandler {

	_requestHandlerTrait: any;

	// --- model sync

	acceptNewModel(data: IRawModelData): void {
		throw notImplemented();
	}

	acceptModelChanged(uri: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		throw notImplemented();
	}

	acceptRemovedModel(uri: string): void {
		throw notImplemented();
	}

	acceptDefaults(options: ts.CompilerOptions, extraLibs: { [path: string]: string }): TPromise<void> {
		throw notImplemented();
	}

	// --- language features

	getSyntacticDiagnostics(fileName: string): TPromise<ts.Diagnostic[]> {
		throw notImplemented();
	}

	getSemanticDiagnostics(fileName: string): TPromise<ts.Diagnostic[]> {
		throw notImplemented();
	}

	getCompletionsAtPosition(uri: string, offset: number): TPromise<ts.CompletionInfo> {
		throw notImplemented();
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): TPromise<ts.CompletionEntryDetails> {
		throw notImplemented();
	}

	getSignatureHelpItems(fileName: string, position:number): TPromise<ts.SignatureHelpItems> {
		throw notImplemented();
	}

	getQuickInfoAtPosition(fileName: string, position: number): TPromise<ts.QuickInfo> {
		throw notImplemented();
	}

	getOccurrencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		throw notImplemented();
	}

	getDefinitionAtPosition(fileName: string, position: number): TPromise<ts.DefinitionInfo[]> {
		throw notImplemented();
	}

	getReferencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		throw notImplemented();
	}

	getNavigationBarItems(fileName: string): TPromise<ts.NavigationBarItem[]> {
		throw notImplemented();
	}

	getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}

	getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}

	getEmitOutput(fileName: string): TPromise<ts.EmitOutput> {
		throw notImplemented();
	}
}
