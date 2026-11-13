/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { mark } from '../../../../base/common/performance.js';

export interface IUserDataInitializer {
	requiresInitialization(): Promise<boolean>;
	whenInitializationFinished(): Promise<void>;
	initializeRequiredResources(): Promise<void>;
	initializeInstalledExtensions(instantiationService: IInstantiationService): Promise<void>;
	initializeOtherResources(instantiationService: IInstantiationService): Promise<void>;
}

export const IUserDataInitializationService = createDecorator<IUserDataInitializationService>('IUserDataInitializationService');
export interface IUserDataInitializationService extends IUserDataInitializer {
	_serviceBrand: undefined;
}

export class UserDataInitializationService implements IUserDataInitializationService {

	_serviceBrand: undefined;

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

	static readonly ID = 'workbench.contrib.initializeOtherResources';

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
	registerWorkbenchContribution2(InitializeOtherResourcesContribution.ID, InitializeOtherResourcesContribution, WorkbenchPhase.AfterRestored);
}
