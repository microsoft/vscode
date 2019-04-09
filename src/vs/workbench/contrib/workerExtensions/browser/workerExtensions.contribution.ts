/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';

class WorkerExtensionHost extends Disposable implements IWorkbenchContribution {

	readonly protocol: IMessagePassingProtocol;

	constructor() {
		super();

		const emitter = new Emitter<VSBuffer>();
		const worker = new DefaultWorkerFactory('WorkerExtensionHost').create(
			'vs/workbench/contrib/workerExtensions/worker/extensionHostWorker',
			data => {
				if (data instanceof ArrayBuffer) {
					emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
				} else {
					console.warn('UNKNOWN data received', data);
				}
			},
			err => console.error(err)
		);

		this.protocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
				worker.postMessage(data, [data]);
			}
		};

		//
		this._register(worker);
		this._register(emitter);

		// this.protocol.send(VSBuffer.fromString('HELLO from Main'));
		// this.protocol.onMessage(buff => console.log(buff.toString()));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkerExtensionHost,
	LifecyclePhase.Ready
);

