/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as copilotApi from '@vscode/copilot-api';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDevDeviceId, getMachineId } from '../../../base/node/id.js';
import { CopilotApiService, FetchFunction } from '../../github/common/copilotApiService.js';
import { IGitHubService } from '../../github/common/githubService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';

/** Supplies host endpoints, credential provenance and device metadata to the portable Copilot service. */
export class AgentHostCopilotApiService extends CopilotApiService {
	constructor(
		fetchFn: FetchFunction | undefined,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService,
		@IAgentHostGitHubEndpointService endpointService: IAgentHostGitHubEndpointService,
		@IGitHubService gitHubService: IGitHubService,
		@IAgentHostAuthenticationService authenticationService: IAgentHostAuthenticationService,
	) {
		super({
			api: copilotApi,
			fetch: fetchFn,
			endpoints: endpointService,
			getAccountId: token => authenticationService.getAuthAccountForToken(endpointService.getCopilotResource().resource, token)?.accountId,
			getExtensionInformation: async () => {
				const [machineId, deviceId] = await Promise.all([
					getMachineId(error => logService.warn('[CopilotApiService] getMachineId failed', error)),
					getDevDeviceId(error => logService.warn('[CopilotApiService] getDevDeviceId failed', error)),
				]);
				return {
					name: 'agent-host',
					sessionId: generateUuid(),
					machineId,
					deviceId,
					vscodeVersion: productService.version,
					version: productService.version,
					buildType: productService.quality === 'stable' ? 'prod' : 'dev',
				};
			},
			getApiUrlOverride: () => {
				const value = process.env['VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE'];
				if (!value) {
					return undefined;
				}
				if (isAllowedCapiUrlOverride(value)) {
					return value;
				}
				logService.warn('[CopilotApiService] Ignoring non-loopback CAPI URL override; falling back to normal endpoint discovery');
				return undefined;
			},
		}, logService, gitHubService);
		this._register(authenticationService.onDidChangeAuthToken(event => {
			if (event.resource === endpointService.getCopilotResource().resource && event.previousToken && event.previousToken !== event.token) {
				this.invalidateCredential(event.previousToken);
			}
		}));
	}
}

function isAllowedCapiUrlOverride(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
		return false;
	}
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
		|| (host === 'vscode-smoke.test' && !!process.env['VSCODE_SMOKE_TEST_PROXY_HEADER']);
}
