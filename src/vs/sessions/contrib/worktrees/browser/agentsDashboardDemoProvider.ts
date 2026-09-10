/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity, ChatModelSource, IChat, ISession, ISessionWorkspace, SessionStatus, toSessionId } from '../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionModelsSnapshot, ISessionsProvider, ISessionsProviderCreateSessionOptions } from '../../../services/sessions/common/sessionsProvider.js';
import { AgentsDashboardHistoryEvent, AgentsDashboardHistoryEventType, IAgentsDashboardHistoryService } from '../common/agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService, WorktreeEntryStatus } from '../common/worktreeDashboard.js';

const DEMO_PROVIDER_ID = 'agents-dashboard-demo';

interface IDemoSessionSpec {
	readonly id: string;
	readonly title: string;
	readonly daysAgo: number;
	readonly durationHours?: number;
	readonly status: SessionStatus;
	readonly archived?: boolean;
	readonly worktree?: boolean;
	readonly pullRequest?: 'open' | 'merged';
	readonly credits?: number;
}

class DemoSession implements ISession {
	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId = DEMO_PROVIDER_ID;
	readonly sessionType = DEMO_PROVIDER_ID;
	readonly icon = Codicon.agent;
	readonly createdAt: Date;
	readonly workspace;
	readonly title: ISettableObservable<string>;
	readonly updatedAt;
	readonly status: ISettableObservable<SessionStatus>;
	readonly changesSummary;
	readonly changes = constObservable([]);
	readonly changesets = constObservable([]);
	readonly usage;
	readonly modelId = constObservable<string | undefined>('claude-sonnet-5');
	readonly mode = constObservable({ id: 'agent', kind: 'agent' });
	readonly loading = constObservable(false);
	readonly isArchived: ISettableObservable<boolean>;
	readonly isRead = constObservable(true);
	readonly description = constObservable(undefined);
	readonly lastTurnEnd;
	readonly chats;
	readonly mainChat;
	readonly capabilities = constObservable({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true });

	constructor(spec: IDemoSessionSpec, now: number) {
		this.resource = URI.from({ scheme: DEMO_PROVIDER_ID, path: `/${spec.id}` });
		this.sessionId = toSessionId(DEMO_PROVIDER_ID, this.resource);
		this.createdAt = new Date(now - spec.daysAgo * 24 * 60 * 60 * 1000);
		const completedAt = spec.durationHours === undefined ? undefined : new Date(this.createdAt.getTime() + spec.durationHours * 60 * 60 * 1000);
		this.updatedAt = constObservable(completedAt ?? new Date(now - Math.max(0, spec.daysAgo - 1) * 24 * 60 * 60 * 1000));
		this.title = observableValue(`demoTitle-${spec.id}`, spec.title);
		this.status = observableValue(`demoStatus-${spec.id}`, spec.status);
		this.isArchived = observableValue(`demoArchived-${spec.id}`, spec.archived ?? false);
		this.lastTurnEnd = constObservable(completedAt);
		this.usage = constObservable(spec.credits === undefined ? undefined : { credits: spec.credits });
		this.changesSummary = constObservable({
			files: 2 + spec.daysAgo % 9,
			additions: 18 + spec.daysAgo * 3,
			deletions: 4 + spec.daysAgo,
		});

		const repository = URI.file(`/Users/demo/work/${spec.id}`);
		const workingDirectory = spec.worktree ? URI.file(`/Users/demo/.copilot/worktrees/${spec.id}`) : repository;
		const gitHubInfo = spec.pullRequest ? {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequests: [{
				owner: 'microsoft',
				repo: 'vscode',
				number: 9000 + spec.daysAgo,
				uri: URI.parse(`https://github.com/microsoft/vscode/pull/${9000 + spec.daysAgo}`),
				state: spec.pullRequest,
				createdByThisSession: true,
			}],
		} : undefined;
		const workspace: ISessionWorkspace = {
			uri: workingDirectory,
			label: spec.id,
			icon: Codicon.repo,
			folders: [{
				root: workingDirectory,
				workingDirectory,
				name: spec.id,
				description: undefined,
				gitRepository: {
					uri: repository,
					workTreeUri: spec.worktree ? workingDirectory : undefined,
					branchName: spec.worktree ? `agents/${spec.id}` : 'main',
					baseBranchName: 'main',
					gitHubInfo: constObservable(gitHubInfo),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		this.workspace = constObservable(workspace);

		const chat: IChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			checkpoints: constObservable(undefined),
			modelId: this.modelId,
			modelSource: constObservable(ChatModelSource.Chosen),
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			interactivity: constObservable(ChatInteractivity.ReadOnly),
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.chats = constObservable([chat]);
		this.mainChat = constObservable(chat);
	}
}

class AgentsDashboardDemoSessionsProvider extends Disposable implements ISessionsProvider {
	readonly id = DEMO_PROVIDER_ID;
	readonly label = localize('agentsDashboard.demoProvider', "Agents Dashboard Demo");
	readonly icon = Codicon.beaker;
	readonly order = Number.MAX_SAFE_INTEGER;
	readonly sessionTypes = [];
	readonly onDidChangeSessionTypes = Event.None;
	readonly browseActions = [];
	readonly onDidChangeModels = Event.None;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _sessions: DemoSession[];

	constructor(now: number) {
		super();
		this._sessions = createDemoSessionSpecs().map(spec => new DemoSession(spec, now));
	}

	getSessions(): ISession[] { return [...this._sessions]; }
	resolveWorkspace(_workspaceUri: URI): ISessionWorkspace | undefined { return undefined; }
	createNewSession(_workspaceUri: URI, _sessionTypeId: string, _options?: ISessionsProviderCreateSessionOptions): ISession { throw new Error('Demo sessions are read-only.'); }
	createQuickChat(_sessionTypeId: string, _options?: ISessionsProviderCreateSessionOptions): ISession { throw new Error('Demo sessions are read-only.'); }
	deleteNewSession(_sessionId: string): void { }
	getSessionTypes(_workspaceUri: URI) { return []; }
	async renameChat(sessionId: string, _chatUri: URI, title: string): Promise<void> { await this.renameSession(sessionId, title); }
	async renameSession(sessionId: string, title: string): Promise<void> {
		const session = this._sessions.find(candidate => candidate.sessionId === sessionId);
		if (session) {
			session.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		}
	}
	getModelsSnapshot(_sessionId: string, _desiredModelId?: string): ISessionModelsSnapshot {
		return { models: [], desiredModelResolution: { kind: 'notRequested' }, modelTarget: undefined };
	}
	getModelPickerOptions(_sessionId: string): ISessionModelPickerOptions {
		return { useGroupedModelPicker: false, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false, showAutoModel: false };
	}
	setModel(_sessionId: string, _chatResource: URI, _modelId: string, _source: ChatModelSource): void { }
	async archiveSession(sessionId: string): Promise<void> { this._setArchived(sessionId, true); }
	async unarchiveSession(sessionId: string): Promise<void> { this._setArchived(sessionId, false); }
	async setSessionReadState(_sessionId: string, _isRead: boolean): Promise<void> { }
	async deleteSession(sessionId: string): Promise<void> {
		const index = this._sessions.findIndex(session => session.sessionId === sessionId);
		if (index >= 0) {
			const [removed] = this._sessions.splice(index, 1);
			this._onDidChangeSessions.fire({ added: [], removed: [removed], changed: [] });
		}
	}
	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
	}
	async deleteChat(_sessionId: string, _chatUri: URI): Promise<boolean> { return false; }
	async createNewChat(_sessionId: string): Promise<IChat> { throw new Error('Demo sessions are read-only.'); }
	async forkChat(_sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('Demo sessions are read-only.'); }
	async createSideChat(_sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('Demo sessions are read-only.'); }
	async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { throw new Error('Demo sessions are read-only.'); }

	private _setArchived(sessionId: string, archived: boolean): void {
		const session = this._sessions.find(candidate => candidate.sessionId === sessionId);
		if (session) {
			session.isArchived.set(archived, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		}
	}
}

class AgentsDashboardDemoProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.agentsDashboardDemoProvider';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IAgentsDashboardHistoryService historyService: IAgentsDashboardHistoryService,
		@IWorktreeDashboardService worktreeDashboardService: IWorktreeDashboardService,
	) {
		super();
		const args = (environmentService as IWorkbenchEnvironmentService & { readonly args?: { readonly 'agents-dashboard-demo'?: boolean } }).args;
		if (environmentService.isBuilt || !args?.['agents-dashboard-demo']) {
			return;
		}
		const now = Date.now();
		const provider = this._register(new AgentsDashboardDemoSessionsProvider(now));
		this._register(sessionsProvidersService.registerProvider(provider));
		historyService.setDevelopmentEvents(createDemoHistory(now));
		worktreeDashboardService.setDevelopmentEntries(createDemoWorktrees(provider.getSessions()));
		this._register({
			dispose: () => {
				historyService.setDevelopmentEvents([]);
				worktreeDashboardService.setDevelopmentEntries([]);
			}
		});
	}
}

function createDemoSessionSpecs(): IDemoSessionSpec[] {
	return [
		{ id: 'refactor-search-index', title: localize('agentsDashboard.demo.refactorSearch', "Refactor search indexing"), daysAgo: 0, status: SessionStatus.InProgress, worktree: true, credits: 2.4 },
		{ id: 'fix-terminal-confirmation', title: localize('agentsDashboard.demo.terminal', "Fix terminal confirmation flow"), daysAgo: 0, status: SessionStatus.NeedsInput, worktree: true, credits: 1.8 },
		{ id: 'improve-notebook-find', title: localize('agentsDashboard.demo.notebook', "Improve notebook output search"), daysAgo: 1, durationHours: 3.5, status: SessionStatus.Completed, worktree: true, pullRequest: 'open', credits: 3.2 },
		{ id: 'update-accessibility-help', title: localize('agentsDashboard.demo.accessibility', "Update accessibility help"), daysAgo: 2, durationHours: 1.2, status: SessionStatus.Completed, pullRequest: 'merged', credits: 1.1 },
		{ id: 'optimize-chat-rendering', title: localize('agentsDashboard.demo.performance', "Optimize chat rendering"), daysAgo: 4, durationHours: 7.8, status: SessionStatus.Completed, worktree: true, pullRequest: 'merged', credits: 5.6 },
		{ id: 'investigate-extension-host', title: localize('agentsDashboard.demo.extensionHost', "Investigate extension host startup"), daysAgo: 6, status: SessionStatus.Error, worktree: true, credits: 0.9 },
		{ id: 'simplify-settings-layout', title: localize('agentsDashboard.demo.settings', "Simplify settings layout"), daysAgo: 8, durationHours: 2.6, status: SessionStatus.Completed, pullRequest: 'merged', archived: true, credits: 2.3 },
		{ id: 'add-python-tests', title: localize('agentsDashboard.demo.python', "Add Python extension tests"), daysAgo: 11, durationHours: 4.1, status: SessionStatus.Completed, worktree: true, pullRequest: 'open', archived: true, credits: 3.7 },
		{ id: 'review-theme-tokens', title: localize('agentsDashboard.demo.theme', "Review theme tokens"), daysAgo: 15, durationHours: 1.7, status: SessionStatus.Completed, archived: true, credits: 1.4 },
		{ id: 'fix-remote-reconnect', title: localize('agentsDashboard.demo.remote', "Fix remote reconnection"), daysAgo: 20, durationHours: 9.4, status: SessionStatus.Completed, worktree: true, pullRequest: 'merged', archived: true, credits: 6.8 },
		{ id: 'clean-worktree-state', title: localize('agentsDashboard.demo.cleanup', "Clean stale worktree state"), daysAgo: 25, durationHours: 2.1, status: SessionStatus.Completed, worktree: true, archived: true, credits: 1.9 },
	];
}

function createDemoHistory(now: number): AgentsDashboardHistoryEvent[] {
	const events: AgentsDashboardHistoryEvent[] = [];
	const day = 24 * 60 * 60 * 1000;
	let totalStorage = 420 * 1024 * 1024;
	for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
		const timestamp = now - daysAgo * day - 10 * 60 * 1000;
		const started = 1 + (daysAgo % 3);
		for (let index = 0; index < started; index++) {
			events.push({ id: `demo-started-${daysAgo}-${index}`, type: AgentsDashboardHistoryEventType.SessionStarted, timestamp: timestamp + index * 60_000 });
		}
		const done = daysAgo % 4 === 0 ? 1 : daysAgo % 3;
		for (let index = 0; index < done; index++) {
			events.push({
				id: `demo-done-${daysAgo}-${index}`,
				type: AgentsDashboardHistoryEventType.SessionDone,
				timestamp: timestamp + (index + 2) * 60_000,
				durationMs: (1.5 + (daysAgo + index) % 8) * 60 * 60 * 1000,
			});
		}
		if (daysAgo % 3 === 0) {
			events.push({ id: `demo-pr-created-${daysAgo}`, type: AgentsDashboardHistoryEventType.PullRequestCreated, timestamp: timestamp + 4 * 60_000 });
		}
		if (daysAgo % 5 === 0) {
			events.push({ id: `demo-pr-merged-${daysAgo}`, type: AgentsDashboardHistoryEventType.PullRequestMerged, timestamp: timestamp + 5 * 60_000 });
		}
		totalStorage += ((daysAgo % 5) - 1) * 18 * 1024 * 1024;
		const median = (65 + daysAgo % 7 * 12) * 1024 * 1024;
		events.push({
			id: `demo-disk-${daysAgo}`,
			type: AgentsDashboardHistoryEventType.DiskUsage,
			timestamp: timestamp + 6 * 60_000,
			value: totalStorage,
			medianSessionBytes: median,
			largestSessionBytes: median * (2 + daysAgo % 3),
		});
	}
	return events;
}

function createDemoWorktrees(sessions: readonly ISession[]): IWorktreeDashboardEntry[] {
	const sizes = [184, 96, 312, 520, 72, 264, 408].map(megabytes => megabytes * 1024 * 1024);
	let sizeIndex = 0;
	const entries: IWorktreeDashboardEntry[] = [];
	for (const session of sessions) {
		const folder = session.workspace.get()?.folders.find(candidate => candidate.gitRepository?.workTreeUri);
		const worktreePath = folder?.gitRepository?.workTreeUri;
		if (!folder?.gitRepository || !worktreePath) {
			continue;
		}
		entries.push({
			repositoryRoot: folder.gitRepository.uri,
			worktreePath,
			name: folder.name,
			branchName: folder.gitRepository.branchName,
			status: session.isArchived.get()
				? WorktreeEntryStatus.SessionArchived
				: session.status.get() === SessionStatus.InProgress || session.status.get() === SessionStatus.NeedsInput
					? WorktreeEntryStatus.SessionActive
					: WorktreeEntryStatus.SessionIdle,
			session,
			hasUncommittedChanges: false,
			sizeBytes: sizes[sizeIndex++ % sizes.length],
		});
	}
	return entries;
}

registerWorkbenchContribution2(AgentsDashboardDemoProviderContribution.ID, AgentsDashboardDemoProviderContribution, WorkbenchPhase.AfterRestored);
