/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, raceCancellationError } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { CloudAutomationApiClient, CloudAutomationMutationUncertainError } from '../../browser/cloudAutomationApiClient.js';

const repository = { owner: 'example', name: 'private-repo' };
const account: IDefaultAccount = { accountName: 'octocat', sessionId: 'auth-1', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
const definition = {
	id: 'automation-1', name: 'Review', prompt: 'Review issues.', disabled: true,
	triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30 } },
	created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
};

interface ResponseData {
	status: number;
	data?: object;
	headers?: Record<string, string>;
}

class Requests extends mock<IRequestService>() {
	readonly calls: IRequestOptions[] = [];
	readonly responses: (ResponseData | Promise<ResponseData>)[] = [];
	onRequest?: () => void;
	override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.calls.push(options);
		this.onRequest?.();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const pending = this.responses.shift();
		assert.ok(pending, 'Unexpected API request.');
		const response = await raceCancellationError(Promise.resolve(pending), token);
		return {
			res: { statusCode: response.status, headers: response.headers ?? {} },
			stream: bufferToStream(VSBuffer.fromString(response.data === undefined ? '' : JSON.stringify(response.data))),
		};
	}
}

suite('CloudAutomationApiClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function setup(sessions?: Promise<readonly AuthenticationSession[]>) {
		const requests = new Requests();
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = account;
			override getDefaultAccountAuthenticationProvider() { return account.authenticationProvider; }
		}();
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IRequestService, requests);
		instantiation.stub(IDefaultAccountService, accounts);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IAuthenticationService, {
			getSessions: async () => sessions ?? [
				{ id: 'other', account: { id: 'other', label: 'other-account' }, accessToken: 'other-token', scopes: ['repo'] },
				{ id: 'auth-1', account: { id: 'octocat-id', label: 'octocat' }, accessToken: 'test-token', scopes: ['repo'] },
			],
		});
		return { requests, accounts, client: disposables.add(instantiation.createInstance(CloudAutomationApiClient)) };
	}

	test('uses the selected account and CORS-capable Copilot endpoint with explicit creation grants', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 201, data: definition });
		const created = await client.create('octocat', repository, { name: 'Review', prompt: 'Review issues.', disabled: true, triggers: {}, tools: [] }, CancellationToken.None);
		const request = requests.calls[0];
		assert.deepStrictEqual({
			created, url: request.url, method: request.type,
			authorization: request.headers?.Authorization, contentType: request.headers?.['Content-Type'],
			body: JSON.parse(request.data!),
		}, {
			created: definition, url: 'https://api.githubcopilot.com/agents/repos/example/private-repo/automations', method: 'POST',
			authorization: 'Bearer test-token', contentType: 'application/json',
			body: { name: 'Review', prompt: 'Review issues.', disabled: true, triggers: {}, tools: [], description: '', mcp_servers: [], require_actor_write_permission: true },
		});
	});

	test('preserves the API prefix when pagination links omit it and loads missing prompts explicitly', async () => {
		const { requests, client } = setup();
		const { prompt: _prompt, ...summary } = definition;
		requests.responses.push(
			{ status: 200, data: { automations: [summary] }, headers: { link: '</agents/repos/example/private-repo/automations/v2?page=2>; rel="next"' } },
			{ status: 200, data: definition },
			{ status: 200, data: { automations: [{ ...definition, id: 'automation-2' }] } },
		);
		const definitions = await client.list('octocat', repository, CancellationToken.None);
		assert.deepStrictEqual({ ids: definitions.map(value => value.id), paths: requests.calls.map(value => new URL(value.url!).pathname + new URL(value.url!).search) }, {
			ids: ['automation-1', 'automation-2'],
			paths: [
				'/agents/repos/example/private-repo/automations/v2?per_page=100&page=1&ownership=user',
				'/agents/automations/automation-1',
				'/agents/repos/example/private-repo/automations/v2?per_page=100&page=2&ownership=user',
			],
		});
	});

	test('PATCH only sends supplied fields and retains structured schedule validation errors', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 422, data: { message: 'Validation Failed', errors: [{ message: 'minute_utc must be 0, 15, 30, or 45' }] } });
		await assert.rejects(client.update('octocat', repository, definition.id, { disabled: false }, CancellationToken.None), /Validation Failed: minute_utc/);
		assert.deepStrictEqual({ contentType: requests.calls[0].headers?.['Content-Type'], body: JSON.parse(requests.calls[0].data!) }, { contentType: 'application/merge-patch+json', body: { disabled: false } });
	});

	for (const outcome of ['success', 'cancel', 'failure'] as const) {
		test(`missing prompts use at most five concurrent detail requests (${outcome})`, async () => {
			const { requests, client } = setup();
			const detailRequests = sinon.spy(client, 'get');
			const source = disposables.add(new CancellationTokenSource());
			const definitions = Array.from({ length: 7 }, (_, index) => ({ ...definition, id: `automation-${index}` }));
			const pending = definitions.map(() => new DeferredPromise<ResponseData>());
			const firstBatch = new DeferredPromise<void>();
			const nextRequest = new DeferredPromise<void>();
			requests.onRequest = () => {
				if (requests.calls.length === 6) {
					void firstBatch.complete();
				} else if (requests.calls.length === 7) {
					void nextRequest.complete();
				}
			};
			requests.responses.push(
				{ status: 200, data: { automations: definitions.map(({ prompt: _prompt, ...summary }) => summary) } },
				...pending.map(value => value.p),
			);
			const list = client.list('octocat', repository, source.token);
			const error = new Error('Detail failed');
			const settled = outcome === 'success' ? list : assert.rejects(list, outcome === 'cancel' ? isCancellationError : value => value === error);
			try {
				await firstBatch.p;
				assert.strictEqual(requests.calls.length, 6, 'One list request and five concurrent detail requests');
				if (outcome === 'success') {
					await pending[4].complete({ status: 200, data: definitions[4] });
					await nextRequest.p;
					for (let index = pending.length - 1; index >= 0; index--) {
						if (index !== 4) {
							await pending[index].complete({ status: 200, data: definitions[index] });
						}
					}
					assert.deepStrictEqual(await list, definitions, 'Preserves list order despite out-of-order detail responses');
				} else {
					if (outcome === 'cancel') {
						source.cancel();
					} else {
						await pending[0].error(error);
					}
					await settled;
					assert.deepStrictEqual({
						detailLookups: detailRequests.callCount,
						httpRequests: requests.calls.length,
					}, { detailLookups: 5, httpRequests: 6 }, 'Does not start queued details after cancellation or failure');
				}
			} finally {
				source.cancel();
				await settled;
				for (const response of pending) {
					if (!response.isSettled) {
						await response.complete({ status: 200, data: definition });
					}
				}
			}
		});
	}

	test('treats a lost creation result as uncertain rather than allowing an automatic retry', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 503, data: { message: 'Unavailable' } });
		await assert.rejects(client.create('octocat', repository, { name: 'Review' }, CancellationToken.None), CloudAutomationMutationUncertainError);
		assert.equal(requests.calls.length, 1);
	});

	for (const method of ['create', 'update', 'delete', 'run', 'stopTask'] as const) {
		for (const afterDispatch of [false, true]) {
			test(`${method} cancellation ${afterDispatch ? 'after' : 'before'} dispatch is ${afterDispatch ? 'uncertain' : 'definite'}`, async () => {
				const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
				const { requests, client } = setup(afterDispatch ? undefined : sessions.p);
				const source = disposables.add(new CancellationTokenSource());
				if (afterDispatch) {
					requests.onRequest = () => source.cancel();
				}
				const operations = {
					create: () => client.create('octocat', repository, { name: 'Review' }, source.token),
					update: () => client.update('octocat', repository, definition.id, { disabled: false }, source.token),
					delete: () => client.delete('octocat', repository, definition.id, source.token),
					run: () => client.run('octocat', repository, definition.id, 'manual', source.token),
					stopTask: () => client.stopTask('octocat', 'exact-task', source.token),
				};
				const operation = operations[method]();
				if (!afterDispatch) {
					source.cancel();
				}
				try {
					await assert.rejects(operation, error => afterDispatch
						? error instanceof CloudAutomationMutationUncertainError && isCancellationError(error.cause)
						: isCancellationError(error));
					assert.strictEqual(requests.calls.length, afterDispatch ? 1 : 0);
				} finally {
					await sessions.complete([]);
				}
			});
		}
	}

	test('accepts sparse definition metadata but rejects a mismatched repository', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 200, data: definition }, { status: 200, data: { ...definition, repository: { owner: 'different', name: 'repo' } } });
		assert.deepStrictEqual(await client.get('octocat', repository, definition.id, CancellationToken.None), definition);
		await assert.rejects(client.get('octocat', repository, definition.id, CancellationToken.None), /invalid cloud automation response/);
	});

	test('dispatch acknowledgement does not require or invent a task ID', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 202, data: { automation_id: definition.id, event: 'manual', conclusion: '', type: '' } });
		assert.equal(await client.run('octocat', repository, definition.id, 'manual', CancellationToken.None), undefined);
		assert.deepStrictEqual(JSON.parse(requests.calls[0].data!), { event: 'manual' });
	});

	test('stops the exact task through the abort steering endpoint', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 202 });
		await client.stopTask('octocat', 'exact-task', CancellationToken.None);
		assert.deepStrictEqual(requests.calls.map(request => ({
			url: request.url, method: request.type, body: JSON.parse(request.data!),
		})), [{ url: 'https://api.githubcopilot.com/agents/tasks/exact-task/steer', method: 'POST', body: { type: 'abort' } }]);
	});

	test('does not retry or hide an unconfirmed stop request', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 503, data: { message: 'Unavailable' } });
		await assert.rejects(client.stopTask('octocat', 'exact-task', CancellationToken.None), CloudAutomationMutationUncertainError);
		assert.strictEqual(requests.calls.length, 1);
	});

	test('does not send a request after an account change or cancellation', async () => {
		const { requests, client, accounts } = setup();
		accounts.currentDefaultAccount = null;
		await assert.rejects(client.list('octocat', repository, CancellationToken.None));
		await assert.rejects(client.list('octocat', repository, CancellationToken.Cancelled));
		assert.equal(requests.calls.length, 0);
	});

	test('private-repository eligibility uses the GitHub REST endpoint and selected account', async () => {
		const { requests, client } = setup();
		requests.responses.push({ status: 200, data: { private: false } });
		await assert.rejects(client.requirePrivateRepository('octocat', repository, CancellationToken.None), /private GitHub repository/);
		assert.deepStrictEqual({ url: requests.calls[0].url, authorization: requests.calls[0].headers?.Authorization }, {
			url: 'https://api.github.com/repos/example/private-repo', authorization: 'token test-token',
		});
	});
});
