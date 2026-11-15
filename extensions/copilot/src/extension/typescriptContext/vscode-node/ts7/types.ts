/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export class RecoverableError extends Error {
	public static readonly NoSourceFile: number = 7;

	public readonly code: number;

	constructor(message: string, code: number) {
		super(message);
		this.code = code;
	}
}
