/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, IValueWithChangeEvent } from '../../../../base/common/event.js';
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
 * A resource participating on one side of a document diff.
 */
export class DiffItemSource {
	constructor(
		public readonly uri: URI,
		public readonly textModel: ITextModel | undefined,
	) { }
}

export interface IDocumentDiffItem {
	/**
	 * undefined if the file was created.
	 */
	readonly original: DiffItemSource | undefined;

	/**
	 * undefined if the file was deleted.
	 */
	readonly modified: DiffItemSource | undefined;
	readonly options?: IDiffEditorOptions;
	readonly onOptionsDidChange?: Event<void>;
	readonly contextKeys?: Record<string, ContextKeyValue>;
}
