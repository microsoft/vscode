/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IUpdateService } from 'vs/platform/update/common/update';
import { IURLService } from 'vs/platform/url/common/url';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { ILogService } from 'vs/platform/log/common/log';
import { IMenubarService } from 'vs/platform/menubar/common/menubar';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Disposable } from 'vs/base/common/lifecycle';
import { SimpleConfigurationService, SimpleEnvironmentService, SimpleWindowsService, SimpleWindowService, SimpleUpdateService, SimpleURLService, SimpleMenubarService, SimpleLogService, SimpleWorkspaceService, SimpleStorageService, SimpleWorkspacesService } from 'vs/workbench/browser/nodeless.services';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { Workbench, IWorkbenchOptions } from 'vs/workbench/browser/workbench';

class CodeRendererMain extends Disposable {

	private workbench: Workbench;

	open(): Promise<void> {
		const services = this.initServices();

		return domContentLoaded().then(() => {
			mark('willStartWorkbench');

			const instantiationService = new InstantiationService(services, true);

			// Create Workbench
			this.workbench = instantiationService.createInstance(
				Workbench,
				document.body,
				{ hasInitialFilesToOpen: false } as IWorkbenchOptions,
				services
			);

			// Layout
			this._register(addDisposableListener(window, EventType.RESIZE, e => this.workbench.layout()));

			// Workbench Lifecycle
			this._register(this.workbench.onShutdown(() => this.dispose()));

			// Startup
			this.workbench.startup();
		});
	}

	private initServices(): ServiceCollection {
		const serviceCollection = new ServiceCollection();

		serviceCollection.set(IWindowsService, new SyncDescriptor(SimpleWindowsService));
		serviceCollection.set(IWindowService, new SyncDescriptor(SimpleWindowService));
		serviceCollection.set(IUpdateService, new SyncDescriptor(SimpleUpdateService));
		serviceCollection.set(IURLService, new SyncDescriptor(SimpleURLService));
		serviceCollection.set(IMenubarService, new SyncDescriptor(SimpleMenubarService));
		serviceCollection.set(IWorkspacesService, new SyncDescriptor(SimpleWorkspacesService));
		serviceCollection.set(IEnvironmentService, new SyncDescriptor(SimpleEnvironmentService));
		serviceCollection.set(ILogService, new SyncDescriptor(SimpleLogService));
		serviceCollection.set(IWorkspaceContextService, new SyncDescriptor(SimpleWorkspaceService));
		serviceCollection.set(IStorageService, new SyncDescriptor(SimpleStorageService));
		serviceCollection.set(IConfigurationService, new SyncDescriptor(SimpleConfigurationService));

		return serviceCollection;
	}
}

export function main(): Promise<void> {
	const renderer = new CodeRendererMain();

	return renderer.open();
}
