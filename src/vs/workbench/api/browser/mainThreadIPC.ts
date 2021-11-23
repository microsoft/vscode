/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, IExtHostContext, MainContext, MainThreadIPCShape, IPCHandle, ExtHostIPCShape } from '../common/extHost.protocol';
import { VSBuffer } from 'vs/base/common/buffer';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';

@extHostNamedCustomer(MainContext.MainThreadIPC)
export class MainThreadIPC implements MainThreadIPCShape {

	private static Handles = 0;

	private readonly emitter = new Emitter<{ handle: IPCHandle, message: VSBuffer }>();
	private readonly disposables = new Map<IPCHandle, IDisposable>();
	private proxy: ExtHostIPCShape | undefined;

	constructor(
		extHostContext: IExtHostContext,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		if (!environmentService.options?.ipcProvider) {
			return;
		}

		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostIPC);
	}

	async $register(extensionId: ExtensionIdentifier): Promise<IPCHandle | undefined> {
		if (!this.proxy) {
			return undefined;
		}

		const ipc = await this.environmentService.options?.ipcProvider?.getMessagePassingProtocol(extensionId.value);

		if (!ipc) {
			return undefined;
		}

		const handle = MainThreadIPC.Handles++;
		const disposables = new DisposableStore();

		ipc.onDidReceiveMessage(message => this.proxy!.$sendMessage(handle, VSBuffer.wrap(message)), undefined, disposables);
		Event.chain(this.emitter.event)
			.filter(e => e.handle === handle)
			.map(({ message }) => message.buffer)
			.event(message => ipc.sendMessage(message), undefined, disposables);

		this.disposables.set(handle, disposables);
		return handle;
	}

	async $sendMessage(handle: IPCHandle, message: VSBuffer): Promise<void> {
		this.emitter.fire({ handle, message });
	}

	dispose(): void {
		this.emitter.dispose();
	}
}
