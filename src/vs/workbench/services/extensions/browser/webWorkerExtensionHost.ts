/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { parentOriginHash } from '../../../../base/browser/iframe.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isESM } from '../../../../base/common/amd.js';
import { Barrier } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { canceled, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { AppResourcePath, COI, FileAccess } from '../../../../base/common/network.js';
import * as platform from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IMessagePassingProtocol } from '../../../../base/parts/ipc/common/ipc.js';
import { getNLSLanguage, getNLSMessages } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService, ILoggerService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLoggingOnly } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { ExtensionHostExitCode, IExtensionHostInitData, MessageType, UIKind, createMessageOfType, isMessageOfType } from '../common/extensionHostProtocol.js';
import { LocalWebWorkerRunningLocation } from '../common/extensionRunningLocation.js';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost } from '../common/extensions.js';

export interface IWebWorkerExtensionHostInitData {
	readonly extensions: ExtensionHostExtensions;
}

export interface IWebWorkerExtensionHostDataProvider {
	getInitData(): Promise<IWebWorkerExtensionHostInitData>;
}

export class WebWorkerExtensionHost extends Disposable implements IExtensionHost {

	public readonly pid = null;
	public readonly remoteAuthority = null;
	public extensions: ExtensionHostExtensions | null = null;

	private readonly _onDidExit = this._register(new Emitter<[number, string | null]>());
	public readonly onExit: Event<[number, string | null]> = this._onDidExit.event;

	private _isTerminating: boolean;
	private _protocolPromise: Promise<IMessagePassingProtocol> | null;
	private _protocol: IMessagePassingProtocol | null;

	private readonly _extensionHostLogsLocation: URI;

	constructor(
		public readonly runningLocation: LocalWebWorkerRunningLocation,
		public readonly startup: ExtensionHostStartup,
		private readonly _initDataProvider: IWebWorkerExtensionHostDataProvider,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ILabelService private readonly _labelService: ILabelService,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IBrowserWorkbenchEnvironmentService private readonly _environmentService: IBrowserWorkbenchEnvironmentService,
		@IUserDataProfilesService private readonly _userDataProfilesService: IUserDataProfilesService,
		@IProductService private readonly _productService: IProductService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._isTerminating = false;
		this._protocolPromise = null;
		this._protocol = null;
		this._extensionHostLogsLocation = joinPath(this._environmentService.extHostLogsPath, 'webWorker');
	}

	private async _getWebWorkerExtensionHostIframeSrc(): Promise<string> {
		const suffixSearchParams = new URLSearchParams();
		if (this._environmentService.debugExtensionHost && this._environmentService.debugRenderer) {
			suffixSearchParams.set('debugged', '1');
		}
		COI.addSearchParam(suffixSearchParams, true, true);

		const suffix = `?${suffixSearchParams.toString()}`;

		const iframeModulePath: AppResourcePath = `vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.${isESM ? 'esm.' : ''}html`;
		if (platform.isWeb) {
			const webEndpointUrlTemplate = this._productService.webEndpointUrlTemplate;
			const commit = this._productService.commit;
			const quality = this._productService.quality;
			if (webEndpointUrlTemplate && commit && quality) {
				// Try to keep the web worker extension host iframe origin stable by storing it in workspace storage
				const key = 'webWorkerExtensionHostIframeStableOriginUUID';
				let stableOriginUUID = this._storageService.get(key, StorageScope.WORKSPACE);
				if (typeof stableOriginUUID === 'undefined') {
					stableOriginUUID = generateUuid();
					this._storageService.store(key, stableOriginUUID, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
				const hash = await parentOriginHash(mainWindow.origin, stableOriginUUID);
				const baseUrl = (
					webEndpointUrlTemplate
						.replace('{{uuid}}', `v--${hash}`) // using `v--` as a marker to require `parentOrigin`/`salt` verification
						.replace('{{commit}}', commit)
						.replace('{{quality}}', quality)
				);

				const res = new URL(`${baseUrl}/out/${iframeModulePath}${suffix}`);
				res.searchParams.set('parentOrigin', mainWindow.origin);
				res.searchParams.set('salt', stableOriginUUID);
				return res.toString();
			}

			console.warn(`The web worker extension host is started in a same-origin iframe!`);
		}

		const relativeExtensionHostIframeSrc = FileAccess.asBrowserUri(iframeModulePath);
		return `${relativeExtensionHostIframeSrc.toString(true)}${suffix}`;
	}

	public async start(): Promise<IMessagePassingProtocol> {
		if (!this._protocolPromise) {
			this._protocolPromise = this._startInsideIframe();
			this._protocolPromise.then(protocol => this._protocol = protocol);
		}
		return this._protocolPromise;
	}

	private async _startInsideIframe(): Promise<IMessagePassingProtocol> {
		const webWorkerExtensionHostIframeSrc = await this._getWebWorkerExtensionHostIframeSrc();
		const emitter = this._register(new Emitter<VSBuffer>());

		const iframe = document.createElement('iframe');
		iframe.setAttribute('class', 'web-worker-ext-host-iframe');
		iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
		iframe.setAttribute('allow', 'usb; serial; hid; cross-origin-isolated;');
		iframe.setAttribute('aria-hidden', 'true');
		iframe.style.display = 'none';

		const vscodeWebWorkerExtHostId = generateUuid();
		iframe.setAttribute('src', `${webWorkerExtensionHostIframeSrc}&vscodeWebWorkerExtHostId=${vscodeWebWorkerExtHostId}`);

		const barrier = new Barrier();
		let port!: MessagePort;
		let barrierError: Error | null = null;
		let barrierHasError = false;
		let startTimeout: any = null;

		const rejectBarrier = (exitCode: number, error: Error) => {
			barrierError = error;
			barrierHasError = true;
			onUnexpectedError(barrierError);
			clearTimeout(startTimeout);
			this._onDidExit.fire([ExtensionHostExitCode.UnexpectedError, barrierError.message]);
			barrier.open();
		};

		const resolveBarrier = (messagePort: MessagePort) => {
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
				return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
			}
			if (event.data.type === 'vscode.bootstrap.nls') {
				const factoryModuleId = 'vs/base/worker/workerMain.js';
				const baseUrl = isESM ? undefined : require.toUrl(factoryModuleId).slice(0, -factoryModuleId.length);
				iframe.contentWindow!.postMessage({
					type: event.data.type,
					data: {
						baseUrl,
						workerUrl: isESM ? FileAccess.asBrowserUri('vs/workbench/api/worker/extensionHostWorker.esm.js').toString(true) : require.toUrl(factoryModuleId),
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
				return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
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
		iframe.contentWindow!.postMessage({ type: 'vscode.init', data: messagePorts }, '*', [...messagePorts.values()]);

		port.onmessage = (event) => {
			const { data } = event;
			if (!(data instanceof ArrayBuffer)) {
				console.warn('UNKNOWN data received', data);
				this._onDidExit.fire([77, 'UNKNOWN data received']);
				return;
			}
			emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
		};

		const protocol: IMessagePassingProtocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
				port.postMessage(data, [data]);
			}
		};

		return this._performHandshake(protocol);
	}

	private async _performHandshake(protocol: IMessagePassingProtocol): Promise<IMessagePassingProtocol> {
		// extension host handshake happens below
		// (1) <== wait for: Ready
		// (2) ==> send: init data
		// (3) <== wait for: Initialized

		await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, MessageType.Ready)));
		if (this._isTerminating) {
			throw canceled();
		}
		protocol.send(VSBuffer.fromString(JSON.stringify(await this._createExtHostInitData())));
		if (this._isTerminating) {
			throw canceled();
		}
		await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, MessageType.Initialized)));
		if (this._isTerminating) {
			throw canceled();
		}

		return protocol;
	}

	public override dispose(): void {
		if (this._isTerminating) {
			return;
		}
		this._isTerminating = true;
		this._protocol?.send(createMessageOfType(MessageType.Terminate));
		super.dispose();
	}

	getInspectPort(): undefined {
		return undefined;
	}

	enableInspectPort(): Promise<boolean> {
		return Promise.resolve(false);
	}

	private async _createExtHostInitData(): Promise<IExtensionHostInitData> {
		const initData = await this._initDataProvider.getInitData();
		this.extensions = initData.extensions;
		const workspace = this._contextService.getWorkspace();
		const nlsBaseUrl = this._productService.extensionsGallery?.nlsBaseUrl;
		let nlsUrlWithDetails: URI | undefined = undefined;
		// Only use the nlsBaseUrl if we are using a language other than the default, English.
		if (nlsBaseUrl && this._productService.commit && !platform.Language.isDefaultVariant()) {
			nlsUrlWithDetails = URI.joinPath(URI.parse(nlsBaseUrl), this._productService.commit, this._productService.version, platform.Language.value());
		}
		return {
			commit: this._productService.commit,
			version: this._productService.version,
			quality: this._productService.quality,
			parentPid: 0,
			environment: {
				isExtensionDevelopmentDebug: this._environmentService.debugRenderer,
				appName: this._productService.nameLong,
				appHost: this._productService.embedderIdentifier ?? (platform.isWeb ? 'web' : 'desktop'),
				appUriScheme: this._productService.urlProtocol,
				appLanguage: platform.language,
				extensionTelemetryLogResource: this._environmentService.extHostTelemetryLogFile,
				isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
				extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
				extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
				globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
				workspaceStorageHome: this._environmentService.workspaceStorageHome,
				extensionLogLevel: this._environmentService.extensionLogLevel
			},
			workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? undefined : {
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
				devDeviceId: this._telemetryService.devDeviceId,
				firstSessionDate: this._telemetryService.firstSessionDate,
				msftInternal: this._telemetryService.msftInternal
			},
			logLevel: this._logService.getLevel(),
			loggers: [...this._loggerService.getRegisteredLoggers()],
			logsLocation: this._extensionHostLogsLocation,
			autoStart: (this.startup === ExtensionHostStartup.EagerAutoStart),
			remote: {
				authority: this._environmentService.remoteAuthority,
				connectionData: null,
				isRemote: false
			},
			uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
		};
	}
}
