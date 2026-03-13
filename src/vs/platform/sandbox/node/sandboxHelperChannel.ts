/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { RemoteAgentConnectionContext } from '../../remote/common/remoteAgentEnvironment.js';
import { type ISandboxRuntimeConfig } from '../common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../common/sandboxHelperService.js';

export class SandboxHelperChannel implements IServerChannel<RemoteAgentConnectionContext> {

	constructor(
		@ISandboxHelperService private readonly sandboxHelperService: ISandboxHelperService
	) { }

	listen<T>(context: RemoteAgentConnectionContext, event: string): Event<T> {
		switch (event) {
			case 'onDidRequestSandboxPermission': {
				return this.sandboxHelperService.onDidRequestSandboxPermission as Event<T>;
			}
		}

		throw new Error('Invalid listen');
	}

	async call<T>(context: RemoteAgentConnectionContext, command: string, args?: unknown): Promise<T> {
		const argsArray = Array.isArray(args) ? args : [];
		switch (command) {
			case 'resetSandbox': {
				return this.sandboxHelperService.resetSandbox() as T;
			}
			case 'resolveSandboxPermissionRequest': {
				return this.sandboxHelperService.resolveSandboxPermissionRequest(argsArray[0] as string, argsArray[1] as boolean) as T;
			}
			case 'wrapWithSandbox': {
				return this.sandboxHelperService.wrapWithSandbox(argsArray[0] as ISandboxRuntimeConfig, argsArray[1] as string) as T;
			}
		}

		throw new Error('Invalid call');
	}
}
