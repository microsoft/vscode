/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider } from '../../editor/common/services/resolverService.js';

export interface ILspTerminalModelContentProvider extends ITextModelContentProvider {
	setContent(content: string): void;
	dispose(): void;
}

export const PYLANCE_DEBUG_DISPLAY_NAME = `ms-python.python(.["')`;
export const PYTHON_LANGUAGE_ID = 'python';
