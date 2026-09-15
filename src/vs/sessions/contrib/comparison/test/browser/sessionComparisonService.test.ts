/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionType, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISessionsManagementService, NewSessionRequestOptions } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { COMPARISON_ENABLED_SETTING, IComparisonTarget } from '../../common/comparison.js';
import { SessionComparisonService, supportsComparison } from '../../browser/sessionComparisonService.js';

const folder = URI.file('/comparison-repo');
const targets: IComparisonTarget[] = ['one', 'two'].map(modelId => ({
	providerId: 'test', sessionTypeId: 'agent', providerLabel: 'Test agent', modelId, modelLabel: modelId,
}));

class TestSession extends mock<ISession>() {
	override readonly resource: URI;
	override readonly status = observableValue<SessionStatus>(this, SessionStatus.InProgress);
	constructor(id: number) {
		super();
		this.resource = URI.from({ scheme: 'test-session', path: `/${id}` });
	}
}

class TestProvider extends mock<ISessionsProvider>() {
	types: ISessionType[] = [{
		id: 'agent', label: 'Test agent', icon: Codicon.copilot,
		supportsWorktreeConfiguration: true, authRequirement: SessionTypeAuthRequirement.None,
	}];
	override getSessionTypes(): ISessionType[] { return this.types; }
	override async setWorktreeConfiguration(): Promise<void> { }
}

suite('SessionComparisonService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(storage = store.add(new InMemoryStorageService())) {
		const sessions: TestSession[] = [];
		const calls: { options: NewSessionRequestOptions; createOptions: ICreateNewSessionOptions | undefined; token: CancellationToken }[] = [];
		const cancelled: ISession[] = [];
		let send: ((index: number, token: CancellationToken) => Promise<void>) | undefined;
		const provider = new TestProvider();
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override async createAndSendNewChatRequest(_folder: URI, options: NewSessionRequestOptions, createOptions?: ICreateNewSessionOptions, token = CancellationToken.None) {
				const index = calls.length;
				calls.push({ options, createOptions, token });
				const session = new TestSession(index);
				createOptions?.onSessionCreated?.(session);
				await send?.(index, token);
				sessions.push(session);
				return session;
			}
			override async cancelCurrentRequest(session: ISession) { cancelled.push(session); }
		};
		const providers = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T | undefined { return provider as ISessionsProvider as T; }
		};
		const configuration = new TestConfigurationService({ [COMPARISON_ENABLED_SETTING]: true });
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
		};
		const service = store.add(new SessionComparisonService(management, providers, storage, new NullLogService(), configuration, entitlement));
		return { service, provider, sessions, calls, cancelled, configuration, entitlement, storage, setSend: (fn: typeof send) => { send = fn; } };
	}

	test('starts all attempts concurrently with identical prompt and independent worktree configuration', async () => {
		const { service, calls, setSend } = setup();
		const ready = new DeferredPromise<void>();
		setSend(async () => ready.p);
		const start = service.start(folder, 'main', 'Implement a parser', targets);
		assert.deepStrictEqual(calls.map(call => ({
			query: hasKey(call.options, { query: true }) ? call.options.query : undefined,
			background: hasKey(call.options, { query: true }) ? call.options.background : undefined,
			title: hasKey(call.options, { query: true }) ? call.options.title : undefined,
			model: call.createOptions?.modelId,
			isolation: call.createOptions?.isolationMode,
			branch: call.createOptions?.branch,
			newBranch: call.createOptions?.worktreeCreateNewBranch,
			track: call.createOptions?.worktreeBranchTrack,
		})), targets.map((target, index) => ({
			query: 'Implement a parser', background: true, model: target.modelId,
			title: `Attempt ${String.fromCharCode(65 + index)}: ${target.modelLabel}`,
			isolation: 'worktree', branch: 'main', newBranch: true, track: false,
		})));
		await ready.complete();
		await start;
		assert.deepStrictEqual(service.runs.get()[0].candidates.map(candidate => candidate.state), ['started', 'started']);
	});

	test('repeated samples of the same model have distinct attempt and session identities', async () => {
		const { service } = setup();
		await service.start(folder, 'main', 'Prompt', [targets[0], targets[0]]);
		const candidates = service.runs.get()[0].candidates;
		assert.deepStrictEqual({
			attempts: new Set(candidates.map(candidate => candidate.id)).size,
			sessions: new Set(candidates.map(candidate => candidate.sessionResource?.toString())).size,
			models: candidates.map(candidate => candidate.target.modelId),
		}, { attempts: 2, sessions: 2, models: ['one', 'one'] });
	});

	test('a failed attempt does not discard or prevent successful siblings', async () => {
		const { service, setSend } = setup();
		setSend(async index => { if (index === 0) { throw new Error('Provider offline'); } });
		await service.start(folder, 'main', 'Prompt', targets);
		assert.deepStrictEqual(service.runs.get()[0].candidates.map(candidate => ({
			state: candidate.state, error: candidate.error,
		})), [{ state: 'failed', error: 'Provider offline' }, { state: 'started', error: undefined }]);
	});

	test('rejects invalid inputs before creating any sessions', async () => {
		const { service, calls } = setup();
		await assert.rejects(service.start(folder, 'main', ' ', targets));
		await assert.rejects(service.start(folder, '', 'Prompt', targets));
		await assert.rejects(service.start(folder, 'main', 'Prompt', targets.slice(0, 1)));
		await assert.rejects(service.start(folder, 'main', 'Prompt', Array(5).fill(targets[0])));
		assert.deepStrictEqual(calls, []);
	});

	test('revalidates isolation capability at launch and never falls back to shared files', async () => {
		const { service, provider, calls } = setup();
		provider.types = [{ ...provider.types[0], supportsWorktreeConfiguration: false }];
		await assert.rejects(service.start(folder, 'main', 'Prompt', targets));
		assert.deepStrictEqual(calls, []);
	});

	test('does not accept an isolation flag without a configuration implementation', () => {
		const provider = new class extends mock<ISessionsProvider>() {
			override getSessionTypes() { return new TestProvider().types; }
		};
		assert.strictEqual(supportsComparison(provider, folder, 'agent'), false);
	});

	test('AI hiding and the feature gate prevent programmatic launches', async () => {
		const { service, configuration, entitlement, calls } = setup();
		entitlement.sentiment.hidden = true;
		await assert.rejects(service.start(folder, 'main', 'Prompt', targets));
		entitlement.sentiment.hidden = false;
		await configuration.setUserConfiguration(COMPARISON_ENABLED_SETTING, false);
		await assert.rejects(service.start(folder, 'main', 'Prompt', targets));
		assert.deepStrictEqual(calls, []);
	});

	test('stopping during launch cancels only that attempt', async () => {
		const { service, calls, setSend } = setup();
		const ready = new DeferredPromise<void>();
		setSend(async () => ready.p);
		const start = service.start(folder, 'main', 'Prompt', targets);
		const run = service.runs.get()[0];
		await service.stop(run.id, run.candidates[0].id);
		await ready.complete();
		await start;
		assert.deepStrictEqual({
			cancelled: calls.map(call => call.token.isCancellationRequested),
			states: service.runs.get()[0].candidates.map(candidate => candidate.state),
		}, { cancelled: [true, false], states: ['cancelled', 'started'] });
	});

	test('stopping a running attempt routes cancellation to its own session', async () => {
		const { service, sessions, cancelled } = setup();
		await service.start(folder, 'main', 'Prompt', targets);
		const run = service.runs.get()[0];
		await service.stop(run.id, run.candidates[1].id);
		assert.deepStrictEqual(cancelled, [sessions[1]]);
	});

	test('preference requires a finished attempt and survives reopening without rerunning', async () => {
		const { service, sessions, storage } = setup();
		await service.start(folder, 'main', 'Prompt', targets);
		const run = service.runs.get()[0];
		assert.throws(() => service.prefer(run.id, run.candidates[0].id));
		sessions[0].status.set(SessionStatus.Completed, undefined);
		service.prefer(run.id, run.candidates[0].id);
		const reopened = setup(storage);
		assert.deepStrictEqual({
			preferred: reopened.service.runs.get()[0].preferredCandidateId,
			folder: reopened.service.runs.get()[0].folderUri.toString(),
			calls: reopened.calls.length,
		}, { preferred: run.candidates[0].id, folder: folder.toString(), calls: 0 });
	});

	test('restored in-flight launches are interrupted, not retried or reported as finished', async () => {
		const { service, storage, setSend } = setup();
		const ready = new DeferredPromise<void>();
		setSend(async () => ready.p);
		const start = service.start(folder, 'main', 'Prompt', targets);
		const reopened = setup(storage);
		assert.deepStrictEqual({
			states: reopened.service.runs.get()[0].candidates.map(candidate => candidate.state),
			calls: reopened.calls.length,
		}, { states: ['interrupted', 'interrupted'], calls: 0 });
		await ready.complete();
		await start;
	});
});
