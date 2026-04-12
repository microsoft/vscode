/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isNumber, isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
export class BaseTerminalBackend extends Disposable {
    get isResponsive() { return !this._isPtyHostUnresponsive; }
    constructor(_ptyHostController, _logService, historyService, configurationResolverService, statusBarService, _workspaceContextService) {
        super();
        this._ptyHostController = _ptyHostController;
        this._logService = _logService;
        this._workspaceContextService = _workspaceContextService;
        this._isPtyHostUnresponsive = false;
        this._onPtyHostConnected = this._register(new Emitter());
        this.onPtyHostConnected = this._onPtyHostConnected.event;
        this._onPtyHostRestart = this._register(new Emitter());
        this.onPtyHostRestart = this._onPtyHostRestart.event;
        this._onPtyHostUnresponsive = this._register(new Emitter());
        this.onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
        this._onPtyHostResponsive = this._register(new Emitter());
        this.onPtyHostResponsive = this._onPtyHostResponsive.event;
        let unresponsiveStatusBarEntry;
        let statusBarAccessor;
        let hasStarted = false;
        // Attach pty host listeners
        this._register(this._ptyHostController.onPtyHostExit(() => {
            this._logService.error(`The terminal's pty host process exited, the connection to all terminal processes was lost`);
        }));
        this._register(this.onPtyHostConnected(() => hasStarted = true));
        this._register(this._ptyHostController.onPtyHostStart(() => {
            this._logService.debug(`The terminal's pty host process is starting`);
            // Only fire the _restart_ event after it has started
            if (hasStarted) {
                this._logService.trace('IPtyHostController#onPtyHostRestart');
                this._onPtyHostRestart.fire();
            }
            statusBarAccessor?.dispose();
            this._isPtyHostUnresponsive = false;
        }));
        this._register(this._ptyHostController.onPtyHostUnresponsive(() => {
            statusBarAccessor?.dispose();
            if (!unresponsiveStatusBarEntry) {
                unresponsiveStatusBarEntry = {
                    name: localize('ptyHostStatus', 'Pty Host Status'),
                    text: `$(debug-disconnect) ${localize('ptyHostStatus.short', 'Pty Host')}`,
                    tooltip: localize('nonResponsivePtyHost', "The connection to the terminal's pty host process is unresponsive, terminals may stop working. Click to manually restart the pty host."),
                    ariaLabel: localize('ptyHostStatus.ariaLabel', 'Pty Host is unresponsive'),
                    command: "workbench.action.terminal.restartPtyHost" /* TerminalContribCommandId.DeveloperRestartPtyHost */,
                    kind: 'warning'
                };
            }
            statusBarAccessor = statusBarService.addEntry(unresponsiveStatusBarEntry, 'ptyHostStatus', 0 /* StatusbarAlignment.LEFT */);
            this._isPtyHostUnresponsive = true;
            this._onPtyHostUnresponsive.fire();
        }));
        this._register(this._ptyHostController.onPtyHostResponsive(() => {
            if (!this._isPtyHostUnresponsive) {
                return;
            }
            this._logService.info('The pty host became responsive again');
            statusBarAccessor?.dispose();
            this._isPtyHostUnresponsive = false;
            this._onPtyHostResponsive.fire();
        }));
        this._register(this._ptyHostController.onPtyHostRequestResolveVariables(async (e) => {
            // Only answer requests for this workspace
            if (e.workspaceId !== this._workspaceContextService.getWorkspace().id) {
                return;
            }
            const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
            const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
            const resolveCalls = e.originalText.map(t => {
                return configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, t);
            });
            const result = await Promise.all(resolveCalls);
            this._ptyHostController.acceptPtyHostResolvedVariables(e.requestId, result);
        }));
    }
    restartPtyHost() {
        this._ptyHostController.restartPtyHost();
    }
    _deserializeTerminalState(serializedState) {
        if (serializedState === undefined) {
            return undefined;
        }
        const crossVersionState = JSON.parse(serializedState);
        if (!isCrossVersionSerializedTerminalState(crossVersionState)) {
            this._logService.warn('Could not revive serialized processes, wrong format', crossVersionState);
            return undefined;
        }
        if (crossVersionState.version !== 1) {
            this._logService.warn(`Could not revive serialized processes, wrong version "${crossVersionState.version}"`, crossVersionState);
            return undefined;
        }
        return crossVersionState.state;
    }
    _getWorkspaceId() {
        return this._workspaceContextService.getWorkspace().id;
    }
}
function isCrossVersionSerializedTerminalState(obj) {
    return (isObject(obj) &&
        'version' in obj && isNumber(obj.version) &&
        'state' in obj && Array.isArray(obj.state));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZVRlcm1pbmFsQmFja2VuZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYmFzZVRlcm1pbmFsQmFja2VuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQVE5QyxNQUFNLE9BQWdCLG1CQUFvQixTQUFRLFVBQVU7SUFHM0QsSUFBSSxZQUFZLEtBQWMsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7SUFXcEUsWUFDa0Isa0JBQXNDLEVBQ3BDLFdBQWdDLEVBQ25ELGNBQStCLEVBQy9CLDRCQUEyRCxFQUMzRCxnQkFBbUMsRUFDaEIsd0JBQWtEO1FBRXJFLEtBQUssRUFBRSxDQUFDO1FBUFMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUNwQyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFJaEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQW5COUQsMkJBQXNCLEdBQVksS0FBSyxDQUFDO1FBSTdCLHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ3BFLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFDMUMsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNB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