/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { IChange, IDiffComputationResult } from 'vs/editor/common/diff/diffComputer';
import { IInplaceReplaceSupportResult, TextEdit } from 'vs/editor/common/languages';
import { UnicodeHighlighterOptions } from 'vs/editor/common/services/unicodeTextModelHighlighter';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ID_EDITOR_WORKER_SERVICE = 'editorWorkerService';
export const IEditorWorkerService = createDecorator<IEditorWorkerService>(ID_EDITOR_WORKER_SERVICE);

export interface IEditorWorkerService {
	readonly _serviceBrand: undefined;

	canComputeUnicodeHighlights(uri: URI): boolean;
	computedUnicodeHighlights(uri: URI, options: UnicodeHighlighterOptions, range?: IRange): Promise<IUnicodeHighlightsResult>;

	computeDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean, maxComputationTime: number): Promise<IDiffComputationResult | null>;

	canComputeDirtyDiff(original: URI, modified: URI): boolean;
	computeDirtyDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): Promise<IChange[] | null>;

	computeMoreMinimalEdits(resource: URI, edits: TextEdit[] | null | undefined): Promise<TextEdit[] | undefined>;

	canComputeWordRanges(resource: URI): boolean;
	computeWordRanges(resource: URI, range: IRange): Promise<{ [word: string]: IRange[] } | null>;

	canNavigateValueSet(resource: URI): boolean;
	navigateValueSet(resource: URI, range: IRange, up: boolean): Promise<IInplaceReplaceSupportResult | null>;
}

export interface IUnicodeHighlightsResult {
	ranges: IRange[];
	hasMore: boolean;
	nonBasicAsciiCharacterCount: number;
	invisibleCharacterCount: number;
	ambiguousCharacterCount: number;
}
