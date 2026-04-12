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
import * as dom from '../../../../base/browser/dom.js';
import { parentOriginHash } from '../../../../base/browser/iframe.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Barrier } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { canceled, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { COI, FileAccess } from '../../../../base/common/network.js';
import * as platform from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getNLSLanguage, getNLSMessages } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService, ILoggerService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLoggingOnly } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IDefaultLogLevelsService } from '../../log/common/defaultLogLevels.js';
import { UIKind, createMessageOfType, isMessageOfType } from '../common/extensionHostProtocol.js';
let WebWorkerExtensionHost = class WebWorkerExtensionHost extends Disposable {
    constructor(runningLocation, startup, _initDataProvider, _telemetryService, _contextService, _labelService, _logService, _loggerService, _environmentService, _userDataProfilesService, _productService, _layoutService, _storageService, _webWorkerService, _defaultLogLevelsService) {
        super();
        this.runningLocation = runningLocation;
        this.startup = startup;
        this._initDataProvider = _initDataProvider;
        this._telemetryService = _telemetryService;
        this._contextService = _contextService;
        this._labelService = _labelService;
        this._logService = _logService;
        this._loggerService = _loggerService;
        this._environmentService = _environmentService;
        this._userDataProfilesService = _userDataProfilesService;
        this._productService = _productService;
        this._layoutService = _layoutService;
        this._storageService = _storageService;
        this._webWorkerService = _webWorkerService;
        this._defaultLogLevelsService = _defaultLogLevelsService;
        this.pid = null;
        this.remoteAuthority = null;
        this.extensions = null;
        this._onDidExit = this._register(new Emitter());
        this.onExit = this._onDidExit.event;
        this._isTerminating = false;
        this._protocolPromise = null;
        this._protocol = null;
        this._extensionHostLogsLocation = joinPath(this._environmentService.extHostLogsPath, 'webWorker');
    }
    async _getWebWorkerExtensionHostIframeSrc() {
        const suffixSearchParams = new URLSearchParams();
        if (this._environmentService.debugExtensionHost && this._environmentService.debugRenderer) {
            suffixSearchParams.set('debugged', '1');
        }
        COI.addSearchParam(suffixSearchParams, true, true);
        const suffix = `?${suffixSearchParams.toString()}`;
        const iframeModulePath = `vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`;
        if (platform.isWeb) {
            const webEndpointUrlTemplate = this._productService.webEndpointUrlTemplate;
            const commit = this._productService.commit;
            const quality = this._productService.quality;
            if (webEndpointUrlTemplate && commit && quality) {
                // Try to keep the web worker extension host iframe origin stable by storing it in workspace storage
                const key = 'webWorkerExtensionHostIframeStableOriginUUID';
                let stableOriginUUID = this._storageService.get(key, 1 /* StorageScope.WORKSPACE */);
                if (typeof stableOriginUUID === 'undefined') {
                    stableOriginUUID = generateUuid();
                    this._storageService.store(key, stableOriginUUID, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
                }
                const hash = await parentOriginHash(mainWindow.origin, stableOriginUUID);
                const baseUrl = (webEndpointUrlTemplate
                    .replace('{{uuid}}', `v--${hash}`) // using `v--` as a marker to require `parentOrigin`/`salt` verification
                    .replace('{{commit}}', commit)
                    .replace('{{quality}}', quality));
                const res = new URL(`${baseUrl}/out/${iframeModulePath}${suffix}`);
                res.searchParams.set('parentOrigin', mainWindow.origin);
                res.searchParams.set('salt', stableOriginUUID);
                return res.toString();
            }
            console.warn(`The web worker extension host is started in a same-origin iframe!`);
        }
        const relativeExtensionHostIframeSrc = this._webWorkerService.getWorkerUrl(new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri(iframeModulePath),
            esmModuleLocationBundler: new URL(`../worker/webWorkerExtensionHostIframe.html`, import.meta.url),
            label: 'webWorkerExtensionHostIframe'
        }));
        return `${relativeExtensionHostIframeSrc}${suffix}`;
    }
    async start() {
        if (!this._protocolPromise) {
            this._protocolPromise = this._startInsideIframe();
            this._protocolPromise.then(protocol => this._protocol = protocol);
        }
        return this._protocolPromise;
    }
    async _startInsideIframe() {
        const webWorkerExtensionHostIframeSrc = await this._getWebWorkerExtensionHostIframeSrc();
        const emitter = this._register(new Emitter());
        const iframe = document.createElement('iframe');
        iframe.setAttribute('class', 'web-worker-ext-host-iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('allow', 'usb; serial; hid; cross-origin-isolated; local-network-access;');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.display = 'none';
        const vscodeWebWorkerExtHostId = generateUuid();
        iframe.setAttribute('src', `${webWorkerExtensionHostIframeSrc}&vscodeWebWorkerExtHostId=${vscodeWebWorkerExtHostId}`);
        const barrier = new Barrier();
        let port;
        let barrierError = null;
        let barrierHasError = false;
        let startTimeout = undefined;
        const rejectBarrier = (exitCode, error) => {
            barrierError = error;
            barrierHasError = true;
            onUnexpectedError(barrierError);
            clearTimeout(startTimeout);
            this._onDidExit.fire([81 /* ExtensionHostExitCode.UnexpectedError */, barrierError.message]);
            barrier.open();
        };
        const resolveBarrier = (messagePort) => {
            port = messagePort;
            clearTimeout(startTimeout);
            barrier.open();
        };
        startTimeout = setTimeout(() => {
            console.warn(`The Web Worker Extension Host did not start in 60s, that might be a problem.`);
        }, 60000);
        this._register(dom.addDisposableListener(mainWindow, 'message', (event) => {
            if (event.source !== iframe.contentWindow) {
                return;
            }
            if (event.data.vscodeWebWorkerExtHostId !== vscodeWebWorkerExtHostId) {
                return;
            }
            if (event.data.error) {
                const { name, message, stack } = event.data.error;
                const err = new Error();
                err.message = message;
                err.name = name;
                err.stack = stack;
                return rejectBarrier(81 /* ExtensionHostExitCode.UnexpectedError */, err);
            }
            if (event.data.type === 'vscode.bootstrap.nls') {
                iframe.contentWindow.postMessage({
                    type: event.data.type,
                    data: {
                        workerUrl: this._webWorkerService.getWorkerUrl(extensionHostWorkerMainDescriptor),
                        fileRoot: globalThis._VSCODE_FILE_ROOT,
                        nls: {
                            messages: getNLSMessages(),
                            language: getNLSLanguage()
                        }
                    }
                }, '*');
                return;
            }
            const { data } = event.data;
            if (barrier.isOpen() || !(data instanceof MessagePort)) {
                console.warn('UNEXPECTED message', event);
                const err = new Error('UNEXPECTED message');
                return rejectBarrier(81 /* ExtensionHostExitCode.UnexpectedError */, err);
            }
            resolveBarrier(data);
        }));
        this._layoutService.mainContainer.appendChild(iframe);
        this._register(toDisposable(() => iframe.remove()));
        // await MessagePort and use it to directly communicate
        // with the worker extension host
        await barrier.wait();
        if (barrierHasError) {
            throw barrierError;
        }
        // Send over message ports for extension API
        const messagePorts = this._environmentService.options?.messagePorts ?? new Map();
        iframe.contentWindow.postMessage({ type: 'vscode.init', data: messagePorts }, '*', [...messagePorts.values()]);
        port.onmessage = (event) => {
            const { data } = event;
            if (!(data instanceof ArrayBuffer)) {
                console.warn('UNKNOWN data received', data);
                this._onDidExit.fire([77, 'UNKNOWN data received']);
                return;
            }
            emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
        };
        const protocol = {
            onMessage: emitter.event,
            send: vsbuf => {
                const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
                port.postMessage(data, [data]);
            }
        };
        return this._performHandshake(protocol);
    }
    async _performHandshake(protocol) {
        // extension host handshake happens below
        // (1) <== wait for: Ready
        // (2) ==> send: init data
        // (3) <== wait for: Initialized
        await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, 1 /* MessageType.Ready */)));
        if (this._isTerminating) {
            throw canceled();
        }
        protocol.send(VSBuffer.fromString(JSON.stringify(await this._createExtHostInitData())));
        if (this._isTerminating) {
            throw canceled();
        }
        await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, 0 /* MessageType.Initialized */)));
        if (this._isTerminating) {
            throw canceled();
        }
        return protocol;
    }
    dispose() {
        if (this._isTerminating) {
            return;
        }
        this._isTerminating = true;
        this._protocol?.send(createMessageOfType(2 /* MessageType.Terminate */));
        super.dispose();
    }
    getInspectPort() {
        return undefined;
    }
    enableInspectPort() {
        return Promise.resolve(false);
    }
    async _createExtHostInitData() {
        const initData = await this._initDataProvider.getInitData();
        this.extensions = initData.extensions;
        const workspace = this._contextService.getWorkspace();
        const nlsBaseUrl = this._productService.extensionsGallery?.nlsBaseUrl;
        let nlsUrlWithDetails = undefined;
        // Only use the nlsBaseUrl if we are using a language other than the default, English.
        if (nlsBaseUrl && this._productService.commit && !platform.Language.isDefaultVariant()) {
            nlsUrlWithDetails = URI.joinPath(URI.parse(nlsBaseUrl), this._productService.commit, this._productService.version, platform.Language.value());
        }
        return {
            commit: this._productService.commit,
            version: this._productService.version,
            quality: this._productService.quality,
            date: this._productService.date,
            parentPid: 0,
            environment: {
                isExtensionDevelopmentDebug: this._environmentService.debugRenderer,
                appName: this._productService.nameLong,
                appHost: this._productService.embedderIdentifier ?? (platform.isWeb ? 'web' : 'desktop'),
                appUriScheme: this._productService.urlProtocol,
                appLanguage: platform.language,
                isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
                isPortable: false,
                extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
                extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
                globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
                workspaceStorageHome: this._environmentService.workspaceStorageHome,
                extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
                isSessionsWindow: this._environmentService.isSessionsWindow
            },
            workspace: this._contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ? undefined : {
                configuration: workspace.configuration || undefined,
                id: workspace.id,
                name: this._labelService.getWorkspaceLabel(workspace),
                transient: workspace.transient
            },
            consoleForward: {
                includeStack: false,
                logNative: this._environmentService.debugRenderer
            },
            extensions: this.extensions.toSnapshot(),
            nlsBaseUrl: nlsUrlWithDetails,
            telemetryInfo: {
                sessionId: this._telemetryService.sessionId,
                machineId: this._telemetryService.machineId,
                sqmId: this._telemetryService.sqmId,
                devDeviceId: this._telemetryService.devDeviceId ?? this._telemetryService.machineId,
                firstSessionDate: this._telemetryService.firstSessionDate,
                msftInternal: this._telemetryService.msftInternal
            },
            remoteExtensionTips: this._productService.remoteExtensionTips,
            virtualWorkspaceExtensionTips: this._productService.virtualWorkspaceExtensionTips,
            logLevel: this._logService.getLevel(),
            loggers: [...this._loggerService.getRegisteredLoggers()],
            logsLocation: this._extensionHostLogsLocation,
            autoStart: (this.startup === 1 /* ExtensionHostStartup.EagerAutoStart */ || this.startup === 3 /* ExtensionHostStartup.LazyAutoStart */),
            remote: {
                authority: this._environmentService.remoteAuthority,
                connectionData: null,
                isRemote: false
            },
            uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
        };
    }
};
WebWorkerExtensionHost = __decorate([
    __param(3, ITelemetryService),
    __param(4, IWorkspaceContextService),
    __param(5, ILabelService),
    __param(6, ILogService),
    __param(7, ILoggerService),
    __param(8, IBrowserWorkbenchEnvironmentService),
    __param(9, IUserDataProfilesService),
    __param(10, IProductService),
    __param(11, ILayoutService),
    __param(12, IStorageService),
    __param(13, IWebWorkerService),
    __param(14, IDefaultLogLevelsService)
], WebWorkerExtensionHost);
export { WebWorkerExtensionHost };
const extensionHostWorkerMainDescriptor = new WebWorkerDescriptor({
    label: 'extensionHostWorkerMain',
    esmModuleLocation: () => FileAccess.asBrowserUri('vs/workbench/api/worker/extensionHostWorkerMain.js'),
    esmModuleLocationBundler: () => new URL('../../../api/worker/extensionHostWorkerMain.ts?esm', import.meta.url),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViV29ya2VyRXh0ZW5zaW9uSG9zdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvd2ViV29ya2VyRXh0ZW5zaW9uSG9zdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFtQixHQUFHLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEYsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxhQUFhLEVB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