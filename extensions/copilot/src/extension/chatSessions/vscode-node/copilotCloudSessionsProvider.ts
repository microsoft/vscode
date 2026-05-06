/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RemoteAgentJobPayload } from '@vscode/copilot-api';
import * as pathLib from 'path';
import * as vscode from 'vscode';
import { l10n, Uri } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { GithubRepoId, IGitService } from '../../../platform/git/common/gitService';
import { derivePullRequestState, PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { AuthOptions, CCAEnabledResult, IGithubRepositoryService, IOctoKitService, JobInfo, RemoteAgentJobResponse } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { emitCloudSessionInvokeEvent } from '../../../platform/otel/common/genAiEvents';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { DeferredPromise, retry, RunOnceScheduler } from '../../../util/vs/base/common/async';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { joinPath } from '../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { SingleSlotTtlCache, TtlCache } from '../common/ttlCache';
import { isUntitledSessionId } from '../common/utils';
import { IChatDelegationSummaryService } from '../copilotcli/common/delegationSummaryService';
import { body_suffix, CONTINUE_TRUNCATION, extractTitle, formatBodyPlaceholder, getAuthorDisplayName, getRepoId, JOBS_API_VERSION, SessionIdForPr, toOpenPullRequestWebviewUri, truncatePrompt } from '../vscode/copilotCodingAgentUtils';
import { CopilotCloudGitOperationsManager } from './copilotCloudGitOperationsManager';
import { ChatSessionContentBuilder, SessionResponseLogChunk } from './copilotCloudSessionContentBuilder';
import { IPullRequestFileChangesService } from './pullRequestFileChangesService';
import MarkdownIt = require('markdown-it');

const CLOUD_SESSIONS_AUTH_OPTIONS: AuthOptions = { createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } };

interface ConfirmationMetadata {
	prompt: string;
	references?: readonly vscode.ChatPromptReference[];
	chatContext: vscode.ChatContext;
}

type InitialSessionOption = {
	readonly optionId: string;
	readonly value: string | vscode.ChatSessionProviderOptionItem;
};

function validateMetadata(metadata: unknown): asserts metadata is ConfirmationMetadata {
	if (typeof metadata !== 'object') {
		throw new Error('Invalid confirmation metadata: not an object.');
	}
	if (metadata === null) {
		throw new Error('Invalid confirmation metadata: null value.');
	}
	if (typeof (metadata as ConfirmationMetadata).prompt !== 'string') {
		throw new Error('Invalid confirmation metadata: missing or invalid prompt.');
	}
	if (typeof (metadata as ConfirmationMetadata).chatContext !== 'object' || (metadata as ConfirmationMetadata).chatContext === null) {
		throw new Error('Invalid confirmation metadata: missing or invalid chatContext.');
	}
}

function describeRuntimeValue(value: unknown): string {
	if (Array.isArray(value)) {
		return `array(length=${value.length})`;
	}

	if (value === null) {
		return 'null';
	}

	if (value === undefined) {
		return 'undefined';
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		return `object(keys=${keys.slice(0, 5).join(',')}${keys.length > 5 ? ',…' : ''})`;
	}

	return typeof value;
}

function isOptionItemValue(value: unknown): value is vscode.ChatSessionProviderOptionItem {
	return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

function isInitialSessionOption(value: unknown): value is InitialSessionOption {
	if (typeof value !== 'object' || value === null || !('optionId' in value) || typeof value.optionId !== 'string' || !('value' in value)) {
		return false;
	}

	return typeof value.value === 'string' || isOptionItemValue(value.value);
}

export function normalizeInitialSessionOptions(initialOptions: unknown, logService?: ILogService, chatResource?: vscode.Uri): readonly InitialSessionOption[] {
	if (!initialOptions) {
		return [];
	}

	if (Array.isArray(initialOptions)) {
		const normalized = initialOptions.filter(isInitialSessionOption);
		if (logService && normalized.length !== initialOptions.length) {
			logService.warn(`[chatParticipantImpl] Ignoring ${initialOptions.length - normalized.length} malformed initialSessionOptions entries for ${chatResource?.toString() ?? 'unknown-resource'}. Received ${describeRuntimeValue(initialOptions)}.`);
		}

		return normalized;
	}

	if (typeof initialOptions === 'object') {
		const normalized: InitialSessionOption[] = [];
		for (const [optionId, value] of Object.entries(initialOptions)) {
			if (isInitialSessionOption(value)) {
				normalized.push(value);
			} else if (typeof value === 'string' || isOptionItemValue(value)) {
				normalized.push({ optionId, value });
			}
		}

		if (normalized.length > 0) {
			logService?.warn(`[chatParticipantImpl] Coerced object-shaped initialSessionOptions for ${chatResource?.toString() ?? 'unknown-resource'}. Received ${describeRuntimeValue(initialOptions)} and recovered ${normalized.length} entries.`);
			return normalized;
		}
	}

	logService?.warn(`[chatParticipantImpl] Ignoring unsupported initialSessionOptions for ${chatResource?.toString() ?? 'unknown-resource'}. Received ${describeRuntimeValue(initialOptions)}.`);
	return [];
}

export function parseSessionLogChunksSafely(rawText: string, logService: ILogService, parser: (value: string) => SessionResponseLogChunk[]): SessionResponseLogChunk[] {
	try {
		return parser(rawText);
	} catch (error) {
		logService.error(error instanceof Error ? error : new Error(String(error)), `[streamNewLogContent] Failed to parse streamed log content (${rawText.length} chars).`);
		return [];
	}
}

const CUSTOM_AGENTS_OPTION_GROUP_ID = 'customAgents';
const MODELS_OPTION_GROUP_ID = 'models';
const PARTNER_AGENTS_OPTION_GROUP_ID = 'partnerAgents';
const REPOSITORIES_OPTION_GROUP_ID = 'repositories';

const DEFAULT_CUSTOM_AGENT_ID = '___vscode_default___';
const DEFAULT_MODEL_ID = 'auto';
const DEFAULT_PARTNER_AGENT_ID = '___vscode_partner_agent_default___';
const DEFAULT_REPOSITORY_ID = '___vscode_repository_default___';

const ACTIVE_SESSION_POLL_INTERVAL_MS = 5 * 1000; // 5 seconds
const SEEN_DELEGATION_PROMPT_KEY = 'seenDelegationPromptBefore';
const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.chat.cloudSessions.openRepository';
const CLEAR_CACHES_COMMAND_ID = 'github.copilot.chat.cloudSessions.clearCaches';
const USER_SELECTED_REPOS_KEY = 'userSelectedRepositories';
const USER_SELECTED_REPOS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// TTL for caching /enabled responses when CCA is enabled
const CCA_ENABLED_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 minutes
// Shorter TTL for caching /enabled responses when CCA is disabled or undetermined,
// so users aren't stuck but we don't hammer the endpoint on every options query
const CCA_DISABLED_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
// Status codes that are expected/handled by isCCAEnabled; anything else is unexpected
const CCA_KNOWN_STATUS_CODES = new Set([401, 403, 422]);
// TTL for caching session provider options (custom agents, models, partner agents, etc.)
const OPTIONS_CACHE_TTL_MS = 15 * 60 * 1_000; // 15 minutes

interface UserSelectedRepository {
	name: string;
	timestamp: number;
}

// TODO: No API from GH yet.
const HARDCODED_PARTNER_AGENTS: { id: string; name: string; at?: string; assignableActorLogin?: string; codiconId?: string }[] = [
	{ id: DEFAULT_PARTNER_AGENT_ID, name: 'Copilot', assignableActorLogin: 'copilot-swe-agent', codiconId: 'copilot' },
	{ id: '2246796', name: 'Claude', at: 'claude[agent]', assignableActorLogin: 'anthropic-code-agent', codiconId: 'claude' },
	{ id: '2248422', name: 'Codex', at: 'codex[agent]', assignableActorLogin: 'openai-code-agent', codiconId: 'openai' }
];

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
	private readonly _onDidCommitChatSessionItem = this._register(new vscode.EventEmitter<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }>());
	public readonly onDidCommitChatSessionItem = this._onDidCommitChatSessionItem.event;
	private readonly _onDidChangeChatSessionProviderOptions = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChangeChatSessionProviderOptions = this._onDidChangeChatSessionProviderOptions.event;
	private readonly _onDidChangeChatSessionOptions = this._register(new vscode.EventEmitter<vscode.ChatSessionOptionChangeEvent>());
	public readonly onDidChangeChatSessionOptions = this._onDidChangeChatSessionOptions.event;
	private chatSessions: Map<number, PullRequestSearchItem> = new Map();
	private chatSessionItemsPromise: Promise<vscode.ChatSessionItem[]> | undefined;
	private readonly sessionCustomAgentMap = new ResourceMap<string>();
	private readonly sessionModelMap = new ResourceMap<string>();
	private readonly sessionPartnerAgentMap = new ResourceMap<string>();
	private readonly sessionRepositoryMap = new ResourceMap<string>();
	private readonly sessionReferencesMap = new ResourceMap<readonly vscode.ChatPromptReference[]>();
	public chatParticipant = vscode.chat.createChatParticipant(CopilotCloudSessionsProvider.TYPE, async (request, context, stream, token) => {
		await this.chatParticipantImpl(request, context, stream, token);
	});
	private cachedSessionsSize: number = 0;
	// Cache for provideChatSessionItems
	private cachedSessionItems: (vscode.ChatSessionItem & {
		fullDatabaseId: string;
		pullRequestDetails: PullRequestSearchItem;
	})[] | undefined;
	private activeSessionIds: Set<string> = new Set();
	private activeSessionPollingInterval: ReturnType<typeof setInterval> | undefined;
	private readonly plainTextRenderer = new PlainTextRenderer();
	private readonly gitOperationsManager = new CopilotCloudGitOperationsManager(this.logService, this._gitService, this._gitExtensionService);

	// TTL cache for CCA enabled status per repository (key: "owner/repo")
	// enabled=true cached for 30 min; disabled/undetermined cached for 5 min to reduce traffic
	private _ccaEnabledCache = new TtlCache<CCAEnabledResult>(CCA_ENABLED_CACHE_TTL_MS);

	// Single-slot TTL cache for the full session provider options result (custom agents, models, partner agents, etc.)
	// Caches the most recently computed options regardless of repo/workspace context
	private _optionsCache = new SingleSlotTtlCache<vscode.ChatSessionProviderOptions>(OPTIONS_CACHE_TTL_MS);

	// Title
	private TITLE = vscode.l10n.t('Delegate to cloud agent');

	// Buttons (used for matching, be careful changing!)
	private readonly AUTHORIZE = vscode.l10n.t('Authorize');
	private readonly COMMIT = vscode.l10n.t('Commit Changes');
	private readonly PUSH_BRANCH = vscode.l10n.t('Push Branch');
	private readonly DELEGATE = vscode.l10n.t('Delegate');
	private readonly CANCEL = vscode.l10n.t('Cancel');

	// Messages
	private readonly BASE_MESSAGE = vscode.l10n.t('Cloud agent works asynchronously to create a pull request with your requested changes. This chat\'s history will be summarized and appended to the pull request as context.');
	private readonly AUTHORIZE_MESSAGE = vscode.l10n.t('Cloud agent requires elevated GitHub access to proceed.');
	private readonly COMMIT_MESSAGE = vscode.l10n.t('This workspace has uncommitted changes. Should these changes be pushed and included in cloud agent\'s work?');
	private readonly PUSH_BRANCH_MESSAGE = (baseRef: string, defaultBranch: string) => vscode.l10n.t('Push your currently checked out branch `{0}`, or start from the default branch `{1}`?', baseRef, defaultBranch);

	// Workspace storage keys
	private readonly WORKSPACE_CONTEXT_PREFIX = 'copilot.cloudAgent';

	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@IGitService private readonly _gitService: IGitService,
		@ITelemetryService private readonly telemetry: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IPullRequestFileChangesService private readonly _prFileChangesService: IPullRequestFileChangesService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IGithubRepositoryService private readonly _githubRepositoryService: IGithubRepositoryService,
		@IChatDelegationSummaryService private readonly _chatDelegationSummaryService: IChatDelegationSummaryService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IDomainService private readonly _domainService: IDomainService,
		@IOTelService private readonly _otelService: IOTelService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
	) {
		super();
		this.registerCommands();

		// Refresh when CAPI URL changes (e.g., when GHE Copilot token arrives and updates the base URL)
		this._register(this._domainService.onDidChangeDomains(e => {
			if (e.capiUrlChanged) {
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
					const sessions = await Promise.all(repoIds.map(repoId => this._octoKitService.getAllSessions(`${repoId.org}/${repoId.repo}`, false, {})));
					hasHistoricalSessions = sessions.some(s => s.length > 0);
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
					let sessions = [];
					try {
						sessions = await Promise.all(repoIds.map(repoId => this._octoKitService.getAllSessions(`${repoId.org}/${repoId.repo}`, true, {})));
						sessions = sessions.flat();
						if (this.cachedSessionsSize !== sessions.length) {
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
			let pullRequestNumber: number | undefined;
			if (typeof sessionItemOrResource === 'number') {
				pullRequestNumber = sessionItemOrResource;
			} else {
				const resource = sessionItemOrResource instanceof vscode.Uri
					? sessionItemOrResource
					: sessionItemOrResource?.resource;
				if (!resource) {
					return;
				}
				pullRequestNumber = SessionIdForPr.parsePullRequestNumber(resource);
			}


			if (!pullRequestNumber) {
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

		// Command for browsing repositories in the repository picker
		const openRepositoryCommand = async (sessionItemResource?: vscode.Uri): Promise<string | undefined> => {
			const quickPick = vscode.window.createQuickPick();
			const quickPickDisposables = new DisposableStore();
			quickPick.placeholder = l10n.t('Search for a repository...');
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.busy = true;
			quickPick.show();

			// Load initial repositories
			try {
				const repos = await this.fetchAllRepositoriesFromGitHub();
				quickPick.items = repos.map(repo => ({ label: repo.name }));
			} catch (error) {
				this.logService.error(`Error fetching initial repositories: ${error}`);
			} finally {
				quickPick.busy = false;
			}

			// Handle dynamic search
			let searchTimeout: ReturnType<typeof setTimeout> | undefined;

			return new Promise<string | undefined>(resolve => {
				let resolved = false;
				const doResolve = (value: string | undefined) => {
					if (!resolved) {
						resolved = true;
						resolve(value);
					}
				};

				quickPickDisposables.add(quickPick.onDidChangeValue(async (value) => {
					if (searchTimeout) {
						clearTimeout(searchTimeout);
					}
					searchTimeout = setTimeout(async () => {
						quickPick.busy = true;
						try {
							const searchResults = await this.fetchAllRepositoriesFromGitHub(value);
							quickPick.items = searchResults.map(repo => ({ label: repo.name }));
						} finally {
							quickPick.busy = false;
						}
					}, 300);
				}));

				quickPickDisposables.add(quickPick.onDidAccept(() => {
					const selected = quickPick.selectedItems[0];
					if (selected && sessionItemResource) {
						this.sessionRepositoryMap.set(sessionItemResource, selected.label);
						// Save user-selected repo so it appears in the recent repos list
						this.saveUserSelectedRepository(selected.label);
						this._onDidChangeChatSessionOptions.fire({
							resource: sessionItemResource,
							updates: [{
								optionId: REPOSITORIES_OPTION_GROUP_ID,
								value: { id: selected.label, name: selected.label, icon: new vscode.ThemeIcon('repo') }
							}]
						});
					}
					doResolve(selected?.label);
					quickPick.hide();
				}));

				quickPickDisposables.add(quickPick.onDidHide(() => {
					if (searchTimeout) {
						clearTimeout(searchTimeout);
					}
					quickPickDisposables.dispose();
					quickPick.dispose();
					doResolve(undefined);
				}));
			});
		};
		this._register(vscode.commands.registerCommand(OPEN_REPOSITORY_COMMAND_ID, openRepositoryCommand));

		this._register(vscode.commands.registerCommand(CLEAR_CACHES_COMMAND_ID, () => {
			this.logService.debug('copilotCloudSessionsProvider#clearCaches: clearing all cloud agent caches');
			this.clearOptionsCaches();
			this.refresh();
			this._onDidChangeChatSessionProviderOptions.fire();
		}));
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
		this.cachedSessionItems = undefined;
		this.chatSessionItemsPromise = undefined;
		this.activeSessionIds.clear();
		this.stopActiveSessionPolling();
		// Note: _ccaEnabledCache and _optionsCache are TTL-based and NOT cleared on refresh.
		// Use clearOptionsCaches() to force-clear them (e.g. on auth change).
		this._onDidChangeChatSessionItems.fire();
	}

	/**
	 * Force-clears the TTL-based caches for /enabled and session provider options.
	 * Use for auth changes or explicit user-initiated refresh where stale data is unacceptable.
	 */
	private clearOptionsCaches(): void {
		this._ccaEnabledCache.clear();
		this._optionsCache.clear();
	}

	/**
	 * Checks if the Copilot cloud agent is enabled for a repository.
	 * Results are cached with a TTL: enabled=true results are cached for {@link CCA_ENABLED_CACHE_TTL_MS},
	 * while disabled/undetermined results are cached for a shorter {@link CCA_DISABLED_CACHE_TTL_MS}
	 * to balance responsiveness with reducing endpoint traffic.
	 * @param owner Repository owner
	 * @param repo Repository name
	 * @returns CCAEnabledResult with enabled status and optional status code
	 */
	private async checkCCAEnabled(owner: string, repo: string): Promise<CCAEnabledResult> {
		const cacheKey = `${owner}/${repo}`;

		const cached = this._ccaEnabledCache.get(cacheKey);
		if (cached !== undefined) {
			this.logService.trace(`copilotCloudSessionsProvider#checkCCAEnabled: using cached CCA enabled status for ${owner}/${repo}: ${cached.enabled}`);
			return cached;
		}

		const result = await this._octoKitService.isCCAEnabled(owner, repo, {});

		// Cache all results: enabled=true uses the default 30 min TTL,
		// disabled/undetermined uses a shorter 5 min TTL so users who just
		// enabled CCA aren't stuck for too long
		if (result.enabled === true) {
			this._ccaEnabledCache.set(cacheKey, result);
		} else {
			this._ccaEnabledCache.set(cacheKey, result, CCA_DISABLED_CACHE_TTL_MS);
		}

		this.telemetry.sendTelemetryEvent('copilot.codingAgent.CCAIsEnabledCheck', { microsoft: true, github: false }, {
			enabled: String(result.enabled),
			statusCode: String(result.statusCode ?? 'none'),
			cacheHit: 'false',
		});

		// Track unexpected status codes (429 rate-limit, 5xx, etc.) as errors so they surface in dashboards
		if (result.statusCode !== undefined && !CCA_KNOWN_STATUS_CODES.has(result.statusCode)) {
			/* __GDPR__
				"copilot.codingAgent.CCAIsEnabledUnexpectedStatus" : {
					"owner": "joshspicer",
					"comment": "Fired when the /enabled endpoint returns an unexpected HTTP status code (e.g. 429 rate-limit or 5xx).",
					"statusCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The unexpected HTTP status code returned by the /enabled endpoint." },
					"isRateLimited": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "True if the status code is 429 (rate limited)." }
				}
			*/
			this.telemetry.sendTelemetryErrorEvent('copilot.codingAgent.CCAIsEnabledUnexpectedStatus', { microsoft: true, github: false }, {
				statusCode: String(result.statusCode),
				isRateLimited: String(result.statusCode === 429),
			});
		}

		this.logService.trace(`copilotCloudSessionsProvider#checkCCAEnabled: fetched CCA enabled status for ${owner}/${repo}: ${result.enabled}`);
		return result;
	}

	/**
	 * Gets user-friendly error message for disabled CCA status.
	 * @param result The CCAEnabledResult to get message for
	 * @returns User-friendly error message
	 */
	private getCCADisabledMessage(result: CCAEnabledResult, host: string = 'github.com'): string {
		if (result.statusCode === 422) {
			return vscode.l10n.t('Cloud agent is unable to create pull requests in this repository. Please verify repository rules allow this operation.');
		}
		if (result.statusCode === 401) {
			return vscode.l10n.t('Cloud agent is not authorized to run on this repository. This may be because the Copilot coding agent is disabled for your organization, or your active GitHub account does not have push access to the target repository.');
		}
		// Default to 403 'disabled' message
		const settingsUrl = `https://${host}/settings/copilot/coding_agent`;
		return vscode.l10n.t('Cloud agent is not enabled for this repository. You may need to enable it in [GitHub settings]({0}) or contact your organization administrator.', settingsUrl);
	}

	private stopActiveSessionPolling(): void {
		if (this.activeSessionPollingInterval) {
			clearInterval(this.activeSessionPollingInterval);
			this.activeSessionPollingInterval = undefined;
		}
	}

	private startActiveSessionPolling(): void {
		// Don't start if already polling
		if (this.activeSessionPollingInterval) {
			return;
		}

		this.activeSessionPollingInterval = setInterval(async () => {
			await this.updateActiveSessionsOnly();
		}, ACTIVE_SESSION_POLL_INTERVAL_MS);

		// Register for disposal
		this._register(toDisposable(() => this.stopActiveSessionPolling()));
	}

	private async updateActiveSessionsOnly(): Promise<void> {
		if (this.activeSessionIds.size === 0) {
			this.stopActiveSessionPolling();
			return;
		}

		try {
			// Fetch only the active sessions using allSettled to handle individual failures
			const sessionResults = await Promise.allSettled(
				Array.from(this.activeSessionIds).map(sessionId =>
					this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS)
				)
			);

			const stillActiveSessions = new Set<string>();

			for (const result of sessionResults) {
				if (result.status === 'rejected') {
					this.logService.warn(`Failed to fetch session info: ${result.reason}`);
					continue;
				}

				const session = result.value;
				if (!session) {
					continue;
				}
				this.cachedSessionItems = this.cachedSessionItems?.map(item => {
					if (item.fullDatabaseId === session.resource_global_id) {
						return {
							...item,
							status: this.getSessionStatusFromSession(session),
						};
					}
					return item;
				});

				if (session.state === 'in_progress' || session.state === 'queued') {
					stillActiveSessions.add(session.id);
				}
			}

			// Update the active sessions set
			this.activeSessionIds = stillActiveSessions;

			// If there are changes or no more active sessions, invalidate cache and notify
			if (this.activeSessionIds.size === 0) {
				this.cachedSessionItems = undefined;
				this.stopActiveSessionPolling();
			}
			this._onDidChangeChatSessionItems.fire();
		} catch (error) {
			this.logService.error(`Error updating active sessions: ${error}`);
		}
	}

	/**
	 * Queries for available partner agents by checking if known CCA logins are assignable in the repository.
	 * TODO: Remove once given a proper API
	 */
	private async getAvailablePartnerAgents(owner: string, repo: string): Promise<{ id: string; name: string; at?: string; codiconId?: string }[]> {
		try {
			// Fetch assignable actors for the repository
			const assignableActors = await this._octoKitService.getAssignableActors(owner, repo, {});

			// Check which agents from HARDCODED_PARTNER_AGENTS are assignable
			const availableAgents: { id: string; name: string; at?: string; codiconId?: string }[] = [];

			for (const agent of HARDCODED_PARTNER_AGENTS) {
				const { assignableActorLogin } = agent;
				let isAssignable = false;

				if (assignableActorLogin !== undefined) {
					isAssignable = assignableActors.some(actor => actor.login === assignableActorLogin);
				}
				if (isAssignable) {
					availableAgents.push(agent);
				}
			}

			return availableAgents;
		} catch (error) {
			this.logService.error(`Error fetching partner agents: ${error}`);
			return [];
		}
	}

	/**
	 * Scans local .github/agents/ directory and categorizes agent files.
	 * Returns two groups:
	 * - matches: local files that correlate with remote agents (name exists in both)
	 * - localOnly: local files that don't have a corresponding remote agent
	 */
	private async getLocalCustomAgentFiles(remoteAgents: { name: string }[]): Promise<{
		matches: Set<string>;
		localOnly: { name: string; path: string }[];
	}> {
		const matches = new Set<string>();
		const localOnly: { name: string; path: string }[] = [];
		const remoteAgentNames = new Set(remoteAgents.map(a => a.name.toLowerCase()));

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return { matches, localOnly };
		}

		// Only check the first workspace folder (consistent with how we query GitHub for custom agents)
		// TODO: Expand to multi-root workspaces, etc...
		const folder = workspaceFolders[0];
		try {
			// Find all .md files in .github/agents/ using the file system service
			const agentsDir = joinPath(folder.uri, '.github/agents');
			const entries = await this._fileSystemService.readDirectory(agentsDir);

			for (const [name, type] of entries) {
				// Only process .md files
				if (!(type & FileType.File) || !name.toLowerCase().endsWith('.md')) {
					continue;
				}

				// Extract agent name from filename (e.g., "my-agent.md" -> "my-agent" or "myagent.agent.md" -> "myagent")
				const agentName = name.replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');

				if (!agentName) {
					continue;
				}

				const fileUri = joinPath(agentsDir, name);
				if (remoteAgentNames.has(agentName.toLowerCase())) {
					// This local file matches a remote agent
					matches.add(agentName.toLowerCase());
				} else {
					// This local file has no corresponding remote agent
					localOnly.push({
						name: agentName,
						path: vscode.workspace.asRelativePath(fileUri)
					});
				}
			}
		} catch (error) {
			if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
				return { matches, localOnly };
			}
			this.logService.warn(`Error scanning for local agents in ${folder.uri.toString()}: ${error}`);
		}

		return { matches, localOnly };
	}

	async provideChatSessionProviderOptions(token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptions> {
		this.logService.trace('copilotCloudSessionsProvider#provideChatSessionProviderOptions Start');

		const repoIds = await getRepoId(this._gitService);
		const repoId = repoIds?.[0];

		const workspaceFolders = vscode.workspace.workspaceFolders;
		const isSingleRepoWorkspace = workspaceFolders?.length === 1 && repoIds?.length === 1;
		let ccaEnabledResult: { enabled?: boolean; statusCode?: number } | undefined;
		let isCcaEnabled = true;
		if (isSingleRepoWorkspace && repoId) {
			ccaEnabledResult = await this.checkCCAEnabled(repoId.org, repoId.repo);
			isCcaEnabled = ccaEnabledResult.enabled !== false;
		}
		if (!isCcaEnabled && repoId) {
			this.logService.trace(`copilotCloudSessionsProvider#provideChatSessionProviderOptions: CCA disabled for ${repoId.org}/${repoId.repo}, statusCode: ${ccaEnabledResult?.statusCode}`);
			// Return empty options to disable the feature in the UI
			return { optionGroups: [] };
		}

		// Check TTL-based options cache
		const optionsCacheKey = repoIds && repoIds.length > 0
			? repoIds.map(r => `${r.org}/${r.repo}`).sort().join(',')
			: '';
		const cachedOptions = this._optionsCache.get(optionsCacheKey);
		if (cachedOptions) {
			this.logService.trace('copilotCloudSessionsProvider#provideChatSessionProviderOptions: using cached options');
			return cachedOptions;
		}

		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		try {
			// Fetch agents (requires repo), models (global), and partner agents in parallel
			const [customAgents, models, partnerAgents] = await Promise.allSettled([
				repoId && repoIds?.length === 1 ? this._octoKitService.getCustomAgents(repoId.org, repoId.repo, { excludeInvalidConfig: true }, {}) : Promise.resolve([]),
				this._octoKitService.getCopilotAgentModels({}),
				repoId ? this.getAvailablePartnerAgents(repoId.org, repoId.repo) : Promise.resolve([])
			]);

			try {
				const items = await this.getRepositoriesOptionItems(repoIds);
				if (items.length !== 1) {
					optionGroups.push({
						id: REPOSITORIES_OPTION_GROUP_ID,
						name: vscode.l10n.t('Repository'),
						description: vscode.l10n.t('Select repository'),
						icon: new vscode.ThemeIcon('repo'),
						items,
						commands: [{
							command: OPEN_REPOSITORY_COMMAND_ID,
							title: vscode.l10n.t('Browse repositories...'),
						}]
					});
				}

			} catch (error) {
				this.logService.error(`Error fetching repositories: ${error}`);
			}

			// Partner agents
			// Only show if repo provides a choice of agent (>1)
			if (partnerAgents.status === 'fulfilled' && partnerAgents.value.length > 1) {
				const partnerAgentItems: vscode.ChatSessionProviderOptionItem[] = partnerAgents.value.map(agent => ({
					id: agent.id,
					name: agent.name,
					...(agent.id === DEFAULT_PARTNER_AGENT_ID && { default: true }),
					icon: agent.codiconId ? new vscode.ThemeIcon(agent.codiconId) : undefined
				}));
				optionGroups.push({
					id: PARTNER_AGENTS_OPTION_GROUP_ID,
					name: vscode.l10n.t('Partner Agents'),
					description: vscode.l10n.t('Select which partner agent to use'),
					items: partnerAgentItems,
				});
			}

			// Find local agent files and categorize them
			const { matches, localOnly } = await this.getLocalCustomAgentFiles(
				customAgents.status === 'fulfilled' ? customAgents.value : []
			);

			if ((customAgents.status === 'fulfilled' && customAgents.value.length > 0) || (repoIds?.length === 1 && localOnly.length > 0)) {
				const agentItems: vscode.ChatSessionProviderOptionItem[] = [
					{
						id: DEFAULT_CUSTOM_AGENT_ID,
						default: true,
						name: vscode.l10n.t('Agent'),
						icon: new vscode.ThemeIcon('agent')
					},
					...(customAgents.status === 'fulfilled' ? customAgents.value.map(agent => ({
						id: agent.name,
						name: agent.display_name || agent.name,
						...(matches.has(agent.name.toLowerCase()) && { description: `${agent.name}.md` })
					})) : []),
					// Add local-only agents as disabled items with "push to remote" hint
					...localOnly.map(localAgent => ({
						id: localAgent.name,
						name: localAgent.name,
						description: vscode.l10n.t('Missing from {0}', repoId ? `${repoId.org}/${repoId.repo}` : 'remote repository'),
						locked: true,
						icon: new vscode.ThemeIcon('warning')
					}) satisfies vscode.ChatSessionProviderOptionItem)
				];
				optionGroups.push({
					id: CUSTOM_AGENTS_OPTION_GROUP_ID,
					name: vscode.l10n.t('Custom Agents'),
					description: vscode.l10n.t('Select which custom agent to use'),
					items: agentItems,
					when: `!chatSessionOption.partnerAgents || chatSessionOption.partnerAgents == ${DEFAULT_PARTNER_AGENT_ID}`
				});
			}

			if (models.status === 'fulfilled' && models.value.length > 0) {
				const modelItems: vscode.ChatSessionProviderOptionItem[] = models.value.map(model => ({
					id: model.id,
					name: model.name,
					...(model.billing?.multiplier !== undefined ? { description: `${model.billing.multiplier}x` } : {}),
				}));
				if (!models.value.find(m => m.id === DEFAULT_MODEL_ID)) {
					modelItems.unshift({ id: DEFAULT_MODEL_ID, name: vscode.l10n.t('Auto'), description: vscode.l10n.t('Automatically select the best model') });
				}
				optionGroups.push({
					id: MODELS_OPTION_GROUP_ID,
					name: vscode.l10n.t('Model'),
					description: vscode.l10n.t('Select which model to use'),
					items: modelItems,
					when: `!chatSessionOption.partnerAgents || chatSessionOption.partnerAgents == ${DEFAULT_PARTNER_AGENT_ID}`
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

	private async getRepositoriesOptionItems(repoIds?: GithubRepoId[], fetchAll: boolean = false): Promise<vscode.ChatSessionProviderOptionItem[]> {
		const items: vscode.ChatSessionProviderOptionItem[] = [];
		if (!fetchAll) {
			if (repoIds && repoIds.length > 0) {
				repoIds.forEach((repoId, index) => {
					items.push({
						id: `${repoId.org}/${repoId.repo}`,
						name: `${repoId.org}/${repoId.repo}`,
						default: index === 0,
						icon: new vscode.ThemeIcon('repo'),
					});
				});
			} else {
				// Fetch repos from recent push events (repos user has recently committed to)
				try {
					const recentlyCommittedRepos = await this._octoKitService.getRecentlyCommittedRepositories({});
					for (const repo of recentlyCommittedRepos) {
						const nwo = `${repo.owner}/${repo.name}`;
						items.push({
							id: nwo,
							name: nwo,
							icon: new vscode.ThemeIcon('repo'),
						});
					}
				} catch (error) {
					this.logService.trace(`Failed to fetch recently committed repos: ${error}`);
				}

				// Add user-selected repos that aren't already in the list
				const userSelectedRepos = this.getUserSelectedRepositories();
				const existingIds = new Set(items.map(item => item.id));
				for (const repo of userSelectedRepos) {
					if (!existingIds.has(repo.name)) {
						items.push({
							id: repo.name,
							name: repo.name,
							icon: new vscode.ThemeIcon('repo'),
						});
					}
				}
			}
		} else {
			const fetchedItems = await this.fetchAllRepositoriesFromGitHub();
			items.push(...fetchedItems);
		}
		return items;
	}

	private async fetchAllRepositoriesFromGitHub(query?: string): Promise<vscode.ChatSessionProviderOptionItem[]> {
		try {
			// Fetch repos user has access to, optionally filtered by search query
			const repos = await this._octoKitService.getUserRepositories({}, query);

			// Sort alphabetically and convert to option items
			return repos
				.map(repo => ({ id: `${repo.owner}/${repo.name}`, name: `${repo.owner}/${repo.name}` }))
				.sort((a, b) => a.name.localeCompare(b.name));
		} catch (error) {
			this.logService.error(`Error fetching repositories from GitHub: ${error}`);
			return [];
		}
	}

	provideHandleOptionsChange(resource: Uri, updates: ReadonlyArray<vscode.ChatSessionOptionUpdate>, token: vscode.CancellationToken): void {
		for (const update of updates) {
			if (update.optionId === CUSTOM_AGENTS_OPTION_GROUP_ID) {
				if (update.value) {
					this.sessionCustomAgentMap.set(resource, update.value);
					this.logService.info(`Custom agent changed for session ${resource}: ${update.value}`);
				} else {
					this.sessionCustomAgentMap.delete(resource);
					this.logService.info(`Custom agent cleared for session ${resource}`);
				}
			} else if (update.optionId === MODELS_OPTION_GROUP_ID) {
				if (update.value) {
					this.sessionModelMap.set(resource, update.value);
					this.logService.info(`Model changed for session ${resource}: ${update.value}`);
				} else {
					this.sessionModelMap.delete(resource);
					this.logService.info(`Model cleared for session ${resource}`);
				}
			} else if (update.optionId === PARTNER_AGENTS_OPTION_GROUP_ID) {
				if (update.value) {
					this.sessionPartnerAgentMap.set(resource, update.value);
					this.logService.info(`Partner agent changed for session ${resource}: ${update.value}`);
				} else {
					this.sessionPartnerAgentMap.delete(resource);
					this.logService.info(`Partner agent cleared for session ${resource}`);
				}
			} else if (update.optionId === REPOSITORIES_OPTION_GROUP_ID) {
				if (update.value) {
					this.sessionRepositoryMap.set(resource, update.value);
					// Refresh timestamp for user-selected repos when selected from the picker
					this.saveUserSelectedRepository(update.value);
					this.logService.info(`Repository changed for session ${resource}: ${update.value}`);
				} else {
					this.sessionRepositoryMap.delete(resource);
					this.logService.info(`Repository cleared for session ${resource}`);
				}
			}
		}
	}

	async provideChatSessionItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionItem[]> {
		// Return cached items if available
		if (this.cachedSessionItems) {
			return this.cachedSessionItems;
		}

		if (this.chatSessionItemsPromise) {
			return this.chatSessionItemsPromise;
		}
		this.chatSessionItemsPromise = (async () => {
			const repoIds = await getRepoId(this._gitService);
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: repoIds=${JSON.stringify(repoIds?.map(r => ({ org: r.org, repo: r.repo, host: r.host })))}, isAgentSessionsWorkspace=${vscode.workspace.isAgentSessionsWorkspace}`);
			// Make sure if it's not a github repo we don't show any sessions
			// (unless we're in an agent sessions workspace)
			if (!vscode.workspace.isAgentSessionsWorkspace && !this.isGitHubRepoOrEmpty(repoIds)) {
				this.logService.debug('copilotCloudSessionsProvider#provideChatSessionItems: not a GitHub repo, returning empty');
				return [];
			}
			let sessions = [];
			if (vscode.workspace.isAgentSessionsWorkspace || !repoIds || repoIds.length === 0) {
				sessions = await this._octoKitService.getAllSessions(undefined, true, {});
			} else {
				sessions = (await Promise.all(repoIds.map(repo => this._octoKitService.getAllSessions(`${repo.org}/${repo.repo}`, true, {})))).flat();
			}
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: fetched ${sessions.length} sessions`);
			this.cachedSessionsSize = sessions.length;

			// Group sessions by resource_id and keep only the latest per resource_id
			const latestSessionsMap = new Map<number, SessionInfo>();
			for (const session of sessions) {
				const existing = latestSessionsMap.get(session.resource_id);
				if (!existing || this.shouldPushSession(session, existing)) {
					latestSessionsMap.set(session.resource_id, session);
				}
			}

			// Track active sessions for background polling
			const newActiveSessionIds = new Set<string>();
			for (const session of latestSessionsMap.values()) {
				if (session.state === 'in_progress' || session.state === 'queued') {
					newActiveSessionIds.add(session.id);
				}
			}

			// Update active sessions and start polling if needed
			this.activeSessionIds = newActiveSessionIds;
			if (this.activeSessionIds.size > 0) {
				this.startActiveSessionPolling();
			} else {
				this.stopActiveSessionPolling();
			}

			// Fetch PRs for all unique resource_global_ids in parallel
			const uniqueGlobalIds = new Set(Array.from(latestSessionsMap.values()).map(s => s.resource_global_id));
			const prFetches = Array.from(uniqueGlobalIds).map(async globalId => {
				try {
					const pr = await this._octoKitService.getPullRequestFromGlobalId(globalId, {});
					return { globalId, pr };
				} catch (e) {
					this.logService.warn(`Failed to fetch PR for global ID ${globalId}: ${e instanceof Error ? e.message : String(e)}`);
					return { globalId, pr: null };
				}
			});
			const prResults = await Promise.all(prFetches);
			const prMap = new Map(prResults.filter(r => r.pr).map(r => [r.globalId, r.pr!]));
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: resolved ${prMap.size}/${uniqueGlobalIds.size} PRs from global IDs`);

			const validateISOTimestamp = (date: string | undefined): number | undefined => {
				try {
					if (!date) {
						return;
					}
					const time = new Date(date)?.getTime();
					if (time > 0) {
						return time;
					}
				} catch { }
			};

			// Create session items from latest sessions
			const sessionItems = await Promise.all(Array.from(latestSessionsMap.values()).map(async sessionItem => {
				const pr = prMap.get(sessionItem.resource_global_id);
				if (!pr) {
					return undefined;
				}

				const multiDiffPart = await this._prFileChangesService.getFileChangesMultiDiffPart(pr);
				const changes = multiDiffPart?.value?.map(change => new vscode.ChatSessionChangedFile(
					change.goToFileUri!,
					change.originalUri,
					change.modifiedUri,
					change.added ?? 0,
					change.removed ?? 0));

				const metadata = {
					name: pr.repository?.name,
					owner: pr.repository?.owner?.login,
					branch: pr.headRefName,
					baseBranch: pr.baseRefName,
					pullRequestUrl: pr.url,
					pullRequestState: derivePullRequestState(pr),
				} satisfies { readonly [key: string]: unknown };

				const createdAt = validateISOTimestamp(sessionItem.created_at);
				const session = {
					resource: vscode.Uri.from({ scheme: CopilotCloudSessionsProvider.TYPE, path: '/' + pr.number }),
					label: pr.title,
					status: this.getSessionStatusFromSession(sessionItem),
					badge: this.getPullRequestBadge(repoIds, pr),
					tooltip: this.createPullRequestTooltip(pr),
					...(createdAt ? {
						timing: {
							created: createdAt,
							startTime: createdAt,
							endTime: validateISOTimestamp(sessionItem.completed_at),
						}
					} : {}),
					changes,
					metadata,
					fullDatabaseId: pr.fullDatabaseId.toString(),
					pullRequestDetails: pr
				} satisfies vscode.ChatSessionItem & {
					fullDatabaseId: string;
					pullRequestDetails: PullRequestSearchItem;
				};
				this.chatSessions.set(pr.number, pr);
				return session;
			}));
			const filteredSessions = sessionItems
				// Remove any undefined sessions
				.filter(item => item !== undefined)
				// Only keep sessions with attached PRs not CLOSED or MERGED
				.filter(item => {
					const pr = item.pullRequestDetails;
					const state = pr.state.toUpperCase();
					return state !== 'CLOSED' && state !== 'MERGED';
				});

			vscode.commands.executeCommand('setContext', 'github.copilot.chat.cloudSessionsEmpty', filteredSessions.length === 0);
			this.logService.debug(`copilotCloudSessionsProvider#provideChatSessionItems: returning ${filteredSessions.length} sessions (${sessionItems.length - filteredSessions.length} filtered out)`);

			// Cache the results
			this.cachedSessionItems = filteredSessions;

			return filteredSessions;
		})().finally(() => {
			this.chatSessionItemsPromise = undefined;
		});
		return this.chatSessionItemsPromise;
	}

	private isGitHubRepoOrEmpty(repoIds: GithubRepoId[] | undefined) {
		const hasOpenedFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
		if (!hasOpenedFolder) {
			return true;
		}
		const hasGitHubRepo = repoIds && repoIds.length > 0;
		return hasGitHubRepo;
	}

	private shouldPushSession(sessionItem: SessionInfo, existing: SessionInfo | undefined): boolean {
		if (!existing) {
			return true;
		}
		const existingDate = new Date(existing.last_updated_at);
		const newDate = new Date(sessionItem.last_updated_at);
		return newDate > existingDate;
	}

	async provideChatSessionContent(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const indexedSessionId = SessionIdForPr.parse(resource);
		let pullRequestNumber: number | undefined;
		if (indexedSessionId) {
			pullRequestNumber = indexedSessionId.prNumber;
		}
		if (typeof pullRequestNumber === 'undefined') {
			pullRequestNumber = SessionIdForPr.parsePullRequestNumber(resource);
			if (isNaN(pullRequestNumber)) {
				this.logService.error(`Invalid pull request number: ${resource}`);
				return this.createEmptySession(resource);
			}
		}

		const pr = await this.findPR(pullRequestNumber);
		const summaryReference = new DeferredPromise<vscode.ChatPromptReference | undefined>();
		const getProblemStatement = async (repoOwner: string, repoName: string, sessions: SessionInfo[]) => {
			if (sessions.length === 0) {
				summaryReference.complete(undefined);
				return undefined;
			}
			if (!repoOwner || !repoName) {
				summaryReference.complete(undefined);
				return undefined;
			}
			const jobInfo = await this._octoKitService.getJobBySessionId(repoOwner, repoName, sessions[0].id, 'vscode-copilot-chat', CLOUD_SESSIONS_AUTH_OPTIONS);
			let prompt = jobInfo?.problem_statement || 'Initial Implementation';
			// When delegating, we append the summary to the prompt, & that can be very large and doesn't look great.
			// Turn the summary into a reference instead.
			const info = this._chatDelegationSummaryService.extractPrompt(sessions[0].id, prompt);
			if (info) {
				summaryReference.complete(info.reference);
				prompt = info.prompt;
			} else {
				summaryReference.complete(undefined);
			}
			const titleMatch = prompt.match(/TITLE: \s*(.*)/i);
			if (titleMatch && titleMatch[1]) {
				prompt = titleMatch[1].trim();
			} else {
				const split = prompt.split('\n');
				if (split.length > 0) {
					prompt = split[0].trim();
				}
			}
			return prompt.replace(/@copilot\s*/gi, '').trim();
		};
		if (!pr) {
			this.logService.error(`Session not found for ID: ${resource}`);
			return this.createEmptySession(resource);
		}

		const resolvePartnerAgent = (sessions: SessionInfo[]): { id: string; name: string; at?: string | undefined } | undefined => {
			const getDefault = () => {
				return HARDCODED_PARTNER_AGENTS.find(agent => agent.id === DEFAULT_PARTNER_AGENT_ID) ?? undefined;
			};
			const agentId = sessions.find(s => s.agent_id)?.agent_id;
			if (!agentId) {
				return getDefault();
			}
			// See if this matches any of the known partner agents
			// TODO: Currently hardcoded, no API from GitHub.
			const match = HARDCODED_PARTNER_AGENTS.find(agent => Number(agent.id) === agentId);
			return match ?? getDefault();
		};

		const sessions = await this._octoKitService.getCopilotSessionsForPR(pr.fullDatabaseId.toString(), CLOUD_SESSIONS_AUTH_OPTIONS);
		const sortedSessions = sessions
			.filter((session, index, array) =>
				array.findIndex(s => s.id === session.id) === index
			)
			.slice().sort((a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);

		// Get stored references for this session
		const storedReferences = summaryReference.p.then(summaryRef => {
			return (this.sessionReferencesMap.get(resource) ?? []).concat(summaryRef ? [summaryRef] : []);
		});

		const sessionContentBuilder = new ChatSessionContentBuilder(CopilotCloudSessionsProvider.TYPE, this._gitService);
		const history = await sessionContentBuilder.buildSessionHistory(getProblemStatement(pr.repository.owner.login, pr.repository.name, sortedSessions), sortedSessions, pr, (sessionId: string) => this._octoKitService.getSessionLogs(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS), storedReferences);

		// const selectedCustomAgent = undefined; /* TODO: Needs API to support this. */
		// const selectedModel = undefined; /* TODO: Needs API to support this. */

		const partnerAgent = resolvePartnerAgent(sortedSessions);
		if (partnerAgent) {
			this.sessionPartnerAgentMap.set(resource, partnerAgent.id);
		}

		return {
			history,
			options: {
				// ...(selectedCustomAgent && { [CUSTOM_AGENTS_OPTION_GROUP_ID]: { id: selectedCustomAgent, locked: true, name: selectedCustomAgent } }),
				// ...(selectedModel && { [MODELS_OPTION_GROUP_ID]: { id: selectedModel, locked: true, name: selectedModel } }),
				...(partnerAgent && { [PARTNER_AGENTS_OPTION_GROUP_ID]: { id: partnerAgent.id, locked: true, name: partnerAgent.name } }),
			},
			activeResponseCallback: this.findActiveResponseCallback(sessions, pr),
			requestHandler: undefined
		};
	}

	async openSessionInBrowser(chatSessionItem: vscode.ChatSessionItem): Promise<void> {
		const session = SessionIdForPr.parse(chatSessionItem.resource);
		let prNumber = session?.prNumber;
		if (typeof prNumber === 'undefined' || isNaN(prNumber)) {
			prNumber = SessionIdForPr.parsePullRequestNumber(chatSessionItem.resource);
			if (isNaN(prNumber)) {
				vscode.window.showErrorMessage(vscode.l10n.t('Invalid pull request number: {0}', '' + chatSessionItem.resource));
				this.logService.error(`Invalid pull request number: ${chatSessionItem.resource}`);
				return;
			}
		}

		const pr = await this.findPR(prNumber);
		if (!pr) {
			vscode.window.showErrorMessage(vscode.l10n.t('Could not find pull request #{0}', prNumber));
			this.logService.error(`Could not find pull request #${prNumber}`);
			return;
		}

		await vscode.env.openExternal(vscode.Uri.parse(pr.url));
	}

	private findActiveResponseCallback(
		sessions: SessionInfo[],
		pr: PullRequestSearchItem
	): ((stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => Thenable<void>) | undefined {
		// Only the latest in-progress session gets activeResponseCallback
		const pendingSession = sessions
			.slice()
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.find(session => session.state === 'in_progress' || session.state === 'queued');

		if (pendingSession) {
			return this.createActiveResponseCallback(pr, pendingSession.id);
		}
		return undefined;
	}

	private createActiveResponseCallback(pr: PullRequestSearchItem, sessionId: string): (stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => Thenable<void> {
		return async (stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
			await this.waitForQueuedToInProgress(sessionId, token);
			return this.streamSessionLogs(stream, pr, sessionId, token);
		};
	}

	private createEmptySession(resource: Uri): vscode.ChatSession {
		const sessionId = resource ? resource.path.slice(1) : undefined;
		return {
			history: [],
			...(sessionId && isUntitledSessionId(sessionId)
				? {
					options: {
						[CUSTOM_AGENTS_OPTION_GROUP_ID]:
							this.sessionCustomAgentMap.get(resource)
							?? (this.sessionCustomAgentMap.set(resource, DEFAULT_CUSTOM_AGENT_ID), DEFAULT_CUSTOM_AGENT_ID),
						[MODELS_OPTION_GROUP_ID]:
							this.sessionModelMap.get(resource)
							?? (this.sessionModelMap.set(resource, DEFAULT_MODEL_ID), DEFAULT_MODEL_ID),
						[PARTNER_AGENTS_OPTION_GROUP_ID]:
							this.sessionPartnerAgentMap.get(resource)
							?? (this.sessionPartnerAgentMap.set(resource, DEFAULT_PARTNER_AGENT_ID), DEFAULT_PARTNER_AGENT_ID),
						[REPOSITORIES_OPTION_GROUP_ID]:
							this.sessionRepositoryMap.get(resource)
							?? (this.sessionRepositoryMap.set(resource, DEFAULT_REPOSITORY_ID), DEFAULT_REPOSITORY_ID)
					}
				}
				: {}),
			requestHandler: undefined
		};
	}

	private async findPR(prNumber: number, options: { retries?: number; repository?: string } = {}) {
		const { retries = 1, repository } = options;
		let pr = this.chatSessions.get(prNumber);
		if (pr) {
			return pr;
		}
		let repoOwner: string;
		let repoName: string;
		if (repository && repository !== DEFAULT_REPOSITORY_ID) {
			const [owner, name] = repository.split('/');
			repoOwner = owner;
			repoName = name;
		} else {
			const repoIds = await getRepoId(this._gitService);
			const repoId = repoIds?.[0];
			if (!repoId) {
				this.logService.warn('Failed to determine GitHub repo from workspace');
				return undefined;
			}
			repoOwner = repoId.org;
			repoName = repoId.repo;
		}
		try {
			pr = await retry(async () => {
				const pullRequests = await this._octoKitService.getOpenPullRequestsForUser(repoOwner, repoName, CLOUD_SESSIONS_AUTH_OPTIONS);
				const found = pullRequests.find(p => p.number === prNumber);
				if (!found) {
					this.logService.warn(`Pull request ${prNumber} is not visible yet, retrying...`);
					throw new Error(`PR ${prNumber} not yet visible`);
				}
				return found;
			}, 1500, retries);
			if (pr) {
				this.chatSessions.set(pr.number, pr);
			}
			return pr;
		} catch (error) {
			this.logService.warn(`Pull request not found for number: ${prNumber}. ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private getSessionStatusFromSession(session: SessionInfo): vscode.ChatSessionStatus {
		// Map session state to ChatSessionStatus
		switch (session.state) {
			case 'failed':
				return vscode.ChatSessionStatus.Failed;
			case 'in_progress':
			case 'queued':
				return vscode.ChatSessionStatus.InProgress;
			case 'completed':
				return vscode.ChatSessionStatus.Completed;
			default:
				return vscode.ChatSessionStatus.Completed;
		}
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

	private hasHistoryToSummarize(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]): boolean {
		if (!history || history.length === 0) {
			return false;
		}
		const allResponsesEmpty = history.every(turn => {
			if (turn instanceof vscode.ChatResponseTurn) {
				return turn.response.length === 0;
			}
			return true;
		});
		return !allResponsesEmpty;
	}

	async delegate(
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		context: vscode.ChatContext,
		token: vscode.CancellationToken,
		metadata: ConfirmationMetadata,
		base_ref?: string,
		head_ref?: string
	): Promise<vscode.ChatResponsePullRequestPart> {

		let history: string | undefined;

		// TODO: Do this async/optimistically before delegation triggered
		if (this.hasHistoryToSummarize(context.history)) {
			stream.progress(vscode.l10n.t('Analyzing chat history'));
			history = await this._chatDelegationSummaryService.summarize(context, token);
		}

		// Get the chat resource from context or metadata
		const chatResource = context.chatSessionContext?.chatSessionItem?.resource
			?? metadata.chatContext.chatSessionContext?.chatSessionItem?.resource;

		let customAgentName: string | undefined;
		let modelName: string | undefined;
		let partnerAgentName: string | undefined;
		let selectedRepository: string | undefined;
		if (chatResource) {
			this.logService.trace(`[delegate] Looking up options for chatResource=${chatResource.toString()}, partnerAgentMap.size=${this.sessionPartnerAgentMap.size}`);
			customAgentName = this.sessionCustomAgentMap.get(chatResource);
			modelName = this.sessionModelMap.get(chatResource);
			partnerAgentName = this.sessionPartnerAgentMap.get(chatResource);
			selectedRepository = this.sessionRepositoryMap.get(chatResource);
			this.logService.trace(`[delegate] Retrieved options for ${chatResource.toString()}: customAgent=${customAgentName}, model=${modelName}, partnerAgent=${partnerAgentName}`);
		} else {
			this.logService.trace(`[delegate] No chatResource available to retrieve session options`);
		}

		const { result, processedReferences } = await this.extractReferences(metadata.references, !!head_ref);

		const repoIds = await getRepoId(this._gitService);
		const repoId = repoIds?.[0];
		let repoOwner = repoId?.org;
		let repoName = repoId?.repo;
		const [selectedRepoOwner, selectedRepoName] = (selectedRepository && selectedRepository !== DEFAULT_REPOSITORY_ID) ? selectedRepository.split('/') : [];
		if (!base_ref || repoOwner !== selectedRepoOwner || repoName !== selectedRepoName) {
			if (selectedRepoOwner && selectedRepoName) {
				repoOwner = selectedRepoOwner;
				repoName = selectedRepoName;
			} else {
				if (!repoId) {
					throw new Error(vscode.l10n.t('Open a GitHub repository to use the cloud agent.'));
				}
				repoOwner = repoId.org;
				repoName = repoId.repo;
			}
			const { default_branch } = await this._githubRepositoryService.getRepositoryInfo(repoOwner, repoName);
			base_ref = default_branch;
		}

		const { number, sessionId } = await this.invokeRemoteAgent(
			metadata.prompt,
			[result, history].filter(Boolean).join('\n\n').trim(),
			token,
			stream,
			base_ref,
			head_ref,
			customAgentName,
			modelName,
			partnerAgentName,
			selectedRepository
		);
		if (history) {
			void this._chatDelegationSummaryService.trackSummaryUsage(sessionId, history);
		}
		this.logService.debug(`Delegated to cloud agent for PR #${number} with session ID ${sessionId}`);

		// Store references for this session
		const sessionUri = vscode.Uri.from({ scheme: CopilotCloudSessionsProvider.TYPE, path: '/' + number });

		// Cache the processed references for presentation later
		if (processedReferences.length > 0) {
			this.sessionReferencesMap.set(sessionUri, processedReferences);
		}

		stream.progress(vscode.l10n.t('Fetching pull request details'));
		const pullRequest = await this.findPR(number, { retries: 7, repository: selectedRepository });
		if (!pullRequest) {
			throw new Error(`Failed to find pull request #${number} after delegation.`);
		}
		const uri = await toOpenPullRequestWebviewUri({ owner: pullRequest.repository.owner.login, repo: pullRequest.repository.name, pullRequestNumber: pullRequest.number });

		if (metadata.chatContext.chatSessionContext?.isUntitled) {
			// Untitled flow
			this._onDidCommitChatSessionItem.fire({
				original: metadata.chatContext.chatSessionContext.chatSessionItem,
				modified: {
					resource: sessionUri,
					label: `Pull Request ${number}`
				}
			});
		} else {
			// Delegated flow
			// NOTE: VS Code will now close the parent/source chat in most cases.
			stream.markdown(vscode.l10n.t('A cloud agent has begun working on your request. Follow its progress in the sessions list and associated pull request.'));
		}

		// Return this for external callers, eg: CLI
		return {
			uri, // PR uri,
			command: {
				title: vscode.l10n.t('View Pull Request #{0}', pullRequest.number),
				command: 'github.copilot.chat.openPullRequestReroute',
				arguments: [pullRequest.number]
			},
			title: pullRequest.title,
			description: pullRequest.body || '',
			author: getAuthorDisplayName(pullRequest.author),
			linkTag: `#${pullRequest.number}`
		};
	}

	private async handleConfirmationData(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, context: vscode.ChatContext, token: vscode.CancellationToken) {
		if (!request.prompt || request.prompt.indexOf(':') === -1) {
			this.logService.error('Invalid confirmation prompt format.');
			return {};
		}

		// Parse out the button selected by the user
		const selection = (request.prompt?.split(':')[0] || '').trim().toUpperCase();
		const metadata: unknown = request.acceptedConfirmationData?.[0]?.metadata || request.rejectedConfirmationData?.[0]?.metadata;
		try {
			validateMetadata(metadata);
		} catch (error) {
			this.logService.error(`Invalid confirmation metadata: ${error}`);
			return {};
		}

		// -- Process each button press in order of precedence

		if (!selection || selection === this.CANCEL.toUpperCase() || token.isCancellationRequested) {
			/* __GDPR__
				"copilotcloud.chat.confirmationCancelled" : {
					"owner": "joshspicer",
					"comment": "Event sent when the cloud chat confirmation flow is cancelled.",
					"tokenCancelled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the cancellation token was already cancelled." }
				}
			*/
			this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.confirmationCancelled', {
				tokenCancelled: String(token.isCancellationRequested)
			});
			stream.markdown(vscode.l10n.t('Cloud agent cancelled'));
			return {};
		}

		if (selection.includes(this.AUTHORIZE.toUpperCase())) {
			stream.progress(vscode.l10n.t('Authorizing'));
			try {
				await this._authenticationService.getGitHubSession('permissive', { createIfNone: { detail: l10n.t('Sign in to GitHub with additional permissions to use Copilot cloud sessions.') } });
				if (!this._authenticationService.permissiveGitHubSession) {
					throw new Error('Failed to obtain permissive GitHub session');
				}
			} catch (error) {
				this.logService.error(`Authorization failed: ${error}`);
				throw new Error(vscode.l10n.t('Authorization failed. Please sign into GitHub and try again.'));

			}
		}

		let head_ref: string | undefined; // If set, this is the branch we pushed pending changes to.

		if (selection.includes(this.COMMIT.toUpperCase())) {
			try {
				stream.progress(vscode.l10n.t('Committing and pushing local changes'));
				head_ref = await this.gitOperationsManager.commitAndPushChanges();
				stream.markdown(vscode.l10n.t('Local changes pushed to remote branch `{0}`.', head_ref));
			} catch (error) {
				this.logService.error(`Commit and push failed: ${error}`);
				throw vscode.l10n.t('{0}. Commit or stash your changes and try again.', (error instanceof Error ? error.message : String(error)) ?? vscode.l10n.t('Failed to commit and push changes.'));
			}
		} else if (selection.includes(this.PUSH_BRANCH.toUpperCase())) {
			try {
				stream.progress(vscode.l10n.t('Pushing base branch to remote'));
				const baseBranch = await this.gitOperationsManager.pushBaseRefToRemote();
				stream.markdown(vscode.l10n.t('Base branch `{0}` pushed to remote.', baseBranch));
			} catch (error) {
				this.logService.error(`Push branch failed: ${error}`);
				throw vscode.l10n.t('{0}. Push the current branch to remote and try again.', (error instanceof Error ? error.message : String(error)) ?? vscode.l10n.t('Failed to push current branch.'));
			}
		}

		// Get the selected repository from the chat context for multiroot workspace support
		const chatResource = metadata.chatContext.chatSessionContext?.chatSessionItem?.resource;
		const selectedRepository = chatResource ? this.sessionRepositoryMap.get(chatResource) : undefined;

		const base_ref: string = await (async () => {
			const res = await this.checkBaseBranchPresentOnRemote(selectedRepository);
			if (!res) {
				// Unexpected
				throw new Error(vscode.l10n.t('Repo base branch is not detected on remote. Push your branch and try again.'));
			}
			return (res?.missingOnRemote || !res?.baseRef) ? res.repoDefaultBranch : res?.baseRef;
		})();
		stream.progress(vscode.l10n.t('Validating branch base branch exists on remote'));

		// Now trigger delegation
		try {
			await this.delegate(request, stream, context, token, metadata, base_ref, head_ref);
		} catch (error) {
			this.logService.error(`Failure in delegation: ${error}`);
			throw new Error(vscode.l10n.t('{0}', (error instanceof Error ? error.message : String(error))));
		}
	}

	private setWorkspaceContext(key: string, value: string) {
		this._extensionContext.workspaceState.update(`${this.WORKSPACE_CONTEXT_PREFIX}.${key}`, value);
	}

	private getWorkspaceContext(key: string): string | undefined {
		return this._extensionContext.workspaceState.get<string>(`${this.WORKSPACE_CONTEXT_PREFIX}.${key}`);
	}

	resetWorkspaceContext() {
		const keys =
			this._extensionContext.workspaceState.keys()
				.filter(key => key.startsWith(this.WORKSPACE_CONTEXT_PREFIX));
		for (const key of keys) {
			this.logService.debug(`[resetWorkspaceContext] ${key}`);
			this._extensionContext.workspaceState.update(key, undefined);
		}
	}

	/**
	 * Saves a user-selected repository to global state with current timestamp.
	 * If the repo already exists, the timestamp is refreshed.
	 */
	private saveUserSelectedRepository(repoName: string): void {
		const repos = this.getUserSelectedRepositories();
		const existingIndex = repos.findIndex(r => r.name === repoName);
		if (existingIndex >= 0) {
			repos[existingIndex].timestamp = Date.now();
		} else {
			repos.push({ name: repoName, timestamp: Date.now() });
		}
		this._extensionContext.globalState.update(USER_SELECTED_REPOS_KEY, repos);
		this._onDidChangeChatSessionProviderOptions.fire();
	}

	/**
	 * Gets user-selected repositories, filtering out expired entries (older than 1 week).
	 * Expired entries are automatically cleaned up.
	 */
	private getUserSelectedRepositories(): UserSelectedRepository[] {
		const repos = this._extensionContext.globalState.get<UserSelectedRepository[]>(USER_SELECTED_REPOS_KEY, []);
		const now = Date.now();
		const validRepos = repos.filter(r => (now - r.timestamp) < USER_SELECTED_REPOS_EXPIRY_MS);

		// Clean up expired repos if any were filtered out
		if (validRepos.length !== repos.length) {
			this._extensionContext.globalState.update(USER_SELECTED_REPOS_KEY, validRepos);
		}

		return validRepos;
	}

	private async detectedUncommittedChanges(): Promise<boolean> {
		const currentRepository = this._gitService.activeRepository?.get();
		if (!currentRepository) {
			return false;
		}
		const git = this._gitExtensionService.getExtensionApi();
		const repo = git?.getRepository(currentRepository?.rootUri);
		if (!repo) {
			return false;
		}
		return repo.state.workingTreeChanges.length > 0 || repo.state.indexChanges.length > 0;
	}

	/**
	 * Checks if the current base branch exists on the remote repository.
	 * Returns branch information including whether it's missing from remote, the base ref name, and the repository's default branch.
	 * @param selectedRepository - Optional repository in `org/repo` format. If provided, uses this specific repository
	 *                             instead of defaulting to the first one. This enables multiroot workspace support.
	 */
	private async checkBaseBranchPresentOnRemote(selectedRepository?: string): Promise<{ missingOnRemote: boolean; baseRef: string; repoDefaultBranch: string } | undefined> {
		try {
			const repoIds = await getRepoId(this._gitService);
			if (!repoIds || repoIds.length === 0) {
				return undefined;
			}

			// In multiroot workspaces, use the selected repository if provided
			let repoId = repoIds[0];
			if (selectedRepository && selectedRepository !== DEFAULT_REPOSITORY_ID) {
				const [selectedOrg, selectedRepo] = selectedRepository.split('/');
				const matchingRepoId = repoIds.find(id => id.org === selectedOrg && id.repo === selectedRepo);
				repoId = matchingRepoId ?? new GithubRepoId(selectedOrg, selectedRepo);
			}

			const { baseRef, repository, remoteName } = await this.gitOperationsManager.repoInfo();
			const remoteRepoInfo = await this._githubRepositoryService.getRepositoryInfo(repoId.org, repoId.repo);
			const remoteHasRef = await this.gitOperationsManager.checkIfRemoteHasRef(repository, remoteName, baseRef);
			if (remoteHasRef) {
				// Remote HAS the base branch, no action needed.
				return { missingOnRemote: false, baseRef, repoDefaultBranch: remoteRepoInfo.default_branch };
			}
			// Remote is MISSING the base branch
			return { missingOnRemote: true, baseRef, repoDefaultBranch: remoteRepoInfo.default_branch };
		} catch (error) {
			this.logService.debug(`Failed to check default branch: ${error}`);
			return undefined;
		}
	}

	/**
	 * Returns either all the data for a confirmation dialog, or undefined if no confirmation is needed.
	 * */
	private async buildConfirmation(context: vscode.ChatContext): Promise<{ title: string; message: string; buttons: string[] } | undefined> {
		const title: string = this.TITLE;
		const buttons: string[] = [this.CANCEL];
		let message: string = this.BASE_MESSAGE;

		// Get the selected repository from the chat context for multiroot workspace support
		const chatResource = context.chatSessionContext?.chatSessionItem?.resource;
		const selectedRepository = chatResource ? this.sessionRepositoryMap.get(chatResource) : undefined;

		const needsPermissiveAuth = !this._authenticationService.permissiveGitHubSession;
		const hasUncommittedChanges = await this.detectedUncommittedChanges();
		const baseBranchInfo = await this.checkBaseBranchPresentOnRemote(selectedRepository);

		if (needsPermissiveAuth && hasUncommittedChanges) {
			message += '\n\n' + this.AUTHORIZE_MESSAGE;
			message += '\n\n' + this.COMMIT_MESSAGE;
			buttons.unshift(
				vscode.l10n.t('{0} and {1}', this.AUTHORIZE, this.COMMIT),
				this.AUTHORIZE,
			);
		} else if (needsPermissiveAuth && baseBranchInfo?.missingOnRemote) {
			const { baseRef, repoDefaultBranch } = baseBranchInfo;
			message += '\n\n' + this.AUTHORIZE_MESSAGE;
			message += '\n\n' + this.PUSH_BRANCH_MESSAGE(baseRef, repoDefaultBranch);
			buttons.unshift(
				vscode.l10n.t('{0} and {1}', this.AUTHORIZE, this.PUSH_BRANCH),
				this.AUTHORIZE,
			);
		} else if (needsPermissiveAuth) {
			message += '\n\n' + this.AUTHORIZE_MESSAGE;
			buttons.unshift(
				this.AUTHORIZE,
			);
		} else if (hasUncommittedChanges) {
			message += '\n\n' + this.COMMIT_MESSAGE;
			buttons.unshift(
				vscode.l10n.t('{0} and {1}', this.COMMIT, this.DELEGATE),
				this.DELEGATE,
			);
		} else if (baseBranchInfo?.missingOnRemote) {
			const { baseRef, repoDefaultBranch } = baseBranchInfo;
			message += '\n\n' + this.PUSH_BRANCH_MESSAGE(baseRef, repoDefaultBranch);
			buttons.unshift(
				vscode.l10n.t('{0} and {1}', this.PUSH_BRANCH, this.DELEGATE),
				this.DELEGATE,
			);
		}

		// Check if the message has been modified from the default
		const messageModified = message !== this.BASE_MESSAGE;

		// Only skip confirmation if neither buttons were modified nor message was modified
		if (buttons.length === 1 && !messageModified) {
			if (context.chatSessionContext?.isUntitled) {
				return; // Don't show the confirmation
			}
			const seenDelegationPromptBefore = this.getWorkspaceContext(SEEN_DELEGATION_PROMPT_KEY);
			if (seenDelegationPromptBefore) {
				return; // Don't show the confirmation
			}
		}

		if (buttons.length === 1) {
			// No other affirmative button added, so add generic one
			buttons.unshift(this.DELEGATE);
		}

		return { title, message, buttons };
	}

	private async chatParticipantImpl(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
		if (token.isCancellationRequested) {
			stream.warning(vscode.l10n.t('Cloud session cancelled.'));
			return {};
		}

		if (request.acceptedConfirmationData || request.rejectedConfirmationData) {
			await this.handleConfirmationData(request, stream, context, token);
			this.setWorkspaceContext(SEEN_DELEGATION_PROMPT_KEY, 'yes');
			return {};
		}

		// Look up the partner agent and model for telemetry
		const chatResource = context.chatSessionContext?.chatSessionItem?.resource;

		const initialOptions = context.chatSessionContext?.initialSessionOptions;
		if (chatResource) {
			this.logService.trace(`[chatParticipantImpl] initialSessionOptions for ${chatResource.toString()}: ${describeRuntimeValue(initialOptions)}`);
		}
		if (chatResource) {
			for (const opt of normalizeInitialSessionOptions(initialOptions, this.logService, chatResource)) {
				const value = typeof opt.value === 'string' ? opt.value : opt.value.id;
				if (opt.optionId === CUSTOM_AGENTS_OPTION_GROUP_ID) {
					this.sessionCustomAgentMap.set(chatResource, value);
				} else if (opt.optionId === MODELS_OPTION_GROUP_ID) {
					this.sessionModelMap.set(chatResource, value);
				} else if (opt.optionId === PARTNER_AGENTS_OPTION_GROUP_ID) {
					this.sessionPartnerAgentMap.set(chatResource, value);
				} else if (opt.optionId === REPOSITORIES_OPTION_GROUP_ID) {
					this.sessionRepositoryMap.set(chatResource, value);
				}
			}
		}

		const partnerAgentId = chatResource ? this.sessionPartnerAgentMap.get(chatResource) : undefined;
		const partnerAgent = HARDCODED_PARTNER_AGENTS.find(agent => agent.id === partnerAgentId);
		const modelId = chatResource ? this.sessionModelMap.get(chatResource) : undefined;

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
			partnerAgent: partnerAgent?.name ?? 'unknown',
			model: modelId ?? 'unknown'
		});
		GenAiMetrics.incrementCloudSessionCount(this._otelService, partnerAgent?.name ?? 'unknown');
		emitCloudSessionInvokeEvent(this._otelService, partnerAgent?.name ?? 'unknown', modelId ?? 'unknown', request.id);

		// Follow up
		if (context.chatSessionContext && !context.chatSessionContext.isUntitled && request.sessionResource.scheme === CopilotCloudSessionsProvider.TYPE) {
			await this.handleFollowUp(request, context, stream, token);
			return {};
		}

		// New request
		const showConfirmation = await this.buildConfirmation(context);
		if (showConfirmation) {
			const { title, message, buttons } = showConfirmation;
			stream.confirmation(
				title,
				message,
				{
					metadata: {
						prompt: request.prompt,
						references: request.references,
						chatContext: context,
					} satisfies ConfirmationMetadata
				},
				buttons
			);
		} else {
			// No confirmation
			await this.delegate(
				request,
				stream,
				context,
				token,
				{
					prompt: request.prompt,
					references: request.references,
					chatContext: context
				} satisfies ConfirmationMetadata,
			);
		}
	}

	private async handleFollowUp(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
		if (!context.chatSessionContext || context.chatSessionContext.isUntitled) {
			return {};
		}
		const { prompt } = request;
		if (!prompt || prompt.trim().length === 0) {
			stream.markdown(vscode.l10n.t('Please provide a message for the cloud agent.'));
			return {};
		}

		stream.progress(vscode.l10n.t('Preparing'));
		const session = SessionIdForPr.parse(context.chatSessionContext.chatSessionItem.resource);
		let prNumber = session?.prNumber;
		if (!prNumber) {
			prNumber = SessionIdForPr.parsePullRequestNumber(context.chatSessionContext.chatSessionItem.resource);
			if (!prNumber) {
				return {};
			}
		}
		const pullRequest = await this.findPR(prNumber);
		if (!pullRequest) {
			stream.warning(vscode.l10n.t('Could not find the associated pull request {0} for this chat session.', '' + context.chatSessionContext.chatSessionItem.resource));
			return {};
		}

		stream.progress(vscode.l10n.t('Delegating'));

		const cachedPartnerAgentId = this.sessionPartnerAgentMap.get(context.chatSessionContext.chatSessionItem.resource);
		const partnerAgentAt = HARDCODED_PARTNER_AGENTS.find(agent => agent.id === cachedPartnerAgentId)?.at;

		const result = await this.addFollowUpToExistingPR(pullRequest.number, prompt, undefined, partnerAgentAt);
		if (!result) {
			stream.markdown(vscode.l10n.t('Failed to add follow-up comment to the pull request.'));
			return {};
		}

		// Show initial success message
		stream.markdown(result);
		stream.markdown('\n\n');

		stream.progress(vscode.l10n.t('Attaching to session'));

		// Wait for new session and stream its progress
		const newSession = await this.waitForNewSession(pullRequest, stream, token, true);
		if (!newSession) {
			return {};
		}

		// Stream the new session logs
		stream.markdown(vscode.l10n.t('Cloud agent has begun work on your request'));
		stream.markdown('\n\n');

		await this.streamSessionLogs(stream, pullRequest, newSession.id, token);
		return {};
	}

	/**
	 * Processes *supported* references, returning an LLM-friendly string representation and the filtered list of those references that were processed.
	 */
	private async extractReferences(references: readonly vscode.ChatPromptReference[] | undefined, pushedInProgressBranch: boolean): Promise<{ result: string; processedReferences: readonly vscode.ChatPromptReference[] }> {
		// 'file:///Users/jospicer/dev/joshbot/.github/workflows/build-vsix.yml'  -> '.github/workflows/build-vsix.yml'
		const fileRefs: string[] = [];
		const fullFileParts: string[] = [];
		const processedReferences: vscode.ChatPromptReference[] = [];
		const git = this._gitExtensionService.getExtensionApi();
		for (const ref of references || []) {
			if (ref.value instanceof vscode.Uri && ref.value.scheme === 'file') {
				const fileUri = ref.value;
				const repositoryForFile = git?.getRepository(fileUri);
				if (repositoryForFile) {
					const relativePath = pathLib.relative(repositoryForFile.rootUri.fsPath, fileUri.fsPath);
					const isInWorkingTree = repositoryForFile.state.workingTreeChanges.some(change => change.uri.fsPath === fileUri.fsPath);
					const isInIndex = repositoryForFile.state.indexChanges.some(change => change.uri.fsPath === fileUri.fsPath);
					if (!pushedInProgressBranch && (isInWorkingTree || isInIndex)) {
						try {
							// Show only the file diffs for modified files
							let diff: string;
							if (isInIndex) {
								diff = await repositoryForFile.diffIndexWithHEAD(fileUri.fsPath);
							} else {
								diff = await repositoryForFile.diffWithHEAD(fileUri.fsPath);
							}

							if (diff && diff.trim()) {
								fullFileParts.push(`<file-diff-start>${relativePath}</file-diff-start>`);
								fullFileParts.push(diff);
								fullFileParts.push(`<file-diff-end>${relativePath}</file-diff-end>`);
							} else {
								// If diff is empty, fall back to file reference
								fileRefs.push(` - ${relativePath}`);
							}
							processedReferences.push(ref);
						} catch (error) {
							this.logService.error(`Error reading file diff for reference: ${fileUri.toString()}: ${error}`);
						}
					} else {
						fileRefs.push(` - ${relativePath}`);
						processedReferences.push(ref);
					}
				}
			} else if (ref.value instanceof vscode.Uri && ref.value.scheme === 'github-remote-file') {
				// Virtual filesystem for cloud repos in the sessions window.
				// URI format: github-remote-file://github/{owner}/{repo}/{ref}/{path...}
				const parts = ref.value.path.split('/').filter(Boolean); // ['owner', 'repo', 'ref', ...path]
				if (parts.length >= 4) {
					const relativePath = parts.slice(3).join('/');
					fileRefs.push(` - ${relativePath}`);
					processedReferences.push(ref);
				}
			} else if (ref.value instanceof vscode.Uri && ref.value.scheme === 'untitled') {
				// Get full content of untitled file
				try {
					const document = await vscode.workspace.openTextDocument(ref.value);
					const content = document.getText();
					fullFileParts.push(`<file-start>${ref.value.path}</file-start>`);
					fullFileParts.push(content);
					fullFileParts.push(`<file-end>${ref.value.path}</file-end>`);
					processedReferences.push(ref);
				} catch (error) {
					this.logService.error(`Error reading untitled file content for reference: ${ref.value.toString()}: ${error}`);
				}
			}
		}

		const parts: string[] = [
			...(fullFileParts.length ? ['The user has attached the following uncommitted or modified files as relevant context:', ...fullFileParts] : []),
			...(fileRefs.length ? ['The user has attached the following file paths as relevant context:', ...fileRefs] : [])
		];

		this.logService.debug(`Cloud agent knew how to process ${processedReferences.length} of the ${references?.length || 0} provided references.`);
		return { result: parts.join('\n'), processedReferences };
	}

	private async streamSessionLogs(stream: vscode.ChatResponseStream, pullRequest: PullRequestSearchItem, sessionId: string, token: vscode.CancellationToken): Promise<void> {
		let lastLogLength = 0;
		let lastProcessedLength = 0;
		let hasActiveProgress = false;
		const pollingInterval = 3000; // 3 seconds

		return new Promise<void>((resolve, reject) => {
			let isCompleted = false;

			const complete = async () => {
				if (isCompleted) {
					return;
				}
				isCompleted = true;
				this.refresh();
				resolve();
			};

			const pollForUpdates = async (): Promise<void> => {
				try {
					if (token.isCancellationRequested) {
						complete();
						return;
					}

					// Get the specific session info
					const sessionInfo = await this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
					if (!sessionInfo || token.isCancellationRequested) {
						complete();
						return;
					}

					// Get session logs
					const logs = await this._octoKitService.getSessionLogs(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);

					// Check if session is still in progress
					if (sessionInfo.state !== 'in_progress') {
						if (logs.length > lastProcessedLength) {
							const newLogContent = logs.slice(lastProcessedLength);
							const streamResult = await this.streamNewLogContent(pullRequest, stream, newLogContent);
							if (streamResult.hasStreamedContent) {
								hasActiveProgress = false;
							}
						}
						hasActiveProgress = false;
						complete();
						return;
					}

					if (logs.length > lastLogLength) {
						this.logService.trace(`New logs detected, attempting to stream content`);
						const newLogContent = logs.slice(lastProcessedLength);
						const streamResult = await this.streamNewLogContent(pullRequest, stream, newLogContent);
						lastProcessedLength = logs.length;

						if (streamResult.hasStreamedContent) {
							this.logService.trace(`Content was streamed, resetting hasActiveProgress to false`);
							hasActiveProgress = false;
						} else if (streamResult.hasSetupStepProgress) {
							this.logService.trace(`Setup step progress detected, keeping progress active`);
							// Keep hasActiveProgress as is, don't reset it
						} else {
							this.logService.trace(`No content was streamed, keeping hasActiveProgress as ${hasActiveProgress}`);
						}
					}

					lastLogLength = logs.length;

					if (!token.isCancellationRequested && sessionInfo.state === 'in_progress') {
						if (!hasActiveProgress) {
							this.logService.trace(`Showing progress indicator (hasActiveProgress was false)`);
							hasActiveProgress = true;
						} else {
							this.logService.trace(`NOT showing progress indicator (hasActiveProgress was true)`);
						}
						setTimeout(pollForUpdates, pollingInterval);
					} else {
						complete();
					}
				} catch (error) {
					this.logService.error(`Error polling for session updates: ${error}`);
					if (!token.isCancellationRequested) {
						setTimeout(pollForUpdates, pollingInterval);
					} else {
						reject(error);
					}
				}
			};

			// Start polling
			setTimeout(pollForUpdates, pollingInterval);
		});
	}

	private async streamNewLogContent(pullRequest: PullRequestSearchItem, stream: vscode.ChatResponseStream, newLogContent: string): Promise<{ hasStreamedContent: boolean; hasSetupStepProgress: boolean }> {
		try {
			if (!newLogContent.trim()) {
				return { hasStreamedContent: false, hasSetupStepProgress: false };
			}

			// Parse the new log content
			const contentBuilder = new ChatSessionContentBuilder(CopilotCloudSessionsProvider.TYPE, this._gitService);
			const logChunks = parseSessionLogChunksSafely(newLogContent, this.logService, value => contentBuilder.parseSessionLogs(value));
			let hasStreamedContent = false;
			let hasSetupStepProgress = false;

			for (const [chunkIndex, chunk] of logChunks.entries()) {
				if (!Array.isArray(chunk.choices)) {
					this.logService.warn(`[streamNewLogContent] Ignoring chunk ${chunkIndex} with non-array choices for PR #${pullRequest.number}.`);
					continue;
				}

				for (const choice of chunk.choices) {
					if (!choice?.delta) {
						this.logService.warn(`[streamNewLogContent] Ignoring chunk ${chunkIndex} with missing delta for PR #${pullRequest.number}.`);
						continue;
					}

					const delta = choice.delta;
					const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : undefined;
					if (delta.tool_calls && !toolCalls) {
						this.logService.warn(`[streamNewLogContent] Ignoring non-array tool_calls for PR #${pullRequest.number}.`);
					}

					if (delta.role === 'assistant') {
						// Handle special case for run_custom_setup_step/run_setup
						if (choice.finish_reason === 'tool_calls' && toolCalls?.length && (toolCalls[0].function.name === 'run_custom_setup_step' || toolCalls[0].function.name === 'run_setup')) {
							const toolCall = toolCalls[0];
							let args: any = {};
							try {
								args = JSON.parse(toolCall.function.arguments);
							} catch {
								// fallback to empty args
							}

							if (delta.content && delta.content.trim()) {
								// Finished setup step - create/update tool part
								const toolPart = contentBuilder.createToolInvocationPart(pullRequest, toolCall, args.name || delta.content);
								if (toolPart) {
									stream.push(toolPart);
									hasStreamedContent = true;
									if (toolPart instanceof vscode.ChatResponseThinkingProgressPart) {
										stream.push(new vscode.ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
									}
								}
							} else {
								// Running setup step - just track progress
								hasSetupStepProgress = true;
								this.logService.trace(`Setup step in progress: ${args.name || 'Unknown step'}`);
							}
						} else {
							if (delta.content) {
								if (!delta.content.startsWith('<pr_title>')) {
									stream.markdown(delta.content);
									hasStreamedContent = true;
								}
							}

							if (toolCalls) {
								for (const toolCall of toolCalls) {
									const toolPart = contentBuilder.createToolInvocationPart(pullRequest, toolCall, delta.content || '');
									if (toolPart) {
										stream.push(toolPart);
										hasStreamedContent = true;
										if (toolPart instanceof vscode.ChatResponseThinkingProgressPart) {
											stream.push(new vscode.ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
										}
									}
								}
							}
						}
					}

					// Handle finish reasons
					if (choice.finish_reason && choice.finish_reason !== 'null') {
						this.logService.trace(`Streaming finish_reason: ${choice.finish_reason}`);
					}
				}
			}

			if (hasStreamedContent) {
				this.logService.trace(`Streamed content (markdown or tool parts), progress should be cleared`);
			} else if (hasSetupStepProgress) {
				this.logService.trace(`Setup step progress detected, keeping progress indicator`);
			} else {
				this.logService.trace(`No actual content streamed, progress may still be showing`);
			}
			return { hasStreamedContent, hasSetupStepProgress };
		} catch (error) {
			this.logService.error(`Error streaming new log content: ${error}`);
			return { hasStreamedContent: false, hasSetupStepProgress: false };
		}
	}

	private async waitForQueuedToInProgress(
		sessionId: string,
		token?: vscode.CancellationToken
	): Promise<SessionInfo | undefined> {
		let sessionInfo: SessionInfo | undefined;

		const waitForQueuedMaxRetries = 3;
		const waitForQueuedDelay = 5_000; // 5 seconds

		// Allow for a short delay before the session is marked as 'queued'
		let waitForQueuedCount = 0;
		do {
			sessionInfo = await this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
			if (sessionInfo && sessionInfo.state === 'queued') {
				this.logService.trace('Queued session found');
				break;
			}
			if (waitForQueuedCount < waitForQueuedMaxRetries) {
				this.logService.trace('Session not yet queued, waiting...');
				await new Promise(resolve => setTimeout(resolve, waitForQueuedDelay));
			}
			++waitForQueuedCount;
		} while (waitForQueuedCount <= waitForQueuedMaxRetries && (!token || !token.isCancellationRequested));

		if (!sessionInfo || sessionInfo.state !== 'queued') {
			if (sessionInfo?.state === 'in_progress') {
				this.logService.trace('Session already in progress');
				this.refresh();
				return sessionInfo;
			}
			// Failure
			this.logService.trace('Failed to find queued session');
			return;
		}

		const maxWaitTime = 2 * 60 * 1_000; // 2 minutes
		const pollInterval = 3_000; // 3 seconds
		const startTime = Date.now();

		this.logService.trace(`Session ${sessionInfo.id} is queued, waiting for transition to in_progress...`);
		while (Date.now() - startTime < maxWaitTime && (!token || !token.isCancellationRequested)) {
			const sessionInfo = await this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
			if (sessionInfo?.state === 'in_progress') {
				this.logService.trace(`Session ${sessionInfo.id} now in progress.`);
				this.refresh();
				return sessionInfo;
			}
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}
		this.logService.error(`Timed out waiting for session ${sessionId} to transition from queued to in_progress.`);
	}

	private async waitForNewSession(
		pullRequest: PullRequestSearchItem,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
		waitForTransitionToInProgress: boolean = false
	): Promise<SessionInfo | undefined> {
		// Get the current number of sessions
		const initialSessions = await this._octoKitService.getCopilotSessionsForPR(pullRequest.fullDatabaseId.toString(), CLOUD_SESSIONS_AUTH_OPTIONS);
		const initialSessionCount = initialSessions.length;

		// Poll for a new session to start
		const maxWaitTime = 5 * 60 * 1000; // 5 minutes
		const pollInterval = 3000; // 3 seconds
		const startTime = Date.now();

		while (Date.now() - startTime < maxWaitTime && !token.isCancellationRequested) {
			const currentSessions = await this._octoKitService.getCopilotSessionsForPR(pullRequest.fullDatabaseId.toString(), CLOUD_SESSIONS_AUTH_OPTIONS);

			// Check if a new session has started
			if (currentSessions.length > initialSessionCount) {
				const newSession = currentSessions
					.sort((a: { created_at: string | number | Date }, b: { created_at: string | number | Date }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
				if (!waitForTransitionToInProgress) {
					return newSession;
				}
				const inProgressSession = await this.waitForQueuedToInProgress(newSession.id, token);
				if (!inProgressSession) {
					stream.markdown(vscode.l10n.t('Timed out waiting for cloud agent to begin work. Please try again shortly.'));
					return;
				}
				return inProgressSession;
			}

			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		stream.markdown(vscode.l10n.t('Timed out waiting for the cloud agent to respond. The agent may still be processing your request.'));
		return;
	}

	private async addFollowUpToExistingPR(pullRequestNumber: number, userPrompt: string, summary?: string, targetAgent = 'copilot'): Promise<string | undefined> {
		try {
			/* __GDPR__
				"copilotcloud.chat.followupComment" : {
					"owner": "joshspicer",
					"comment": "Event sent when a follow-up comment is delegated to an existing pull request.",
					"targetAgent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The target @agent for the follow-up comment." }
				}
			*/
			this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.followupComment', {
				targetAgent,
			});

			const pr = await this.findPR(pullRequestNumber);
			if (!pr) {
				this.logService.error(`Could not find pull request #${pullRequestNumber}`);
				return;
			}
			const commentBody = `@${targetAgent} ${userPrompt} ${summary ? '\n\n' + summary : ''}`;

			const commentResult = await this._octoKitService.addPullRequestComment(pr.id, commentBody, CLOUD_SESSIONS_AUTH_OPTIONS);
			if (!commentResult) {
				this.logService.error(`Failed to add comment to PR #${pullRequestNumber}`);
				return;
			}
			// allow-any-unicode-next-line
			return vscode.l10n.t('🚀 Follow-up comment added to [#{0}]({1})', pullRequestNumber, commentResult.url);
		} catch (err) {
			this.logService.error(`Failed to add follow-up comment to PR #${pullRequestNumber}: ${err}`);
			return;
		}
	}

	// https://github.com/github/sweagentd/blob/main/docs/adr/0001-create-job-api.md
	private validateRemoteAgentJobResponse(response: unknown): response is RemoteAgentJobResponse {
		return typeof response === 'object' && response !== null && 'job_id' in response && 'session_id' in response;
	}

	private async waitForJobWithPullRequest(
		owner: string,
		repo: string,
		jobId: string,
		token?: vscode.CancellationToken
	): Promise<JobInfo | undefined> {
		const maxWaitTime = 30 * 1000; // 30 seconds
		const pollInterval = 2000; // 2 seconds
		const startTime = Date.now();

		this.logService.trace(`Waiting for job ${jobId} to have pull request information...`);

		while (Date.now() - startTime < maxWaitTime && (!token || !token.isCancellationRequested)) {
			const jobInfo = await this._octoKitService.getJobByJobId(owner, repo, jobId, 'vscode-copilot-chat', CLOUD_SESSIONS_AUTH_OPTIONS);
			if (jobInfo && jobInfo.pull_request && jobInfo.pull_request.number) {
				/* __GDPR__
					"copilotcloud.chat.remoteAgentJobPullRequestReady" : {
						"owner": "joshspicer",
						"comment": "Event sent when a remote agent job first returns pull request information."
					}
				*/
				this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobPullRequestReady');
				GenAiMetrics.incrementCloudPrReadyCount(this._otelService);
				this.logService.trace(`Job ${jobId} now has pull request #${jobInfo.pull_request.number}`);
				this.refresh();
				return jobInfo;
			}
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		this.logService.warn(`Timed out waiting for job ${jobId} to have pull request information`);
		return undefined;
	}

	private async invokeRemoteAgent(prompt: string, problemContext: string, token: vscode.CancellationToken, stream: vscode.ChatResponseStream, base_ref: string, head_ref?: string, customAgentName?: string, modelName?: string, partnerAgentName?: string, selectedRepository?: string): Promise<{ number: number; sessionId: string }> {
		const title = extractTitle(prompt, problemContext);
		const { problemStatement, isTruncated } = truncatePrompt(this.logService, prompt, problemContext);
		const repoIds = await getRepoId(this._gitService);

		let repoOwner: string;
		let repoName: string;
		let repoHost: string = 'github.com';
		if (selectedRepository && selectedRepository !== DEFAULT_REPOSITORY_ID) {
			const [owner, repo] = selectedRepository.split('/');
			repoOwner = owner;
			repoName = repo;
			const matchingRepoId = repoIds?.find(id => id.org === owner && id.repo === repo);
			if (matchingRepoId) {
				repoHost = matchingRepoId.host;
			}
		} else {
			const repoId = repoIds?.[0];
			if (!repoId) {
				throw new Error(vscode.l10n.t('Unable to determine repository information. Please ensure you are working within a Git repository.'));
			}
			repoOwner = repoId.org;
			repoName = repoId.repo;
			repoHost = repoId.host;
		}

		// Check if CCA is enabled before posting job
		const ccaEnabled = await this.checkCCAEnabled(repoOwner, repoName);
		if (ccaEnabled.enabled === false) {
			throw new Error(this.getCCADisabledMessage(ccaEnabled, repoHost));
		}

		if (isTruncated) {
			stream.progress(vscode.l10n.t('Truncating context'));
			const truncationResult = await vscode.window.showWarningMessage(
				vscode.l10n.t('Prompt size exceeded'), { modal: true, detail: vscode.l10n.t('Your prompt will be truncated to fit within cloud agent\'s context window. This may affect the quality of the response.') }, CONTINUE_TRUNCATION);
			const userCancelled = token?.isCancellationRequested || !truncationResult || truncationResult !== CONTINUE_TRUNCATION;
			/* __GDPR__
				"copilot.codingAgent.truncation" : {
					"isCancelled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetry.sendTelemetryEvent('copilot.codingAgent.truncation', { microsoft: true, github: false }, {
				isCancelled: String(userCancelled),
			});
			if (userCancelled) {
				throw new Error(vscode.l10n.t('User cancelled due to truncation.'));
			}
		}

		const resolvePartnerAgentName = (partnerAgentName?: string): { agent_id?: number } => {
			this.logService.trace(`Resolving partner agent from: ${partnerAgentName}`);
			if (!partnerAgentName || partnerAgentName === DEFAULT_PARTNER_AGENT_ID) {
				return {};
			}
			// try convert to number
			const partnerAgentIdNum = Number(partnerAgentName);
			if (isNaN(partnerAgentIdNum)) {
				this.logService.warn(`Invalid partner agent name/id provided: ${partnerAgentName}`);
				return {};
			}
			return { agent_id: partnerAgentIdNum };
		};

		const payload: RemoteAgentJobPayload = {
			problem_statement: problemStatement,
			event_content: prompt,
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
			...(customAgentName && customAgentName !== DEFAULT_CUSTOM_AGENT_ID && { custom_agent: customAgentName }),
			...(modelName && modelName !== DEFAULT_MODEL_ID && { model: modelName }),
			...(resolvePartnerAgentName(partnerAgentName)),
			pull_request: {
				title,
				body_placeholder: formatBodyPlaceholder(title),
				base_ref,
				body_suffix,
				...(head_ref && { head_ref }),
			}
		};

		/* __GDPR__
			"copilotcloud.chat.remoteAgentJobInvoke" : {
				"owner": "joshspicer",
				"comment": "Event sent when a remote agent job invocation starts.",
				"hasHeadRef": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a head ref was provided for delegation." }
			}
		*/
		this.telemetry.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobInvoke', {
			hasHeadRef: String(!!head_ref)
		});

		stream?.progress(vscode.l10n.t('Delegating to cloud agent'));
		this.logService.debug(`[postCopilotAgentJob] Invoking cloud agent job with payload: ${JSON.stringify(payload)}`);
		const response = await this._octoKitService.postCopilotAgentJob(repoOwner, repoName, JOBS_API_VERSION, payload, CLOUD_SESSIONS_AUTH_OPTIONS);
		this.logService.debug(`[postCopilotAgentJob] Received response from cloud agent job invocation: ${JSON.stringify(response)}`);
		if (!this.validateRemoteAgentJobResponse(response)) {
			const statusCode = response?.status;
			switch (statusCode) {
				case 401:
					throw new Error(vscode.l10n.t('Cloud agent is not authorized to run on this repository. This may be because the Copilot coding agent is disabled for your organization, or your active GitHub account does not have push access to the target repository.'));
				case 403:
					throw new Error(vscode.l10n.t('Cloud agent is not enabled for this repository. You may need to enable it in [GitHub settings]({0}) or contact your organization administrator.', `https://${repoHost}/settings/copilot/coding_agent`));
				case 404:
					throw new Error(vscode.l10n.t('The repository `{0}/{1}` was not found or you do not have access to it.', repoOwner, repoName));
				case 422:
					// NOTE: Although earlier checks should prevent this, ensure that if we end up
					//       with a 422 from the API, we give a useful error message
					throw new Error(vscode.l10n.t('Cloud agent was unable to create a pull request with the specified base branch `{0}`. Please push the branch to the remote and verify repository rules allow this operation. For empty repos, push an initial commit and try again.', base_ref));
				case 500:
					throw new Error(vscode.l10n.t('Cloud agent service encountered an internal error. Please try again later.'));
				default:
					throw new Error(vscode.l10n.t('Received invalid response {0} from cloud agent.', statusCode ? statusCode : ''));
			}
		}

		stream.progress(vscode.l10n.t('Creating pull request'));
		const jobInfo = await this.waitForJobWithPullRequest(repoOwner, repoName, response.job_id, token);

		if (!jobInfo || !jobInfo.pull_request) {
			throw new Error(vscode.l10n.t('Failed to retrieve pull request information from job'));
		}

		const { number } = jobInfo.pull_request;
		if (!number || isNaN(number)) {
			throw new Error(vscode.l10n.t('Invalid pull request number received from cloud agent'));
		}
		return {
			number,
			sessionId: response.session_id
		};
	}
}
