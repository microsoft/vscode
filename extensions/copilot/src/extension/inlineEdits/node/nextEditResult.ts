/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Command } from 'vscode';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../util/vs/editor/common/core/position';
import { Range } from '../../../util/vs/editor/common/core/range';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import type { CachedEdit } from './nextEditCache';
import { NextEditFetchRequest } from './nextEditProvider';

export interface INextEditDisplayLocation {
	range: Range;
	label: string;
}

export interface INextEditResult {
	requestId: number;
	result: {
		edit?: StringReplacement;
		displayLocation?: INextEditDisplayLocation;
		targetDocumentId?: DocumentId;
		isFromCursorJump?: boolean;
	} | undefined;
}

export class NextEditResult implements INextEditResult {
	constructor(
		public readonly requestId: number,
		public readonly source: NextEditFetchRequest,
		public readonly result: {
			edit?: StringReplacement;
			documentBeforeEdits: StringText;
			displayLocation?: INextEditDisplayLocation;
			targetDocumentId?: DocumentId;
			action?: Command;
			isFromCursorJump: boolean;
			jumpToPosition?: Position;
			isSubsequentEdit: boolean;
			/**
			 * Reference to the underlying cache entry, when this result was either
			 * served from the cache or freshly produced and immediately cached.
			 * Consumers can use this to read/write per-entry flags such as
			 * {@link CachedEdit.wasRenderedAsInlineSuggestion}.
			 */
			cacheEntry?: CachedEdit;
		} | undefined,
	) { }
}
