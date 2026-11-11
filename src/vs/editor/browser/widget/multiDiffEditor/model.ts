/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, IValueWithChangeEvent } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { RefCounted } from '../diffEditor/utils.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { ITextModel } from '../../../common/model.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';

export interface IMultiDiffEditorModel {
	readonly documents: IValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[] | 'loading'>;
	readonly contextKeys?: Record<string, ContextKeyValue>;
}

/**
 * A file shown in the multi diff editor. It is cheap to create: its contents are only loaded through {@link resolve}.
 */
export interface IDocumentDiffItem {
	/**
	 * undefined if the file was created.
	 */
	readonly originalUri: URI | undefined;

	/**
	 * undefined if the file was deleted.
	 */
	readonly modifiedUri: URI | undefined;

	readonly contextKeys?: Record<string, ContextKeyValue>;

	/**
	 * Loads the contents. The multi diff editor calls this at most once per item and disposes the reference
	 * when it no longer shows the item.
	 */
	resolve(): Promise<IReference<IResolvedDocumentDiffItem>>;
}

export type IResolvedDocumentDiffItem = IResolvedTextDocumentDiffItem | IResolvedBinaryDocumentDiffItem;

export interface IResolvedTextDocumentDiffItem {
	readonly kind: 'text';

	/**
	 * undefined if the file was created.
	 */
	readonly original: ITextModel | undefined;

	/**
	 * undefined if the file was deleted.
	 */
	readonly modified: ITextModel | undefined;

	readonly options?: IDiffEditorOptions;
	readonly onOptionsDidChange?: Event<void>;
}

/**
 * The contents cannot be shown as text.
 */
export interface IResolvedBinaryDocumentDiffItem {
	readonly kind: 'binary';
}
