/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import ts = require('vs/languages/typescript/common/lib/typescriptServices');

interface IScriptSnapshotContainer {
	filename: string;
	version: string;
	open: boolean;
	snapshot: ts.IScriptSnapshot;
}

export class CompilerHost implements ts.CompilerHost {

	private _data: { [filename: string]: string } = Object.create(null);

	add(filename: string, contents: string): CompilerHost {
		this._data[filename] = contents;
		return this;
	}

	getSourceFile(filename: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void): ts.SourceFile {
		return this._data[filename]
			? ts.createSourceFile(filename, this._data[filename], ts.ScriptTarget.ES5)
			: null;
	}

	getDefaultLibFileName(): string {
		return '';
	}

	writeFile(filename: string, data: string, writeByteOrderMark: boolean, onError?: (message: string) => void): void {
		//
	}

	getCurrentDirectory(): string {
		return '';
	}

	getCanonicalFileName(fileName: string): string {
		return fileName;
	}

	useCaseSensitiveFileNames(): boolean {
		return false;
	}

	getNewLine(): string {
		return '\n';
	}
}

export class LanguageServiceHost implements ts.LanguageServiceHost {

	private _compilationSettings: ts.CompilerOptions = { noLib: true };

	private _data: { [name: string]: IScriptSnapshotContainer } = Object.create(null);

	add(fileName:string, contents:string, version:string = '1', open:boolean = true):LanguageServiceHost {
		this._data[fileName] = {
			filename: fileName,
			version: version,
			open: open,
			snapshot: ts.ScriptSnapshot.fromString(contents)
		};
		return this;
	}

	log(s: string): void {
		// nothing
	}

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilationSettings;
	}

	getScriptFileNames(): string[] {
		return Object.keys(this._data);
	}

	getScriptVersion(fileName: string): string {
		return this._data[fileName].version;
	}

	getScriptIsOpen(fileName: string): boolean {
		return this._data[fileName].open;
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		var container = this._data[fileName];
		return container ? container.snapshot : undefined;
	}

	getLocalizedDiagnosticMessages():any {
		return null;
	}

	getCancellationToken(): ts.CancellationToken {
		return null;
	}

	getCurrentDirectory(): string {
		return '';
	}

	getDefaultLibFileName(): string {
		return null;
	}
}