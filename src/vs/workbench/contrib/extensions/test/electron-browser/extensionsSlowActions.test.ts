/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IGitHubAnonymousClient } from '../../../../../platform/github/common/anonymous/anonymous.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { SearchIssuesOptions } from '../../../../../platform/github/common/core/search.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IExtensionHostProfile, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { createSlowExtensionAction } from '../../electron-browser/extensionsSlowActions.js';

suite('ExtensionsSlowActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extension: IExtensionDescription = {
		...nullExtensionDescription,
		bugs: { url: 'https://github.com/owner/repo/issues' },
	};
	const profile: IExtensionHostProfile = {
		startTime: 0, endTime: 1, deltas: [], ids: [],
		data: { nodes: [], startTime: 0, endTime: 1, samples: [], timeDeltas: [] },
		getAggregatedTimes: () => new Map(),
	};

	function createServices(search: IGitHubAnonymousClient['search']['issues']) {
		const instantiationService = store.add(new TestInstantiationService());
		const leases = { acquired: 0, released: 0 };
		const warnings: { message: string; error: Error }[] = [];
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IProductService, {});
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(INativeWorkbenchEnvironmentService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string, error: Error): void {
				warnings.push({ message, error });
			}
		}());
		instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAnonymousApiClient() {
				leases.acquired++;
				return upcastPartial<IGitHubAnonymousClient>({
					search: { issues: search },
					dispose: () => { leases.released++; },
				});
			}
		}());
		return { instantiationService, leases, warnings };
	}

	for (const { totalCount, actionId } of [{ totalCount: 0, actionId: 'report.slow' }, { totalCount: 23, actionId: 'show.slow' }]) {
		test(`selects ${actionId} from the anonymous search count`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const requests: { query: string; options: SearchIssuesOptions | undefined }[] = [];
			const deadline = Date.now() + 10_000;
			const { instantiationService, leases, warnings } = createServices(async (query, _signal, options) => {
				requests.push({ query, options });
				return { total_count: totalCount, incomplete_results: false, items: [] };
			});

			const action = await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
			if (action) {
				store.add(action);
			}
			assert.deepStrictEqual({ actionId: action?.id, requests, leases, warnings }, {
				actionId,
				requests: [{
					query: 'state:open in:title repo:owner/repo "Extension causes high cpu load"',
					options: { caller: 'showExtensionSlowAction', deadline, query: { per_page: 1 } },
				}],
				leases: { acquired: 1, released: 1 },
				warnings: [],
			});
		}));
	}

	test('uses the repository URL when no issue URL is supplied', async () => {
		const requests: string[] = [];
		const { instantiationService, leases } = createServices(async query => {
			requests.push(query);
			return { total_count: 0, incomplete_results: false, items: [] };
		});
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, {
			...nullExtensionDescription,
			repository: { type: 'git', url: 'https://github.com/owner/other' },
		}, profile);
		if (action) {
			store.add(action);
		}
		assert.deepStrictEqual({ actionId: action?.id, requests, leases }, {
			actionId: 'report.slow',
			requests: ['state:open in:title repo:owner/other "Extension causes high cpu load"'],
			leases: { acquired: 1, released: 1 },
		});
	});

	test('does not acquire a client for an unsupported issue tracker', async () => {
		const { instantiationService, leases, warnings } = createServices(async () => assert.fail('Unsupported repositories must not search'));
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, {
			...nullExtensionDescription,
			bugs: { url: 'https://example.com/owner/repo/issues' },
		}, profile);
		assert.deepStrictEqual({ action, leases, warnings }, {
			action: undefined, leases: { acquired: 0, released: 0 }, warnings: [],
		});
	});

	test('logs failed and malformed searches without offering an action or retrying', async () => {
		const errors = [new GitHubRequestError('Not Found', 'notFound', 404), new SchemaError('Malformed search response')];
		let requests = 0;
		const { instantiationService, leases, warnings } = createServices(async () => { throw errors[requests++]; });
		const actions = [];
		for (const error of errors) {
			actions.push(await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile));
			assert.strictEqual(warnings.at(-1)?.error, error);
		}
		assert.deepStrictEqual({ actions, requests, leases, messages: warnings.map(warning => warning.message) }, {
			actions: [undefined, undefined],
			requests: 2,
			leases: { acquired: 2, released: 2 },
			messages: errors.map(() => '[ExtensionsSlowActions] GitHub issue search failed'),
		});
	});

	test('logs acquisition failures without searching or using another client', async () => {
		const failure = new Error('Shared process unavailable');
		const { instantiationService, leases, warnings } = createServices(async () => assert.fail('Failed acquisitions must not search'));
		instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAnonymousApiClient(): Promise<IGitHubAnonymousClient> {
				throw failure;
			}
		}());
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
		assert.deepStrictEqual({ action, leases, warnings }, {
			action: undefined,
			leases: { acquired: 0, released: 0 },
			warnings: [{ message: '[ExtensionsSlowActions] GitHub issue search failed', error: failure }],
		});
	});

	test('cancels stalled client acquisition after ten seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const start = Date.now();
		const { instantiationService, leases, warnings } = createServices(async () => assert.fail('Cancelled acquisitions must not search'));
		instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAnonymousApiClient(signal: AbortSignal): Promise<IGitHubAnonymousClient> {
				await Event.toPromise(Event.fromDOMEventEmitter(signal, 'abort'));
				throw signal.reason;
			}
		}());
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
		assert.deepStrictEqual({ action, elapsed: Date.now() - start, leases, cancellations: warnings.map(warning => isCancellationError(warning.error)) }, {
			action: undefined, elapsed: 10_000, leases: { acquired: 0, released: 0 }, cancellations: [true],
		});
	}));

	test('uses one ten-second budget for acquisition and search and releases the client', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const start = Date.now();
		let acquisitionSignal: AbortSignal | undefined;
		let request: { sameSignal: boolean; deadline: number | undefined } | undefined;
		const { instantiationService, leases, warnings } = createServices(async (_query, signal, options) => {
			request = { sameSignal: signal === acquisitionSignal, deadline: options?.deadline };
			await Event.toPromise(Event.fromDOMEventEmitter(signal, 'abort'));
			throw signal.reason;
		});
		const service = instantiationService.get(IWorkbenchGitHubService);
		instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAnonymousApiClient(signal: AbortSignal) {
				acquisitionSignal = signal;
				await timeout(2_000);
				return service.acquireAnonymousApiClient(signal);
			}
		}());
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
		assert.deepStrictEqual({ action, elapsed: Date.now() - start, request, leases, cancellations: warnings.map(warning => isCancellationError(warning.error)) }, {
			action: undefined, elapsed: 10_000,
			request: { sameSignal: true, deadline: start + 10_000 },
			leases: { acquired: 1, released: 1 }, cancellations: [true],
		});
	}));

	test('cleans up the timeout after a successful lookup', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let signal: AbortSignal | undefined;
		const { instantiationService, leases, warnings } = createServices(async (_query, requestSignal) => {
			signal = requestSignal;
			return { total_count: 0, incomplete_results: false, items: [] };
		});
		const action = await instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
		if (action) {
			store.add(action);
		}
		await timeout(10_001);
		assert.deepStrictEqual({ actionId: action?.id, aborted: signal?.aborted, leases, warnings }, {
			actionId: 'report.slow', aborted: false, leases: { acquired: 1, released: 1 }, warnings: [],
		});
	}));
});
