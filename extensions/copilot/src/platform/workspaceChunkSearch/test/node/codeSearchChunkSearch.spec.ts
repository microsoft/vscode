/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { Result } from '../../../../util/common/result';
import { mock } from '../../../../util/common/test/simpleMock';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable, DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { InstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../../util/vs/platform/instantiation/common/serviceCollection';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../authentication/common/authenticationUpgrade';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { GithubRepoId, IGitService } from '../../../git/common/gitService';
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
	override readonly onDidAdoAuthenticationChange = Event.None;
	override anyGitHubSession: AuthenticationSession | undefined = session('any');
	override permissiveGitHubSession: AuthenticationSession | undefined = session('permissive');
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
	const disposables = new DisposableStore();
	afterEach(() => {
		disposables.clear();
		vi.restoreAllMocks();
	});

	async function create() {
		const authentication = new TestAuthenticationService();
		disposables.add(authentication.changes);
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
