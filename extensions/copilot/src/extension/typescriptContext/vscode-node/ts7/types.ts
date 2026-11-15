/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project } from '@typescript/native/async';
import type { Node, SourceFile } from '@typescript/native/ast';
import type * as protocol from '../../common/serverProtocol';

export interface SnippetProvider {
	isEmpty(): boolean;
	snippet(key: string | undefined): protocol.CodeSnippet;
}

export type CodeCacheItem = {
	value: string[];
	uri: string;
	additionalUris?: Set<string>;
};

export interface EmitterContext {
	getCachedCode(key: string): CodeCacheItem | undefined;
	cacheCode(key: string, code: CodeCacheItem): void;
}

export abstract class ProgramContext {
	protected async skipDeclaration(_declaration: Node, sourceFile: SourceFile): Promise<boolean> {
		const metadata = await this.getProject().program.getSourceFileMetadataByPath(sourceFile.path);
		return metadata?.isDefaultLibrary === true || metadata?.isFromExternalLibrary === true;
	}

	protected abstract getProject(): Project;
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
