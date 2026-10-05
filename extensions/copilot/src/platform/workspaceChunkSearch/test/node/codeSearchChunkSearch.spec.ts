/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { Result } from '../../../../util/common/result';
import { mock } from '../../../../util/common/test/simpleMock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../util/common/test/testUtils';
import { DeferredPromise, timeout } from '../../../../util/vs/base/common/async';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { InstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../../util/vs/platform/instantiation/common/serviceCollection';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../authentication/common/authenticationUpgrade';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { AdoRepoId, GithubRepoId, IGitService } from '../../../git/common/gitService';
import { ILogService, LogServiceImpl } from '../../../log/common/logService';
import { IAdoCodeSearchService } from '../../../remoteCodeSearch/common/adoCodeSearchService';
import { IGithubCodeSearchService } from '../../../remoteCodeSearch/common/githubCodeSearchService';
import { RemoteCodeSearchIndexStatus } from '../../../remoteCodeSearch/common/remoteCodeSearch';
import { ICodeSearchAuthenticationService } from '../../../remoteCodeSearch/node/codeSearchRepoAuth';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { NullWorkspaceService } from '../../../workspace/common/workspaceService';
import { CodeSearchChunkSearch } from '../../node/codeSearch/codeSearchChunkSearch';
import { CodeSearchRepoStatus } from '../../node/codeSearch/codeSearchRepo';
import { TrackedRepoState, TrackedRepoStatus } from '../../node/codeSearch/repoTracker';
import { IWorkspaceFileIndex } from '../../node/workspaceFileIndex';

function session(id: string): AuthenticationSession {
	return {
		id,
		account: { id: 'account', label: 'octocat' },
		accessToken: 'fake-token',
		scopes: ['repo'],
		authorizationServer: URI.parse('https://first.ghe.com/login/oauth'),
	};
}

class TestAuthenticationService extends mock<IAuthenticationService>() {
	readonly changes = new Emitter<void>();
	override readonly onDidAuthenticationChange = this.changes.event;
	readonly adoChanges = new Emitter<void>();
	override readonly onDidAdoAuthenticationChange = this.adoChanges.event;
	override anyGitHubSession: AuthenticationSession | undefined = session('any');
	override permissiveGitHubSession: AuthenticationSession | undefined = session('permissive');
	override anyAdoSession: AuthenticationSession | undefined = session('ado-any');
	override readonly copilotToken = undefined;
}

class TestRepoTracker extends Disposable {
	readonly changes = this._register(new Emitter<TrackedRepoState>());
	readonly onDidAddOrUpdateRepo = this.changes.event;
	readonly onDidRemoveRepo = Event.None;
	private readonly repos: TrackedRepoState[] = [];
	async initialize(): Promise<void> { }
	getAllTrackedRepos(): readonly TrackedRepoState[] { return this.repos; }
	add(repo: TrackedRepoState): void {
		this.repos.push(repo);
		this.changes.fire(repo);
	}
}

describe('CodeSearchChunkSearch authentication identity', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function create() {
		const authentication = new TestAuthenticationService();
		disposables.add(authentication.changes);
		disposables.add(authentication.adoChanges);
		const tracker = disposables.add(new TestRepoTracker());
		const config = disposables.add(new InMemoryConfigurationService(disposables.add(new DefaultsOnlyConfigurationService())));
		await config.setConfig(ConfigKey.Advanced.WorkspaceEnableCodeSearch, true);
		const remote = new class extends mock<IGithubCodeSearchService>() {
			override getRemoteIndexState = vi.fn<IGithubCodeSearchService['getRemoteIndexState']>().mockResolvedValue(Result.ok({
				status: RemoteCodeSearchIndexStatus.Ready,
				indexedCommit: 'test-commit',
			}));
		}();
		const log = disposables.add(new LogServiceImpl([]));
		const telemetry = new NullTelemetryService();
		const instantiation = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IGithubCodeSearchService, remote],
			[ITelemetryService, telemetry],
		), true));
		vi.spyOn(instantiation, 'createInstance').mockReturnValueOnce(tracker);
		const root = URI.parse('file:///workspace');
		const search = disposables.add(new CodeSearchChunkSearch(
			EmbeddingType.text3small_512,
			instantiation,
			new class extends mock<IAdoCodeSearchService>() { override readonly onDidChangeIndexState = Event.None; }(),
			new class extends mock<IAuthenticationChatUpgradeService>() { }(),
			authentication,
			new class extends mock<ICodeSearchAuthenticationService>() { }(),
			config,
			instantiation,
			new NullExperimentationService(),
			new class extends mock<IGitService>() { }(),
			log,
			telemetry,
			new class extends mock<IWorkspaceFileIndex>() { }(),
			disposables.add(new NullWorkspaceService([root])),
		));
		tracker.add({
			status: TrackedRepoStatus.Resolved,
			repo: { rootUri: root },
			resolvedRemoteInfo: { repoId: new GithubRepoId('owner', 'repo'), fetchUrl: undefined },
		});
		await vi.waitFor(() => expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual([CodeSearchRepoStatus.Ready]));
		expect(remote.getRemoteIndexState).toHaveBeenCalledTimes(1);
		return { authentication, remote, search };
	}

	for (const kind of ['anyGitHubSession', 'permissiveGitHubSession'] as const) {
		test.each(['issuer', 'account', 'session', 'sign-out'] as const)(`${kind} %s changes invalidate repository authorization`, async change => {
			const { authentication, remote, search } = await create();
			const previous = authentication[kind]!;
			switch (change) {
				case 'issuer':
					authentication[kind] = { ...previous, authorizationServer: URI.parse('https://second.ghe.com/login/oauth') };
					break;
				case 'account':
					authentication[kind] = { ...previous, account: { ...previous.account, id: 'other-account' } };
					break;
				case 'session':
					authentication[kind] = { ...previous, id: 'other-session' };
					break;
				case 'sign-out':
					authentication[kind] = undefined;
					break;
			}
			remote.getRemoteIndexState.mockResolvedValue(Result.error({ type: 'not-authorized' }));
			authentication.changes.fire();
			await vi.waitFor(() => expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual([CodeSearchRepoStatus.NotAuthorized]));
			authentication.changes.fire();
			expect(remote.getRemoteIndexState).toHaveBeenCalledTimes(2);
		});
	}

	test('token refreshes and equivalent session objects do not recheck repository authorization', async () => {
		const { authentication, remote, search } = await create();
		for (const kind of ['anyGitHubSession', 'permissiveGitHubSession'] as const) {
			const previous = authentication[kind]!;
			authentication[kind] = { ...previous, accessToken: 'refreshed-token', account: { ...previous.account }, authorizationServer: URI.parse(previous.authorizationServer!.toString()) };
		}
		authentication.changes.fire();
		expect({
			requests: remote.getRemoteIndexState.mock.calls.length,
			statuses: search.getRemoteIndexState(false).repos.map(repo => repo.status),
		}).toEqual({ requests: 1, statuses: [CodeSearchRepoStatus.Ready] });
	});
});

describe('CodeSearchChunkSearch ado authentication identity', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	afterEach(() => {
		vi.restoreAllMocks();
	});

	type StatusResult = Awaited<ReturnType<IAdoCodeSearchService['getRemoteIndexState']>>;

	function ready(): StatusResult {
		return Result.ok({ status: RemoteCodeSearchIndexStatus.Ready, indexedCommit: 'test-commit' });
	}

	async function create(options: {
		readonly repoNames?: readonly string[];
		readonly getRemoteIndexState?: IAdoCodeSearchService['getRemoteIndexState'];
		readonly initialize?: boolean;
	} = {}) {
		const authentication = new TestAuthenticationService();
		disposables.add(authentication.changes);
		disposables.add(authentication.adoChanges);
		const tracker = disposables.add(new TestRepoTracker());
		const config = disposables.add(new InMemoryConfigurationService(disposables.add(new DefaultsOnlyConfigurationService())));
		await config.setConfig(ConfigKey.Advanced.WorkspaceEnableCodeSearch, true);
		const indexStateChanges = disposables.add(new Emitter<void>());
		const ado = new class extends mock<IAdoCodeSearchService>() {
			override readonly onDidChangeIndexState = indexStateChanges.event;
			override getRemoteIndexState = vi.fn<IAdoCodeSearchService['getRemoteIndexState']>()
				.mockImplementation(options.getRemoteIndexState ?? (async () => ready()));
		}();
		const log = disposables.add(new LogServiceImpl([]));
		const telemetry = new NullTelemetryService();
		const instantiation = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IAdoCodeSearchService, ado],
			[IAuthenticationService, authentication],
			[ITelemetryService, telemetry],
		), true));
		vi.spyOn(instantiation, 'createInstance').mockReturnValueOnce(tracker);
		const root = URI.parse('file:///workspace');
		const search = disposables.add(new CodeSearchChunkSearch(
			EmbeddingType.text3small_512,
			instantiation,
			ado,
			new class extends mock<IAuthenticationChatUpgradeService>() { }(),
			authentication,
			new class extends mock<ICodeSearchAuthenticationService>() { }(),
			config,
			instantiation,
			new NullExperimentationService(),
			new class extends mock<IGitService>() { }(),
			log,
			telemetry,
			new class extends mock<IWorkspaceFileIndex>() { }(),
			disposables.add(new NullWorkspaceService([root])),
		));
		const repoNames = options.repoNames ?? ['repo'];
		for (const name of repoNames) {
			tracker.add({
				status: TrackedRepoStatus.Resolved,
				repo: { rootUri: URI.joinPath(root, name) },
				resolvedRemoteInfo: { repoId: new AdoRepoId('org', 'project', name), fetchUrl: undefined },
			});
		}
		if (options.initialize !== false) {
			await vi.waitFor(() => expect(search.getRemoteIndexState(false).status).toBe('loaded'));
			if (!options.getRemoteIndexState) {
				expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual(repoNames.map(() => CodeSearchRepoStatus.Ready));
			}
		}
		await vi.waitFor(() => expect(ado.getRemoteIndexState).toHaveBeenCalledTimes(repoNames.length));
		const snapshot = () => ({
			requests: ado.getRemoteIndexState.mock.calls.length,
			statuses: search.getRemoteIndexState(false).repos.map(repo => repo.status),
		});
		return { authentication, ado, search, indexStateChanges, snapshot };
	}

	test.each(['issuer', 'account', 'session', 'sign-out'] as const)(`anyAdoSession %s changes invalidate repository authorization`, async change => {
		const { authentication, ado, search } = await create();
		const previous = authentication.anyAdoSession!;
		switch (change) {
			case 'issuer':
				authentication.anyAdoSession = { ...previous, authorizationServer: URI.parse('https://second.example.com/login/oauth') };
				break;
			case 'account':
				authentication.anyAdoSession = { ...previous, account: { ...previous.account, id: 'other-account' } };
				break;
			case 'session':
				authentication.anyAdoSession = { ...previous, id: 'other-session' };
				break;
			case 'sign-out':
				authentication.anyAdoSession = undefined;
				break;
		}
		ado.getRemoteIndexState.mockResolvedValue(Result.error({ type: 'not-authorized' }));
		authentication.adoChanges.fire();
		await vi.waitFor(() => expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual([CodeSearchRepoStatus.NotAuthorized]));
		// A second no-op event (nothing changed since the previous one) must not trigger another refetch.
		authentication.adoChanges.fire();
		expect(ado.getRemoteIndexState).toHaveBeenCalledTimes(2);
	});

	test('token refreshes and equivalent session objects do not recheck repository authorization', async () => {
		const { authentication, ado, search } = await create();
		const previous = authentication.anyAdoSession!;
		authentication.anyAdoSession = { ...previous, accessToken: 'refreshed-token', account: { ...previous.account }, authorizationServer: URI.parse(previous.authorizationServer!.toString()) };
		// Simulate repeated silent token refreshes (e.g. window focus changes) firing the no-op auth-change event.
		authentication.adoChanges.fire();
		authentication.adoChanges.fire();
		authentication.adoChanges.fire();
		expect({
			requests: ado.getRemoteIndexState.mock.calls.length,
			statuses: search.getRemoteIndexState(false).repos.map(repo => repo.status),
		}).toEqual({ requests: 1, statuses: [CodeSearchRepoStatus.Ready] });
	});

	test('a same-identity token renewal recovers an unauthorized ado repo', async () => {
		const { authentication, ado, search, snapshot } = await create();
		const previous = authentication.anyAdoSession!;

		// First, make the repo unauthorized via a real identity change (401 from a stale account).
		authentication.anyAdoSession = { ...previous, account: { ...previous.account, id: 'other-account' } };
		ado.getRemoteIndexState.mockResolvedValue(Result.error({ type: 'not-authorized' }));
		authentication.adoChanges.fire();
		await vi.waitFor(() => expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual([CodeSearchRepoStatus.NotAuthorized]));

		// A same-identity token swap (e.g. a fresh token for the same account after re-auth) must still retry.
		const unauthorizedSession = authentication.anyAdoSession;
		ado.getRemoteIndexState.mockResolvedValue(Result.ok({ status: RemoteCodeSearchIndexStatus.Ready, indexedCommit: 'test-commit' }));
		authentication.anyAdoSession = { ...unauthorizedSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 3, statuses: [CodeSearchRepoStatus.Ready] }));
		authentication.adoChanges.fire();
		await timeout(0);
		expect(snapshot()).toEqual({ requests: 3, statuses: [CodeSearchRepoStatus.Ready] });
	});

	test('credential changes retry only failed repositories in a mixed workspace', async () => {
		const { authentication, ado, snapshot } = await create({
			repoNames: ['healthy', 'unauthorized', 'failed'],
			getRemoteIndexState: async (_auth, repoId) => {
				switch (repoId.repo) {
					case 'unauthorized': return Result.error({ type: 'not-authorized' });
					case 'failed': return Result.error({ type: 'generic-error', error: new Error('HTTP 503') });
					default: return ready();
				}
			},
		});
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		authentication.adoChanges.fire();
		await timeout(0);
		expect({
			...snapshot(),
			repositories: ado.getRemoteIndexState.mock.calls.map(([, repoId]) => repoId.repo),
		}).toEqual({
			requests: 5,
			statuses: [CodeSearchRepoStatus.Ready, CodeSearchRepoStatus.NotAuthorized, CodeSearchRepoStatus.CouldNotCheckIndexStatus],
			repositories: ['healthy', 'unauthorized', 'failed', 'unauthorized', 'failed'],
		});
	});

	test('persistent authorization failures are retried once per changed credential', async () => {
		const { authentication, ado, snapshot } = await create({
			getRemoteIndexState: async () => Result.error({ type: 'not-authorized' }),
		});
		const counts: number[] = [];
		for (const accessToken of ['fake-token', 'renewed-token', 'renewed-token', 'newer-token']) {
			authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken };
			authentication.adoChanges.fire();
			authentication.adoChanges.fire();
			authentication.adoChanges.fire();
			await timeout(0);
			counts.push(ado.getRemoteIndexState.mock.calls.length);
		}
		expect({ counts, ...snapshot() }).toEqual({
			counts: [1, 2, 2, 3],
			requests: 3,
			statuses: [CodeSearchRepoStatus.NotAuthorized],
		});
	});

	test('duplicate credential notifications do not duplicate an outstanding recovery request', async () => {
		const { authentication, ado, snapshot } = await create({
			getRemoteIndexState: async () => Result.error({ type: 'not-authorized' }),
		});
		const recovery = new DeferredPromise<StatusResult>();
		ado.getRemoteIndexState.mockImplementation(() => recovery.p);
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		authentication.adoChanges.fire();
		authentication.adoChanges.fire();
		await recovery.complete(ready());
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 2, statuses: [CodeSearchRepoStatus.Ready] }));
	});

	for (const phase of ['initialization', 'index refresh'] as const) {
		test.each(['unauthorized', 'server-error', 'network-error'] as const)(`credential renewal during ${phase} recovers a late %s`, async failure => {
			const previous = new DeferredPromise<StatusResult>();
			const recovery = new DeferredPromise<StatusResult>();
			const { authentication, ado, indexStateChanges, snapshot } = await create(phase === 'initialization'
				? { getRemoteIndexState: () => previous.p, initialize: false }
				: {});
			if (phase === 'index refresh') {
				ado.getRemoteIndexState.mockImplementationOnce(() => previous.p);
				indexStateChanges.fire();
			}
			const requestsBeforeRenewal = ado.getRemoteIndexState.mock.calls.length;
			ado.getRemoteIndexState.mockImplementation(() => recovery.p);
			authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
			authentication.adoChanges.fire();
			authentication.adoChanges.fire();
			if (failure === 'network-error') {
				await previous.error(new Error('Network unavailable'));
			} else {
				await previous.complete(failure === 'unauthorized'
					? Result.error({ type: 'not-authorized' })
					: Result.error({ type: 'generic-error', error: new Error('HTTP 503') }));
			}
			try {
				await vi.waitFor(() => expect(ado.getRemoteIndexState).toHaveBeenCalledTimes(requestsBeforeRenewal + 1));
			} finally {
				await recovery.complete(ready());
			}
			await vi.waitFor(() => expect(snapshot()).toEqual({
				requests: requestsBeforeRenewal + 1,
				statuses: [CodeSearchRepoStatus.Ready],
			}));
		});

		test(`credential renewal during a successful ${phase} does not trigger another request`, async () => {
			const pending = new DeferredPromise<StatusResult>();
			const { authentication, ado, indexStateChanges, snapshot } = await create(phase === 'initialization'
				? { getRemoteIndexState: () => pending.p, initialize: false }
				: {});
			if (phase === 'index refresh') {
				ado.getRemoteIndexState.mockImplementationOnce(() => pending.p);
				indexStateChanges.fire();
			}
			const requests = ado.getRemoteIndexState.mock.calls.length;
			authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
			authentication.adoChanges.fire();
			await pending.complete(ready());
			await vi.waitFor(() => expect(snapshot()).toEqual({ requests, statuses: [CodeSearchRepoStatus.Ready] }));
		});
	}

	test('several credential renewals during initialization require only one recovery with the latest credentials', async () => {
		const pending = new DeferredPromise<StatusResult>();
		const { authentication, ado, snapshot } = await create({ getRemoteIndexState: () => pending.p, initialize: false });
		ado.getRemoteIndexState.mockResolvedValue(ready());
		for (const accessToken of ['renewed-token', 'newer-token', 'newest-token']) {
			authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken };
			authentication.adoChanges.fire();
		}
		await pending.complete(Result.error({ type: 'not-authorized' }));
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 2, statuses: [CodeSearchRepoStatus.Ready] }));
	});

	test.each(['server-error', 'network-error'] as const)('a new credential recovers an initial %s', async failure => {
		const { authentication, ado, snapshot } = await create({
			getRemoteIndexState: async () => {
				if (failure === 'network-error') {
					throw new Error('Network unavailable');
				}
				return Result.error({ type: 'generic-error', error: new Error('HTTP 503') });
			},
		});
		ado.getRemoteIndexState.mockResolvedValue(ready());
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 2, statuses: [CodeSearchRepoStatus.Ready] }));
	});

	test.each(['unauthorized', 'ready'] as const)('a superseded %s response cannot overwrite newer account authorization', async olderStatus => {
		const { authentication, ado, indexStateChanges, snapshot } = await create();
		const previous = new DeferredPromise<StatusResult>();
		ado.getRemoteIndexState.mockImplementationOnce(() => previous.p);
		indexStateChanges.fire();
		const expectedStatus = olderStatus === 'unauthorized' ? CodeSearchRepoStatus.Ready : CodeSearchRepoStatus.NotAuthorized;
		ado.getRemoteIndexState.mockResolvedValue(olderStatus === 'unauthorized' ? ready() : Result.error({ type: 'not-authorized' }));
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, account: { id: 'other-account', label: 'Other' } };
		authentication.adoChanges.fire();
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 3, statuses: [expectedStatus] }));
		await previous.complete(olderStatus === 'unauthorized' ? Result.error({ type: 'not-authorized' }) : ready());
		await timeout(0);
		expect(snapshot()).toEqual({ requests: 3, statuses: [expectedStatus] });
	});

	test('an index notification is not suppressed by an outstanding credential recovery', async () => {
		const { authentication, ado, indexStateChanges, snapshot } = await create({
			getRemoteIndexState: async () => Result.error({ type: 'not-authorized' }),
		});
		const recovery = new DeferredPromise<StatusResult>();
		ado.getRemoteIndexState.mockImplementationOnce(() => recovery.p).mockResolvedValue(ready());
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		indexStateChanges.fire();
		await vi.waitFor(() => expect(snapshot()).toEqual({ requests: 3, statuses: [CodeSearchRepoStatus.Ready] }));
		await recovery.complete(Result.error({ type: 'not-authorized' }));
		await timeout(0);
		expect(snapshot()).toEqual({ requests: 3, statuses: [CodeSearchRepoStatus.Ready] });
	});

	test('disposing a repository prevents late failures from starting credential recovery', async () => {
		const pending = new DeferredPromise<StatusResult>();
		const { authentication, ado, search } = await create({ getRemoteIndexState: () => pending.p, initialize: false });
		authentication.anyAdoSession = { ...authentication.anyAdoSession!, accessToken: 'renewed-token' };
		authentication.adoChanges.fire();
		search.dispose();
		await pending.complete(Result.error({ type: 'not-authorized' }));
		await timeout(0);
		expect(ado.getRemoteIndexState).toHaveBeenCalledTimes(1);
	});

	test('a real index state change always rechecks repository authorization, even without a session change', async () => {
		const { ado, search, indexStateChanges } = await create();
		indexStateChanges.fire();
		await vi.waitFor(() => expect(ado.getRemoteIndexState).toHaveBeenCalledTimes(2));
		expect(search.getRemoteIndexState(false).repos.map(repo => repo.status)).toEqual([CodeSearchRepoStatus.Ready]);
	});
});
