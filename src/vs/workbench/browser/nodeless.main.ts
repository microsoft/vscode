/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { SimpleLogService } from 'vs/workbench/browser/nodeless.simpleservices';
import { Workbench } from 'vs/workbench/browser/workbench';

class CodeRendererMain extends Disposable {

	private workbench: Workbench;

	open(): Promise<void> {
		const services = this.initServices();

		return domContentLoaded().then(() => {
			mark('willStartWorkbench');

			// Create Workbench
			this.workbench = new Workbench(
				document.body,
				services.serviceCollection,
				services.logService
			);

			// Layout
			this._register(addDisposableListener(window, EventType.RESIZE, () => this.workbench.layout()));

			// Workbench Lifecycle
			this._register(this.workbench.onShutdown(() => this.dispose()));

			// Startup
			this.workbench.startup();
		});
	}

	private initServices(): { serviceCollection: ServiceCollection, logService: ILogService } {
		const serviceCollection = new ServiceCollection();

		const logService = new SimpleLogService();
		serviceCollection.set(ILogService, logService);

		return { serviceCollection, logService };
	}
}

export function main(): Promise<void> {
	const renderer = new CodeRendererMain();

	return renderer.open();
}
