/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, IValueWithChangeEvent } from 'vs/base/common/event';
import { RefCounted } from 'vs/editor/browser/widget/diffEditor/utils';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';

export interface IMultiDiffEditorModel {
	readonly documents: IValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>;
	readonly contextKeys?: Record<string, ContextKeyValue>;
}

export interface IDocumentDiffItem {
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
	readonly contextKeys?: Record<string, ContextKeyValue>;
}
