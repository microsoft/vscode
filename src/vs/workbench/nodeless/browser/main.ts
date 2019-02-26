/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWindowsService } from 'vs/platform/windows/common/windows';
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
import { SimpleWindowsService } from 'vs/workbench/nodeless/services/simpleWindowsService';
import { SimpleUpdateService } from 'vs/workbench/nodeless/services/simpleUpdateService';
import { SimpleURLService } from 'vs/workbench/nodeless/services/simpleURLService';
import { SimpleMenubarService } from 'vs/workbench/nodeless/services/simpleMenubarService';
import { SimpleWorkspacesService } from 'vs/workbench/nodeless/services/simpleWorkspacesService';
import { SimpleEnvironmentService } from 'vs/workbench/nodeless/services/simpleEnvironmentService';
import { SimpleWorkspaceService } from 'vs/workbench/nodeless/services/simpleWorkspaceService';
import { SimpleConfigurationService } from 'vs/workbench/nodeless/services/simpleConfigurationService';
import { SimpleWindowConfiguration } from 'vs/workbench/nodeless/services/simpleWindowService';
import { SimpleLogService } from 'vs/workbench/nodeless/services/simpleLogService';
import { SimpleStorageService } from 'vs/workbench/nodeless/services/simpleStorageService';

// tslint:disable-next-line: layering
import { Workbench } from 'vs/workbench/electron-browser/workbench';
// tslint:disable-next-line: layering
import { InstantiationService } from 'vs/platform/instantiation/node/instantiationService';

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
				new SimpleWindowConfiguration(),
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
