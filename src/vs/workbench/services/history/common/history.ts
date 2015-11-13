/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var IHistoryService = createDecorator<IHistoryService>('historyService');

export interface IHistoryService {
	serviceId : ServiceIdentifier<any>;

	/**
	 * Navigate forwards in history.
	 */
	forward():void;

	/**
	 * Navigate backwards in history.
	 */
	back():void;
}