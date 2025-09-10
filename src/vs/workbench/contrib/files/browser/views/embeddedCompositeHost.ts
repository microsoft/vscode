/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PaneComposite, PaneCompositeDescriptor, PaneCompositeRegistry, Extensions as PaneCompositeExtensions } from '../../../../browser/panecomposite.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';

/**
 * A host that can render any pane composite in an arbitrary container.
 * This breaks the tight coupling between composites and their fixed locations.
 */
export class EmbeddedCompositeHost extends Disposable {

	private composites = new Map<string, { composite: PaneComposite; container: HTMLElement }>();
	private currentCompositeId: string | undefined;
	private readonly compositeDisposables = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		private readonly location: ViewContainerLocation,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Ensure container has proper styling
		this.container.classList.add('embedded-composite-host');
	}

	async openComposite(compositeId: string): Promise<PaneComposite | undefined> {
		// If same composite, just show it again
		if (this.currentCompositeId === compositeId) {
			const existing = this.composites.get(compositeId);
			if (existing) {
				this.showComposite(compositeId);
				return existing.composite;
			}
		}

		// Hide current composite (but don't dispose)
		if (this.currentCompositeId) {
			this.hideComposite(this.currentCompositeId);
		}

		// Get the correct registry based on location
		let registryId: string;
		switch (this.location) {
			case ViewContainerLocation.Panel:
				registryId = PaneCompositeExtensions.Panels;
				break;
			case ViewContainerLocation.AuxiliaryBar:
				registryId = PaneCompositeExtensions.Auxiliary;
				break;
			case ViewContainerLocation.Sidebar:
			default:
				registryId = PaneCompositeExtensions.Viewlets;
				break;
		}

		// Check if composite already exists
		const existing = this.composites.get(compositeId);
		if (existing) {
			this.showComposite(compositeId);
			return existing.composite;
		}

		// Get composite descriptor
		const registry = Registry.as<PaneCompositeRegistry>(registryId);
		const descriptor = registry.getPaneComposite(compositeId);

		if (!descriptor) {
			console.error(`[EmbeddedCompositeHost] Composite not found: ${compositeId}`);
			return undefined;
		}

		try {
			// Create the composite
			const composite = await this.createComposite(descriptor);

			if (!composite) {
				return undefined;
			}

			// Create container for composite
			const compositeContainer = document.createElement('div');
			compositeContainer.className = 'composite embedded-composite';
			compositeContainer.id = compositeId;
			compositeContainer.style.display = 'none'; // Start hidden

			// Let composite create its UI
			composite.create(compositeContainer);
			composite.updateStyles();

			// Add to our container
			this.container.appendChild(compositeContainer);

			// Store the composite
			this.composites.set(compositeId, { composite, container: compositeContainer });

			// Show it
			this.showComposite(compositeId);

			console.log(`[EmbeddedCompositeHost] Composite created and opened: ${compositeId}`);
			return composite;

		} catch (error) {
			console.error(`[EmbeddedCompositeHost] Failed to create composite ${compositeId}:`, error);
			return undefined;
		}
	}

	private async createComposite(descriptor: PaneCompositeDescriptor): Promise<PaneComposite | undefined> {
		// Create a scoped instantiation service for the composite
		const serviceCollection = new ServiceCollection();
		// Add any scoped services needed by the composite

		const compositeInstantiationService = this.instantiationService.createChild(serviceCollection);

		// Don't dispose the instantiation service - let the composite keep it
		// We'll dispose it when we dispose the entire host

		// Instantiate the composite using the descriptor's instantiate method
		const composite = descriptor.instantiate(compositeInstantiationService);

		// PaneComposite doesn't have an init method - it initializes through constructor
		// The composite is ready to use after instantiation

		return composite;
	}

	private showComposite(compositeId: string): void {
		const entry = this.composites.get(compositeId);
		if (!entry) {
			return;
		}

		// Hide current composite
		if (this.currentCompositeId && this.currentCompositeId !== compositeId) {
			this.hideComposite(this.currentCompositeId);
		}

		// Show the new composite
		entry.container.style.display = 'block';
		entry.container.style.height = '100%';
		entry.composite.setVisible(true);

		// Layout
		const bounds = this.container.getBoundingClientRect();
		entry.composite.layout(new Dimension(bounds.width, bounds.height));

		this.currentCompositeId = compositeId;
	}

	private hideComposite(compositeId: string): void {
		const entry = this.composites.get(compositeId);
		if (!entry) {
			return;
		}

		// Just hide it, don't dispose
		entry.composite.setVisible(false);
		entry.container.style.display = 'none';
	}

	layout(dimension: Dimension): void {
		if (this.currentCompositeId) {
			const entry = this.composites.get(this.currentCompositeId);
			if (entry) {
				entry.composite.layout(dimension);
			}
		}
	}

	override dispose(): void {
		// Dispose all composites
		for (const [_, entry] of this.composites) {
			entry.composite.setVisible(false);
			entry.composite.dispose();
			entry.container.remove();
		}
		this.composites.clear();

		// Clear disposables
		this.compositeDisposables.clear();

		super.dispose();
	}
}
