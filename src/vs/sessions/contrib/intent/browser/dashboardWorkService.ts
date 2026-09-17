/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { derived, IObservable, observableSignalFromEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionInputDraftService } from '../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity, ISession, SessionStatus, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IDashboardExecutionTarget, IDashboardStartWork, IDashboardWorkDiscovery, IDashboardWorkExecution, IDashboardWorkService } from '../common/dashboardWork.js';
import { parseIntentRepository, sameIntentRepository } from '../common/sessionIntent.js';
import { WorkspaceCandidateResolver } from './workspaceCandidates.js';

const STORAGE_KEY = 'sessions.dashboard.agentWork';
const CONTEXT_ID = 'sessions.dashboard.agentWork.context';
const instructions = `Handle the user's outcome as a dashboard work conversation. Start without requiring a repository selection, and use the attached workspace when one is present. You own repository and execution decisions; setup pickers are not required.
Use dashboard_discover_work to inspect verified checkouts and eligible local, remote, or cloud targets. Ask native questions when the task or destination is genuinely ambiguous. Explain a proposed execution choice briefly; do not ask the user to operate dashboard buttons.
For a simple local task, you may confirm the exact folder and isolation through the native question and use set_workspace as the turn's final tool call. Preserve its existing approval and host-owned continuation.
For separate or parallel execution, use dashboard_start_work with a target from discovery. A worker is a separate session, not migration of this conversation. Read its output with dashboard_read_work; do not assume a local path or permission grant exists on another host.
Use dashboard_clone_repository only when a checkout is needed and an exact parent directory is known. These tools use the existing runtime permission and trust gates. Respect unavailable targets and failures; never invent a checkout, cloud access, or completed work.
Use stable operation IDs for setup and execution. Do not repeat an uncertain start with a new ID. Background workers run on their own provider; these discovery/control tools require this client to remain connected.`;

interface IExecutionRecord {
	state: IDashboardWorkExecution;
	readonly fingerprint: string;
	promise?: Promise<IDashboardWorkExecution>;
}

interface IStoredExecutionRecord {
	readonly fingerprint: string;
	readonly state: Omit<IDashboardWorkExecution, 'source' | 'sessionResource'> & { readonly source: string; readonly sessionResource?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredExecution(value: unknown): value is IStoredExecutionRecord {
	if (!isRecord(value) || typeof value.fingerprint !== 'string' || !isRecord(value.state)) { return false; }
	const state = value.state;
	return typeof state.id === 'string' && state.id.length > 0 && typeof state.source === 'string'
		&& typeof state.title === 'string' && typeof state.target === 'string'
		&& (state.phase === 'starting' || state.phase === 'started' || state.phase === 'failed' || state.phase === 'unknown')
		&& (state.sessionResource === undefined || typeof state.sessionResource === 'string')
		&& (state.error === undefined || typeof state.error === 'string');
}

function executionStatus(session: ISession): string {
	switch (session.status.get()) {
		case SessionStatus.InProgress: return 'inProgress';
		case SessionStatus.NeedsInput: return 'inputNeeded';
		case SessionStatus.Error: return 'error';
		case SessionStatus.Untitled: return 'draft';
		default: return session.isArchived.get() ? 'archived' : 'completed';
	}
}

/** Experimental dashboard orchestration. No method opens or replaces the regular Quick Chat composer. */
export class DashboardWorkService extends Disposable implements IDashboardWorkService {
	declare readonly _serviceBrand: undefined;
	private readonly _sessions = observableValue<readonly ISession[]>(this, []);
	readonly sessions = this._sessions;
	private readonly _draft = observableValue<ISession | undefined>(this, undefined);
	readonly draft = this._draft;
	private readonly _executions = observableValue<readonly IDashboardWorkExecution[]>(this, []);
	readonly executions = this._executions;
	private readonly owned = new Set<string>();
	private readonly discoveries = new ResourceMap<IDashboardWorkDiscovery>();
	private readonly discoveryRevisions = new ResourceMap<number>();
	private readonly aliases = new ResourceMap<URI>();
	private readonly chatAliases = new ResourceMap<URI>();
	private readonly catalogChanges: IObservable<void>;
	private nextDiscoveryRevision = 0;
	private readonly operations = new Map<string, IExecutionRecord>();
	private readonly clones = new Map<string, Promise<IDashboardWorkDiscovery>>();
	private readonly resolver: Lazy<WorkspaceCandidateResolver>;

	constructor(
		@ISessionsManagementService private readonly management: ISessionsManagementService,
		@ISessionsProvidersService private readonly providers: ISessionsProvidersService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@IChatEntitlementService private readonly entitlement: IChatEntitlementService,
		@IFileService private readonly files: IFileService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService,
		@IChatService private readonly chats: IChatService,
		@IStorageService private readonly storage: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiation: IInstantiationService,
	) {
		super();
		this.resolver = new Lazy(() => instantiation.createInstance(WorkspaceCandidateResolver));
		this.catalogChanges = observableSignalFromEvent(this, Event.any(management.onDidChangeSessions, management.onDidReplaceSession, management.onDidDeleteSession));
		this.restore();
		this._register(management.onDidChangeSessions(() => this.refreshSessions()));
		this._register(management.onDidReplaceSession(({ from, to }) => {
			let changed = false;
			for (const operation of this.operations.values()) {
				if (isEqual(operation.state.sessionResource, from.resource)) {
					operation.state = { ...operation.state, sessionResource: to.resource };
					changed = true;
				}
			}
			if (changed) { this.publish(); }
			if (!this.owned.delete(from.resource.toString())) { return; }
			this.owned.add(to.resource.toString());
			for (const [alias, resource] of this.aliases) {
				if (isEqual(resource, from.resource)) { this.aliases.set(alias, to.resource); }
			}
			this.aliases.set(from.resource, to.resource);
			for (const [alias, resource] of this.chatAliases) {
				if (isEqual(resource, from.mainChat.get().resource)) { this.chatAliases.set(alias, to.mainChat.get().resource); }
			}
			this.chatAliases.set(from.mainChat.get().resource, to.mainChat.get().resource);
			this.drafts.rebindDraft(from.mainChat.get().resource, to.mainChat.get().resource);
			const discovery = this.discoveries.get(from.resource);
			this.discoveries.delete(from.resource);
			if (discovery) { this.discoveries.set(to.resource, discovery); }
			const revision = this.discoveryRevisions.get(from.resource);
			this.discoveryRevisions.delete(from.resource);
			if (revision !== undefined) { this.discoveryRevisions.set(to.resource, revision); }
			transaction(tx => {
				if (isEqual(this._draft.get()?.resource, from.resource)) { this._draft.set(to, tx); }
				this._sessions.set(this._sessions.get().map(session => isEqual(session.resource, from.resource) ? to : session), tx);
			});
			for (const [key, operation] of [...this.operations]) {
				if (isEqual(operation.state.source, from.resource)) {
					this.operations.delete(key);
					operation.state = { ...operation.state, source: to.resource };
					const newKey = `${to.resource.toString()}:${operation.state.id}`;
					this.operations.set(newKey, operation);
					const clone = this.clones.get(key);
					this.clones.delete(key);
					if (clone) { this.clones.set(newKey, clone); }
				}
			}
			this.publish();
		}));
		this._register(management.onDidDeleteSession(session => {
			if (!this.owned.delete(session.resource.toString())) { return; }
			this.discoveries.delete(session.resource);
			this.discoveryRevisions.delete(session.resource);
			for (const [key, operation] of this.operations) {
				if (isEqual(operation.state.source, session.resource)) {
					this.operations.delete(key);
					this.clones.delete(key);
				}
			}
			if (isEqual(this._draft.get()?.resource, session.resource)) { this._draft.set(undefined, undefined); }
			this.refreshSessions();
			this.publish();
		}));
		this.refreshSessions();
	}

	async start(): Promise<ISession> {
		this.assertEnabled();
		const existing = this._draft.get();
		if (existing) { return existing; }
		const targets = this.management.getQuickChatSessionTypes().filter(target =>
			this.providers.getProvider(target.providerId)?.supportsLocalWorkspaces
			&& target.sessionType.authRequirement !== SessionTypeAuthRequirement.Unusable
			&& target.sessionType.supportsWorkspaceConversion);
		const target = targets[0];
		if (!target) { throw new Error(localize('dashboardWork.noAgent', "No local agent is currently available for dashboard work. Your input is kept; connect an eligible agent and retry.")); }
		const session = this.management.createSessionDraft(undefined, { providerId: target.providerId, sessionTypeId: target.sessionType.id });
		this.owned.add(session.resource.toString());
		transaction(tx => {
			this._sessions.set([...this._sessions.get(), session], tx);
			this._draft.set(session, tx);
		});
		this.save();
		return session;
	}

	async send(session: ISession, query: string, attachments: readonly IChatRequestVariableEntry[]): Promise<ISession> {
		session = this.requireSession(session);
		const context: IChatRequestVariableEntry = { kind: 'promptText', id: CONTEXT_ID, name: localize('dashboardWork.context', "Dashboard Work"), modelDescription: 'Dashboard work orchestration', automaticallyAdded: true, value: instructions };
		const options = { query, attachedContext: [...attachments.filter(attachment => attachment.id !== CONTEXT_ID), context], preservePendingDraft: true };
		if (session.status.get() === SessionStatus.Untitled) {
			if (this._draft.get() !== session) { throw new Error(localize('dashboardWork.staleDraft', "This dashboard draft was replaced. Reopen New Work.")); }
			const committed = await this.management.sendSessionDraft(session, options);
			if (!committed) { throw new Error(localize('dashboardWork.closed', "The work session closed before the request was accepted.")); }
			this.owned.delete(session.resource.toString());
			this.owned.add(committed.resource.toString());
			transaction(tx => {
				this._draft.set(undefined, tx);
				this._sessions.set(this._sessions.get().map(value => isEqual(value.resource, session.resource) ? committed : value), tx);
			});
			this.save();
			return committed;
		}
		await this.management.sendRequest(session, session.mainChat.get(), options);
		return session;
	}

	discardDraft(): void {
		const session = this._draft.get();
		if (!session) { return; }
		this.management.discardSessionDraft(session);
		this.owned.delete(session.resource.toString());
		transaction(tx => {
			this._draft.set(undefined, tx);
			this._sessions.set(this._sessions.get().filter(value => value !== session), tx);
		});
		this.save();
	}

	getSessionForChat(resource: URI): ISession | undefined {
		resource = this.chatAliases.get(resource) ?? resource;
		return this._sessions.get().find(session => isEqual(session.mainChat.get().resource, resource));
	}

	async discover(session: ISession, repository: string | undefined, token: CancellationToken): Promise<IDashboardWorkDiscovery> {
		session = this.requireSession(session);
		const repo = repository ? parseIntentRepository(repository) : undefined;
		if (repository && !repo) { throw new Error(localize('dashboardWork.repository', "Use an exact HTTPS github.com repository, issue, or pull request URL.")); }
		const revision = ++this.nextDiscoveryRevision;
		this.discoveryRevisions.set(session.resource, revision);
		this.discoveries.delete(session.resource);
		const candidates = await this.resolver.value.resolve({ repository: repo }, revision, token);
		const targets: IDashboardExecutionTarget[] = [];
		for (const candidate of candidates) {
			if (candidate.validation !== 'verified' || repo && !sameIntentRepository(repo, candidate.repository)) { continue; }
			for (const target of this.management.getSessionTypesForFolder(candidate.folder)) {
				const provider = this.providers.getProvider(target.providerId);
				if (!provider || target.sessionType.authRequirement === SessionTypeAuthRequirement.Unusable) { continue; }
				targets.push({
					id: generateUuid(), revision, kind: provider.supportsLocalWorkspaces ? 'local' : 'remote',
					label: `${provider.label}: ${candidate.folder.fsPath}`, providerId: target.providerId, sessionTypeId: target.sessionType.id,
					folder: candidate.folder, candidateId: candidate.id,
					supportsWorktree: target.sessionType.supportsWorktreeConfiguration === true && candidate.worktree === 'available',
					availability: 'available', reason: candidate.reason,
				});
			}
		}
		const remoteFolders = new Set<string>();
		for (const known of this.management.getSessions()) {
			const provider = this.providers.getProvider(known.providerId);
			const workspace = known.workspace.get();
			if (!provider || provider.supportsLocalWorkspaces || !workspace || known.isArchived.get()) { continue; }
			for (const folder of workspace.folders) {
				if (folder.root.scheme === Schemas.file) { continue; }
				const key = `${provider.id}:${folder.root.toString()}`;
				if (remoteFolders.has(key)) { continue; }
				remoteFolders.add(key);
				for (const type of provider.getSessionTypes(folder.root)) {
					if (type.authRequirement === SessionTypeAuthRequirement.Unusable) { continue; }
					targets.push({
						id: generateUuid(), revision, kind: 'remote', label: `${provider.label}: ${workspace.label}`,
						providerId: provider.id, sessionTypeId: type.id, folder: folder.root,
						supportsWorktree: type.supportsWorktreeConfiguration === true, availability: 'unknown',
						reason: localize('dashboardWork.knownRemote', "Known workspace on this execution provider. Connection and repository applicability must be rechecked before starting."),
					});
				}
			}
		}
		if (repo) {
			for (const provider of this.providers.getProviders()) {
				for (const action of provider.workspaceIntentActions ?? []) {
					if (action.kind !== 'cloud' || action.availability === 'unavailable') { continue; }
					const workspace = action.resolveRepositoryWorkspace?.(repo);
					const folder = workspace?.folders[0]?.root;
					if (!workspace?.isVirtualWorkspace || !folder) { continue; }
					for (const type of provider.getSessionTypes(folder)) {
						if (type.authRequirement === SessionTypeAuthRequirement.Unusable) { continue; }
						targets.push({
							id: generateUuid(), revision, kind: 'cloud', label: `${provider.label}: ${workspace.label}`, providerId: provider.id,
							sessionTypeId: type.id, folder, supportsWorktree: false, availability: 'unknown', reason: action.reason
						});
					}
				}
			}
		}
		if (token.isCancellationRequested) { throw new CancellationError(); }
		session = this.requireSession(session);
		if (this.discoveryRevisions.get(session.resource) !== revision) { throw new CancellationError(); }
		const discovery = { revision, candidates, targets };
		this.discoveries.set(session.resource, discovery);
		return discovery;
	}

	resolveTarget(session: ISession, id: string, revision: number): IDashboardExecutionTarget {
		session = this.requireSession(session);
		const discovery = this.discoveries.get(session.resource);
		const target = discovery?.revision === revision ? discovery.targets.find(target => target.id === id) : undefined;
		if (!target) { throw new Error(localize('dashboardWork.staleTarget', "This execution target has changed. Discover targets again before starting work.")); }
		return target;
	}

	async startWork(session: ISession, options: IDashboardStartWork, token: CancellationToken): Promise<IDashboardWorkExecution> {
		session = this.requireSession(session);
		const key = `${session.resource.toString()}:${options.operationId}`;
		const fingerprint = JSON.stringify(options);
		const existing = this.operations.get(key);
		if (existing) {
			if (existing.fingerprint !== fingerprint) { throw new Error(localize('dashboardWork.operationChanged', "This operation ID was already used for different work.")); }
			if (existing.promise) { await existing.promise; }
			return existing.state;
		}
		const target = this.resolveTarget(session, options.targetId, options.revision);
		const record: IExecutionRecord = { fingerprint, state: { id: options.operationId, source: session.resource, title: options.title, target: target.label, phase: 'starting' } };
		this.operations.set(key, record);
		this.publish();
		record.promise = this.execute(session, target, options, record, token);
		return record.promise;
	}

	private async execute(source: ISession, target: IDashboardExecutionTarget, options: IDashboardStartWork, record: IExecutionRecord, token: CancellationToken): Promise<IDashboardWorkExecution> {
		try {
			if (options.isolation === 'worktree' && !target.supportsWorktree) { throw new Error(localize('dashboardWork.noWorktree', "This target cannot create a managed worktree.")); }
			if (target.candidateId) {
				const candidate = this.discoveries.get(source.resource)?.candidates.find(candidate => candidate.id === target.candidateId);
				const verified = await this.resolver.value.validate(target.folder, target.revision, true);
				if (verified.validation !== 'verified' || candidate?.repository && !sameIntentRepository(candidate.repository, verified.repository)) {
					throw new Error(localize('dashboardWork.changedWorkspace', "The selected checkout could not be revalidated."));
				}
			}
			const workspace = this.management.resolveWorkspace(target.folder, target.providerId)?.workspace;
			if (!workspace || !this.management.isNewSessionTargetAvailable(target.folder, { providerId: target.providerId, sessionTypeId: target.sessionTypeId })) {
				throw new Error(localize('dashboardWork.targetUnavailable', "The execution provider is no longer available for this workspace."));
			}
			if (workspace.requiresWorkspaceTrust && !await this.trust.requestResourcesTrust({ uri: target.folder, message: localize('dashboardWork.trust', "The selected agent can read files, run commands, and make changes in this workspace.") })) {
				throw new CancellationError();
			}
			source = this.requireSession(source);
			this.resolveTarget(source, target.id, target.revision);
			if (workspace.requiresWorkspaceTrust && target.candidateId) {
				const candidate = this.discoveries.get(source.resource)?.candidates.find(candidate => candidate.id === target.candidateId);
				const verified = await this.resolver.value.validate(target.folder, target.revision, true);
				if (verified.validation !== 'verified' || candidate?.repository && !sameIntentRepository(candidate.repository, verified.repository)) {
					throw new Error(localize('dashboardWork.changedWorkspace', "The selected checkout could not be revalidated."));
				}
			}
			source = this.requireSession(source);
			this.resolveTarget(source, target.id, target.revision);
			if (token.isCancellationRequested) { throw new CancellationError(); }
			const currentWorkspace = this.management.resolveWorkspace(target.folder, target.providerId)?.workspace;
			const currentType = this.management.getSessionTypesForFolder(target.folder).find(type => type.providerId === target.providerId && type.sessionType.id === target.sessionTypeId);
			if (!currentWorkspace || !isEqual(currentWorkspace.uri, workspace.uri)
				|| currentWorkspace.requiresWorkspaceTrust !== workspace.requiresWorkspaceTrust
				|| !currentType || target.supportsWorktree && currentType.sessionType.supportsWorktreeConfiguration !== true
				|| !this.management.isNewSessionTargetAvailable(target.folder, { providerId: target.providerId, sessionTypeId: target.sessionTypeId })) {
				throw new Error(localize('dashboardWork.targetUnavailable', "The execution provider is no longer available for this workspace."));
			}
			const session = await this.management.createAndSendNewChatRequest(target.folder, {
				query: options.prompt, preservePendingDraft: true,
			}, {
				providerId: target.providerId, sessionTypeId: target.sessionTypeId,
				...(currentType.sessionType.supportsWorktreeConfiguration ? { isolationMode: target.supportsWorktree && options.isolation !== 'folder' ? 'worktree' : 'workspace' } : {}),
				onSessionCreated: session => {
					record.state = { ...record.state, sessionResource: session.resource };
					this.publish();
				},
			}, token);
			if (!session) { throw new CancellationError(); }
			record.state = { ...record.state, phase: 'started', sessionResource: session.resource };
			this.publish();
			return record.state;
		} catch (error) {
			record.state = { ...record.state, phase: record.state.sessionResource ? 'unknown' : 'failed', error: toErrorMessage(error) };
			this.publish();
			throw error;
		}
	}

	async cloneRepository(session: ISession, operationId: string, repository: string, destinationParent: URI, token: CancellationToken): Promise<IDashboardWorkDiscovery> {
		session = this.requireSession(session);
		const key = `${session.resource.toString()}:${operationId}`;
		const repo = parseIntentRepository(repository);
		if (!repo || destinationParent.scheme !== Schemas.file || destinationParent.authority) {
			throw new Error(localize('dashboardWork.cloneTarget', "Use an exact repository URL and an existing local parent directory."));
		}
		const fingerprint = JSON.stringify({ clone: repo, destinationParent: destinationParent.toString() });
		const previous = this.operations.get(key);
		if (previous) {
			if (previous.fingerprint !== fingerprint) { throw new Error(localize('dashboardWork.operationChanged', "This operation ID was already used for different work.")); }
			const existing = this.clones.get(key);
			if (existing) { return existing; }
			if (previous.state.phase === 'started') { return this.discover(session, repository, token); }
			throw new Error(localize('dashboardWork.cloneUncertain', "The previous clone outcome needs inspection. Check the destination before attempting another clone."));
		}
		const action = this.providers.getProviders().flatMap(provider => provider.workspaceIntentActions ?? []).find(action => action.kind === 'clone' && action.availability !== 'unavailable');
		if (!action) { throw new Error(localize('dashboardWork.cloneUnavailable', "No eligible local clone provider is available.")); }
		const record: IExecutionRecord = { fingerprint, state: { id: operationId, source: session.resource, title: localize('dashboardWork.cloneTitle', "Clone {0}/{1}", repo.owner, repo.repo), target: destinationParent.toString(), phase: 'starting' } };
		this.operations.set(key, record);
		this.publish();
		const clone = (async () => {
			let requested = false;
			try {
				if (!(await this.files.stat(destinationParent)).isDirectory) { throw new Error(localize('dashboardWork.cloneTarget', "Use an exact repository URL and an existing local parent directory.")); }
				session = this.requireSession(session);
				if (token.isCancellationRequested) { throw new CancellationError(); }
				requested = true;
				const result = await action.run(repo, { destinationParent });
				if (result.kind === 'cancelled') { throw new CancellationError(); }
				const folder = result.workspace.folders[0]?.root;
				if (!folder) { throw new Error(localize('dashboardWork.cloneNoFolder', "The clone operation did not return a checkout.")); }
				const verified = await this.resolver.value.validate(folder, 0, true);
				if (verified.validation !== 'verified' || !sameIntentRepository(repo, verified.repository)) { throw new Error(localize('dashboardWork.cloneMismatch', "The cloned checkout did not match the requested repository.")); }
				record.state = { ...record.state, phase: 'started' };
				this.publish();
				return this.discover(session, repository, token);
			} catch (error) {
				record.state = { ...record.state, phase: requested ? 'unknown' : 'failed', error: toErrorMessage(error) };
				this.publish();
				throw error;
			}
		})();
		this.clones.set(key, clone);
		try { return await clone; }
		finally {
			const source = this.aliases.get(session.resource) ?? session.resource;
			this.clones.delete(`${source.toString()}:${operationId}`);
		}
	}

	async readWork(source: ISession, id: string, token: CancellationToken, wait = false) {
		source = this.requireSession(source);
		const record = this.operations.get(`${source.resource.toString()}:${id}`);
		if (!record) { throw new Error(localize('dashboardWork.unknownWork', "This execution does not belong to the current dashboard conversation.")); }
		const current = derived(reader => {
			this.catalogChanges.read(reader);
			this._executions.read(reader);
			const parent = this._sessions.read(reader).find(session => isEqual(session.resource, record.state.source));
			const session = record.state.sessionResource ? this.management.getSession(record.state.sessionResource) : undefined;
			return { session, status: session?.status.read(reader), archived: session?.isArchived.read(reader), parentAvailable: !!parent && !parent.isArchived.read(reader) };
		});
		const state = wait ? await waitForState(current, state => !state.parentAvailable || !state.session || state.archived || state.status !== SessionStatus.InProgress, undefined, token) : current.get();
		this.requireSession(source);
		if (token.isCancellationRequested) { throw new CancellationError(); }
		const session = state.session;
		if (!session) {
			return { execution: record.state, status: 'unavailable', output: localize('dashboardWork.outputUnavailable', "The execution output is not currently available.") };
		}
		const reference = await this.chats.acquireOrLoadSession(session.mainChat.get().resource, ChatAgentLocation.Chat, token);
		if (!reference) { return { execution: record.state, status: executionStatus(session), output: localize('dashboardWork.outputUnavailable', "The execution output is not currently available.") }; }
		try {
			this.requireSession(source);
			if (token.isCancellationRequested) { throw new CancellationError(); }
			const output = reference.object.getRequests().slice(-3).map(request => request.response?.response.toString() ?? '').join('\n\n');
			return { execution: record.state, status: executionStatus(session), output: output.slice(-20000), truncated: output.length > 20000 };
		} finally { reference.dispose(); }
	}

	private requireSession(session: ISession): ISession {
		this.assertEnabled();
		const resource = this.aliases.get(session.resource) ?? session.resource;
		const current = this._sessions.get().find(value => isEqual(value.resource, resource));
		if (!current || !this.owned.has(current.resource.toString()) || current.isArchived.get() || current.mainChat.get().interactivity.get() !== ChatInteractivity.Full) {
			throw new Error(localize('dashboardWork.notOwned', "This operation is available only to a dashboard-created conversation."));
		}
		return current;
	}

	private assertEnabled(): void {
		const sentiment = this.entitlement.sentiment;
		if (sentiment.hidden || sentiment.disabled || sentiment.disabledInWorkspace) { throw new Error(localize('dashboardWork.disabled', "Dashboard agent work is not available while AI features are disabled.")); }
	}

	private refreshSessions(): void {
		if (!this.owned.size && !this._sessions.get().length) { return; }
		const previous = this._sessions.get();
		const sessions = [...this.owned].flatMap(resource => this.management.getSession(URI.parse(resource)) ?? previous.find(session => session.resource.toString() === resource) ?? []);
		this._sessions.set(sessions, undefined);
	}

	private publish(): void {
		this._executions.set([...this.operations.values()].map(record => record.state), undefined);
		this.save();
	}

	private restore(): void {
		const raw = this.storage.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) { return; }
		try {
			const value: unknown = JSON.parse(raw);
			if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sessions) || !Array.isArray(value.executions)) { throw new Error('Invalid dashboard execution state'); }
			const sessions = new Set<string>();
			const operations = new Map<string, IExecutionRecord>();
			for (const resource of value.sessions) {
				if (typeof resource !== 'string') { throw new Error('Invalid dashboard conversation resource'); }
				sessions.add(URI.parse(resource, true).toString());
			}
			for (const record of value.executions) {
				if (!isStoredExecution(record)) { throw new Error('Invalid dashboard execution record'); }
				const state = {
					...record.state, source: URI.parse(record.state.source, true), sessionResource: record.state.sessionResource ? URI.parse(record.state.sessionResource, true) : undefined,
					phase: record.state.phase === 'starting' ? 'unknown' as const : record.state.phase
				};
				const key = `${state.source.toString()}:${state.id}`;
				if (!sessions.has(state.source.toString()) || operations.has(key)) { throw new Error('Invalid dashboard execution ownership'); }
				operations.set(key, { fingerprint: record.fingerprint, state });
			}
			for (const resource of sessions) { this.owned.add(resource); }
			for (const [key, record] of operations) { this.operations.set(key, record); }
			this._executions.set([...this.operations.values()].map(record => record.state), undefined);
		} catch (error) { this.logService.warn('[DashboardWork] Could not restore work state', error); }
	}

	private save(): void {
		this.storage.store(STORAGE_KEY, JSON.stringify({
			version: 1, sessions: [...this.owned].filter(resource => resource !== this._draft.get()?.resource.toString() || this._draft.get()?.status.get() !== SessionStatus.Untitled),
			executions: [...this.operations.values()].map(record => ({
				fingerprint: record.fingerprint, state: {
					...record.state, source: record.state.source.toString(), sessionResource: record.state.sessionResource?.toString(),
				}
			})),
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
