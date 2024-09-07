/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const enum ExplorerExtensions {
	FileContributionRegistry = 'workbench.registry.explorer.fileContributions'
}

/**
 * Contributes to the rendering of a file in the explorer.
 */
export interface IExplorerFileContribution extends IDisposable {
	/**
	 * Called to render a file in the container. The implementation should
	 * remove any rendered elements if `resource` is undefined.
	 */
	setResource(resource: URI | undefined): void;
}

export interface IExplorerFileContributionDescriptor {
	create(insta: IInstantiationService, container: HTMLElement): IExplorerFileContribution;
}

export interface IExplorerFileContributionRegistry {
	/**
	 * Registers a new contribution. A new instance of the contribution will be
	 * instantiated for each template in the explorer.
	 */
	register(descriptor: IExplorerFileContributionDescriptor): void;
}

class ExplorerFileContributionRegistry implements IExplorerFileContributionRegistry {
	private readonly _onDidRegisterDescriptor = new Emitter<IExplorerFileContributionDescriptor>();
	public readonly onDidRegisterDescriptor = this._onDidRegisterDescriptor.event;

	private readonly descriptors: IExplorerFileContributionDescriptor[] = [];

	/** @inheritdoc */
	public register(descriptor: IExplorerFileContributionDescriptor): void {
		this.descriptors.push(descriptor);
		this._onDidRegisterDescriptor.fire(descriptor);
	}

	/**
	 * Creates a new instance of all registered contributions.
	 */
	public create(insta: IInstantiationService, container: HTMLElement, store: DisposableStore): IExplorerFileContribution[] {
		return this.descriptors.map(d => {
			const i = d.create(insta, container);
			store.add(i);
			return i;
		});
	}
}

export const explorerFileContribRegistry = new ExplorerFileContributionRegistry();
Registry.add(ExplorerExtensions.FileContributionRegistry, explorerFileContribRegistry);
