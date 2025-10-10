/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';

export type ILibMap = Map</*libName*/ string, string>;
export type IFileMap = Map</*fileName*/ string, string>;

/**
 * A TypeScript language service host
 */
export class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {

	constructor(
		private readonly ts: typeof import('typescript'),
		private readonly libs: ILibMap,
		private readonly files: IFileMap,
		private readonly compilerOptions: ts.CompilerOptions,
		private readonly defaultLibName: string,
	) { }

	// --- language service host ---------------
	getCompilationSettings(): ts.CompilerOptions {
		return this.compilerOptions;
	}
	getScriptFileNames(): string[] {
		return [
			...this.libs.keys(),
			...this.files.keys(),
		];
	}
	getScriptVersion(_fileName: string): string {
		return '1';
	}
	getProjectVersion(): string {
		return '1';
	}
	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		if (this.files.has(fileName)) {
			return this.ts.ScriptSnapshot.fromString(this.files.get(fileName)!);
		} else if (this.libs.has(fileName)) {
			return this.ts.ScriptSnapshot.fromString(this.libs.get(fileName)!);
		} else {
			return this.ts.ScriptSnapshot.fromString('');
		}
	}
	getScriptKind(_fileName: string): ts.ScriptKind {
		return this.ts.ScriptKind.TS;
	}
	getCurrentDirectory(): string {
		return '';
	}
	getDefaultLibFileName(_options: ts.CompilerOptions): string {
		return this.defaultLibName;
	}
	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this.compilerOptions);
	}
	readFile(path: string, _encoding?: string): string | undefined {
		return this.files.get(path) || this.libs.get(path);
	}
	fileExists(path: string): boolean {
		return this.files.has(path) || this.libs.has(path);
	}
}
