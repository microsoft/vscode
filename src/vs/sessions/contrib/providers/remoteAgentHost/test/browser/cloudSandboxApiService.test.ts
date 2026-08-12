/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRequestContext } from '../../../../../../base/parts/request/common/request.js';
import { CLOUD_SANDBOX_AGENT_SLUG } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { CloudSandboxApiService } from '../../browser/cloudSandboxApiService.js';
import { ICloudSandboxTelemetryService } from '../../browser/cloudSandboxTelemetry.js';

function jsonResponse(body: unknown, statusCode = 200): IRequestContext {
	return {
		res: { headers: {}, statusCode },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

/** A task as Mission Control actually returns it: the repository is a bare numeric id. */
function task(id: string, name: string, repositoryId: number | undefined, sessionId: string, environmentId: string) {
	return {
		id,
		name,
		agent_collaborators: [{ slug: CLOUD_SANDBOX_AGENT_SLUG }],
		compute: { provider: 'sandboxes' },
		...(repositoryId !== undefined ? { repository: { id: repositoryId } } : {}),
		sessions: [{ id: sessionId, environment_id: environmentId }],
	};
}

interface ITestSetup {
	readonly service: CloudSandboxApiService;
	readonly requestedUrls: string[];
}

function createService(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, options: {
	readonly tasks: readonly unknown[];
	/** Repository id -> response, or 'error' to fail the lookup. */
	readonly repositories: ReadonlyMap<number, { full_name?: string } | 'error'>;
}): ITestSetup {
	const requestedUrls: string[] = [];
	const instantiationService = store.add(new TestInstantiationService());

	instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
		override async request(opts: { url?: string }): Promise<IRequestContext> {
			const url = opts.url ?? '';
			requestedUrls.push(url);
			const repoMatch = url.match(/\/repositories\/(\d+)$/);
			if (repoMatch) {
				const entry = options.repositories.get(Number(repoMatch[1]));
				if (entry === 'error') {
					return jsonResponse({ message: 'Not Found' }, 404);
				}
				return jsonResponse(entry ?? {});
			}
			if (/\/tasks\/[^/]+$/.test(url)) {
				const id = url.split('/').pop()!;
				return jsonResponse(options.tasks.find(t => (t as { id: string }).id === decodeURIComponent(id)));
			}
			return jsonResponse({ tasks: options.tasks });
		}
	}());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override async getSessions() { return [{ accessToken: 'tok', id: 's', account: { id: 'a', label: 'a' }, scopes: [] }]; }
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(IProductService, { defaultChatAgent: undefined } as unknown as IProductService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportRequest(): void { }
	}());

	return { service: store.add(instantiationService.createInstance(CloudSandboxApiService)), requestedUrls };
}

suite('CloudSandboxApiService repository resolution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the repository name from its numeric id', async () => {
		const { service } = createService(store, {
			tasks: [task('task-1', 'Change port to 5555', 290012776, 'sess-1', 'env-1')],
			repositories: new Map([[290012776, { full_name: 'osortega/simple-server' }]]),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual(result, {
			kind: 'complete',
			sessions: [{
				environmentId: 'env-1',
				sessionId: 'sess-1',
				taskId: 'task-1',
				name: 'Change port to 5555',
				repoName: 'osortega/simple-server',
				updatedAt: undefined,
			}],
		});
	});

	test('resolves each repository once across a whole discovery pass', async () => {
		// Tasks resolve concurrently, so the in-flight promise must be shared, not just the result.
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'a', 290012776, 'sess-1', 'env-1'),
				task('task-2', 'b', 290012776, 'sess-2', 'env-2'),
				task('task-3', 'c', 999, 'sess-3', 'env-3'),
			],
			repositories: new Map<number, { full_name?: string }>([
				[290012776, { full_name: 'osortega/simple-server' }],
				[999, { full_name: 'osortega/other' }],
			]),
		});

		const result = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			names: result.kind === 'failed' ? [] : result.sessions.map(s => s.repoName),
			repoLookups: requestedUrls.filter(u => /\/repositories\//.test(u)).length,
		}, {
			names: ['osortega/simple-server', 'osortega/simple-server', 'osortega/other'],
			repoLookups: 2,
		});
	});

	test('a failed lookup leaves every sharing session discoverable and is retried next pass', async () => {
		// Two tasks on the same failing repository: they share one memoized promise, and if it
		// rejects the callers that receive it drop their sessions from the listing entirely.
		const repositories = new Map<number, { full_name?: string } | 'error'>([[290012776, 'error']]);
		const { service, requestedUrls } = createService(store, {
			tasks: [
				task('task-1', 'Change port to 5555', 290012776, 'sess-1', 'env-1'),
				task('task-2', 'hi', 290012776, 'sess-2', 'env-2'),
			],
			repositories,
		});

		const first = await service.listSessions(CancellationToken.None);
		repositories.set(290012776, { full_name: 'osortega/simple-server' });
		const second = await service.listSessions(CancellationToken.None);

		assert.deepStrictEqual({
			// `complete`, not `partial`: the sessions resolved fine, only their label did not.
			firstKind: first.kind,
			firstSessions: first.kind === 'failed' ? [] : first.sessions.map(s => s.sessionId),
			firstNames: first.kind === 'failed' ? [] : first.sessions.map(s => s.repoName),
			secondNames: second.kind === 'failed' ? [] : second.sessions.map(s => s.repoName),
			repoLookups: requestedUrls.filter(u => /\/repositories\//.test(u)).length,
		}, {
			firstKind: 'complete',
			firstSessions: ['sess-1', 'sess-2'],
			firstNames: [undefined, undefined],
			secondNames: ['osortega/simple-server', 'osortega/simple-server'],
			// One per pass: the failure is evicted so the second pass retries, but neither pass
			// issues a second lookup for the task that shares the repository.
			repoLookups: 2,
		});
	});
});
