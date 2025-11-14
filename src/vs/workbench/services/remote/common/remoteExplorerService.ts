/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITunnelService, RemoteTunnel, TunnelProtocol } from '../../../../platform/tunnel/common/tunnel.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IEditableData } from '../../../common/views.js';
import { TunnelInformation, TunnelPrivacy } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { URI } from '../../../../base/common/uri.js';
import { Attributes, CandidatePort, TunnelCloseReason, TunnelModel, TunnelProperties, TunnelSource } from './tunnelModel.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../extensions/common/extensionsRegistry.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';
export const TUNNEL_VIEW_ID = '~remote.forwardedPorts';
export const TUNNEL_VIEW_CONTAINER_ID = '~remote.forwardedPortsContainer';
export const PORT_AUTO_FORWARD_SETTING = 'remote.autoForwardPorts';
export const PORT_AUTO_SOURCE_SETTING = 'remote.autoForwardPortsSource';
export const PORT_AUTO_FALLBACK_SETTING = 'remote.autoForwardPortsFallback';
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

export interface HelpInformation {
	extensionDescription: IExtensionDescription;
	getStarted?: string | { id: string };
	documentation?: string;
	issues?: string;
	reportIssue?: string;
	remoteName?: string[] | string;
	virtualWorkspace?: string;
}

const getStartedWalkthrough: IJSONSchema = {
	type: 'object',
	required: ['id'],
	properties: {
		id: {
			description: nls.localize('getStartedWalkthrough.id', 'The ID of a Get Started walkthrough to open.'),
			type: 'string'
		},
	}
};

const remoteHelpExtPoint = ExtensionsRegistry.registerExtensionPoint<HelpInformation>({
	extensionPoint: 'remoteHelp',
	jsonSchema: {
		description: nls.localize('RemoteHelpInformationExtPoint', 'Contributes help information for Remote'),
		type: 'object',
		properties: {
			'getStarted': {
				description: nls.localize('RemoteHelpInformationExtPoint.getStarted', "The url, or a command that returns the url, to your project's Getting Started page, or a walkthrough ID contributed by your project's extension"),
				oneOf: [
					{ type: 'string' },
					getStartedWalkthrough
				]
			},
			'documentation': {
				description: nls.localize('RemoteHelpInformationExtPoint.documentation', "The url, or a command that returns the url, to your project's documentation page"),
				type: 'string'
			},
			'feedback': {
				description: nls.localize('RemoteHelpInformationExtPoint.feedback', "The url, or a command that returns the url, to your project's feedback reporter"),
				type: 'string',
				markdownDeprecationMessage: nls.localize('RemoteHelpInformationExtPoint.feedback.deprecated', "Use {0} instead", '`reportIssue`')
			},
			'reportIssue': {
				description: nls.localize('RemoteHelpInformationExtPoint.reportIssue', "The url, or a command that returns the url, to your project's issue reporter"),
				type: 'string'
			},
			'issues': {
				description: nls.localize('RemoteHelpInformationExtPoint.issues', "The url, or a command that returns the url, to your project's issues list"),
				type: 'string'
			}
		}
	}
});

export enum PortsEnablement {
	Disabled = 0,
	ViewOnly = 1,
	AdditionalFeatures = 2
}

export interface IRemoteExplorerService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeTargetType: Event<string[]>;
	targetType: string[];
	readonly onDidChangeHelpInformation: Event<readonly IExtensionPointUser<HelpInformation>[]>;
	helpInformation: IExtensionPointUser<HelpInformation>[];
	readonly tunnelModel: TunnelModel;
	readonly onDidChangeEditable: Event<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined>;
	setEditable(tunnelItem: ITunnelItem | undefined, editId: TunnelEditId, data: IEditableData | null): void;
	getEditableData(tunnelItem: ITunnelItem | undefined, editId?: TunnelEditId): IEditableData | undefined;
	forward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | string | undefined>;
	close(remote: { host: string; port: number }, reason: TunnelCloseReason): Promise<void>;
	setTunnelInformation(tunnelInformation: TunnelInformation | undefined): void;
	setCandidateFilter(filter: ((candidates: CandidatePort[]) => Promise<CandidatePort[]>) | undefined): IDisposable;
	onFoundNewCandidates(candidates: CandidatePort[]): void;
	restore(): Promise<void>;
	enablePortsFeatures(viewOnly: boolean): void;
	readonly onEnabledPortsFeatures: Event<void>;
	portsFeaturesEnabled: PortsEnablement;
	readonly namedProcesses: Map<number, string>;
}

class RemoteExplorerService implements IRemoteExplorerService {
	public _serviceBrand: undefined;
	private _targetType: string[] = [];
	private readonly _onDidChangeTargetType: Emitter<string[]> = new Emitter<string[]>();
	public readonly onDidChangeTargetType: Event<string[]> = this._onDidChangeTargetType.event;
	private readonly _onDidChangeHelpInformation: Emitter<readonly IExtensionPointUser<HelpInformation>[]> = new Emitter();
	public readonly onDidChangeHelpInformation: Event<readonly IExtensionPointUser<HelpInformation>[]> = this._onDidChangeHelpInformation.event;
	private _helpInformation: IExtensionPointUser<HelpInformation>[] = [];
	private _tunnelModel: TunnelModel;
	private _editable: { tunnelItem: ITunnelItem | undefined; editId: TunnelEditId; data: IEditableData } | undefined;
	private readonly _onDidChangeEditable: Emitter<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined> = new Emitter();
	public readonly onDidChangeEditable: Event<{ tunnel: ITunnelItem; editId: TunnelEditId } | undefined> = this._onDidChangeEditable.event;
	private readonly _onEnabledPortsFeatures: Emitter<void> = new Emitter();
	public readonly onEnabledPortsFeatures: Event<void> = this._onEnabledPortsFeatures.event;
	private _portsFeaturesEnabled: PortsEnablement = PortsEnablement.Disabled;
	public readonly namedProcesses = new Map<number, string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._tunnelModel = instantiationService.createInstance(TunnelModel);

		remoteHelpExtPoint.setHandler((extensions) => {
			this._helpInformation.push(...extensions);
			this._onDidChangeHelpInformation.fire(extensions);
		});
	}

	get helpInformation(): IExtensionPointUser<HelpInformation>[] {
		return this._helpInformation;
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

	forward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | string | undefined> {
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

	enablePortsFeatures(viewOnly: boolean): void {
		this._portsFeaturesEnabled = viewOnly ? PortsEnablement.ViewOnly : PortsEnablement.AdditionalFeatures;
		this._onEnabledPortsFeatures.fire();
	}

	get portsFeaturesEnabled(): PortsEnablement {
		return this._portsFeaturesEnabled;
	}
}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, InstantiationType.Delayed);
