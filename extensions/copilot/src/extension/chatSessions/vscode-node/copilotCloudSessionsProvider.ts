/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { AgentTaskSessionEvent, AgentTaskState } from '@vscode/copilot-api';
import { l10n, Uri } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { getGithubRepoIdFromFetchUrl, GithubRepoId, IGitService, toGithubNwo } from '../../../platform/git/common/gitService';
import { derivePullRequestState, PullRequestSearchItem, PullRequestState } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { getModelCapabilitiesDescription, normalizeTokenPrices } from '../../conversation/common/languageModelAccess';
import { ILogService } from '../../../platform/log/common/logService';
import { emitCloudSessionInvokeEvent } from '../../../platform/otel/common/genAiEvents';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IntervalTimer, Limiter, RunOnceScheduler, timeout } from '../../../util/vs/base/common/async';
import { Event } from '../../../util/vs/base/common/event';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Disposable, DisposableStore, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { LRUCache } from '../../../util/vs/base/common/map';
import { SingleSlotTtlCache } from '../common/ttlCache';
import { isUntitledSessionId } from '../common/utils';
import { getRepoId, isActiveTaskState, SessionIdForTask } from '../vscode/copilotCodingAgentUtils';
import { CloudAgentBackend, CloudSessionData, TaskContent } from '../vscode/cloudAgentBackend';
import { ChatSessionContentBuilder } from './copilotCloudSessionContentBuilder';
import { StreamBaseline, TaskTurnStreamer } from './taskTurnStreamer';
import { CloudBackendInstrumentation } from './cloudBackendTelemetry';
import { CloudTaskOwnership } from './cloudTaskOwnership';
import { parseRepoFromTaskUrl, TaskApiBackend, TaskApiError, TaskApiHttpClient } from './taskApiBackend';
import { resolvePullArtifact } from './pullArtifactResolver';
import { IPullRequestFileChangesService } from './pullRequestFileChangesService';
import MarkdownIt = require('markdown-it');

type CloudSessionItemMetadata = NonNullable<CloudSessionData['repo']> & {
	readonly branch?: string;
	readonly baseBranch?: string;
	readonly pullRequestUrl?: string;
	readonly pullRequestState?: PullRequestState;
	readonly linkedIssues?: NonNullable<PullRequestSearchItem['closingIssuesReferences']>['nodes'];
};

export function getCloudSessionItemMetadata(repo: CloudSessionData['repo'], diffRefs: CloudSessionData['diffRefs'], pullRequest?: PullRequestSearchItem): CloudSessionItemMetadata | undefined {
	if (pullRequest) {
		return {
			owner: pullRequest.repository.owner.login,
			name: pullRequest.repository.name,
			branch: pullRequest.headRefName,
			baseBranch: pullRequest.baseRefName,
			pullRequestUrl: pullRequest.url,
			pullRequestState: derivePullRequestState(pullRequest),
			...(pullRequest.closingIssuesReferences?.nodes.length ? { linkedIssues: pullRequest.closingIssuesReferences.nodes } : {}),
		};
	}
	if (!repo) {
		return undefined;
	}
	return {
		owner: repo.owner,
		name: repo.name,
		...(repo.host ? { host: repo.host } : {}),
		...(diffRefs?.headRef ? { branch: diffRefs.headRef } : {}),
	};
}

/** Core setting that controls which external sessions are listed. */
export const SHOW_EXTERNAL_SESSIONS_SETTING = 'chat.agentSessions.showExternal';

/** Values of {@link SHOW_EXTERNAL_SESSIONS_SETTING}. */
export type ExternalSessionsMode = 'none' | 'recent' | 'last24Hours' | 'last7Days' | 'last30Days';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EXTERNAL_SESSION_LIMIT = 2;
const RECENT_INTERNAL_SESSION_LIMIT = 2;

export function readExternalSessionsMode(value: unknown): ExternalSessionsMode {
	switch (value) {
		case 'none':
		case 'recent':
		case 'last24Hours':
		case 'last7Days':
		case 'last30Days':
			return value;
		case 'all':
			return 'last30Days';
		default:
			return 'recent';
	}
}

function getLastActivity(session: CloudSessionData): number {
	return Date.parse(session.updatedAt ?? session.completedAt ?? session.createdAt);
}

/**
 * Activity time of the second most recently active session that was started or adopted from
 * VS Code. Under the `recent` mode, older external sessions are superseded by these sessions.
 */
export function getRecentInternalActivityCutoff(sessions: readonly CloudSessionData[], isExternal: (taskId: string) => boolean): number | undefined {
	return sessions
		.filter(session => !isExternal(session.taskId))
		.map(getLastActivity)
		.filter(Number.isFinite)
		.sort((a, b) => b - a)[RECENT_INTERNAL_SESSION_LIMIT - 1];
}

export interface ICloudSessionVisibilityOptions {
	readonly mode: ExternalSessionsMode;
	readonly isExternal: (taskId: string) => boolean;
	/** See {@link getRecentInternalActivityCutoff}. */
	readonly recentInternalActivityCutoff: number | undefined;
}

/**
 * Sessions started or adopted from VS Code are always visible. External sessions follow
 * {@link SHOW_EXTERNAL_SESSIONS_SETTING}, matching the Agent Host's external session catalog.
 * `expiresAt` is the earliest time at which a visible session ages out of the mode.
 */
export function filterCloudSessions(
	sessions: readonly CloudSessionData[],
	{ mode, isExternal, recentInternalActivityCutoff }: ICloudSessionVisibilityOptions,
	logService: ILogService,
	now: number = Date.now(),
): { readonly sessions: readonly CloudSessionData[]; readonly expiresAt: number } {
	const maxAge = mode === 'last24Hours' ? DAY_MS : mode === 'last30Days' ? 30 * DAY_MS : 7 * DAY_MS;
	const recentTaskIds = mode === 'recent'
		? new Set(sessions
			.filter(session => {
				const lastActivity = getLastActivity(session);
				return isExternal(session.taskId)
					&& lastActivity >= now - maxAge
					&& (recentInternalActivityCutoff === undefined || lastActivity >= recentInternalActivityCutoff);
			})
			.sort((a, b) => getLastActivity(b) - getLastActivity(a) || a.taskId.localeCompare(b.taskId))
			.slice(0, RECENT_EXTERNAL_SESSION_LIMIT)
			.map(session => session.taskId))
		: undefined;

	let expiresAt = Infinity;
	const visibleSessions = sessions.filter(session => {
		if (!isExternal(session.taskId)) {
			return true;
		}
		if (mode === 'none') {
			return false;
		}
		const lastActivity = getLastActivity(session);
		if (!Number.isFinite(lastActivity)) {
			logService.warn(`Cannot determine the last activity of cloud task ${session.taskId}; keeping it visible.`);
			return true;
		}
		const expiry = lastActivity + maxAge;
		if (expiry < now || (recentTaskIds && !recentTaskIds.has(session.taskId))) {
			return false;
		}
		expiresAt = Math.min(expiresAt, expiry);
		return true;
	});
	return { sessions: visibleSessions, expiresAt };
}

/**
 * Session resources for a cloud task. The task id is the stable identity; a task that has
 * a pull request also reports the `/<prNumber>` URI it was previously listed under so the
 * host can migrate archive/pin/read state forward once and drop the old entry.
 */
export function getCloudSessionResources(taskId: string, pullRequestNumber: number | undefined): { resource: vscode.Uri; legacyResource?: vscode.Uri } {
	const resource = vscode.Uri.from({ scheme: CopilotCloudSessionsProvider.TYPE, path: '/' + SessionIdForTask.getId(taskId) });
	if (pullRequestNumber === undefined) {
		return { resource };
	}

	return { resource, legacyResource: vscode.Uri.from({ scheme: CopilotCloudSessionsProvider.TYPE, path: '/' + pullRequestNumber }) };
}

/**
 * Map a Task API lifecycle state directly to a {@link vscode.ChatSessionStatus}. This keeps the
 * non-terminal "agent handed the turn back" states distinct from active work: `idle` (agent
 * finished its turn, nothing pending) renders as Completed and `waiting_for_user` (agent paused for
 * input) renders as NeedsInput. Only `queued`/`in_progress` are genuinely InProgress — collapsing
 * `idle`/`waiting_for_user` into InProgress made settled tasks look like they were still running.
 */
export function taskStateToChatSessionStatus(state: AgentTaskState): vscode.ChatSessionStatus {
	switch (state) {
		case 'queued':
		case 'in_progress':
			return vscode.ChatSessionStatus.InProgress;
		case 'waiting_for_user':
			return vscode.ChatSessionStatus.NeedsInput;
		case 'idle':
		case 'completed':
			return vscode.ChatSessionStatus.Completed;
		case 'failed':
		case 'timed_out':
		case 'cancelled':
			return vscode.ChatSessionStatus.Failed;
		default:
			// Forward-compat fallback: a state outside the known union (e.g. a state added
			// server-side after this build) must not yield an invalid `undefined` status. Treat
			// unknowns as InProgress — the conservative "agent may still own the turn" assumption.
			return vscode.ChatSessionStatus.InProgress;
	}
}
const MODELS_OPTION_GROUP_ID = 'models';
const DEFAULT_MODEL_ID = 'auto';
const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.chat.cloudSessions.openRepository';
const SEARCH_REPOSITORIES_COMMAND_ID = '_github.copilot.chat.cloudSessions.searchRepositories';
const OPEN_ISSUE_COMMAND_ID = 'github.copilot.chat.cloudSessions.openIssue';
const OPEN_PULL_REQUEST_COMMAND_ID = 'github.copilot.chat.cloudSessions.openPullRequest';
const CLEAR_CACHES_COMMAND_ID = 'github.copilot.chat.cloudSessions.clearCaches';
const RESOLVE_TASK_COMMAND_ID = 'github.copilot.chat.cloudSessions.resolveTask';
const CREATE_PULL_REQUEST_FOR_TASK_COMMAND_ID = 'github.copilot.chat.cloudSessions.createPullRequestForTask';
const OPEN_PULL_REQUEST_FOR_TASK_COMMAND_ID = 'github.copilot.chat.cloudSessions.openPullRequestForTask';

type RepositoryPickResult = {
	readonly repository?: string;
	readonly cloneUrl?: string;
};

export function parseGitHubContextUrl(value: string, kind: 'issue' | 'pullRequest'): { readonly repoId: string; readonly url: string; readonly label: string } | undefined {
	const match = /^https:\/\/(?:www\.)?github\.com\/(?<owner>[^/?#]+)\/(?<repository>[^/?#]+)\/(?<resource>issues|pull)\/(?<number>[1-9]\d*)\/?(?:[?#].*)?$/i.exec(value.trim());
	if (!match?.groups) {
		return undefined;
	}
	const resource = match.groups.resource.toLowerCase();
	if ((resource === 'issues') !== (kind === 'issue')) {
		return undefined;
	}

	const repoId = `${match.groups.owner}/${match.groups.repository}`;
	return {
		repoId,
		url: `https://github.com/${repoId}/${resource}/${match.groups.number}`,
		label: `${repoId}#${match.groups.number}`,
	};
}

export async function resolveGitHubContextRepository(gitService: IGitService, repository: string | vscode.Uri | undefined): Promise<string | undefined> {
	if (!repository || typeof repository === 'string') {
		return repository;
	}

	const repositoryInfo = await gitService.getRepositoryFetchUrls(repository);
	for (const remoteUrl of repositoryInfo?.remoteFetchUrls ?? []) {
		const repositoryId = remoteUrl && getGithubRepoIdFromFetchUrl(remoteUrl);
		if (repositoryId) {
			return toGithubNwo(repositoryId);
		}
	}
	return undefined;
}

export async function resolveOrPickGitHubContextRepository(
	gitService: IGitService,
	repository: string | vscode.Uri | undefined,
	pickRepository: () => Promise<string | undefined>,
): Promise<string | undefined> {
	const repositoryId = await resolveGitHubContextRepository(gitService, repository);
	return repository && !repositoryId ? pickRepository() : repositoryId;
}

/** Context key gating the chat-input "Create pull request" toolbar action: true while the viewed cloud task is settled and has no PR yet. */
const CAN_CREATE_PULL_REQUEST_CONTEXT_KEY = 'github.copilot.chat.cloudTaskCanCreatePullRequest';
/** Context key gating the chat-input "Open pull request" toolbar action: true once the viewed cloud task has a pull request. */
const CAN_OPEN_PULL_REQUEST_CONTEXT_KEY = 'github.copilot.chat.cloudTaskCanOpenPullRequest';
// TTL for caching session provider options (custom agents, models, partner agents, etc.)
const OPTIONS_CACHE_TTL_MS = 15 * 60 * 1_000;

/**
 * Custom renderer for markdown-it that converts markdown to plain text
 */
class PlainTextRenderer {
	private md: MarkdownIt;

	constructor() {
		this.md = new MarkdownIt();
	}

	/**
	 * Renders markdown text as plain text by extracting text content from all tokens
	 */
	render(markdown: string): string {
		const tokens = this.md.parse(markdown, {});
		return this.renderTokens(tokens).trim();
	}

	private renderTokens(tokens: MarkdownIt.Token[]): string {
		let result = '';
		for (const token of tokens) {
			// Process child tokens recursively
			if (token.children) {
				result += this.renderTokens(token.children);
			}

			// Handle different token types
			switch (token.type) {
				case 'text':
				case 'code_inline':
					// Only add content if no children were processed
					if (!token.children) {
						result += token.content;
					}
					break;

				case 'softbreak':
				case 'hardbreak':
					result += ' '; // Space instead of newline to match original
					break;

				case 'paragraph_close':
					result += '\n'; // Newline after paragraphs for separation
					break;

				case 'heading_close':
					result += '\n'; // Newline after headings
					break;

				case 'list_item_close':
					result += '\n'; // Newline after list items
					break;

				case 'fence':
				case 'code_block':
				case 'hr':
					// Skip these entirely
					break;

				// Don't add default case - only explicitly handle what we want
			}
		}
		return result;
	}
}

export class CopilotCloudSessionsProvider extends Disposable implements vscode.ChatSessionContentProvider, vscode.ChatSessionItemProvider {
	public static readonly TYPE = 'copilot-cloud-agent';
	private readonly _onDidChangeChatSessionItems = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
	public readonly onDidCommitChatSessionItem = Event.None;
	private readonly _onDidChangeChatSessionProviderOptions = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChangeChatSessionProviderOptions = this._onDidChangeChatSessionProviderOptions.event;
	private chatSessionItemsPromise: Promise<vscode.ChatSessionItem[]> | undefined;
	public chatParticipant = vscode.chat.createChatParticipant(CopilotCloudSessionsProvider.TYPE, async (request, context, stream, token) => {
		return this.chatParticipantImpl(request, context, stream, token);
	});
	private cachedSessionsSize: number = 0;
	private cachedSessionItems: vscode.ChatSessionItem[] | undefined;
	private cachedDiscoveredTaskIds = new Set<string>();
	private cachedSessionItemsExpiresAt = Infinity;
	private readonly cachedSessionItemsExpiryScheduler = this._register(new RunOnceScheduler(() => {
		if (Date.now() > this.cachedSessionItemsExpiresAt) {
			this.refresh();
		} else {
			this.scheduleCachedSessionItemsExpiry();
		}
	}, 0));
	private sessionItemsRequestGeneration = 0;
	private readonly explicitlyResolvedSessions = new LRUCache<string, vscode.ChatSessionItem>(50);
	private readonly unpublishedExactTasks = new Set<string>();
	private sessionSourceGeneration = 0;
	// Task ids with an in-flight "Create pull request" toolbar request, used to guard against
	// re-entrant invocations (e.g. rapid double-clicks) that would otherwise submit duplicate PRs.
	private readonly _createPullRequestInFlightTaskIds = new Set<string>();
	// Task ids with a live {@link TaskTurnStreamer} (activeResponseCallback or follow-up).
	// When a stream is already active for a task, a mid-turn steering follow-up only needs to
	// POST /steer — the running stream renders the injected result, so we skip starting a
	// second streamer.
	private readonly _activeTaskStreams = new Set<string>();
	// Task id whose content currently drives the chat-input pull-request toolbar gates
	// ({@link CAN_CREATE_PULL_REQUEST_CONTEXT_KEY} / {@link CAN_OPEN_PULL_REQUEST_CONTEXT_KEY}). Used so
	// the gates can be re-applied as the viewed task changes state (settles, gains a PR) without a
	// session switch, and to ignore stale updates once the user navigates away.
	private _activeToolbarTaskId: string | undefined;
	private readonly plainTextRenderer = new PlainTextRenderer();

	// Automation models are account-scoped, independent of the current repository.
	private _optionsCache = new SingleSlotTtlCache<vscode.ChatSessionProviderOptions>(OPTIONS_CACHE_TTL_MS);

	private readonly _backend: CloudAgentBackend;
	private readonly _ownership: CloudTaskOwnership;
	/**
	 * {@link getRecentInternalActivityCutoff} snapshotted at the first listing, like the Agent Host's
	 * startup snapshot, so sessions started or adopted later do not hide external sessions that
	 * are already listed.
	 */
	private _recentInternalActivityCutoff: { readonly value: number | undefined } | undefined;

	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@IGitService private readonly _gitService: IGitService,
		@ITelemetryService private readonly telemetry: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IPullRequestFileChangesService private readonly _prFileChangesService: IPullRequestFileChangesService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IDomainService private readonly _domainService: IDomainService,
		@IOTelService private readonly _otelService: IOTelService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const instrumentation = new CloudBackendInstrumentation(this.telemetry, this._otelService);
		const taskApiClient = new TaskApiHttpClient(capiClientService, this._authenticationService, this.logService);
		this._backend = new TaskApiBackend(taskApiClient, this.logService, this._octoKitService, instrumentation);
		this._ownership = new CloudTaskOwnership(this._extensionContext.globalState);

		this.registerCommands();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SHOW_EXTERNAL_SESSIONS_SETTING)) {
				this.refresh();
			}
		}));

		this._register(this._authenticationService.onDidAuthenticationChange(() => {
			this.sessionSourceGeneration++;
			this.explicitlyResolvedSessions.clear();
			this.refresh();
		}));

		// Refresh when CAPI URL changes (e.g., when GHE Copilot token arrives and updates the base URL)
		this._register(this._domainService.onDidChangeDomains(e => {
			if (e.capiUrlChanged) {
				this.sessionSourceGeneration++;
				this.explicitlyResolvedSessions.clear();
				this.logService.debug('copilotCloudSessionsProvider: CAPI URL changed, refreshing sessions');
				this.clearOptionsCaches();
				this.refresh();
				this._onDidChangeChatSessionProviderOptions.fire();
			}
		}));

		// Background refresh for Copilot cloud agent sessions based on repository and authentication state
		getRepoId(this._gitService).then(async repoIds => {
			const telemetryObj: {
				intervalMs?: number;
				hasHistoricalSessions?: boolean;
				error?: string;
				isEmptyWindow: boolean;
			} = {
				isEmptyWindow: !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0
			};
			if (repoIds && repoIds.length > 0) {
				let intervalMs: number;
				let hasHistoricalSessions: boolean;
				try {
					const { sessions: sessionList } = await this.fetchSessionList(repoIds);
					hasHistoricalSessions = sessionList.length > 0;
					intervalMs = this.getRefreshIntervalTime(hasHistoricalSessions);
				} catch (e) {
					this.logService.error(`Error during background refresh setup: ${e instanceof Error ? e.message : String(e)}`);
					hasHistoricalSessions = false;
					intervalMs = this.getRefreshIntervalTime(hasHistoricalSessions);
					telemetryObj.error = e instanceof Error ? e.message : String(e);
				}
				telemetryObj.intervalMs = intervalMs;
				telemetryObj.hasHistoricalSessions = hasHistoricalSessions;
				const schedulerCallback = async () => {
					try {
						const { sessions: sessionList } = await this.fetchSessionList(repoIds);
						if (this.cachedSessionsSize !== sessionList.length || Date.now() > this.cachedSessionItemsExpiresAt) {
							this.refresh();
						}
					} catch (e) {
						logService.error(`Error during background refresh: ${e}`);
					}
					scheduler.schedule();
				};
				let lastRefreshedAt = 0;
				const scheduler = this._register(new RunOnceScheduler(() => {
					lastRefreshedAt = Date.now();
					schedulerCallback();
				}, intervalMs));
				scheduler.schedule();
				this._register(vscode.window.onDidChangeWindowState((e) => {
					if (!e.active) {
						scheduler.cancel();
					} else if (!scheduler.isScheduled()) {
						scheduler.schedule(Math.max(0, intervalMs - (Date.now() - lastRefreshedAt)));
					}
				}));

			}
			const onDebouncedAuthRefresh = Event.debounce(this._authenticationService.onDidAuthenticationChange, () => { }, 500);
			this._register(onDebouncedAuthRefresh(() => {
				this.clearOptionsCaches();
				this.refresh();
			}));
			this.telemetry.sendTelemetryEvent('copilotCloudSessions.refreshInterval', { microsoft: true, github: false }, telemetryObj);
		});
	}

	private registerCommands() {
		const executePullRequestActionWithExtensionInstall = async (
			sessionItemOrResource: vscode.ChatSessionItem | vscode.Uri | number | undefined,
			options: {
				actionLabel: string;
				noRepoErrorMessage: string;
				installPromptMessage: string;
				executeAction: (repoId: { org: string; repo: string }, pullRequestNumber: number) => Promise<void>;
			}
		): Promise<void> => {
			const pullRequestNumber = await this.resolvePullRequestNumber(sessionItemOrResource);
			// Reachable when `chatSessionPullRequest` is unknown, which keeps the action visible.
			if (!pullRequestNumber) {
				this.logService.warn('No pull request number could be resolved for the requested cloud session action.');
				return;
			}
			const repoIds = await getRepoId(this._gitService);
			if (!repoIds || repoIds.length === 0) {
				vscode.window.showErrorMessage(options.noRepoErrorMessage);
				return;
			}

			const extensionId = 'github.vscode-pull-request-github';
			const isExtensionInstalled = vscode.extensions.getExtension(extensionId) !== undefined;

			if (!isExtensionInstalled) {
				const result = await vscode.window.showInformationMessage(
					options.installPromptMessage,
					{ modal: true },
					options.actionLabel
				);

				if (result !== options.actionLabel) {
					return;
				}

				await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId, { enable: true });
			}

			await options.executeAction(repoIds[0], pullRequestNumber);
		};

		const checkoutPullRequestReroute = (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) =>
			executePullRequestActionWithExtensionInstall(sessionItemOrResource, {
				actionLabel: l10n.t('Install and Checkout'),
				noRepoErrorMessage: l10n.t('No active repository found to checkout pull request.'),
				installPromptMessage: l10n.t('The GitHub Pull Requests extension is required to checkout this PR. Would you like to install and checkout?'),
				executeAction: async (repoId, pullRequestNumber) => {
					await vscode.commands.executeCommand('pr.checkoutFromDescription', { owner: repoId.org, repo: repoId.repo, number: pullRequestNumber });
				},
			});
		this._register(vscode.commands.registerCommand('github.copilot.chat.checkoutPullRequestReroute', checkoutPullRequestReroute));

		const openPullRequestReroute = (sessionItemOrResource?: vscode.ChatSessionItem | number | vscode.Uri) =>
			executePullRequestActionWithExtensionInstall(sessionItemOrResource, {
				actionLabel: l10n.t('Install and Open'),
				noRepoErrorMessage: l10n.t('No active repository found to open pull request.'),
				installPromptMessage: l10n.t('The GitHub Pull Requests extension is required to open this PR. Would you like to install and open?'),
				executeAction: async (repoId, pullRequestNumber) => {
					await vscode.commands.executeCommand('pr.openDescription', {
						pullRequestDetails: {
							number: pullRequestNumber,
							repository: {
								owner: {
									login: repoId.org,
								},
								name: repoId.repo,
							},
						},
					});
				},
			});
		this._register(vscode.commands.registerCommand('github.copilot.chat.openPullRequestReroute', openPullRequestReroute));

		this._register(vscode.commands.registerCommand(SEARCH_REPOSITORIES_COMMAND_ID, async (query: string) => {
			const repositories = await this._octoKitService.getUserRepositories({}, query);
			return repositories.map(repo => `${repo.owner}/${repo.name}`);
		}));

		const openRepositoryCommand = async (
			_sessionItemResource?: vscode.Uri,
			options?: { readonly allowRepositoryUrl?: boolean },
		): Promise<string | undefined> => {
			const selected = await vscode.commands.executeCommand<RepositoryPickResult>(
				'_chat.pickRepository',
				SEARCH_REPOSITORIES_COMMAND_ID,
				options,
			);
			return selected?.cloneUrl ?? selected?.repository;
		};
		this._register(vscode.commands.registerCommand(OPEN_REPOSITORY_COMMAND_ID, openRepositoryCommand));

		type GitHubContextQuickPickItem = vscode.QuickPickItem & {
			readonly selection: {
				readonly repoId: string;
				readonly url: string;
				readonly label: string;
			};
		};
		const openGitHubContext = (kind: 'issue' | 'pullRequest', repoId?: string): Promise<GitHubContextQuickPickItem['selection'] | undefined> => {
			const quickPick = vscode.window.createQuickPick<GitHubContextQuickPickItem>();
			const quickPickDisposables = new DisposableStore();
			quickPick.placeholder = repoId
				? (kind === 'issue'
					? l10n.t('Search issues in {0}...', repoId)
					: l10n.t('Search pull requests in {0}...', repoId))
				: (kind === 'issue'
					? l10n.t('Search for an issue...')
					: l10n.t('Search for a pull request...'));
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.busy = true;
			quickPick.show();

			let searchTimeout: ReturnType<typeof setTimeout> | undefined;
			let searchGeneration = 0;
			return new Promise(resolve => {
				let resolved = false;
				const doResolve = (value: GitHubContextQuickPickItem['selection'] | undefined) => {
					if (!resolved) {
						resolved = true;
						resolve(value);
					}
				};
				const search = async (query: string, generation: number) => {
					quickPick.busy = true;
					try {
						const qualifier = kind === 'issue' ? 'is:issue' : 'is:pr';
						const repositoryScope = repoId ? `repo:${repoId}` : '';
						const scope = query ? `${query} ${repositoryScope}` : (repositoryScope || 'involves:@me');
						const results = await this._octoKitService.searchIssuesAndPullRequests(`${scope} ${qualifier}`, {});
						if (generation !== searchGeneration) {
							return;
						}
						quickPick.items = results
							.filter(result => result.isPullRequest === (kind === 'pullRequest'))
							.map(result => ({
								label: `#${result.number} ${result.title}`,
								description: `${result.owner}/${result.repository}`,
								selection: {
									repoId: `${result.owner}/${result.repository}`,
									url: result.url,
									label: `${result.owner}/${result.repository}#${result.number}`,
								},
							}));
					} catch (error) {
						this.logService.error(`Error searching GitHub ${kind === 'issue' ? 'issues' : 'pull requests'}: ${error}`);
						if (generation === searchGeneration) {
							quickPick.items = [];
						}
					} finally {
						if (generation === searchGeneration) {
							quickPick.busy = false;
						}
					}
				};
				void search('', ++searchGeneration);
				quickPickDisposables.add(quickPick.onDidChangeValue(value => {
					if (searchTimeout) {
						clearTimeout(searchTimeout);
					}
					const query = value.trim();
					const pastedSelection = parseGitHubContextUrl(query, kind);
					if (pastedSelection) {
						searchGeneration++;
						quickPick.busy = false;
						quickPick.items = [{
							label: pastedSelection.label,
							description: pastedSelection.repoId,
							alwaysShow: true,
							selection: pastedSelection,
						}];
						return;
					}
					if (query.length < 2) {
						if (query.length === 0) {
							void search('', ++searchGeneration);
						} else {
							searchGeneration++;
							quickPick.items = [];
							quickPick.busy = false;
						}
						return;
					}
					const generation = ++searchGeneration;
					searchTimeout = setTimeout(() => {
						void search(query, generation);
					}, 300);
				}));
				quickPickDisposables.add(quickPick.onDidAccept(() => {
					doResolve(quickPick.selectedItems[0]?.selection);
					quickPick.hide();
				}));
				quickPickDisposables.add(quickPick.onDidHide(() => {
					if (searchTimeout) {
						clearTimeout(searchTimeout);
					}
					searchGeneration++;
					quickPickDisposables.dispose();
					quickPick.dispose();
					doResolve(undefined);
				}));
			});
		};
		this._register(vscode.commands.registerCommand(OPEN_ISSUE_COMMAND_ID, async (repository?: string | vscode.Uri) =>
			openGitHubContext('issue', await resolveOrPickGitHubContextRepository(this._gitService, repository, openRepositoryCommand))));
		this._register(vscode.commands.registerCommand(OPEN_PULL_REQUEST_COMMAND_ID, async (repository?: string | vscode.Uri) =>
			openGitHubContext('pullRequest', await resolveOrPickGitHubContextRepository(this._gitService, repository, openRepositoryCommand))));

		this._register(vscode.commands.registerCommand(CLEAR_CACHES_COMMAND_ID, () => {
			this.logService.debug('copilotCloudSessionsProvider#clearCaches: clearing all cloud agent caches');
			this.clearOptionsCaches();
			this.refresh();
			this._onDidChangeChatSessionProviderOptions.fire();
		}));

		this._register(vscode.commands.registerCommand(CREATE_PULL_REQUEST_FOR_TASK_COMMAND_ID, (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => this.handleCreatePullRequestForTaskCommand(sessionItemOrResource)));
		this._register(vscode.commands.registerCommand(RESOLVE_TASK_COMMAND_ID, async (resource: vscode.Uri) => {
			const taskId = resource?.scheme === CopilotCloudSessionsProvider.TYPE && !resource.authority && !resource.query && !resource.fragment
				? SessionIdForTask.parseTaskId(resource) : undefined;
			if (!taskId || taskId.includes('/')) {
				throw new Error(l10n.t('Invalid Copilot cloud task resource.'));
			}
			const sourceGeneration = this.sessionSourceGeneration;
			const entry = await this._backend.fetchSession(taskId);
			if (this._store.isDisposed || sourceGeneration !== this.sessionSourceGeneration) {
				throw new CancellationError();
			}
			if (!entry.automationId) {
				throw new Error(l10n.t('This provider only supports cloud automation runs.'));
			}
			const item = await this.toChatSessionItem(entry, undefined, true, !this._ownership.getOwnedTaskIds().has(taskId));
			if (this._store.isDisposed || sourceGeneration !== this.sessionSourceGeneration) {
				throw new CancellationError();
			}
			if (item === undefined) {
				throw new Error(l10n.t('Could not resolve cloud task {0}.', taskId));
			}
			const previousTaskIds = new Set(this.explicitlyResolvedSessions.keys());
			this.explicitlyResolvedSessions.set(taskId, item);
			this.unpublishedExactTasks.add(taskId);
			for (const id of previousTaskIds) {
				if (!this.explicitlyResolvedSessions.has(id)) {
					this.unpublishedExactTasks.delete(id);
				}
			}
			if (this.cachedSessionItems) {
				this.cachedSessionItems = this.cachedSessionItems.filter(existing => {
					const existingTaskId = SessionIdForTask.parseTaskId(existing.resource);
					return existingTaskId !== taskId && (!existingTaskId || !previousTaskIds.has(existingTaskId) || this.explicitlyResolvedSessions.has(existingTaskId) || this.cachedDiscoveredTaskIds.has(existingTaskId));
				});
				this.cachedSessionItems.push(item);
				vscode.commands.executeCommand('setContext', 'github.copilot.chat.cloudSessionsEmpty', false);
			}
			this._onDidChangeChatSessionItems.fire();
		}));
		this._register(vscode.commands.registerCommand(OPEN_PULL_REQUEST_FOR_TASK_COMMAND_ID, (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => this.handleOpenPullRequestForTaskCommand(sessionItemOrResource)));
	}

	private getRefreshIntervalTime(hasHistoricalSessions: boolean): number {
		// Check for experiment overrides
		const expRefreshInterval = this._experimentationService.getTreatmentVariable<number>('copilotCloudSessions.refreshInterval');
		if (expRefreshInterval !== undefined) {
			return expRefreshInterval;
		}

		// Default intervals
		const fiveMinInterval = 5 * 60 * 1000; // 5 minutes
		const tenMinInterval = 10 * 60 * 1000; // 10 minutes
		if (hasHistoricalSessions) {
			return fiveMinInterval;
		} else {
			return tenMinInterval;
		}
	}

	public refresh(): void {
		this.unpublishedExactTasks.clear();
		this.cachedSessionItemsExpiryScheduler.cancel();
		this.sessionItemsRequestGeneration++;
		this.cachedSessionItems = undefined;
		this.cachedDiscoveredTaskIds.clear();
		this.cachedSessionItemsExpiresAt = Infinity;
		this.chatSessionItemsPromise = undefined;
		// Keep the account-scoped model catalog until its TTL expires or authentication changes.
		this._onDidChangeChatSessionItems.fire();
	}

	private scheduleCachedSessionItemsExpiry(): void {
		this.cachedSessionItemsExpiryScheduler.cancel();
		if (this._store.isDisposed || !Number.isFinite(this.cachedSessionItemsExpiresAt)) {
			return;
		}

		// The cutoff is inclusive, and setTimeout delays cannot exceed ~24.8 days.
		const delay = Math.max(0, this.cachedSessionItemsExpiresAt - Date.now() + 1);
		this.cachedSessionItemsExpiryScheduler.schedule(Math.min(delay, 2 ** 31 - 1));
	}

	/**
	 * Force-clears the TTL-based caches for /enabled and session provider options.
	 * Use for auth changes or explicit user-initiated refresh where stale data is unacceptable.
	 */
	private clearOptionsCaches(): void {
		this._optionsCache.clear();
	}

	async provideChatSessionProviderOptions(token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptions> {
		const optionsCacheKey = 'models';
		const cachedOptions = this._optionsCache.get(optionsCacheKey);
		if (cachedOptions) {
			this.logService.trace('copilotCloudSessionsProvider#provideChatSessionProviderOptions: using cached options');
			return cachedOptions;
		}

		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		try {
			const models = await this._octoKitService.getCopilotAgentModels({});
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (models.length > 0) {
				const isUBB = !!this._authenticationService.copilotToken?.isUsageBasedBilling;

				const modelItems: vscode.ChatSessionProviderOptionItem[] = models.map(model => {
					const limits = model.capabilities?.limits;
					const multiplier = model.billing?.multiplier;
					const pricing = normalizeTokenPrices(model.billing?.token_prices);
					const family = model.capabilities?.family ?? model.id;
					const tooltip = getModelCapabilitiesDescription({ name: model.name, family });

					return {
						id: model.id,
						name: model.name,
						...(!isUBB && multiplier !== undefined ? { description: `${multiplier}x` } : {}),
						tooltip,
						modelMetadata: {
							name: model.name,
							id: model.id,
							vendor: model.vendor,
							version: model.version,
							family,
							tooltip,
							multiplierNumeric: multiplier,
							pricing: !isUBB && multiplier !== undefined ? `${multiplier}x` : undefined,
							maxInputTokens: limits?.max_prompt_tokens ?? 0,
							maxOutputTokens: limits?.max_output_tokens ?? 0,
							maxContextWindowTokens: limits?.max_context_window_tokens,
							inputCost: pricing?.default.inputPrice,
							outputCost: pricing?.default.outputPrice,
							cacheCost: pricing?.default.cachePrice,
							cacheWriteCost: pricing?.default.cacheWritePrice,
							longContextInputCost: pricing?.longContext?.inputPrice,
							longContextOutputCost: pricing?.longContext?.outputPrice,
							longContextCacheCost: pricing?.longContext?.cachePrice,
							longContextCacheWriteCost: pricing?.longContext?.cacheWritePrice,
							priceCategory: model.model_picker_price_category,
							capabilities: {
								vision: model.capabilities?.supports?.vision ?? false,
								toolCalling: model.capabilities?.supports?.tool_calls ?? false,
							},
						},
					};
				});
				if (!models.find(m => m.id === DEFAULT_MODEL_ID)) {
					modelItems.unshift({
						id: DEFAULT_MODEL_ID,
						name: vscode.l10n.t('Auto'),
						description: vscode.l10n.t('Automatically select the best model'),
						tooltip: vscode.l10n.t('Automatically select the best model'),
						modelMetadata: {
							name: vscode.l10n.t('Auto'),
							id: DEFAULT_MODEL_ID,
							tooltip: vscode.l10n.t('Automatically select the best model'),
						},
					});
				}
				optionGroups.push({
					id: MODELS_OPTION_GROUP_ID,
					name: vscode.l10n.t('Model'),
					description: vscode.l10n.t('Select which model to use'),
					items: modelItems,
				});
			}

			const result: vscode.ChatSessionProviderOptions = { optionGroups };

			// Cache the full options result with TTL
			this._optionsCache.set(optionsCacheKey, result);

			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionProviderOptions: Returning options: ${JSON.stringify(optionGroups, undefined, 2)}`);
			return result;
		} catch (error) {
			this.logService.error(`[copilotCloudSessionsProvider#provideChatSessionProviderOptions] Error fetching options: ${error}`);
			return { optionGroups: [] };
		}
	}

	private async fetchSessionList(repoIds: GithubRepoId[] | undefined) {
		const sessions = (await this._backend.fetchSessionList(repoIds, vscode.workspace.isAgentSessionsWorkspace)).filter(session => session.automationId);
		const ownedTaskIds = this._ownership.getOwnedTaskIds();
		const isExternal = (taskId: string) => !ownedTaskIds.has(taskId);
		this._recentInternalActivityCutoff ??= { value: getRecentInternalActivityCutoff(sessions, isExternal) };
		const visible = filterCloudSessions(sessions, {
			mode: readExternalSessionsMode(this._configurationService.getNonExtensionConfig<unknown>(SHOW_EXTERNAL_SESSIONS_SETTING)),
			isExternal,
			recentInternalActivityCutoff: this._recentInternalActivityCutoff.value,
		}, this.logService);
		return { ...visible, isExternal };
	}

	async provideChatSessionItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionItem[]> {
		// Return cached items if available
		if (this.cachedSessionItems && Date.now() <= this.cachedSessionItemsExpiresAt) {
			return this.cachedSessionItems;
		}

		if (this.chatSessionItemsPromise) {
			return this.chatSessionItemsPromise;
		}
		const generation = ++this.sessionItemsRequestGeneration;
		const exactItemsToRefresh = new Map(this.explicitlyResolvedSessions);
		this.chatSessionItemsPromise = (async (): Promise<vscode.ChatSessionItem[]> => {
			const repoIds = await getRepoId(this._gitService);
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: repoIds=${JSON.stringify(repoIds?.map(r => ({ org: r.org, repo: r.repo, host: r.host })))}, isAgentSessionsWorkspace=${vscode.workspace.isAgentSessionsWorkspace}`);
			const canDiscover = vscode.workspace.isAgentSessionsWorkspace || this.isGitHubRepoOrEmpty(repoIds);
			const { sessions: sessionList, expiresAt, isExternal } = canDiscover
				? await this.fetchSessionList(repoIds)
				: { sessions: [], expiresAt: Infinity, isExternal: (taskId: string) => !this._ownership.getOwnedTaskIds().has(taskId) };
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: fetched ${sessionList.length} grouped sessions`);
			const sessionItems = await Promise.all(sessionList.map(entry => this.toChatSessionItem(entry, repoIds, false, isExternal(entry.taskId))));
			const filteredSessions = sessionItems.filter((item): item is vscode.ChatSessionItem => item !== undefined);

			if (this.sessionItemsRequestGeneration !== generation) {
				return this.provideChatSessionItems(token);
			}
			const listed = new Set(filteredSessions.map(item => item.resource.toString()));
			for (const item of filteredSessions) {
				const taskId = SessionIdForTask.parseTaskId(item.resource);
				if (taskId && !this.unpublishedExactTasks.has(taskId) && this.explicitlyResolvedSessions.has(taskId)) {
					this.explicitlyResolvedSessions.set(taskId, item);
				}
			}
			const exactEntries = [...exactItemsToRefresh];
			const limiter = new Limiter<vscode.ChatSessionItem | null | undefined>(4);
			let refreshedItems: (vscode.ChatSessionItem | null | undefined)[];
			try {
				refreshedItems = await Promise.all(exactEntries.map(([taskId, previousItem]) => limiter.queue(async () => {
					if (this._store.isDisposed || this.sessionItemsRequestGeneration !== generation
						|| this.unpublishedExactTasks.has(taskId) || this.explicitlyResolvedSessions.get(taskId) !== previousItem
						|| listed.has(getCloudSessionResources(taskId, undefined).resource.toString())) {
						return undefined;
					}
					try {
						const entry = await this._backend.fetchSession(taskId);
						if (this._store.isDisposed || this.sessionItemsRequestGeneration !== generation) {
							return undefined;
						}
						return await this.toChatSessionItem(entry, repoIds, true, isExternal(taskId));
					} catch (error) {
						if (this._store.isDisposed || this.sessionItemsRequestGeneration !== generation) {
							return undefined;
						}
						if (error instanceof TaskApiError && error.status === 404) {
							this.logService.trace(`Explicitly resolved cloud task ${taskId} is no longer available.`);
							return null;
						}
						this.logService.warn(`Failed to refresh explicitly resolved cloud task ${taskId}; retaining its last known item: ${error}`);
						return undefined;
					}
				})));
			} finally {
				limiter.dispose();
			}
			if (this.sessionItemsRequestGeneration !== generation) {
				return this.provideChatSessionItems(token);
			}
			for (let i = 0; i < exactEntries.length; i++) {
				const [taskId, previousItem] = exactEntries[i];
				if (this.explicitlyResolvedSessions.get(taskId) !== previousItem) {
					continue;
				}
				const item = refreshedItems[i];
				if (item === null) {
					this.explicitlyResolvedSessions.delete(taskId);
				} else if (item) {
					this.explicitlyResolvedSessions.set(taskId, item);
				}
			}
			for (let i = 0; i < filteredSessions.length; i++) {
				const taskId = SessionIdForTask.parseTaskId(filteredSessions[i].resource);
				if (taskId && this.unpublishedExactTasks.has(taskId)) {
					filteredSessions[i] = this.explicitlyResolvedSessions.get(taskId) ?? filteredSessions[i];
				}
			}
			const discoveredTaskIds = new Set(filteredSessions.map(item => SessionIdForTask.parseTaskId(item.resource)).filter((id): id is string => id !== undefined));
			for (const item of this.explicitlyResolvedSessions.values()) {
				if (!listed.has(item.resource.toString())) {
					filteredSessions.push(item);
				}
			}
			vscode.commands.executeCommand('setContext', 'github.copilot.chat.cloudSessionsEmpty', filteredSessions.length === 0);
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: returning ${filteredSessions.length} sessions (${sessionItems.length - listed.size} filtered out, ${filteredSessions.length - listed.size} explicitly resolved)`);

			// Cache the results
			this.cachedSessionsSize = sessionList.length;
			this.cachedSessionItems = filteredSessions;
			this.cachedDiscoveredTaskIds = discoveredTaskIds;
			this.unpublishedExactTasks.clear();
			this.cachedSessionItemsExpiresAt = expiresAt;
			this.scheduleCachedSessionItemsExpiry();

			return filteredSessions;
		})().finally(() => {
			if (this.sessionItemsRequestGeneration === generation) {
				this.chatSessionItemsPromise = undefined;
			}
		});
		return this.chatSessionItemsPromise;
	}

	private async toChatSessionItem(entry: CloudSessionData, repoIds: GithubRepoId[] | undefined, explicit = false, external = false): Promise<vscode.ChatSessionItem | undefined> {
		if (!entry.automationId) {
			return undefined;
		}
		const pr = entry.pullArtifact
			? await resolvePullArtifact(this._octoKitService, this.logService, entry.pullArtifact, entry.repo, undefined, this.telemetry)
			: undefined;
		if (!explicit && pr && (pr.state.toUpperCase() === 'CLOSED' || pr.state.toUpperCase() === 'MERGED')) {
			return undefined;
		}
		const createdAt = Date.parse(entry.createdAt);
		const completedAt = entry.completedAt === undefined ? NaN : Date.parse(entry.completedAt);
		const changes = pr
			? (await this._prFileChangesService.getFileChangesMultiDiffPart(pr))?.value?.map(change => new vscode.ChatSessionChangedFile(
				change.goToFileUri!, change.originalUri, change.modifiedUri, change.added ?? 0, change.removed ?? 0))
			: entry.diffRefs ? await this._prFileChangesService.getComparisonChangedFiles(entry.diffRefs) : undefined;
		const metadata = {
			...getCloudSessionItemMetadata(entry.repo, entry.diffRefs, pr),
			event_type: entry.eventType || this._ownership.getApplication(entry.taskId) || (external ? 'github/autopilot' : 'vscode'),
			...(entry.application ? { application: entry.application } : {}),
			...(entry.automationId ? { isAutomation: true } : {}),
			...(external ? { external: true } : {}),
		};
		return {
			...getCloudSessionResources(entry.taskId, pr?.number),
			label: pr?.title || entry.title || entry.taskId,
			status: taskStateToChatSessionStatus(entry.state),
			...(pr ? { badge: this.getPullRequestBadge(repoIds, pr), tooltip: this.createPullRequestTooltip(pr) } : {}),
			...(changes?.length ? { changes } : {}),
			metadata,
			...(Number.isFinite(createdAt) && createdAt > 0 ? {
				timing: { created: createdAt, startTime: createdAt, endTime: Number.isFinite(completedAt) && completedAt > 0 ? completedAt : undefined },
			} : {}),
		};
	}

	private isGitHubRepoOrEmpty(repoIds: GithubRepoId[] | undefined) {
		const hasOpenedFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
		if (!hasOpenedFolder) {
			return true;
		}
		const hasGitHubRepo = repoIds && repoIds.length > 0;
		return hasGitHubRepo;
	}

	async provideChatSessionContent(resource: Uri, _token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		this._activeToolbarTaskId = undefined;
		this.setCanCreatePullRequestContext(false);
		this.setCanOpenPullRequestContext(false);

		const taskId = SessionIdForTask.parseTaskId(resource);
		if (!taskId) {
			this.logService.error(`Invalid cloud task resource: ${resource}`);
			return this.createEmptySession(resource);
		}
		return this.provideTaskChatSessionContent(resource, taskId);
	}

	/** Render one task as a thread of turns from `task.sessions[]`. */
	private async provideTaskChatSessionContent(resource: Uri, taskId: string): Promise<vscode.ChatSession> {
		const backend = this._backend;
		const taskContent = await backend.fetchTaskContent(taskId);
		if (!taskContent) {
			this.logService.error(`Task not found for ID: ${taskId}`);
			return this.createEmptySession(resource);
		}
		if (!('automation_id' in taskContent.task) || typeof taskContent.task.automation_id !== 'string' || !taskContent.task.automation_id) {
			throw new Error(l10n.t('This provider only supports cloud automation runs.'));
		}

		const events = await backend.fetchTaskEvents(taskId);

		// Best-effort PR decoration for the header card.
		let pullRequest: PullRequestSearchItem | undefined;
		if (taskContent.pullArtifact) {
			pullRequest = await resolvePullArtifact(this._octoKitService, this.logService, taskContent.pullArtifact, parseRepoFromTaskUrl(taskContent.task.html_url), [...(taskContent.task.sessions || [])], this.telemetry);
		}

		const builder = new ChatSessionContentBuilder(CopilotCloudSessionsProvider.TYPE, this._gitService, this.logService);
		const history = await builder.buildTaskHistory(
			taskContent.task,
			events,
			pullRequest,
			Promise.resolve([]),
		);

		const latestTurn = taskContent.task.sessions?.[taskContent.task.sessions.length - 1];
		// Mark this task as the one driving the chat-input pull-request toolbar gates, then apply
		// them from its current state. Kept in sync as the task changes via
		// updatePullRequestToolbarContext (active-response settle, follow-up, PR creation).
		this._activeToolbarTaskId = taskId;
		this.setPullRequestToolbarContext(taskContent);
		// Only stream a live response when the task itself is still running. A terminally-failed
		// task (e.g. "Failed to launch agent") can leave its latest turn's session state stuck at
		// `in_progress`/`queued`; without the task-level guard the streamer would poll forever and
		// the view would show a perpetual "Session is in progress…" spinner.
		const activeResponseCallback = isActiveTaskState(taskContent.task.state)
			&& latestTurn && (latestTurn.state === 'in_progress' || latestTurn.state === 'queued')
			? this._createTaskStreamCallback(taskId, { mode: 'current', seedEventIds: new Set(events.map(e => e.id)) })
			: undefined;

		return {
			history,
			options: {},
			activeResponseCallback,
			requestHandler: undefined,
		};
	}

	/**
	 * Build the `activeResponseCallback` / follow-up streaming closure used to drive a
	 * {@link TaskTurnStreamer}. Centralised so both call sites share lifecycle behaviour
	 * (notably the `refresh()` after the turn settles, which repaints history with the
	 * canonical event ordering and updates the sessions list).
	 */
	private _createTaskStreamCallback(taskId: string, baseline: StreamBaseline): (stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => Thenable<void> {
		return async (stream, token) => {
			const backend = this._backend;
			this._activeTaskStreams.add(taskId);
			try {
				const streamer = new TaskTurnStreamer(backend, new ChatSessionContentBuilder(CopilotCloudSessionsProvider.TYPE, this._gitService, this.logService), this.logService);
				await streamer.stream(stream, taskId, baseline, token);
			} finally {
				this._activeTaskStreams.delete(taskId);
				this.refresh();
				// The turn settled: re-apply the toolbar gates so "Create pull request" appears for a
				// now-settled PR-less task (or flips to "Open pull request") without a session switch.
				await this.updatePullRequestToolbarContext(taskId);
			}
		};
	}

	async openSessionInBrowser(chatSessionItem: vscode.ChatSessionItem): Promise<void> {
		const taskId = SessionIdForTask.parseTaskId(chatSessionItem.resource);
		if (!taskId) {
			vscode.window.showErrorMessage(vscode.l10n.t('Invalid cloud task resource: {0}', '' + chatSessionItem.resource));
			this.logService.error(`Invalid cloud task resource: ${chatSessionItem.resource}`);
			return;
		}

		const taskContent = await this._backend.fetchTaskContent(taskId);
		const url = taskContent?.task.html_url;
		if (!url) {
			vscode.window.showErrorMessage(vscode.l10n.t('Could not find task {0}', taskId));
			this.logService.error(`Could not find task ${taskId}`);
			return;
		}
		await vscode.env.openExternal(vscode.Uri.parse(url));
	}

	private async resolvePullRequestNumber(sessionItemOrResource: vscode.ChatSessionItem | vscode.Uri | number | undefined): Promise<number | undefined> {
		if (typeof sessionItemOrResource === 'number') {
			return sessionItemOrResource;
		}
		const sessionItem = sessionItemOrResource instanceof vscode.Uri ? undefined : sessionItemOrResource;
		const pullRequestUrl = sessionItem?.metadata?.pullRequestUrl;
		if (typeof pullRequestUrl === 'string') {
			const match = /\/pull\/(?<number>\d+)/.exec(pullRequestUrl);
			if (match?.groups?.number) {
				return Number(match.groups.number);
			}
		}

		const resource = sessionItemOrResource instanceof vscode.Uri ? sessionItemOrResource : sessionItem?.resource;
		const taskId = resource ? SessionIdForTask.parseTaskId(resource) : undefined;
		if (!taskId) {
			return undefined;
		}
		const taskContent = await this._backend.fetchTaskContent(taskId);
		if (!taskContent?.pullArtifact) {
			return undefined;
		}
		const pullRequest = await resolvePullArtifact(this._octoKitService, this.logService, taskContent.pullArtifact, parseRepoFromTaskUrl(taskContent.task.html_url), [...(taskContent.task.sessions || [])], this.telemetry);
		return pullRequest?.number;
	}

	private isUntitledChatSession(context: vscode.ChatContext): boolean {
		const resource = context.chatSessionContext?.chatSessionItem?.resource;
		if (!resource) {
			return false;
		}
		return isUntitledSessionId(resource.path.slice(1));
	}

	private createEmptySession(_resource: Uri): vscode.ChatSession {
		return {
			history: [],
			requestHandler: undefined
		};
	}

	private getPullRequestBadge(repoIds: GithubRepoId[] | undefined, pr: PullRequestSearchItem): vscode.MarkdownString | undefined {
		if (
			vscode.workspace.workspaceFolders === undefined || // empty window
			vscode.workspace.isAgentSessionsWorkspace ||       // agent sessions workspace
			(repoIds && repoIds.length > 1)                    // multiple repositories
		) {
			const badgeLabel = `${pr.repository.owner.login}/${pr.repository.name}`;
			const badge = new vscode.MarkdownString(`$(repo) ${badgeLabel}`, true);
			badge.supportThemeIcons = true;
			return badge;
		}

		return undefined;
	}

	private createPullRequestTooltip(pr: PullRequestSearchItem): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(undefined, true);
		markdown.supportHtml = true;

		// Repository and date
		const date = new Date(pr.createdAt);
		const ownerName = `${pr.repository.owner.login}/${pr.repository.name}`;
		// Derive repo URL from the PR URL to support both github.com and GHE
		const repoUrl = pr.url.replace(/\/pull\/\d+$/, '');
		markdown.appendMarkdown(
			`[${ownerName}](${repoUrl}) on ${date.toLocaleString('default', {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
			})}  \n`
		);

		// Icon, title, and PR number
		const icon = this.getIconMarkdown(pr);
		// Strip markdown from title for plain text display
		const title = this.plainTextRenderer.render(pr.title);
		markdown.appendMarkdown(
			`${icon} **${title}** [#${pr.number}](${pr.url})  \n`
		);

		// Body/Description (truncated if too long)
		markdown.appendMarkdown('  \n');
		const maxBodyLength = 200;
		let body = this.plainTextRenderer.render(pr.body || '');
		// Convert plain text newlines to markdown line breaks (two spaces + newline)
		body = body.replace(/\n/g, '  \n');
		body = body.length > maxBodyLength ? body.substring(0, maxBodyLength) + '...' : body;
		markdown.appendMarkdown(body + '  \n');

		return markdown;
	}

	private getIconMarkdown(pr: PullRequestSearchItem): string {
		const state = pr.state.toUpperCase();
		return state === 'MERGED' ? '$(git-merge)' : '$(git-pull-request)';
	}

	/**
	 * Handle a click on the chat input "Create pull request" toolbar action (contributed to
	 * `chat/input/editing/sessionToolbar` and registered as
	 * {@link CREATE_PULL_REQUEST_FOR_TASK_COMMAND_ID}). The toolbar passes the session resource
	 * as the first argument, from which we resolve the task id. Shows a "Creating pull request"
	 * progress notification while the Task API's `create-pr` endpoint runs and the PR is reflected
	 * on the task; on success it shows no further message and instead flips the toolbar action to
	 * "Open pull request" (which opens the PR in the browser) by updating the context keys in place.
	 * The session list refreshes in place after the pull request is reflected on the task.
	 */
	private async handleCreatePullRequestForTaskCommand(sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri): Promise<void> {
		const backend = this._backend;
		const resource = sessionItemOrResource instanceof vscode.Uri ? sessionItemOrResource : sessionItemOrResource?.resource;
		const taskId = resource ? SessionIdForTask.parse(resource)?.taskId : undefined;
		if (!taskId) {
			this.logService.error('[handleCreatePullRequestForTaskCommand] Could not resolve task id from the session resource.');
			return;
		}

		// Re-entrancy guard: ignore repeat invocations while a create-PR request for this task is
		// still in flight (e.g. the toolbar action triggered again before the first call settled)
		// so we don't submit duplicate PRs. Hide the toolbar action immediately; it is restored on
		// failure below, and on success it is replaced by the "Open pull request" action.
		if (this._createPullRequestInFlightTaskIds.has(taskId)) {
			return;
		}
		this._createPullRequestInFlightTaskIds.add(taskId);
		this.setCanCreatePullRequestContext(false);

		try {
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Creating pull request') },
				async () => {
					// The backend creates the PR for the full task, resolving `{owner, repo}` itself
					// (from the task's `html_url`, falling back to a GitHub lookup by `repository.id`).
					const taskContent = await backend.fetchTaskContent(taskId);
					if (!taskContent) {
						throw new Error(vscode.l10n.t('Unable to load the task to create a pull request.'));
					}
					const result = await backend.createPullRequestForTask(taskContent.task);
					/* __GDPR__
						"copilotcloud.chat.createPRFromTask" : {
							"owner": "osortega",
							"comment": "Event sent when the user invokes the 'Create pull request' toolbar action on a settled cloud task without a pull request.",
							"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the create-pull-request call succeeded or failed." }
						}
					*/
					this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.createPRFromTask', {
						outcome: !!result ? 'success' : 'failure'
					});
					// Wait until the new PR is reflected on the task as a `pull` artifact so the gate
					// update below sees `hasPullRequest` and flips to the "Open pull request" action.
					await this._waitForTaskPullRequestReflected(backend, taskId);
				},
			);
		} catch (error) {
			this.logService.error(`[handleCreatePullRequestForTaskCommand] Failed to create PR for task ${taskId}: ${error}`);
			this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.createPRFromTask', {
				outcome: 'failure'
			});
			vscode.window.showErrorMessage(vscode.l10n.t('Failed to create pull request: {0}', error instanceof Error ? error.message : String(error)));
			// The task is still settled and PR-less, so re-enable the toolbar action for a retry
			// (only when it still drives the toolbar — the user may have navigated away).
			if (this._activeToolbarTaskId === taskId) {
				this.setCanCreatePullRequestContext(true);
			}
			return;
		} finally {
			this._createPullRequestInFlightTaskIds.delete(taskId);
		}
		this.refresh();
		await this.updatePullRequestToolbarContext(taskId);
	}

	/**
	 * After `create-pr` is acknowledged, GitHub may take a moment to associate the pull request
	 * with the task. Poll the task until its `pull` artifact appears so the subsequent
	 * {@link refresh} resolves the PR and computes its file-change diff in the same paint. Bounded;
	 * resolves once the artifact is reflected or the attempts are exhausted (the refresh happens
	 * either way — the task still surfaces its compare-based changes in the meantime).
	 */
	private async _waitForTaskPullRequestReflected(backend: CloudAgentBackend, taskId: string): Promise<void> {
		const maxAttempts = 10;
		const pollIntervalMs = 1500;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (attempt > 0) {
				await timeout(pollIntervalMs);
			}
			const taskContent = await backend.fetchTaskContent(taskId);
			if (taskContent?.pullArtifact) {
				return;
			}
		}
		this.logService.warn(`[handleCreatePullRequestForTaskCommand] Pull request for task ${taskId} not reflected after ${maxAttempts} attempts; continuing without it.`);
	}

	/**
	 * Toggle the {@link CAN_CREATE_PULL_REQUEST_CONTEXT_KEY} context key that gates the
	 * chat-input "Create pull request" toolbar action.
	 */
	private setCanCreatePullRequestContext(canCreate: boolean): void {
		void vscode.commands.executeCommand('setContext', CAN_CREATE_PULL_REQUEST_CONTEXT_KEY, canCreate);
	}

	/**
	 * Toggle the {@link CAN_OPEN_PULL_REQUEST_CONTEXT_KEY} context key that gates the chat-input
	 * "Open pull request" toolbar action (shown once the task has a PR; opens it in the browser).
	 */
	private setCanOpenPullRequestContext(canOpen: boolean): void {
		void vscode.commands.executeCommand('setContext', CAN_OPEN_PULL_REQUEST_CONTEXT_KEY, canOpen);
	}

	/**
	 * Apply the chat-input pull-request toolbar gates from a task-content snapshot. "Create pull
	 * request" shows only for a settled task with no PR and no create request in flight; "Open pull
	 * request" shows once the task has a PR. The two are mutually exclusive.
	 */
	private setPullRequestToolbarContext(taskContent: TaskContent): void {
		const sessions = taskContent.task.sessions;
		const latestTurn = sessions?.[sessions.length - 1];
		const isSettled = !!latestTurn?.state && latestTurn.state !== 'in_progress' && latestTurn.state !== 'queued';
		const hasPullRequest = !!taskContent.pullArtifact;
		const isCreatingPr = !!taskContent.task.id && this._createPullRequestInFlightTaskIds.has(taskContent.task.id);
		this.setCanCreatePullRequestContext(isSettled && !hasPullRequest && !isCreatingPr);
		this.setCanOpenPullRequestContext(hasPullRequest);
	}

	/**
	 * Re-evaluate the toolbar gates for a task whose state may have changed (a turn settled, a PR
	 * was created) by re-fetching its content. No-op unless the task still drives the toolbar (the
	 * user hasn't navigated away), so stale updates can't clobber another session's gates.
	 */
	private async updatePullRequestToolbarContext(taskId: string): Promise<void> {
		if (this._activeToolbarTaskId !== taskId) {
			return;
		}
		const backend = this._backend;
		const taskContent = await backend.fetchTaskContent(taskId);
		if (!taskContent || this._activeToolbarTaskId !== taskId) {
			return;
		}
		this.setPullRequestToolbarContext(taskContent);
	}

	/**
	 * Resolve the task id backing a session resource.
	 */
	private resolveTaskIdFromSessionResource(resource: vscode.Uri | undefined): string | undefined {
		if (!resource) {
			return undefined;
		}
		return SessionIdForTask.parseTaskId(resource);
	}

	/**
	 * Handle a click on the chat input "Open pull request" toolbar action (contributed to
	 * `chat/input/editing/sessionToolbar` and registered as
	 * {@link OPEN_PULL_REQUEST_FOR_TASK_COMMAND_ID}). Resolves the task's pull request and opens it
	 * in the default browser, falling back to the task page when the PR isn't resolvable yet.
	 */
	private async handleOpenPullRequestForTaskCommand(sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri): Promise<void> {
		const backend = this._backend;
		const resource = sessionItemOrResource instanceof vscode.Uri ? sessionItemOrResource : sessionItemOrResource?.resource;
		const taskId = this.resolveTaskIdFromSessionResource(resource) ?? this._activeToolbarTaskId;
		if (!taskId) {
			this.logService.error('[handleOpenPullRequestForTaskCommand] Could not resolve task id from the session resource.');
			return;
		}
		const taskContent = await backend.fetchTaskContent(taskId);
		if (!taskContent) {
			vscode.window.showErrorMessage(vscode.l10n.t('Unable to load the task to open its pull request.'));
			return;
		}
		let url = taskContent.task.html_url;
		if (taskContent.pullArtifact) {
			const pr = await resolvePullArtifact(this._octoKitService, this.logService, taskContent.pullArtifact, parseRepoFromTaskUrl(taskContent.task.html_url), [...(taskContent.task.sessions || [])], this.telemetry);
			url = pr?.url ?? url;
		}
		if (!url) {
			vscode.window.showErrorMessage(vscode.l10n.t('Could not determine the pull request URL for this task.'));
			return;
		}
		await vscode.env.openExternal(vscode.Uri.parse(url));
	}

	private async chatParticipantImpl(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
		if (token.isCancellationRequested) {
			stream.warning(vscode.l10n.t('Cloud session cancelled.'));
			return {};
		}

		if (!context.chatSessionContext || this.isUntitledChatSession(context) || request.sessionResource.scheme !== CopilotCloudSessionsProvider.TYPE) {
			return { errorDetails: { message: l10n.t('Start a new Cloud session to use a cloud sandbox. This provider only supports existing automation runs.') } };
		}

		/* __GDPR__
			"copilotcloud.chat.invoke" : {
				"owner": "joshspicer",
				"comment": "Event sent when a Copilot Cloud chat request is made.",
				"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The unique chat request ID." },
				"hasChatSessionItem": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Invoked with a chat session item." },
				"isUntitled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Indicates if the chat session is untitled." },
				"partnerAgent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The partner agent name (e.g., Copilot, Claude, Codex)." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The selected model ID." }
			}
		*/
		this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.invoke', {
			chatRequestId: request.id,
			hasChatSessionItem: String(!!context.chatSessionContext?.chatSessionItem),
			isUntitled: String(context.chatSessionContext?.isUntitled),
			partnerAgent: 'unknown',
			model: 'unknown',
		});
		GenAiMetrics.incrementCloudSessionCount(this._otelService, 'unknown');
		emitCloudSessionInvokeEvent(this._otelService, 'unknown', 'unknown', request.id);
		return this.handleFollowUp(request, context, stream, token);
	}

	private async handleTaskFollowUp(taskId: string, prompt: string, stream: vscode.ChatResponseStream, token: vscode.CancellationToken, context: vscode.ChatContext): Promise<vscode.ChatResult> {
		const backend = this._backend;
		// Sending a message adopts an external task. It stays adopted even if the message fails.
		if (await this.recordTaskFromVSCode(taskId)) {
			this.refresh();
		}
		// Active stream present: only POST the steer; that stream renders the injection (no second streamer).
		if (this._activeTaskStreams.has(taskId)) {
			stream.progress(vscode.l10n.t('Steering'));
			const steerResult = await backend.sendFollowUpToTask(taskId, prompt);
			if (!steerResult) {
				return { errorDetails: { message: vscode.l10n.t('Failed to send follow-up to the task.') } };
			}
			return {};
		}

		// Snapshot prior turn count + event ids BEFORE steering so the streamer can
		// (a) wait for the new turn to actually appear in `task.sessions[]` and
		// (b) skip the events already rendered as history.
		const [before, priorEvents] = await Promise.all([
			backend.fetchTaskContent(taskId),
			backend.fetchTaskEvents(taskId).catch(e => {
				this.logService.warn(`[handleTaskFollowUp] fetchTaskEvents failed for ${taskId}: ${e}`);
				return [] as readonly AgentTaskSessionEvent[];
			}),
		]);
		if (!before) {
			return { errorDetails: { message: vscode.l10n.t('Could not find the task for this chat session.') } };
		}
		const priorTurnCount = before.task.sessions?.length ?? 0;
		const seedEventIds = new Set(priorEvents.map(e => e.id));
		// A steer into a genuinely active turn injects into the current turn (no new `task.sessions[]`
		// row), so render `mode:'current'`; `mode:'next'` would time out. Require both the task and its
		// latest turn to be active so a terminal task with a stale `in_progress` latest turn isn't misread.
		const latestBefore = before.task.sessions?.[before.task.sessions.length - 1];
		const isMidTurnSteer = isActiveTaskState(before.task.state) && !!latestBefore && isActiveTaskState(latestBefore.state);

		stream.progress(vscode.l10n.t('Delegating'));
		const result = await backend.sendFollowUpToTask(taskId, prompt);
		if (!result) {
			return { errorDetails: { message: vscode.l10n.t('Failed to send follow-up to the task.') } };
		}

		// Stay yield-aware (mirrors the CLI provider): steering must cancel only this local streamer,
		// so the chat service can flush the next steer while the remote turn keeps running server-side.
		const yieldCts = new vscode.CancellationTokenSource();
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => yieldCts.dispose()));
		disposables.add(token.onCancellationRequested(() => yieldCts.cancel()));
		const interval = disposables.add(new IntervalTimer());
		interval.cancelAndSet(() => {
			if (context.yieldRequested) {
				yieldCts.cancel();
			}
		}, 100);
		try {
			const baseline: StreamBaseline = isMidTurnSteer
				? { mode: 'current', seedEventIds }
				: { mode: 'next', seedEventIds, priorTurnCount };
			await this._createTaskStreamCallback(taskId, baseline)(stream, yieldCts.token);
		} finally {
			disposables.dispose();
		}
		return {};
	}

	private async handleFollowUp(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
		if (!context.chatSessionContext || this.isUntitledChatSession(context)) {
			return {};
		}
		const { prompt } = request;
		if (!prompt || prompt.trim().length === 0) {
			return { errorDetails: { message: vscode.l10n.t('Please provide a message for the cloud agent.') } };
		}

		stream.progress(vscode.l10n.t('Preparing'));
		const resource = context.chatSessionContext.chatSessionItem.resource;
		const taskId = SessionIdForTask.parseTaskId(resource);
		if (!taskId) {
			this.logService.error(`Invalid cloud task resource: ${resource}`);
			return { errorDetails: { message: vscode.l10n.t('Could not resolve the task for this chat session.') } };
		}
		const session = await this._backend.fetchSession(taskId);
		if (!session.automationId) {
			return { errorDetails: { message: l10n.t('This provider only supports cloud automation runs.') } };
		}
		return this.handleTaskFollowUp(taskId, prompt, stream, token, context);
	}

	/**
	 * Records a task started or messaged from VS Code so that it is not external. Returns whether
	 * the task was external before. Failing to record must not fail the request.
	 */
	private async recordTaskFromVSCode(taskId: string): Promise<boolean> {
		try {
			const item = this.cachedSessionItems?.find(item => SessionIdForTask.parseTaskId(item.resource) === taskId);
			const application = typeof item?.metadata?.event_type === 'string' ? item.metadata.event_type
					: this._ownership.getOwnedTaskIds().has(taskId) ? 'vscode' : 'github/autopilot';
			return await this._ownership.record(taskId, Date.now(), application);
		} catch (e) {
			this.logService.warn(`Failed to record cloud task ${taskId} as started from VS Code: ${e}`);
			return false;
		}
	}
}
