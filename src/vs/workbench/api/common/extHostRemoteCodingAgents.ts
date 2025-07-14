/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostRemoteCodingAgentsShape, MainContext, MainThreadRemoteCodingAgentsShape, RemoteCodingAgentInformationDto } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable } from './extHostTypes.js';

export interface IExtHostRemoteCodingAgents extends ExtHostRemoteCodingAgents { }
export const IExtHostRemoteCodingAgents = createDecorator<IExtHostRemoteCodingAgents>('IExtHostRemoteCodingAgents');

export class ExtHostRemoteCodingAgents implements ExtHostRemoteCodingAgentsShape {

	declare _serviceBrand: undefined;

	private readonly _proxy: MainThreadRemoteCodingAgentsShape;
	private readonly _providers = new Map<number, vscode.RemoteCodingAgentInformationProvider>();
	private _nextHandle = 0;

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadRemoteCodingAgents);
	}

	registerAgentInformationProvider(extension: IExtensionDescription, provider: vscode.RemoteCodingAgentInformationProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		this._providers.set(handle, provider);
		this._proxy.$registerAgentInformationProvider(handle);

		return new Disposable(() => {
			this._providers.delete(handle);
			this._proxy.$unregisterAgentInformationProvider(handle);
		});
	}

	async $getAgentInformation(handle: number): Promise<RemoteCodingAgentInformationDto[]> {
		const provider = this._providers.get(handle);
		if (!provider) {
			return [];
		}

		try {
			const agentInfo = await provider.getAgentInformation();
			return Array.isArray(agentInfo) ? agentInfo : [];
		} catch (error) {
			console.error('Error getting agent information from provider:', error);
			return [];
		}
	}
}