/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ParseError } from './promptFileReferenceErrors.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../../base/common/stream.js';

/**
 * TODO: @legomushroom - move to the correct place
 */
export interface IPromptContentsProvider extends IDisposable {
	start(): void;
	onContentChanged(callback: (streamOrError: ReadableStream<VSBuffer> | ParseError) => void): IDisposable;
	readonly uri: URI;
}

type TPromptPartTypes = 'file-reference';
export interface IPromptPart {
	readonly type: TPromptPartTypes;
	readonly range: Range;
	readonly text: string;
}

export interface IPromptFileReference extends IPromptPart {
	readonly type: 'file-reference';
	readonly uri: URI;
	readonly path: string;
	readonly resolveFailed: boolean | undefined;
	readonly errorCondition: ParseError | undefined;
	allReferences: readonly TPromptPart[];
	allValidFileReferenceUris: readonly URI[];
	validFileReferences: readonly IPromptFileReference[];
}

/**
 * TODO: @legomushroom
 */
export type TPromptPart = IPromptFileReference;
