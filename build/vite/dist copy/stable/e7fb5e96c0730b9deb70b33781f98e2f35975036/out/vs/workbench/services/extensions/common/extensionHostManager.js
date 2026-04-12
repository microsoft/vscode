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
var ExtensionHostManager_1;
import { IntervalTimer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import * as errors from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import * as nls from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ExtHostCustomersRegistry } from './extHostCustomers.js';
import { extensionHostKindToString } from './extensionHostKind.js';
import { RPCProtocol } from './rpcProtocol.js';
// Enable to see detailed message communication between window and extension host
const LOG_EXTENSION_HOST_COMMUNICATION = false;
const LOG_USE_COLORS = true;
let ExtensionHostManager = ExtensionHostManager_1 = class ExtensionHostManager extends Disposable {
    get pid() {
        return this._extensionHost.pid;
    }
    get kind() {
        return this._extensionHost.runningLocation.kind;
    }
    get startup() {
        return this._extensionHost.startup;
    }
    get friendyName() {
        return friendlyExtHostName(this.kind, this.pid);
    }
    constructor(extensionHost, initialActivationEvents, _internalExtensionService, _instantiationService, _environmentService, _telemetryService, _logService) {
        super();
        this._internalExtensionService = _internalExtensionService;
        this._instantiationService = _instantiationService;
        this._environmentService = _environmentService;
        this._telemetryService = _telemetryService;
        this._logService = _logService;
        this._onDidChangeResponsiveState = this._register(new Emitter());
        this.onDidChangeResponsiveState = this._onDidChangeResponsiveState.event;
        this._hasStarted = false;
        this._cachedActivationEvents = new Map();
        this._resolvedActivationEvents = new Set();
        this._rpcProtocol = null;
        this._customers = [];
        this._extensionHost = extensionHost;
        this.onDidExit = this._extensionHost.onExit;
        const startingTelemetryEvent = {
            time: Date.now(),
            action: 'starting',
            kind: extensionHostKindToString(this.kind)
        };
        this._telemetryService.publicLog2('extensionHostStartup', startingTelemetryEvent);
        this._proxy = this._extensionHost.start().then((protocol) => {
            // Track healthy extension host startup
            const successTelemetryEvent = {
                time: Date.now(),
                action: 'success',
                kind: extensionHostKindToString(this.kind)
            };
            this._telemetryService.publicLog2('extensionHostStartup', successTelemetryEvent);
            return this._createExtensionHostCustomers(this.kind, protocol);
        }, (err) => {
            this._logService.error(`Error received from starting extension host (kind: ${extensionHostKindToString(this.kind)})`);
            this._logService.error(err);
            // Track errors during extension host startup
            const failureTelemetryEvent = {
                time: Date.now(),
                action: 'error',
                kind: extensionHostKindToString(this.kind)
            };
            if (err && err.name) {
                failureTelemetryEvent.errorName = err.name;
            }
            if (err && err.message) {
                failureTelemetryEvent.errorMessage = err.message;
            }
            if (err && err.stack) {
                failureTelemetryEvent.errorStack = err.stack;
            }
            this._telemetryService.publicLog2('extensionHostStartup', failureTelemetryEvent);
            return null;
        });
        this._proxy.then(() => {
            this._hasStarted = true;
            initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent, 0 /* ActivationKind.Normal */));
            this._register(registerLatencyTestProvider({
                measure: () => this.measure()
            }));
        });
    }
    async disconnect() {
        await this._extensionHost?.disconnect?.();
    }
    dispose() {
        this._extensionHost?.dispose();
        this._rpcProtocol?.dispose();
        for (let i = 0, len = this._customers.length; i < len; i++) {
            const customer = this._customers[i];
            try {
                customer.dispose();
            }
            catch (err) {
                errors.onUnexpectedError(err);
            }
        }
        this._proxy = null;
        super.dispose();
    }
    async measure() {
        const proxy = await this._proxy;
        if (!proxy) {
            return null;
        }
        const latency = await this._measureLatency(proxy);
        const down = await this._measureDown(proxy);
        const up = await this._measureUp(proxy);
        return {
            remoteAuthority: this._extensionHost.remoteAuthority,
            latency,
            down,
            up
        };
    }
    get isReady() {
        return this._hasStarted;
    }
    async ready() {
        await this._proxy;
    }
    async _measureLatency(proxy) {
        const COUNT = 10;
        let sum = 0;
        for (let i = 0; i < COUNT; i++) {
            const sw = StopWatch.create();
            await proxy.test_latency(i);
            sw.stop();
            sum += sw.elapsed();
        }
        return (sum / COUNT);
    }
    static _convert(byteCount, elapsedMillis) {
        return (byteCount * 1000 * 8) / elapsedMillis;
    }
    async _measureUp(proxy) {
        const SIZE = 10 * 1024 * 1024; // 10MB
        const buff = VSBuffer.alloc(SIZE);
        const value = Math.ceil(Math.random() * 256);
        for (let i = 0; i < buff.byteLength; i++) {
            buff.writeUInt8(i, value);
        }
        const sw = StopWatch.create();
        await proxy.test_up(buff);
        sw.stop();
        return ExtensionHostManager_1._convert(SIZE, sw.elapsed());
    }
    async _measureDown(proxy) {
        const SIZE = 10 * 1024 * 1024; // 10MB
        const sw = StopWatch.create();
        await proxy.test_down(SIZE);
        sw.stop();
        return ExtensionHostManager_1._convert(SIZE, sw.elapsed());
    }
    _createExtensionHostCustomers(kind, protocol) {
        let logger = null;
        if (LOG_EXTENSION_HOST_COMMUNICATION || this._environmentService.logExtensionHostCommunication) {
            logger = new RPCLogger(kind);
        }
        else if (TelemetryRPCLogger.isEnabled()) {
            logger = new TelemetryRPCLogger(this._telemetryService);
        }
        this._rpcProtocol = new RPCProtocol(protocol, logger);
        this._register(this._rpcProtocol.onDidChangeResponsiveState((responsiveState) => this._onDidChangeResponsiveState.fire(responsiveState)));
        let extensionHostProxy = null;
        let mainProxyIdentifiers = [];
        const extHostContext = {
            remoteAuthority: this._extensionHost.remoteAuthority,
            extensionHostKind: this.kind,
            getProxy: (identifier) => this._rpcProtocol.getProxy(identifier),
            set: (identifier, instance) => this._rpcProtocol.set(identifier, instance),
            dispose: () => this._rpcProtocol.dispose(),
            assertRegistered: (identifiers) => this._rpcProtocol.assertRegistered(identifiers),
            drain: () => this._rpcProtocol.drain(),
            //#region internal
            internalExtensionService: this._internalExtensionService,
            _setExtensionHostProxy: (value) => {
                extensionHostProxy = value;
            },
            _setAllMainProxyIdentifiers: (value) => {
                mainProxyIdentifiers = value;
            },
            //#endregion
        };
        // Named customers
        const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
        for (let i = 0, len = namedCustomers.length; i < len; i++) {
            const [id, ctor] = namedCustomers[i];
            try {
                const instance = this._instantiationService.createInstance(ctor, extHostContext);
                this._customers.push(instance);
                this._rpcProtocol.set(id, instance);
            }
            catch (err) {
                this._logService.error(`Cannot instantiate named customer: '${id.sid}'`);
                this._logService.error(err);
                errors.onUnexpectedError(err);
            }
        }
        // Customers
        const customers = ExtHostCustomersRegistry.getCustomers();
        for (const ctor of customers) {
            try {
                const instance = this._instantiationService.createInstance(ctor, extHostContext);
                this._customers.push(instance);
            }
            catch (err) {
                this._logService.error(err);
                errors.onUnexpectedError(err);
            }
        }
        if (!extensionHostProxy) {
            throw new Error(`Missing IExtensionHostProxy!`);
        }
        // Check that no named customers are missing
        this._rpcProtocol.assertRegistered(mainProxyIdentifiers);
        return extensionHostProxy;
    }
    async activate(extension, reason) {
        const proxy = await this._proxy;
        if (!proxy) {
            return false;
        }
        return proxy.activate(extension, reason);
    }
    activateByEvent(activationEvent, activationKind) {
        if (!this._cachedActivationEvents.has(activationEvent)) {
            this._cachedActivationEvents.set(activationEvent, this._activateByEvent(activationEvent, activationKind));
        }
        return this._cachedActivationEvents.get(activationEvent);
    }
    activationEventIsDone(activationEvent) {
        return this._resolvedActivationEvents.has(activationEvent);
    }
    async _activateByEvent(activationEvent, activationKind) {
        if (!this._proxy) {
            return;
        }
        const proxy = await this._proxy;
        if (!proxy) {
            // this case is already covered above and logged.
            // i.e. the extension host could not be started
            return;
        }
        if (!this._extensionHost.extensions.containsActivationEvent(activationEvent)) {
            this._resolvedActivationEvents.add(activationEvent);
            return;
        }
        await proxy.activateByEvent(activationEvent, activationKind);
        this._resolvedActivationEvents.add(activationEvent);
    }
    async getInspectPort(tryEnableInspector) {
        if (this._extensionHost) {
            if (tryEnableInspector) {
                await this._extensionHost.enableInspectPort();
            }
            const port = this._extensionHost.getInspectPort();
            if (port) {
                return port;
            }
        }
        return undefined;
    }
    async resolveAuthority(remoteAuthority, resolveAttempt) {
        const sw = StopWatch.create(false);
        const prefix = () => `[${extensionHostKindToString(this._extensionHost.runningLocation.kind)}${this._extensionHost.runningLocation.affinity}][resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)},${resolveAttempt})][${sw.elapsed()}ms] `;
        const logInfo = (msg) => this._logService.info(`${prefix()}${msg}`);
        const logError = (msg, err = undefined) => this._logService.error(`${prefix()}${msg}`, err);
        logInfo(`obtaining proxy...`);
        const proxy = await this._proxy;
        if (!proxy) {
            logError(`no proxy`);
            return {
                type: 'error',
                error: {
                    message: `Cannot resolve authority`,
                    code: RemoteAuthorityResolverErrorCode.Unknown,
                    detail: undefined
                }
            };
        }
        logInfo(`invoking...`);
        const intervalLogger = new IntervalTimer();
        try {
            intervalLogger.cancelAndSet(() => logInfo('waiting...'), 1000);
            const resolverResult = await proxy.resolveAuthority(remoteAuthority, resolveAttempt);
            intervalLogger.dispose();
            if (resolverResult.type === 'ok') {
                logInfo(`returned ${resolverResult.value.authority.connectTo}`);
            }
            else {
                logError(`returned an error`, resolverResult.error);
            }
            return resolverResult;
        }
        catch (err) {
            intervalLogger.dispose();
            logError(`returned an error`, err);
            return {
                type: 'error',
                error: {
                    message: err.message,
                    code: RemoteAuthorityResolverErrorCode.Unknown,
                    detail: err
                }
            };
        }
    }
    async getCanonicalURI(remoteAuthority, uri) {
        const proxy = await this._proxy;
        if (!proxy) {
            throw new Error(`Cannot resolve canonical URI`);
        }
        return proxy.getCanonicalURI(remoteAuthority, uri);
    }
    async start(extensionRegistryVersionId, allExtensions, myExtensions) {
        const proxy = await this._proxy;
        if (!proxy) {
            return;
        }
        const deltaExtensions = this._extensionHost.extensions.set(extensionRegistryVersionId, allExtensions, myExtensions);
        return proxy.startExtensionHost(deltaExtensions);
    }
    async extensionTestsExecute() {
        const proxy = await this._proxy;
        if (!proxy) {
            throw new Error('Could not obtain Extension Host Proxy');
        }
        return proxy.extensionTestsExecute();
    }
    representsRunningLocation(runningLocation) {
        return this._extensionHost.runningLocation.equals(runningLocation);
    }
    async deltaExtensions(incomingExtensionsDelta) {
        const proxy = await this._proxy;
        if (!proxy) {
            return;
        }
        const outgoingExtensionsDelta = this._extensionHost.extensions.delta(incomingExtensionsDelta);
        if (!outgoingExtensionsDelta) {
            // The extension host already has this version of the extensions.
            return;
        }
        return proxy.deltaExtensions(outgoingExtensionsDelta);
    }
    containsExtension(extensionId) {
        return this._extensionHost.extensions?.containsExtension(extensionId) ?? false;
    }
    async setRemoteEnvironment(env) {
        const proxy = await this._proxy;
        if (!proxy) {
            return;
        }
        return proxy.setRemoteEnvironment(env);
    }
};
ExtensionHostManager = ExtensionHostManager_1 = __decorate([
    __param(3, IInstantiationService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, ITelemetryService),
    __param(6, ILogService)
], ExtensionHostManager);
export { ExtensionHostManager };
export function friendlyExtHostName(kind, pid) {
    if (pid) {
        return `${extensionHostKindToString(kind)} pid: ${pid}`;
    }
    return `${extensionHostKindToString(kind)}`;
}
const colorTables = [
    ['#2977B1', '#FC802D', '#34A13A', '#D3282F', '#9366BA'],
    ['#8B564C', '#E177C0', '#7F7F7F', '#BBBE3D', '#2EBECD']
];
function prettyWithoutArrays(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object' && typeof data.toString === 'function') {
        const result = data.toString();
        if (result !== '[object Object]') {
            return result;
        }
    }
    return data;
}
function pretty(data) {
    if (Array.isArray(data)) {
        return data.map(prettyWithoutArrays);
    }
    return prettyWithoutArrays(data);
}
class RPCLogger {
    constructor(_kind) {
        this._kind = _kind;
        this._totalIncoming = 0;
        this._totalOutgoing = 0;
    }
    _log(direction, totalLength, msgLength, req, initiator, str, data) {
        data = pretty(data);
        const colorTable = colorTables[initiator];
        const color = LOG_USE_COLORS ? colorTable[req % colorTable.length] : '#000000';
        let args = [`%c[${extensionHostKindToString(this._kind)}][${direction}]%c[${String(totalLength).padStart(7)}]%c[len: ${String(msgLength).padStart(5)}]%c${String(req).padStart(5)} - ${str}`, 'color: darkgreen', 'color: grey', 'color: grey', `color: ${color}`];
        if (/\($/.test(str)) {
            args = args.concat(data);
            args.push(')');
        }
        else {
            args.push(data);
        }
        console.log.apply(console, args);
    }
    logIncoming(msgLength, req, initiator, str, data) {
        this._totalIncoming += msgLength;
        this._log('Ext \u2192 Win', this._totalIncoming, msgLength, req, initiator, str, data);
    }
    logOutgoing(msgLength, req, initiator, str, data) {
        this._totalOutgoing += msgLength;
        this._log('Win \u2192 Ext', this._totalOutgoing, msgLength, req, initiator, str, data);
    }
}
let TelemetryRPCLogger = class TelemetryRPCLogger {
    static isEnabled() {
        return Math.random() < 0.0001; // 0.01% of users
    }
    constructor(_telemetryService) {
        this._telemetryService = _telemetryService;
        this._pendingRequests = new Map();
    }
    logIncoming(msgLength, req, initiator, str) {
        if (initiator === 0 /* RequestInitiator.LocalSide */ && /^receiveReply(Err)?:/.test(str)) {
            // log the size of reply messages
            const requestStr = this._pendingRequests.get(req) ?? 'unknown_reply';
            this._pendingRequests.delete(req);
            this._telemetryService.publicLog2('extensionhost.incoming', {
                type: `${str} ${requestStr}`,
                length: msgLength
            });
        }
        if (initiator === 1 /* RequestInitiator.OtherSide */ && /^receiveRequest /.test(str)) {
            // incoming request
            this._telemetryService.publicLog2('extensionhost.incoming', {
                type: `${str}`,
                length: msgLength
            });
        }
    }
    logOutgoing(msgLength, req, initiator, str) {
        if (initiator === 0 /* RequestInitiator.LocalSide */ && str.startsWith('request: ')) {
            this._pendingRequests.set(req, str);
            this._telemetryService.publicLog2('extensionhost.outgoing', {
                type: str,
                length: msgLength
            });
        }
    }
};
TelemetryRPCLogger = __decorate([
    __param(0, ITelemetryService)
], TelemetryRPCLogger);
const providers = [];
function registerLatencyTestProvider(provider) {
    providers.push(provider);
    return {
        dispose: () => {
            for (let i = 0; i < providers.length; i++) {
                if (providers[i] === provider) {
                    providers.splice(i, 1);
                    return;
                }
            }
        }
    };
}
function getLatencyTestProviders() {
    return providers.slice(0);
}
registerAction2(class MeasureExtHostLatencyAction extends Action2 {
    constructor() {
        super({
            id: 'editor.action.measureExtHostLatency',
            title: nls.localize2('measureExtHostLatency', "Measure Extension Host Latency"),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const measurements = await Promise.all(getLatencyTestProviders().map(provider => provider.measure()));
        editorService.openEditor({ resource: undefined, contents: measurements.map(MeasureExtHostLatencyAction._print).join('\n\n'), options: { pinned: true } });
    }
    static _print(m) {
        if (!m) {
            return '';
        }
        return `${m.remoteAuthority ? `Authority: ${m.remoteAuthority}\n` : ``}Roundtrip latency: ${m.latency.toFixed(3)}ms\nUp: ${MeasureExtHostLatencyAction._printSpeed(m.up)}\nDown: ${MeasureExtHostLatencyAction._printSpeed(m.down)}\n`;
    }
    static _printSpeed(n) {
        if (n <= 1024) {
            return `${n} bps`;
        }
        if (n < 1024 * 1024) {
            return `${(n / 1024).toFixed(1)} kbps`;
        }
        return `${(n / 1024 / 1024).toFixed(1)} Mbps`;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdE1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxLQUFLLE1BQU0sTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdqRSxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDM0ksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9B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