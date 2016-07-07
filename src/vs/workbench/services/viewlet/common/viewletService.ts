/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var IViewletService = createDecorator<IViewletService>('viewletService');

export interface IViewletService {
	_serviceBrand : ServiceIdentifier<any>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openViewlet(id: string, focus?: boolean): TPromise<IViewlet>;

	/**
	 * Returns the current active viewlet or null if none
	 */
	getActiveViewlet(): IViewlet;
}