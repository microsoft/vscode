/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';

export const IViewletService = createDecorator<IViewletService>('viewletService');

export interface IViewletService {

	readonly _serviceBrand: undefined;

	readonly onDidViewletRegister: Event<PaneCompositeDescriptor>;
	readonly onDidViewletDeregister: Event<PaneCompositeDescriptor>;
	readonly onDidViewletOpen: Event<IPaneComposite>;
	readonly onDidViewletClose: Event<IPaneComposite>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openViewlet(id: string | undefined, focus?: boolean): Promise<IPaneComposite | undefined>;

	/**
	 * Returns the current active viewlet if any.
	 */
	getActiveViewlet(): IPaneComposite | undefined;

	/**
	 * Returns the viewlet by id.
	 */
	getViewlet(id: string): PaneCompositeDescriptor | undefined;

	/**
	 * Returns all enabled viewlets
	 */
	getViewlets(): PaneCompositeDescriptor[];

	/**
	 * Returns the progress indicator for the side bar.
	 */
	getProgressIndicator(id: string): IProgressIndicator | undefined;

	/**
	 * Hide the active viewlet.
	 */
	hideActiveViewlet(): void;

	/**
	 * Return the last active viewlet id.
	 */
	getLastActiveViewletId(): string;
}
