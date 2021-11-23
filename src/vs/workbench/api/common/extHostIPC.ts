/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { VSBuffer } from 'vs/base/common/buffer';
import { ExtHostIPCShape, IPCHandle, MainContext, MainThreadIPCShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { MessagePassingProtocol } from 'vscode';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

export class ExtHostIPC implements ExtHostIPCShape {

	private readonly emitter = new Emitter<{ handle: IPCHandle, message: VSBuffer }>();
	private proxy: MainThreadIPCShape;

	constructor(@IExtHostRpcService rpc: IExtHostRpcService) {
		this.proxy = rpc.getProxy(MainContext.MainThreadIPC);
	}

	async getMessagePassingProtocol(extension: IExtensionDescription): Promise<MessagePassingProtocol | undefined> {
		const handle = await this.proxy.$register(extension.identifier);

		if (handle === undefined) {
			return undefined;
		}

		const onDidReceiveMessage = Event.chain(this.emitter.event)
			.filter(e => e.handle === handle)
			.map(({ message }) => message.buffer)
			.event;

		return {
			onDidReceiveMessage,
			sendMessage: (message) => {
				this.proxy.$sendMessage(handle, VSBuffer.wrap(message));
			}
		};
	}

	async $sendMessage(handle: IPCHandle, message: VSBuffer): Promise<void> {
		this.emitter.fire({ handle, message });
	}

	dispose(): void {
		this.emitter.dispose();
	}
}
