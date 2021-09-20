/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';

export const IPaneCompositePartService = createDecorator<IPaneCompositePartService>('paneCompositePartService');

export interface IPaneCompositePartService {

	readonly _serviceBrand: undefined;

	readonly onDidPaneCompositeOpen: Event<{ composite: IPaneComposite, viewContainerLocation: ViewContainerLocation }>;
	readonly onDidPaneCompositeClose: Event<{ composite: IPaneComposite, viewContainerLocation: ViewContainerLocation }>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openPaneComposite(id: string | undefined, viewContainerLocation: ViewContainerLocation, focus?: boolean): Promise<IPaneComposite | undefined>;

	/**
	 * Returns the current active viewlet if any.
	 */
	getActivePaneComposite(viewContainerLocation: ViewContainerLocation): IPaneComposite | undefined;

	/**
	 * Returns the viewlet by id.
	 */
	getPaneComposite(id: string, viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor | undefined;

	/**
	 * Returns all enabled viewlets
	 */
	getPaneComposites(viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor[];

	/**
	 * Returns the progress indicator for the side bar.
	 */
	getProgressIndicator(id: string, viewContainerLocation: ViewContainerLocation): IProgressIndicator | undefined;

	/**
	 * Hide the active viewlet.
	 */
	hideActivePaneComposite(viewContainerLocation: ViewContainerLocation): void;

	/**
	 * Return the last active viewlet id.
	 */
	getLastActivePaneCompositeId(viewContainerLocation: ViewContainerLocation): string;

	getPartByLocation(viewContainerLocation: ViewContainerLocation): IPaneCompositePart;
}
