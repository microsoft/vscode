/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensionHostStarter';

export class ExtensionHostWebWorker extends Disposable implements IExtensionHostStarter {

	private _protocol?: IMessagePassingProtocol;
	private readonly _onDidCrashed = new Emitter<[number, string | null]>();

	readonly onCrashed: Event<[number, string | null]> = this._onDidCrashed.event;

	start(): Promise<IMessagePassingProtocol> {

		if (!this._protocol) {

			const emitter = new Emitter<VSBuffer>();
			const worker = new DefaultWorkerFactory('WorkerExtensionHost').create(
				'vs/workbench/contrib/workerExtensions/worker/extensionHostWorker', data => {
					if (data instanceof ArrayBuffer) {
						emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
					} else {
						console.warn('UNKNOWN data received', data);
					}
				}, err => {
					this._onDidCrashed.fire([81, err]);
					console.error(err);
				}
			);

			this._protocol = {
				onMessage: emitter.event,
				send: vsbuf => {
					const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
					worker.postMessage(data, [data]);
				}
			};

			//
			this._register(worker);
			this._register(emitter);
		}

		// this.protocol.send(VSBuffer.fromString('HELLO from Main'));
		// this.protocol.onMessage(buff => console.log(buff.toString()));
		return Promise.resolve(this._protocol);
	}

	getInspectPort(): number | undefined {
		return undefined;
	}
}



class WorkerExtensionHost extends Disposable implements IWorkbenchContribution {

	constructor() {
		super();
		new ExtensionHostWebWorker().start().then(protocol => {
			protocol.send(VSBuffer.fromString('HELLO from Main'));
			protocol.onMessage(buff => console.log(buff.toString()));
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkerExtensionHost,
	LifecyclePhase.Ready
);

