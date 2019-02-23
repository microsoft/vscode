/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenubarService, IMenubarData } from 'vs/platform/menubar/common/menubar';

export class SimpleMenubarService implements IMenubarService {

	_serviceBrand: any;

	updateMenubar(windowId: number, menuData: IMenubarData): Promise<void> {
		return Promise.resolve(undefined);
	}
}