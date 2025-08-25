

import * as nls from '../../../../nls.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEphemeralStateService } from '../../../../platform/ephemeralState/common/ephemeralState.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILanguageRuntimeExit, ILanguageRuntimeMetadata, ILanguageRuntimeService, IRuntimeManager, LanguageRuntimeSessionLocation, LanguageRuntimeSessionMode, LanguageRuntimeStartupBehavior, RuntimeExitReason, RuntimeStartupPhase, RuntimeState, LanguageStartupBehavior, formatLanguageRuntimeMetadata } from '../../languageRuntime/common/languageRuntimeService.js';
import { IRuntimeAutoStartEvent, IRuntimeStartupService, ISessionRestoreFailedEvent, SerializedSessionMetadata } from './runtimeStartupService.js';
import { ILanguageRuntimeSession, IRuntimeSessionService, RuntimeStartMode } from '../../runtimeSession/common/runtimeSessionService.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILifecycleService, ShutdownReason } from '../../lifecycle/common/lifecycle.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IErdosNewFolderService } from '../../erdosNewFolder/common/erdosNewFolder.js';
import { isWeb } from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Barrier } from '../../../../base/common/async.js';

interface ILanguageRuntimeProviderMetadata {
	languageId: string;
}

interface IAffiliatedRuntimeMetadata {
	metadata: ILanguageRuntimeMetadata;
	lastUsed: number;
	lastStarted: number;
}

const PERSISTENT_WORKSPACE_SESSIONS = 'erdos.workspaceSessionList.v3';

const languageRuntimeExtPoint =
	ExtensionsRegistry.registerExtensionPoint<ILanguageRuntimeProviderMetadata[]>({
		extensionPoint: 'languageRuntimes',
		jsonSchema: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					languageId: {
						type: 'string',
						description: nls.localize('contributes.languageRuntime.languageId', 'The language ID for which this extension provides runtime services.'),
					}
				}
			}
		}
	});

export class RuntimeStartupService extends Disposable implements IRuntimeStartupService {
	
	declare readonly _serviceBrand: undefined;

	private readonly storageKey = 'erdos.affiliatedRuntimeMetadata.v2';

	private readonly _languagePacks: Map<string, Array<ExtensionIdentifier>> = new Map();

	private readonly _encounteredLanguagesByLanguageId = new Set<string>();

	private readonly _mostRecentlyStartedRuntimesByLanguageId = new Map<string, ILanguageRuntimeMetadata>();

	private readonly _discoveryCompleteByExtHostId = new Map<number, boolean>();

	private _startupPhase: RuntimeStartupPhase;

	private _shuttingDown = false;

	private _runtimeManagers: IRuntimeManager[] = [];

	private readonly _onWillAutoStartRuntime: Emitter<IRuntimeAutoStartEvent>;

	private readonly _onSessionRestoreFailure: Emitter<ISessionRestoreFailedEvent>;

	private _restoredSessions: SerializedSessionMetadata[] = [];
	private _foundRestoredSessions: Barrier = new Barrier();

	private _localWindowId: string;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEphemeralStateService private readonly _ephemeralStateService: IEphemeralStateService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IErdosNewFolderService private readonly _newFolderService: IErdosNewFolderService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {

		super();

		this._onWillAutoStartRuntime = new Emitter<IRuntimeAutoStartEvent>();
		this._onSessionRestoreFailure = new Emitter<ISessionRestoreFailedEvent>();
		this._register(this._onSessionRestoreFailure);
		this._register(this._onWillAutoStartRuntime);
		this.onWillAutoStartRuntime = this._onWillAutoStartRuntime.event;
		this.onSessionRestoreFailure = this._onSessionRestoreFailure.event;

		this._localWindowId = `window-${Math.random().toString(16).substring(2, 10)}`;

		this._register(
			this._runtimeSessionService.onDidChangeForegroundSession(
				this.onDidChangeActiveRuntime, this));

		this._register(
			this._languageRuntimeService.onDidRegisterRuntime(
				this.onDidRegisterRuntime, this));

		this._startupPhase = _languageRuntimeService.startupPhase;
		this._register(
			this._languageRuntimeService.onDidChangeRuntimeStartupPhase(
				(phase) => {
					this._logService.debug(`[Runtime startup] Phase changed to '${phase}'`);
					this._startupPhase = phase;
				}));


		this._register(this._runtimeSessionService.onWillStartSession(e => {
			this._register(e.session.onDidEncounterStartupFailure(_exit => {
				this.saveWorkspaceSessions(e.session.metadata.sessionId);
			}));
		}));

		this._register(this._runtimeSessionService.onDidFailStartRuntime(e => {
			this.saveWorkspaceSessions(e.sessionId);
		}));

		this._register(this._runtimeSessionService.onDidStartRuntime(session => {

			this._mostRecentlyStartedRuntimesByLanguageId.set(session.runtimeMetadata.languageId,
				session.runtimeMetadata);

			this.saveWorkspaceSessions();

			this._register(session.onDidEndSession(exit => {
				if (this._shuttingDown) {
					return;
				}

				if (exit.reason === RuntimeExitReason.Transferred ||
					exit.reason === RuntimeExitReason.Restart) {
					return;
				}

				this.saveWorkspaceSessions(session.metadata.sessionId);

				if (exit.reason === RuntimeExitReason.Error) {
					this.restartAfterCrash(session, exit);
				}
			}));
		}));

		this._register(this._languageRuntimeService.onDidChangeRuntimeStartupPhase(phase => {
			if (phase === RuntimeStartupPhase.Complete) {

				const languageIds = this._languagePacks.keys();
				let allDisabled = true;
				for (const languageId of languageIds) {
					if (this.getStartupBehavior(languageId) !== LanguageStartupBehavior.Disabled) {
						allDisabled = false;
						break;
					}
				}

				if (this._languageRuntimeService.registeredRuntimes.length === 0 &&
					!allDisabled) {
					this._notificationService.error(nls.localize('erdos.runtimeStartupService.noRuntimesMessage',
						"No interpreters found. Please see the [Get Started](https://erdos.posit.co/start) \
						documentation to learn how to prepare your Python and/or R environments to work with Erdos."));
				}

				else if (!this.hasAffiliatedRuntime() &&
					!this._runtimeSessionService.hasStartingOrRunningConsole()) {
					const languageRuntimes = this._languageRuntimeService.registeredRuntimes
						.filter(metadata => {
							return metadata.startupBehavior === LanguageRuntimeStartupBehavior.Immediate;
						})
						.filter(metadata => {
							const startupBehavior = this.getStartupBehavior(metadata.languageId);
							return startupBehavior !== LanguageStartupBehavior.Disabled &&
								startupBehavior !== LanguageStartupBehavior.Manual;
						});

					if (languageRuntimes.length) {
						const extension = languageRuntimes[0].extensionId;
						this.autoStartRuntime(languageRuntimes[0],
							`The ${extension.value} extension requested the runtime to be started immediately.`,
							true);
						return;
					}

					let languageId = '';
					const alwaysStarted = this._languageRuntimeService.registeredRuntimes
						.filter(metadata => {
							if (languageId !== '') {
								return false;
							}

							const always = this.getStartupBehavior(metadata.languageId) === LanguageStartupBehavior.Always;
							if (always) {
								languageId = metadata.languageId;
							}
							return always;
						});
					if (alwaysStarted.length) {
						this.autoStartRuntime(alwaysStarted[0],
							`The configuration specifies that a runtime should always start for the '${languageId}' language.`,
							true);
					}
				}
			}
		}));

		this._register(this._languageService.onDidRequestRichLanguageFeatures(languageId => {
			this._encounteredLanguagesByLanguageId.add(languageId);
		}));

		this._register(this._languageRuntimeService.onDidRegisterRuntime(runtime => {
			if (runtime.startupBehavior === LanguageRuntimeStartupBehavior.Immediate &&
				this._startupPhase === RuntimeStartupPhase.Complete &&
				!this._runtimeSessionService.hasStartingOrRunningConsole()) {

				this.autoStartRuntime(runtime,
					`An extension requested that the runtime start immediately after being registered.`, true);
			}

			else if (this._encounteredLanguagesByLanguageId.has(runtime.languageId) &&
				this._startupPhase === RuntimeStartupPhase.Complete &&
				!this._runtimeSessionService.hasStartingOrRunningConsole(runtime.languageId) &&
				runtime.startupBehavior === LanguageRuntimeStartupBehavior.Implicit &&
				!this.getAffiliatedRuntimeMetadata(runtime.languageId)) {

				this.autoStartRuntime(runtime,
					`A file with the language ID ${runtime.languageId} was open ` +
					`when the runtime was registered.`, true);
			}
		}));

		this._register(languageRuntimeExtPoint.setHandler((extensions) => {
			this._languagePacks.clear();

			for (const extension of extensions) {
				for (const value of extension.value) {
					this._logService.debug(`[Runtime startup] Extension ${extension.description.identifier.value} has been registered for language runtime for language ID '${value.languageId}'`);
					if (this._languagePacks.has(value.languageId)) {
						this._languagePacks.get(value.languageId)?.push(extension.description.identifier);
					} else {
						this._languagePacks.set(value.languageId, [extension.description.identifier]);
					}
				}
			}

			if (this._startupPhase === RuntimeStartupPhase.AwaitingTrust) {
				if (this._languagePacks.size > 0) {
					this.discoverAllRuntimes();
				} else {
					this._logService.debug(`[Runtime startup] No language packs were found.`);
					this.setStartupPhase(RuntimeStartupPhase.Complete);
				}
			} else if (this._startupPhase === RuntimeStartupPhase.Initializing && this._languagePacks.size > 0) {
				this.startupAfterTrust();
			}
		}));

		this._register(this._runtimeSessionService.onDidUpdateSessionName(() => {
			this.saveWorkspaceSessions();
		}));

		this._register(this._lifecycleService.onBeforeShutdown((e) => {
			this._shuttingDown = true;
			if (e.reason === ShutdownReason.RELOAD) {
				e.veto(this.saveWorkspaceSessions(),
					'erdos.runtimeStartup.saveWorkspaceSessions');
			} else {
				if (!isWeb) {
					e.veto(this.clearWorkspaceSessions(),
						'erdos.runtimeStartup.clearWorkspaceSessions');
				}
			}
		}));

		this.findRestoredSessions().then(() => {
			this._logService.trace(
				`[Runtime startup] Found ${this._restoredSessions.length} restored sessions.`);
		}).finally(() => {
			this._foundRestoredSessions.open();
		});
	}

	onWillAutoStartRuntime: Event<IRuntimeAutoStartEvent>;

	onSessionRestoreFailure: Event<ISessionRestoreFailedEvent>;

	getAffiliatedRuntimes(): Array<ILanguageRuntimeMetadata> {
		const languageIds = this.getAffiliatedRuntimeLanguageIds();
		const runtimes: ILanguageRuntimeMetadata[] = [];
		for (const languageId of languageIds) {
			const metadata = this.getAffiliatedRuntimeMetadata(languageId);
			if (metadata) {
				runtimes.push(metadata);
			}
		}
		return runtimes;
	}

	clearAffiliatedRuntime(languageId: string): void {
		this._storageService.remove(`${this.storageKey}.${languageId}`, this.affiliationStorageScope());
		this._logService.debug(`[Runtime startup] Cleared affiliated runtime for language ID '${languageId}'`);
	}

	private setStartupPhase(phase: RuntimeStartupPhase): void {
		this._startupPhase = phase;
		this._languageRuntimeService.setStartupPhase(phase);
	}

	private async findRestoredSessions() {
		let storedSessions: Array<SerializedSessionMetadata> = new Array();
		try {
			const sessions =
				await this._ephemeralStateService.getItem<Array<SerializedSessionMetadata>>(
					this.getEphemeralWorkspaceSessionsKey());
			if (sessions) {
				storedSessions = sessions;
			}
		} catch (err) {
			this._logService.warn(`Can't read workspace sessions from ${this.getEphemeralWorkspaceSessionsKey()}: ${err}. No sessions will be restored.`);
		}

		if (!storedSessions) {
			this._logService.debug(`[Runtime startup] No sessions to resume found in ephemeral storage.`);
		}

		const sessions = this._storageService.get(PERSISTENT_WORKSPACE_SESSIONS,
			StorageScope.WORKSPACE);
		if (sessions) {
			try {
				const stored = JSON.parse(sessions) as Array<SerializedSessionMetadata>;
				storedSessions.push(...stored);
			} catch (err) {
				this._logService.error(`Error parsing persisted workspace sessions: ${err} (sessions: '${sessions}')`);
			}
		}

		try {
			this._restoredSessions = storedSessions.map(session => ({
				...session,
				metadata: {
					...session.metadata,
					notebookUri: URI.revive(session.metadata.notebookUri),
				},
			}));
		} catch (err) {
			this._logService.error(`Could not restore workspace sessions: ${err?.stack ?? err} ` +
				`(data: ${JSON.stringify(storedSessions)})`);
		}

		this._restoredSessions.sort((a, b) => b.lastUsed - a.lastUsed);
	}

	public async getRestoredSessions(): Promise<SerializedSessionMetadata[]> {
		await this._foundRestoredSessions.wait();
		return this._restoredSessions;
	}

	private async startupSequence() {

		await this.restoreSessions();

		await this._newFolderService.initTasksComplete.wait();
		const newRuntime = this._newFolderService.newFolderRuntimeMetadata;
		if (newRuntime) {
			const newAffiliation: IAffiliatedRuntimeMetadata = {
				metadata: newRuntime,
				lastUsed: Date.now(),
				lastStarted: Date.now()
			};
			this.saveAffiliatedRuntime(newAffiliation);
		}

		const disabledLanguages = new Array<string>();
		const enabledLanguages = Array.from(this._languagePacks.keys()).filter(languageId => {
			if (this.getStartupBehavior(languageId) === LanguageStartupBehavior.Disabled) {
				this._logService.debug(`[Runtime startup] Skipping language runtime startup for language ID '${languageId}' because its startup behavior is disabled.`);
				disabledLanguages.push(languageId);
				return false;
			}
			return true;
		});

		this.setStartupPhase(RuntimeStartupPhase.Starting);

		try {
			if (!this._runtimeSessionService.hasStartingOrRunningConsole() &&
				this.hasAffiliatedRuntime()) {
				await this.startAffiliatedLanguageRuntimes(disabledLanguages, enabledLanguages);
			}

			if (!this._runtimeSessionService.hasStartingOrRunningConsole()) {
				await this.startRecommendedLanguageRuntimes(disabledLanguages, enabledLanguages);
			}
		} catch (err) {
			this._logService.error(`[Runtime startup] Error starting affiliated runtimes: ${err}`);
		}

		await this.discoverAllRuntimes();
	}

	private saveAffiliatedRuntime(affiliated: IAffiliatedRuntimeMetadata): void {

		if (!affiliated || !affiliated.metadata || !affiliated.metadata.languageId) {
			this._logService.debug(`[Runtime startup] Not saving invalid affiliation ${JSON.stringify(affiliated)}.`);
			return;
		}

		this._storageService.store(this.storageKeyForRuntime(affiliated.metadata),
			JSON.stringify(affiliated),
			this.affiliationStorageScope(),
			StorageTarget.MACHINE);
	}

	public completeDiscovery(id: number): void {
		this._discoveryCompleteByExtHostId.set(id, true);
		this._logService.debug(`[Runtime startup] Discovery completed for extension host with id: ${id}.`);

		let discoveryCompletedByAllExtensionHosts = true;
		for (const disoveryCompleted of this._discoveryCompleteByExtHostId.values()) {
			if (!disoveryCompleted) {
				discoveryCompletedByAllExtensionHosts = false;
				break;
			}
		}

		if (discoveryCompletedByAllExtensionHosts) {
			this.setStartupPhase(RuntimeStartupPhase.Complete);
			this._discoveryCompleteByExtHostId.forEach((_, extHostId, m) => {
				m.set(extHostId, false);
			});
		}
	}

	public registerRuntimeManager(manager: IRuntimeManager): IDisposable {
		this._discoveryCompleteByExtHostId.set(manager.id, false);
		this._runtimeManagers.push(manager);
		this._logService.debug(`[Runtime startup] Registered runtime manager (ext host) with id: ${manager.id}.`);

		return {
			dispose: () => {
				const index = this._runtimeManagers.indexOf(manager);
				if (index !== -1) {
					this._runtimeManagers.splice(index, 1);
				}
			}
		};
	}

	public async rediscoverAllRuntimes(): Promise<void> {

		if (this._startupPhase !== RuntimeStartupPhase.Complete) {
			this._logService.warn('[Runtime startup] Runtime discovery refresh called before initial discovery is complete.');
			return;
		}

		const oldRuntimes = this._languageRuntimeService.registeredRuntimes;
		this._register(
			this._languageRuntimeService.onDidChangeRuntimeStartupPhase(
				(phase) => {
					if (phase === RuntimeStartupPhase.Complete) {
						const newRuntimes = this._languageRuntimeService.registeredRuntimes;
						const addedRuntimes = newRuntimes.filter(newRuntime => {
							return !oldRuntimes.some(oldRuntime => {
								return oldRuntime.runtimeId === newRuntime.runtimeId;
							});
						});

						if (addedRuntimes.length > 0) {
							this._notificationService.info(nls.localize('erdos.runtimeStartupService.runtimesAddedMessage',
								"Found {0} new interpreter{1}: {2}.",
								addedRuntimes.length,
								addedRuntimes.length > 1 ? 's' : '',
								addedRuntimes.map(runtime => { return runtime.runtimeName; }).join(', ')));
						}
					}
				}
			)
		);

		this._logService.debug('[Runtime startup] Refreshing runtime discovery.');
		this._discoveryCompleteByExtHostId.forEach((_, extHostId, m) => {
			m.set(extHostId, false);
		});

		this.discoverAllRuntimes();

	}

	private onDidChangeActiveRuntime(session: ILanguageRuntimeSession | undefined): void {
		if (!session) {
			return;
		}

		if (session.runtimeMetadata.startupBehavior === LanguageRuntimeStartupBehavior.Manual) {
			return;
		}

		const oldAffiliation = this.getAffiliatedRuntime(session.runtimeMetadata.languageId);
		const lastStarted =
			oldAffiliation?.metadata.runtimeId === session.runtimeMetadata.runtimeId ?
				oldAffiliation.lastStarted :
				Date.now();

		const affiliated: IAffiliatedRuntimeMetadata = {
			metadata: session.runtimeMetadata,
			lastUsed: Date.now(),
			lastStarted
		};
		this.saveAffiliatedRuntime(affiliated);

		this._register(session.onDidChangeRuntimeState((newState) => {
			if (newState === RuntimeState.Exiting) {
				const serializedMetadata = this._storageService.get(
					this.storageKeyForRuntime(session.runtimeMetadata),
					this.affiliationStorageScope());
				if (!serializedMetadata) {
					return;
				}
				const affiliated = JSON.parse(serializedMetadata) as IAffiliatedRuntimeMetadata;
				const affiliatedRuntimeId = affiliated.metadata.runtimeId;
				if (session.runtimeMetadata.runtimeId === affiliatedRuntimeId) {
					this._storageService.remove(this.storageKeyForRuntime(session.runtimeMetadata),
						this.affiliationStorageScope());
				}
			}
		}));
	}

	private async discoverAllRuntimes() {

		if (this._startupPhase === RuntimeStartupPhase.AwaitingTrust &&
			this._languagePacks.size === 0) {

			setTimeout(() => {
				if (this._startupPhase === RuntimeStartupPhase.AwaitingTrust) {
					this.setStartupPhase(RuntimeStartupPhase.Complete);
				}
			}, 5000);
			return;
		}

		const disabledLanguages = new Array<string>();
		const enabledLanguages = Array.from(this._languagePacks.keys()).filter(languageId => {
			if (this.getStartupBehavior(languageId) === LanguageStartupBehavior.Disabled) {
				this._logService.debug(`[Runtime startup] Skipping language runtime discovery for language ID '${languageId}' because its startup behavior is disabled.`);
				disabledLanguages.push(languageId);
				return false;
			}
			return true;
		});

		await this.activateExtensionsForLanguages(enabledLanguages);

		this._logService.debug(`[Runtime startup] All extensions contributing language runtimes have been activated: [${enabledLanguages.join(', ')}]`);

		this.setStartupPhase(RuntimeStartupPhase.Discovering);

		for (const manager of this._runtimeManagers) {
			manager.discoverAllRuntimes(disabledLanguages);
		}
	}

	private onDidRegisterRuntime(metadata: ILanguageRuntimeMetadata): void {

		if (this._startupPhase !== RuntimeStartupPhase.Discovering) {
			return;
		}

		if (this._runtimeSessionService.hasStartingOrRunningConsole(metadata.languageId)) {
			return;
		}

		const affiliatedRuntimeMetadataStr = this._storageService.get(
			this.storageKeyForRuntime(metadata), this.affiliationStorageScope());
		if (!affiliatedRuntimeMetadataStr) {
			return;
		}
		const affiliated = JSON.parse(affiliatedRuntimeMetadataStr) as IAffiliatedRuntimeMetadata;
		const affiliatedRuntimeId = affiliated.metadata.runtimeId;

		if (metadata.runtimeId === affiliatedRuntimeId) {
			try {

				const startupBehavior = this.getStartupBehavior(metadata.languageId);
				if (startupBehavior === LanguageStartupBehavior.Disabled ||
					startupBehavior === LanguageStartupBehavior.Manual) {
					this._logService.info(`Language runtime ` +
						`${formatLanguageRuntimeMetadata(affiliated.metadata)} ` +
						`is affiliated with this workspace, but won't be started because ` +
						`the ${metadata.languageName} startup behavior is ${startupBehavior}.`);
					return;
				}

				if (metadata.startupBehavior === LanguageRuntimeStartupBehavior.Manual) {
					this._logService.info(`Language runtime ` +
						`${formatLanguageRuntimeMetadata(affiliated.metadata)} ` +
						`is affiliated with this workspace, but won't be started because its ` +
						`startup behavior is manual.`);
					return;
				}

				this._runtimeSessionService.startNewRuntimeSession(
					metadata.runtimeId,
					metadata.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined, // Console session
					`Affiliated runtime for workspace`,
					RuntimeStartMode.Starting,
					true);
			} catch (e) {
				this._logService.debug(`Did not start affiliated runtime ` +
					`${metadata.runtimeName} for this workspace: ` +
					`${e.message}`);
			}
		}
	}

	public getAffiliatedRuntimeMetadata(languageId: string): ILanguageRuntimeMetadata | undefined {
		const affiliated = this.getAffiliatedRuntime(languageId);
		if (!affiliated) {
			return undefined;
		}
		return affiliated.metadata;
	}

	private async getRecommendedRuntimes(disabledLanguageIds: string[]): Promise<ILanguageRuntimeMetadata[]> {

		const metadata = await Promise.all(
			this._runtimeManagers.map(
				manager => manager.recommendWorkspaceRuntimes(disabledLanguageIds))
		);

		return metadata.flat();
	}

	private getAffiliatedRuntime(languageId: string): IAffiliatedRuntimeMetadata | undefined {
		const stored = this._storageService.get(`${this.storageKey}.${languageId}`,
			this.affiliationStorageScope());
		if (!stored) {
			return undefined;
		}
		try {
			const affiliated = JSON.parse(stored) as IAffiliatedRuntimeMetadata;
			return affiliated;
		} catch (err) {
			this._logService.error(`Error parsing JSON for ${this.storageKey}: ${err}`);
		return undefined;
		}
	}

	public getAffiliatedRuntimeLanguageIds(): string[] {
		const languageIds = new Array<string>();
		const keys = this._storageService.keys(this.affiliationStorageScope(),
			StorageTarget.MACHINE);
		for (const key of keys) {
			if (key.startsWith(this.storageKey)) {
				languageIds.push(key.replace(`${this.storageKey}.`, ''));
			}
		}
		return languageIds;
	}

	public hasAffiliatedRuntime(): boolean {
		const keys = this._storageService.keys(
			this.affiliationStorageScope(), StorageTarget.MACHINE);
		for (const key of keys) {
			if (key.startsWith(this.storageKey)) {
				return true;
			}
		}
		return false;
	}

	public getPreferredRuntime(languageId: string): ILanguageRuntimeMetadata | undefined {
		const activeSession =
			this._runtimeSessionService.getConsoleSessionForLanguage(languageId);
		if (activeSession) {
			return activeSession.runtimeMetadata;
		}

		const affiliatedRuntimeMetadata = this.getAffiliatedRuntimeMetadata(languageId);
		if (affiliatedRuntimeMetadata) {
			const affiliatedRuntimeInfo =
				this._languageRuntimeService.getRegisteredRuntime(affiliatedRuntimeMetadata.runtimeId);
			if (affiliatedRuntimeInfo) {
				return affiliatedRuntimeInfo;
			}
		}

		const mostRecentlyStartedRuntime = this._mostRecentlyStartedRuntimesByLanguageId.get(languageId);
		if (mostRecentlyStartedRuntime) {
			return mostRecentlyStartedRuntime;
		}

		const languageRuntimeInfos =
			this._languageRuntimeService.registeredRuntimes
				.filter(info => info.languageId === languageId);
		if (languageRuntimeInfos.length) {
			return languageRuntimeInfos[0];
		}

		return undefined;
	}

	private async startRecommendedLanguageRuntimes(disabledLanguageIds: string[], enabledLanguageIds: string[]): Promise<void> {
		await this.activateExtensionsForLanguages(enabledLanguageIds);

		const runtimes = await this.getRecommendedRuntimes(disabledLanguageIds);
		if (runtimes.length === 0) {
			return;
		}

		const promises = runtimes.map(async (runtime, idx) => {
			if (disabledLanguageIds.includes(runtime.languageId)) {
				this._logService.debug(`[Runtime startup] Skipping language runtime startup for language ID '${runtime.languageId}' because its startup behavior is disabled.`);
				return;
			}

			this._register(this._languageRuntimeService.registerRuntime(runtime));

			if (runtime.startupBehavior === LanguageRuntimeStartupBehavior.Immediate) {
				await this.autoStartRuntime(runtime,
					`The ${runtime.extensionId.value} extension recommended the runtime to be started in this workspace.`,
					idx === 0);
			} else {
				const oldAffiliation = this.getAffiliatedRuntime(runtime.languageId);
				if (!oldAffiliation) {
					const affiliated: IAffiliatedRuntimeMetadata = {
						metadata: runtime,
						lastUsed: 0,
						lastStarted: 0
					};
					this.saveAffiliatedRuntime(affiliated);
				}
			}
		});

		await Promise.all(promises);
	}

	private async startAffiliatedLanguageRuntimes(disabledLanguageIds: string[], _enabledLanguageIds: string[]): Promise<void> {
		let languageIds = this.getAffiliatedRuntimeLanguageIds();

		languageIds = languageIds.filter(languageId => {
			return !disabledLanguageIds.includes(languageId);
		});

		languageIds = languageIds.filter(languageId => {
			const startupBehavior = this.getStartupBehavior(languageId);
			return startupBehavior === LanguageStartupBehavior.Always || startupBehavior === LanguageStartupBehavior.Auto;
		});

		if (!languageIds) {
			return;
		}

		languageIds.map(languageId => {
			return this.getAffiliatedRuntime(languageId);
		}).filter(affiliation => {
			return affiliation !== undefined;
		}).filter(affiliation => {

			if (languageIds.length === 1) {
				return true;
			}

			if (affiliation.lastStarted === 0 &&
				affiliation.lastUsed === 0) {
				this._logService.debug(`[Runtime startup] Affiliated runtime ` +
					`${formatLanguageRuntimeMetadata(affiliation.metadata)} ` +
					`not marked for autostart`);

				return false;
			}

			if (affiliation.lastStarted > affiliation.lastUsed) {
				this._logService.debug(`[Runtime startup] Affiliated runtime ` +
					`${formatLanguageRuntimeMetadata(affiliation.metadata)} ` +
					`last used on ${new Date(affiliation.lastUsed).toLocaleString()}, ` +
					`last started on ${new Date(affiliation.lastStarted).toLocaleString()}. ` +
					`It will not be auto-started`);
				return false;
			}
			return true;
		}).sort((a, b) => {
			return b.lastUsed - a.lastUsed;
		}).map(async (affiliation, idx) => {
			if (idx === 0) {
				this._onWillAutoStartRuntime.fire({
					runtime: affiliation.metadata,
					newSession: true
				});
			}

			await this.activateExtensionsForLanguages([affiliation.metadata.languageId]);

			this.startAffiliatedRuntime(affiliation, idx === 0);
		});
	}

	private storageKeyForRuntime(metadata: ILanguageRuntimeMetadata): string {
		return `${this.storageKey}.${metadata.languageId}`;
	}

	private affiliationStorageScope(): StorageScope {
		if (this._workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return StorageScope.PROFILE;
		}
		return StorageScope.WORKSPACE;
	}

	private async activateExtensionsForLanguages(languageIds: Array<string>): Promise<void> {
		const activationPromises = languageIds.map(
			async (languageId) => {
				for (const extension of this._languagePacks.get(languageId) || []) {
					this._logService.debug(`[Runtime startup] Activating extension ${extension.value} for language ID ${languageId}`);
					try {
						await this._extensionService.activateById(extension,
							{
								extensionId: extension,
								activationEvent: `onLanguageRuntime:${languageId}`,
								startup: false
							});
					} catch (e) {
						this._logService.debug(
							`[Runtime startup] Error activating extension ${extension.value}: ${e}`);
					}
				}
			});
		await Promise.all(activationPromises);
	}

	private startAffiliatedRuntime(
		affiliatedRuntime: IAffiliatedRuntimeMetadata,
		activate: boolean
	): void {

		if (!affiliatedRuntime.metadata) {
			return;
		}

		const affiliatedRuntimeMetadata = affiliatedRuntime.metadata;

		if (affiliatedRuntimeMetadata.startupBehavior === LanguageRuntimeStartupBehavior.Manual) {
			this._logService.info(`Language runtime ` +
				`${formatLanguageRuntimeMetadata(affiliatedRuntimeMetadata)} ` +
				`is affiliated with this workspace, but won't be started because its startup ` +
				`behavior is manual.`);
			return;
		}

		affiliatedRuntime.lastStarted = Date.now();
		this.saveAffiliatedRuntime(affiliatedRuntime);

		this.autoStartRuntime(affiliatedRuntimeMetadata,
			`Affiliated ${affiliatedRuntimeMetadata.languageName} runtime for workspace`,
			activate);
	}

	private async restoreSessions() {

		this._logService.debug(`[Runtime startup] Session restore; workspace: ${this._workspaceContextService.getWorkspace().id}, workbench state: ${this._workspaceContextService.getWorkbenchState()}, startupKind: ${this._lifecycleService.startupKind}`);

		const sessions = await this.getRestoredSessions();

		if (sessions.length === 0) {
			return;
		}

		try {
			await this.restoreWorkspaceSessions(sessions);
		} catch (err) {
			this._logService.error(`Could not restore workspace sessions: ${err?.stack ?? err} ` +
				`(data: ${JSON.stringify(sessions)})`);
		}
	}

	private async restoreWorkspaceSessions(sessions: SerializedSessionMetadata[]) {

		this.setStartupPhase(RuntimeStartupPhase.Reconnecting);

		sessions.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));

		this._onWillAutoStartRuntime.fire({
			runtime: sessions[0].runtimeMetadata,
			newSession: false
		});

		const activatedExtensions: Array<ExtensionIdentifier> = [];
		await Promise.all(sessions.filter(async session =>
			session.runtimeMetadata.sessionLocation === LanguageRuntimeSessionLocation.Machine
		).map(async session => {
			if (activatedExtensions.indexOf(session.runtimeMetadata.extensionId) === -1) {
				this._logService.debug(`[Runtime startup] Activating extension ` +
					`${session.runtimeMetadata.extensionId.value} for persisted session ` +
					`${session.sessionName} (${session.metadata.sessionId})`);
				activatedExtensions.push(session.runtimeMetadata.extensionId);
				return this._extensionService.activateById(session.runtimeMetadata.extensionId,
					{
						extensionId: session.runtimeMetadata.extensionId,
						activationEvent: `onLanguageRuntime:${session.runtimeMetadata.languageId}`,
						startup: false
					});
			}
		}));

		const validSessions = await Promise.all(sessions.map(async session => {
			if (session.runtimeMetadata.sessionLocation === LanguageRuntimeSessionLocation.Browser) {
				this._logService.info(`[Runtime startup] Not restoring unexpected persisted ` +
					`browser session ${session.sessionName} (${session.metadata.sessionId})`);
				return false;
			} else {
				this._logService.debug(`[Runtime startup] Checking to see if persisted session ` +
					`${session.sessionName} (${session.metadata.sessionId}) is still valid.`);
				try {
					const valid = await this._runtimeSessionService.validateRuntimeSession(
						session.runtimeMetadata,
						session.metadata.sessionId);

					this._logService.debug(
						`[Runtime startup] Session ` +
						`${session.sessionName} (${session.metadata.sessionId}) valid = ${valid}`);

					if (!valid) {
						const error: ISessionRestoreFailedEvent = {
							sessionId: session.metadata.sessionId,
							error: new Error(`Session is no longer available`)
						};
						this._onSessionRestoreFailure.fire(error);
					}

					return valid;
				} catch (err) {
					this._logService.error(
						`Error validating persisted session ` +
						`${session.sessionName} (${session.metadata.sessionId}): ${err}`);

					const error: ISessionRestoreFailedEvent = {
						sessionId: session.metadata.sessionId,
						error: new Error(`Could not validate session: ${err}`)
					};
					this._onSessionRestoreFailure.fire(error);
					return false;
				}
			}
		}));

		sessions = sessions.filter((_, i) => validSessions[i]);

		this._logService.debug(`Reconnecting to sessions: ` +
			sessions.map(session => session.sessionName).join(', '));

		let firstConsole = true;

		await Promise.all(sessions.map(async (session, idx) => {
			const marker =
				`[Reconnect ${session.metadata.sessionId} (${idx + 1}/${sessions.length})]`;

			if (!activatedExtensions.includes(session.runtimeMetadata.extensionId)) {
				await this._extensionService.activateById(session.runtimeMetadata.extensionId,
					{
						extensionId: session.runtimeMetadata.extensionId,
						activationEvent: `onLanguageRuntime:${session.runtimeMetadata.languageId}`,
						startup: false
					});
			}

			this._logService.debug(`${marker}: Restoring session for ` +
				`${session.sessionName}`);

			const activate = firstConsole;
			if (!session.metadata.notebookUri) {
				firstConsole = false;
			}

			try {
				await this._runtimeSessionService.restoreRuntimeSession(
					session.runtimeMetadata, session.metadata, session.sessionName, activate);
			} catch (err) {
				const error: ISessionRestoreFailedEvent = {
					sessionId: session.metadata.sessionId,
					error: new Error(`Could not reconnect: ${err}`)
				};
				this._onSessionRestoreFailure.fire(error);
			}
		}));
	}

	private async clearWorkspaceSessions(): Promise<boolean> {
		await this._ephemeralStateService.removeItem(this.getEphemeralWorkspaceSessionsKey());

		return false;
	}

	private async saveWorkspaceSessions(removeSessionId?: string): Promise<boolean> {
		const activeSessions = this._runtimeSessionService.activeSessions
			.filter(session =>
				session.getRuntimeState() !== RuntimeState.Uninitialized &&
				session.getRuntimeState() !== RuntimeState.Initializing &&
				session.getRuntimeState() !== RuntimeState.Exited
			)
			.map(session => {
				const activeSession =
					this._runtimeSessionService.getActiveSession(session.metadata.sessionId);

				const metadata: SerializedSessionMetadata = {
					sessionName: session.dynState.sessionName,
					metadata: session.metadata,
					sessionState: session.getRuntimeState(),
					runtimeMetadata: session.runtimeMetadata,
					workingDirectory: activeSession?.workingDirectory || '',
					lastUsed: session.lastUsed,
					localWindowId: this._localWindowId,
				};

				return metadata;
			});

		this._logService.trace(`Saving workspace sessions: ${activeSessions.map(session =>
			`${session.sessionName} (${session.metadata.sessionId}, ${session.runtimeMetadata.sessionLocation})`).join(', ')}`);

		const workspaceSessions = activeSessions.filter(session =>
			session.runtimeMetadata.sessionLocation === LanguageRuntimeSessionLocation.Workspace);

		const existingSessions = Array.from(
			(await this._ephemeralStateService.getItem<SerializedSessionMetadata[]>(
				this.getEphemeralWorkspaceSessionsKey())) || []);
		const activeSessionIds: Set<string> =
			new Set(workspaceSessions.map(session => session.metadata.sessionId));

		const preservedSessions = existingSessions.filter(session => {
			if (activeSessionIds.has(session.metadata.sessionId)) {
				return false;
			}
			if (session.metadata.sessionId === removeSessionId) {
				return false;
			}
			if (session.localWindowId !== this._localWindowId) {
				return true;
			}
			return false;
		});

		const newSessions = preservedSessions.concat(workspaceSessions);

		this._logService.debug(`[Runtime startup] Saving ephemeral workspace sessions ` +
			`(${workspaceSessions.length} local, ${newSessions.length} total)`);
		this._ephemeralStateService.setItem(this.getEphemeralWorkspaceSessionsKey(),
			newSessions);

		const machineSessions = activeSessions.filter(session =>
			session.runtimeMetadata.sessionLocation === LanguageRuntimeSessionLocation.Machine);
		this._logService.debug(`[Runtime startup] Saving machine-persisted workspace sessions (${machineSessions.length})`);
		this._storageService.store(
			PERSISTENT_WORKSPACE_SESSIONS,
			JSON.stringify(machineSessions),
			StorageScope.WORKSPACE, StorageTarget.MACHINE);

		return false;
	}

	private async restartAfterCrash(session: ILanguageRuntimeSession, exit: ILanguageRuntimeExit): Promise<boolean> {
		if (this._startupPhase !== RuntimeStartupPhase.Complete) {
			return false;
		}

		const restartOnCrash =
			this._configurationService.getValue<boolean>('interpreters.restartOnCrash');

		let action;

		if (restartOnCrash) {
			await new Promise<void>(resolve => setTimeout(resolve, 250));

			await this._runtimeSessionService.restartSession(
				session.sessionId,
				`The runtime exited unexpectedly and is being restarted automatically.`
			);

			action = 'and was automatically restarted';
		} else {
			action = 'and was not automatically restarted';
		}

		const msg = nls.localize(
			'erdosConsole.runtimeCrashed',
			'{0} exited unexpectedly {1}. You may have lost unsaved work.\nExit code: {2}',
			session.runtimeMetadata.runtimeName,
			action,
			exit.exit_code
		);

		this._notificationService.prompt(Severity.Warning, msg, [
			{
				label: nls.localize('openOutputLogs', 'Open Logs'),
				run: () => {
					session.showOutput();
				}
			},
		]);

		return !restartOnCrash;
	}

	private getEphemeralWorkspaceSessionsKey(): string {
		return `${PERSISTENT_WORKSPACE_SESSIONS}.${this._workspaceContextService.getWorkspace().id}`;
	}

	private getStartupBehavior(languageId: string): LanguageStartupBehavior {
		return this._configurationService.getValue(
			'interpreters.startupBehavior', { overrideIdentifier: languageId });
	}


	private async startupAfterTrust(): Promise<void> {
		if (this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			await this.startupSequence();
		} else {
			this.setStartupPhase(RuntimeStartupPhase.AwaitingTrust);
			this._register(this._workspaceTrustManagementService.onDidChangeTrust((trusted) => {
				if (!trusted) {
					return;
				}
				if (this._startupPhase === RuntimeStartupPhase.AwaitingTrust) {
					this.startupSequence();
				}
			}));
		}
	}

	private async autoStartRuntime(
		metadata: ILanguageRuntimeMetadata,
		source: string,
		activate: boolean
	) {
		this._onWillAutoStartRuntime.fire({
			runtime: metadata,
			newSession: true
		});
		this._runtimeSessionService.autoStartRuntime(metadata, source, activate);
	}
}

registerSingleton(IRuntimeStartupService, RuntimeStartupService, InstantiationType.Eager);
