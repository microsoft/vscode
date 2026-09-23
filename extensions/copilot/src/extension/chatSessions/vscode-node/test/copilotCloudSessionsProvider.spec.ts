/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import * as vscode from 'vscode';
import type { AgentTask, AgentTaskCreateRequest, AgentTaskGetResponse, AgentTaskListEventsResponse, AgentTaskListResponse, AgentTaskSessionEvent, AgentTaskState, AgentTaskSteerRequest, AgentTaskCreatePullRequestResponse } from '@vscode/copilot-api';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ICAPIClientService } from '../../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../../platform/endpoint/common/domainService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { GithubRepoId, IGitService } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem } from '../../../../platform/github/common/githubAPI';
import { IGithubRepositoryService, IOctoKitService } from '../../../../platform/github/common/githubService';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { mock } from '../../../../util/common/test/simpleMock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../util/common/test/testUtils';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseTurn2, ChatToolInvocationPart } from '../../../../vscodeTypes';
import { ITaskApiClient, ListTaskEventsOptions, ListTasksOptions } from '../../common/taskApiTypes';
import { ChatSessionContentBuilder, extractTaskErrorDetail, formatTaskStoppedMessage } from '../copilotCloudSessionContentBuilder';
import { CopilotCloudSessionsProvider, filterCloudSessions, formatNewSessionContextReference, getCloudSessionItemMetadata, getCloudSessionResources, normalizeInitialSessionOptions, parseGitHubContextUrl, resolveGitHubContextRepository, resolveOrPickGitHubContextRepository, taskStateToChatSessionStatus } from '../copilotCloudSessionsProvider';
import { TaskApiBackend, parseRepoFromTaskUrl, isCloudCodingAgentTask } from '../taskApiBackend';
import { CloudSessionData } from '../../vscode/cloudAgentBackend';
import { IChatDelegationSummaryService } from '../../copilotcli/common/delegationSummaryService';
import { IPullRequestFileChangesService } from '../pullRequestFileChangesService';
import { isActiveTaskState, isFailedTaskState } from '../../vscode/copilotCodingAgentUtils';
import { NullCloudBackendInstrumentation } from '../cloudBackendTelemetry';
import { MockOctoKitService } from '../../../agents/vscode-node/test/mockOctoKitService';

vi.mock('vscode', async () => {
	const actual = await import('../../../../vscodeTypes');
	return {
		...actual,
		workspace: {
			workspaceFolders: [],
			get isAgentSessionsWorkspace() { return false; },
		},
		chat: {
			createChatParticipant: () => ({ dispose() { } }),
		},
		commands: {
			registerCommand: vi.fn(() => ({ dispose() { } })),
			executeCommand: vi.fn(async () => undefined),
		},
	};
});

class RecordingLogService extends TestLogService {
	override readonly trace = vi.fn();
	override readonly warn = vi.fn();
	override readonly error = vi.fn();
}

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override activeRepository = { get: () => undefined } as IGitService['activeRepository'];
	override initialize = vi.fn(async () => { });
	override repositories = [];
}

describe('copilotCloudSessionsProvider helpers', () => {
	it('formats every redesigned new-session context pill for the cloud request', () => {
		const references = [
			{ id: 'github-context:https://github.com/microsoft/vscode/issues/332805', name: 'Issue', value: 'GitHub context' },
			{ id: 'github-context:https://github.com/microsoft/vscode/pull/332825', name: 'Pull request', value: 'GitHub context' },
			{ id: 'sessions-additional-repository:https://github.com/microsoft/typescript', name: 'Repository', value: 'GitHub context' },
			{ id: 'sessions-additional-folder:file:///workspace/docs', name: 'Folder', value: vscode.Uri.file('/workspace/docs') },
			{ id: 'unrelated', name: 'Unrelated', value: 'Other context' },
		] satisfies vscode.ChatPromptReference[];

		expect(references.map(formatNewSessionContextReference)).toEqual([
			'GitHub resource: https://github.com/microsoft/vscode/issues/332805',
			'GitHub resource: https://github.com/microsoft/vscode/pull/332825',
			'GitHub repository: https://github.com/microsoft/typescript',
			`Folder: ${vscode.Uri.file('/workspace/docs').fsPath}`,
			undefined,
		]);
	});

	it('parses pasted GitHub issue and pull request URLs for the matching picker', () => {
		expect({
			issue: parseGitHubContextUrl(' https://github.com/microsoft/vscode/ISSUES/333149#issuecomment-1 ', 'issue'),
			pullRequest: parseGitHubContextUrl('https://www.github.com/microsoft/vscode/pull/333149/', 'pullRequest'),
			wrongPicker: parseGitHubContextUrl('https://github.com/microsoft/vscode/pull/333149', 'issue'),
			unrelated: parseGitHubContextUrl('https://example.com/microsoft/vscode/issues/333149', 'issue'),
		}).toEqual({
			issue: {
				repoId: 'microsoft/vscode',
				url: 'https://github.com/microsoft/vscode/issues/333149',
				label: 'microsoft/vscode#333149',
			},
			pullRequest: {
				repoId: 'microsoft/vscode',
				url: 'https://github.com/microsoft/vscode/pull/333149',
				label: 'microsoft/vscode#333149',
			},
			wrongPicker: undefined,
			unrelated: undefined,
		});
	});

	it('resolves a GitHub context repository from the selected workspace folder', async () => {
		const gitService = new TestGitService();
		gitService.getRepositoryFetchUrls = vi.fn(async () => ({
			rootUri: vscode.Uri.file('/workspace/docs'),
			remoteFetchUrls: ['https://github.com/microsoft/vscode-docs.git'],
		}));

		expect({
			folder: await resolveGitHubContextRepository(gitService, vscode.Uri.file('/workspace/docs')),
			repository: await resolveGitHubContextRepository(gitService, 'microsoft/vscode'),
		}).toEqual({
			folder: 'microsoft/vscode-docs',
			repository: 'microsoft/vscode',
		});
	});

	it('offers repository selection only when a selected folder cannot be resolved', async () => {
		const gitService = new TestGitService();
		gitService.getRepositoryFetchUrls = vi.fn(async () => undefined);
		const pickRepository = vi.fn(async () => 'microsoft/vscode');

		expect({
			selectedFolder: await resolveOrPickGitHubContextRepository(gitService, vscode.Uri.file('/workspace/vscode'), pickRepository),
			noFolder: await resolveOrPickGitHubContextRepository(gitService, undefined, pickRepository),
		}).toEqual({
			selectedFolder: 'microsoft/vscode',
			noFolder: undefined,
		});
		expect(pickRepository).toHaveBeenCalledTimes(1);
	});

	it('coerces object-shaped initialSessionOptions into option entries', () => {
		const logService = new RecordingLogService();
		const sessionResource = vscode.Uri.parse('copilot-cloud-agent:/1');

		const result = normalizeInitialSessionOptions({
			models: { id: 'gpt-4.1', name: 'GPT-4.1' },
			repositories: 'microsoft/vscode',
		}, logService, sessionResource);

		expect(result).toEqual([
			{ optionId: 'models', value: { id: 'gpt-4.1', name: 'GPT-4.1' } },
			{ optionId: 'repositories', value: 'microsoft/vscode' },
		]);
		expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining('Coerced object-shaped initialSessionOptions'));
	});

	it('ignores unsupported initialSessionOptions payloads and logs a warning', () => {
		const logService = new RecordingLogService();

		const result = normalizeInitialSessionOptions({
			models: { foo: 'bar' },
		}, logService);

		expect(result).toEqual([]);
		expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unsupported initialSessionOptions'));
	});

	it('includes the task branch in PR-less cloud session metadata', () => {
		expect(getCloudSessionItemMetadata(
			{ owner: 'microsoft', name: 'vscode', host: 'github.com' },
			{ owner: 'microsoft', repo: 'vscode', baseRef: 'main', headRef: 'copilot/task-branch' },
		)).toEqual({
			owner: 'microsoft',
			name: 'vscode',
			host: 'github.com',
			branch: 'copilot/task-branch',
		});
	});

	it('reports only verified PR-closing issues in cloud session metadata', () => {
		const linkedIssues = [{
			url: 'https://github.com/microsoft/vscode/issues/335868',
			title: 'Info spotlight not screen reader accessible',
		}];
		const pullRequest: PullRequestSearchItem = {
			id: 'PR_example',
			number: 336399,
			title: 'Make spotlight info cards accessible',
			state: 'OPEN',
			url: 'https://github.com/microsoft/vscode/pull/336399',
			createdAt: '2026-09-01T00:00:00Z',
			updatedAt: '2026-09-02T00:00:00Z',
			author: null,
			repository: { owner: { login: 'microsoft' }, name: 'vscode' },
			additions: 1,
			deletions: 0,
			files: { totalCount: 1 },
			fullDatabaseId: 123,
			headRefOid: 'head',
			headRefName: 'copilot/fix-spotlight',
			baseRefName: 'main',
			body: 'Fixes #335868. Also mentions #123.',
			closingIssuesReferences: { nodes: linkedIssues },
		};

		expect({
			linked: getCloudSessionItemMetadata(undefined, undefined, pullRequest),
			unlinked: getCloudSessionItemMetadata(undefined, undefined, { ...pullRequest, closingIssuesReferences: { nodes: [] } })?.linkedIssues,
			unavailable: getCloudSessionItemMetadata(undefined, undefined, { ...pullRequest, closingIssuesReferences: undefined })?.linkedIssues,
		}).toEqual({
			linked: {
				owner: 'microsoft',
				name: 'vscode',
				branch: 'copilot/fix-spotlight',
				baseBranch: 'main',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/336399',
				pullRequestState: 'open',
				linkedIssues,
			},
			unlinked: undefined,
			unavailable: undefined,
		});
	});

	it('keeps the task resource stable and reports the pull request URI for state migration', () => {
		// A task keeps its `/task/<id>` identity for its whole life. Once it has a pull request
		// it also reports the `/<prNumber>` URI it used to be listed under, so archive/pin/read
		// state recorded against that URI migrates forward instead of being orphaned.
		expect({
			prLess: getCloudSessionResources('abc-123', undefined),
			prBacked: getCloudSessionResources('abc-123', 325),
		}).toEqual({
			prLess: {
				resource: vscode.Uri.parse('copilot-cloud-agent:/task/abc-123'),
			},
			prBacked: {
				resource: vscode.Uri.parse('copilot-cloud-agent:/task/abc-123'),
				legacyResource: vscode.Uri.parse('copilot-cloud-agent:/325'),
			},
		});
	});
});

describe('cloud session visibility', () => {
	const now = Date.parse('2026-09-16T12:00:00Z');
	const day = 24 * 60 * 60 * 1000;
	const logService = new TestLogService();
	const session = (taskId: string, lastActivity: number): CloudSessionData => ({
		taskId,
		title: taskId,
		state: 'idle',
		createdAt: new Date(now - 120 * day).toISOString(),
		updatedAt: new Date(lastActivity).toISOString(),
	});

	it('defaults to sessions active in the last 30 days', () => {
		const sessions = [session('recent', now - day), session('old', now - 31 * day)];
		expect({
			defaultValue: ConfigKey.CloudSessionVisibility.defaultValue,
			visible: filterCloudSessions(sessions, ConfigKey.CloudSessionVisibility.defaultValue, logService, now).sessions.map(s => s.taskId),
		}).toEqual({ defaultValue: '30days', visible: ['recent'] });
	});

	it.each([
		['24hours', 1],
		['7days', 7],
		['30days', 30],
		['90days', 90],
	] satisfies [ConfigKey.CloudSessionVisibilityValue, number][])('uses an inclusive most-recent-activity cutoff for %s', (visibility, days) => {
		const cutoff = now - days * day;
		const sessions = [session('older', cutoff - 1), session('boundary', cutoff), session('newer', cutoff + 1)];
		const result = filterCloudSessions(sessions, visibility, logService, now);
		expect({
			visible: result.sessions.map(s => s.taskId),
			expiresAt: result.expiresAt,
		}).toEqual({ visible: ['boundary', 'newer'], expiresAt: now });
	});

	it('disables the age limit with all', () => {
		const sessions = [session('recent', now), session('old', now - 365 * day)];
		expect(filterCloudSessions(sessions, 'all', logService, now)).toEqual({ sessions, expiresAt: Infinity });
	});

	describe('CopilotCloudSessionsProvider discovery', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		const now = Date.parse('2026-09-16T12:00:00Z');
		const day = 24 * 60 * 60 * 1000;
		let store: DisposableStore;
		let configurationService: InMemoryConfigurationService;
		let fetchSessionList: MockInstance<TaskApiBackend['fetchSessionList']>;
		let getComparisonChangedFiles: ReturnType<typeof vi.fn<IPullRequestFileChangesService['getComparisonChangedFiles']>>;

		const session = (taskId: string, lastActivity = now): CloudSessionData => ({
			taskId,
			title: taskId,
			state: 'idle',
			createdAt: new Date(now - 120 * day).toISOString(),
			updatedAt: new Date(lastActivity).toISOString(),
			repo: { owner: 'microsoft', name: 'vscode' },
			diffRefs: { owner: 'microsoft', repo: 'vscode', baseRef: 'main', headRef: taskId },
		});

		beforeEach(() => {
			vi.mocked(vscode.commands.registerCommand).mockClear();
			vi.mocked(vscode.commands.executeCommand).mockReset();
			vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
			vi.setSystemTime(now);
			store = new DisposableStore();
			configurationService = store.add(new InMemoryConfigurationService(store.add(new DefaultsOnlyConfigurationService())));
			fetchSessionList = vi.spyOn(TaskApiBackend.prototype, 'fetchSessionList').mockResolvedValue([]);
			getComparisonChangedFiles = vi.fn(async () => []);
		});

		afterEach(async () => {
			await new Promise<void>(resolve => setImmediate(resolve));
			store.dispose();
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		function createProvider(octoKitService: IOctoKitService = new MockOctoKitService(), extensionContext: IVSCodeExtensionContext = new class extends mock<IVSCodeExtensionContext>() { }()): CopilotCloudSessionsProvider {
			return store.add(new CopilotCloudSessionsProvider(
				octoKitService,
				new TestGitService(),
				new NullTelemetryService(),
				new TestLogService(),
				new class extends mock<IGitExtensionService>() { }(),
				new class extends mock<IPullRequestFileChangesService>() {
					override getComparisonChangedFiles = getComparisonChangedFiles;
				}(),
				new class extends mock<IAuthenticationService>() {
					override readonly onDidAuthenticationChange = Event.None;
				}(),
				extensionContext,
				new class extends mock<IInstantiationService>() { }(),
				new class extends mock<IGithubRepositoryService>() { }(),
				new class extends mock<IChatDelegationSummaryService>() { }(),
				new class extends mock<IExperimentationService>() { }(),
				new class extends mock<IDomainService>() {
					override readonly onDidChangeDomains = Event.None;
				}(),
				new class extends mock<IOTelService>() { }(),
				new class extends mock<IFileSystemService>() { }(),
				new class extends mock<ICAPIClientService>() { }(),
				configurationService,
			));
		}

		it('uses the shared workbench repository picker and preserves repository, clone, and cancellation results', async () => {
			createProvider();
			const registration = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === 'github.copilot.chat.cloudSessions.openRepository');
			expect(registration).toBeDefined();
			const openRepository = registration![1];
			vi.mocked(vscode.commands.executeCommand)
				.mockResolvedValueOnce({ repository: 'microsoft/vscode' })
				.mockResolvedValueOnce({ cloneUrl: 'https://gitlab.com/example/project.git' })
				.mockResolvedValueOnce(undefined);

			const results = [
				await openRepository(undefined, { allowRepositoryUrl: false }),
				await openRepository(undefined, { allowRepositoryUrl: true }),
				await openRepository(),
			];

			expect({
				results,
				commands: vi.mocked(vscode.commands.executeCommand).mock.calls,
			}).toEqual({
				results: ['microsoft/vscode', 'https://gitlab.com/example/project.git', undefined],
				commands: [
					['_chat.pickRepository', '_github.copilot.chat.cloudSessions.searchRepositories', { allowRepositoryUrl: false }],
					['_chat.pickRepository', '_github.copilot.chat.cloudSessions.searchRepositories', { allowRepositoryUrl: true }],
					['_chat.pickRepository', '_github.copilot.chat.cloudSessions.searchRepositories', undefined],
				],
			});
		});

		it('supplies the existing repository search to the shared picker', async () => {
			const octoKitService: IOctoKitService = new MockOctoKitService();
			const search = vi.spyOn(octoKitService, 'getUserRepositories').mockResolvedValue([{ owner: 'microsoft', name: 'vscode' }]);
			createProvider(octoKitService);
			const registration = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === '_github.copilot.chat.cloudSessions.searchRepositories');
			expect(registration).toBeDefined();
			const repositories = await registration![1]('vscode');

			expect({ repositories, searches: search.mock.calls }).toEqual({
				repositories: ['microsoft/vscode'],
				searches: [[{}, 'vscode']],
			});
		});

		it('keeps session-option updates in the extension and does not apply clone URLs or cancelled picks', async () => {
			const extensionContext = new class extends mock<IVSCodeExtensionContext>() {
				override readonly globalState = {
					...new MockExtensionContext().globalState,
					setKeysForSync: () => { },
				};
			}();
			const updates = vi.spyOn(extensionContext.globalState, 'update');
			const provider = createProvider(new MockOctoKitService(), extensionContext);
			const changes: vscode.ChatSessionOptionChangeEvent[] = [];
			store.add(provider.onDidChangeChatSessionOptions(event => changes.push(event)));
			const registration = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === 'github.copilot.chat.cloudSessions.openRepository');
			expect(registration).toBeDefined();
			const resource = vscode.Uri.parse('copilot-cloud-agent:/untitled-repository-test');
			vi.mocked(vscode.commands.executeCommand)
				.mockResolvedValueOnce({ repository: 'microsoft/vscode' })
				.mockResolvedValueOnce({ cloneUrl: 'https://gitlab.com/example/project.git' })
				.mockResolvedValueOnce(undefined);

			await registration![1](resource);
			await registration![1](resource, { allowRepositoryUrl: true });
			await registration![1](resource);

			expect({
				changes,
				storedValues: updates.mock.calls.map(([, value]) => value),
			}).toEqual({
				changes: [{
					resource,
					updates: [{
						optionId: 'repositories',
						value: { id: 'microsoft/vscode', name: 'microsoft/vscode', icon: new vscode.ThemeIcon('repo') },
					}],
				}],
				storedValues: [[{ name: 'microsoft/vscode', timestamp: now }]],
			});
		});

		it('filters before fetching changes and refreshes when visibility changes', async () => {
			fetchSessionList.mockResolvedValue([session('recent', now - 2 * day), session('old', now - 31 * day)]);
			const provider = createProvider();
			const changes = vi.fn();
			store.add(provider.onDidChangeChatSessionItems(changes));

			const defaultItems = await provider.provideChatSessionItems(CancellationToken.None);
			const defaultChangeRequests = getComparisonChangedFiles.mock.calls.length;
			await configurationService.setConfig(ConfigKey.CloudSessionVisibility, '24hours');
			const lastDayItems = await provider.provideChatSessionItems(CancellationToken.None);
			const fetchesWithLastDayFilter = fetchSessionList.mock.calls.length;
			await configurationService.setConfig(ConfigKey.CloudSessionVisibility, 'all');
			const allItems = await provider.provideChatSessionItems(CancellationToken.None);

			expect({
				defaultItems: defaultItems.map(item => item.label),
				defaultChangeRequests,
				lastDayItems,
				fetchesWithLastDayFilter,
				allItems: allItems.map(item => item.label),
				changeEvents: changes.mock.calls.length,
			}).toEqual({
				defaultItems: ['recent'],
				defaultChangeRequests: 1,
				lastDayItems: [],
				fetchesWithLastDayFilter: 2,
				allItems: ['recent', 'old'],
				changeEvents: 2,
			});
		});

		it('expires cached sessions at the activity cutoff even if the backend count is unchanged', async () => {
			fetchSessionList.mockResolvedValue([session('expiring', now - 30 * day + 1)]);
			const provider = createProvider();
			const before = await provider.provideChatSessionItems(CancellationToken.None);
			vi.setSystemTime(now + 2);
			const after = await provider.provideChatSessionItems(CancellationToken.None);

			expect({ before: before.map(item => item.label), after, fetches: fetchSessionList.mock.calls.length })
				.toEqual({ before: ['expiring'], after: [], fetches: 2 });
		});

		it.each([false, true])('refreshes at the cutoff without another catalog request (Agents Window: %s)', async isAgentSessionsWorkspace => {
			vi.spyOn(vscode.workspace, 'isAgentSessionsWorkspace', 'get').mockReturnValue(isAgentSessionsWorkspace);
			fetchSessionList.mockResolvedValue([session('expiring', now - 30 * day + 1000)]);
			const provider = createProvider();
			const changes = vi.fn();
			store.add(provider.onDidChangeChatSessionItems(changes));
			await provider.provideChatSessionItems(CancellationToken.None);

			await vi.advanceTimersByTimeAsync(1000);
			const eventsAtCutoff = changes.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1);
			const afterExpiry = { events: changes.mock.calls.length, fetches: fetchSessionList.mock.calls.length };
			const items = await provider.provideChatSessionItems(CancellationToken.None);

			expect({ eventsAtCutoff, afterExpiry, items, timers: vi.getTimerCount() }).toEqual({
				eventsAtCutoff: 0,
				afterExpiry: { events: 1, fetches: 1 },
				items: [],
				timers: 0,
			});
		});

		it.each([
			['30days', 30],
			['90days', 90],
		] satisfies [ConfigKey.CloudSessionVisibilityValue, number][])('handles %s expiry beyond the native timeout limit', async (visibility, days) => {
			await configurationService.setConfig(ConfigKey.CloudSessionVisibility, visibility);
			fetchSessionList.mockResolvedValue([session('recent')]);
			const provider = createProvider();
			const changes = vi.fn();
			store.add(provider.onDidChangeChatSessionItems(changes));
			await provider.provideChatSessionItems(CancellationToken.None);

			const maxTimeoutDelay = 2 ** 31 - 1;
			await vi.advanceTimersByTimeAsync(maxTimeoutDelay);
			const afterFirstChunk = { events: changes.mock.calls.length, timers: vi.getTimerCount() };
			await vi.advanceTimersByTimeAsync(days * day - maxTimeoutDelay);
			const eventsAtCutoff = changes.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1);

			expect({ afterFirstChunk, eventsAtCutoff, eventsAfterExpiry: changes.mock.calls.length, timers: vi.getTimerCount() }).toEqual({
				afterFirstChunk: { events: 0, timers: 1 },
				eventsAtCutoff: 0,
				eventsAfterExpiry: 1,
				timers: 0,
			});
		});

		it('cancels and reschedules expiry when the cache is refreshed', async () => {
			fetchSessionList.mockResolvedValue([session('original', now - 30 * day + 1000)]);
			const provider = createProvider();
			const changes = vi.fn();
			store.add(provider.onDidChangeChatSessionItems(changes));
			await provider.provideChatSessionItems(CancellationToken.None);

			provider.refresh();
			const timersAfterRefresh = vi.getTimerCount();
			fetchSessionList.mockResolvedValue([session('replacement', now - 30 * day + 2000)]);
			await provider.provideChatSessionItems(CancellationToken.None);
			changes.mockClear();
			await vi.advanceTimersByTimeAsync(1001);
			const eventsAtOldExpiry = changes.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1000);

			expect({ timersAfterRefresh, eventsAtOldExpiry, eventsAtNewExpiry: changes.mock.calls.length }).toEqual({
				timersAfterRefresh: 0,
				eventsAtOldExpiry: 0,
				eventsAtNewExpiry: 1,
			});
		});

		it('cancels expiry when the age limit is disabled', async () => {
			fetchSessionList.mockResolvedValue([session('expiring', now - 30 * day + 1000)]);
			const provider = createProvider();
			const changes = vi.fn();
			store.add(provider.onDidChangeChatSessionItems(changes));
			await provider.provideChatSessionItems(CancellationToken.None);
			const timersBeforeChange = vi.getTimerCount();

			await configurationService.setConfig(ConfigKey.CloudSessionVisibility, 'all');
			const timersAfterChange = vi.getTimerCount();
			await provider.provideChatSessionItems(CancellationToken.None);
			changes.mockClear();
			await vi.advanceTimersByTimeAsync(90 * day);

			expect({ timersBeforeChange, timersAfterChange, timers: vi.getTimerCount(), events: changes.mock.calls.length }).toEqual({
				timersBeforeChange: 1,
				timersAfterChange: 0,
				timers: 0,
				events: 0,
			});
		});

		it('disposes the pending cache expiry timer', async () => {
			fetchSessionList.mockResolvedValue([session('recent')]);
			const provider = createProvider();
			await provider.provideChatSessionItems(CancellationToken.None);
			const timersBeforeDisposal = vi.getTimerCount();
			provider.dispose();

			expect({ timersBeforeDisposal, timersAfterDisposal: vi.getTimerCount() }).toEqual({
				timersBeforeDisposal: 1,
				timersAfterDisposal: 0,
			});
		});

		it('does not schedule an expiry when an in-flight fetch completes after disposal', async () => {
			const started = new DeferredPromise<void>();
			const pending = new DeferredPromise<CloudSessionData[]>();
			fetchSessionList.mockImplementationOnce(() => {
				started.complete();
				return pending.p;
			});
			const provider = createProvider();
			const items = provider.provideChatSessionItems(CancellationToken.None);
			await started.p;
			provider.dispose();
			pending.complete([session('recent')]);
			await items;

			expect(vi.getTimerCount()).toBe(0);
		});

		it('does not let an obsolete fetch replace newer results after a setting change', async () => {
			const started = new DeferredPromise<void>();
			const pending = new DeferredPromise<CloudSessionData[]>();
			fetchSessionList.mockImplementationOnce(() => {
				started.complete();
				return pending.p;
			});
			const provider = createProvider();
			const obsolete = provider.provideChatSessionItems(CancellationToken.None);
			await started.p;
			await configurationService.setConfig(ConfigKey.CloudSessionVisibility, 'all');
			fetchSessionList.mockResolvedValue([session('fresh')]);
			const current = await provider.provideChatSessionItems(CancellationToken.None);
			pending.complete([session('stale')]);
			const previous = await obsolete;
			const cached = await provider.provideChatSessionItems(CancellationToken.None);

			expect({
				current: current.map(item => item.label),
				previous: previous.map(item => item.label),
				cached: cached.map(item => item.label),
				fetches: fetchSessionList.mock.calls.length,
			}).toEqual({ current: ['fresh'], previous: ['fresh'], cached: ['fresh'], fetches: 2 });
		});
	});

	it('falls back to completion and creation times when the update time is absent', () => {
		const sessions: CloudSessionData[] = [
			{ ...session('completed-recently', now), updatedAt: undefined, completedAt: new Date(now - day).toISOString() },
			{ ...session('created-recently', now), updatedAt: undefined, createdAt: new Date(now - day).toISOString() },
			{ ...session('created-long-ago', now), updatedAt: undefined },
		];
		expect(filterCloudSessions(sessions, '30days', logService, now).sessions.map(s => s.taskId))
			.toEqual(['completed-recently', 'created-recently']);
	});

	it('expires the cache when the oldest visible session ages out', () => {
		const sessions = [session('recent', now), session('expiring', now - 30 * day + 1), session('old', now - 31 * day)];
		const result = filterCloudSessions(sessions, '30days', logService, now);
		expect({
			expiresAt: result.expiresAt,
			visibleAfterExpiry: filterCloudSessions(result.sessions, '30days', logService, result.expiresAt + 1).sessions.map(s => s.taskId),
		}).toEqual({ expiresAt: now + 1, visibleAfterExpiry: ['recent'] });
	});

	it('keeps sessions with unparseable activity visible and logs the missing age information', () => {
		const log = new RecordingLogService();
		const sessions = [{ ...session('invalid-date', now), updatedAt: 'not a timestamp' }];
		expect(filterCloudSessions(sessions, '30days', log, now)).toEqual({ sessions, expiresAt: Infinity });
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot determine the last activity'));
	});

	it('validates the supported setting values', () => {
		expect({
			schema: ConfigKey.CloudSessionVisibility.validator?.toSchema(),
			rejectsNone: ConfigKey.CloudSessionVisibility.validator?.validate('none').error !== undefined,
			rejectsInvalidValue: ConfigKey.CloudSessionVisibility.validator?.validate('invalid').error !== undefined,
		}).toEqual({
			schema: { enum: ['24hours', '7days', '30days', '90days', 'all'] },
			rejectsNone: true,
			rejectsInvalidValue: true,
		});
	});
});

// --- Task API history rendering ------------------------------------------------------------

interface MakeEventOpts {
	readonly id?: string;
	readonly dismissed?: boolean;
	readonly parentId?: string | null;
}

function evt(type: string, data: Record<string, unknown>, opts: MakeEventOpts = {}): AgentTaskSessionEvent {
	return {
		id: opts.id ?? `${type}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: '2026-03-27T00:00:00Z',
		parentId: opts.parentId ?? null,
		dismissed: opts.dismissed,
		type,
		data,
	} as unknown as AgentTaskSessionEvent;
}

function userMessage(content: string): AgentTaskSessionEvent {
	// Real user input: agent host rewrites content into transformedContent (longer), so
	// they differ. The builder uses this divergence to identify user-authored messages.
	return evt('user.message', { content, transformedContent: `${content}\n\n<context>...</context>` });
}

function makeTask(sessions: Array<{ state: string; prompt?: string }> = [], taskState: string = 'completed'): AgentTaskGetResponse {
	return {
		id: 'task-1',
		state: taskState,
		created_at: '2026-03-27T00:00:00Z',
		sessions: sessions.map((s, i) => ({
			id: `s-${i}`,
			state: s.state,
			created_at: '2026-03-27T00:00:00Z',
			prompt: s.prompt,
		})),
	} as unknown as AgentTaskGetResponse;
}

/** Summarise a chat history into a comparable shape: turn kind + content snippets. */
function summarise(history: ReadonlyArray<vscode.ChatRequestTurn | ChatResponseTurn2>): unknown {
	return history.map(turn => {
		if (turn instanceof ChatRequestTurn2) {
			return { kind: 'request', prompt: turn.prompt };
		}
		if (turn instanceof ChatResponseTurn2) {
			return {
				kind: 'response',
				parts: turn.response.map(p => {
					if (p instanceof ChatResponseMarkdownPart) {
						return { type: 'markdown', value: p.value.value };
					}
					if (p instanceof ChatToolInvocationPart) {
						return { type: 'tool', toolName: p.toolName, toolCallId: p.toolCallId };
					}
					return { type: p.constructor.name };
				}),
			};
		}
		return { kind: 'other' };
	});
}

describe('ChatSessionContentBuilder Task API history', () => {
	const newBuilder = () =>
		new ChatSessionContentBuilder('copilot-cloud-agent', new TestGitService(), new TestLogService());

	it('suppresses bootstrap events before the first user-authored message and splits turns at user-authored boundaries', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			evt('assistant.message', { messageId: 'boot-1', content: 'Cloning repo…' }), // bootstrap — suppressed
			evt('tool.execution_start', { toolCallId: 'tc-boot', name: 'clone_repo' }), // bootstrap — suppressed
			userMessage('First user prompt'),
			evt('assistant.message', { messageId: 'turn-1', content: 'First reply' }),
			userMessage('Follow-up prompt'),
			evt('assistant.message', { messageId: 'turn-2', content: 'Second reply' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'First user prompt' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'First reply' }] },
			{ kind: 'request', prompt: 'Follow-up prompt' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Second reply' }] },
		]);
	});

	it('eager-renders tool requests from assistant.message.toolRequests and dedupes the matching tool.execution_complete', async () => {
		const events: AgentTaskSessionEvent[] = [
			userMessage('Edit something'),
			evt('assistant.message', {
				messageId: 'm-1',
				content: 'Here is the raw diff the model would dump', // intermediate narration — suppressed
				toolRequests: [{ toolCallId: 'tc-edit', name: 'edit', arguments: { path: '/tmp/workspace/owner/repo/src/foo.ts' } }],
			}),
			evt('tool.execution_complete', { toolCallId: 'tc-edit', success: true, result: '' }),
			evt('assistant.message', { messageId: 'turn-1', content: 'Done.' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Edit something' },
			{
				kind: 'response',
				parts: [
					{ type: 'tool', toolName: 'Edit', toolCallId: 'tc-edit' }, // only one card despite both events
					{ type: 'markdown', value: 'Done.' },
				],
			},
		]);
	});

	it('suppresses intermediate narration but renders the final pure-text assistant message', async () => {
		const events: AgentTaskSessionEvent[] = [
			userMessage('Run a tool'),
			evt('assistant.message', {
				messageId: 'm-1',
				content: 'About to commit and push:', // intermediate (has toolRequests)
				toolRequests: [{ toolCallId: 'tc-prog', name: 'report_progress', arguments: {} }],
			}),
			// Final reply: pure text, no toolRequests.
			evt('assistant.message', { messageId: 'turn-1', content: 'All done!' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Run a tool' },
			{
				kind: 'response',
				parts: [
					{ type: 'tool', toolName: 'Progress Update', toolCallId: 'tc-prog' },
					{ type: 'markdown', value: 'All done!' },
				],
			},
		]);
	});

	it('synthesises a single turn from the first session prompt when no user.message has arrived yet', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			// No user.message — task still bootstrapping.
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Original prompt from creation' }]);

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		// First turn uses the session prompt, not the AI-generated task title.
		expect(history[0]).toBeInstanceOf(ChatRequestTurn2);
		const req = history[0] as ChatRequestTurn2;
		expect(req.prompt).toBe('Original prompt from creation');
	});

	it('renders a stopped notice (not a progress spinner) when the task terminally failed but its latest session state is still active', async () => {
		// "Failed to launch agent": the task ends in `failed` while its only session's state is
		// stuck at `in_progress` and no renderable events were ever emitted. Keying off the task
		// state must surface the stop instead of a perpetual "Session is in progress…" spinner.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'failed');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: an error occurred' }] },
		]);
	});

	it('renders a cancellation reason (not an error) when the task was cancelled with no error event', async () => {
		// A cancelled task emits no session.error/session.shutdown; the reason comes from the state.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			userMessage('one more'),
		];
		const task = makeTask([{ state: 'cancelled', prompt: 'Do the thing' }], 'cancelled');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'one more' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: cancelled' }] },
		]);
	});

	it('includes the concrete error detail from a bootstrap session.error in the stopped notice', async () => {
		// A `session.error` emitted during bootstrap (before any user.message) is suppressed from
		// the rendered turn, but its detail is still surfaced in the terminal-stopped notice.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			evt('session.error', { errorType: 'launch_failed', message: 'Failed to launch agent' }),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'failed');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: (launch_failed) Failed to launch agent' }] },
		]);
	});

	it('still shows the in-progress spinner when the task is active with no renderable events yet', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'in_progress');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'ChatResponseProgressPart' }] },
		]);
	});
});

describe('extractTaskErrorDetail / formatTaskStoppedMessage', () => {
	it('prefers the last session.error message, falls back to session.shutdown errorReason, else undefined', () => {
		expect(extractTaskErrorDetail([
			evt('session.error', { errorType: 'launch_failed', message: 'Failed to launch agent' }),
		])).toBe('(launch_failed) Failed to launch agent');

		expect(extractTaskErrorDetail([
			evt('session.error', { message: 'boom' }),
		])).toBe('boom');

		expect(extractTaskErrorDetail([
			evt('session.error', { errorType: 'x', message: 'first' }, { dismissed: true }),
			evt('session.shutdown', { shutdownType: 'error', errorReason: 'agent crashed' }),
		])).toBe('agent crashed');

		expect(extractTaskErrorDetail([
			evt('session.shutdown', { shutdownType: 'routine' }),
			evt('session.start', {}),
		])).toBeUndefined();
	});

	it('uses the detail when present, else a state-derived reason', () => {
		expect(formatTaskStoppedMessage('failed', '(launch_failed) Failed to launch agent'))
			.toBe('Copilot stopped: (launch_failed) Failed to launch agent');
		expect(formatTaskStoppedMessage('cancelled', undefined)).toBe('Copilot stopped: cancelled');
		expect(formatTaskStoppedMessage('timed_out', undefined)).toBe('Copilot stopped: timed out');
		expect(formatTaskStoppedMessage('failed', undefined)).toBe('Copilot stopped: an error occurred');
	});
});

// --- TaskApiBackend ------------------------------------------------------------------------

class FakeTaskApiClient implements ITaskApiClient {
	public lastCreateRequest: AgentTaskCreateRequest | undefined;
	public createPRCalls: Array<{ owner: string; repo: string; taskId: string }> = [];
	public listForRepoCalls: Array<{ owner: string; repo: string; options?: ListTasksOptions }> = [];
	public listCalls: Array<{ options?: ListTasksOptions }> = [];
	private readonly _createPRResult: AgentTaskCreatePullRequestResponse;
	private readonly _createResult: AgentTask;
	private readonly _repoTasks: readonly AgentTask[];
	private readonly _globalTasks: readonly AgentTask[];

	constructor(opts?: { createResult?: AgentTask; createPRResult?: AgentTaskCreatePullRequestResponse; repoTasks?: readonly AgentTask[]; globalTasks?: readonly AgentTask[] }) {
		this._createResult = opts?.createResult ?? ({
			id: 'task-created',
			state: 'queued',
			created_at: '2026-03-27T00:00:00Z',
			html_url: 'https://github.com/octocat/hello-world/agents/tasks/task-created',
		} as unknown as AgentTask);
		this._createPRResult = opts?.createPRResult ?? { id: 1, number: 42, repository_id: 1 };
		this._repoTasks = opts?.repoTasks ?? [];
		this._globalTasks = opts?.globalTasks ?? [];
	}

	async createTask(_owner: string, _repo: string, request: AgentTaskCreateRequest): Promise<AgentTask> {
		this.lastCreateRequest = request;
		return this._createResult;
	}
	async listTasksForRepo(owner: string, repo: string, options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		this.listForRepoCalls.push({ owner, repo, options });
		return { tasks: this._repoTasks } as unknown as AgentTaskListResponse;
	}
	async listTasks(options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		this.listCalls.push({ options });
		return { tasks: this._globalTasks } as unknown as AgentTaskListResponse;
	}
	async getTask(_taskId: string): Promise<AgentTaskGetResponse> {
		return { id: _taskId } as unknown as AgentTaskGetResponse;
	}
	async getTaskEvents(_taskId: string, _options?: ListTaskEventsOptions): Promise<AgentTaskListEventsResponse> {
		return { events: [] } as unknown as AgentTaskListEventsResponse;
	}
	async steerTask(_taskId: string, _request: AgentTaskSteerRequest): Promise<void> { }
	async createPRForTask(owner: string, repo: string, taskId: string): Promise<AgentTaskCreatePullRequestResponse> {
		this.createPRCalls.push({ owner, repo, taskId });
		return this._createPRResult;
	}
	async archiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		return { id: taskId } as unknown as AgentTask;
	}
	async unarchiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		return { id: taskId } as unknown as AgentTask;
	}
}

describe('TaskApiBackend', () => {
	it('preserves most recent activity for every task lifecycle state', async () => {
		const states: AgentTaskState[] = ['queued', 'in_progress', 'idle', 'waiting_for_user', 'completed', 'failed', 'cancelled', 'timed_out'];
		const tasks = states.map(state => ({
			...makeTask([], state),
			id: state,
			updated_at: '2026-09-16T00:00:00Z',
			html_url: `https://github.com/microsoft/vscode/agents/tasks/${state}`,
			agent_collaborators: [{ slug: 'copilot-developer' }],
		}));
		const client = new FakeTaskApiClient({ globalTasks: tasks });
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);
		const sessions = await backend.fetchSessionList(undefined, true);
		expect(sessions.map(({ taskId, createdAt, updatedAt }) => ({ taskId, createdAt, updatedAt }))).toEqual(
			states.map(taskId => ({ taskId, createdAt: '2026-03-27T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z' })),
		);
	});

	it('createSession sends create_pull_request: false so tasks do not auto-create PRs', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await backend.createSession({
			owner: 'octocat',
			repo: 'hello-world',
			title: 'New task',
			prompt: 'Do the thing',
			problemStatement: 'Statement',
			baseRef: 'main',
		});

		expect(client.lastCreateRequest?.create_pull_request).toBe(false);
	});

	it('createPullRequestForTask resolves owner/repo from the task html_url and delegates to createPRForTask', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		const result = await backend.createPullRequestForTask({ id: 'task-1', html_url: 'https://github.com/octocat/hello-world/agents/tasks/task-1' } as AgentTaskGetResponse);

		expect(client.createPRCalls).toEqual([{ owner: 'octocat', repo: 'hello-world', taskId: 'task-1' }]);
		expect(result).toEqual({ id: 1, number: 42, repository_id: 1 });
	});

	it('createPullRequestForTask resolves the repo by id when the task has no html_url', async () => {
		const client = new FakeTaskApiClient();
		const octoKitService = new MockOctoKitService();
		octoKitService.getRepositoryById = async () => ({ owner: 'octocat', name: 'hello-world' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		await backend.createPullRequestForTask({ id: 'task-2', repository: { id: 123 } } as unknown as AgentTaskGetResponse);

		expect(client.createPRCalls).toEqual([{ owner: 'octocat', repo: 'hello-world', taskId: 'task-2' }]);
	});

	it('createPullRequestForTask throws when the repository cannot be resolved', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await expect(backend.createPullRequestForTask({ id: 'task-3' } as AgentTaskGetResponse)).rejects.toThrow();
		expect(client.createPRCalls).toEqual([]);
	});

	it('fetchSessionList scopes the repo task list to the current user via creator_id', async () => {
		const client = new FakeTaskApiClient();
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false);

		expect(client.listForRepoCalls).toEqual([
			{ owner: 'octocat', repo: 'hello-world', options: { per_page: 100, creator_id: 4242 } },
		]);
	});

	it('fetchSessionList fails closed (no repo fetch, empty result) when the current user id cannot be resolved', async () => {
		const client = new FakeTaskApiClient({ repoTasks: [{ id: 't1', state: 'completed', created_at: '2026-03-27T00:00:00Z', creator: { id: 999 } } as unknown as AgentTask] });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => undefined;
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false);

		expect(client.listForRepoCalls).toEqual([]);
		expect(result).toEqual([]);
	});

	it('fetchSessionList does not send creator_id on the user-scoped global list', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await backend.fetchSessionList(undefined, false);

		expect(client.listForRepoCalls).toEqual([]);
		expect(client.listCalls).toEqual([{ options: { per_page: 100 } }]);
	});

	it('fetchSessionList uses the global user-scoped list in the agents window even when repoIds are present', async () => {
		// The agents window surfaces all of the user's sessions rather than scoping to the active
		// workspace's repositories, so it must hit the global list and never the repo-scoped one.
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], true);

		expect(client.listForRepoCalls).toEqual([]);
		expect(client.listCalls).toEqual([{ options: { per_page: 100 } }]);
	});

	it('fetchSessionList resolves a global-list task repo by numeric id when it has no html_url', async () => {
		// Global-list (repoIds undefined) tasks may carry only `repository.id` and no `html_url`.
		// Without resolving it the session has no repo metadata and groups under "Unknown".
		const client = new FakeTaskApiClient({
			globalTasks: [
				{ id: 'g1', state: 'completed', created_at: '2026-03-27T00:00:00Z', agent_collaborators: [{ slug: 'copilot-developer' }], repository: { id: 123 } } as unknown as AgentTask,
				{ id: 'g2', state: 'completed', created_at: '2026-03-27T00:00:00Z', agent_collaborators: [{ slug: 'copilot-developer' }], repository: { id: 123 } } as unknown as AgentTask,
			],
		});
		const octoKitService = new MockOctoKitService();
		let getRepositoryByIdCalls = 0;
		octoKitService.getRepositoryById = async () => { getRepositoryByIdCalls++; return { owner: 'octocat', name: 'hello-world' }; };
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList(undefined, false);

		expect(result.map(r => r.repo)).toEqual([
			{ owner: 'octocat', name: 'hello-world' },
			{ owner: 'octocat', name: 'hello-world' },
		]);
		// Same repo id across both tasks resolves via a single cached lookup.
		expect(getRepositoryByIdCalls).toBe(1);
	});

	it('fetchSessionList preserves the task lifecycle state', async () => {
		const client = new FakeTaskApiClient({ repoTasks: [{ id: 't-idle', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer' }] } as unknown as AgentTask] });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false);

		expect(result.map(r => ({ taskId: r.taskId, state: r.state }))).toEqual([
			{ taskId: 't-idle', state: 'idle' },
		]);
	});

	it('fetchSessionList shows only cloud coding agent tasks and excludes local-client tasks (CLI / VS Code / JetBrains)', async () => {
		const repoTasks = [
			{ id: 'cloud-dev', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer' }] },
			{ id: 'cloud-swe', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-swe-agent' }] },
			{ id: 'cli', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer-cli' }] },
			{ id: 'vscode', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'vscode-chat' }] },
			{ id: 'jetbrains', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'jetbrains-chat' }] },
			{ id: 'no-collaborators', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 } },
		] as unknown as readonly AgentTask[];
		const client = new FakeTaskApiClient({ repoTasks });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false);

		expect(result.map(r => r.taskId)).toEqual(['cloud-dev', 'cloud-swe']);
	});
});

describe('isCloudCodingAgentTask', () => {
	it('keeps cloud coding agent slugs and rejects local-client / missing / malformed slugs', () => {
		const classify = (agent_collaborators?: Array<{ slug?: unknown }>) =>
			isCloudCodingAgentTask({ id: 't', state: 'idle', created_at: '2026-03-27T00:00:00Z', ...(agent_collaborators && { agent_collaborators }) } as unknown as AgentTask);

		expect({
			'copilot-developer': classify([{ slug: 'copilot-developer' }]),
			'copilot-swe-agent': classify([{ slug: 'copilot-swe-agent' }]),
			'copilot-developer-cli': classify([{ slug: 'copilot-developer-cli' }]),
			'vscode-chat': classify([{ slug: 'vscode-chat' }]),
			'jetbrains-chat': classify([{ slug: 'jetbrains-chat' }]),
			'missing-slug': classify([{}]),
			'null-slug': classify([{ slug: null }]),
			'no-collaborators': classify(undefined),
			'empty-collaborators': classify([]),
		}).toEqual({
			'copilot-developer': true,
			'copilot-swe-agent': true,
			'copilot-developer-cli': false,
			'vscode-chat': false,
			'jetbrains-chat': false,
			'missing-slug': false,
			'null-slug': false,
			'no-collaborators': false,
			'empty-collaborators': false,
		});
	});
});

describe('taskStateToChatSessionStatus', () => {
	it('maps each Task API lifecycle state to the right ChatSessionStatus', () => {
		const states: readonly AgentTaskState[] = ['queued', 'in_progress', 'idle', 'waiting_for_user', 'completed', 'failed', 'timed_out', 'cancelled'];
		const mapped = Object.fromEntries(states.map(state => [state, taskStateToChatSessionStatus(state)]));

		expect(mapped).toEqual({
			queued: vscode.ChatSessionStatus.InProgress,
			in_progress: vscode.ChatSessionStatus.InProgress,
			// Agent finished its turn / is waiting — must not look like active work.
			idle: vscode.ChatSessionStatus.Completed,
			waiting_for_user: vscode.ChatSessionStatus.NeedsInput,
			completed: vscode.ChatSessionStatus.Completed,
			failed: vscode.ChatSessionStatus.Failed,
			timed_out: vscode.ChatSessionStatus.Failed,
			cancelled: vscode.ChatSessionStatus.Failed,
		});
	});

	it('falls back to InProgress for an unknown/forward-compat state instead of returning undefined', () => {
		expect(taskStateToChatSessionStatus('some_new_server_state' as AgentTaskState)).toBe(vscode.ChatSessionStatus.InProgress);
	});
});

describe('isActiveTaskState / isFailedTaskState', () => {
	it('classifies each Task API lifecycle state and falls back to active for unknown states', () => {
		const states: readonly AgentTaskState[] = ['queued', 'in_progress', 'idle', 'waiting_for_user', 'completed', 'failed', 'timed_out', 'cancelled'];
		const active = Object.fromEntries(states.map(state => [state, isActiveTaskState(state)]));
		const failed = Object.fromEntries(states.map(state => [state, isFailedTaskState(state)]));

		expect({ active, failed }).toEqual({
			active: {
				queued: true,
				in_progress: true,
				idle: true,
				waiting_for_user: true,
				completed: false,
				failed: false,
				timed_out: false,
				cancelled: false,
			},
			failed: {
				queued: false,
				in_progress: false,
				idle: false,
				waiting_for_user: false,
				completed: false,
				failed: true,
				timed_out: true,
				cancelled: true,
			},
		});
	});

	it('treats an unknown/forward-compat state as active (never undefined) so the streamer keeps polling', () => {
		expect(isActiveTaskState('some_new_server_state' as AgentTaskState)).toBe(true);
		expect(isFailedTaskState('some_new_server_state' as AgentTaskState)).toBe(false);
	});
});

describe('parseRepoFromTaskUrl', () => {
	it('extracts owner and name from a task html_url', () => {
		expect(parseRepoFromTaskUrl('https://github.example.com/octocat/hello-world/agents/tasks/abc')).toEqual({ owner: 'octocat', name: 'hello-world', host: 'github.example.com' });
	});

	it('returns undefined for an unparseable URL', () => {
		expect(parseRepoFromTaskUrl('not-a-url')).toBeUndefined();
	});

	it('returns undefined when the path does not start with owner/repo', () => {
		expect(parseRepoFromTaskUrl('https://github.com/')).toBeUndefined();
	});

	it('returns undefined when the URL is undefined', () => {
		expect(parseRepoFromTaskUrl(undefined)).toBeUndefined();
	});
});
