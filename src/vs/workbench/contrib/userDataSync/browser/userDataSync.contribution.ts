/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { registerConfiguration } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { isWeb } from 'vs/base/common/platform';
import { UserDataAutoSync } from 'vs/platform/userDataSync/common/userDataSyncService';
import { IProductService } from 'vs/platform/product/common/productService';
import { UserDataSyncWorkbenchContribution } from 'vs/workbench/contrib/userDataSync/browser/userDataSync';

class UserDataSyncConfigurationContribution implements IWorkbenchContribution {

	constructor(
		@IProductService productService: IProductService
	) {
		if (productService.settingsSyncStoreUrl) {
			registerConfiguration();
		}
	}
}

class UserDataAutoSyncContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		if (isWeb) {
			instantiationService.createInstance(UserDataAutoSync);
		}
	}
}


const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncConfigurationContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UserDataAutoSyncContribution, LifecyclePhase.Restored);
