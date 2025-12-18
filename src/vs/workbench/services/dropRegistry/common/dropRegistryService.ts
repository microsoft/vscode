/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export const IDropRegistryService = createDecorator<IDropRegistryService>('dropRegistryService');

export interface IDropResourceHandler {
	/**
	 * Handle a dropped resource.
	 * @param resource The resource that was dropped
	 * @param accessor Service accessor to get services
	 * @returns true if handled, false otherwise
	 */
	tryHandleDrop(resource: URI, accessor: ServicesAccessor): Promise<boolean>;
}

export interface IDropRegistryService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a handler for dropped resources.
	 * @returns A disposable that unregisters the handler when disposed
	 */
	registerHandler(handler: IDropResourceHandler): IDisposable;

	/**
	 * Try to handle a dropped resource using registered handlers.
	 * @param resource The resource that was dropped
	 * @param accessor Service accessor to get services
	 * @returns true if any handler handled the resource, false otherwise
	 */
	tryHandleDrop(resource: URI, accessor: ServicesAccessor): Promise<boolean>;
}
