/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';

// import@node
import { InstantiationService } from 'vs/platform/instantiation/node/instantiationService';
import { IPCClient } from 'vs/base/parts/ipc/node/ipc';

// import@electron-browser
import { Workbench } from 'vs/workbench/electron-browser/workbench';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
	logService: ILogService;
	storageService: IStorageService;
}

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class Shell extends Disposable {
	private storageService: IStorageService;
	private environmentService: IEnvironmentService;
	private logService: ILogService;
	private configurationService: IConfigurationService;
	private contextService: IWorkspaceContextService;

	private container: HTMLElement;
	private mainProcessClient: IPCClient;
	private mainProcessServices: ServiceCollection;

	private configuration: IWindowConfiguration;

	constructor(
		container: HTMLElement,
		coreServices: ICoreServices,
		mainProcessServices: ServiceCollection,
		mainProcessClient: IPCClient,
		configuration: IWindowConfiguration
	) {
		super();

		this.container = container;
		this.mainProcessClient = this._register(mainProcessClient);

		this.configuration = configuration;

		this.contextService = coreServices.contextService;
		this.configurationService = coreServices.configurationService;
		this.environmentService = coreServices.environmentService;
		this.logService = coreServices.logService;
		this.storageService = coreServices.storageService;

		this.mainProcessServices = mainProcessServices;
	}

	open(): void {

		// Instantiation service with services
		const serviceCollection = this.initServiceCollection();
		const instantiationService = new InstantiationService(serviceCollection, true);

		// Workbench
		const workbench = this._register(instantiationService.createInstance(
			Workbench,
			this.container,
			this.configuration,
			serviceCollection,
			this.mainProcessClient
		));
		workbench.startup();

		// Window
		workbench.getInstantiationService().createInstance(ElectronWindow);
	}

	private initServiceCollection(): ServiceCollection {
		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);
		serviceCollection.set(ILogService, this._register(this.logService));
		serviceCollection.set(IStorageService, this.storageService);

		this.mainProcessServices.forEach((serviceIdentifier, serviceInstance) => {
			serviceCollection.set(serviceIdentifier, serviceInstance);
		});

		return serviceCollection;
	}
}
