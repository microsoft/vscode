/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
import { IWorker } from 'vs/base/common/worker/simpleWorker';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

interface IWorker2 extends IWorker {
	onMessage: Event<any>;
}

class WorkerExtensionHost extends Disposable implements IWorkbenchContribution {

	readonly worker: IWorker2;

	constructor() {
		super();

		const emitter = new Emitter<any>();
		const worker = new DefaultWorkerFactory('WorkerExtensionHost').create(
			'vs/workbench/contrib/workerExtensions/worker/extensionWorker',
			msg => emitter.fire(msg),
			err => console.error(err)
		);

		this.worker = {
			dispose() { worker.dispose(); },
			getId() { return worker.getId(); },
			postMessage(msg, transfer?) { worker.postMessage(msg, transfer); },
			onMessage: emitter.event
		};

		this._register(worker);
		this._register(emitter);
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkerExtensionHost,
	LifecyclePhase.Ready
);

