/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWorkerBootstrapUrl } from 'vs/base/worker/defaultWorkerFactory';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { createMessageOfType, MessageType, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/product';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class WebWorkerExtensionHostStarter implements IExtensionHostStarter {

	private _toDispose = new DisposableStore();
	private _isTerminating: boolean = false;
	private _protocol?: IMessagePassingProtocol;

	private readonly _onDidExit = new Emitter<[number, string | null]>();
	readonly onExit: Event<[number, string | null]> = this._onDidExit.event;

	constructor(
		private readonly _autoStart: boolean,
		private readonly _extensions: Promise<IExtensionDescription[]>,
		private readonly _extensionHostLogsLocation: URI,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ILabelService private readonly _labelService: ILabelService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
	) {

	}

	async start(): Promise<IMessagePassingProtocol> {

		if (!this._protocol) {

			const emitter = new Emitter<VSBuffer>();

			const url = getWorkerBootstrapUrl(require.toUrl('../worker/extensionHostWorkerMain.js'), 'WorkerExtensionHost');
			const worker = new Worker(url);

			worker.onmessage = (event) => {
				const { data } = event;
				if (!(data instanceof ArrayBuffer)) {
					console.warn('UNKNOWN data received', data);
					this._onDidExit.fire([77, 'UNKNOWN data received']);
					return;
				}

				emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
			};

			worker.onerror = (event) => {
				console.error(event.message, event.error);
				this._onDidExit.fire([81, event.message || event.error]);
			};

			// keep for cleanup
			this._toDispose.add(emitter);
			this._toDispose.add(toDisposable(() => worker.terminate()));

			const protocol: IMessagePassingProtocol = {
				onMessage: emitter.event,
				send: vsbuf => {
					const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
					worker.postMessage(data, [data]);
				}
			};

			// extension host handshake happens below
			// (1) <== wait for: Ready
			// (2) ==> send: init data
			// (3) <== wait for: Initialized

			await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, MessageType.Ready)));
			protocol.send(VSBuffer.fromString(JSON.stringify(await this._createExtHostInitData())));
			await Event.toPromise(Event.filter(protocol.onMessage, msg => isMessageOfType(msg, MessageType.Initialized)));

			this._protocol = protocol;
		}
		return this._protocol;

	}

	dispose(): void {
		if (!this._protocol) {
			this._toDispose.dispose();
			return;
		}
		if (this._isTerminating) {
			return;
		}
		this._isTerminating = true;
		this._protocol.send(createMessageOfType(MessageType.Terminate));
		setTimeout(() => this._toDispose.dispose(), 10 * 1000);
	}

	getInspectPort(): number | undefined {
		return undefined;
	}

	private async _createExtHostInitData(): Promise<IInitData> {
		const [telemetryInfo, extensionDescriptions] = await Promise.all([this._telemetryService.getTelemetryInfo(), this._extensions]);
		const workspace = this._contextService.getWorkspace();
		return {
			commit: this._productService.commit,
			version: this._productService.version,
			parentPid: -1,
			environment: {
				isExtensionDevelopmentDebug: false,
				appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : undefined,
				appSettingsHome: this._environmentService.appSettingsHome ? this._environmentService.appSettingsHome : undefined,
				appName: this._productService.nameLong,
				appUriScheme: this._productService.urlProtocol,
				appLanguage: platform.language,
				extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
				extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
				globalStorageHome: URI.parse('fake:globalStorageHome'), //todo@joh URI.file(this._environmentService.globalStorageHome),
				userHome: URI.parse('fake:userHome'), //todo@joh URI.file(this._environmentService.userHome),
				webviewResourceRoot: this._environmentService.webviewResourceRoot,
				webviewCspSource: this._environmentService.webviewCspSource,
			},
			workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? undefined : {
				configuration: workspace.configuration || undefined,
				id: workspace.id,
				name: this._labelService.getWorkspaceLabel(workspace)
			},
			resolvedExtensions: [],
			hostExtensions: [],
			extensions: extensionDescriptions,
			telemetryInfo,
			logLevel: this._logService.getLevel(),
			logsLocation: this._extensionHostLogsLocation,
			autoStart: this._autoStart,
			remote: {
				authority: this._environmentService.configuration.remoteAuthority,
				isRemote: false
			},
		};
	}
}
