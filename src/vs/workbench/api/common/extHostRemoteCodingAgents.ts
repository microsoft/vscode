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
	private readonly _providers = new Map<number, {
		provider: vscode.RemoteCodingAgentInformationProvider;
		extension: IExtensionDescription;
	}>();
	private _nextHandle = 0;

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadRemoteCodingAgents);
	}

	registerAgentInformationProvider(extension: IExtensionDescription, provider: vscode.RemoteCodingAgentInformationProvider): vscode.Disposable {
		if (!provider || typeof provider.getAgentInformation !== 'function') {
			throw new Error('Invalid provider: must implement getAgentInformation method');
		}

		const handle = this._nextHandle++;
		this._providers.set(handle, { provider, extension });
		this._proxy.$registerAgentInformationProvider(handle);

		return new Disposable(() => {
			this._providers.delete(handle);
			this._proxy.$unregisterAgentInformationProvider(handle);
		});
	}

	async $getAgentInformation(handle: number): Promise<RemoteCodingAgentInformationDto[]> {
		const providerInfo = this._providers.get(handle);
		if (!providerInfo) {
			return [];
		}

		try {
			const result = await providerInfo.provider.getAgentInformation();
			const agentInfos = Array.isArray(result) ? result : [];
			
			// Validate and filter agent information
			const validAgentInfos: RemoteCodingAgentInformationDto[] = [];
			for (const agentInfo of agentInfos) {
				if (this._validateAgentInformation(agentInfo, providerInfo.extension)) {
					validAgentInfos.push({
						id: agentInfo.id,
						displayName: agentInfo.displayName,
						description: agentInfo.description,
						command: agentInfo.command,
						followUpRegex: agentInfo.followUpRegex,
						when: agentInfo.when
					});
				}
			}
			
			return validAgentInfos;
		} catch (error) {
			console.error(`Error getting agent information from provider ${providerInfo.extension.identifier.value}:`, error);
			return [];
		}
	}

	private _validateAgentInformation(agentInfo: any, extension: IExtensionDescription): boolean {
		if (!agentInfo || typeof agentInfo !== 'object') {
			console.warn(`Extension ${extension.identifier.value}: Agent information must be an object`);
			return false;
		}

		if (!agentInfo.id || typeof agentInfo.id !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent information must have a valid 'id' string`);
			return false;
		}

		if (!agentInfo.displayName || typeof agentInfo.displayName !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent information must have a valid 'displayName' string`);
			return false;
		}

		if (!agentInfo.command || typeof agentInfo.command !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent information must have a valid 'command' string`);
			return false;
		}

		if (agentInfo.description !== undefined && typeof agentInfo.description !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent 'description' must be a string if provided`);
			return false;
		}

		if (agentInfo.followUpRegex !== undefined && typeof agentInfo.followUpRegex !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent 'followUpRegex' must be a string if provided`);
			return false;
		}

		if (agentInfo.when !== undefined && typeof agentInfo.when !== 'string') {
			console.warn(`Extension ${extension.identifier.value}: Agent 'when' clause must be a string if provided`);
			return false;
		}

		return true;
	}
}