/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IInstantiationService, ServicesAccessor, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

/**
 * An ext host contribution that will be loaded when the extension host starts and disposed when the extension host shuts down.
 */
export interface IExtHostContribution extends IDisposable {
	// Marker Interface
}

export namespace Extensions {
	export const ExtHost = 'exthost.contributions.kind';
}

type IExtHostContributionSignature<Service extends BrandedService[]> = new (...services: Service) => IExtHostContribution;

export interface IExtHostContributionsRegistry {

	/**
	 * Registers a ext host contribution to the platform that will be loaded when the extension host starts and disposed when the extension host shuts down.
	 */
	registerExtHostContribution<Services extends BrandedService[]>(contribution: IExtHostContributionSignature<Services>): void;

	/**
	 * Starts the registry by providing the required services.
	 */
	start(accessor: ServicesAccessor): void;

	/**
	 * Stops the registry by disposing the instantiated contributions
	 */
	stop(): void;
}

class ExtHostContributionsRegistry implements IExtHostContributionsRegistry {

	private instantiationService: IInstantiationService | undefined;
	private readonly contributions: IConstructorSignature0<IExtHostContribution>[] = [];
	private toBeInstantiated: IConstructorSignature0<IExtHostContribution>[] = [];
	private instantiated: IExtHostContribution[] = [];

	registerExtHostContribution<Services extends BrandedService[]>(ctor: { new(...services: Services): IExtHostContribution }): void {
		this.contributions.push(ctor);

		// Instantiate directly if started
		if (this.instantiationService) {
			this.instantiate(ctor);
		}

		// Otherwise keep contributions to be instantiated
		else {
			this.toBeInstantiated.push(ctor);
		}
	}

	start(accessor: ServicesAccessor): void {
		this.instantiationService = accessor.get(IInstantiationService);
		this.toBeInstantiated.forEach(ctor => this.instantiate(ctor), this);
		this.toBeInstantiated = [];
	}

	private instantiate<Services extends BrandedService[]>(ctor: { new(...services: Services): IExtHostContribution }) {
		this.instantiated.push(this.instantiationService!.createInstance(ctor));
	}

	stop(): void {
		this.instantiationService = undefined;
		this.instantiated.forEach(dispose);
		this.instantiated = [];
		this.toBeInstantiated = [...this.contributions];
	}

}

Registry.add(Extensions.ExtHost, new ExtHostContributionsRegistry());

