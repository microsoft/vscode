/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';
import fs from 'node:fs';
import { normalize } from 'node:path';

export type IFileMap = Map</*fileName*/ string, string>;

function normalizePath(filePath: string): string {
	return normalize(filePath);
}

/**
 * A TypeScript language service host
 */
export class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {

	private readonly ts: typeof import('typescript');
	private readonly topLevelFiles: IFileMap;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly transformSource: ((fileName: string, contents: string) => string) | undefined;

	constructor(
		ts: typeof import('typescript'),
		topLevelFiles: IFileMap,
		compilerOptions: ts.CompilerOptions,
		transformSource?: (fileName: string, contents: string) => string,
	) {
		this.ts = ts;
		this.topLevelFiles = topLevelFiles;
		this.compilerOptions = compilerOptions;
		this.transformSource = transformSource;
	}

	// --- language service host ---------------
	getCompilationSettings(): ts.CompilerOptions {
		return this.compilerOptions;
	}
	getScriptFileNames(): string[] {
		return [
			...this.topLevelFiles.keys(),
			this.ts.getDefaultLibFilePath(this.compilerOptions)
		];
	}
	getScriptVersion(_fileName: string): string {
		return '1';
	}
	getProjectVersion(): string {
		return '1';
	}
	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		fileName = normalizePath(fileName);

		if (this.topLevelFiles.has(fileName)) {
			return this.ts.ScriptSnapshot.fromString(this.topLevelFiles.get(fileName)!);
		} else {
			const contents = fs.readFileSync(fileName).toString();
			return ts.ScriptSnapshot.fromString(this.transformSource ? this.transformSource(fileName, contents) : contents);
		}
	}
	getScriptKind(_fileName: string): ts.ScriptKind {
		return this.ts.ScriptKind.TS;
	}
	getCurrentDirectory(): string {
		return '';
	}
	getDefaultLibFileName(options: ts.CompilerOptions): string {
		return this.ts.getDefaultLibFilePath(options);
	}
	readFile(path: string, encoding?: string): string | undefined {
		path = normalizePath(path);

		if (this.topLevelFiles.get(path)) {
			return this.topLevelFiles.get(path);
		}
		return ts.sys.readFile(path, encoding);
	}
	fileExists(path: string): boolean {
		path = normalizePath(path);

		if (this.topLevelFiles.has(path)) {
			return true;
		}
		return ts.sys.fileExists(path);
	}
}
