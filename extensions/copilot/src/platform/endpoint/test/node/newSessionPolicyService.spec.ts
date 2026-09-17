/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, test, vi } from 'vitest';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Emitter } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { LogLevel, LogServiceImpl } from '../../../log/common/logService';
import { FetchOptions, HeadersImpl, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { ICAPIClientService } from '../../common/capiClient';
import { IDomainChangeEvent, IDomainService } from '../../common/domainService';
import { NewSessionPolicyService } from '../../node/newSessionPolicyService';

describe('NewSessionPolicyService', () => {
	const disposables = new DisposableStore();
	afterEach(() => {
		disposables.clear();
		vi.useRealTimers();
	});

	function setup() {
		const authChanges = disposables.add(new Emitter<void>());
		const domainChanges = disposables.add(new Emitter<IDomainChangeEvent>());
		const requests: { url: string; options: FetchOptions; response: DeferredPromise<Response> }[] = [];
		const warnings: string[] = [];
		const service = disposables.add(new NewSessionPolicyService(
			{
				onDidAuthenticationChange: authChanges.event,
				hasCopilotTokenSource: true,
				getCopilotToken: async () => new CopilotToken(createTestExtendedTokenInfo({ token: 'fixture-token' })),
			} as IAuthenticationService,
			{ capiPingURL: 'https://api.example.test/_ping' } as ICAPIClientService,
			{ onDidChangeDomains: domainChanges.event } as IDomainService,
			{
				fetch: async (url: string, options: FetchOptions) => {
					const response = new DeferredPromise<Response>();
					requests.push({ url, options, response });
					return response.p;
				},
			} as IFetcherService,
			NullEnvService.Instance,
			disposables.add(new LogServiceImpl([{ logIt: (level, message) => {
				if (level === LogLevel.Warning) {
					warnings.push(message);
				}
			} }])),
		));
		return { service, requests, authChanges, domainChanges, warnings };
	}

	function response(body: object, status = 200): Response {
		return Response.fromText(status, '', new HeadersImpl({}), JSON.stringify(body), 'node-fetch');
	}

	const treatment = {
		new_session_policy: {
			version: 1, experiment_id: 'auto_default_v1', assignment: 'treatment',
			assignment_context: 'fixture-auto-default:treatment', default_model: 'auto',
		},
	};

	test('uses authenticated endpoint and capability header and refreshes for the next session', async () => {
		const { service, requests } = setup();
		const first = service.refresh();
		await Promise.resolve();
		await requests[0].response.complete(response(treatment));
		const decision = await first;
		const second = service.refresh();
		const withdrawn = service.decision;
		await Promise.resolve();
		await requests[1].response.complete(response({}));
		expect({
			url: requests[0].url,
			method: requests[0].options.method,
			capability: requests[0].options.headers?.['X-Copilot-New-Session-Policy'],
			authorization: requests[0].options.headers?.Authorization,
			decision, withdrawn, next: await second,
		}).toEqual({
			url: 'https://api.example.test/chat/session-policy', method: 'GET', capability: '1',
			authorization: 'Bearer fixture-token',
			decision: { variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment' },
			withdrawn: undefined, next: undefined,
		});
	});

	test.each(['auth', 'origin'] as const)('rejects late results across %s changes', async kind => {
		const { service, requests, authChanges, domainChanges } = setup();
		const old = service.refresh();
		await Promise.resolve();
		if (kind === 'auth') {
			authChanges.fire();
		} else {
			domainChanges.fire({ capiUrlChanged: true, proxyUrlChanged: false, dotcomUrlChanged: false, telemetryUrlChanged: false });
		}
		const current = service.refresh();
		await Promise.resolve();
		await requests[1].response.complete(response({}));
		await current;
		await requests[0].response.complete(response(treatment));
		expect([await old, service.decision, requests[0].options.signal?.aborted]).toEqual([undefined, undefined, true]);
	});

	test('coalesces simultaneous refreshes without reusing completed decisions', async () => {
		const { service, requests } = setup();
		const first = service.refresh();
		const second = service.refresh();
		await Promise.resolve();
		await requests[0].response.complete(response(treatment));
		expect([first === second, requests.length, await first, await second]).toEqual([
			true, 1,
			{ variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment' },
			{ variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment' },
		]);
	});

	test.each([404, 500])('preserves baseline for HTTP %s', async status => {
		const { service, requests, warnings } = setup();
		const pending = service.refresh();
		await Promise.resolve();
		await requests[0].response.complete(response({}, status));
		expect([await pending, service.decision, warnings.length]).toEqual([undefined, undefined, status === 404 ? 0 : 1]);
	});

	test('bounds a stalled request and rejects its later treatment', async () => {
		vi.useFakeTimers();
		const { service, requests, warnings } = setup();
		const pending = service.refresh();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(5000);
		const result = await pending;
		await requests[0].response.complete(response(treatment));
		await Promise.resolve();
		expect([result, service.decision, requests[0].options.signal?.aborted, warnings.length]).toEqual([undefined, undefined, true, 1]);
	});

	test('an old account timeout cannot cancel a new account request', async () => {
		vi.useFakeTimers();
		const { service, requests, authChanges } = setup();
		const old = service.refresh();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1000);
		authChanges.fire();
		const current = service.refresh();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(4000);
		await requests[1].response.complete(response(treatment));
		expect([await old, await current, requests[1].options.signal?.aborted]).toEqual([
			undefined, { variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment' }, false,
		]);
		await requests[0].response.complete(response({}));
	});
});
