/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITunnelService, RemoteTunnel, TunnelProtocol } from 'vs/platform/tunnel/common/tunnel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEditableData } from 'vs/workbench/common/views';
import { TunnelInformation, TunnelPrivacy } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { URI } from 'vs/base/common/uri';
import { Attributes, CandidatePort, TunnelCloseReason, TunnelModel, TunnelProperties, TunnelSource } from 'vs/workbench/services/remote/common/tunnelModel';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';
export const TUNNEL_VIEW_ID = '~remote.forwardedPorts';
export const TUNNEL_VIEW_CONTAINER_ID = '~remote.forwardedPortsContainer';
export const PORT_AUTO_FORWARD_SETTING = 'remote.autoForwardPorts';
export const PORT_AUTO_SOURCE_SETTING = 'remote.autoForwardPortsSource';
export const PORT_AUTO_SOURCE_SETTING_PROCESS = 'process';
export const PORT_AUTO_SOURCE_SETTING_OUTPUT = 'output';
export const PORT_AUTO_SOURCE_SETTING_HYBRID = 'hybrid';

export enum TunnelType {
	Candidate = 'Candidate',
	Detected = 'Detected',
	Forwarded = 'Forwarded',
	Add = 'Add'
}

export interface ITunnelItem {
	tunnelType: TunnelType;
	remoteHost: string;
	remotePort: number;
	localAddress?: string;
	protocol: TunnelProtocol;
	localUri?: URI;
	localPort?: number;
	name?: string;
	closeable?: boolean;
	source: {
		source: TunnelSource;
		description: string;
	};
	privacy: TunnelPrivacy;
	processDescription?: string;
	readonly label: string;
}

export enum TunnelEditId {
	None = 0,
	New = 1,
	Label = 2,
	LocalPort = 3
}

export interface IRemoteExplorerService {
	readonly _serviceBrand: undefined;
	onDidChangeTargetType: Event<string[]>;
	targetType: string[];
	readonly tunnelModel: TunnelModel;
	onDidChangeEditable: Event<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined>;
	setEditable(tunnelItem: ITunnelItem | undefined, editId: TunnelEditId, data: IEditableData | null): void;
	getEditableData(tunnelItem: ITunnelItem | undefined, editId?: TunnelEditId): IEditableData | undefined;
	forward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | undefined>;
	close(remote: { host: string; port: number }, reason: TunnelCloseReason): Promise<void>;
	setTunnelInformation(tunnelInformation: TunnelInformation | undefined): void;
	setCandidateFilter(filter: ((candidates: CandidatePort[]) => Promise<CandidatePort[]>) | undefined): IDisposable;
	onFoundNewCandidates(candidates: CandidatePort[]): void;
	restore(): Promise<void>;
	enablePortsFeatures(): void;
	onEnabledPortsFeatures: Event<void>;
	portsFeaturesEnabled: boolean;
	readonly namedProcesses: Map<number, string>;
}

class RemoteExplorerService implements IRemoteExplorerService {
	public _serviceBrand: undefined;
	private _targetType: string[] = [];
	private readonly _onDidChangeTargetType: Emitter<string[]> = new Emitter<string[]>();
	public readonly onDidChangeTargetType: Event<string[]> = this._onDidChangeTargetType.event;
	private _tunnelModel: TunnelModel;
	private _editable: { tunnelItem: ITunnelItem | undefined; editId: TunnelEditId; data: IEditableData } | undefined;
	private readonly _onDidChangeEditable: Emitter<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined> = new Emitter();
	public readonly onDidChangeEditable: Event<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined> = this._onDidChangeEditable.event;
	private readonly _onEnabledPortsFeatures: Emitter<void> = new Emitter();
	public readonly onEnabledPortsFeatures: Event<void> = this._onEnabledPortsFeatures.event;
	private _portsFeaturesEnabled: boolean = false;
	public readonly namedProcesses = new Map<number, string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._tunnelModel = instantiationService.createInstance(TunnelModel);
	}

	set targetType(name: string[]) {
		// Can just compare the first element of the array since there are no target overlaps
		const current: string = this._targetType.length > 0 ? this._targetType[0] : '';
		const newName: string = name.length > 0 ? name[0] : '';
		if (current !== newName) {
			this._targetType = name;
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), StorageScope.PROFILE, StorageTarget.USER);
			this._onDidChangeTargetType.fire(this._targetType);
		}
	}
	get targetType(): string[] {
		return this._targetType;
	}

	get tunnelModel(): TunnelModel {
		return this._tunnelModel;
	}

	forward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | undefined> {
		return this.tunnelModel.forward(tunnelProperties, attributes);
	}

	close(remote: { host: string; port: number }, reason: TunnelCloseReason): Promise<void> {
		return this.tunnelModel.close(remote.host, remote.port, reason);
	}

	setTunnelInformation(tunnelInformation: TunnelInformation | undefined): void {
		if (tunnelInformation?.features) {
			this.tunnelService.setTunnelFeatures(tunnelInformation.features);
		}
		this.tunnelModel.addEnvironmentTunnels(tunnelInformation?.environmentTunnels);
	}

	setEditable(tunnelItem: ITunnelItem | undefined, editId: TunnelEditId, data: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { tunnelItem, data, editId };
		}
		this._onDidChangeEditable.fire(tunnelItem ? { tunnel: tunnelItem, editId } : undefined);
	}

	getEditableData(tunnelItem: ITunnelItem | undefined, editId: TunnelEditId): IEditableData | undefined {
		return (this._editable &&
			((!tunnelItem && (tunnelItem === this._editable.tunnelItem)) ||
				(tunnelItem && (this._editable.tunnelItem?.remotePort === tunnelItem.remotePort) && (this._editable.tunnelItem.remoteHost === tunnelItem.remoteHost)
					&& (this._editable.editId === editId)))) ?
			this._editable.data : undefined;
	}

	setCandidateFilter(filter: (candidates: CandidatePort[]) => Promise<CandidatePort[]>): IDisposable {
		if (!filter) {
			return {
				dispose: () => { }
			};
		}
		this.tunnelModel.setCandidateFilter(filter);
		return {
			dispose: () => {
				this.tunnelModel.setCandidateFilter(undefined);
			}
		};
	}

	onFoundNewCandidates(candidates: CandidatePort[]): void {
		this.tunnelModel.setCandidates(candidates);
	}

	restore(): Promise<void> {
		return this.tunnelModel.restoreForwarded();
	}

	enablePortsFeatures(): void {
		this._portsFeaturesEnabled = true;
		this._onEnabledPortsFeatures.fire();
	}

	get portsFeaturesEnabled(): boolean {
		return this._portsFeaturesEnabled;
	}
}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, InstantiationType.Delayed);
