/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationSession } from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import type { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement';
import type { ILogService } from '../../../../../platform/log/common/logService';
import { type FetchOptions, type IFetcherService, HeadersImpl, Response } from '../../../../../platform/networking/common/fetcherService';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { MissionControlApiClient } from '../missionControlApiClient';

function createResponse(body: string): Response {
	return Response.fromText(200, 'OK', new HeadersImpl({ 'content-type': 'application/json' }), body, 'test-stub');
}

describe('MissionControlApiClient', () => {
	it('uses the shared integration id for all mission control requests', async () => {
		const requests: Array<{ url: string; options: FetchOptions }> = [];
		const fetcherService = {
			_serviceBrand: undefined,
			onDidFetch: new Emitter().event,
			onDidCompleteFetch: new Emitter().event,
			getUserAgentLibrary: () => 'test',
			fetch: vi.fn(async (url: string, options: FetchOptions) => {
				requests.push({ url, options });

				if (url.endsWith('/commands')) {
					return createResponse(JSON.stringify({ commands: [] }));
				}

				if (url.endsWith('/agents/sessions')) {
					return createResponse(JSON.stringify({ id: 'mc-session', task_id: 'task-1' }));
				}

				return createResponse('{}');
			}),
			createWebSocket: vi.fn(),
			disconnectAll: vi.fn(),
			makeAbortController: vi.fn(),
			isAbortError: vi.fn(() => false),
			isInternetDisconnectedError: vi.fn(() => false),
			isFetcherError: vi.fn(() => false),
			isNetworkProcessCrashedError: vi.fn(() => false),
			getUserMessageForFetcherError: vi.fn(() => ''),
			fetchWithPagination: vi.fn(),
		} as unknown as IFetcherService;

		const githubSession = {
			accessToken: 'github-token',
		} as AuthenticationSession;
		const authenticationService = {
			_serviceBrand: undefined,
			getGitHubSession: vi.fn(async () => githubSession),
			getCopilotToken: vi.fn(async () => ({ token: 'copilot-token', endpoints: { api: 'https://api.github.test/' } })),
		} as unknown as IAuthenticationService;
		const logService = {
			_serviceBrand: undefined,
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			show: vi.fn(),
			createSubLogger: () => logService,
			withExtraTarget: () => logService,
		} as unknown as ILogService;

		const client = new MissionControlApiClient(authenticationService, fetcherService, logService);

		await client.createSession(1, 2, 'task-1', {});
		await client.submitEvents('mc-session', [], []);
		await client.getPendingCommands('mc-session');
		await client.deleteSession('mc-session');

		expect(requests).toHaveLength(4);
		expect(requests.map(({ options }) => options.headers?.['Copilot-Integration-Id'])).toEqual([
			INTEGRATION_ID,
			INTEGRATION_ID,
			INTEGRATION_ID,
			INTEGRATION_ID,
		]);
		expect(requests.map(({ url }) => url)).toEqual([
			'https://api.github.test/agents/sessions',
			'https://api.github.test/agents/sessions/mc-session/events',
			'https://api.github.test/agents/sessions/mc-session/commands',
			'https://api.github.test/agents/sessions/mc-session',
		]);
	});
});
