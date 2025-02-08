/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBaseCellEditorOptions } from '../notebookBrowser.js';
import { NotebookEventDispatcher } from './eventDispatcher.js';
import { NotebookOptions } from '../notebookOptions.js';

export class ViewContext {
	constructor(
		readonly notebookOptions: NotebookOptions,
		readonly eventDispatcher: NotebookEventDispatcher,
		readonly getBaseCellEditorOptions: (language: string) => IBaseCellEditorOptions
	) {
	}
}
