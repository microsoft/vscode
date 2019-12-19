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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';
const TUNNELS_TO_RESTORE = 'remote.tunnels.toRestore';

export interface Tunnel {
	remoteHost: string;
	remotePort: number;
	localAddress: string;
	localPort?: number;
	name?: string;
	description?: string;
	closeable?: boolean;
}

export function MakeAddress(host: string, port: number): string {
	if (host = '127.0.0.1') {
		host = 'localhost';
	}
	return host + ':' + port;
}

export class TunnelModel extends Disposable {
	readonly forwarded: Map<string, Tunnel>;
	readonly detected: Map<string, Tunnel>;
	private _onForwardPort: Emitter<Tunnel> = new Emitter();
	public onForwardPort: Event<Tunnel> = this._onForwardPort.event;
	private _onClosePort: Emitter<{ host: string, port: number }> = new Emitter();
	public onClosePort: Event<{ host: string, port: number }> = this._onClosePort.event;
	private _onPortName: Emitter<{ host: string, port: number }> = new Emitter();
	public onPortName: Event<{ host: string, port: number }> = this._onPortName.event;
	private _candidateFinder: (() => Promise<{ host: string, port: number, detail: string }[]>) | undefined;

	constructor(
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.forwarded = new Map();
		this.tunnelService.tunnels.then(tunnels => {
			tunnels.forEach(tunnel => {
				if (tunnel.localAddress) {
					this.forwarded.set(MakeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort), {
						remotePort: tunnel.tunnelRemotePort,
						remoteHost: tunnel.tunnelRemoteHost,
						localAddress: tunnel.localAddress,
						localPort: tunnel.tunnelLocalPort
					});
				}
			});
		});

		this.detected = new Map();
		this._register(this.tunnelService.onTunnelOpened(tunnel => {
			const key = MakeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
			if ((!this.forwarded.has(key)) && tunnel.localAddress) {
				this.forwarded.set(key, {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localAddress: tunnel.localAddress,
					localPort: tunnel.tunnelLocalPort,
					closeable: true
				});
				this.storeForwarded();
			}
			this._onForwardPort.fire(this.forwarded.get(key)!);
		}));
		this._register(this.tunnelService.onTunnelClosed(address => {
			const key = MakeAddress(address.host, address.port);
			if (this.forwarded.has(key)) {
				this.forwarded.delete(key);
				this.storeForwarded();
				this._onClosePort.fire(address);
			}
		}));

		this.restoreForwarded();
	}

	private async restoreForwarded() {
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			const tunnelsString = this.storageService.get(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
			if (tunnelsString) {
				(<Tunnel[] | undefined>JSON.parse(tunnelsString))?.forEach(tunnel => {
					this.forward({ host: tunnel.remoteHost, port: tunnel.remotePort }, tunnel.localPort, tunnel.name);
				});
			}
		}
	}

	private storeForwarded() {
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			this.storageService.store(TUNNELS_TO_RESTORE, JSON.stringify(Array.from(this.forwarded.values())), StorageScope.WORKSPACE);
		}
	}

	async forward(remote: { host: string, port: number }, local?: number, name?: string): Promise<RemoteTunnel | void> {
		const key = MakeAddress(remote.host, remote.port);
		if (!this.forwarded.has(key)) {
			const tunnel = await this.tunnelService.openTunnel(remote.host, remote.port, local);
			if (tunnel && tunnel.localAddress) {
				const newForward: Tunnel = {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localPort: tunnel.tunnelLocalPort,
					name: name,
					closeable: true,
					localAddress: tunnel.localAddress
				};
				this.forwarded.set(key, newForward);
				this._onForwardPort.fire(newForward);
				return tunnel;
			}
		}
	}

	name(host: string, port: number, name: string) {
		const key = MakeAddress(host, port);
		if (this.forwarded.has(key)) {
			this.forwarded.get(key)!.name = name;
			this.storeForwarded();
			this._onPortName.fire({ host, port });
		} else if (this.detected.has(key)) {
			this.detected.get(key)!.name = name;
			this._onPortName.fire({ host, port });
		}
	}

	async close(host: string, port: number): Promise<void> {
		return this.tunnelService.closeTunnel(host, port);
	}

	address(host: string, port: number): string | undefined {
		const key = MakeAddress(host, port);
		return (this.forwarded.get(key) || this.detected.get(key))?.localAddress;
	}

	addEnvironmentTunnels(tunnels: { remoteAddress: { port: number, host: string }, localAddress: string }[]): void {
		tunnels.forEach(tunnel => {
			this.detected.set(MakeAddress(tunnel.remoteAddress.host, tunnel.remoteAddress.port), {
				remoteHost: tunnel.remoteAddress.host,
				remotePort: tunnel.remoteAddress.port,
				localAddress: tunnel.localAddress,
				closeable: false
			});
		});
	}

	registerCandidateFinder(finder: () => Promise<{ host: string, port: number, detail: string }[]>): void {
		this._candidateFinder = finder;
	}

	get candidates(): Promise<{ host: string, port: number, detail: string }[]> {
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
	onDidChangeEditable: Event<{ host: string, port: number | undefined }>;
	setEditable(remoteHost: string | undefined, remotePort: number | undefined, data: IEditableData | null): void;
	getEditableData(remoteHost: string | undefined, remotePort: number | undefined): IEditableData | undefined;
	forward(remote: { host: string, port: number }, localPort?: number, name?: string): Promise<RemoteTunnel | void>;
	close(remote: { host: string, port: number }): Promise<void>;
	addEnvironmentTunnels(tunnels: { remoteAddress: { port: number, host: string }, localAddress: string }[] | undefined): void;
	registerCandidateFinder(finder: () => Promise<{ host: string, port: number, detail: string }[]>): void;
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
	private _editable: { remoteHost: string, remotePort: number | undefined, data: IEditableData } | undefined;
	private readonly _onDidChangeEditable: Emitter<{ host: string, port: number | undefined }> = new Emitter();
	public readonly onDidChangeEditable: Event<{ host: string, port: number | undefined }> = this._onDidChangeEditable.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelService tunnelService: ITunnelService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this._tunnelModel = new TunnelModel(tunnelService, storageService, configurationService);
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

	forward(remote: { host: string, port: number }, local?: number, name?: string): Promise<RemoteTunnel | void> {
		return this.tunnelModel.forward(remote, local, name);
	}

	close(remote: { host: string, port: number }): Promise<void> {
		return this.tunnelModel.close(remote.host, remote.port);
	}

	addEnvironmentTunnels(tunnels: { remoteAddress: { port: number, host: string }, localAddress: string }[] | undefined): void {
		if (tunnels) {
			this.tunnelModel.addEnvironmentTunnels(tunnels);
		}
	}

	setEditable(remoteHost: string, remotePort: number | undefined, data: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { remoteHost, remotePort, data };
		}
		this._onDidChangeEditable.fire({ host: remoteHost, port: remotePort });
	}

	getEditableData(remoteHost: string | undefined, remotePort: number | undefined): IEditableData | undefined {
		return (this._editable && (this._editable.remotePort === remotePort) && this._editable.remoteHost === remoteHost) ?
			this._editable.data : undefined;
	}

	registerCandidateFinder(finder: () => Promise<{ host: string, port: number, detail: string }[]>): void {
		this.tunnelModel.registerCandidateFinder(finder);
	}

}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, true);
