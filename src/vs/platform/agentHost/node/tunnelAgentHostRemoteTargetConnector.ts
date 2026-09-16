/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostRemoteTargetConnectOptions, IAgentHostRemoteTargetConnector, IAgentHostRemoteTargetDescriptor } from '../common/agentHostRemoteAgents.js';
import { AgentHostProtocolClientCore } from '../common/agentHostProtocolClient.js';
import {
	parseCachedTunnels,
	parseTunnelIds,
	TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY,
	TunnelAgentHostDiscoveryDisabledError,
	TunnelAgentHostDiscoveryNeedsAuthenticationError,
	type TunnelAgentHostDiscoveryState,
} from '../common/tunnelAgentHostDiscovery.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import { ReconnectingRelayTransport, type IRelayConnectionHandle } from '../common/relayTransport.js';
import { NonReconnectableTransportError } from '../common/state/sessionTransport.js';
import {
	equalsHostedTunnelIdentity,
	getHostedTunnelInfo,
	isTunnelGatewaySelectionRejectedError,
	isTunnelHosted,
	isTunnelNotFoundError,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_LAUNCHER_LABEL,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	type HostedTunnelIdentity,
	type ICachedTunnel,
	type ITunnelAgentHostMainService,
	type ITunnelConnectResult,
	type ITunnelGatewayInventory,
	type ITunnelGatewaySelection,
	type ITunnelInfo,
} from '../common/tunnelAgentHost.js';
import { selectDedicatedGatewayFallback, selectGatewayFallbackAfterRejection } from '../common/tunnelGatewaySelection.js';
import type { IRemoteAgentHostProtocolClient } from '../common/remoteAgentHostService.js';
import type { IAgentHostFeatureAuthenticationCredential, IAgentHostFeatureAuthenticationRegistry } from './agentHostFeatureAuthentication.js';
import type { IAgentHostRemoteAgentsActivationContext, IAgentHostRemoteAgentsContribution } from './agentHostRemoteAgentsService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

const LOG_PREFIX = '[TunnelAgentHostRemoteTargets]';

interface ITunnelTarget {
	readonly internalKey: string;
	readonly authProvider: 'github' | 'microsoft';
	readonly tunnel: ITunnelInfo;
}

interface IPendingRefresh {
	readonly generation: number;
	readonly promise: Promise<void>;
	readonly cancellation: CancellationTokenSource;
}

export class TunnelAgentHostRemoteTargetConnector extends Disposable implements IAgentHostRemoteTargetConnector, IAgentHostRemoteAgentsContribution {
	readonly connectorId = 'tunnel';

	private readonly _targets = observableValue<readonly IAgentHostRemoteTargetDescriptor[]>(this, []);
	readonly targets: IObservable<readonly IAgentHostRemoteTargetDescriptor[]> = this._targets;

	private readonly _discoveryState = observableValue<TunnelAgentHostDiscoveryState>(this, { kind: 'disabled' });
	readonly discoveryState: IObservable<TunnelAgentHostDiscoveryState> = this._discoveryState;

	private _targetDetails = new Map<string, ITunnelTarget>();
	private _activation: object | undefined;
	private _discoveryEnabled = false;
	private _credential: IAgentHostFeatureAuthenticationCredential | undefined;
	private _hostedTunnelIdentity: HostedTunnelIdentity = { kind: 'unknown' };
	private _additionalTunnelNames: readonly string[] = [];
	private _catalogAuthProvider: 'github' | 'microsoft' | undefined;
	private _catalog: readonly ITunnelInfo[] = [];
	private _catalogAuthoritative = false;
	private _refreshGeneration = 0;
	private _pendingRefresh: IPendingRefresh | undefined;
	private readonly _attempts = new Map<string, Set<CancellationTokenSource>>();
	private readonly _hostedTunnel: IObservable<HostedTunnelIdentity>;

	constructor(
		private readonly _tunnelService: ITunnelAgentHostMainService,
		private readonly _authenticationRegistry: IAgentHostFeatureAuthenticationRegistry,
		private readonly _storageService: IAgentHostStorageService,
		private readonly _logService: ILogService,
		hostedTunnel: IObservable<HostedTunnelIdentity> = constObservable<HostedTunnelIdentity>({ kind: 'unknown' }),
		private readonly _configuredAdditionalTunnelNames: IObservable<readonly string[]> = constObservable([]),
	) {
		super();
		this._hostedTunnel = hostedTunnel;
	}

	activate(context: IAgentHostRemoteAgentsActivationContext): IDisposable {
		if (this._activation) {
			throw new Error('Tunnel Agent Host remote target connector is already active.');
		}
		const activation = {};
		this._activation = activation;
		const store = new DisposableStore();
		let connectorRegistered = false;
		store.add(autorun(reader => {
			const discoveryEnabled = context.tunnelDiscoveryEnabled.read(reader);
			if (discoveryEnabled && !connectorRegistered) {
				connectorRegistered = true;
				context.registerTargetConnector(this);
			}
			this._updateLifecycle(
				activation,
				discoveryEnabled,
				this._authenticationRegistry.credential.read(reader),
				this._hostedTunnel.read(reader),
				this._configuredAdditionalTunnelNames.read(reader),
			);
		}));
		store.add(Event.filter(
			this._storageService.onDidChange,
			key => key === TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY,
		)(() => this._reconcileCatalog()));
		store.add(context.cancellationToken.onCancellationRequested(() => this._deactivate(activation)));
		return toDisposable(() => {
			store.dispose();
			this._deactivate(activation);
		});
	}

	refresh(): Promise<void> {
		if (!this._activation || !this._discoveryEnabled) {
			return Promise.reject(new TunnelAgentHostDiscoveryDisabledError());
		}
		const credential = this._credential;
		if (!credential) {
			this._setDiscoveryState({ kind: 'needsAuthentication' });
			return Promise.reject(new TunnelAgentHostDiscoveryNeedsAuthenticationError());
		}
		return this._startRefresh(credential, this._refreshGeneration, this._additionalTunnelNames);
	}

	async createConnection(target: IAgentHostRemoteTargetDescriptor, options: IAgentHostRemoteTargetConnectOptions): Promise<IRemoteAgentHostProtocolClient> {
		const targetDetails = this._targetDetails.get(target.internalKey);
		if (!targetDetails || targetDetails.tunnel.tunnelId !== target.targetId.slice(TUNNEL_ADDRESS_PREFIX.length)) {
			throw new NonReconnectableTransportError(`Tunnel target '${target.targetId}' is no longer available.`);
		}
		if (options.cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}
		return new AgentHostProtocolClientCore(
			target.targetId,
			() => new ReconnectingRelayTransport(
				() => this._establishRelay(target.internalKey, options),
				this._tunnelService,
				() => undefined,
				this._logService,
				LOG_PREFIX,
				AgentHostClientConnectionKind.DevTunnel,
			),
			{ clientId: options.clientId },
			this._logService,
		);
	}

	private _updateLifecycle(
		activation: object,
		discoveryEnabled: boolean,
		credential: IAgentHostFeatureAuthenticationCredential | undefined,
		hostedTunnelIdentity: HostedTunnelIdentity,
		additionalTunnelNames: readonly string[],
	): void {
		if (this._activation !== activation) {
			return;
		}
		const discoveryChanged = this._discoveryEnabled !== discoveryEnabled;
		const credentialChanged = this._credential !== credential;
		const hostedTunnelChanged = !equalsHostedTunnelIdentity(this._hostedTunnelIdentity, hostedTunnelIdentity);
		const additionalTunnelNamesChanged = !equals(this._additionalTunnelNames, additionalTunnelNames);
		if (!discoveryChanged && !credentialChanged && !hostedTunnelChanged && !additionalTunnelNamesChanged) {
			return;
		}
		const previousCredential = this._credential;
		this._discoveryEnabled = discoveryEnabled;
		this._credential = credential;
		this._hostedTunnelIdentity = hostedTunnelIdentity;
		this._additionalTunnelNames = [...additionalTunnelNames];

		if (discoveryChanged || credentialChanged || additionalTunnelNamesChanged) {
			this._refreshGeneration++;
			this._cancelPendingRefresh();
		}
		if (credentialChanged) {
			this._cancelAttempts();
		}

		if (!discoveryEnabled || !credential) {
			this._cancelAttempts();
			this._catalog = [];
			this._catalogAuthProvider = undefined;
			this._catalogAuthoritative = false;
			this._clearTargets();
			this._setDiscoveryState(!discoveryEnabled ? { kind: 'disabled' } : { kind: 'needsAuthentication' });
			return;
		}

		if ((credentialChanged && previousCredential?.issuer !== credential.issuer) || discoveryChanged) {
			try {
				this._publishCachedTargets(credential);
			} catch (error) {
				const normalized = error instanceof Error ? error : new Error(String(error));
				this._setDiscoveryState({ kind: 'error', error: normalized });
				this._logService.error(`${LOG_PREFIX} Failed to restore cached tunnel targets`, normalized);
				return;
			}
		} else if (hostedTunnelChanged) {
			this._reconcileCatalog();
		}

		if (credentialChanged || discoveryChanged || additionalTunnelNamesChanged) {
			void this._startRefresh(credential, this._refreshGeneration, this._additionalTunnelNames).catch(() => undefined);
		}
	}

	private _deactivate(activation: object): void {
		if (this._activation !== activation) {
			return;
		}
		this._activation = undefined;
		this._discoveryEnabled = false;
		this._credential = undefined;
		this._hostedTunnelIdentity = { kind: 'unknown' };
		this._additionalTunnelNames = [];
		this._refreshGeneration++;
		this._cancelPendingRefresh();
		this._cancelAttempts();
		this._catalog = [];
		this._catalogAuthProvider = undefined;
		this._catalogAuthoritative = false;
		this._clearTargets();
		this._setDiscoveryState({ kind: 'disabled' });
	}

	override dispose(): void {
		const activation = this._activation;
		if (activation) {
			this._deactivate(activation);
		} else {
			this._cancelPendingRefresh();
			this._cancelAttempts();
			this._clearTargets();
		}
		super.dispose();
	}

	private _startRefresh(credential: IAgentHostFeatureAuthenticationCredential, generation: number, additionalTunnelNames: readonly string[]): Promise<void> {
		const pending = this._pendingRefresh;
		if (pending?.generation === generation) {
			return pending.promise;
		}
		const cancellation = new CancellationTokenSource();
		const refresh: IPendingRefresh = {
			generation,
			cancellation,
			promise: this._refresh(credential, generation, additionalTunnelNames, cancellation.token),
		};
		this._pendingRefresh = refresh;
		void refresh.promise.then(
			() => this._clearPendingRefresh(refresh),
			() => this._clearPendingRefresh(refresh),
		);
		return refresh.promise;
	}

	private _clearPendingRefresh(refresh: IPendingRefresh): void {
		if (this._pendingRefresh === refresh) {
			this._pendingRefresh = undefined;
		}
		refresh.cancellation.dispose();
	}

	private _cancelPendingRefresh(): void {
		const pending = this._pendingRefresh;
		this._pendingRefresh = undefined;
		pending?.cancellation.dispose(true);
	}

	private async _refresh(
		credential: IAgentHostFeatureAuthenticationCredential,
		generation: number,
		additionalTunnelNames: readonly string[],
		cancellationToken: CancellationToken,
	): Promise<void> {
		if (this._isCurrentRefresh(credential, generation)) {
			this._setDiscoveryState({ kind: 'refreshing' });
		}
		try {
			const discovered = await this._tunnelService.listTunnels(
				credential.token,
				credential.issuer,
				additionalTunnelNames.length > 0 ? [...additionalTunnelNames] : undefined,
				cancellationToken,
			);
			if (!this._isCurrentRefresh(credential, generation)) {
				return;
			}
			const eligible = this._eligibleTunnels(discovered);
			const dismissed = new Set(parseTunnelIds(this._storageService.get(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY)));
			const cached = eligible.filter(tunnel => !dismissed.has(tunnel.tunnelId));
			this._storeAuthoritativeCache(credential.issuer, cached);
			this._catalogAuthProvider = credential.issuer;
			this._catalog = eligible;
			this._catalogAuthoritative = true;
			this._reconcileCatalog();
			this._setDiscoveryState({ kind: 'ready', targetCount: this._targets.get().length });
		} catch (error) {
			if (this._isCurrentRefresh(credential, generation)) {
				const normalized = error instanceof Error ? error : new Error(String(error));
				this._setDiscoveryState({ kind: 'error', error: normalized });
				this._logService.error(`${LOG_PREFIX} Tunnel discovery failed`, normalized);
			}
			throw error;
		}
	}

	private _isCurrentRefresh(credential: IAgentHostFeatureAuthenticationCredential, generation: number): boolean {
		return !!this._activation
			&& this._discoveryEnabled
			&& this._credential === credential
			&& this._refreshGeneration === generation;
	}

	private _eligibleTunnels(tunnels: readonly ITunnelInfo[]): ITunnelInfo[] {
		const eligible = new Map<string, ITunnelInfo>();
		for (const tunnel of tunnels) {
			const tags = new TunnelTags(tunnel.tags);
			if (!tunnel.tunnelId
				|| !tunnel.clusterId
				|| !tunnel.tags.includes(TUNNEL_LAUNCHER_LABEL)
				|| tunnel.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION
				|| tags.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION
			) {
				continue;
			}
			if (!eligible.has(tunnel.tunnelId)) {
				eligible.set(tunnel.tunnelId, tunnel);
			}
		}
		return [...eligible.values()];
	}

	private _storeAuthoritativeCache(authProvider: 'github' | 'microsoft', tunnels: readonly ITunnelInfo[]): void {
		const retained = parseCachedTunnels(this._storageService.get(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY))
			.filter(tunnel => tunnel.authProvider !== undefined && tunnel.authProvider !== authProvider);
		const current: ICachedTunnel[] = tunnels.map(tunnel => ({
			tunnelId: tunnel.tunnelId,
			clusterId: tunnel.clusterId,
			name: tunnel.name,
			protocolVersion: tunnel.protocolVersion,
			authProvider,
		}));
		this._storageService.set(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY, [...retained, ...current]);
	}

	private _reconcileCatalog(): void {
		const authProvider = this._catalogAuthProvider;
		if (!authProvider) {
			this._clearTargets();
			return;
		}
		const dismissed = new Set(parseTunnelIds(this._storageService.get(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY)));
		const suppressed = this._updateSelfSuppressions(this._catalog);
		const hostedTunnel = getHostedTunnelInfo(this._hostedTunnelIdentity);
		this._publishTargets(authProvider, this._catalog.filter(tunnel =>
			!dismissed.has(tunnel.tunnelId)
			&& !suppressed.has(tunnel.tunnelId)
			&& !isTunnelHosted(hostedTunnel, tunnel)
		));
		if (this._discoveryState.get().kind === 'ready') {
			this._setDiscoveryState({ kind: 'ready', targetCount: this._targets.get().length });
		}
	}

	private _updateSelfSuppressions(tunnels: readonly ITunnelInfo[]): Set<string> {
		const suppressed = new Set(parseTunnelIds(this._storageService.get(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY)));
		const owned = new Set(parseTunnelIds(this._storageService.get(TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY)));
		const hostedTunnel = getHostedTunnelInfo(this._hostedTunnelIdentity);
		const selfTunnelIds = new Set(tunnels.filter(tunnel => isTunnelHosted(hostedTunnel, tunnel)).map(tunnel => tunnel.tunnelId));
		const catalogTunnelIds = new Set(tunnels.map(tunnel => tunnel.tunnelId));
		let suppressedChanged = false;
		let ownedChanged = false;
		for (const tunnelId of owned) {
			const disappeared = this._catalogAuthoritative && !catalogTunnelIds.has(tunnelId);
			const knownNonSelf = this._hostedTunnelIdentity.kind !== 'unknown' && !selfTunnelIds.has(tunnelId);
			if (disappeared || knownNonSelf) {
				owned.delete(tunnelId);
				ownedChanged = true;
				if (suppressed.delete(tunnelId)) {
					suppressedChanged = true;
				}
			}
		}
		for (const tunnel of tunnels) {
			if (!selfTunnelIds.has(tunnel.tunnelId) || suppressed.has(tunnel.tunnelId)) {
				continue;
			}
			suppressed.add(tunnel.tunnelId);
			owned.add(tunnel.tunnelId);
			suppressedChanged = true;
			ownedChanged = true;
		}
		if (suppressedChanged) {
			this._storageService.set(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY, [...suppressed]);
		}
		if (ownedChanged) {
			this._storageService.set(TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY, [...owned]);
		}
		return suppressed;
	}

	private _publishCachedTargets(credential: IAgentHostFeatureAuthenticationCredential): void {
		const dismissed = new Set(parseTunnelIds(this._storageService.get(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY)));
		this._catalog = parseCachedTunnels(this._storageService.get(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY))
			.filter(tunnel =>
				(tunnel.authProvider === undefined || tunnel.authProvider === credential.issuer)
				&& !dismissed.has(tunnel.tunnelId)
				&& (tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION) >= TUNNEL_MIN_PROTOCOL_VERSION
			)
			.map(tunnel => ({
				tunnelId: tunnel.tunnelId,
				clusterId: tunnel.clusterId,
				name: tunnel.name,
				tags: [TUNNEL_LAUNCHER_LABEL, `protocolv${tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION}`],
				protocolVersion: tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION,
				hostConnectionCount: 0,
			}));
		this._catalogAuthProvider = credential.issuer;
		this._catalogAuthoritative = false;
		this._reconcileCatalog();
	}

	private _removeTarget(internalKey: string, target: ITunnelTarget): void {
		const current = this._targetDetails.get(internalKey);
		if (!current || !this._sameTarget(current, target)) {
			return;
		}
		this._catalog = this._catalog.filter(tunnel => tunnel.tunnelId !== target.tunnel.tunnelId);
		const cached = parseCachedTunnels(this._storageService.get(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY))
			.filter(tunnel => tunnel.tunnelId !== target.tunnel.tunnelId || (tunnel.authProvider !== undefined && tunnel.authProvider !== target.authProvider));
		this._storageService.set(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY, cached);
		this._reconcileCatalog();
	}

	private _publishTargets(authProvider: 'github' | 'microsoft', tunnels: readonly ITunnelInfo[]): void {
		const details = new Map<string, ITunnelTarget>();
		const targets = tunnels.map(tunnel => {
			const internalKey = JSON.stringify([authProvider, tunnel.tunnelId]);
			details.set(internalKey, { internalKey, authProvider, tunnel });
			return {
				internalKey,
				targetId: `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`,
				label: tunnel.name,
			};
		});
		for (const [internalKey, target] of this._targetDetails) {
			const replacement = details.get(internalKey);
			if (!replacement || !this._sameTarget(target, replacement)) {
				this._cancelAttempts(internalKey);
			}
		}
		this._targetDetails = details;
		const current = this._targets.get();
		if (current.length !== targets.length || targets.some((target, index) =>
			target.internalKey !== current[index].internalKey
			|| target.targetId !== current[index].targetId
			|| target.label !== current[index].label
		)) {
			this._targets.set(targets, undefined);
		}
	}

	private _clearTargets(): void {
		this._cancelAttempts();
		this._targetDetails.clear();
		if (this._targets.get().length > 0) {
			this._targets.set([], undefined);
		}
	}

	private _createAttempt(internalKey: string, parent: CancellationToken): CancellationTokenSource {
		const cancellation = new CancellationTokenSource(parent);
		let attempts = this._attempts.get(internalKey);
		if (!attempts) {
			attempts = new Set();
			this._attempts.set(internalKey, attempts);
		}
		attempts.add(cancellation);
		return cancellation;
	}

	private _releaseAttempt(internalKey: string, cancellation: CancellationTokenSource): void {
		const attempts = this._attempts.get(internalKey);
		if (attempts?.delete(cancellation) && attempts.size === 0) {
			this._attempts.delete(internalKey);
		}
		cancellation.dispose();
	}

	private _cancelAttempts(internalKey?: string): void {
		const attempts = internalKey === undefined
			? [...this._attempts.values()].flatMap(value => [...value])
			: [...(this._attempts.get(internalKey) ?? [])];
		for (const cancellation of attempts) {
			cancellation.cancel();
		}
	}

	private _sameTarget(first: ITunnelTarget, second: ITunnelTarget): boolean {
		return first.authProvider === second.authProvider
			&& first.tunnel.tunnelId === second.tunnel.tunnelId
			&& first.tunnel.clusterId === second.tunnel.clusterId;
	}

	private _setDiscoveryState(state: TunnelAgentHostDiscoveryState): void {
		const current = this._discoveryState.get();
		if (current.kind === state.kind
			&& (state.kind !== 'ready' || current.kind !== 'ready' || current.targetCount === state.targetCount)
			&& (state.kind !== 'error' || current.kind !== 'error' || current.error === state.error)
		) {
			return;
		}
		this._discoveryState.set(state, undefined);
	}

	private async _establishRelay(internalKey: string, options: IAgentHostRemoteTargetConnectOptions): Promise<IRelayConnectionHandle> {
		if (options.cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}
		const target = this._targetDetails.get(internalKey);
		const credential = this._credential;
		if (!this._activation || !target || !credential || credential.issuer !== target.authProvider) {
			throw new NonReconnectableTransportError('Tunnel target authentication is no longer available.');
		}

		const attempt = this._createAttempt(internalKey, options.cancellationToken);
		try {
			let result: ITunnelConnectResult;
			try {
				result = await this._connectTunnel(target.tunnel, credential, attempt.token);
			} catch (error) {
				if (this._isRetryableCredentialRotation(internalKey, target, credential, options.cancellationToken)) {
					throw new Error('Tunnel connection credentials changed while connecting.');
				}
				if (isTunnelNotFoundError(error)) {
					if (this._credential === credential && this._sameTarget(this._targetDetails.get(internalKey) ?? target, target)) {
						this._removeTarget(internalKey, target);
					}
					throw new NonReconnectableTransportError(error.message);
				}
				throw error;
			}
			if (attempt.token.isCancellationRequested) {
				await this._tunnelService.disconnect(result.connectionId);
				if (this._isRetryableCredentialRotation(internalKey, target, credential, options.cancellationToken)) {
					throw new Error('Tunnel connection credentials changed while connecting.');
				}
				throw new CancellationError();
			}
			const currentTarget = this._targetDetails.get(internalKey);
			if (!currentTarget
				|| !this._sameTarget(currentTarget, target)
				|| this._credential !== credential
			) {
				await this._tunnelService.disconnect(result.connectionId);
				if (this._isRetryableCredentialRotation(internalKey, target, credential, options.cancellationToken)) {
					throw new Error('Tunnel connection credentials changed while connecting.');
				}
				throw new NonReconnectableTransportError('Tunnel target changed while its relay was connecting.');
			}
			const connectionId = result.connectionId;
			return {
				connectionId,
				close: () => this._tunnelService.disconnect(connectionId),
			};
		} finally {
			this._releaseAttempt(internalKey, attempt);
		}
	}

	private _isRetryableCredentialRotation(
		internalKey: string,
		target: ITunnelTarget,
		credential: IAgentHostFeatureAuthenticationCredential,
		parentCancellationToken: CancellationToken,
	): boolean {
		const currentCredential = this._credential;
		const currentTarget = this._targetDetails.get(internalKey);
		return !parentCancellationToken.isCancellationRequested
			&& !!this._activation
			&& this._discoveryEnabled
			&& currentCredential !== credential
			&& currentCredential?.issuer === credential.issuer
			&& !!currentTarget
			&& this._sameTarget(currentTarget, target);
	}

	private async _connectTunnel(tunnel: ITunnelInfo, credential: IAgentHostFeatureAuthenticationCredential, cancellationToken: CancellationToken): Promise<ITunnelConnectResult> {
		const prepared = await this._tunnelService.prepareSelection(
			credential.token,
			credential.issuer,
			tunnel.tunnelId,
			tunnel.clusterId,
			cancellationToken,
		);
		if (!prepared) {
			if (cancellationToken.isCancellationRequested) {
				throw new CancellationError();
			}
			return this._tunnelService.connect(credential.token, credential.issuer, tunnel.tunnelId, tunnel.clusterId, cancellationToken);
		}
		if (cancellationToken.isCancellationRequested) {
			await this._tunnelService.cancelSelection(prepared.selectionId);
			throw new CancellationError();
		}
		const selection = this._selectGateway(prepared.inventory);
		try {
			return await this._tunnelService.completeSelection(prepared.selectionId, selection, cancellationToken);
		} catch (error) {
			if (!isTunnelGatewaySelectionRejectedError(error)) {
				throw error;
			}
			if (cancellationToken.isCancellationRequested) {
				throw new CancellationError();
			}
			const retry = await this._tunnelService.prepareSelection(
				credential.token,
				credential.issuer,
				tunnel.tunnelId,
				tunnel.clusterId,
				cancellationToken,
			);
			if (!retry) {
				if (cancellationToken.isCancellationRequested) {
					throw new CancellationError();
				}
				return this._tunnelService.connect(credential.token, credential.issuer, tunnel.tunnelId, tunnel.clusterId, cancellationToken);
			}
			if (cancellationToken.isCancellationRequested) {
				await this._tunnelService.cancelSelection(retry.selectionId);
				throw new CancellationError();
			}
			const fallback = selectGatewayFallbackAfterRejection(selection, retry.inventory);
			if (!fallback) {
				await this._tunnelService.cancelSelection(retry.selectionId);
				throw error;
			}
			return this._tunnelService.completeSelection(retry.selectionId, fallback, cancellationToken);
		}
	}

	private _selectGateway(inventory: ITunnelGatewayInventory): ITunnelGatewaySelection {
		return inventory.delegatedInstanceId
			? { instanceId: inventory.delegatedInstanceId }
			: selectDedicatedGatewayFallback(inventory);
	}
}
