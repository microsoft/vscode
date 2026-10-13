/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import type { IProtocolServerExtension, IProtocolServerExtensionRequest } from '../protocolServerHandler.js';
import { MissionControlProjects } from './missionControlProjects.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

/** Copilot Host methods and catalogue projection for the Mission Control listener. */
export class MissionControlCopilotExtension implements IProtocolServerExtension {
	readonly rootMeta = { 'copilot.projectManagement': { available: true } };
	readonly requests: ReadonlyMap<string, IProtocolServerExtensionRequest>;
	get rootConfig() { return this._projects.config; }
	get onDidEmitAction() { return this._projects.onDidChange; }

	constructor(
		private readonly _projects: MissionControlProjects,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		const requests = new Map<string, IProtocolServerExtensionRequest>();
		for (const method of ['extensions/listProjects', 'extensions/addProject', 'extensions/removeProject', 'extensions/cloneProject']) {
			requests.set(method, {
				readOnly: method === 'extensions/listProjects',
				handle: async (params, checkAuthorization) => {
					const result = this._projects.handleRequest(method, params, checkAuthorization);
					if (!result) {
						throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, `Project catalogue does not support ${method}`);
					}
					return result;
				},
			});
		}
		for (const method of ['extensions/getPlan', 'extensions/setSessionApproveAll']) {
			requests.set(method, {
				readOnly: method === 'extensions/getPlan',
				requiresChannel: true,
				handle: params => this._handleSessionRequest(method, params),
			});
		}
		this.requests = requests;
	}

	initialize(): Promise<void> {
		return this._projects.initialize();
	}

	private async _handleSessionRequest(method: string, params: unknown): Promise<unknown> {
		if (!isRecord(params) || typeof params.channel !== 'string' || !this._stateManager.getSessionState(params.channel)) {
			throw new ProtocolError(AhpErrorCodes.SessionNotFound, 'Session does not exist');
		}
		const session = URI.parse(params.channel);
		const provider = this._providers.getProviderForSession(session);
		if (method === 'extensions/getPlan' && provider?.getSessionPlan) {
			return provider.getSessionPlan(session);
		}
		if (method === 'extensions/setSessionApproveAll' && provider?.setSessionApproveAll) {
			if (typeof params.enabled !== 'boolean') {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'enabled must be a boolean');
			}
			await provider.setSessionApproveAll(session, params.enabled);
			return null;
		}
		throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, `Provider does not support ${method}`);
	}
}
