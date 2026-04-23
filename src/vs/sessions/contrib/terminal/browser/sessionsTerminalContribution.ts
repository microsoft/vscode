/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionsWelcomeVisibleContext, IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CopilotCLISessionType, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ITerminalProfileService, TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';

const SessionsTerminalViewVisibleContext = new RawContextKey<boolean>('sessionsTerminalViewVisible', false);

interface ISessionTerminalInfo {
	/** The cwd to use for terminal matching/creation. For agent host sessions this is the unwrapped file URI. */
	readonly cwd: URI;
	/** When set, the terminal should be created on the agent host rather than locally. */
	readonly agentHostCwd?: URI;
}

/**
 * Returns terminal info for the given session: worktree or repository path for
 * background sessions only. Returns `undefined` for non-background sessions
 * (Cloud, Local, etc.) which have no local worktree, or when no path is available.
 */
function getSessionTerminalInfo(session: ISession | undefined): ISessionTerminalInfo | undefined {
	if (session?.sessionType !== CopilotCLISessionType.id) {
		return undefined;
	}
	const repo = session.workspace.get()?.repositories[0];
	const cwd = repo?.workingDirectory ?? repo?.uri;
	if (!cwd) {
		return undefined;
	}
	if (cwd.scheme === AGENT_HOST_SCHEME) {
		return { cwd: fromAgentHostUri(cwd), agentHostCwd: cwd };
	}
	return { cwd };
}

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals are shown/hidden based on their initial cwd matching the active path.
 * - All terminals for a worktree are closed when the session is archived.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private _activeKey: string | undefined;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ILogService private readonly _logService: ILogService,
		@IPathService private readonly _pathService: IPathService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IViewsService viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const profileOverride = derived(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
				return; // no need to override local default profiles with the local AH
			}

			const address = this._getSessionAgentHostAddress(session);
			if (!address) {
				return;
			}

			const profiles = this._agentHostTerminalService.profiles.read(reader);
			return profiles.find(p => p.address === address) ?? this._agentHostTerminalService.getProfileForConnection(address);
		});

		this._register(autorun(reader => {
			const profile = profileOverride.read(reader);
			if (profile) {
				reader.store.add(this._terminalProfileService.overrideDefaultProfile(
					profile.extensionIdentifier, profile.profileId,
				));
			}
		}));

		// Keep the default cwd in sync with the active session's working directory
		// so that "New Terminal" uses it automatically.
		// This is a little hacky but I don't see any better approach.
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			const info = getSessionTerminalInfo(session);
			this._agentHostTerminalService.setDefaultCwd(info?.cwd);
		}));

		// Track whether the terminal view is visible so the titlebar toggle
		// button shows the correct checked state.
		const terminalViewVisible = SessionsTerminalViewVisibleContext.bindTo(contextKeyService);
		terminalViewVisible.set(viewsService.isViewVisible(TERMINAL_VIEW_ID));
		this._register(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === TERMINAL_VIEW_ID) {
				terminalViewVisible.set(e.visible);
			}
		}));

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			this._onActiveSessionChanged(session);
		}));

		// Hide restored terminals from a previous window session that don't
		// belong to the current active session. These arrive asynchronously
		// during reconnection and would otherwise flash in the foreground.
		this._register(this._terminalService.onDidCreateInstance(instance => {
			if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
				instance.getInitialCwd().then(cwd => {
					if (cwd.toLowerCase() !== this._activeKey) {
						const availableInstance = this._getAvailableTerminal(instance, `hide restored terminal for ${cwd}`);
						if (!availableInstance) {
							return;
						}
						this._terminalService.moveToBackground(availableInstance);
						this._logService.trace(`[SessionsTerminal] Hid restored terminal ${availableInstance.instanceId} (cwd: ${cwd})`);
					}
				});
			}
		}));

		// When a session is archived or removed, close all terminals for its worktree
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			for (const session of [...e.removed, ...e.changed.filter(s => s.isArchived.get())]) {
				const worktreeUri = session.workspace.get()?.repositories[0]?.workingDirectory;
				if (worktreeUri) {
					this._closeTerminalsForPath(worktreeUri.fsPath);
				}
			}
		}));
	}

	/**
	 * Ensures a terminal exists for the given cwd by scanning all terminal
	 * instances for a matching initial cwd. If none is found, creates a new
	 * one. Sets it as active and optionally focuses it.
	 *
	 * When {@link session} is provided and the session is backed by an agent
	 * host, the terminal is created on the agent host instead of locally.
	 */
	async ensureTerminal(cwd: URI, focus: boolean, session?: ISession): Promise<ITerminalInstance[]> {
		const key = cwd.fsPath.toLowerCase();
		let existing = await this._findTerminalsForKey(key);

		if (existing.length === 0) {
			try {
				const instance = await this._createTerminalForSession(cwd, session);
				const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
				if (!createdInstance) {
					return [];
				}
				existing = [createdInstance];
				this._terminalService.setActiveInstance(createdInstance);
				this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
			} catch (e) {
				this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
				return [];
			}
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}

		return existing;
	}

	/**
	 * Creates a terminal for the given cwd. If the session is backed by an
	 * agent host, creates an agent host terminal; otherwise creates a local one.
	 */
	private async _createTerminalForSession(cwd: URI, session: ISession | undefined): Promise<ITerminalInstance> {
		const address = session && this._getSessionAgentHostAddress(session);
		if (address) {
			const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd });
			if (instance) {
				return instance;
			}
		}
		return this._terminalService.createTerminal({ config: { cwd } });
	}

	/**
	 * Returns the agent host address for the given session's provider,
	 * or `undefined` if the session is not backed by an agent host.
	 */
	private _getSessionAgentHostAddress(session: ISession | undefined): string | undefined {
		if (!session) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.remoteAddress ?? '__local__';
	}

	private async _onActiveSessionChanged(session: ISession | undefined): Promise<void> {
		if (!session) {
			return;
		}

		const info = getSessionTerminalInfo(session);
		const targetPath = info?.cwd ?? await this._pathService.userHome();
		const targetKey = targetPath.fsPath.toLowerCase();
		if (this._activeKey === targetKey) {
			return;
		}
		this._activeKey = targetKey;

		const instances = await this.ensureTerminal(targetPath, false, info?.agentHostCwd ? session : undefined);

		// If the active key changed while we were awaiting, a newer call has
		// taken over — skip the visibility update to avoid flicker.
		if (this._activeKey !== targetKey) {
			return;
		}
		await this._updateTerminalVisibility(targetKey, instances.map(instance => instance.instanceId));
	}

	/**
	 * Finds the first terminal instance whose initial cwd (lower-cased) matches
	 * the given key.
	 */
	private async _findTerminalsForKey(key: string): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of this._terminalService.instances) {
			try {
				const cwd = await instance.getInitialCwd();
				if (cwd.toLowerCase() === key) {
					result.push(instance);
				}
			} catch {
				// ignore terminals whose cwd cannot be resolved
			}
		}
		return result;
	}

	private _getAvailableTerminal(instance: ITerminalInstance, action: string): ITerminalInstance | undefined {
		const currentInstance = this._terminalService.getInstanceFromId(instance.instanceId);
		if (!currentInstance || currentInstance.isDisposed) {
			this._logService.trace(`[SessionsTerminal] Cannot ${action}; terminal ${instance.instanceId} is no longer available`);
			return undefined;
		}
		return currentInstance;
	}

	/**
	 * Shows background terminals whose initial cwd matches the active key and
	 * hides foreground terminals whose initial cwd does not match.
	 */
	private async _updateTerminalVisibility(activeKey: string, forceForegroundTerminalIds: number[]): Promise<void> {
		const toShow: ITerminalInstance[] = [];
		const toHide: ITerminalInstance[] = [];

		for (const instance of [...this._terminalService.instances]) {
			let cwd: string | undefined;
			try {
				cwd = (await instance.getInitialCwd()).toLowerCase();
			} catch {
				continue;
			}
			const currentInstance = this._getAvailableTerminal(instance, `update visibility for ${cwd}`);
			if (!currentInstance) {
				continue;
			}

			const isForeground = this._terminalService.foregroundInstances.includes(currentInstance);
			const isForceVisible = forceForegroundTerminalIds.includes(currentInstance.instanceId);
			const belongsToActiveSession = cwd === activeKey;
			if ((belongsToActiveSession || isForceVisible) && !isForeground) {
				toShow.push(currentInstance);
			} else if (!belongsToActiveSession && !isForceVisible && isForeground) {
				toHide.push(currentInstance);
			}
		}

		for (const instance of toShow) {
			const availableInstance = this._getAvailableTerminal(instance, 'show background terminal');
			if (availableInstance) {
				await this._terminalService.showBackgroundTerminal(availableInstance, true);
			}
		}
		for (const instance of toHide) {
			const availableInstance = this._getAvailableTerminal(instance, 'move terminal to background');
			if (availableInstance) {
				this._terminalService.moveToBackground(availableInstance);
			}
		}

		// Set the terminal with the most recent command as active
		const foreground = this._terminalService.foregroundInstances;
		let mostRecent: ITerminalInstance | undefined;
		let mostRecentTimestamp = -1;
		for (const instance of foreground) {
			const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			const lastCmd = cmdDetection?.commands.at(-1);
			if (lastCmd && lastCmd.timestamp > mostRecentTimestamp) {
				mostRecentTimestamp = lastCmd.timestamp;
				mostRecent = instance;
			}
		}
		if (mostRecent) {
			this._terminalService.setActiveInstance(mostRecent);
		}
	}

	private async _closeTerminalsForPath(fsPath: string): Promise<void> {
		const key = fsPath.toLowerCase();
		for (const instance of [...this._terminalService.instances]) {
			try {
				const cwd = (await instance.getInitialCwd()).toLowerCase();
				if (cwd === key) {
					const availableInstance = this._getAvailableTerminal(instance, `close archived terminal for ${fsPath}`);
					if (!availableInstance) {
						continue;
					}
					this._terminalService.safeDisposeTerminal(availableInstance);
					this._logService.trace(`[SessionsTerminal] Closed archived terminal ${availableInstance.instanceId}`);
				}
			} catch {
				// ignore
			}
		}
	}

	async dumpTracking(): Promise<void> {
		console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
		console.log('[SessionsTerminal] === All Terminals ===');
		for (const instance of this._terminalService.instances) {
			let cwd = '<unknown>';
			try { cwd = await instance.getInitialCwd(); } catch { /* ignored */ }
			const isForeground = this._terminalService.foregroundInstances.includes(instance);
			console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? 'foreground' : 'background'}`);
		}
	}

	async showAllTerminals(): Promise<void> {
		for (const instance of this._terminalService.instances) {
			if (!this._terminalService.foregroundInstances.includes(instance)) {
				await this._terminalService.showBackgroundTerminal(instance, true);
				this._logService.trace(`[SessionsTerminal] Moved terminal ${instance.instanceId} to foreground`);
			}
		}
	}
}

registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);

class OpenSessionInTerminalAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.openInTerminal',
			title: localize2('openInTerminal', "Open Terminal"),
			icon: Codicon.terminal,
			toggled: {
				condition: SessionsTerminalViewVisibleContext,
				title: localize('hideTerminal', "Hide Terminal"),
			},
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(_accessor: ServicesAccessor): Promise<void> {
		const telemetryService = _accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openTerminal');

		const layoutService = _accessor.get(IWorkbenchLayoutService);
		const viewsService = _accessor.get(IViewsService);

		// Toggle: if panel is visible and the terminal view is active, hide it.
		// If the panel is visible but showing another view, open the terminal instead.
		if (layoutService.isVisible(Parts.PANEL_PART)) {
			if (viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
				layoutService.setPartHidden(true, Parts.PANEL_PART);
				return;
			}
		}

		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		const sessionsManagementService = _accessor.get(ISessionsManagementService);
		const pathService = _accessor.get(IPathService);

		const activeSession = sessionsManagementService.activeSession.get();
		const info = getSessionTerminalInfo(activeSession);
		const cwd = info?.cwd ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true, info?.agentHostCwd ? activeSession : undefined);
		viewsService.openView(TERMINAL_VIEW_ID);
	}
}

registerAction2(OpenSessionInTerminalAction);

class DumpTerminalTrackingAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.dumpTerminalTracking',
			title: localize2('dumpTerminalTracking', "Dump Terminal Tracking"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.dumpTracking();
	}
}

registerAction2(DumpTerminalTrackingAction);

class ShowAllTerminalsAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.showAllTerminals',
			title: localize2('showAllTerminals', "Show All Terminals"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.showAllTerminals();
	}
}

registerAction2(ShowAllTerminalsAction);
