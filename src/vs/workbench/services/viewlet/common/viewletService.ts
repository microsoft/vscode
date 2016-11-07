/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';

export const IViewletService = createDecorator<IViewletService>('viewletService');

export interface IViewletService {
	_serviceBrand: ServiceIdentifier<any>;

	onDidViewletOpen: Event<IViewlet>;
	onDidViewletClose: Event<IViewlet>;
	onDidViewletRegister: Event<ViewletDescriptor>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openViewlet(id: string, focus?: boolean): TPromise<IViewlet>;

	/**
	 * Toggles a viewlet with the given identifier.
	 */
	toggleViewlet(id: string): TPromise<IViewlet>;


	getExtViewlets(): ViewletDescriptor[];

	getEnabledViewletIds(): string[];

	/**
	 * Get all registered viewlets, ordered by
	 * - Stock Viewlet: order
	 * - External Viewlet: enabliing sequence
	 */
	getAllViewlets(): ViewletDescriptor[];

	/**
	 * Returns the current active viewlet or null if none.
	 */
	getActiveViewlet(): IViewlet;
}
