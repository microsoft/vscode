/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IOpenerService = createDecorator<IOpenerService>('openerService');


export interface IOpenerService {

	_serviceBrand: any;

	/**
	 * Opens a resource, like a webadress, a document uri, or executes command.
	 *
	 * @param resource A resource
	 * @return A promise that resolves when the opening is done.
	 */
	open(resource: URI, options?: { openToSide?: boolean }): TPromise<any>;
}

export const NullOpenerService: IOpenerService = Object.freeze({
	_serviceBrand: undefined,
	open() { return TPromise.as(undefined); }
});
