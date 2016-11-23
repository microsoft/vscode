/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';

export const IViewletService = createDecorator<IViewletService>('viewletService');

export interface IViewletService {
	_serviceBrand: ServiceIdentifier<any>;

	onDidViewletOpen: Event<IViewlet>;
	onDidViewletClose: Event<IViewlet>;
	onDidExtViewletsLoad: Event<void>;
	onDidViewletToggle: Event<void>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openViewlet(id: string, focus?: boolean): TPromise<IViewlet>;

	/**
	 * Restores a viewlet during startup.
	 * If the viewlet to restore is external, delay restoration until extensions finish loading.
	 */
	restoreViewlet(id: string): TPromise<IViewlet>;

	/**
	 * Toggles a viewlet with the given identifier.
	 */
	toggleViewlet(id: string): TPromise<void>;

	/**
	 * Returns the current active viewlet or null if none.
	 */
	getActiveViewlet(): IViewlet;

	/**
	 * Returns all registered viewlets
	 */
	getAllViewlets(): ViewletDescriptor[];

	/**
	 * Returns all viewlets that should be displayed, ordered by:
	 * - Stock Viewlets: order attribute
	 * - External Viewlets: enabling sequence
	 */
	getAllViewletsToDisplay(): ViewletDescriptor[];

	/**
	 * Checks if an extension is enabled
	 */
	isViewletEnabled(id: string): boolean;
}