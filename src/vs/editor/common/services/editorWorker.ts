/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { IDocumentDiff, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { IChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { IInplaceReplaceSupportResult, TextEdit } from 'vs/editor/common/languages';
import { UnicodeHighlighterOptions } from 'vs/editor/common/services/unicodeTextModelHighlighter';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';

export const IEditorWorkerService = createDecorator<IEditorWorkerService>('editorWorkerService');

export type DiffAlgorithmName = 'legacy' | 'advanced';

export interface IEditorWorkerService {
	readonly _serviceBrand: undefined;

	canComputeUnicodeHighlights(uri: URI): boolean;
	computedUnicodeHighlights(uri: URI, options: UnicodeHighlighterOptions, range?: IRange): Promise<IUnicodeHighlightsResult>;

	/** Implementation in {@link EditorSimpleWorker.computeDiff} */
	computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null>;

	canComputeDirtyDiff(original: URI, modified: URI): boolean;
	computeDirtyDiff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): Promise<IChange[] | null>;

	computeMoreMinimalEdits(resource: URI, edits: TextEdit[] | null | undefined, pretty?: boolean): Promise<TextEdit[] | undefined>;
	computeHumanReadableDiff(resource: URI, edits: TextEdit[] | null | undefined): Promise<TextEdit[] | undefined>;

	canComputeWordRanges(resource: URI): boolean;
	computeWordRanges(resource: URI, range: IRange): Promise<{ [word: string]: IRange[] } | null>;

	canNavigateValueSet(resource: URI): boolean;
	navigateValueSet(resource: URI, range: IRange, up: boolean): Promise<IInplaceReplaceSupportResult | null>;
}

export interface IDiffComputationResult {
	quitEarly: boolean;
	changes: ILineChange[];
	identical: boolean;
	moves: ITextMove[];
}

export type ILineChange = [
	originalStartLine: number,
	originalEndLine: number,
	modifiedStartLine: number,
	modifiedEndLine: number,
	charChanges: ICharChange[] | undefined,
];

export type ICharChange = [
	originalStartLine: number,
	originalStartColumn: number,
	originalEndLine: number,
	originalEndColumn: number,

	modifiedStartLine: number,
	modifiedStartColumn: number,
	modifiedEndLine: number,
	modifiedEndColumn: number,
];

export type ITextMove = [
	originalStartLine: number,
	originalEndLine: number,
	modifiedStartLine: number,
	modifiedEndLine: number,
	changes: ILineChange[],
];

export interface IUnicodeHighlightsResult {
	ranges: IRange[];
	hasMore: boolean;
	nonBasicAsciiCharacterCount: number;
	invisibleCharacterCount: number;
	ambiguousCharacterCount: number;
}
