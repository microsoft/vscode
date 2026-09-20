/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqualOrParent, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostDetachedWorktrees } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { withAgentDevContainerWorktreeMetadata } from '../../../../../platform/agentHost/common/meta/agentDevContainerWorktreeMeta.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { AgentCustomization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ILanguageModelChatMetadata } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { isAgentHostProvider, IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { DevContainerWorktreeEnabledSettingId, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatModelSource, ISession } from '../../../../services/sessions/common/session.js';
import { WorkspaceNotTrustedError } from '../../../../services/sessions/common/sessionsManagement.js';
import { IPreparedNewSession, ISessionsProviderCreateSessionOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';

function isSameLogicalModel(source: ILanguageModelChatMetadata, target: ILanguageModelChatMetadata): boolean {
	if (source.byokModelIdentifier || target.byokModelIdentifier) {
		return source.byokModelIdentifier !== undefined && source.byokModelIdentifier === target.byokModelIdentifier;
	}
	return source.id === target.id && source.family === target.family && source.version === target.version;
}

function findEquivalentAgent(selectedAgentUri: string, sourceWorkspace: URI, targetWorkspace: URI, targetAgents: readonly AgentCustomization[]): AgentCustomization | undefined {
	const exact = targetAgents.find(agent => agent.uri === selectedAgentUri);
	if (exact) {
		return exact;
	}
	const sourceAgentUri = URI.parse(selectedAgentUri);
	if (!isEqualOrParent(sourceAgentUri, sourceWorkspace)) {
		return undefined;
	}
	const relativeAgentPath = relativePath(sourceWorkspace, sourceAgentUri);
	if (!relativeAgentPath) {
		return undefined;
	}
	return targetAgents.find(agent => {
		const candidate = URI.parse(agent.uri);
		const targetRoot = candidate.with({ path: targetWorkspace.path, query: null, fragment: null });
		return relativePath(targetRoot, candidate) === relativeAgentPath;
	});
}

/** Shares draft selection and first-send handoff between local and remote workspace hosts. */
export abstract class DevContainerAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {
	private readonly _devContainerAvailableDrafts = new Set<string>();
	private readonly _devContainerDrafts = new Set<string>();
	private readonly _pendingDevContainerEnablement = new Set<string>();
	private readonly _devContainerAvailability = new Map<string, Promise<void>>();
	private readonly _devContainerAvailabilityListener = this._register(new MutableDisposable());
	private readonly _onDidChangeDevContainerAvailability = this._register(new Emitter<void>());
	readonly onDidChangeDevContainerAvailability = this._onDidChangeDevContainerAvailability.event;
	private _devContainerSupport: {
		readonly service: IDevContainerAgentHostService;
		readonly providersService: ISessionsProvidersService;
		readonly trustRequestService: IWorkspaceTrustRequestService;
	} | undefined;

	/** Explicit wiring avoids a cycle with the service that constructs container-backed remote providers. */
	initializeDevContainerSupport(service: IDevContainerAgentHostService, providersService: ISessionsProvidersService, trustRequestService: IWorkspaceTrustRequestService): void {
		if (this._devContainerSupport?.service === service && this._devContainerSupport.providersService === providersService && this._devContainerSupport.trustRequestService === trustRequestService) {
			return;
		}
		this._devContainerSupport = { service, providersService, trustRequestService };
		this._devContainerAvailabilityListener.value = service.onDidChangeAvailability?.(() => this._onDidChangeDevContainerAvailability.fire());
		for (const session of this.getKnownSessions()) {
			const workspaceUri = session.workspace.get()?.folders[0]?.root;
			if (workspaceUri && this._getNewSession(session.sessionId)) {
				this._resolveDevContainerAvailability(session.sessionId, workspaceUri);
			}
		}
		this._onDidChangeDevContainerAvailability.fire();
	}

	protected abstract supportsDevContainerWorkspace(workspaceUri: URI): boolean;

	override createNewSession(workspaceUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
		const session = super.createNewSession(workspaceUri, sessionTypeId, options);
		this._resolveDevContainerAvailability(session.sessionId, workspaceUri);
		return session;
	}

	private _resolveDevContainerAvailability(sessionId: string, workspaceUri: URI): void {
		const resolution = this._updateDevContainerAvailability(sessionId, workspaceUri);
		this._devContainerAvailability.set(sessionId, resolution);
		void resolution.finally(() => {
			if (this._devContainerAvailability.get(sessionId) === resolution) {
				this._devContainerAvailability.delete(sessionId);
			}
		});
	}

	private async _updateDevContainerAvailability(sessionId: string, workspaceUri: URI): Promise<void> {
		try {
			const available = await this.isDevContainerWorkspaceAvailable(workspaceUri);
			if (!available || !this._getNewSession(sessionId)) {
				this._pendingDevContainerEnablement.delete(sessionId);
				return;
			}
			this._devContainerAvailableDrafts.add(sessionId);
			if (this._pendingDevContainerEnablement.delete(sessionId)) {
				this._enableDevContainer(sessionId);
			}
			this._onDidChangeSessionConfig.fire(sessionId);
		} catch (error) {
			this._pendingDevContainerEnablement.delete(sessionId);
			this._logService.warn(`[${this.id}] Failed to resolve Dev Container availability for ${workspaceUri.toString()}`, error);
		}
	}

	isDevContainerAvailable(sessionId: string): boolean {
		return this._devContainerAvailableDrafts.has(sessionId);
	}

	async isDevContainerWorkspaceAvailable(workspaceUri: URI): Promise<boolean> {
		return this.supportsDevContainerWorkspace(workspaceUri) && !!await this._devContainerSupport?.service.isAvailable(workspaceUri);
	}

	isDevContainerEnabled(sessionId: string): boolean {
		return this._devContainerDrafts.has(sessionId);
	}

	preferDevContainer(sessionId: string): void {
		if (!this._getNewSession(sessionId)) {
			throw new Error(`Cannot configure unknown new session '${sessionId}'.`);
		}
		if (this._devContainerAvailableDrafts.has(sessionId)) {
			this._enableDevContainer(sessionId);
			this._onDidChangeSessionConfig.fire(sessionId);
		} else {
			this._pendingDevContainerEnablement.add(sessionId);
		}
	}

	setDevContainerEnabled(sessionId: string, enabled: boolean): void {
		if (!this._getNewSession(sessionId)) {
			throw new Error(`Cannot configure unknown new session '${sessionId}'.`);
		}
		if (enabled && !this._devContainerAvailableDrafts.has(sessionId)) {
			throw new Error(`Cannot enable Dev Container execution for unavailable session '${sessionId}'.`);
		}
		if (enabled) {
			this._pendingDevContainerEnablement.delete(sessionId);
			this._enableDevContainer(sessionId);
		} else {
			this._devContainerDrafts.delete(sessionId);
			this._pendingDevContainerEnablement.delete(sessionId);
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	private _enableDevContainer(sessionId: string): void {
		this._devContainerDrafts.add(sessionId);
		if (this._baseConfigurationService.getValue<boolean>(DevContainerWorktreeEnabledSettingId) === true) {
			return;
		}
		const normalizeIsolation = (async () => {
			await this._waitForSessionConfigResolution(this, sessionId, CancellationToken.None);
			if (!this._devContainerDrafts.has(sessionId) || !this._getNewSession(sessionId)) {
				return;
			}
			if (this.getSessionConfig(sessionId)?.values[SessionConfigKey.Isolation] === 'worktree') {
				await this.setSessionConfigValue(sessionId, SessionConfigKey.Isolation, 'folder');
			}
		})();
		this.trackSessionConfigOperation(sessionId, normalizeIsolation);
	}

	override startNewSessionRequest(sessionId: string, activity?: string): IDisposable {
		return super.startNewSessionRequest(sessionId, activity ?? (this._devContainerDrafts.has(sessionId)
			? localize('devContainerAgentHost.starting', "Starting Dev Container...")
			: undefined));
	}

	async prepareNewSession(sessionId: string, token: CancellationToken, query: string): Promise<IPreparedNewSession> {
		const availability = this._devContainerAvailability.get(sessionId);
		const awaitingAvailability = availability && this._pendingDevContainerEnablement.has(sessionId);
		const draft = this._getNewSession(sessionId);
		if (!draft) {
			throw new Error(`Cannot prepare unknown new session '${sessionId}'.`);
		}
		if (!awaitingAvailability && !this._devContainerDrafts.has(sessionId)) {
			return { session: draft.session };
		}
		const preparation = new CancellationTokenSource(token);
		const cancel = () => preparation.cancel();
		const progress = (message: string, showLog = draft.preparationProgress.get()?.showLog) => {
			draft.preparationProgress.set({
				message,
				showLog,
				cancel,
			}, undefined);
		};
		progress(localize('devContainerAgentHost.preparing', "Preparing Dev Container..."));
		try {
			if (awaitingAvailability) {
				await raceCancellationError(availability, preparation.token);
			}
			if (preparation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!this._devContainerDrafts.has(sessionId)) {
				return { session: draft.session };
			}
			return await this._prepareDevContainerSession(sessionId, preparation.token, query, progress);
		} finally {
			draft.preparationProgress.set(undefined, undefined);
			preparation.dispose();
		}
	}

	private async _prepareDevContainerSession(sessionId: string, token: CancellationToken, query: string, progress: (message: string, showLog?: () => void) => void): Promise<IPreparedNewSession> {
		const draft = this._getNewSession(sessionId);
		if (!draft) {
			throw new Error(`Cannot prepare unknown new session '${sessionId}'.`);
		}
		const support = this._devContainerSupport;
		if (!support) {
			throw new Error('Dev Container support has not been initialized.');
		}
		const sourceWorkspace = draft.session.workspace.get()?.folders[0]?.root;
		if (!sourceWorkspace) {
			throw new Error(localize('devContainerAgentHost.workspaceRequired', "Dev Container sessions require a workspace."));
		}
		const trusted = await support.trustRequestService.requestResourcesTrust({
			uri: sourceWorkspace,
			message: localize('devContainerAgentHost.trustFolder', "Starting the Dev Container can run lifecycle commands from this workspace."),
		});
		if (!trusted) {
			throw new WorkspaceNotTrustedError();
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		await this._waitForSessionConfigResolution(this, sessionId, token);
		const sourceConfig = this.getSessionConfig(sessionId);
		let devContainerWorkspace = sourceWorkspace;
		let detachedWorktree: { readonly handle: string; readonly worktree: URI; readonly connection: IAgentConnection } | undefined;
		if (sourceConfig?.values[SessionConfigKey.Isolation] === 'worktree') {
			progress(localize('devContainerAgentHost.preparingWorktree', "Preparing worktree for Dev Container..."));
			await raceCancellationError(draft.waitForEagerCreate(), token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const connection = this.connection;
			if (!connection || !supportsAgentHostDetachedWorktrees(connection.initializeResult.get()) || !connection.createDetachedWorktree || !connection.claimDetachedWorktree || !connection.deleteDetachedWorktree) {
				throw new Error(localize('devContainerAgentHost.worktreePreparationUnsupported', "The source Agent Host does not support preparing a worktree for a Dev Container."));
			}
			detachedWorktree = { ...await connection.createDetachedWorktree(draft.backendUri, query), connection };
			try {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				devContainerWorkspace = this.mapProjectUri(detachedWorktree.worktree);
				await this._workspaceTrustManagementService.setUrisTrust([devContainerWorkspace], true);
			} catch (error) {
				await this._deleteDetachedWorktreeOnRollback(detachedWorktree);
				throw error;
			}
		}

		let target: Awaited<ReturnType<IDevContainerAgentHostService['connect']>>;
		try {
			progress(localize('devContainerAgentHost.starting', "Starting Dev Container..."), () => {
				void support.service.showLog(devContainerWorkspace).catch(onUnexpectedError);
			});
			target = await support.service.connect(devContainerWorkspace, token);
		} catch (error) {
			if (detachedWorktree) {
				await this._deleteDetachedWorktreeOnRollback(detachedWorktree);
			}
			throw error;
		}
		let deleteReplacement: (() => void) | undefined;
		try {
			progress(localize('devContainerAgentHost.initializing', "Initializing Agent Host session..."));
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			await this._workspaceTrustManagementService.setUrisTrust([target.workspaceUri], true);
			const targetProvider = support.providersService.getProvider(target.providerId);
			if (!targetProvider || !isAgentHostProvider(targetProvider)) {
				throw new Error(localize('devContainerAgentHost.providerUnavailable', "Dev Container sessions provider '{0}' is not available.", target.providerId));
			}
			const targetSessionType = targetProvider.getSessionTypes(target.workspaceUri)
				.find(sessionType => sessionType.id === draft.agentProvider)
				?? targetProvider.getSessionTypes(target.workspaceUri)[0];
			if (!targetSessionType) {
				throw new Error(localize('devContainerAgentHost.noAgents', "The Dev Container Agent Host did not advertise any agents."));
			}
			const replacement = targetProvider.createNewSession(target.workspaceUri, targetSessionType.id, {
				metadata: detachedWorktree ? withAgentDevContainerWorktreeMetadata(undefined, detachedWorktree.handle) : undefined,
			});
			const discardReplacement = () => targetProvider.deleteNewSession(replacement.sessionId);
			deleteReplacement = discardReplacement;
			if (detachedWorktree) {
				await detachedWorktree.connection.claimDetachedWorktree!(detachedWorktree.handle);
			}
			await this._waitForSessionConfigResolution(targetProvider, replacement.sessionId, token);
			if (detachedWorktree) {
				await targetProvider.setSessionConfigValue(replacement.sessionId, SessionConfigKey.Isolation, 'folder');
				await this._waitForSessionConfigResolution(targetProvider, replacement.sessionId, token);
			}
			const targetConfig = targetProvider.getSessionConfig(replacement.sessionId);
			if (sourceConfig) {
				for (const [property, value] of Object.entries(sourceConfig.values)) {
					if (detachedWorktree && property === SessionConfigKey.Isolation) {
						continue;
					}
					const targetProperty = targetConfig?.schema.properties[property];
					if (!targetProperty || targetProperty.readOnly) {
						continue;
					}
					await targetProvider.setSessionConfigValue(replacement.sessionId, property, value);
				}
			}
			const sourceChat = draft.session.mainChat.get();
			const replacementChat = replacement.mainChat.get();
			const modelId = sourceChat.modelId.get();
			const sourceModelSnapshot = this.getModelsSnapshot(sessionId, modelId);
			const sourceModel = sourceModelSnapshot.models.find(model => model.identifier === modelId)
				?? (sourceModelSnapshot.desiredModelResolution.kind === 'available' ? sourceModelSnapshot.desiredModelResolution.model : undefined);
			const targetModel = sourceModel
				? targetProvider.getModelsSnapshot(replacement.sessionId).models.find(model => isSameLogicalModel(sourceModel.metadata, model.metadata))
				: undefined;
			if (targetModel) {
				targetProvider.setModel(replacement.sessionId, replacementChat.resource, targetModel.identifier, sourceChat.modelSource.get() ?? ChatModelSource.CarriedOver);
			}
			const selectedAgentUri = sourceChat.mode.get()?.id;
			const targetAgents = selectedAgentUri ? targetProvider.getCustomAgents(replacement.sessionId) : [];
			const targetAgent = selectedAgentUri
				? targetAgents.find(agent => agent.uri === selectedAgentUri)
				?? findEquivalentAgent(this.mapProjectUri(URI.parse(selectedAgentUri)).toString(), sourceWorkspace, target.workspaceUri, targetAgents)
				: undefined;
			if (targetAgent) {
				targetProvider.setAgent?.(replacement.sessionId, { uri: targetAgent.uri, name: targetAgent.name });
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return {
				session: replacement,
				discard: async () => {
					try {
						discardReplacement();
						if (detachedWorktree) {
							await this._deleteDetachedWorktreeOnRollback(detachedWorktree);
						}
					} finally {
						await target.release();
					}
				},
			};
		} catch (error) {
			try {
				deleteReplacement?.();
				if (detachedWorktree) {
					await this._deleteDetachedWorktreeOnRollback(detachedWorktree);
				}
			} finally {
				await target.release();
			}
			throw error;
		}
	}

	private async _deleteDetachedWorktreeOnRollback(worktree: { readonly handle: string; readonly connection: IAgentConnection }): Promise<void> {
		try {
			await worktree.connection.deleteDetachedWorktree?.(worktree.handle);
		} catch (error) {
			this._logService.error(`[${this.id}] Failed to delete detached Dev Container worktree '${worktree.handle}' during rollback.`, error);
		}
	}

	private async _waitForSessionConfigResolution(provider: IAgentHostSessionsProvider, sessionId: string, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		while (provider.isSessionConfigResolving(sessionId).get()) {
			await raceCancellationError(Event.toPromise(Event.filter(provider.onDidChangeSessionConfig, changedSessionId => changedSessionId === sessionId)), token);
		}
	}

	override deleteNewSession(sessionId: string): void {
		this._devContainerAvailability.delete(sessionId);
		this._devContainerAvailableDrafts.delete(sessionId);
		this._devContainerDrafts.delete(sessionId);
		this._pendingDevContainerEnablement.delete(sessionId);
		super.deleteNewSession(sessionId);
	}

	protected override _disposeAllNewSessions(): void {
		this._devContainerAvailability.clear();
		this._devContainerAvailableDrafts.clear();
		this._devContainerDrafts.clear();
		this._pendingDevContainerEnablement.clear();
		super._disposeAllNewSessions();
	}
}
