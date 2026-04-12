/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getWorkbenchContribution, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { CopilotCLISessionType } from '../../sessions/browser/sessionTypes.js';
const SessionsTerminalViewVisibleContext = new RawContextKey('sessionsTerminalViewVisible', false);
/**
 * Returns the cwd URI for the given session: worktree or repository path for
 * background sessions only. Returns `undefined` for non-background sessions
 * (Cloud, Local, etc.) which have no local worktree, or when no path is available.
 */
function getSessionCwd(session) {
    if (session?.sessionType !== CopilotCLISessionType.id) {
        return undefined;
    }
    const repo = session.workspace.get()?.repositories[0];
    const cwd = repo?.workingDirectory ?? repo?.uri;
    if (cwd?.scheme === AGENT_HOST_SCHEME) {
        return undefined;
    }
    return cwd;
}
/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals are shown/hidden based on their initial cwd matching the active path.
 * - All terminals for a worktree are closed when the session is archived.
 */
let SessionsTerminalContribution = class SessionsTerminalContribution extends Disposable {
    static { this.ID = 'workbench.contrib.sessionsTerminal'; }
    constructor(_sessionsManagementService, _terminalService, _logService, _pathService, viewsService, contextKeyService) {
        super();
        this._sessionsManagementService = _sessionsManagementService;
        this._terminalService = _terminalService;
        this._logService = _logService;
        this._pathService = _pathService;
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
     */
    async ensureTerminal(cwd, focus) {
        const key = cwd.fsPath.toLowerCase();
        let existing = await this._findTerminalsForKey(key);
        if (existing.length === 0) {
            try {
                const createdInstance = this._getAvailableTerminal(await this._terminalService.createTerminal({ config: { cwd } }), `activate created terminal for ${cwd.fsPath}`);
                if (!createdInstance) {
                    return [];
                }
                existing = [createdInstance];
                this._terminalService.setActiveInstance(createdInstance);
                this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
            }
            catch (e) {
                this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
                return [];
            }
        }
        if (focus) {
            await this._terminalService.focusActiveInstance();
        }
        return existing;
    }
    async _onActiveSessionChanged(session) {
        if (!session) {
            return;
        }
        const sessionCwd = getSessionCwd(session);
        const targetPath = sessionCwd ?? await this._pathService.userHome();
        const targetKey = targetPath.fsPath.toLowerCase();
        if (this._activeKey === targetKey) {
            return;
        }
        this._activeKey = targetKey;
        const instances = await this.ensureTerminal(targetPath, false);
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
    async _findTerminalsForKey(key) {
        const result = [];
        for (const instance of this._terminalService.instances) {
            try {
                const cwd = await instance.getInitialCwd();
                if (cwd.toLowerCase() === key) {
                    result.push(instance);
                }
            }
            catch {
                // ignore terminals whose cwd cannot be resolved
            }
        }
        return result;
    }
    _getAvailableTerminal(instance, action) {
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
    async _updateTerminalVisibility(activeKey, forceForegroundTerminalIds) {
        const toShow = [];
        const toHide = [];
        for (const instance of [...this._terminalService.instances]) {
            let cwd;
            try {
                cwd = (await instance.getInitialCwd()).toLowerCase();
            }
            catch {
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
            }
            else if (!belongsToActiveSession && !isForceVisible && isForeground) {
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
        let mostRecent;
        let mostRecentTimestamp = -1;
        for (const instance of foreground) {
            const cmdDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
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
    async _closeTerminalsForPath(fsPath) {
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
            }
            catch {
                // ignore
            }
        }
    }
    async dumpTracking() {
        console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
        console.log('[SessionsTerminal] === All Terminals ===');
        for (const instance of this._terminalService.instances) {
            let cwd = '<unknown>';
            try {
                cwd = await instance.getInitialCwd();
            }
            catch { /* ignored */ }
            const isForeground = this._terminalService.foregroundInstances.includes(instance);
            console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? 'foreground' : 'background'}`);
        }
    }
    async showAllTerminals() {
        for (const instance of this._terminalService.instances) {
            if (!this._terminalService.foregroundInstances.includes(instance)) {
                await this._terminalService.showBackgroundTerminal(instance, true);
                this._logService.trace(`[SessionsTerminal] Moved terminal ${instance.instanceId} to foreground`);
            }
        }
    }
};
SessionsTerminalContribution = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, ITerminalService),
    __param(2, ILogService),
    __param(3, IPathService),
    __param(4, IViewsService),
    __param(5, IContextKeyService)
], SessionsTerminalContribution);
export { SessionsTerminalContribution };
registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, 3 /* WorkbenchPhase.AfterRestored */);
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
                    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
                }]
        });
    }
    async run(_accessor) {
        const telemetryService = _accessor.get(ITelemetryService);
        logSessionsInteraction(telemetryService, 'openTerminal');
        const layoutService = _accessor.get(IWorkbenchLayoutService);
        const viewsService = _accessor.get(IViewsService);
        // Toggle: if panel is visible and the terminal view is active, hide it.
        // If the panel is visible but showing another view, open the terminal instead.
        if (layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            if (viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
                layoutService.setPartHidden(true, "workbench.parts.panel" /* Parts.PANEL_PART */);
                return;
            }
        }
        const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
        const sessionsManagementService = _accessor.get(ISessionsManagementService);
        const pathService = _accessor.get(IPathService);
        const activeSession = sessionsManagementService.activeSession.get();
        const cwd = getSessionCwd(activeSession) ?? await pathService.userHome();
        await contribution.ensureTerminal(cwd, true);
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
    async run() {
        const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
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
    async run() {
        const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
        await contribution.showAllTerminals();
    }
}
registerAction2(ShowAllTerminalsAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9zZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUEwQix3QkFBd0IsRUFBRSw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqSyxPQUFPLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFakgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN2RixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFz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