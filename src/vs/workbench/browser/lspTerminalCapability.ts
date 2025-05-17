/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider } from '../../editor/common/services/resolverService.js';

export interface ILspTerminalModelContentProvider extends ITextModelContentProvider {
	setContent(content: string): void;
	dispose(): void;
}
