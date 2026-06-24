/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

import type { Host } from './host';
import type { CodeSnippet } from './protocol';

export interface SnippetProvider {
	isEmpty(): boolean;
	snippet(key: string | undefined): CodeSnippet;
}

export interface KeyComputationContext {
	host: Host;
	getScriptVersion(sourceFile: tt.SourceFile): string | undefined;
}

export type CodeCacheItem = {
	value: string[];
	uri: string;
	additionalUris?: Set<string>;
};

export interface EmitterContext extends KeyComputationContext {
	getCachedCode(key: string): CodeCacheItem | undefined;
	getCachedCode(symbol: tt.Symbol): CodeCacheItem | undefined;

	cacheCode(key: string, code: CodeCacheItem): void;
	cacheCode(symbol: tt.Symbol, code: CodeCacheItem): void;
}

export abstract class ProgramContext {

	/**
	 * The symbol is skipped if it has no declarations or if one declaration
	 * comes from a default or external library.
	 */
	protected getSymbolInfo(symbol: tt.Symbol): { skip: true } | { skip: false; primary: tt.SourceFile } {
		const declarations = symbol.declarations;
		if (declarations === undefined || declarations.length === 0) {
			return { skip: true };
		}
		let primary: tt.SourceFile | undefined;
		let skipCount = 0;
		const program = this.getProgram();
		for (const declaration of declarations) {
			const sourceFile = declaration.getSourceFile();
			if (primary === undefined) {
				primary = sourceFile;
			}
			if (program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile)) {
				skipCount++;
			}
		}
		return skipCount > 0 ? { skip: true } : { skip: false, primary: primary! };
	}

	protected skipDeclaration(declaration: tt.Declaration, sourceFile: tt.SourceFile = declaration.getSourceFile()): boolean {
		const program = this.getProgram();
		return program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile);
	}

	protected abstract getProgram(): tt.Program;

}

export class RecoverableError extends Error {

	public static readonly SourceFileNotFound: number = 1;
	public static readonly NodeNotFound: number = 2;
	public static readonly NodeKindMismatch: number = 3;
	public static readonly SymbolNotFound: number = 4;
	public static readonly NoDeclaration: number = 5;
	public static readonly NoProgram: number = 6;
	public static readonly NoSourceFile: number = 7;

	public readonly code: number;

	constructor(message: string, code: number) {
		super(message);
		this.code = code;
	}
}
