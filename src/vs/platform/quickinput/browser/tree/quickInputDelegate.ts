/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IQuickTreeItem } from '../../common/quickInput.js';
import { QuickInputTreeRenderer } from './quickInputTreeRenderer.js';

/**
 * Delegate for QuickInputTree that provides height and template information.
 */
export class QuickInputTreeDelegate<T extends IQuickTreeItem> implements IListVirtualDelegate<T> {
	getHeight(element: T): number {
		return element.detail ? 44 : 22; // 22 for single line, 44 for two lines
	}

	getTemplateId(_element: T): string {
		return QuickInputTreeRenderer.ID;
	}
}
