/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import AbstractWorker, {IRawModelData} from './abstractWorker';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import URI from 'vs/base/common/uri';

class TypeScriptWorker extends AbstractWorker implements ts.LanguageServiceHost {

	// --- model sync -----------------------

	private _models: { [uri: string]: MirrorModel2 } = Object.create(null);
	private _languageService = ts.createLanguageService(this);
	private _compilerOptions = ts.getDefaultCompilerOptions();

	acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel2(URI.parse(data.url),
			data.value.lines,
			data.value.EOL, data.versionId);
	}

	acceptModelChanged(uri: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		const model = this._models[uri];
		if (model) {
			model.onEvents(events);
		}
	}

	acceptRemovedModel(uri: string): void {
		delete this._models[uri];
	}

	acceptCompilerOptions(options: ts.CompilerOptions): void {
		this._compilerOptions = options;
	}

	// --- language service host ---------------

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getScriptFileNames(): string[] {
		return Object.keys(this._models);
	}

	getScriptVersion(fileName: string): string {
		return this._models[fileName].version.toString();
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		const text = this._models[fileName].getText();
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
		return '';
	}

	// --- language features

	suggest(uri: string, offset:number) {
		return TPromise.as(this._languageService.getCompletionsAtPosition(uri, offset));
	}

}