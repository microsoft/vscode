/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { createMessageOfType, MessageType, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/product';

export class WebWorkerExtensionHostStarter implements IExtensionHostStarter {

	private _protocol?: IMessagePassingProtocol;
	private _isTerminating?: boolean;
	private _toDispose: IDisposable[] = [];

	private readonly _onDidExit = new Emitter<[number, string | null]>();
	readonly onExit: Event<[number, string | null]> = this._onDidExit.event;

	constructor(
		// private readonly _autoStart: boolean,
		private readonly _extensions: Promise<IExtensionDescription[]>,
		private readonly _extensionHostLogsLocation: URI,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ILabelService private readonly _labelService: ILabelService,
		@ILogService private readonly _logService: ILogService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IProductService private readonly _productService: IProductService,
	) {

	}

	async start(): Promise<IMessagePassingProtocol> {

		if (!this._protocol) {

			const emitter = new Emitter<VSBuffer>();
			const worker = new DefaultWorkerFactory('WorkerExtensionHost').create(
				'vs/workbench/services/extensions/worker/extensionHostWorker', data => {
					if (data instanceof ArrayBuffer) {
						emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
					} else {
						console.warn('UNKNOWN data received', data);
						this._onDidExit.fire([77, 'UNKNOWN data received']);
					}
				}, err => {
					this._onDidExit.fire([81, err]);
					console.error(err);
				}
			);

			// keep for cleanup
			this._toDispose.push(worker, emitter);

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
			// nothing else to do
			dispose(this._toDispose);
			return;
		}
		if (!this._isTerminating) {
			this._isTerminating = true;

			this._protocol.send(createMessageOfType(MessageType.Terminate));
			setTimeout(() => dispose(this._toDispose), 10 * 1000);
		}
	}

	getInspectPort(): number | undefined {
		return undefined;
	}

	private _createExtHostInitData(): Promise<IInitData> {
		return Promise.all([this._telemetryService.getTelemetryInfo(), this._extensions])
			.then(([telemetryInfo, extensionDescriptions]) => {
				const workspace = this._contextService.getWorkspace();
				const r: IInitData = {
					commit: this._productService.commit,
					version: this._productService.version,
					parentPid: process.pid,
					environment: {
						isExtensionDevelopmentDebug: false, // < todo@joh
						appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : undefined,
						appSettingsHome: this._environmentService.appSettingsHome ? URI.file(this._environmentService.appSettingsHome) : undefined,
						appName: this._productService.nameLong,
						appUriScheme: this._productService.urlProtocol,
						appLanguage: platform.language,
						extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
						extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
						globalStorageHome: URI.file(this._environmentService.globalStorageHome),
						userHome: URI.file(this._environmentService.userHome)
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
					autoStart: true// < todo@joh this._autoStart
				};
				return r;
			});
	}
}

class WorkerExtensionHost extends Disposable implements IWorkbenchContribution {

	constructor() {
		super();
		// new ExtensionHostWebWorker().start().then(protocol => {

		// });
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkerExtensionHost,
	LifecyclePhase.Ready
);

