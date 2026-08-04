/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/common/actions.js';
import { ToolResultContentType } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { buildCancelEditAttributionResource, buildCommitEditAttributionResource, buildPrepareEditAttributionResource, createFileEditContentDigest, getFileEditAttributionMarker, IEditAttributionCoverageGapAcknowledgement, IEditAttributionFlushResult, IPreparedEditAttributionFlush, ITrackedFileEditAttributionMarker } from '../../../../../platform/agentHost/common/fileEditAttribution.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { EditTelemetryTrigger } from '../../../../../platform/telemetry/common/editTelemetry.js';

const MARKER_TTL = 5 * 60 * 1000;
const ROUTE_TTL = 10 * 60 * 60 * 1000;
const MAX_MARKERS_PER_RESOURCE = 128;
const MAX_OBSERVATIONS_PER_RESOURCE = 128;
const MAX_ROUTES = 1_000;
const MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS = 1_000;
const COORDINATION_TIMEOUT = 15_000;

interface IRecentMarker extends ITrackedFileEditAttributionMarker {
	readonly timestamp: number;
}

export interface IAgentHostEditAttributionCoverageGap {
	readonly editCount: number;
	readonly insertedCount: number;
}

interface IExternalObservation {
	readonly id: string;
	readonly beforeDigest: string;
	readonly afterDigest: string;
	readonly timestamp: number;
	suppressed: boolean;
}

interface IAgentHostResourceRoute {
	readonly connection: IAgentConnection;
	readonly resource: URI;
	readonly timestamp: number;
	readonly lastSequence: number;
}

export interface IPreparedAgentHostEditAttributionFlush {
	readonly flushToken: string;
	readonly agentModifiedCount: number;
	readonly deferCoverageGap?: boolean;
	commit(totalModifiedCount: number): Promise<void>;
}

export class AgentHostEditAttributionUnknownOutcomeError extends Error {
	constructor(cause: unknown) {
		super('The Agent Host edit attribution outcome is unknown', { cause });
	}
}

export class AgentHostEditAttributionDeferredError extends Error {
	constructor(cause: unknown) {
		super('The Agent Host edit attribution was deferred', { cause });
	}
}

export interface IAgentHostEditMarkerService {
	createCorrelation(resource: URI): IExternalEditCorrelation;
	takeCoverageGap?(resource: URI): IAgentHostEditAttributionCoverageGap | undefined;
	prepareFlush(resource: URI, trigger: EditTelemetryTrigger, statsUuid: string, isDirty: boolean, languageId?: string): Promise<IPreparedAgentHostEditAttributionFlush | undefined>;
}

export interface IExternalEditCorrelation {
	readonly onDidSuppress: Event<string>;
	readonly onDidInvalidate: Event<string>;
	register(before: string, after: string): string;
	isSuppressed(id: string): boolean;
	release(id: string): void;
}

export class AgentHostEditMarkerService extends Disposable implements IAgentHostEditMarkerService {
	private readonly _markers = new Map<string, IRecentMarker[]>();
	private readonly _observations = new Map<string, IExternalObservation[]>();
	private readonly _routes = new Map<string, IAgentHostResourceRoute>();
	private readonly _coverageGaps = new Map<string, IAgentHostEditAttributionCoverageGap & { readonly timestamp: number }>();
	private readonly _acknowledgedCoverageGapIds = new Map<string, number>();
	private readonly _pendingCoverageGapAcknowledgements = new Map<string, { readonly acknowledgements: readonly IEditAttributionCoverageGapAcknowledgement[]; readonly timestamp: number }>();
	private readonly _onDidSuppress = this._register(new Emitter<string>());
	private readonly _onDidInvalidate = this._register(new Emitter<string>());
	private readonly _onDidReceiveMarker = this._register(new Emitter<{ readonly resourceKey: string; readonly connection: IAgentConnection; readonly sequence: number }>());
	private readonly _connectionListeners = this._register(new DisposableStore());

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
		this._updateConnectionListeners();
		this._register(this._connectionsService.onDidChangeConnections(() => this._updateConnectionListeners()));
	}

	createCorrelation(resource: URI): IExternalEditCorrelation {
		const resourceKey = this._key(resource);
		return {
			onDidSuppress: this._onDidSuppress.event,
			onDidInvalidate: this._onDidInvalidate.event,
			register: (before, after) => this._registerObservation(resourceKey, before, after),
			isSuppressed: id => this._observations.get(resourceKey)?.some(observation => observation.id === id && observation.suppressed) ?? false,
			release: id => this._releaseObservation(resourceKey, id),
		};
	}

	takeCoverageGap(resource: URI): IAgentHostEditAttributionCoverageGap | undefined {
		const resourceKey = this._key(resource);
		this._prune(resourceKey);
		const coverageGap = this._coverageGaps.get(resourceKey);
		if (!coverageGap) {
			return undefined;
		}
		this._coverageGaps.delete(resourceKey);
		return {
			editCount: coverageGap.editCount,
			insertedCount: coverageGap.insertedCount,
		};
	}

	async prepareFlush(resource: URI, trigger: EditTelemetryTrigger, statsUuid: string, isDirty: boolean, languageId = 'plaintext'): Promise<IPreparedAgentHostEditAttributionFlush | undefined> {
		const resourceKey = this._key(resource);
		this._prune(resourceKey);
		const route = this._routes.get(resourceKey);
		if (!route) {
			return undefined;
		}
		const flushToken = generateUuid();
		try {
			const result = await this._resourceRead(route.connection, buildPrepareEditAttributionResource({
				resource: route.resource,
				trigger,
				statsUuid,
				isDirty,
				flushToken,
				languageId,
			}));
			const prepared = JSON.parse(result.data) as IPreparedEditAttributionFlush | null;
			if (
				prepared &&
				(
					prepared.flushToken !== flushToken ||
					!Number.isSafeInteger(prepared.agentModifiedCount) ||
					prepared.agentModifiedCount < 0 ||
					(prepared.lastSequence !== undefined && (!Number.isSafeInteger(prepared.lastSequence) || prepared.lastSequence < 0)) ||
					(prepared.standaloneCoverageGapAcknowledgements !== undefined && prepared.lastSequence === undefined) ||
					!isValidCoverageGapAcknowledgements(prepared.standaloneCoverageGapAcknowledgements, prepared.lastSequence)
				)
			) {
				throw new Error('Agent Host edit attribution returned an invalid prepared flush');
			}
			if (prepared?.lastSequence !== undefined) {
				await this._waitForMarker(resourceKey, route.connection, prepared.lastSequence);
			}
			if (prepared?.standaloneCoverageGapAcknowledgements !== undefined) {
				this._acknowledgeCoverageGaps(resourceKey, prepared.standaloneCoverageGapAcknowledgements);
			}
			return prepared ? {
				...prepared,
				commit: async totalModifiedCount => {
					let commitError: unknown = new Error(`Agent Host edit attribution commit failed: ${prepared.flushToken}`);
					try {
						const result = await this._readOutcome(route.connection, buildCommitEditAttributionResource({
							flushToken: prepared.flushToken,
							totalModifiedCount,
						}));
						if (result.outcome === 'committed') {
							return;
						}
						commitError = new Error(`Agent Host edit attribution commit was not found: ${prepared.flushToken}`);
					} catch (error) {
						commitError = error;
					}
					let cancelResult: IEditAttributionFlushResult;
					try {
						cancelResult = await this._readOutcome(route.connection, buildCancelEditAttributionResource({
							flushToken: prepared.flushToken,
						}));
					} catch (cancelError) {
						throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
							[commitError, cancelError],
							'Failed to commit or cancel Agent Host edit attribution'
						));
					}
					if (cancelResult.outcome === 'committed') {
						return;
					}
					throw new AgentHostEditAttributionDeferredError(commitError);
				},
			} : undefined;
		} catch (prepareError) {
			return this._recoverFailedPrepare(route.connection, resourceKey, flushToken, prepareError);
		}
	}

	private async _recoverFailedPrepare(connection: IAgentConnection, resourceKey: string, flushToken: string, prepareError: unknown): Promise<IPreparedAgentHostEditAttributionFlush> {
		let cancelResult: IEditAttributionFlushResult;
		try {
			cancelResult = await this._readOutcome(connection, buildCancelEditAttributionResource({ flushToken }));
		} catch (cancelError) {
			throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
				[prepareError, cancelError],
				'Failed to prepare or cancel Agent Host edit attribution'
			));
		}
		if (cancelResult.outcome === 'committed') {
			let deferCoverageGap = false;
			if (cancelResult.standaloneCoverageGapAcknowledgements?.length) {
				try {
					await this._waitForMarker(resourceKey, connection, getLastAcknowledgedSequence(cancelResult.standaloneCoverageGapAcknowledgements));
					this._acknowledgeCoverageGaps(resourceKey, cancelResult.standaloneCoverageGapAcknowledgements);
				} catch {
					this._queuePendingCoverageGapAcknowledgements(resourceKey, cancelResult.standaloneCoverageGapAcknowledgements);
					deferCoverageGap = true;
				}
			}
			return {
				flushToken,
				agentModifiedCount: cancelResult.agentModifiedCount,
				deferCoverageGap,
				commit: async () => { },
			};
		}
		throw new AgentHostEditAttributionDeferredError(prepareError);
	}

	private async _waitForMarker(resourceKey: string, connection: IAgentConnection, sequence: number): Promise<void> {
		const isCaughtUp = () => {
			const route = this._routes.get(resourceKey);
			return route?.connection === connection && route.lastSequence >= sequence;
		};
		if (isCaughtUp()) {
			return;
		}
		const marker = await raceTimeout(Event.toPromise(Event.filter(
			this._onDidReceiveMarker.event,
			event => event.resourceKey === resourceKey && event.connection === connection && event.sequence >= sequence
		)), COORDINATION_TIMEOUT);
		if (!marker && !isCaughtUp()) {
			throw new Error(`Timed out waiting for Agent Host edit attribution marker: ${sequence}`);
		}
	}

	private async _resourceRead(connection: IAgentConnection, resource: URI) {
		const result = await raceTimeout(connection.resourceRead(resource), COORDINATION_TIMEOUT);
		if (!result) {
			throw new Error(`Agent Host edit attribution request timed out: ${resource.path}`);
		}
		return result;
	}

	private async _readOutcome(connection: IAgentConnection, resource: URI): Promise<IEditAttributionFlushResult> {
		const result = await this._resourceRead(connection, resource);
		const parsed = JSON.parse(result.data) as Partial<IEditAttributionFlushResult>;
		if (
			(parsed.outcome !== 'committed' && parsed.outcome !== 'cancelled' && parsed.outcome !== 'missing') ||
			typeof parsed.agentModifiedCount !== 'number' ||
			!isValidCoverageGapAcknowledgements(parsed.standaloneCoverageGapAcknowledgements)
		) {
			throw new Error(`Invalid Agent Host edit attribution outcome: ${resource.path}`);
		}
		return {
			outcome: parsed.outcome,
			agentModifiedCount: parsed.agentModifiedCount,
			standaloneCoverageGapAcknowledgements: parsed.standaloneCoverageGapAcknowledgements,
		};
	}

	private _updateConnectionListeners(): void {
		this._connectionListeners.clear();
		const activeConnections = new Set(this._connectionsService.connections.flatMap(info => info.connection ? [info.connection] : []));
		for (const [resourceKey, route] of this._routes) {
			if (!activeConnections.has(route.connection)) {
				this._invalidateObservations(resourceKey);
				this._routes.delete(resourceKey);
			}
		}
		for (const connectionInfo of this._connectionsService.connections) {
			const connection = connectionInfo.connection;
			if (!connection) {
				continue;
			}
			this._connectionListeners.add(connection.onDidAction(envelope => {
				const action = envelope.action;
				if (action.type !== ActionType.ChatToolCallComplete) {
					return;
				}
				for (const content of action.result.content ?? []) {
					if (content.type !== ToolResultContentType.FileEdit) {
						continue;
					}
					const marker = getFileEditAttributionMarker(content);
					const resourceUri = content.after?.uri ?? content.before?.uri;
					if (!marker || !resourceUri) {
						continue;
					}
					const resource = toAgentHostUri(URI.parse(resourceUri), connectionInfo.authority);
					const resourceKey = this._key(resource);
					const previousRoute = this._routes.get(resourceKey);
					if (previousRoute && (previousRoute.connection !== connection || marker.sequence <= previousRoute.lastSequence)) {
						this._invalidateObservations(resourceKey);
					}
					this._routes.delete(resourceKey);
					this._routes.set(resourceKey, {
						connection,
						resource: URI.parse(resourceUri),
						timestamp: Date.now(),
						lastSequence: marker.sequence,
					});
					this._onDidReceiveMarker.fire({ resourceKey, connection, sequence: marker.sequence });
					while (this._routes.size > MAX_ROUTES) {
						const oldestKey = this._routes.keys().next().value;
						if (oldestKey === undefined) {
							break;
						}
						this._invalidateObservations(oldestKey);
						this._routes.delete(oldestKey);
					}
					if (marker.status === 'skipped') {
						this._recordCoverageGap(resourceKey, marker.untrackedEditCount ?? 1, marker.insertedCount);
					} else {
						this._recordMarker(resourceKey, marker);
					}
					this._applyPendingCoverageGapAcknowledgements(resourceKey);
				}
			}));
		}
	}

	private _recordCoverageGap(resourceKey: string, editCount: number, insertedCount: number): void {
		const existing = this._coverageGaps.get(resourceKey);
		this._coverageGaps.delete(resourceKey);
		this._coverageGaps.set(resourceKey, {
			editCount: (existing?.editCount ?? 0) + editCount,
			insertedCount: (existing?.insertedCount ?? 0) + insertedCount,
			timestamp: Date.now(),
		});
		while (this._coverageGaps.size > MAX_ROUTES) {
			const oldestKey = this._coverageGaps.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this._coverageGaps.delete(oldestKey);
		}
	}

	private _acknowledgeCoverageGaps(resourceKey: string, acknowledgements: readonly IEditAttributionCoverageGapAcknowledgement[]): readonly IEditAttributionCoverageGapAcknowledgement[] {
		const remaining: IEditAttributionCoverageGapAcknowledgement[] = [];
		for (const acknowledgement of acknowledgements) {
			const acknowledgementKey = coverageGapAcknowledgementKey(resourceKey, acknowledgement.id);
			if (this._acknowledgedCoverageGapIds.has(acknowledgementKey)) {
				continue;
			}
			const coverageGap = this._coverageGaps.get(resourceKey);
			if (!coverageGap) {
				this._recordCoverageGapAcknowledgement(acknowledgementKey);
				continue;
			}
			if (coverageGap.editCount < acknowledgement.editCount || coverageGap.insertedCount < acknowledgement.insertedCount) {
				remaining.push(acknowledgement);
				continue;
			}
			const editCount = coverageGap.editCount - acknowledgement.editCount;
			const insertedCount = coverageGap.insertedCount - acknowledgement.insertedCount;
			if (editCount > 0 || insertedCount > 0) {
				this._coverageGaps.set(resourceKey, {
					editCount,
					insertedCount,
					timestamp: coverageGap.timestamp,
				});
			} else {
				this._coverageGaps.delete(resourceKey);
			}
			this._recordCoverageGapAcknowledgement(acknowledgementKey);
		}
		return remaining;
	}

	private _recordCoverageGapAcknowledgement(acknowledgementKey: string): void {
		this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
		this._acknowledgedCoverageGapIds.set(acknowledgementKey, Date.now());
		while (this._acknowledgedCoverageGapIds.size > MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS) {
			const oldestKey = this._acknowledgedCoverageGapIds.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this._acknowledgedCoverageGapIds.delete(oldestKey);
		}
	}

	private _queuePendingCoverageGapAcknowledgements(resourceKey: string, acknowledgements: readonly IEditAttributionCoverageGapAcknowledgement[]): void {
		const pending = new Map(
			(this._pendingCoverageGapAcknowledgements.get(resourceKey)?.acknowledgements ?? []).map(acknowledgement => [acknowledgement.id, acknowledgement])
		);
		for (const acknowledgement of acknowledgements) {
			pending.set(acknowledgement.id, acknowledgement);
		}
		this._pendingCoverageGapAcknowledgements.delete(resourceKey);
		this._pendingCoverageGapAcknowledgements.set(resourceKey, {
			acknowledgements: Array.from(pending.values()),
			timestamp: Date.now(),
		});
		while (this._pendingCoverageGapAcknowledgements.size > MAX_ROUTES) {
			const oldestKey = this._pendingCoverageGapAcknowledgements.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this._pendingCoverageGapAcknowledgements.delete(oldestKey);
		}
	}

	private _applyPendingCoverageGapAcknowledgements(resourceKey: string): void {
		const pending = this._pendingCoverageGapAcknowledgements.get(resourceKey);
		const route = this._routes.get(resourceKey);
		if (!pending || !route || route.lastSequence < getLastAcknowledgedSequence(pending.acknowledgements)) {
			return;
		}
		this._pendingCoverageGapAcknowledgements.delete(resourceKey);
		const remaining = this._acknowledgeCoverageGaps(resourceKey, pending.acknowledgements);
		if (remaining.length > 0) {
			this._queuePendingCoverageGapAcknowledgements(resourceKey, remaining);
		}
	}

	private _registerObservation(resourceKey: string, before: string, after: string): string {
		this._prune(resourceKey);
		const observation: IExternalObservation = {
			id: generateUuid(),
			beforeDigest: createFileEditContentDigest(before),
			afterDigest: createFileEditContentDigest(after),
			timestamp: Date.now(),
			suppressed: false,
		};
		const observations = this._observations.get(resourceKey) ?? [];
		observations.push(observation);
		while (observations.length > MAX_OBSERVATIONS_PER_RESOURCE) {
			const removed = observations.shift();
			if (removed?.suppressed) {
				this._onDidInvalidate.fire(removed.id);
			}
		}
		this._observations.set(resourceKey, observations);
		this._trySuppress(resourceKey, observation);
		return observation.id;
	}

	private _recordMarker(resourceKey: string, marker: ITrackedFileEditAttributionMarker): void {
		this._prune(resourceKey);
		const markers = this._markers.get(resourceKey) ?? [];
		if (!markers.some(candidate => candidate.editId === marker.editId)) {
			markers.push({ ...marker, timestamp: Date.now() });
			markers.sort((a, b) => a.sequence - b.sequence);
			removeCompletedCycle(markers, marker.editId);
			while (markers.length > MAX_MARKERS_PER_RESOURCE) {
				markers.shift();
			}
			this._markers.set(resourceKey, markers);
		}
		for (const observation of this._observations.get(resourceKey) ?? []) {
			this._trySuppress(resourceKey, observation);
		}
	}

	private _trySuppress(resourceKey: string, observation: IExternalObservation): void {
		if (observation.suppressed) {
			return;
		}
		const markers = this._markers.get(resourceKey);
		if (!markers) {
			return;
		}
		for (let startIndex = 0; startIndex < markers.length; startIndex++) {
			const first = markers[startIndex];
			if (first.beforeDigest !== observation.beforeDigest) {
				continue;
			}
			const consumed = [startIndex];
			let afterDigest = first.afterDigest;
			let sequence = first.sequence;
			while (afterDigest !== observation.afterDigest) {
				const nextIndex = markers.findIndex((marker, index) =>
					index !== startIndex &&
					!consumed.includes(index) &&
					marker.sequence > sequence &&
					marker.beforeDigest === afterDigest
				);
				if (nextIndex < 0) {
					break;
				}
				consumed.push(nextIndex);
				afterDigest = markers[nextIndex].afterDigest;
				sequence = markers[nextIndex].sequence;
			}
			if (afterDigest !== observation.afterDigest) {
				continue;
			}
			observation.suppressed = true;
			for (const index of consumed.toSorted((a, b) => b - a)) {
				markers.splice(index, 1);
			}
			if (markers.length === 0) {
				this._markers.delete(resourceKey);
			}
			this._onDidSuppress.fire(observation.id);
			return;
		}
	}

	private _releaseObservation(resourceKey: string, id: string): void {
		const observations = this._observations.get(resourceKey);
		if (!observations) {
			return;
		}
		const index = observations.findIndex(observation => observation.id === id);
		if (index >= 0) {
			observations.splice(index, 1);
		}
		if (observations.length === 0) {
			this._observations.delete(resourceKey);
		}
	}

	private _invalidateObservations(resourceKey: string): void {
		this._markers.delete(resourceKey);
		this._coverageGaps.delete(resourceKey);
		this._pendingCoverageGapAcknowledgements.delete(resourceKey);
		const acknowledgementPrefix = coverageGapAcknowledgementKey(resourceKey, '');
		for (const acknowledgementKey of this._acknowledgedCoverageGapIds.keys()) {
			if (acknowledgementKey.startsWith(acknowledgementPrefix)) {
				this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
			}
		}
		const observations = this._observations.get(resourceKey);
		if (!observations) {
			return;
		}
		for (const observation of observations) {
			if (observation.suppressed) {
				this._onDidInvalidate.fire(observation.id);
			}
		}
		this._observations.delete(resourceKey);
	}

	private _prune(resourceKey: string): void {
		const now = Date.now();
		const minimumTimestamp = now - MARKER_TTL;
		const markers = this._markers.get(resourceKey)?.filter(marker => marker.timestamp >= minimumTimestamp);
		if (markers?.length) {
			this._markers.set(resourceKey, markers);
		} else {
			this._markers.delete(resourceKey);
		}
		const observations = this._observations.get(resourceKey)?.filter(observation => observation.suppressed || observation.timestamp >= minimumTimestamp);
		if (observations?.length) {
			this._observations.set(resourceKey, observations);
		} else {
			this._observations.delete(resourceKey);
		}
		if ((this._routes.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
			this._invalidateObservations(resourceKey);
			this._routes.delete(resourceKey);
		}
		if ((this._coverageGaps.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
			this._coverageGaps.delete(resourceKey);
		}
		if ((this._pendingCoverageGapAcknowledgements.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
			this._pendingCoverageGapAcknowledgements.delete(resourceKey);
		}
		for (const [acknowledgementKey, timestamp] of this._acknowledgedCoverageGapIds) {
			if (timestamp < now - ROUTE_TTL) {
				this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
			}
		}
	}

	private _key(resource: URI): string {
		const normalizedResource = resource.scheme === Schemas.vscodeRemote
			? URI.from({ scheme: Schemas.file, path: resource.path })
			: resource;
		return this._uriIdentityService.extUri.getComparisonKey(this._uriIdentityService.asCanonicalUri(normalizedResource));
	}
}

function isValidCoverageGapAcknowledgements(acknowledgements: readonly IEditAttributionCoverageGapAcknowledgement[] | undefined, lastSequence?: number): boolean {
	if (acknowledgements === undefined) {
		return true;
	}
	if (!Array.isArray(acknowledgements) || acknowledgements.length === 0 || new Set(acknowledgements.map(acknowledgement => acknowledgement.id)).size !== acknowledgements.length) {
		return false;
	}
	return acknowledgements.every(acknowledgement =>
		typeof acknowledgement.id === 'string' &&
		acknowledgement.id.length > 0 &&
		Array.isArray(acknowledgement.sequences) &&
		acknowledgement.sequences.length > 0 &&
		acknowledgement.sequences.every((sequence: number) => Number.isSafeInteger(sequence) && sequence >= 0 && (lastSequence === undefined || sequence <= lastSequence)) &&
		new Set(acknowledgement.sequences).size === acknowledgement.sequences.length &&
		Number.isSafeInteger(acknowledgement.editCount) &&
		acknowledgement.editCount > 0 &&
		Number.isSafeInteger(acknowledgement.insertedCount) &&
		acknowledgement.insertedCount >= 0
	);
}

function getLastAcknowledgedSequence(acknowledgements: readonly IEditAttributionCoverageGapAcknowledgement[]): number {
	return Math.max(...acknowledgements.flatMap(acknowledgement => acknowledgement.sequences));
}

function coverageGapAcknowledgementKey(resourceKey: string, acknowledgementId: string): string {
	return `${resourceKey}\0${acknowledgementId}`;
}

function removeCompletedCycle(markers: IRecentMarker[], latestEditId: string): void {
	const latestIndex = markers.findIndex(marker => marker.editId === latestEditId);
	if (latestIndex < 0) {
		return;
	}
	const completedDigest = markers[latestIndex].afterDigest;
	const consumed = [latestIndex];
	let beforeDigest = markers[latestIndex].beforeDigest;
	let sequence = markers[latestIndex].sequence;
	while (true) {
		if (beforeDigest === completedDigest && consumed.length > 1) {
			for (const index of consumed.toSorted((a, b) => b - a)) {
				markers.splice(index, 1);
			}
			return;
		}
		let previousIndex = -1;
		for (let index = markers.length - 1; index >= 0; index--) {
			const marker = markers[index];
			if (marker.sequence < sequence && marker.afterDigest === beforeDigest) {
				previousIndex = index;
				break;
			}
		}
		if (previousIndex < 0) {
			return;
		}
		consumed.push(previousIndex);
		beforeDigest = markers[previousIndex].beforeDigest;
		sequence = markers[previousIndex].sequence;
	}
}
