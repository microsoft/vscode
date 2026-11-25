/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';
import type { ITextEditorOptions } from '../../platform/editor/common/editor.js';
import type { IRange } from './core/range.js';

export const multiDiffEditorVariants = ['cards', 'noCards', 'noCardsNonCompact'] as const;
export type MultiDiffEditorVariant = (typeof multiDiffEditorVariants)[number];

export type IMultiDiffResourceId = { original: URI | undefined; modified: URI | undefined };

/** Whether resizing the split view of one file in a multi diff editor resizes all of its files. */
export const MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING = 'multiDiffEditor.syncSplitView';

export interface IMultiDiffEditorOptions extends ITextEditorOptions {
	viewState?: IMultiDiffEditorOptionsViewState;
}

export interface IMultiDiffEditorOptionsViewState {
	revealData?: {
		resource: IMultiDiffResourceId;
		/** A range of the original document, or of the modified document if the file was added. */
		range?: IRange;
	};
}
