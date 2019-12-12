/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditableData } from 'vs/workbench/common/views';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';

export interface Tunnel {
	remote: number;
	localAddress: string;
	local?: number;
	name?: string;
	description?: string;
	closeable?: boolean;
}

export class TunnelModel extends Disposable {
	readonly forwarded: Map<number, Tunnel>;
	readonly detected: Map<number, Tunnel>;
	private _onForwardPort: Emitter<Tunnel> = new Emitter();
	public onForwardPort: Event<Tunnel> = this._onForwardPort.event;
	private _onClosePort: Emitter<number> = new Emitter();
	public onClosePort: Event<number> = this._onClosePort.event;
	private _onPortName: Emitter<number> = new Emitter();
	public onPortName: Event<number> = this._onPortName.event;
	private _candidateFinder: (() => Promise<{ port: number, detail: string }[]>) | undefined;

	constructor(
		@ITunnelService private readonly tunnelService: ITunnelService
	) {
		super();
		this.forwarded = new Map();
		this.tunnelService.tunnels.then(tunnels => {
			tunnels.forEach(tunnel => {
				if (tunnel.localAddress) {
					this.forwarded.set(tunnel.tunnelRemotePort, {
						remote: tunnel.tunnelRemotePort,
						localAddress: tunnel.localAddress,
						local: tunnel.tunnelLocalPort
					});
				}
			});
		});

		this.detected = new Map();
		this._register(this.tunnelService.onTunnelOpened(tunnel => {
			if (!this.forwarded.has(tunnel.tunnelRemotePort) && tunnel.localAddress) {
				this.forwarded.set(tunnel.tunnelRemotePort, {
					remote: tunnel.tunnelRemotePort,
					localAddress: tunnel.localAddress,
					local: tunnel.tunnelLocalPort,
					closeable: true
				});
			}
			this._onForwardPort.fire(this.forwarded.get(tunnel.tunnelRemotePort)!);
		}));
		this._register(this.tunnelService.onTunnelClosed(remotePort => {
			if (this.forwarded.has(remotePort)) {
				this.forwarded.delete(remotePort);
				this._onClosePort.fire(remotePort);
			}
		}));
	}

	async forward(remote: number, local?: number, name?: string): Promise<RemoteTunnel | void> {
		if (!this.forwarded.has(remote)) {
			const tunnel = await this.tunnelService.openTunnel(remote, local);
			if (tunnel && tunnel.localAddress) {
				const newForward: Tunnel = {
					remote: tunnel.tunnelRemotePort,
					local: tunnel.tunnelLocalPort,
					name: name,
					closeable: true,
					localAddress: tunnel.localAddress
				};
				this.forwarded.set(remote, newForward);
				this._onForwardPort.fire(newForward);
				return tunnel;
			}
		}
	}

	name(remote: number, name: string) {
		if (this.forwarded.has(remote)) {
			this.forwarded.get(remote)!.name = name;
			this._onPortName.fire(remote);
		} else if (this.detected.has(remote)) {
			this.detected.get(remote)!.name = name;
			this._onPortName.fire(remote);
		}
	}

	async close(remote: number): Promise<void> {
		return this.tunnelService.closeTunnel(remote);
	}

	address(remote: number): string | undefined {
		return (this.forwarded.get(remote) || this.detected.get(remote))?.localAddress;
	}

	addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[]): void {
		tunnels.forEach(tunnel => {
			this.detected.set(tunnel.remote.port, {
				remote: tunnel.remote.port,
				localAddress: tunnel.localAddress,
				closeable: false
			});
		});
	}

	registerCandidateFinder(finder: () => Promise<{ port: number, detail: string }[]>): void {
		this._candidateFinder = finder;
	}

	get candidates(): Promise<{ port: number, detail: string }[]> {
		if (this._candidateFinder) {
			return this._candidateFinder();
		}
		return Promise.resolve([]);
	}
}

export interface IRemoteExplorerService {
	_serviceBrand: undefined;
	onDidChangeTargetType: Event<string>;
	targetType: string;
	readonly helpInformation: HelpInformation[];
	readonly tunnelModel: TunnelModel;
	onDidChangeEditable: Event<number | undefined>;
	setEditable(remote: number | undefined, data: IEditableData | null): void;
	getEditableData(remote: number | undefined): IEditableData | undefined;
	forward(remote: number, local?: number, name?: string): Promise<RemoteTunnel | void>;
	close(remote: number): Promise<void>;
	addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[] | undefined): void;
	registerCandidateFinder(finder: () => Promise<{ port: number, detail: string }[]>): void;
}

export interface HelpInformation {
	extensionDescription: IExtensionDescription;
	getStarted?: string;
	documentation?: string;
	feedback?: string;
	issues?: string;
	remoteName?: string[] | string;
}

const remoteHelpExtPoint = ExtensionsRegistry.registerExtensionPoint<HelpInformation>({
	extensionPoint: 'remoteHelp',
	jsonSchema: {
		description: nls.localize('RemoteHelpInformationExtPoint', 'Contributes help information for Remote'),
		type: 'object',
		properties: {
			'getStarted': {
				description: nls.localize('RemoteHelpInformationExtPoint.getStarted', "The url to your project's Getting Started page"),
				type: 'string'
			},
			'documentation': {
				description: nls.localize('RemoteHelpInformationExtPoint.documentation', "The url to your project's documentation page"),
				type: 'string'
			},
			'feedback': {
				description: nls.localize('RemoteHelpInformationExtPoint.feedback', "The url to your project's feedback reporter"),
				type: 'string'
			},
			'issues': {
				description: nls.localize('RemoteHelpInformationExtPoint.issues', "The url to your project's issues list"),
				type: 'string'
			}
		}
	}
});

class RemoteExplorerService implements IRemoteExplorerService {
	public _serviceBrand: undefined;
	private _targetType: string = '';
	private readonly _onDidChangeTargetType: Emitter<string> = new Emitter<string>();
	public readonly onDidChangeTargetType: Event<string> = this._onDidChangeTargetType.event;
	private _helpInformation: HelpInformation[] = [];
	private _tunnelModel: TunnelModel;
	private _editable: { remote: number | undefined, data: IEditableData } | undefined;
	private readonly _onDidChangeEditable: Emitter<number | undefined> = new Emitter();
	public readonly onDidChangeEditable: Event<number | undefined> = this._onDidChangeEditable.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelService tunnelService: ITunnelService) {
		this._tunnelModel = new TunnelModel(tunnelService);
		remoteHelpExtPoint.setHandler((extensions) => {
			let helpInformation: HelpInformation[] = [];
			for (let extension of extensions) {
				this._handleRemoteInfoExtensionPoint(extension, helpInformation);
			}

			this._helpInformation = helpInformation;
		});
	}

	set targetType(name: string) {
		if (this._targetType !== name) {
			this._targetType = name;
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType, StorageScope.WORKSPACE);
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType, StorageScope.GLOBAL);
			this._onDidChangeTargetType.fire(this._targetType);
		}
	}
	get targetType(): string {
		return this._targetType;
	}

	private _handleRemoteInfoExtensionPoint(extension: IExtensionPointUser<HelpInformation>, helpInformation: HelpInformation[]) {
		if (!extension.description.enableProposedApi) {
			return;
		}

		if (!extension.value.documentation && !extension.value.feedback && !extension.value.getStarted && !extension.value.issues) {
			return;
		}

		helpInformation.push({
			extensionDescription: extension.description,
			getStarted: extension.value.getStarted,
			documentation: extension.value.documentation,
			feedback: extension.value.feedback,
			issues: extension.value.issues,
			remoteName: extension.value.remoteName
		});
	}

	get helpInformation(): HelpInformation[] {
		return this._helpInformation;
	}

	get tunnelModel(): TunnelModel {
		return this._tunnelModel;
	}

	forward(remote: number, local?: number, name?: string): Promise<RemoteTunnel | void> {
		return this.tunnelModel.forward(remote, local, name);
	}

	close(remote: number): Promise<void> {
		return this.tunnelModel.close(remote);
	}

	addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[] | undefined): void {
		if (tunnels) {
			this.tunnelModel.addDetected(tunnels);
		}
	}

	setEditable(remote: number | undefined, data: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { remote, data };
		}
		this._onDidChangeEditable.fire(remote);
	}

	getEditableData(remote: number | undefined): IEditableData | undefined {
		return this._editable && this._editable.remote === remote ? this._editable.data : undefined;
	}

	registerCandidateFinder(finder: () => Promise<{ port: number, detail: string }[]>): void {
		this.tunnelModel.registerCandidateFinder(finder);
	}

}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, true);
