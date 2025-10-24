/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { debounce } from '../../../../base/common/decorators.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAddressProvider } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService, TunnelDescription } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { RemoteTunnel, ITunnelService, TunnelProtocol, TunnelPrivacyId, LOCALHOST_ADDRESSES, ProvidedPortAttributes, PortAttributesProvider, isLocalhost, isAllInterfaces, ProvidedOnAutoForward, ALL_INTERFACES_ADDRESSES } from '../../../../platform/tunnel/common/tunnel.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isNumber, isObject, isString } from '../../../../base/common/types.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

const MISMATCH_LOCAL_PORT_COOLDOWN = 10 * 1000; // 10 seconds
const TUNNELS_TO_RESTORE = 'remote.tunnels.toRestore';
const TUNNELS_TO_RESTORE_EXPIRATION = 'remote.tunnels.toRestoreExpiration';
const RESTORE_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 14; // 2 weeks
export const ACTIVATION_EVENT = 'onTunnel';
export const forwardedPortsFeaturesEnabled = new RawContextKey<boolean>('forwardedPortsViewEnabled', false, nls.localize('tunnel.forwardedPortsViewEnabled', "Whether the Ports view is enabled."));
export const forwardedPortsViewEnabled = new RawContextKey<boolean>('forwardedPortsViewOnlyEnabled', false, nls.localize('tunnel.forwardedPortsViewEnabled', "Whether the Ports view is enabled."));

export interface RestorableTunnel {
	remoteHost: string;
	remotePort: number;
	localAddress: string;
	localUri: URI;
	protocol: TunnelProtocol;
	localPort?: number;
	name?: string;
	source: {
		source: TunnelSource;
		description: string;
	};
}

export interface Tunnel {
	remoteHost: string;
	remotePort: number;
	localAddress: string;
	localUri: URI;
	protocol: TunnelProtocol;
	localPort?: number;
	name?: string;
	closeable?: boolean;
	privacy: TunnelPrivacyId | string;
	runningProcess: string | undefined;
	hasRunningProcess?: boolean;
	pid: number | undefined;
	source: {
		source: TunnelSource;
		description: string;
	};
}

export function parseAddress(address: string): { host: string; port: number } | undefined {
	const matches = address.match(/^([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*:)?([0-9]+)$/);
	if (!matches) {
		return undefined;
	}
	return { host: matches[1]?.substring(0, matches[1].length - 1) || 'localhost', port: Number(matches[2]) };
}

export enum TunnelCloseReason {
	Other = 'Other',
	User = 'User',
	AutoForwardEnd = 'AutoForwardEnd',
}

export enum TunnelSource {
	User,
	Auto,
	Extension
}

export const UserTunnelSource = {
	source: TunnelSource.User,
	description: nls.localize('tunnel.source.user', "User Forwarded")
};
export const AutoTunnelSource = {
	source: TunnelSource.Auto,
	description: nls.localize('tunnel.source.auto', "Auto Forwarded")
};

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


export function makeAddress(host: string, port: number): string {
	return host + ':' + port;
}

export interface TunnelProperties {
	remote: { host: string; port: number };
	local?: number;
	name?: string;
	source?: {
		source: TunnelSource;
		description: string;
	};
	elevateIfNeeded?: boolean;
	privacy?: string;
}

export interface CandidatePort {
	host: string;
	port: number;
	detail?: string;
	pid?: number;
}

interface PortAttributes extends Attributes {
	key: number | PortRange | RegExp | HostAndPort;
}

export enum OnPortForward {
	Notify = 'notify',
	OpenBrowser = 'openBrowser',
	OpenBrowserOnce = 'openBrowserOnce',
	OpenPreview = 'openPreview',
	Silent = 'silent',
	Ignore = 'ignore'
}

export interface Attributes {
	label: string | undefined;
	onAutoForward: OnPortForward | undefined;
	elevateIfNeeded: boolean | undefined;
	requireLocalPort: boolean | undefined;
	protocol: TunnelProtocol | undefined;
}

interface PortRange { start: number; end: number }

interface HostAndPort { host: string; port: number }

export function isCandidatePort(candidate: any): candidate is CandidatePort {
	return candidate && 'host' in candidate && typeof candidate.host === 'string'
		&& 'port' in candidate && typeof candidate.port === 'number'
		&& (!('detail' in candidate) || typeof candidate.detail === 'string')
		&& (!('pid' in candidate) || typeof candidate.pid === 'string');
}

export class PortsAttributes extends Disposable {
	private static SETTING = 'remote.portsAttributes';
	private static DEFAULTS = 'remote.otherPortsAttributes';
	private static RANGE = /^(\d+)\-(\d+)$/;
	private static HOST_AND_PORT = /^([a-z0-9\-]+):(\d{1,5})$/;
	private portsAttributes: PortAttributes[] = [];
	private defaultPortAttributes: Attributes | undefined;
	private _onDidChangeAttributes = new Emitter<void>();
	public readonly onDidChangeAttributes = this._onDidChangeAttributes.event;

	constructor(private readonly configurationService: IConfigurationService) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PortsAttributes.SETTING) || e.affectsConfiguration(PortsAttributes.DEFAULTS)) {
				this.updateAttributes();
			}
		}));
		this.updateAttributes();
	}

	private updateAttributes() {
		this.portsAttributes = this.readSetting();
		this._onDidChangeAttributes.fire();
	}

	getAttributes(port: number, host: string, commandLine?: string): Attributes | undefined {
		let index = this.findNextIndex(port, host, commandLine, this.portsAttributes, 0);
		const attributes: Attributes = {
			label: undefined,
			onAutoForward: undefined,
			elevateIfNeeded: undefined,
			requireLocalPort: undefined,
			protocol: undefined
		};
		while (index >= 0) {
			const found = this.portsAttributes[index];
			if (found.key === port) {
				attributes.onAutoForward = found.onAutoForward ?? attributes.onAutoForward;
				attributes.elevateIfNeeded = (found.elevateIfNeeded !== undefined) ? found.elevateIfNeeded : attributes.elevateIfNeeded;
				attributes.label = found.label ?? attributes.label;
				attributes.requireLocalPort = found.requireLocalPort;
				attributes.protocol = found.protocol;
			} else {
				// It's a range or regex, which means that if the attribute is already set, we keep it
				attributes.onAutoForward = attributes.onAutoForward ?? found.onAutoForward;
				attributes.elevateIfNeeded = (attributes.elevateIfNeeded !== undefined) ? attributes.elevateIfNeeded : found.elevateIfNeeded;
				attributes.label = attributes.label ?? found.label;
				attributes.requireLocalPort = (attributes.requireLocalPort !== undefined) ? attributes.requireLocalPort : undefined;
				attributes.protocol = attributes.protocol ?? found.protocol;
			}
			index = this.findNextIndex(port, host, commandLine, this.portsAttributes, index + 1);
		}
		if (attributes.onAutoForward !== undefined || attributes.elevateIfNeeded !== undefined
			|| attributes.label !== undefined || attributes.requireLocalPort !== undefined
			|| attributes.protocol !== undefined) {
			return attributes;
		}

		// If we find no matches, then use the other port attributes.
		return this.getOtherAttributes();
	}

	private hasStartEnd(value: number | PortRange | RegExp | HostAndPort): value is PortRange {
		return (value as Partial<PortRange>).start !== undefined && (value as Partial<PortRange>).end !== undefined;
	}

	private hasHostAndPort(value: number | PortRange | RegExp | HostAndPort): value is HostAndPort {
		return ((value as Partial<HostAndPort>).host !== undefined) && ((value as Partial<HostAndPort>).port !== undefined)
			&& isString((value as Partial<HostAndPort>).host) && isNumber((value as Partial<HostAndPort>).port);
	}

	private findNextIndex(port: number, host: string, commandLine: string | undefined, attributes: PortAttributes[], fromIndex: number): number {
		if (fromIndex >= attributes.length) {
			return -1;
		}
		const shouldUseHost = !isLocalhost(host) && !isAllInterfaces(host);
		const sliced = attributes.slice(fromIndex);
		const foundIndex = sliced.findIndex((value) => {
			if (isNumber(value.key)) {
				return shouldUseHost ? false : value.key === port;
			} else if (this.hasStartEnd(value.key)) {
				return shouldUseHost ? false : (port >= value.key.start && port <= value.key.end);
			} else if (this.hasHostAndPort(value.key)) {
				return (port === value.key.port) && (host === value.key.host);
			} else {
				return commandLine ? value.key.test(commandLine) : false;
			}

		});
		return foundIndex >= 0 ? foundIndex + fromIndex : -1;
	}

	private readSetting(): PortAttributes[] {
		const settingValue = this.configurationService.getValue(PortsAttributes.SETTING);
		if (!settingValue || !isObject(settingValue)) {
			return [];
		}

		const attributes: PortAttributes[] = [];
		for (const attributesKey in settingValue) {
			if (attributesKey === undefined) {
				continue;
			}
			const setting = (settingValue as Record<string, PortAttributes>)[attributesKey];
			let key: number | PortRange | RegExp | HostAndPort | undefined = undefined;
			if (Number(attributesKey)) {
				key = Number(attributesKey);
			} else if (isString(attributesKey)) {
				if (PortsAttributes.RANGE.test(attributesKey)) {
					const match = attributesKey.match(PortsAttributes.RANGE);
					key = { start: Number(match![1]), end: Number(match![2]) };
				} else if (PortsAttributes.HOST_AND_PORT.test(attributesKey)) {
					const match = attributesKey.match(PortsAttributes.HOST_AND_PORT);
					key = { host: match![1], port: Number(match![2]) };
				} else {
					let regTest: RegExp | undefined = undefined;
					try {
						regTest = RegExp(attributesKey);
					} catch (e) {
						// The user entered an invalid regular expression.
					}
					if (regTest) {
						key = regTest;
					}
				}
			}
			if (!key) {
				continue;
			}
			attributes.push({
				key: key,
				elevateIfNeeded: setting.elevateIfNeeded,
				onAutoForward: setting.onAutoForward,
				label: setting.label,
				requireLocalPort: setting.requireLocalPort,
				protocol: setting.protocol
			});
		}

		const defaults = this.configurationService.getValue(PortsAttributes.DEFAULTS) as Partial<Attributes> | undefined;
		if (defaults) {
			this.defaultPortAttributes = {
				elevateIfNeeded: defaults.elevateIfNeeded,
				label: defaults.label,
				onAutoForward: defaults.onAutoForward,
				requireLocalPort: defaults.requireLocalPort,
				protocol: defaults.protocol
			};
		}

		return this.sortAttributes(attributes);
	}

	private sortAttributes(attributes: PortAttributes[]): PortAttributes[] {
		function getVal(item: PortAttributes, thisRef: PortsAttributes) {
			if (isNumber(item.key)) {
				return item.key;
			} else if (thisRef.hasStartEnd(item.key)) {
				return item.key.start;
			} else if (thisRef.hasHostAndPort(item.key)) {
				return item.key.port;
			} else {
				return Number.MAX_VALUE;
			}
		}

		return attributes.sort((a, b) => {
			return getVal(a, this) - getVal(b, this);
		});
	}

	private getOtherAttributes() {
		return this.defaultPortAttributes;
	}

	static providedActionToAction(providedAction: ProvidedOnAutoForward | undefined) {
		switch (providedAction) {
			case ProvidedOnAutoForward.Notify: return OnPortForward.Notify;
			case ProvidedOnAutoForward.OpenBrowser: return OnPortForward.OpenBrowser;
			case ProvidedOnAutoForward.OpenBrowserOnce: return OnPortForward.OpenBrowserOnce;
			case ProvidedOnAutoForward.OpenPreview: return OnPortForward.OpenPreview;
			case ProvidedOnAutoForward.Silent: return OnPortForward.Silent;
			case ProvidedOnAutoForward.Ignore: return OnPortForward.Ignore;
			default: return undefined;
		}
	}

	public async addAttributes(port: number, attributes: Partial<Attributes>, target: ConfigurationTarget) {
		const settingValue = this.configurationService.inspect(PortsAttributes.SETTING);
		const remoteValue: any = settingValue.userRemoteValue;
		let newRemoteValue: any;
		if (!remoteValue || !isObject(remoteValue)) {
			newRemoteValue = {};
		} else {
			newRemoteValue = deepClone(remoteValue);
		}

		if (!newRemoteValue[`${port}`]) {
			newRemoteValue[`${port}`] = {};
		}
		for (const attribute in attributes) {
			newRemoteValue[`${port}`][attribute] = (attributes as Record<string, unknown>)[attribute];
		}

		return this.configurationService.updateValue(PortsAttributes.SETTING, newRemoteValue, target);
	}
}

export class TunnelModel extends Disposable {
	readonly forwarded: Map<string, Tunnel>;
	private readonly inProgress: Map<string, true> = new Map();
	readonly detected: Map<string, Tunnel>;
	private remoteTunnels: Map<string, RemoteTunnel>;
	private _onForwardPort: Emitter<Tunnel | void> = new Emitter();
	public onForwardPort: Event<Tunnel | void> = this._onForwardPort.event;
	private _onClosePort: Emitter<{ host: string; port: number }> = new Emitter();
	public onClosePort: Event<{ host: string; port: number }> = this._onClosePort.event;
	private _onPortName: Emitter<{ host: string; port: number }> = new Emitter();
	public onPortName: Event<{ host: string; port: number }> = this._onPortName.event;
	private _candidates: Map<string, CandidatePort> | undefined;
	private _onCandidatesChanged: Emitter<Map<string, { host: string; port: number }>> = new Emitter();
	// onCandidateChanged returns the removed candidates
	public onCandidatesChanged: Event<Map<string, { host: string; port: number }>> = this._onCandidatesChanged.event;
	private _candidateFilter: ((candidates: CandidatePort[]) => Promise<CandidatePort[]>) | undefined;
	private tunnelRestoreValue: Promise<string | undefined>;
	private _onEnvironmentTunnelsSet: Emitter<void> = new Emitter();
	public onEnvironmentTunnelsSet: Event<void> = this._onEnvironmentTunnelsSet.event;
	private _environmentTunnelsSet: boolean = false;
	public readonly configPortsAttributes: PortsAttributes;
	private restoreListener: DisposableStore | undefined = undefined;
	private knownPortsRestoreValue: string | undefined;
	private restoreComplete = false;
	private onRestoreComplete: Emitter<void> = new Emitter();
	private unrestoredExtensionTunnels: Map<string, RestorableTunnel> = new Map();
	private sessionCachedProperties: Map<string, Partial<TunnelProperties>> = new Map();

	private portAttributesProviders: PortAttributesProvider[] = [];

	constructor(
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.configPortsAttributes = new PortsAttributes(configurationService);
		this.tunnelRestoreValue = this.getTunnelRestoreValue();
		this._register(this.configPortsAttributes.onDidChangeAttributes(this.updateAttributes, this));
		this.forwarded = new Map();
		this.remoteTunnels = new Map();
		this.tunnelService.tunnels.then(async (tunnels) => {
			const attributes = await this.getAttributes(tunnels.map(tunnel => {
				return { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost };
			}));
			for (const tunnel of tunnels) {
				if (tunnel.localAddress) {
					const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
					const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
					this.forwarded.set(key, {
						remotePort: tunnel.tunnelRemotePort,
						remoteHost: tunnel.tunnelRemoteHost,
						localAddress: tunnel.localAddress,
						protocol: attributes?.get(tunnel.tunnelRemotePort)?.protocol ?? TunnelProtocol.Http,
						localUri: await this.makeLocalUri(tunnel.localAddress, attributes?.get(tunnel.tunnelRemotePort)),
						localPort: tunnel.tunnelLocalPort,
						name: attributes?.get(tunnel.tunnelRemotePort)?.label,
						runningProcess: matchingCandidate?.detail,
						hasRunningProcess: !!matchingCandidate,
						pid: matchingCandidate?.pid,
						privacy: tunnel.privacy,
						source: UserTunnelSource,
					});
					this.remoteTunnels.set(key, tunnel);
				}
			}
		});

		this.detected = new Map();
		this._register(this.tunnelService.onTunnelOpened(async (tunnel) => {
			const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
			if (!mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort)
				&& !mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort)
				&& !mapHasAddressLocalhostOrAllInterfaces(this.inProgress, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort)
				&& tunnel.localAddress) {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
				const attributes = (await this.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]))?.get(tunnel.tunnelRemotePort);
				this.forwarded.set(key, {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localAddress: tunnel.localAddress,
					protocol: attributes?.protocol ?? TunnelProtocol.Http,
					localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
					localPort: tunnel.tunnelLocalPort,
					name: attributes?.label,
					closeable: true,
					runningProcess: matchingCandidate?.detail,
					hasRunningProcess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					privacy: tunnel.privacy,
					source: UserTunnelSource,
				});
			}
			await this.storeForwarded();
			this.checkExtensionActivationEvents(true);
			this.remoteTunnels.set(key, tunnel);
			this._onForwardPort.fire(this.forwarded.get(key)!);
		}));
		this._register(this.tunnelService.onTunnelClosed(address => {
			return this.onTunnelClosed(address, TunnelCloseReason.Other);
		}));
		this.checkExtensionActivationEvents(false);
	}

	private extensionHasActivationEvent() {
		if (this.extensionService.extensions.find(extension => extension.activationEvents?.includes(ACTIVATION_EVENT))) {
			this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
			return true;
		}
		return false;
	}

	private hasCheckedExtensionsOnTunnelOpened = false;
	private checkExtensionActivationEvents(tunnelOpened: boolean) {
		if (this.hasCheckedExtensionsOnTunnelOpened) {
			return;
		}
		if (tunnelOpened) {
			this.hasCheckedExtensionsOnTunnelOpened = true;
		}
		const hasRemote = this.environmentService.remoteAuthority !== undefined;
		if (hasRemote && !tunnelOpened) {
			// We don't activate extensions on startup if there is a remote
			return;
		}
		if (this.extensionHasActivationEvent()) {
			return;
		}

		const activationDisposable = this._register(this.extensionService.onDidRegisterExtensions(() => {
			if (this.extensionHasActivationEvent()) {
				activationDisposable.dispose();
			}
		}));
	}

	private async onTunnelClosed(address: { host: string; port: number }, reason: TunnelCloseReason) {
		const key = makeAddress(address.host, address.port);
		if (this.forwarded.has(key)) {
			this.forwarded.delete(key);
			await this.storeForwarded();
			this._onClosePort.fire(address);
		}
	}

	private makeLocalUri(localAddress: string, attributes?: Attributes) {
		if (localAddress.startsWith('http')) {
			return URI.parse(localAddress);
		}
		const protocol = attributes?.protocol ?? 'http';
		return URI.parse(`${protocol}://${localAddress}`);
	}

	private async addStorageKeyPostfix(prefix: string): Promise<string | undefined> {
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceHash = workspace.configuration ? hash(workspace.configuration.path) : (workspace.folders.length > 0 ? hash(workspace.folders[0].uri.path) : undefined);
		if (workspaceHash === undefined) {
			this.logService.debug('Could not get workspace hash for forwarded ports storage key.');
			return undefined;
		}
		return `${prefix}.${this.environmentService.remoteAuthority}.${workspaceHash}`;
	}

	private async getTunnelRestoreStorageKey(): Promise<string | undefined> {
		return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE);
	}

	private async getRestoreExpirationStorageKey(): Promise<string | undefined> {
		return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE_EXPIRATION);
	}

	private async getTunnelRestoreValue(): Promise<string | undefined> {
		const deprecatedValue = this.storageService.get(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
		if (deprecatedValue) {
			this.storageService.remove(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
			await this.storeForwarded();
			return deprecatedValue;
		}
		const storageKey = await this.getTunnelRestoreStorageKey();
		if (!storageKey) {
			return undefined;
		}
		return this.storageService.get(storageKey, StorageScope.PROFILE);
	}

	async restoreForwarded() {
		this.cleanupExpiredTunnelsForRestore();
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			const tunnelRestoreValue = await this.tunnelRestoreValue;
			if (tunnelRestoreValue && (tunnelRestoreValue !== this.knownPortsRestoreValue)) {
				const tunnels = <RestorableTunnel[] | undefined>JSON.parse(tunnelRestoreValue) ?? [];
				this.logService.trace(`ForwardedPorts: (TunnelModel) restoring ports ${tunnels.map(tunnel => tunnel.remotePort).join(', ')}`);
				for (const tunnel of tunnels) {
					const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.remoteHost, tunnel.remotePort);
					// Extension forwarded ports should only be updated, not restored.
					if ((tunnel.source.source !== TunnelSource.Extension && !alreadyForwarded) || (tunnel.source.source === TunnelSource.Extension && alreadyForwarded)) {
						await this.doForward({
							remote: { host: tunnel.remoteHost, port: tunnel.remotePort },
							local: tunnel.localPort,
							name: tunnel.name,
							elevateIfNeeded: true,
							source: tunnel.source
						});
					} else if (tunnel.source.source === TunnelSource.Extension && !alreadyForwarded) {
						this.unrestoredExtensionTunnels.set(makeAddress(tunnel.remoteHost, tunnel.remotePort), tunnel);
					}
				}
			}
		}

		this.restoreComplete = true;
		this.onRestoreComplete.fire();

		if (!this.restoreListener) {
			// It's possible that at restore time the value hasn't synced.
			const key = await this.getTunnelRestoreStorageKey();
			this.restoreListener = this._register(new DisposableStore());
			this.restoreListener.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this.restoreListener)(async (e) => {
				if (e.key === key) {
					this.tunnelRestoreValue = Promise.resolve(this.storageService.get(key, StorageScope.PROFILE));
					await this.restoreForwarded();
				}
			}));
		}
	}

	private cleanupExpiredTunnelsForRestore() {
		const keys = this.storageService.keys(StorageScope.PROFILE, StorageTarget.USER).filter(key => key.startsWith(TUNNELS_TO_RESTORE_EXPIRATION));
		for (const key of keys) {
			const expiration = this.storageService.getNumber(key, StorageScope.PROFILE);
			if (expiration && expiration < Date.now()) {
				this.tunnelRestoreValue = Promise.resolve(undefined);
				const storageKey = key.replace(TUNNELS_TO_RESTORE_EXPIRATION, TUNNELS_TO_RESTORE);
				this.storageService.remove(key, StorageScope.PROFILE);
				this.storageService.remove(storageKey, StorageScope.PROFILE);
			}
		}
	}

	@debounce(1000)
	private async storeForwarded() {
		if (this.configurationService.getValue('remote.restoreForwardedPorts')) {
			const forwarded = Array.from(this.forwarded.values());
			const restorableTunnels: RestorableTunnel[] = forwarded.map(tunnel => {
				return {
					remoteHost: tunnel.remoteHost,
					remotePort: tunnel.remotePort,
					localPort: tunnel.localPort,
					name: tunnel.name,
					localAddress: tunnel.localAddress,
					localUri: tunnel.localUri,
					protocol: tunnel.protocol,
					source: tunnel.source,
				};
			});
			let valueToStore: string | undefined;
			if (forwarded.length > 0) {
				valueToStore = JSON.stringify(restorableTunnels);
			}

			const key = await this.getTunnelRestoreStorageKey();
			const expirationKey = await this.getRestoreExpirationStorageKey();
			if (!valueToStore && key && expirationKey) {
				this.storageService.remove(key, StorageScope.PROFILE);
				this.storageService.remove(expirationKey, StorageScope.PROFILE);
			} else if ((valueToStore !== this.knownPortsRestoreValue) && key && expirationKey) {
				this.storageService.store(key, valueToStore, StorageScope.PROFILE, StorageTarget.USER);
				this.storageService.store(expirationKey, Date.now() + RESTORE_EXPIRATION_TIME, StorageScope.PROFILE, StorageTarget.USER);
			}
			this.knownPortsRestoreValue = valueToStore;
		}
	}

	private mismatchCooldown = new Date();
	private async showPortMismatchModalIfNeeded(tunnel: RemoteTunnel, expectedLocal: number, attributes: Attributes | undefined) {
		if (!tunnel.tunnelLocalPort || !attributes?.requireLocalPort) {
			return;
		}
		if (tunnel.tunnelLocalPort === expectedLocal) {
			return;
		}

		const newCooldown = new Date();
		if ((this.mismatchCooldown.getTime() + MISMATCH_LOCAL_PORT_COOLDOWN) > newCooldown.getTime()) {
			return;
		}
		this.mismatchCooldown = newCooldown;
		const mismatchString = nls.localize('remote.localPortMismatch.single', "Local port {0} could not be used for forwarding to remote port {1}.\n\nThis usually happens when there is already another process using local port {0}.\n\nPort number {2} has been used instead.",
			expectedLocal, tunnel.tunnelRemotePort, tunnel.tunnelLocalPort);
		return this.dialogService.info(mismatchString);
	}

	async forward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | string | undefined> {
		if (!this.restoreComplete && this.environmentService.remoteAuthority) {
			await Event.toPromise(this.onRestoreComplete.event);
		}
		return this.doForward(tunnelProperties, attributes);
	}

	private async doForward(tunnelProperties: TunnelProperties, attributes?: Attributes | null): Promise<RemoteTunnel | string | undefined> {
		await this.extensionService.activateByEvent(ACTIVATION_EVENT);

		const existingTunnel = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnelProperties.remote.host, tunnelProperties.remote.port);
		attributes = attributes ??
			((attributes !== null)
				? (await this.getAttributes([tunnelProperties.remote]))?.get(tunnelProperties.remote.port)
				: undefined);
		const localPort = (tunnelProperties.local !== undefined) ? tunnelProperties.local : tunnelProperties.remote.port;
		let noTunnelValue: string | undefined;
		if (!existingTunnel) {
			const authority = this.environmentService.remoteAuthority;
			const addressProvider: IAddressProvider | undefined = authority ? {
				getAddress: async () => { return (await this.remoteAuthorityResolverService.resolveAuthority(authority)).authority; }
			} : undefined;

			const key = makeAddress(tunnelProperties.remote.host, tunnelProperties.remote.port);
			this.inProgress.set(key, true);
			tunnelProperties = this.mergeCachedAndUnrestoredProperties(key, tunnelProperties);

			const tunnel = await this.tunnelService.openTunnel(addressProvider, tunnelProperties.remote.host, tunnelProperties.remote.port, undefined, localPort, (!tunnelProperties.elevateIfNeeded) ? attributes?.elevateIfNeeded : tunnelProperties.elevateIfNeeded, tunnelProperties.privacy, attributes?.protocol);
			if (typeof tunnel === 'string') {
				// There was an error  while creating the tunnel.
				noTunnelValue = tunnel;
			} else if (tunnel && tunnel.localAddress) {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces<CandidatePort>(this._candidates ?? new Map(), tunnelProperties.remote.host, tunnelProperties.remote.port);
				const protocol = (tunnel.protocol ?
					((tunnel.protocol === TunnelProtocol.Https) ? TunnelProtocol.Https : TunnelProtocol.Http)
					: (attributes?.protocol ?? TunnelProtocol.Http));
				const newForward: Tunnel = {
					remoteHost: tunnel.tunnelRemoteHost,
					remotePort: tunnel.tunnelRemotePort,
					localPort: tunnel.tunnelLocalPort,
					name: attributes?.label ?? tunnelProperties.name,
					closeable: true,
					localAddress: tunnel.localAddress,
					protocol,
					localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
					runningProcess: matchingCandidate?.detail,
					hasRunningProcess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					source: tunnelProperties.source ?? UserTunnelSource,
					privacy: tunnel.privacy,
				};
				this.forwarded.set(key, newForward);
				this.remoteTunnels.set(key, tunnel);
				this.inProgress.delete(key);
				await this.storeForwarded();
				await this.showPortMismatchModalIfNeeded(tunnel, localPort, attributes);
				this._onForwardPort.fire(newForward);
				return tunnel;
			}
			this.inProgress.delete(key);
		} else {
			return this.mergeAttributesIntoExistingTunnel(existingTunnel, tunnelProperties, attributes);
		}

		return noTunnelValue;
	}

	private mergeCachedAndUnrestoredProperties(key: string, tunnelProperties: TunnelProperties): TunnelProperties {
		const map = this.unrestoredExtensionTunnels.has(key) ? this.unrestoredExtensionTunnels : (this.sessionCachedProperties.has(key) ? this.sessionCachedProperties : undefined);
		if (map) {
			const updateProps = map.get(key)!;
			map.delete(key);
			if (updateProps) {
				tunnelProperties.name = updateProps.name ?? tunnelProperties.name;
				tunnelProperties.local = (('local' in updateProps) ? updateProps.local : (('localPort' in updateProps) ? updateProps.localPort : undefined)) ?? tunnelProperties.local;
				tunnelProperties.privacy = tunnelProperties.privacy;
			}
		}
		return tunnelProperties;
	}

	private async mergeAttributesIntoExistingTunnel(existingTunnel: Tunnel, tunnelProperties: TunnelProperties, attributes: Attributes | undefined) {
		const newName = attributes?.label ?? tunnelProperties.name;
		enum MergedAttributeAction {
			None = 0,
			Fire = 1,
			Reopen = 2
		}
		let mergedAction = MergedAttributeAction.None;
		if (newName !== existingTunnel.name) {
			existingTunnel.name = newName;
			mergedAction = MergedAttributeAction.Fire;
		}
		// Source of existing tunnel wins so that original source is maintained
		if ((attributes?.protocol || (existingTunnel.protocol !== TunnelProtocol.Http)) && (attributes?.protocol !== existingTunnel.protocol)) {
			tunnelProperties.source = existingTunnel.source;
			mergedAction = MergedAttributeAction.Reopen;
		}
		// New privacy value wins
		if (tunnelProperties.privacy && (existingTunnel.privacy !== tunnelProperties.privacy)) {
			mergedAction = MergedAttributeAction.Reopen;
		}
		switch (mergedAction) {
			case MergedAttributeAction.Fire: {
				this._onForwardPort.fire();
				break;
			}
			case MergedAttributeAction.Reopen: {
				await this.close(existingTunnel.remoteHost, existingTunnel.remotePort, TunnelCloseReason.User);
				await this.doForward(tunnelProperties, attributes);
			}
		}

		return mapHasAddressLocalhostOrAllInterfaces(this.remoteTunnels, tunnelProperties.remote.host, tunnelProperties.remote.port);
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

	async close(host: string, port: number, reason: TunnelCloseReason): Promise<void> {
		const key = makeAddress(host, port);
		const oldTunnel = this.forwarded.get(key)!;
		if ((reason === TunnelCloseReason.AutoForwardEnd) && oldTunnel && (oldTunnel.source.source === TunnelSource.Auto)) {
			this.sessionCachedProperties.set(key, {
				local: oldTunnel.localPort,
				name: oldTunnel.name,
				privacy: oldTunnel.privacy,
			});
		}
		await this.tunnelService.closeTunnel(host, port);
		return this.onTunnelClosed({ host, port }, reason);
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
			for (const tunnel of tunnels) {
				const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? new Map(), tunnel.remoteAddress.host, tunnel.remoteAddress.port);
				const localAddress = typeof tunnel.localAddress === 'string' ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port);
				this.detected.set(makeAddress(tunnel.remoteAddress.host, tunnel.remoteAddress.port), {
					remoteHost: tunnel.remoteAddress.host,
					remotePort: tunnel.remoteAddress.port,
					localAddress: localAddress,
					protocol: TunnelProtocol.Http,
					localUri: this.makeLocalUri(localAddress),
					closeable: false,
					runningProcess: matchingCandidate?.detail,
					hasRunningProcess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					privacy: TunnelPrivacyId.ConstantPrivate,
					source: {
						source: TunnelSource.Extension,
						description: nls.localize('tunnel.staticallyForwarded', "Statically Forwarded")
					}
				});
				this.tunnelService.setEnvironmentTunnel(tunnel.remoteAddress.host, tunnel.remoteAddress.port, localAddress, TunnelPrivacyId.ConstantPrivate, TunnelProtocol.Http);
			}
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
		this.logService.trace(`ForwardedPorts: (TunnelModel) removed candidates ${Array.from(removedCandidates.values()).map(candidate => candidate.port).join(', ')}`);
		this._onCandidatesChanged.fire(removedCandidates);
	}

	// Returns removed candidates
	private updateInResponseToCandidates(candidates: CandidatePort[]): Map<string, { host: string; port: number }> {
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
				forwardedValue.hasRunningProcess = true;
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
				forwardedValue.hasRunningProcess = false;
				forwardedValue.pid = undefined;
			}
			const detectedValue = mapHasAddressLocalhostOrAllInterfaces(this.detected, parsedAddress.host, parsedAddress.port);
			if (detectedValue) {
				detectedValue.runningProcess = undefined;
				detectedValue.hasRunningProcess = false;
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
		const tunnels = Array.from(this.forwarded.values());
		const allAttributes = await this.getAttributes(tunnels.map(tunnel => {
			return { port: tunnel.remotePort, host: tunnel.remoteHost };
		}), false);
		if (!allAttributes) {
			return;
		}
		for (const forwarded of tunnels) {
			const attributes = allAttributes.get(forwarded.remotePort);
			if ((attributes?.protocol || (forwarded.protocol !== TunnelProtocol.Http)) && (attributes?.protocol !== forwarded.protocol)) {
				await this.doForward({
					remote: { host: forwarded.remoteHost, port: forwarded.remotePort },
					local: forwarded.localPort,
					name: forwarded.name,
					source: forwarded.source
				}, attributes);
			}

			if (!attributes) {
				continue;
			}
			if (attributes.label && attributes.label !== forwarded.name) {
				await this.name(forwarded.remoteHost, forwarded.remotePort, attributes.label);
			}

		}
	}

	async getAttributes(forwardedPorts: { host: string; port: number }[], checkProviders: boolean = true): Promise<Map<number, Attributes> | undefined> {
		const matchingCandidates: Map<number, CandidatePort> = new Map();
		const pidToPortsMapping: Map<number | undefined, number[]> = new Map();
		forwardedPorts.forEach(forwardedPort => {
			const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces<CandidatePort>(this._candidates ?? new Map(), LOCALHOST_ADDRESSES[0], forwardedPort.port) ?? forwardedPort;
			if (matchingCandidate) {
				matchingCandidates.set(forwardedPort.port, matchingCandidate);
				const pid = isCandidatePort(matchingCandidate) ? matchingCandidate.pid : undefined;
				if (!pidToPortsMapping.has(pid)) {
					pidToPortsMapping.set(pid, []);
				}
				pidToPortsMapping.get(pid)?.push(forwardedPort.port);
			}
		});

		const configAttributes: Map<number, Attributes> = new Map();
		forwardedPorts.forEach(forwardedPort => {
			const attributes = this.configPortsAttributes.getAttributes(forwardedPort.port, forwardedPort.host, matchingCandidates.get(forwardedPort.port)?.detail);
			if (attributes) {
				configAttributes.set(forwardedPort.port, attributes);
			}
		});
		if ((this.portAttributesProviders.length === 0) || !checkProviders) {
			return (configAttributes.size > 0) ? configAttributes : undefined;
		}

		// Group calls to provide attributes by pid.
		const allProviderResults = await Promise.all(this.portAttributesProviders.flatMap(provider => {
			return Array.from(pidToPortsMapping.entries()).map(entry => {
				const portGroup = entry[1];
				const matchingCandidate = matchingCandidates.get(portGroup[0]);
				return provider.providePortAttributes(portGroup,
					matchingCandidate?.pid, matchingCandidate?.detail, CancellationToken.None);
			});
		}));
		const providedAttributes: Map<number, ProvidedPortAttributes> = new Map();
		allProviderResults.forEach(attributes => attributes.forEach(attribute => {
			if (attribute) {
				providedAttributes.set(attribute.port, attribute);
			}
		}));

		if (!configAttributes && !providedAttributes) {
			return undefined;
		}

		// Merge. The config wins.
		const mergedAttributes: Map<number, Attributes> = new Map();
		forwardedPorts.forEach(forwardedPorts => {
			const config = configAttributes.get(forwardedPorts.port);
			const provider = providedAttributes.get(forwardedPorts.port);
			mergedAttributes.set(forwardedPorts.port, {
				elevateIfNeeded: config?.elevateIfNeeded,
				label: config?.label,
				onAutoForward: config?.onAutoForward ?? PortsAttributes.providedActionToAction(provider?.autoForwardAction),
				requireLocalPort: config?.requireLocalPort,
				protocol: config?.protocol
			});
		});

		return mergedAttributes;
	}

	addAttributesProvider(provider: PortAttributesProvider) {
		this.portAttributesProviders.push(provider);
	}
}
