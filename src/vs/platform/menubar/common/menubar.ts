/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommandAction } from 'vs/platform/actions/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMenubarService = createDecorator<IMenubarService>('menubarService');

export interface IMenubarService {
	_serviceBrand: any;

	updateMenubar(windowId: number, items: ICommandAction[][]): TPromise<void>;
}