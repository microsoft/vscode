/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {IEditorInput} from 'vs/platform/editor/common/editor';

export const IHistoryService = createDecorator<IHistoryService>('historyService');

export class IRecentlyClosedEditor {
	editor: IEditorInput;
	index: number;
}

export interface IHistoryService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Removes and returns the last closed editor if any.
	 */
	popLastClosedEditor(): IRecentlyClosedEditor;

	/**
	 * Navigate forwards in history.
	 */
	forward(): void;

	/**
	 * Navigate backwards in history.
	 */
	back(): void;

	/**
	 * Removes an entry from history.
	 */
	remove(input: IEditorInput): void;

	/**
	 * Clears all history.
	 */
	clear(): void;

	/**
	 * Get the entire history of opened editors.
	 */
	getHistory(): IEditorInput[];
}