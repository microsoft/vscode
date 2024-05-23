/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { mark } from 'vs/base/common/performance';

export interface IUserDataInitializer {
	requiresInitialization(): Promise<boolean>;
	whenInitializationFinished(): Promise<void>;
	initializeRequiredResources(): Promise<void>;
	initializeInstalledExtensions(instantiationService: IInstantiationService): Promise<void>;
	initializeOtherResources(instantiationService: IInstantiationService): Promise<void>;
}

export const IUserDataInitializationService = createDecorator<IUserDataInitializationService>('IUserDataInitializationService');
export interface IUserDataInitializationService extends IUserDataInitializer {
	_serviceBrand: any;
}

export class UserDataInitializationService implements IUserDataInitializationService {

	_serviceBrand: any;

	constructor(private readonly initializers: IUserDataInitializer[] = []) {
	}

	async whenInitializationFinished(): Promise<void> {
		if (await this.requiresInitialization()) {
			await Promise.all(this.initializers.map(initializer => initializer.whenInitializationFinished()));
		}
	}

	async requiresInitialization(): Promise<boolean> {
		return (await Promise.all(this.initializers.map(initializer => initializer.requiresInitialization()))).some(result => result);
	}

	async initializeRequiredResources(): Promise<void> {
		if (await this.requiresInitialization()) {
			await Promise.all(this.initializers.map(initializer => initializer.initializeRequiredResources()));
		}
	}

	async initializeOtherResources(instantiationService: IInstantiationService): Promise<void> {
		if (await this.requiresInitialization()) {
			await Promise.all(this.initializers.map(initializer => initializer.initializeOtherResources(instantiationService)));
		}
	}

	async initializeInstalledExtensions(instantiationService: IInstantiationService): Promise<void> {
		if (await this.requiresInitialization()) {
			await Promise.all(this.initializers.map(initializer => initializer.initializeInstalledExtensions(instantiationService)));
		}
	}

}

class InitializeOtherResourcesContribution implements IWorkbenchContribution {
	constructor(
		@IUserDataInitializationService userDataInitializeService: IUserDataInitializationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionService extensionService: IExtensionService
	) {
		extensionService.whenInstalledExtensionsRegistered().then(() => this.initializeOtherResource(userDataInitializeService, instantiationService));
	}

	private async initializeOtherResource(userDataInitializeService: IUserDataInitializationService, instantiationService: IInstantiationService): Promise<void> {
		if (await userDataInitializeService.requiresInitialization()) {
			mark('code/willInitOtherUserData');
			await userDataInitializeService.initializeOtherResources(instantiationService);
			mark('code/didInitOtherUserData');
		}
	}
}

if (isWeb) {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(InitializeOtherResourcesContribution, LifecyclePhase.Restored);
}
