/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/quickinput/browser/quickAccessHelp';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { IQuickAccessController, IQuickAccessProvider, IQuickAccessRegistry, Extensions, IQuickAccessProviderDescriptor } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class QuickAccessController extends Disposable implements IQuickAccessController {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	async show(prefix = ''): Promise<void> {
		const provider = this.getOrInstantiateProvider(prefix);

		provider.provide(this.quickInputService, CancellationToken.None);
	}

	private mapProviderToDescriptor = new Map<IQuickAccessProviderDescriptor, IQuickAccessProvider>();

	private getOrInstantiateProvider(prefix: string): IQuickAccessProvider {
		const providerDescriptor = this.registry.getQuickAccessProvider(prefix) || this.registry.defaultProvider;

		let provider = this.mapProviderToDescriptor.get(providerDescriptor);
		if (!provider) {
			provider = this.instantiationService.createInstance(providerDescriptor.ctor);
			this.mapProviderToDescriptor.set(providerDescriptor, provider);
		}

		return provider;
	}
}
