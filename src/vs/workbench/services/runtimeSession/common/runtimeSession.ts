/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { DeferredPromise, disposableTimeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpener, IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageRuntimeSessionLocation, LanguageRuntimeSessionMode, LanguageRuntimeStartupBehavior, RuntimeExitReason, RuntimeState, LanguageStartupBehavior, formatLanguageRuntimeMetadata, formatLanguageRuntimeSession } from '../../languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeGlobalEvent, ILanguageRuntimeSession, ILanguageRuntimeSessionManager, ILanguageRuntimeSessionStateEvent, INotebookSessionUriChangedEvent, IRuntimeSessionMetadata, IRuntimeSessionWillStartEvent, RuntimeStartMode, IRuntimeSessionService as IRuntimeSessionServiceType } from './runtimeSessionTypes.js';
import { IRuntimeSessionService } from './runtimeSessionService.js';
import { ActiveRuntimeSession } from './activeRuntimeSession.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IModalDialogPromptInstance, IErdosModalDialogsService } from '../../erdosModalDialogs/common/erdosModalDialogs.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';



import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { UiClientInstance } from '../../languageRuntime/common/languageRuntimeUiClient.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IConfigurationResolverService } from '../../configurationResolver/common/configurationResolver.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

import { IFileService } from '../../../../platform/files/common/files.js';
import { dirname } from '../../../../base/common/path.js';

const MAX_CONCURRENT_SESSIONS = 15;



function getSessionMapKey(sessionMode: LanguageRuntimeSessionMode,
	runtimeId: string,
	notebookUri: URI | undefined): string {
	return JSON.stringify([sessionMode, runtimeId, notebookUri?.toString()]);
}

export class RuntimeSessionService extends Disposable implements IRuntimeSessionServiceType, IOpener {

	declare readonly _serviceBrand: undefined;

	private _sessionManagers: Array<ILanguageRuntimeSessionManager> = [];

	private readonly _encounteredLanguagesByLanguageId = new Set<string>();

	private _foregroundSession?: ILanguageRuntimeSession;

	private readonly _activeSessionsBySessionId = new Map<string, ActiveRuntimeSession>();

	private readonly _startingConsolesByRuntimeId = new Map<string, ILanguageRuntimeMetadata>();

	private readonly _startingNotebooksByNotebookUri = new ResourceMap<ILanguageRuntimeMetadata>();

	private readonly _startingSessionsBySessionMapKey = new Map<string, DeferredPromise<string>>();

	private readonly _shuttingDownRuntimesBySessionId = new Map<string, Promise<void>>();

	private readonly _shuttingDownNotebooksByNotebookUri = new ResourceMap<DeferredPromise<void>>();

	private readonly _consoleSessionsByRuntimeId = new Map<string, ILanguageRuntimeSession[]>();

	private readonly _lastActiveConsoleSessionByLanguageId = new Map<string, ILanguageRuntimeSession>();

	private readonly _notebookSessionsByNotebookUri = new ResourceMap<ILanguageRuntimeSession>();

	private readonly _disconnectedSessions = new Map<string, ILanguageRuntimeSession>();

	private readonly _onWillStartRuntimeEmitter =
		this._register(new Emitter<IRuntimeSessionWillStartEvent>);

	private readonly _onDidStartRuntimeEmitter =
		this._register(new Emitter<ILanguageRuntimeSession>);

	private readonly _onDidFailStartRuntimeEmitter =
		this._register(new Emitter<ILanguageRuntimeSession>);

	private readonly _onDidChangeRuntimeStateEmitter =
		this._register(new Emitter<ILanguageRuntimeSessionStateEvent>());

	private readonly _onDidReceiveRuntimeEventEmitter =
		this._register(new Emitter<ILanguageRuntimeGlobalEvent>());

	private readonly _onDidChangeForegroundSessionEmitter =
		this._register(new Emitter<ILanguageRuntimeSession | undefined>);

	private readonly _onDidDeleteRuntimeSessionEmitter =
		this._register(new Emitter<string>);

	private readonly _onDidUpdateSessionNameEmitter =
		this._register(new Emitter<ILanguageRuntimeSession>);

	private readonly _onDidStartUiClientEmitter =
		this._register(new Emitter<{ sessionId: string; uiClient: UiClientInstance }>());


	private _modalWaitPrompt: IModalDialogPromptInstance | undefined = undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IErdosModalDialogsService private readonly _erdosModalDialogsService: IErdosModalDialogsService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IStorageService private readonly _storageService: IStorageService,

		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {

		super();

		this._openerService.registerOpener(this);

		this._register(this._languageService.onDidRequestRichLanguageFeatures(languageId => {
			this._encounteredLanguagesByLanguageId.add(languageId);

			if (this.hasStartingOrRunningConsole(languageId)) {
				return;
			}

			const languageRuntimeInfos = this._languageRuntimeService.registeredRuntimes
				.filter(
					metadata =>
						metadata.languageId === languageId &&
						metadata.startupBehavior === LanguageRuntimeStartupBehavior.Implicit);
			if (!languageRuntimeInfos.length) {
				return;
			}

			this._logService.trace(`Language runtime ${formatLanguageRuntimeMetadata(languageRuntimeInfos[0])} automatically starting`);
			this.autoStartRuntime(languageRuntimeInfos[0],
				`A file with the language ID ${languageId} was opened.`,
				true);
		}));

		this._register(this._extensionService.onDidChangeExtensionsStatus((e) => {
			for (const extensionId of e) {
				for (const session of this._disconnectedSessions.values()) {
					if (session.runtimeMetadata.extensionId.value === extensionId.value) {
						this._disconnectedSessions.delete(session.sessionId);

						this._logService.debug(`Extension ${extensionId.value} has been reloaded; ` +
							`attempting to reconnect session ${session.sessionId}`);
						try {
							this.restoreRuntimeSession(session.runtimeMetadata,
								session.metadata,
								session.dynState.sessionName,
								false);
							this._logService.debug(`Completed reconnection for session ${session.sessionId}`);
						} catch (err) {
							if (err instanceof Error) {
								this._notificationService.error(
									localize('erdos.runtimeSession.restoreFailed', 'Failed to restore session {0} for extension {1}: {2}', session.sessionId, extensionId.value, err.message)
								);
							} else {
								this._notificationService.error(
									localize('erdos.runtimeSession.restoreFailedUnkown', 'Unknown error restoring session {0} for extension {1}: {2}', session.metadata.sessionId, extensionId.value, JSON.stringify(err))
								);
							}
						}
					}
				}
			}
		}
		));

		this._register(this._storageService.onDidChangeTarget((e) => {
			if (e.scope === StorageScope.APPLICATION && this._disconnectedSessions.size > 0) {
				this._logService.debug(`Application storage scope changed; ` +
					`discarding ${this._disconnectedSessions.size} disconnected sessions`);

				this._disconnectedSessions.forEach(value => {
					this._onDidDeleteRuntimeSessionEmitter.fire(value.sessionId);
				});
				this._disconnectedSessions.clear();
			}
		}));

		this.scheduleUpdateActiveLanguages(25 * 1000);
	}

	readonly onWillStartSession = this._onWillStartRuntimeEmitter.event;

	readonly onDidStartRuntime = this._onDidStartRuntimeEmitter.event;

	readonly onDidFailStartRuntime = this._onDidFailStartRuntimeEmitter.event;

	readonly onDidChangeRuntimeState = this._onDidChangeRuntimeStateEmitter.event;

	readonly onDidReceiveRuntimeEvent = this._onDidReceiveRuntimeEventEmitter.event;

	readonly onDidChangeForegroundSession = this._onDidChangeForegroundSessionEmitter.event;

	readonly onDidDeleteRuntimeSession = this._onDidDeleteRuntimeSessionEmitter.event;

	readonly onDidStartUiClient = this._onDidStartUiClientEmitter.event;

	private readonly _onDidUpdateNotebookSessionUriEmitter =
		this._register(new Emitter<INotebookSessionUriChangedEvent>());

	readonly onDidUpdateNotebookSessionUri = this._onDidUpdateNotebookSessionUriEmitter.event;

	readonly onDidUpdateSessionName = this._onDidUpdateSessionNameEmitter.event;

	registerSessionManager(manager: ILanguageRuntimeSessionManager): IDisposable {
		this._sessionManagers.push(manager);
		return toDisposable(() => {
			const index = this._sessionManagers.indexOf(manager);
			if (index !== -1) {
				this._sessionManagers.splice(index, 1);
			}
		});
	}

	getConsoleSessionForRuntime(runtimeId: string, includeExited: boolean = false): ILanguageRuntimeSession | undefined {
		return Array.from(this._activeSessionsBySessionId.values())
			.map((info, index) => ({ info, index }))
			.sort((a, b) =>
				b.info.session.metadata.createdTimestamp - a.info.session.metadata.createdTimestamp
				|| b.index - a.index)
			.find(({ info }) =>
				info.session.runtimeMetadata.runtimeId === runtimeId &&
				info.session.metadata.sessionMode === LanguageRuntimeSessionMode.Console &&
				(includeExited || info.state !== RuntimeState.Exited)
			)
			?.info.session;
	}

	getConsoleSessionForLanguage(languageId: string): ILanguageRuntimeSession | undefined {
		if (this._foregroundSession?.runtimeMetadata.languageId === languageId) {
			return this.foregroundSession;
		}
		return this._lastActiveConsoleSessionByLanguageId.get(languageId);
	}

	getNotebookSessionForNotebookUri(notebookUri: URI): ILanguageRuntimeSession | undefined {
		const session = this._notebookSessionsByNotebookUri.get(notebookUri);
		this._logService.info(`Lookup notebook session for notebook URI ${notebookUri.toString()}: ${session ? session.metadata.sessionId : 'not found'}`);
		return session;
	}

	getActiveSessions(): ActiveRuntimeSession[] {
		return Array.from(this._activeSessionsBySessionId.values());
	}

	private async isValidDirectory(path: string): Promise<boolean> {
		if (!path || typeof path !== 'string' || path.trim() === '') {
			return false;
		}

		try {
			const stat = await this._fileService.stat(URI.file(path));
			if (!stat.isDirectory) {
				this._logService.warn(`Notebook working directory: Path '${path}' exists but is not a directory`);
				return false;
			}
			return true;
		} catch (error) {
			this._logService.warn(`Notebook working directory: Path '${path}' does not exist or is not accessible:`, error);
			return false;
		}
	}

	private async resolveNotebookWorkingDirectory(notebookUri: URI): Promise<string | undefined> {
		let defaultValue: string | undefined;
		const notebookParent = dirname(notebookUri.fsPath);
		if (await this.isValidDirectory(notebookParent)) {
			defaultValue = notebookParent;
		}

		const configValue = this._configurationService.getValue<string>(
			'notebook.workingDirectory', { resource: notebookUri }
		);
		if (!configValue || configValue.trim() === '') {
			return defaultValue;
		}
		const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(notebookUri);

		let resolvedValue: string;
		try {
			resolvedValue = await this._configurationResolverService.resolveAsync(
				workspaceFolder || undefined, configValue
			);
		} catch (error) {
			this._logService.warn(`Notebook working directory: Failed to resolve variables in '${configValue}':`, error);
			return defaultValue;
		}

		if (await this.isValidDirectory(resolvedValue)) {
			return resolvedValue;
		} else {
			return defaultValue;
		}
	}

	async selectRuntime(runtimeId: string, source: string, notebookUri?: URI): Promise<void> {
		const runtime = this._languageRuntimeService.getRegisteredRuntime(runtimeId);
		if (!runtime) {
			throw new Error(`No language runtime with id '${runtimeId}' was found.`);
		}

		const consoleConnectionEnabled = this._configurationService.getValue<boolean>('erdosNotebook.consoleConnection.enabled') ?? true;
		
		if (notebookUri && consoleConnectionEnabled && source !== 'notebook-disconnect') {
			const existingConsoleSession = this.getConsoleSessionForLanguage(runtime.languageId);
			if (existingConsoleSession && existingConsoleSession.getRuntimeState() === RuntimeState.Ready) {
				const notebookSession = this._notebookSessionsByNotebookUri.get(notebookUri);
				if (notebookSession && notebookSession !== existingConsoleSession) {
					await notebookSession.shutdown(RuntimeExitReason.Shutdown);
				}
				
				this._notebookSessionsByNotebookUri.set(notebookUri, existingConsoleSession);
				
				this._onDidStartRuntimeEmitter.fire(existingConsoleSession);
				return;
			}
		}

		const sessionMode = notebookUri
			? LanguageRuntimeSessionMode.Notebook
			: LanguageRuntimeSessionMode.Console;


		const startMode = notebookUri
			? RuntimeStartMode.Switching
			: RuntimeStartMode.Starting;


		const startingPromise = this._startingSessionsBySessionMapKey.get(
			getSessionMapKey(sessionMode, runtimeId, notebookUri));
		if (startingPromise && !startingPromise.isSettled) {
			await startingPromise.p;
		}

		if (notebookUri) {
			const shuttingDownPromise = this._shuttingDownNotebooksByNotebookUri.get(notebookUri);
			if (shuttingDownPromise && !shuttingDownPromise.isSettled) {
				try {
					await shuttingDownPromise.p;
				} catch (error) {
				}
			}

			const activeSession =
				this.getNotebookSessionForNotebookUri(notebookUri);
			if (activeSession) {
				if (activeSession.runtimeMetadata.runtimeId === runtime.runtimeId) {
					return;
				}

				await this.shutdownRuntimeSession(activeSession, RuntimeExitReason.SwitchRuntime);
			}
		} else {
			const existingSession = this.getConsoleSessionForRuntime(runtimeId, true);
			if (existingSession) {
				if (existingSession.runtimeMetadata.runtimeId !== this.foregroundSession?.runtimeMetadata.runtimeId) {
					this.foregroundSession = existingSession;
				}
				return;
			}
		}

		await this.startNewRuntimeSession(
			runtime.runtimeId,
			runtime.runtimeName,
			sessionMode,
			notebookUri,
			source,
			startMode,
			true
		);
	}

	focusSession(sessionId: string): void {
		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(`Could not find session with id ${sessionId}.`);
		}

		if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
			this.foregroundSession = session;
		} else {
			throw new Error(`Cannot focus a notebook session.`);
		}
	}

	private async shutdownRuntimeSession(
		session: ILanguageRuntimeSession, exitReason: RuntimeExitReason): Promise<void> {
		const sessionId = session.metadata.sessionId;
		const shuttingDownPromise = this._shuttingDownRuntimesBySessionId.get(sessionId);
		if (shuttingDownPromise) {
			return shuttingDownPromise;
		}
		const shutdownPromise = this.doShutdownRuntimeSession(session, exitReason)
			.finally(() => this._shuttingDownRuntimesBySessionId.delete(sessionId));

		this._shuttingDownRuntimesBySessionId.set(sessionId, shutdownPromise);

		return shutdownPromise;
	}

	private async doShutdownRuntimeSession(
		session: ILanguageRuntimeSession, exitReason: RuntimeExitReason): Promise<void> {

		const activeSession = this._activeSessionsBySessionId.get(session.sessionId);
		if (!activeSession) {
			throw new Error(`No active session '${session.sessionId}'`);
		}

		const disposables = activeSession.register(new DisposableStore());
		const promise = new Promise<void>((resolve, reject) => {
			disposables.add(session.onDidEndSession((exit) => {
				disposables.dispose();
				resolve();
			}));
			disposables.add(disposableTimeout(() => {
				disposables.dispose();
				reject(new Error(`Timed out waiting for runtime ` +
					`${formatLanguageRuntimeSession(session)} to finish exiting.`));
			}, 5000));
		});

		try {
			await session.shutdown(exitReason);
		} catch (error) {
			disposables.dispose();
			throw error;
		}

		await promise;
	}

	async startNewRuntimeSession(
		runtimeId: string,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode,
		notebookUri: URI | undefined,
		source: string,
		startMode = RuntimeStartMode.Starting,
		activate: boolean): Promise<string> {
		const sessionMapKey = getSessionMapKey(sessionMode, runtimeId, notebookUri);
		const startingRuntimePromise = this._startingSessionsBySessionMapKey.get(sessionMapKey);
		if (startingRuntimePromise && !startingRuntimePromise.isSettled) {
			return startingRuntimePromise.p;
		}

		const languageRuntime = this._languageRuntimeService.getRegisteredRuntime(runtimeId);
		if (!languageRuntime) {
			throw new Error(`No language runtime with id '${runtimeId}' was found.`);
		}

		const runningSessionId = this.validateRuntimeSessionStart(sessionMode, languageRuntime, notebookUri, source);
		if (runningSessionId) {
			return runningSessionId;
		}

		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			if (sessionMode === LanguageRuntimeSessionMode.Console) {
				return this.autoStartRuntime(languageRuntime, source, activate);
			} else {
				throw new Error(`Cannot start a ${sessionMode} session in an untrusted workspace.`);
			}
		}

		return this.doCreateRuntimeSession(languageRuntime, sessionName, sessionMode, source, startMode, activate, notebookUri);
	}

	async validateRuntimeSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionId: string): Promise<boolean> {

		let sessionManager: ILanguageRuntimeSessionManager;
		try {
			sessionManager = await this.getManagerForRuntime(runtimeMetadata);
		} catch (err) {
			this._logService.error(`Error getting manager for runtime ${formatLanguageRuntimeMetadata(runtimeMetadata)}: ${err}`);
			return false;
		}

		return sessionManager.validateSession(runtimeMetadata, sessionId);
	}

	async restoreRuntimeSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata,
		sessionName: string,
		activate: boolean): Promise<void> {
		const sessionMapKey = getSessionMapKey(
			sessionMetadata.sessionMode, runtimeMetadata.runtimeId, sessionMetadata.notebookUri);
		if (sessionMetadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			const startingRuntimePromise = this._startingSessionsBySessionMapKey.get(sessionMapKey);
			if (startingRuntimePromise && !startingRuntimePromise.isSettled) {
				return startingRuntimePromise.p.then(() => { });
			}
		}

		const languageRuntime = this._languageRuntimeService.getRegisteredRuntime(
			runtimeMetadata.runtimeId);
		if (!languageRuntime) {
			this._logService.debug(`[Reconnect ${sessionMetadata.sessionId}]: ` +
				`Registering runtime ${runtimeMetadata.runtimeName}`);
			this._languageRuntimeService.registerRuntime(runtimeMetadata);
		}

		const runningSessionId = this.validateRuntimeSessionStart(
			sessionMetadata.sessionMode, runtimeMetadata, sessionMetadata.notebookUri);
		if (runningSessionId) {
			return;
		}

		const startPromise = new DeferredPromise<string>();

		startPromise.p.catch(err => this._logService.debug(`Error starting runtime session: ${err}`));

		if (sessionMetadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			this._startingSessionsBySessionMapKey.set(sessionMapKey, startPromise);

			this.setStartingSessionMaps(
				sessionMetadata.sessionMode, runtimeMetadata, sessionMetadata.notebookUri);
		}

		try {
			const sessionId = await this.doRestoreRuntimeSession(
				sessionMetadata, runtimeMetadata, sessionName, activate);
			startPromise.complete(sessionId);
		} catch (err) {
			startPromise.error(err);
		} finally {
			this.clearStartingSessionMaps(
				sessionMetadata.sessionMode, runtimeMetadata, sessionMetadata.notebookUri);
		}

		return startPromise.p.then(() => { });
	}

	async doRestoreRuntimeSession(
		sessionMetadata: IRuntimeSessionMetadata,
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionName: string,
		activate: boolean,
	) {
		if (this._sessionManagers.length === 0) {
			throw new Error(`No session manager has been registered.`);
		}

		const sessionManager = await this.getManagerForRuntime(runtimeMetadata);

		let session: ILanguageRuntimeSession;
		try {
			session = await sessionManager.restoreSession(runtimeMetadata, sessionMetadata, sessionName);
		} catch (err) {
			this._logService.error(
				`Reconnecting to session '${sessionMetadata.sessionId}' for language runtime ` +
				`${formatLanguageRuntimeMetadata(runtimeMetadata)} failed. Reason: ${err}`);
			throw err;
		}

		await this.doStartRuntimeSession(session, sessionManager, RuntimeStartMode.Reconnecting, activate);

		return sessionMetadata.sessionId;

	}

	set foregroundSession(session: ILanguageRuntimeSession | undefined) {
		if (!session && !this._foregroundSession) {
			return;
		}

		this._foregroundSession = session;

		if (session) {
			this._lastActiveConsoleSessionByLanguageId.set(session.runtimeMetadata.languageId, session);
		}

		this._onDidChangeForegroundSessionEmitter.fire(this._foregroundSession);
	}

	getSession(sessionId: string): ILanguageRuntimeSession | undefined {
		return this._activeSessionsBySessionId.get(sessionId)?.session;
	}

	getActiveSession(sessionId: string): ActiveRuntimeSession | undefined {
		return this._activeSessionsBySessionId.get(sessionId);
	}

	get activeSessions(): ILanguageRuntimeSession[] {
		return Array.from(this._activeSessionsBySessionId.values()).map(info => info.session);
	}

	get foregroundSession(): ILanguageRuntimeSession | undefined {
		return this._foregroundSession;
	}

	private async promptToInterruptSession(session: ILanguageRuntimeSession, action: string): Promise<boolean> {
		enum PromptOption {
			Interrupt,
			DoNotInterrupt,
			TransitionToIdle
		}

		const activeSession = this._activeSessionsBySessionId.get(session.sessionId);
		if (!activeSession) {
			return false;
		}

		const disposables = new DisposableStore();

		const promptResult = await new Promise<PromptOption>(resolve => {
			let transitionedToIdle = false;

			const notificationHandle = this._notificationService.prompt(
				Severity.Warning,
				localize('erdos.console.interruptPrompt.confirm', 'The runtime is busy. Do you want to interrupt it and {0}? You\'ll lose any unsaved objects.', action),
				[
					{
						label: localize('erdos.console.interruptPrompt.yes', 'Yes'),
						run: () => {
							resolve(PromptOption.Interrupt);
						}
					},
					{
						label: localize('erdos.console.interruptPrompt.no', 'No'),
						run: () => {
							resolve(PromptOption.DoNotInterrupt);
						}
					},
				],
				{
					sticky: true,
					onCancel() {
						if (!transitionedToIdle) {
							resolve(PromptOption.DoNotInterrupt);
						}
					},
				}
			);

			disposables.add(
				session.onDidChangeRuntimeState(state => {
					if (state === RuntimeState.Idle) {
						transitionedToIdle = true;
						notificationHandle.close();
						resolve(PromptOption.TransitionToIdle);
					}
				})
			);
		});

		switch (promptResult) {
			case PromptOption.TransitionToIdle:
				disposables.dispose();
				return true;
			case PromptOption.DoNotInterrupt:
				disposables.dispose();
				return false;
			case PromptOption.Interrupt:
				{
					session.interrupt();
					const ready = await awaitStateChange(activeSession, [RuntimeState.Idle], 10)
						.then(() => true)
						.catch(err => {
							this._notificationService.warn(
								localize('erdos.console.interruptPrompt.error', 'Failed to interrupt the session. Reason: {0}', err));
							return false;
						});

					disposables.dispose();
					return ready;
				}
		}
	}

	async restartSession(sessionId: string, source: string, interrupt: boolean = true): Promise<void> {
		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(`No session with ID '${sessionId}' was found.`);
		}
		this._logService.info(
			`Restarting session '` +
			`${formatLanguageRuntimeSession(session)}' (Source: ${source})`);

		const state = session.getRuntimeState();
		if (interrupt && state === RuntimeState.Busy) {
			const interrupted = await this.promptToInterruptSession(
				session,
				localize('erdos.console.restart', 'restart')
			);

			if (!interrupted) {
				return;
			}
		}

		if (state === RuntimeState.Busy ||
			state === RuntimeState.Idle ||
			state === RuntimeState.Ready ||
			state === RuntimeState.Exited) {
			return this.doRestartRuntime(session);
		} else if (state === RuntimeState.Uninitialized) {
			await this.startNewRuntimeSession(
				session.runtimeMetadata.runtimeId,
				session.dynState.sessionName,
				session.metadata.sessionMode,
				session.metadata.notebookUri,
				`'Restart Interpreter' command invoked`,
				RuntimeStartMode.Starting,
				true
			);
			return;
		} else if (state === RuntimeState.Starting ||
			state === RuntimeState.Restarting) {
			return;
		} else {
			throw new Error(`The ${session.runtimeMetadata.languageName} session is '${state}' ` +
				`and cannot be restarted.`);
		}
	}

	async interruptSession(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(`No session with ID '${sessionId}' was found.`);
		}
		this._logService.info(
			`Interrupting session ${formatLanguageRuntimeSession(session)}'`);

		return session.interrupt();
	}

	updateSessionName(sessionId: string, name: string) {
		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(`No session with ID '${sessionId}' was found.`);
		}

		const validatedName = name.trim();
		if (validatedName.trim().length === 0) {
			throw new Error(`Session name cannot be empty.`);
		}

		this._logService.info(
			`Updating session name to ${validatedName} for session ${formatLanguageRuntimeSession(session)}'`);

		session.updateSessionName(validatedName);

		this._logService.info(
			`Successfully updated session name to ${validatedName} for session ${formatLanguageRuntimeSession(session)}'`);

		this._onDidUpdateSessionNameEmitter.fire(session);
	}

	private async doRestartRuntime(session: ILanguageRuntimeSession): Promise<void> {
		const sessionMapKey = getSessionMapKey(
			session.metadata.sessionMode, session.runtimeMetadata.runtimeId, session.metadata.notebookUri);
		const startingRuntimePromise = this._startingSessionsBySessionMapKey.get(sessionMapKey);
		if (startingRuntimePromise && !startingRuntimePromise.isSettled) {
			return startingRuntimePromise.p.then(() => { });
		}

		const activeSession = this._activeSessionsBySessionId.get(session.sessionId);
		if (!activeSession) {
			throw new Error(`No active session '${session.sessionId}'`);
		}

		const startPromise = new DeferredPromise<string>();
		this._startingSessionsBySessionMapKey.set(sessionMapKey, startPromise);

		this.setStartingSessionMaps(
			session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);

		awaitStateChange(activeSession, [RuntimeState.Ready], 10)
			.then(() => {
				this.clearStartingSessionMaps(
					session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);
				startPromise.complete(session.sessionId);
			})
			.catch((err) => {
				startPromise.error(err);
				this.clearStartingSessionMaps(
					session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);
			});

		try {
			if (session.getRuntimeState() === RuntimeState.Exited) {
				await session.start();
			} else {
				await session.restart(activeSession.workingDirectory);
			}
		} catch (err) {
			startPromise.error(err);
			this.clearStartingSessionMaps(
				session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);
		}

		return startPromise.p.then(() => { });
	}

	async shutdownNotebookSession(notebookUri: URI, exitReason: RuntimeExitReason, source: string): Promise<void> {
		this._logService.info(`Shutting down notebook ${notebookUri.toString()}. Source: ${source}`);

		const shuttingDownPromise = this._shuttingDownNotebooksByNotebookUri.get(notebookUri);
		if (shuttingDownPromise && !shuttingDownPromise.isSettled) {
			this._logService.debug(`Notebook ${notebookUri.toString()} is already shutting down. Returning existing promise`);
			return shuttingDownPromise.p;
		}

		const shutdownPromise = new DeferredPromise<void>();
		this._shuttingDownNotebooksByNotebookUri.set(notebookUri, shutdownPromise);

		shutdownPromise.p.finally(() => {
			if (this._shuttingDownNotebooksByNotebookUri.get(notebookUri) === shutdownPromise) {
				this._shuttingDownNotebooksByNotebookUri.delete(notebookUri);
			}
		});

		const session = await this.getActiveOrStartingNotebook(notebookUri);
		if (!session) {
			this._logService.debug(
				`Aborting shutdown request for notebook ${notebookUri.toString()}. ` +
				`No active session found`
			);
			shutdownPromise.complete();
			return;
		}

		try {
			await this.shutdownRuntimeSession(session, exitReason);
			shutdownPromise.complete();
			this._logService.debug(`Notebook ${notebookUri.toString()} has been shut down`);
		} catch (error) {
			this._logService.error(`Failed to shutdown notebook ${notebookUri.toString()}. Reason: ${error}`);
			shutdownPromise.error(error);
		}

		return shutdownPromise.p;
	}

	async deleteSession(sessionId: string): Promise<void> {
		if (this._disconnectedSessions.has(sessionId)) {
			throw new Error(`Cannot delete session because it is disconnected.`);
		}

		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(`Cannot delete session because its runtime was not found.`);
		}

		const runtimeState = session.getRuntimeState();
		if (runtimeState !== RuntimeState.Exited) {
			if (runtimeState === RuntimeState.Busy) {
				const interrupted = await this.promptToInterruptSession(
					session,
					localize('erdos.console.delete', 'delete')
				);

				if (!interrupted) {
					return;
				}
			}

			if (runtimeState === RuntimeState.Uninitialized) {
				// Skip shutdown for uninitialized sessions - no process to clean up
			} else if (runtimeState === RuntimeState.Busy ||
				runtimeState === RuntimeState.Idle ||
				runtimeState === RuntimeState.Ready) {
				await this.shutdownRuntimeSession(session, RuntimeExitReason.Shutdown);
			} else if (runtimeState === RuntimeState.Starting ||
				runtimeState === RuntimeState.Initializing ||
				runtimeState === RuntimeState.Offline ||
				runtimeState === RuntimeState.Interrupting) {
				// Try shutdown but use forceQuit if it fails
				try {
					await this.shutdownRuntimeSession(session, RuntimeExitReason.Shutdown);
				} catch (error) {
					// If normal shutdown fails, force quit to prevent orphaned processes
					await session.forceQuit();
				}
			} else if (runtimeState === RuntimeState.Exiting ||
				runtimeState === RuntimeState.Restarting) {
				await session.forceQuit();
			} else {
				throw new Error(`Cannot delete session because it is in state '${runtimeState}'`);
			}
		}

		if (this._activeSessionsBySessionId.delete(sessionId)) {
			this.updateSessionMapsAfterExit(session);

			session.dispose();

			this._onDidDeleteRuntimeSessionEmitter.fire(sessionId);
		}
	}

	private async getActiveOrStartingNotebook(notebookUri: URI): Promise<ILanguageRuntimeSession | undefined> {
		const session = this._notebookSessionsByNotebookUri.get(notebookUri);
		if (session) {
			this._logService.debug(`Found an active session for notebook ${notebookUri.toString()}`);
			return session;
		}

		const startingRuntime = this._startingNotebooksByNotebookUri.get(notebookUri);
		if (!startingRuntime) {
			this._logService.debug(`No starting session for notebook ${notebookUri.toString()}`);
			return undefined;
		}

		const sessionMapKey = getSessionMapKey(
			LanguageRuntimeSessionMode.Notebook, startingRuntime.runtimeId, notebookUri);
		const startingPromise = this._startingSessionsBySessionMapKey.get(sessionMapKey);
		if (!startingPromise) {
			this._logService.debug(`No starting session for notebook ${notebookUri.toString()}`);
			return undefined;
		}

		this._logService.debug(`Waiting for session to start before shutting down notebook ${notebookUri.toString()}`);
		let sessionId: string;
		try {
			sessionId = await startingPromise.p;
		} catch (error) {
			this._logService.debug(
				`Error while waiting for session to start for notebook ${notebookUri.toString()}. Reason: ${error.toString()}`
			);
			return undefined;
		}

		const activeSession = this._activeSessionsBySessionId.get(sessionId);
		if (!activeSession) {
			this._logService.error(`Session '${sessionId}' was started, but no active session was found`);
			return undefined;
		}

		if (activeSession.session.getRuntimeState() === RuntimeState.Starting) {
			try {
				await awaitStateChange(activeSession, [RuntimeState.Ready], 10);
			} catch (err) {
			}
		}

		return activeSession.session;
	}

	hasStartingOrRunningConsole(languageId?: string | undefined) {
		let hasRunningConsole = false;
		const hasRunningConsoleForLanguageId = Array.from(this._consoleSessionsByRuntimeId.values())
			.some((sessions) => {
				if (sessions.length > 0) {
					hasRunningConsole = true;
					if (sessions[0].runtimeMetadata.languageId === languageId) {
						return true;
					}
				}
				return false;
			});

		const hasStartingConsoleForLanguageId = Array.from(this._startingConsolesByRuntimeId.values())
			.some(
				runtime => runtime.languageId === languageId);

		if (languageId) {
			return hasStartingConsoleForLanguageId || hasRunningConsoleForLanguageId;
		} else {
			return this._startingConsolesByRuntimeId.size > 0 || hasRunningConsole;
		}
	}

	async autoStartRuntime(
		metadata: ILanguageRuntimeMetadata,
		source: string,
		activate: boolean
	): Promise<string> {
		const startupBehavior = this._configurationService.getValue<LanguageStartupBehavior>(
			'interpreters.startupBehavior', { overrideIdentifier: metadata.languageId });
		if (startupBehavior === LanguageStartupBehavior.Disabled || startupBehavior === LanguageStartupBehavior.Manual) {
			this._logService.info(`Language runtime ` +
				`${formatLanguageRuntimeMetadata(metadata)} ` +
				`was scheduled for automatic start, but won't be started because automatic ` +
				`startup for the ${metadata.languageName} language is set to ${startupBehavior}. Source: ${source}`);
			return '';
		}

		if (this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return this.doAutoStartRuntime(metadata, source, activate);
		} else {
			this._logService.debug(`Deferring the start of language runtime ` +
				`${formatLanguageRuntimeMetadata(metadata)} (Source: ${source}) ` +
				`because workspace trust has not been granted. ` +
				`The runtime will be started when workspace trust is granted.`);
			const disposable = this._register(this._workspaceTrustManagementService.onDidChangeTrust((trusted) => {
				if (!trusted) {
					return;
				}
				disposable.dispose();
				this._logService.info(`Language runtime ` +
					`${formatLanguageRuntimeMetadata(metadata)} ` +
					`automatically starting after workspace trust was granted. ` +
					`Source: ${source}`);
				this.doAutoStartRuntime(metadata, source, activate);
			}));
		}

		return '';
	}

	async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
		if (typeof resource === 'string') {
			resource = URI.parse(resource);
		}

		if (options) {
			return false;
		}

		for (const session of this._lastActiveConsoleSessionByLanguageId.values()) {
			try {
				if (await session.openResource(resource)) {
					return true;
				}
			} catch (reason) {
				this._logService.error(`Error opening resource "${resource.toString()}". Reason: ${reason}`);
			}
		}

		return false;
	}

	private async doAutoStartRuntime(
		metadata: ILanguageRuntimeMetadata,
		source: string,
		activate: boolean): Promise<string> {
		const sessionMode = LanguageRuntimeSessionMode.Console;
		const notebookUri = undefined;

		const startingRuntimePromise = this._startingSessionsBySessionMapKey.get(
			getSessionMapKey(sessionMode, metadata.runtimeId, notebookUri));
		if (startingRuntimePromise && !startingRuntimePromise.isSettled) {
			return startingRuntimePromise.p;
		}

		const runningSessionId = this.validateRuntimeSessionStart(sessionMode, metadata, notebookUri, source);
		if (runningSessionId) {
			return runningSessionId;
		}

		this._startingConsolesByRuntimeId.set(metadata.runtimeId, metadata);

		const startPromise = new DeferredPromise<string>();
		const sessionMapKey = getSessionMapKey(sessionMode, metadata.runtimeId, notebookUri);
		this._startingSessionsBySessionMapKey.set(sessionMapKey, startPromise);

		startPromise.p.catch(err => this._logService.debug(`Error starting runtime session: ${err}`));

		let sessionManager: ILanguageRuntimeSessionManager;
		try {
			sessionManager = await this.getManagerForRuntime(metadata);
		} catch (err) {
			startPromise.error(err);
			this.clearStartingSessionMaps(sessionMode, metadata, notebookUri);
			throw err;
		}

		const languageRuntime =
			this._languageRuntimeService.getRegisteredRuntime(metadata.runtimeId);

		if (!languageRuntime) {
			try {
				const validated = await sessionManager.validateMetadata(metadata);

				if (validated.runtimeId !== metadata.runtimeId) {
					if (!metadata.runtimeId) {
						this._logService.info(
							`Hydrated metadata for runtime ${formatLanguageRuntimeMetadata(validated)}`
						);
					} else {
						const existing =
							this._languageRuntimeService.getRegisteredRuntime(validated.runtimeId);
						if (existing) {
							this._logService.warn(
								`Language runtime ${formatLanguageRuntimeMetadata(validated)} ` +
								`already registered; re-registering.`);
						} else {
							this._logService.info(
								`Replacing runtime ${formatLanguageRuntimeMetadata(metadata)} => `
								+ `${formatLanguageRuntimeMetadata(validated)}`);
						}
					}
				}

				this._languageRuntimeService.registerRuntime(validated);

				metadata = validated;
				this._startingConsolesByRuntimeId.set(metadata.runtimeId, validated);
			} catch (err) {
				this._startingConsolesByRuntimeId.delete(metadata.runtimeId);

				this._logService.error(
					`Language runtime ${formatLanguageRuntimeMetadata(metadata)} ` +
					`could not be validated. Reason: ${err}`);
				throw err;
			}
		}

		return this.doCreateRuntimeSession(metadata, metadata.runtimeName, sessionMode, source, RuntimeStartMode.Starting, activate, notebookUri);
	}

	private async doCreateRuntimeSession(runtimeMetadata: ILanguageRuntimeMetadata,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode,
		source: string,
		startMode: RuntimeStartMode,
		activate: boolean,
		notebookUri?: URI): Promise<string> {
		this.setStartingSessionMaps(sessionMode, runtimeMetadata, notebookUri);

		const sessionMapKey = getSessionMapKey(sessionMode, runtimeMetadata.runtimeId, notebookUri);
		let startPromise = this._startingSessionsBySessionMapKey.get(sessionMapKey);
		if (!startPromise || startPromise.isSettled) {
			startPromise = new DeferredPromise<string>();
			this._startingSessionsBySessionMapKey.set(sessionMapKey, startPromise);

			startPromise.p.catch(err => this._logService.debug(`Error starting runtime session: ${err}`));
		}

		let sessionManager: ILanguageRuntimeSessionManager;
		try {
			sessionManager = await this.getManagerForRuntime(runtimeMetadata);
		} catch (err) {
			startPromise.error(err);
			this.clearStartingSessionMaps(sessionMode, runtimeMetadata, notebookUri);
			throw err;
		}

		const sessionId = this.generateNewSessionId(runtimeMetadata, sessionMode === LanguageRuntimeSessionMode.Notebook);

		let workingDirectory: string | undefined;
		if (notebookUri) {
			workingDirectory = await this.resolveNotebookWorkingDirectory(notebookUri);
		}

		const sessionMetadata: IRuntimeSessionMetadata = {
			sessionId,
			sessionMode,
			notebookUri,
			workingDirectory,
			createdTimestamp: Date.now(),
			startReason: source
		};

		let session: ILanguageRuntimeSession;
		try {
			session = await sessionManager.createSession(runtimeMetadata, sessionMetadata);
		} catch (err) {
			this._logService.error(
				`Creating session for language runtime ` +
				`${formatLanguageRuntimeMetadata(runtimeMetadata)} failed. Reason: ${err}`);
			startPromise.error(err);
			this.clearStartingSessionMaps(sessionMode, runtimeMetadata, notebookUri);

			throw err;
		}

		try {
			await this.doStartRuntimeSession(session, sessionManager, startMode, activate);
			startPromise.complete(sessionId);
		} catch (err) {
			startPromise.error(err);
		}

		return startPromise.p;
	}

	private async doStartRuntimeSession(session: ILanguageRuntimeSession,
		manager: ILanguageRuntimeSessionManager,
		startMode: RuntimeStartMode,
		activate: boolean):
		Promise<void> {
		const evt: IRuntimeSessionWillStartEvent = {
			session,
			startMode,
			activate
		};
		this._onWillStartRuntimeEmitter.fire(evt);

		this.attachToSession(session, manager, activate);

		try {
			await session.start();

			this.clearStartingSessionMaps(
				session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);

			if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
				this.addSessionToConsoleSessionMap(session);
			} else if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
				if (session.metadata.notebookUri) {
					this._logService.info(`Notebook session for ${session.metadata.notebookUri} started: ${session.metadata.sessionId}`);
					this._notebookSessionsByNotebookUri.set(session.metadata.notebookUri, session);
				} else {
					this._logService.error(`Notebook session ${formatLanguageRuntimeSession(session)} ` +
						`does not have a notebook URI.`);
				}
			}

			this._onDidStartRuntimeEmitter.fire(session);

			if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
				this._foregroundSession = session;
			}
		} catch (reason) {
			this.clearStartingSessionMaps(
				session.metadata.sessionMode, session.runtimeMetadata, session.metadata.notebookUri);

			this._onDidFailStartRuntimeEmitter.fire(session);

			this._logService.error(`Starting language runtime failed. Reason: ${reason}`);

			throw reason;
		}
	}

	private async getManagerForRuntime(runtime: ILanguageRuntimeMetadata): Promise<ILanguageRuntimeSessionManager> {
		for (const manager of this._sessionManagers) {
			if (await manager.managesRuntime(runtime)) {
				return manager;
			}
		}
		throw new Error(`No session manager found for runtime ` +
			`${formatLanguageRuntimeMetadata(runtime)} ` +
			`(${this._sessionManagers.length} managers registered).`);
	}

	private attachToSession(
		session: ILanguageRuntimeSession,
		manager: ILanguageRuntimeSessionManager,
		activate: boolean): void {
		const oldSession = this._activeSessionsBySessionId.get(session.sessionId);
		if (oldSession) {
			oldSession.dispose();
		}

		const activeSession = new ActiveRuntimeSession(
			session,
			manager,
			this._logService,
			this._openerService,
			this._environmentService,
		);
		this._activeSessionsBySessionId.set(session.sessionId, activeSession);
		this._register(activeSession);
		this._register(activeSession.onDidReceiveRuntimeEvent(evt => {
			this._onDidReceiveRuntimeEventEmitter.fire(evt);
		}));

		activeSession.register(activeSession.onUiClientStarted(uiClient => {
			this._onDidStartUiClientEmitter.fire({ sessionId: session.sessionId, uiClient });
		}));

		activeSession.register(session.onDidChangeRuntimeState(state => {
			switch (state) {
				case RuntimeState.Ready:
					if (session !== this._foregroundSession &&
						session.metadata.sessionMode === LanguageRuntimeSessionMode.Console &&
						activate) {
						this.foregroundSession = session;
					}

					if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
						this.addSessionToConsoleSessionMap(session);
					} else if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook &&
						session.metadata.notebookUri &&
						!this._notebookSessionsByNotebookUri.has(session.metadata.notebookUri)) {
						this._notebookSessionsByNotebookUri.set(session.metadata.notebookUri, session);
					}

					activeSession.startUiClient().then((clientId) => {
						this._logService.debug(`UI client ${clientId} bound to session ${session.sessionId}`);
					});
					break;

				case RuntimeState.Interrupting:
					this.waitForInterrupt(session);
					break;

				case RuntimeState.Exiting:
					this.waitForShutdown(session);
					break;

				case RuntimeState.Offline:
					this.waitForReconnect(session);
					break;

				case RuntimeState.Starting:
					if (activeSession.state === RuntimeState.Exited) {
						this._onWillStartRuntimeEmitter.fire({
							session,
							startMode: RuntimeStartMode.Restarting,
							activate: false
						});
					}
					break;

				case RuntimeState.Exited:
					this.updateSessionMapsAfterExit(session);
					break;
			}

			const sessionInfo = this._activeSessionsBySessionId.get(session.sessionId);
			if (!sessionInfo) {
				this._logService.error(
					`Session ${formatLanguageRuntimeSession(session)} is not active.`);
			} else {
				const oldState = sessionInfo.state;
				(sessionInfo as any).state = state;
				this._onDidChangeRuntimeStateEmitter.fire({
					session_id: session.sessionId,
					old_state: oldState,
					new_state: state
				});
			}
		}));

		activeSession.register(session.onDidEndSession(async exit => {
			this.updateSessionMapsAfterExit(session);

			setTimeout(() => {
				const sessionInfo = this._activeSessionsBySessionId.get(session.sessionId);
				if (!sessionInfo) {
					this._logService.error(
						`Session ${formatLanguageRuntimeSession(session)} is not active.`);
					return;
				}

				if (exit.reason === RuntimeExitReason.ExtensionHost &&
					session.runtimeMetadata.sessionLocation ===
					LanguageRuntimeSessionLocation.Workspace) {
					this._disconnectedSessions.set(session.sessionId, session);
				}
			}, 0);
		}));
	}

	watchUiClient(sessionId: string, handler: (uiClient: UiClientInstance) => void): IDisposable {
		const currentUiClient = this.getActiveSession(sessionId)?.uiClient;
		if (currentUiClient) {
			handler(currentUiClient);
		}

		const disposable = this.onDidStartUiClient((event) => {
			if (event.sessionId === sessionId) {
				handler(event.uiClient);
			}
		});

		return disposable;
	}

	private validateRuntimeSessionStart(
		sessionMode: LanguageRuntimeSessionMode,
		languageRuntime: ILanguageRuntimeMetadata,
		notebookUri: URI | undefined,
		source?: string,
	): string | undefined {
		if (sessionMode === LanguageRuntimeSessionMode.Console) {
			const startingLanguageRuntime = this._startingConsolesByRuntimeId.get(
				languageRuntime.runtimeId);
			if (startingLanguageRuntime) {
				throw new Error(`Session for language runtime ` +
					`${formatLanguageRuntimeMetadata(languageRuntime)} ` +
					`cannot be started because language runtime ` +
					`${formatLanguageRuntimeMetadata(startingLanguageRuntime)} ` +
					`is already starting for the language.` +
					(source ? ` Request source: ${source}` : ``));
			}

			if (this._activeSessionsBySessionId.size >= MAX_CONCURRENT_SESSIONS) {
				this._notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.console.maxError', "Cannot start console session.\
							The maximum number of consoles ({0}) has been reached", MAX_CONCURRENT_SESSIONS)
				});

				throw new Error(`Session for language runtime ` +
					`${formatLanguageRuntimeMetadata(languageRuntime)} ` +
					`cannot be started because the maximum number of ` +
					`runtime sessions has been reached.`
				);
			}
		} else if (sessionMode === LanguageRuntimeSessionMode.Notebook) {
			if (!notebookUri) {
				throw new Error(`A notebook URI must be provided when starting a notebook session.`);
			}

			const startingLanguageRuntime = this._startingNotebooksByNotebookUri.get(notebookUri);
			if (startingLanguageRuntime) {
				throw new Error(`Session for language runtime ` +
					`${formatLanguageRuntimeMetadata(languageRuntime)} ` +
					`cannot be started because language runtime ` +
					`${formatLanguageRuntimeMetadata(startingLanguageRuntime)} ` +
					`is already starting for the notebook ${notebookUri.toString()}.` +
					(source ? ` Request source: ${source}` : ``));
			}

			const runningLanguageRuntime = this._notebookSessionsByNotebookUri.get(notebookUri);
			if (runningLanguageRuntime) {
				const metadata = runningLanguageRuntime.runtimeMetadata;
				if (metadata.runtimeId === languageRuntime.runtimeId) {
					return runningLanguageRuntime.sessionId;
				} else {
					throw new Error(`A notebook for ` +
						`${formatLanguageRuntimeMetadata(languageRuntime)} ` +
						`cannot be started because a notebook for ` +
						`${formatLanguageRuntimeMetadata(metadata)} is already running ` +
						`for the URI ${notebookUri.toString()}.` +
						(source ? ` Request source: ${source}` : ``));
				}
			}
		}

		return undefined;
	}

	private setStartingSessionMaps(
		sessionMode: LanguageRuntimeSessionMode,
		runtimeMetadata: ILanguageRuntimeMetadata,
		notebookUri?: URI) {
		if (sessionMode === LanguageRuntimeSessionMode.Console) {
			this._startingConsolesByRuntimeId.set(runtimeMetadata.runtimeId, runtimeMetadata);
		} else if (sessionMode === LanguageRuntimeSessionMode.Notebook && notebookUri) {
			this._startingNotebooksByNotebookUri.set(notebookUri, runtimeMetadata);
		}
	}

	private clearStartingSessionMaps(
		sessionMode: LanguageRuntimeSessionMode,
		runtimeMetadata: ILanguageRuntimeMetadata,
		notebookUri?: URI) {
		const sessionMapKey = getSessionMapKey(sessionMode, runtimeMetadata.runtimeId, notebookUri);
		this._startingSessionsBySessionMapKey.delete(sessionMapKey);
		if (sessionMode === LanguageRuntimeSessionMode.Console) {
			this._startingConsolesByRuntimeId.delete(runtimeMetadata.runtimeId);
		} else if (sessionMode === LanguageRuntimeSessionMode.Notebook && notebookUri) {
			this._startingNotebooksByNotebookUri.delete(notebookUri);
		}
	}

	private updateSessionMapsAfterExit(session: ILanguageRuntimeSession) {
		if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
			const runtimeConsoleSessions = this._consoleSessionsByRuntimeId.
				get(session.runtimeMetadata.runtimeId) || [];

			const newRuntimeConsoleSessions = runtimeConsoleSessions.filter(s => s.sessionId !== session.sessionId);

			if (newRuntimeConsoleSessions.length > 0) {
				this._consoleSessionsByRuntimeId.set(session.runtimeMetadata.runtimeId, newRuntimeConsoleSessions);
			} else {
				this._consoleSessionsByRuntimeId.delete(session.runtimeMetadata.runtimeId);
			}
		} else if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			if (session.metadata.notebookUri) {
				this._logService.info(`Notebook session for ${session.metadata.notebookUri} exited.`);
				this._notebookSessionsByNotebookUri.delete(session.metadata.notebookUri);
			} else {
				this._logService.error(`Notebook session ${formatLanguageRuntimeSession(session)} ` +
					`does not have a notebook URI.`);
			}
		}
	}

	private addSessionToConsoleSessionMap(session: ILanguageRuntimeSession) {
		const runtimeId = session.runtimeMetadata.runtimeId;
		const runtimeSessions = this._consoleSessionsByRuntimeId.get(runtimeId) || [];

		const foundSession = runtimeSessions?.some(s => s.sessionId === session.sessionId);

		if (!foundSession) {
			this._consoleSessionsByRuntimeId.set(runtimeId, [...runtimeSessions, session]);
		}
	}

	private async waitForInterrupt(session: ILanguageRuntimeSession) {
		const warning = nls.localize('erdos.runtimeInterruptTimeoutWarning', "{0} isn't responding to your request to interrupt the command. Do you want to forcefully quit your {1} session? You'll lose any unsaved objects.", session.dynState.sessionName, session.runtimeMetadata.languageName);
		this.awaitStateChange(session,
			[RuntimeState.Idle],
			10,
			warning);
	}

	private async waitForShutdown(session: ILanguageRuntimeSession) {
		const warning = nls.localize('erdos.runtimeShutdownTimeoutWarning', "{0} isn't responding to your request to shut down the session. Do you want use a forced quit to end your {1} session? You'll lose any unsaved objects.", session.dynState.sessionName, session.runtimeMetadata.languageName);
		this.awaitStateChange(session,
			[RuntimeState.Exited],
			10,
			warning);
	}

	private async waitForReconnect(session: ILanguageRuntimeSession) {
		const warning = nls.localize('erdos.runtimeReconnectTimeoutWarning', "{0} has been offline for more than 30 seconds. Do you want to force quit your {1} session? You'll lose any unsaved objects.", session.dynState.sessionName, session.runtimeMetadata.languageName);
		this.awaitStateChange(session,
			[RuntimeState.Ready, RuntimeState.Idle],
			30,
			warning);
	}

	private async awaitStateChange(session: ILanguageRuntimeSession,
		targetStates: RuntimeState[],
		seconds: number,
		warning: string) {

		const disposables = new DisposableStore();

		if (this._modalWaitPrompt) {
			this._modalWaitPrompt.close();
			this._modalWaitPrompt = undefined;
		}

		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject();

				this._modalWaitPrompt = this._erdosModalDialogsService.showModalDialogPrompt(
					nls.localize('erdos.runtimeNotResponding', "{0} is not responding", session.runtimeMetadata.runtimeName),
					warning,
					nls.localize('erdos.runtimeForceQuit', "Force Quit"),
					nls.localize('erdos.runtimeKeepWaiting', "Wait")
				);

				disposables.add(this._modalWaitPrompt.onChoice((choice) => {
					if (choice) {
						session.forceQuit();
					}
					this._modalWaitPrompt = undefined;
					disposables.dispose();
				}));
			}, seconds * 1000);

			const completeStateChange = () => {
				clearTimeout(timer);
				resolve();

				if (this._modalWaitPrompt) {
					this._modalWaitPrompt.close();
					this._modalWaitPrompt = undefined;
				}
				disposables.dispose();
			};

			disposables.add(session.onDidChangeRuntimeState(state => {
				if (targetStates.includes(state)) {
					completeStateChange();
				}
			}));

			disposables.add(session.onDidEndSession(() => {
				if (targetStates.includes(RuntimeState.Exited)) {
					completeStateChange();
				}
			}));

			disposables.add(toDisposable(() => clearTimeout(timer)));
		});
	}

	private generateNewSessionId(metadata: ILanguageRuntimeMetadata, isNotebook: boolean | undefined): string {
		const id = `${metadata.languageId}-${isNotebook ? 'notebook-' : ''}${Math.random().toString(16).slice(2, 10)}`;

		if (this._activeSessionsBySessionId.has(id)) {
			return this.generateNewSessionId(metadata, isNotebook);
		}

		return id;
	}

	private async scheduleUpdateActiveLanguages(delay = 60 * 60 * 1000): Promise<IDisposable> {
		const updateLanguagesDisposable = disposableTimeout(() => {
			this.updateActiveLanguages();

			this.scheduleUpdateActiveLanguages();
		}, delay);

		this._register(updateLanguagesDisposable);
		return updateLanguagesDisposable;
	}

	public updateActiveLanguages(): void {
		const languages = new Set<string>();
		this._activeSessionsBySessionId.forEach(activeSession => {
			const startUTC = new Date(Date.now()).setUTCHours(0, 0, 0, 0);
			const lastUsed = activeSession.session.lastUsed;

			if (lastUsed > startUTC && activeSession.session.getRuntimeState() !== RuntimeState.Exited) {
				languages.add(activeSession.session.runtimeMetadata.languageId);
			}
		});

	}

	updateNotebookSessionUri(oldUri: URI, newUri: URI): string | undefined {

		const session = this._notebookSessionsByNotebookUri.get(oldUri);

		if (!session) {
			this._logService.debug(`No notebook session found for URI: ${oldUri.toString()}`);
			return undefined;
		}

		if (session.getRuntimeState() === RuntimeState.Exited) {
			this._logService.warn('Cannot update URI for terminated session', {
				sessionId: session.sessionId,
				oldUri: oldUri.toString()
			});
			return undefined;
		}

		const sessionId = session.sessionId;

		try {
			this._notebookSessionsByNotebookUri.set(newUri, session);

			session.dynState.currentNotebookUri = newUri;

			this._notebookSessionsByNotebookUri.delete(oldUri);

			this._logService.debug(`Successfully updated notebook session URI: ${oldUri.toString()} → ${newUri.toString()}`);

			this._onDidUpdateNotebookSessionUriEmitter.fire({
				sessionId,
				oldUri,
				newUri
			});

			return sessionId;
		} catch (error) {
			this._logService.error('Failed to update notebook session URI', error);

			if (!this._notebookSessionsByNotebookUri.has(oldUri)) {
				this._notebookSessionsByNotebookUri.set(oldUri, session);
			}

			if (this._notebookSessionsByNotebookUri.get(newUri) === session) {
				this._notebookSessionsByNotebookUri.delete(newUri);
			}

			if (session.dynState.currentNotebookUri === newUri) {
				session.dynState.currentNotebookUri = oldUri;
			}

			return undefined;
		}
	}
}

registerSingleton(IRuntimeSessionService, RuntimeSessionService, InstantiationType.Eager);

function awaitStateChange(
	activeSession: ActiveRuntimeSession,
	targetStates: RuntimeState[],
	seconds: number,
): Promise<void> {
	const { session } = activeSession;
	return new Promise<void>((resolve, reject) => {
		const disposables = activeSession.register(new DisposableStore());

		disposables.add(disposableTimeout(() => {
			disposables.dispose();
			const formattedTargetStates = targetStates.map(s => `'${s}'`).join(' or ');
			reject(new Error(`Timed out waiting for runtime ` +
				`${formatLanguageRuntimeSession(session)} to be ${formattedTargetStates}.`));
		}, seconds * 1000));

		disposables.add(session.onDidChangeRuntimeState((state) => {
			if (targetStates.includes(state)) {
				disposables.dispose();
				resolve();
			}
		}));

		if (targetStates.includes(RuntimeState.Exited)) {
			disposables.add(session.onDidEndSession(() => {
				disposables.dispose();
				resolve();
			}));
		}
	});
}
