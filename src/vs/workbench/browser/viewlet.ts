/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IConstructorSignature0, BrandedService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { PaneComposite } from 'vs/workbench/browser/panecomposite';

/**
 * A Pane Composite descriptor is a leightweight descriptor of a Pane Composite in the workbench.
 */
export class PaneCompositeDescriptor extends CompositeDescriptor<PaneComposite> {

	static create<Services extends BrandedService[]>(
		ctor: { new(...services: Services): PaneComposite },
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		requestedIndex?: number,
		iconUrl?: URI
	): PaneCompositeDescriptor {

		return new PaneCompositeDescriptor(ctor as IConstructorSignature0<PaneComposite>, id, name, cssClass, order, requestedIndex, iconUrl);
	}

	private constructor(
		ctor: IConstructorSignature0<PaneComposite>,
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		requestedIndex?: number,
		readonly iconUrl?: URI
	) {
		super(ctor, id, name, cssClass, order, requestedIndex);
	}
}

export const Extensions = {
	Viewlets: 'workbench.contributions.viewlets',
	Panels: 'workbench.contributions.panels'
};

export class PaneCompositeRegistry extends CompositeRegistry<PaneComposite> {

	/**
	 * Registers a viewlet to the platform.
	 */
	registerViewlet(descriptor: PaneCompositeDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Deregisters a viewlet to the platform.
	 */
	deregisterViewlet(id: string): void {
		super.deregisterComposite(id);
	}

	/**
	 * Returns the viewlet descriptor for the given id or null if none.
	 */
	getViewlet(id: string): PaneCompositeDescriptor {
		return this.getComposite(id) as PaneCompositeDescriptor;
	}

	/**
	 * Returns an array of registered viewlets known to the platform.
	 */
	getViewlets(): PaneCompositeDescriptor[] {
		return this.getComposites() as PaneCompositeDescriptor[];
	}
}

Registry.add(Extensions.Viewlets, new PaneCompositeRegistry());
Registry.add(Extensions.Panels, new PaneCompositeRegistry());
