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
import { Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { ITerminalService } from '../../contrib/terminal/browser/terminal.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { TerminalShellExecutionCommandLineConfidence } from '../common/extHostTypes.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
let MainThreadTerminalShellIntegration = class MainThreadTerminalShellIntegration extends Disposable {
    constructor(extHostContext, _terminalService, workbenchEnvironmentService, _extensionService) {
        super();
        this._terminalService = _terminalService;
        this._extensionService = _extensionService;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);
        const instanceDataListeners = new Map();
        this._register(toDisposable(() => {
            for (const listener of instanceDataListeners.values()) {
                listener.dispose();
            }
        }));
        // onDidChangeTerminalShellIntegration initial state
        for (const terminal of this._terminalService.instances) {
            const cmdDetection = terminal.capabilities.get(2 /* TerminalCapability.CommandDetection */);
            if (cmdDetection) {
                this._enableShellIntegration(terminal);
            }
        }
        // onDidChangeTerminalShellIntegration via command detection
        const onDidAddCommandDetection = this._store.add(this._terminalService.createOnInstanceEvent(instance => {
            return Event.map(instance.capabilities.onDidAddCommandDetectionCapability, () => instance);
        })).event;
        this._store.add(onDidAddCommandDetection(e => this._enableShellIntegration(e)));
        // onDidChangeTerminalShellIntegration via cwd
        const cwdChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(0 /* TerminalCapability.CwdDetection */, e => e.onDidChangeCwd));
        this._store.add(cwdChangeEvent.event(e => {
            this._proxy.$cwdChange(e.instance.instanceId, e.data);
        }));
        // onDidChangeTerminalShellIntegration via env
        const envChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(5 /* TerminalCapability.ShellEnvDetection */, e => e.onDidChangeEnv));
        this._store.add(envChangeEvent.event(e => {
            if (e.data.value && typeof e.data.value === 'object') {
                const envValue = e.data.value;
                // Extract keys and values
                const keysArr = Object.keys(envValue);
                const valuesArr = Object.values(envValue);
                this._proxy.$shellEnvChange(e.instance.instanceId, keysArr, valuesArr, e.data.isTrusted);
            }
        }));
        // onDidStartTerminalShellExecution
        const commandDetectionStartEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(2 /* TerminalCapability.CommandDetection */, e => e.onCommandExecuted));
        let currentCommand;
        this._store.add(commandDetectionStartEvent.event(e => {
            // Prevent duplicate events from being sent in case command detection double fires the
            // event
            if (e.data === currentCommand) {
                return;
            }
            // String paths are not exposed in the extension API
            currentCommand = e.data;
            const instanceId = e.instance.instanceId;
            this._proxy.$shellExecutionStart(instanceId, instanceSupportsExecuteCommandApi(e.instance), e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, e.data.cwd);
            // TerminalShellExecution.createDataStream
            // Debounce events to reduce the message count - when this listener is disposed the events will be flushed
            instanceDataListeners.get(instanceId)?.dispose();
            instanceDataListeners.set(instanceId, Event.accumulate(e.instance.onData, 50, true, this._store)(events => {
                this._proxy.$shellExecutionData(instanceId, events.join(''));
            }));
        }));
        // onDidEndTerminalShellExecution
        const commandDetectionEndEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(2 /* TerminalCapability.CommandDetection */, e => e.onCommandFinished));
        this._store.add(commandDetectionEndEvent.event(e => {
            currentCommand = undefined;
            const instanceId = e.instance.instanceId;
            instanceDataListeners.get(instanceId)?.dispose();
            // Shell integration C (executed) and D (command finished) sequences should always be in
            // their own events, so send this immediately. This means that the D sequence will not
            // be included as it's currently being parsed when the command finished event fires.
            this._proxy.$shellExecutionEnd(instanceId, e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, e.data.exitCode);
        }));
        // Clean up after dispose
        this._store.add(this._terminalService.onDidDisposeInstance(e => this._proxy.$closeTerminal(e.instanceId)));
    }
    $executeCommand(terminalId, commandLine) {
        this._terminalService.getInstanceFromId(terminalId)?.runCommand(commandLine, true);
    }
    _enableShellIntegration(instance) {
        this._extensionService.activateByEvent('onTerminalShellIntegration:*');
        if (instance.shellType) {
            this._extensionService.activateByEvent(`onTerminalShellIntegration:${instance.shellType}`);
        }
        this._proxy.$shellIntegrationChange(instance.instanceId, instanceSupportsExecuteCommandApi(instance));
        const cwdDetection = instance.capabilities.get(0 /* TerminalCapability.CwdDetection */);
        if (cwdDetection) {
            this._proxy.$cwdChange(instance.instanceId, cwdDetection.getCwd());
        }
    }
};
MainThreadTerminalShellIntegration = __decorate([
    extHostNamedCustomer(MainContext.MainThreadTerminalShellIntegration),
    __param(1, ITerminalService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IExtensionService)
], MainThreadTerminalShellIntegration);
export { MainThreadTerminalShellIntegration };
function convertToExtHostCommandLineConfidence(command) {
    switch (command.commandLineConfidence) {
        case 'high':
            return TerminalShellExecutionCommandLineConfidence.High;
        case 'medium':
            return TerminalShellExecutionCommandLineConfidence.Medium;
        case 'low':
        default:
            return TerminalShellExecutionCommandLineConfidence.Low;
    }
}
function instanceSupportsExecuteCommandApi(instance) {
    return instance.shellLaunchConfig.type !== 'Task';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVGVybWluYWxTaGVsbEludGVncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBb0IsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRixPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBMkYsTUFBTSwrQkFBK0IsQ0FBQztBQUNySyxPQUFPLEVBQUUsZ0JBQWdCLEVBQTBCLE1BQU0sNENBQTRDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdkcsT0FBTyxFQUFFLG9CQUFvQixFQUF3QixNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSwyQ0FBMkMsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRzVFLElBQU0sa0NBQWtDLEdBQXhDLE1BQU0sa0NBQW1DLFNBQVEsVUFBVTtJQUdqRSxZQUNDLGNBQStCLEVBQ0ksZ0JBQWtDLEVBQ3ZDLDJCQUF5RCxFQUNuRCxpQkFBb0M7UUFFeEUsS0FBSyxFQUFFLENBQUM7UUFKMkIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFrQjtRQUVqQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBSXhFLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUV0RixNQUFNLHFCQUFxQixHQUE2QixJ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