/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import { SequencerByKey } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import type { IAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IParsedPlugin, parsePlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentDescriptor, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { CustomizationStatus, ICustomizationRef, type IPendingMessage, type PolicyState } from '../../common/state/sessionState.js';
import { CopilotAgentSession, SessionWrapperFactory } from './copilotAgentSession.js';
import { parsedPluginsEqual, toSdkCustomAgents, toSdkHooks, toSdkMcpServers, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { forkCopilotSessionOnDisk, getCopilotDataDir, truncateCopilotSessionOnDisk } from './copilotAgentForking.js';

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilot' as const;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotAgentSession>());
	private readonly _sessionSequencer = new SequencerByKey<string>();
	private readonly _plugins: PluginController;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
		this._plugins = this._instantiationService.createInstance(PluginController);
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilot',
			displayName: 'Agent Host - Copilot',
			description: 'Copilot SDK agent running in a dedicated process',
			requiresAuth: true,
		};
	}

	getProtectedResources(): IAuthorizationProtectedResourceMetadata[] {
		return [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
		}];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== 'https://api.github.com') {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
		if (tokenChanged && this._client && this._sessions.size === 0) {
			this._logService.info('[Copilot] Restarting CopilotClient with new token');
			const client = this._client;
			this._client = undefined;
			this._clientStarting = undefined;
			await client.stop();
		}
		return true;
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		if (this._client) {
			return this._client;
		}
		if (this._clientStarting) {
			return this._clientStarting;
		}
		this._clientStarting = (async () => {
			this._logService.info(`[Copilot] Starting CopilotClient... ${this._githubToken ? '(with token)' : '(no token)'}`);

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
			delete env['NODE_OPTIONS'];
			delete env['VSCODE_INSPECTOR_OPTIONS'];
			delete env['VSCODE_ESM_ENTRYPOINT'];
			delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
			for (const key of Object.keys(env)) {
				if (key === 'ELECTRON_RUN_AS_NODE') {
					continue;
				}
				if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
					delete env[key];
				}
			}
			env['COPILOT_CLI_RUN_AS_NODE'] = '1';
			env['USE_BUILTIN_RIPGREP'] = 'false';

			// Resolve the CLI entry point from node_modules. We can't use require.resolve()
			// because @github/copilot's exports map blocks direct subpath access.
			// FileAccess.asFileUri('') points to the `out/` directory; node_modules is one level up.
			const cliPath = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@github', 'copilot', 'index.js').fsPath;

			// Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
			// If @vscode/ripgrep is in an .asar file, the binary is unpacked.
			const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
			const rgDir = dirname(rgDiskPath);
			// On Windows the env key is typically "Path" (not "PATH"). Since we copied
			// process.env into a plain (case-sensitive) object, we must find the actual key.
			const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
			const currentPath = env[pathKey];
			env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
			this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);

			const client = new CopilotClient({
				githubToken: this._githubToken,
				useLoggedInUser: !this._githubToken,
				useStdio: true,
				autoStart: true,
				env,
				cliPath,
			});
			await client.start();
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._client = client;
			this._clientStarting = undefined;
			return client;
		})();
		return this._clientStarting;
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const result: IAgentSessionMetadata[] = sessions.map(s => ({
			session: AgentSession.uri(this.id, s.sessionId),
			startTime: s.startTime.getTime(),
			modifiedTime: s.modifiedTime.getTime(),
			summary: s.summary,
			workingDirectory: typeof s.context?.cwd === 'string' ? URI.file(s.context.cwd) : undefined,
		}));
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map(m => ({
			provider: this.id,
			id: m.id,
			name: m.name,
			maxContextWindow: m.capabilities.limits.max_context_window_tokens,
			supportsVision: m.capabilities.supports.vision,
			supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
			supportedReasoningEfforts: m.supportedReasoningEfforts,
			defaultReasoningEffort: m.defaultReasoningEffort,
			policyState: m.policy?.state as PolicyState | undefined,
			billingMultiplier: m.billing?.multiplier,
		}));
		this._logService.info(`[Copilot] Found ${result.length} models`);
		return result;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this._logService.info(`[Copilot] Creating session... ${config?.model ? `model=${config.model}` : ''}`);
		const client = await this._ensureClient();
		const parsedPlugins = await this._plugins.getAppliedPlugins();

		// When forking, we manipulate the CLI's on-disk data and then resume
		// instead of creating a fresh session via the SDK.
		if (config?.fork) {
			const sourceSessionId = AgentSession.id(config.fork.session);
			const newSessionId = config.session ? AgentSession.id(config.session) : generateUuid();

			// Serialize against the source session to prevent concurrent
			// modifications while we read its on-disk data.
			return this._sessionSequencer.queue(sourceSessionId, async () => {
				this._logService.info(`[Copilot] Forking session ${sourceSessionId} at index ${config.fork!.turnIndex} → ${newSessionId}`);

				// Ensure the source session is loaded so on-disk data is available
				if (!this._sessions.has(sourceSessionId)) {
					await this._resumeSession(sourceSessionId);
				}

				const copilotDataDir = getCopilotDataDir();
				await forkCopilotSessionOnDisk(copilotDataDir, sourceSessionId, newSessionId, config.fork!.turnIndex);

				// Resume the forked session so the SDK loads the forked history
				const agentSession = await this._resumeSession(newSessionId);
				const session = agentSession.sessionUri;
				this._logService.info(`[Copilot] Forked session created: ${session.toString()}`);
				return session;
			});
		}

		const sessionId = config?.session ? AgentSession.id(config.session) : generateUuid();
		const factory: SessionWrapperFactory = async callbacks => {
			const customAgents = await toSdkCustomAgents(parsedPlugins.flatMap(p => p.agents), this._fileService);
			const raw = await client.createSession({
				model: config?.model,
				sessionId,
				streaming: true,
				workingDirectory: config?.workingDirectory?.fsPath,
				onPermissionRequest: callbacks.onPermissionRequest,
				hooks: toSdkHooks(parsedPlugins.flatMap(p => p.hooks), callbacks.hooks),
				mcpServers: toSdkMcpServers(parsedPlugins.flatMap(p => p.mcpServers)),
				customAgents,
				skillDirectories: toSdkSkillDirectories(parsedPlugins.flatMap(p => p.skills)),
			});
			return new CopilotSessionWrapper(raw);
		};

		const agentSession = this._createAgentSession(factory, config?.workingDirectory, sessionId);
		this._plugins.setAppliedPlugins(agentSession, parsedPlugins);
		await agentSession.initializeSession();

		// Persist model & working directory so we can recreate the session
		// if the SDK loses it (e.g. sessions without messages).
		this._storeSessionMetadata(agentSession.sessionUri, config?.model, config?.workingDirectory);

		const session = agentSession.sessionUri;
		this._logService.info(`[Copilot] Session created: ${session.toString()}`);
		return session;
	}

	async setClientCustomizations(clientId: string, customizations: ICustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return this._plugins.sync(clientId, customizations, progress);
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		this._plugins.setEnabled(uri, enabled);
	}

	async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {

			// If plugin config changed, dispose this session so it gets resumed
			// with the updated plugin primitives.
			let entry = this._sessions.get(sessionId);
			if (entry && await this._plugins.needsSessionRefresh(entry)) {
				this._logService.info(`[Copilot:${sessionId}] Plugin config changed, refreshing session`);
				this._sessions.deleteAndDispose(sessionId);
				entry = undefined;
			}

			entry ??= await this._resumeSession(sessionId);
			await entry.send(prompt, attachments);
		});
	}

	setPendingMessages(session: URI, steeringMessage: IPendingMessage | undefined, _queuedMessages: readonly IPendingMessage[]): void {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			entry.sendSteering(steeringMessage);
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches SessionTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
		if (!entry) {
			return [];
		}
		return entry.getMessages();
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			this._sessions.deleteAndDispose(sessionId);
		});
	}

	async abortSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const entry = this._sessions.get(sessionId);
			if (entry) {
				await entry.abort();
			}
		});
	}

	async truncateSession(session: URI, turnIndex?: number): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			this._logService.info(`[Copilot:${sessionId}] Truncating session${turnIndex !== undefined ? ` at index ${turnIndex}` : ' (all turns)'}`);

			const keepUpToTurnIndex = turnIndex ?? -1;

			// Destroy the SDK session first and wait for cleanup to complete,
			// ensuring on-disk data (events.jsonl, locks) is released before
			// we modify it. Then dispose the wrapper.
			const entry = this._sessions.get(sessionId);
			if (entry) {
				await entry.destroySession();
			}
			this._sessions.deleteAndDispose(sessionId);

			const copilotDataDir = getCopilotDataDir();
			await truncateCopilotSessionOnDisk(copilotDataDir, sessionId, keepUpToTurnIndex);

			// Resume the session from the modified on-disk data
			await this._resumeSession(sessionId);
			this._logService.info(`[Copilot:${sessionId}] Session truncated and resumed`);
		});
	}

	async forkSession(sourceSession: URI, newSessionId: string, turnIndex: number): Promise<void> {
		const sourceSessionId = AgentSession.id(sourceSession);
		await this._sessionSequencer.queue(sourceSessionId, async () => {
			this._logService.info(`[Copilot] Forking session ${sourceSessionId} at index ${turnIndex} → ${newSessionId}`);

			const copilotDataDir = getCopilotDataDir();
			await forkCopilotSessionOnDisk(copilotDataDir, sourceSessionId, newSessionId, turnIndex);
			this._logService.info(`[Copilot] Forked session ${newSessionId} created on disk`);
		});
	}

	async changeModel(session: URI, model: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			await entry.setModel(model);
		}
		this._storeSessionMetadata(session, model, undefined);
	}

	async shutdown(): Promise<void> {
		this._logService.info('[Copilot] Shutting down...');
		this._sessions.clearAndDisposeAll();
		await this._client?.stop();
		this._client = undefined;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		for (const [, session] of this._sessions) {
			if (session.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}

	// ---- helpers ------------------------------------------------------------

	/**
	 * Creates a {@link CopilotAgentSession}, registers it in the sessions map,
	 * and returns it. The caller must call {@link CopilotAgentSession.initializeSession}
	 * to wire up the SDK session.
	 */
	private _createAgentSession(wrapperFactory: SessionWrapperFactory, workingDirectory: URI | undefined, sessionId: string): CopilotAgentSession {
		const sessionUri = AgentSession.uri(this.id, sessionId);

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			sessionUri,
			sessionId,
			workingDirectory,
			this._onDidSessionProgress,
			wrapperFactory,
		);

		this._sessions.set(sessionId, agentSession);
		return agentSession;
	}

	private async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] Session not in memory, resuming...`);
		const client = await this._ensureClient();
		const parsedPlugins = await this._plugins.getAppliedPlugins();

		const buildPluginConfig = async (callbacks: Parameters<SessionWrapperFactory>[0]) => {
			const customAgents = await toSdkCustomAgents(parsedPlugins.flatMap(p => p.agents), this._fileService);
			return {
				onPermissionRequest: callbacks.onPermissionRequest,
				hooks: toSdkHooks(parsedPlugins.flatMap(p => p.hooks), callbacks.hooks),
				mcpServers: toSdkMcpServers(parsedPlugins.flatMap(p => p.mcpServers)),
				customAgents,
				skillDirectories: toSdkSkillDirectories(parsedPlugins.flatMap(p => p.skills)),
			};
		};

		const factory: SessionWrapperFactory = async callbacks => {
			const pluginConfig = await buildPluginConfig(callbacks);
			try {
				const raw = await client.resumeSession(sessionId, {
					...pluginConfig,
				});
				return new CopilotSessionWrapper(raw);
			} catch (err) {
				// The SDK fails to resume sessions that have no messages.
				// Fall back to creating a new session with the same ID,
				// seeding model & working directory from stored metadata.
				if (!err || (err as { code?: number }).code !== -32603) {
					throw err;
				}

				this._logService.warn(`[Copilot:${sessionId}] Resume failed (session not found in SDK), recreating`);
				const metadata = await this._readSessionMetadata(AgentSession.uri(this.id, sessionId));
				const raw = await client.createSession({
					...pluginConfig,
					sessionId,
					streaming: true,
					model: metadata.model,
					workingDirectory: metadata.workingDirectory?.fsPath,
				});

				return new CopilotSessionWrapper(raw);
			}
		};

		const agentSession = this._createAgentSession(factory, undefined, sessionId);
		this._plugins.setAppliedPlugins(agentSession, parsedPlugins);
		await agentSession.initializeSession();

		return agentSession;
	}

	// ---- session metadata persistence --------------------------------------

	private static readonly _META_MODEL = 'copilot.model';
	private static readonly _META_CWD = 'copilot.workingDirectory';

	private _storeSessionMetadata(session: URI, model: string | undefined, workingDirectory: URI | undefined): void {
		const dbRef = this._sessionDataService.tryOpenDatabase(session);
		dbRef?.then(ref => {
			if (!ref) {
				return;
			}
			const db = ref.object;
			const work: Promise<void>[] = [];
			if (model) {
				work.push(db.setMetadata(CopilotAgent._META_MODEL, model));
			}
			if (workingDirectory) {
				work.push(db.setMetadata(CopilotAgent._META_CWD, workingDirectory.toString()));
			}
			Promise.all(work).finally(() => ref.dispose());
		});
	}

	private async _readSessionMetadata(session: URI): Promise<{ model?: string; workingDirectory?: URI }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [model, cwd] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
			]);
			return {
				model,
				workingDirectory: cwd ? URI.parse(cwd) : undefined,
			};
		} finally {
			ref.dispose();
		}
	}

	override dispose(): void {
		this._client?.stop().catch(() => { /* best-effort */ });
		super.dispose();
	}
}

class PluginController {
	private readonly _enablement = new Map<string, boolean>();
	private _lastSynced: Promise<{ synced: ISyncedCustomization[]; parsed: IParsedPlugin[] }> = Promise.resolve({ synced: [], parsed: [] });

	/** Parsed plugin contents from the most recently applied sync. */
	private _appliedParsed = new WeakMap<CopilotAgentSession, readonly IParsedPlugin[]>();

	constructor(
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	/**
	 * Returns true if the plugin configuration has changed since the last
	 * time sessions were created/resumed. Used by {@link CopilotAgent.sendMessage}
	 * to decide whether a session needs to be refreshed.
	 */
	public async needsSessionRefresh(session: CopilotAgentSession): Promise<boolean> {
		const { parsed } = await this._lastSynced;
		return !parsedPluginsEqual(this._appliedParsed.get(session) || [], parsed);
	}

	/**
	 * Returns the current parsed plugins filtered by enablement,
	 * then marks them as applied so {@link needsSessionRefresh} returns
	 * false until the next change.
	 */
	public async getAppliedPlugins(): Promise<readonly IParsedPlugin[]> {
		const { parsed } = await this._lastSynced;
		return parsed;
	}

	public setAppliedPlugins(session: CopilotAgentSession, plugins: readonly IParsedPlugin[]) {
		this._appliedParsed.set(session, plugins);
	}

	public setEnabled(pluginProtocolUri: string, enabled: boolean) {
		this._enablement.set(pluginProtocolUri, enabled);
	}

	public sync(clientId: string, customizations: ICustomizationRef[], progress?: (results: ISyncedCustomization[]) => void) {
		const prev = this._lastSynced;
		const promise = this._lastSynced = prev.catch(() => []).then(async () => {
			const result = await this._pluginManager.syncCustomizations(clientId, customizations, status => {
				progress?.(status.map(c => ({ customization: c })));
			});


			const parsed: IParsedPlugin[] = [];
			const synced: ISyncedCustomization[] = [];
			for (const dir of result) {
				if (dir.pluginDir) {
					try {
						parsed.push(await parsePlugin(dir.pluginDir, this._fileService, undefined, this._getUserHome()));
						synced.push(dir);
					} catch (e) {
						this._logService.warn(`[Copilot:PluginController] Error parsing plugin: ${e}`);
						synced.push({ customization: { ...dir.customization, status: CustomizationStatus.Error, statusMessage: `Error parsing plugin: ${e}` } });
					}
				} else {
					synced.push(dir);
				}
			}

			return { synced, parsed };
		});

		return promise.then(p => p.synced);
	}

	private _getUserHome(): string {
		return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
	}
}
