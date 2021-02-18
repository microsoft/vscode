/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ALL_INTERFACES_ADDRESSES, isAllInterfaces, isLocalhost, ITunnelService, LOCALHOST_ADDRESSES, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IEditableData } from 'vs/workbench/common/views';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TunnelInformation, TunnelDescription, IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { isNumber, isObject, isString } from 'vs/base/common/types';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { hash } from 'vs/base/common/hash';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';
const TUNNELS_TO_RESTORE = 'remote.tunnels.toRestore';
export const TUNNEL_VIEW_ID = '~remote.forwardedPorts';

export enum TunnelType {
	Candidate = 'Candidate',
	Detected = 'Detected',
	Forwarded = 'Forwarded',
	Add = 'Add'
}

export enum TunnelPrivacy {
	ConstantPrivate = 'ConstantPrivate', // private, and changing is unsupported
	Private = 'Private',
	Public = 'Public'
}

export interface ITunnelItem {
	tunnelType: TunnelType;
	remoteHost: string;
	remotePort: number;
	localAddress?: string;
	localPort?: number;
	name?: string;
	closeable?: boolean;
	privacy?: TunnelPrivacy;
	description?: string;
	wideDescription?: string;
	readonly icon?: ThemeIcon;
	readonly label: string;
	readonly wideLabel: string;
}

export interface Tunnel {
	remoteHost: string;
	remotePort: number;
	localAddress: string;
	localPort?: number;
	name?: string;
	closeable?: boolean;
	privacy: TunnelPrivacy;
	runningProcess: string | undefined;
	pid: number | undefined;
	source?: string;
	restore: boolean;
}

export function makeAddress(host: string, port: number): string {
	return host + ':' + port;
}

export function parseAddress(address: string): { host: string, port: number } | undefined {
	const matches = address.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\:|localhost:|[a-zA-Z]+:)?([0-9]+)$/);
	if (!matches) {
		return undefined;
	}
	return { host: matches[1]?.substring(0, matches[1].length - 1) || 'localhost', port: Number(matches[2]) };
}

export function mapHasAddress<T>(map: Map<string, T>, host: string, port: number): T | undefined {
	const initialAddress = map.get(makeAddress(host, port));
	if (initialAddress) {
		return initialAddress;
	}

	if (isLocalhost(host)) {
		// Do localhost checks
		for (const testHost of LOCALHOST_ADDRESSES) {
			const testAddress = makeAddress(testHost, port);
			if (map.has(testAddress)) {
				return map.get(testAddress);
			}
		}
	} else if (isAllInterfaces(host)) {
		// Do all interfaces checks
		for (const testHost of ALL_INTERFACES_ADDRESSES) {
			const testAddress = makeAddress(testHost, port);
			if (map.has(testAddress)) {
				return map.get(testAddress);
			}
		}
	}

	return undefined;
}

export function mapHasAddressLocalhostOrAllInterfaces<T>(map: Map<string, T>, host: string, port: number): T | undefined {
	const originalAddress = mapHasAddress(map, host, port);
	if (originalAddress) {
		return originalAddress;
	}
	const otherHost = isAllInterfaces(host) ? 'localhost' : (isLocalhost(host) ? '0.0.0.0' : undefined);
	if (otherHost) {
		return mapHasAddress(map, otherHost, port);
	}
	return undefined;
}

export enum OnPortForward {
	Notify = 'notify',
	OpenBrowser = 'openBrowser',
	OpenPreview = 'openPreview',
	Silent = 'silent',
	Ignore = 'ignore'
}

interface Attributes {
	label: string | undefined;
	onAutoForward: OnPortForward | undefined,
	elevateIfNeeded: boolean | undefined;
}

interface PortAttributes extends Attributes {
	port: number | { start: number, end: number };
}

export class PortsAttributes extends Disposable {
	private static SETTING = 'remote.portsAttributes';
	private static RANGE = /^(\d+)\-(\d+)$/;
	private portsAttributes: PortAttributes[] = [];
	private _onDidChangeAttributes = new Emitter<void>();
	public readonly onDidChangeAttributes = this._onDidChangeAttributes.event;

	constructor(private readonly configurationService: IConfigurationService) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PortsAttributes.SETTING)) {
				this.updateAttributes();
			}
		}));
		this.updateAttributes();
	}

	private updateAttributes() {
		this.portsAttributes = this.readSetting();
		this._onDidChangeAttributes.fire();
	}

	getAttributes(port: number): Attributes | undefined {
		let index = this.findNextIndex(port, this.portsAttributes, 0);
		const attributes: Attributes = {
			label: undefined,
			onAutoForward: undefined,
			elevateIfNeeded: undefined
		};
		while (index >= 0) {
			const found = this.portsAttributes[index];
			if (found.port === port) {
				attributes.onAutoForward = found.onAutoForward ?? attributes.onAutoForward;
				attributes.elevateIfNeeded = (found.elevateIfNeeded !== undefined) ? found.elevateIfNeeded : attributes.elevateIfNeeded;
				attributes.label = found.label ?? attributes.label;
			} else {
				// It's a range, which means that if the attribute is already set, we keep it
				attributes.onAutoForward = attributes.onAutoForward ?? found.onAutoForward;
				attributes.elevateIfNeeded = (attributes.elevateIfNeeded !== undefined) ? attributes.elevateIfNeeded : found.elevateIfNeeded;
				attributes.label = attributes.label ?? found.label;
			}
			index = this.findNextIndex(port, this.portsAttributes, index + 1);
		}
		if (attributes.onAutoForward !== undefined || attributes.elevateIfNeeded !== undefined || attributes.label !== undefined) {
			return attributes;
		}
		return undefined;
	}

	private findNextIndex(port: number, attributes: PortAttributes[], fromIndex: number): number {
		if (fromIndex >= attributes.length) {
			return -1;
		}
		const sliced = attributes.slice(fromIndex);
		const foundIndex = sliced.findIndex((value) => {
			return isNumber(value.port) ? (value.port === port) : (port >= value.port.start && port <= value.port.end);
		});
		return foundIndex >= 0 ? foundIndex + fromIndex : -1;
	}

	private readSetting(): PortAttributes[] {
		const settingValue = this.configurationService.getValue(PortsAttributes.SETTING);
		if (!settingValue || !isObject(settingValue)) {
			return [];
		}

		const attributes: PortAttributes[] = [];
		for (let portNumber in settingValue) {
			const setting = (<any>settingValue)[portNumber];
			let port: number | { start: number, end: number } | undefined = undefined;
			if (portNumber !== undefined) {
				if (Number(portNumber)) {
					port = Number(portNumber);
				} else if (isString(portNumber) && PortsAttributes.RANGE.test(portNumber)) {
					const match = (<string>portNumber).match(PortsAttributes.RANGE);
					port = { start: Number(match![1]), end: Number(match![2]) };
				}
			}
			if (!port) {
				continue;
			}
			attributes.push({
				port,
				elevateIfNeeded: setting.elevateIfPrivileged,
				onAutoForward: setting.onAutoForward,
				label: setting.label
			});
		}
		attributes.sort((a, b) => {
			return (isNumber(a.port) ? a.port : a.port.start) - (isNumber(b.port) ? b.port : b.port.start);
		});
		return attributes;
	}
}

export class TunnelModel extends Disposable {
	readonly forwarded: Map<string, Tunnel>;
	readonly detected: Map<string, Tunnel>;
	private remoteTunnels: Map<string, RemoteTunnel>;
	private _onForwardPort: Emitter<Tunnel | void> = new Emitter();
	public onForwardPort: Event<Tunnel | void> = this._onForwardPort.event;
	private _onClosePort: Emitter<{ host: string, port: number }> = new Emitter();
	public onClosePort: Event<{ host: string, port: number }> = this._onClosePort.event;
	private _onPortName: Emitter<{ host: string, port: number }> = new Emitter();
	public onPortName: Event<{ host: string, port: number }> = this._onPortName.event;
	private _candidates: Map<string, CandidatePort> | undefined;
	private _onCandidatesChanged: Emitter<Map<string, { host: string, port: number }>> = new Emitter();
	// onCandidateChanged returns the removed candidates
	public onCandidatesChanged: Event<Map<string, { host: string, port: number }>> = this._onCandidatesChanged.event;
	private _candidateFilter: ((candidates: CandidatePort[]) => Promise<CandidatePort[]>) | undefined;
	private tunnelRestoreValue: Promise<string | undefined>;
	private _onEnvironmentTunnelsSet: Emitter<void> = new Emitter();
	public onEnvironmentTunnelsSet: Event<void> = this._onEnvironmentTunnelsSet.event;
	private _environmentTunnelsSet: boolean = false;
	private portsAttributes: PortsAttributes;

	constructor(
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();
		this.portsAttributes = new PortsAttributes(configurationService);
		this.tunnelRestoreValue = this.getTunnelRestoreValue();
		this.forwarded = new Map();
		this.remoteTunnels = new Map();
		this.tunnelService.tunnels.then(tunnels => {
			tunnels.forEach(tunnel => {
				if (tunnel.localAddress) {
					const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
					const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
					this.forwarded.set(key, {
						remotePort: tunnel.tunnelRemotePort,
						remoteHost: tunnel.tunnelRemoteHost,
						localAddress: tunnel.localAddress,
						localPort: tunnel.tunnelLocalPort,
						runningProcess: matchingCandidate?.detail,
						pid: matchingCandidate?.pid,
						privacy: this.makeTunnelPrivacy(tunnel.public),
						restore: true
					});
					this.remoteTunnels.set(key, tunnel);
				}
			});
		});

		this.detected = new Map();
		this._register(this.tunnelService.onTunnelOpened(async (tunnel) => {
			const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
			if ((!this.forwarded.has(key)) && tunnel.localAddress) {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
				this.forwarded.set(key, {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localAddress: tunnel.localAddress,
					localPort: tunnel.tunnelLocalPort,
					closeable: true,
					runningProcess: matchingCandidate?.detail,
					pid: matchingCandidate?.pid,
					privacy: this.makeTunnelPrivacy(tunnel.public),
					restore: true
				});
			}
			await this.storeForwarded();
			this.remoteTunnels.set(key, tunnel);
			this._onForwardPort.fire(this.forwarded.get(key)!);
		}));
		this._register(this.tunnelService.onTunnelClosed(async (address) => {
			const key = makeAddress(address.host, address.port);
			if (this.forwarded.has(key)) {
				this.forwarded.delete(key);
				await this.storeForwarded();
				this._onClosePort.fire(address);
			}
		}));

		this._register(this.portsAttributes.onDidChangeAttributes(this.updateAttributes, this));
	}

	private makeTunnelPrivacy(isPublic: boolean) {
		return isPublic ? TunnelPrivacy.Public : this.tunnelService.canMakePublic ? TunnelPrivacy.Private : TunnelPrivacy.ConstantPrivate;
	}

	private async getStorageKey(): Promise<string> {
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceHash = workspace.configuration ? hash(workspace.configuration.path) : (workspace.folders.length > 0 ? hash(workspace.folders[0].uri.path) : undefined);
		return `${TUNNELS_TO_RESTORE}.${this.environmentService.remoteAuthority}.${workspaceHash}`;
	}

	private async getTunnelRestoreValue(): Promise<string | undefined> {
		const deprecatedValue = this.storageService.get(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
		if (deprecatedValue) {
			this.storageService.remove(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
			await this.storeForwarded();
			return deprecatedValue;
		}

		return this.storageService.get(await this.getStorageKey(), StorageScope.GLOBAL);
	}

	async restoreForwarded() {
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			const tunnelRestoreValue = await this.tunnelRestoreValue;
			if (tunnelRestoreValue) {
				const tunnels = <Tunnel[] | undefined>JSON.parse(tunnelRestoreValue) ?? [];
				for (let tunnel of tunnels) {
					if (!mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.remoteHost, tunnel.remotePort)) {
						await this.forward({ host: tunnel.remoteHost, port: tunnel.remotePort }, tunnel.localPort, tunnel.name, undefined, undefined, tunnel.privacy === TunnelPrivacy.Public);
					}
				}
			} else {
				// It's possible that at restore time the value hasn't synced.
				const key = await this.getStorageKey();
				const listener = this.storageService.onDidChangeValue(async (e) => {
					if (e.key === key) {
						listener.dispose();
						this.tunnelRestoreValue = Promise.resolve(this.storageService.get(await this.getStorageKey(), StorageScope.GLOBAL));
						await this.restoreForwarded();
					}
				});
			}
		}
	}

	private async storeForwarded() {
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			this.storageService.store(await this.getStorageKey(), JSON.stringify(Array.from(this.forwarded.values()).filter(value => value.restore)), StorageScope.GLOBAL, StorageTarget.USER);
		}
	}

	async forward(remote: { host: string, port: number }, local?: number, name?: string, source?: string, elevateIfNeeded?: boolean, isPublic?: boolean, restore: boolean = true): Promise<RemoteTunnel | void> {
		const existingTunnel = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, remote.host, remote.port);
		if (!existingTunnel) {
			const authority = this.environmentService.remoteAuthority;
			const addressProvider: IAddressProvider | undefined = authority ? {
				getAddress: async () => { return (await this.remoteAuthorityResolverService.resolveAuthority(authority)).authority; }
			} : undefined;

			const attributes = this.portsAttributes.getAttributes(local !== undefined ? local : remote.port);

			const tunnel = await this.tunnelService.openTunnel(addressProvider, remote.host, remote.port, local, (!elevateIfNeeded) ? attributes?.elevateIfNeeded : elevateIfNeeded, isPublic);
			if (tunnel && tunnel.localAddress) {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), remote.host, remote.port);
				const newForward: Tunnel = {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localPort: tunnel.tunnelLocalPort,
					name: name ?? attributes?.label,
					closeable: true,
					localAddress: tunnel.localAddress,
					runningProcess: matchingCandidate?.detail,
					pid: matchingCandidate?.pid,
					source,
					privacy: this.makeTunnelPrivacy(tunnel.public),
					restore
				};
				const key = makeAddress(remote.host, remote.port);
				this.forwarded.set(key, newForward);
				this.remoteTunnels.set(key, tunnel);
				await this.storeForwarded();
				this._onForwardPort.fire(newForward);
				return tunnel;
			}
		} else {
			if (name) {
				existingTunnel.name = name;
			}
			this._onForwardPort.fire();
			return mapHasAddressLocalhostOrAllInterfaces(this.remoteTunnels, remote.host, remote.port);
		}
	}

	async name(host: string, port: number, name: string) {
		const existingForwarded = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, host, port);
		const key = makeAddress(host, port);
		if (existingForwarded) {
			existingForwarded.name = name;
			await this.storeForwarded();
			this._onPortName.fire({ host, port });
			return;
		} else if (this.detected.has(key)) {
			this.detected.get(key)!.name = name;
			this._onPortName.fire({ host, port });
		}
	}

	async close(host: string, port: number): Promise<void> {
		return this.tunnelService.closeTunnel(host, port);
	}

	address(host: string, port: number): string | undefined {
		const key = makeAddress(host, port);
		return (this.forwarded.get(key) || this.detected.get(key))?.localAddress;
	}

	public get environmentTunnelsSet(): boolean {
		return this._environmentTunnelsSet;
	}

	addEnvironmentTunnels(tunnels: TunnelDescription[] | undefined): void {
		if (tunnels) {
			tunnels.forEach(tunnel => {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.remoteAddress.host, tunnel.remoteAddress.port);
				this.detected.set(makeAddress(tunnel.remoteAddress.host, tunnel.remoteAddress.port), {
					remoteHost: tunnel.remoteAddress.host,
					remotePort: tunnel.remoteAddress.port,
					localAddress: typeof tunnel.localAddress === 'string' ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port),
					closeable: false,
					runningProcess: matchingCandidate?.detail,
					pid: matchingCandidate?.pid,
					privacy: TunnelPrivacy.ConstantPrivate,
					restore: false
				});
			});
		}
		this._environmentTunnelsSet = true;
		this._onEnvironmentTunnelsSet.fire();
		this._onForwardPort.fire();
	}

	setCandidateFilter(filter: ((candidates: CandidatePort[]) => Promise<CandidatePort[]>) | undefined): void {
		this._candidateFilter = filter;
	}

	async setCandidates(candidates: CandidatePort[]) {
		let processedCandidates = candidates;
		if (this._candidateFilter) {
			// When an extension provides a filter, we do the filtering on the extension host before the candidates are set here.
			// However, when the filter doesn't come from an extension we filter here.
			processedCandidates = await this._candidateFilter(candidates);
		}
		const removedCandidates = this.updateInResponseToCandidates(processedCandidates);
		this._onCandidatesChanged.fire(removedCandidates);
	}

	// Returns removed candidates
	private updateInResponseToCandidates(candidates: CandidatePort[]): Map<string, { host: string, port: number }> {
		const removedCandidates = this._candidates ?? new Map();
		const candidatesMap = new Map();
		this._candidates = candidatesMap;
		candidates.forEach(value => {
			const addressKey = makeAddress(value.host, value.port);
			candidatesMap.set(addressKey, {
				host: value.host,
				port: value.port,
				detail: value.detail,
				pid: value.pid
			});
			if (removedCandidates.has(addressKey)) {
				removedCandidates.delete(addressKey);
			}
			const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, value.host, value.port);
			if (forwardedValue) {
				forwardedValue.runningProcess = value.detail;
				forwardedValue.pid = value.pid;
			}
		});
		removedCandidates.forEach((_value, key) => {
			const parsedAddress = parseAddress(key);
			if (!parsedAddress) {
				return;
			}
			const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, parsedAddress.host, parsedAddress.port);
			if (forwardedValue) {
				forwardedValue.runningProcess = undefined;
				forwardedValue.pid = undefined;
			}
			const detectedValue = mapHasAddressLocalhostOrAllInterfaces(this.detected, parsedAddress.host, parsedAddress.port);
			if (detectedValue) {
				detectedValue.runningProcess = undefined;
				detectedValue.pid = undefined;
			}
		});
		return removedCandidates;
	}

	get candidates(): CandidatePort[] {
		return this._candidates ? Array.from(this._candidates.values()) : [];
	}

	get candidatesOrUndefined(): CandidatePort[] | undefined {
		return this._candidates ? this.candidates : undefined;
	}

	private async updateAttributes() {
		// If the label changes in the attributes, we should update it.
		for (let forwarded of this.forwarded.values()) {
			const attributes = this.portsAttributes.getAttributes(forwarded.remotePort);
			if (attributes && attributes.label && attributes.label !== forwarded.name) {
				await this.name(forwarded.remoteHost, forwarded.remotePort, attributes.label);
			}
		}
	}
}

export interface CandidatePort {
	host: string;
	port: number;
	detail: string;
	pid: number;
}

export interface IRemoteExplorerService {
	readonly _serviceBrand: undefined;
	onDidChangeTargetType: Event<string[]>;
	targetType: string[];
	readonly tunnelModel: TunnelModel;
	onDidChangeEditable: Event<ITunnelItem | undefined>;
	setEditable(tunnelItem: ITunnelItem | undefined, data: IEditableData | null): void;
	getEditableData(tunnelItem: ITunnelItem | undefined): IEditableData | undefined;
	forward(remote: { host: string, port: number }, localPort?: number, name?: string, source?: string, elevateIfNeeded?: boolean, isPublic?: boolean, restore?: boolean): Promise<RemoteTunnel | void>;
	close(remote: { host: string, port: number }): Promise<void>;
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
	private _editable: { tunnelItem: ITunnelItem | undefined, data: IEditableData } | undefined;
	private readonly _onDidChangeEditable: Emitter<ITunnelItem | undefined> = new Emitter();
	public readonly onDidChangeEditable: Event<ITunnelItem | undefined> = this._onDidChangeEditable.event;
	private readonly _onEnabledPortsFeatures: Emitter<void> = new Emitter();
	public readonly onEnabledPortsFeatures: Event<void> = this._onEnabledPortsFeatures.event;
	private _portsFeaturesEnabled: boolean = false;
	public readonly namedProcesses = new Map<number, string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelService tunnelService: ITunnelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		this._tunnelModel = new TunnelModel(tunnelService, storageService, configurationService, environmentService, remoteAuthorityResolverService, workspaceContextService);
	}

	set targetType(name: string[]) {
		// Can just compare the first element of the array since there are no target overlaps
		const current: string = this._targetType.length > 0 ? this._targetType[0] : '';
		const newName: string = name.length > 0 ? name[0] : '';
		if (current !== newName) {
			this._targetType = name;
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), StorageScope.WORKSPACE, StorageTarget.USER);
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), StorageScope.GLOBAL, StorageTarget.USER);
			this._onDidChangeTargetType.fire(this._targetType);
		}
	}
	get targetType(): string[] {
		return this._targetType;
	}

	get tunnelModel(): TunnelModel {
		return this._tunnelModel;
	}

	forward(remote: { host: string, port: number }, local?: number, name?: string, source?: string, elevateIfNeeded?: boolean, isPublic?: boolean, restore?: boolean): Promise<RemoteTunnel | void> {
		return this.tunnelModel.forward(remote, local, name, source, elevateIfNeeded, isPublic, restore);
	}

	close(remote: { host: string, port: number }): Promise<void> {
		return this.tunnelModel.close(remote.host, remote.port);
	}

	setTunnelInformation(tunnelInformation: TunnelInformation | undefined): void {
		this.tunnelModel.addEnvironmentTunnels(tunnelInformation?.environmentTunnels);
	}

	setEditable(tunnelItem: ITunnelItem | undefined, data: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { tunnelItem, data };
		}
		this._onDidChangeEditable.fire(tunnelItem);
	}

	getEditableData(tunnelItem: ITunnelItem | undefined): IEditableData | undefined {
		return (this._editable &&
			((!tunnelItem && (tunnelItem === this._editable.tunnelItem)) ||
				(tunnelItem && (this._editable.tunnelItem?.remotePort === tunnelItem.remotePort) && (this._editable.tunnelItem.remoteHost === tunnelItem.remoteHost)))) ?
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

registerSingleton(IRemoteExplorerService, RemoteExplorerService, true);
