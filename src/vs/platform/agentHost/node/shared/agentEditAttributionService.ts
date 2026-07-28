/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { promisify } from 'util';
import { IntervalTimer, SequencerByKey } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { EditTelemetryTrigger, sendEditSourcesDetailsTelemetry } from '../../../telemetry/common/editTelemetry.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agentService.js';
import { IDiffComputeService, IOffsetEdit } from '../../common/diffComputeService.js';
import { createFileEditContentDigest, IAgentEditAttribution, IAgentEditAttributionService, ICancelEditAttributionFlushParams, ICommitEditAttributionFlushParams, IEditAttributionFlushResult, IFileEditAttributionMarker, IPrepareEditAttributionFlushParams, IPreparedEditAttributionFlush, MAX_EDIT_ATTRIBUTION_FILE_SIZE } from '../../common/fileEditAttribution.js';
import { IAgentHostTelemetryService } from '../agentHostTelemetryService.js';

const MAX_TOTAL_TRACKED_TEXT = 20 * 1024 * 1024;
const MAX_TRACKED_RESOURCES = 100;
const MAX_INTERVALS_PER_RESOURCE = 10_000;
const MAX_SETTLED_FLUSHES = 1_000;
const MAX_STANDALONE_OWNERSHIP = 1_000;
const MAX_NON_REPOSITORY_DIRECTORIES = 1_000;
const PREPARED_FLUSH_TTL = 5 * 60 * 1000;
const SETTLED_FLUSH_TTL = 10 * 60 * 1000;
const STANDALONE_OWNERSHIP_TTL = 10 * 60 * 60 * 1000;
const NON_REPOSITORY_DIRECTORY_TTL = 10 * 60 * 1000;
const GIT_STATE_POLL_INTERVAL = 30_000;
const GIT_STATE_TIMEOUT = 10_000;
const execFileAsync = promisify(execFile);

interface IAttributedInterval {
	readonly start: number;
	readonly endExclusive: number;
	readonly sourceKey: string;
}

interface ISourceStatistics {
	readonly sourceKey: string;
	readonly sourceKeyCleaned: string;
	readonly modelId: string | undefined;
	readonly conversationId: string;
	readonly requestId: string;
	readonly harness: string;
	insertedCount: number;
}

interface IStandaloneOwnership {
	readonly timestamp: number;
	readonly agentModifiedCount: number;
	readonly lastSequence: number;
}

interface ITrackedResource {
	readonly key: string;
	readonly sessionUri: string;
	readonly filePath: string;
	currentContent: string;
	intervals: IAttributedInterval[];
	readonly sources: Map<string, ISourceStatistics>;
	repositoryRoot: string | undefined;
	lastSequence: number;
}

export interface IAgentEditAttributionGitState {
	readonly root: string;
	branch: string;
	head: string;
}

export type AgentEditAttributionGitStateReader = (workingDirectory: string) => Promise<IAgentEditAttributionGitState | undefined>;

interface IPreparedFlush {
	readonly token: string;
	readonly fileKey: string;
	readonly trigger: EditTelemetryTrigger;
	readonly statsUuid: string;
	readonly languageId: string | undefined;
	readonly sources: readonly ISourceStatistics[];
	readonly retainedBySource: ReadonlyMap<string, number>;
	readonly agentModifiedCount: number;
	readonly lastSequence: number;
	readonly resources: readonly ITrackedResource[];
	readonly standaloneOwnership: readonly (readonly [string, IStandaloneOwnership])[];
	readonly timestamp: number;
}

export class AgentEditAttributionService extends Disposable implements IAgentEditAttributionService {
	declare readonly _serviceBrand: undefined;

	private readonly _resources = new Map<string, ITrackedResource>();
	private readonly _claimedResources = new Set<ITrackedResource>();
	private readonly _recordingEdits = new Set<IAgentEditAttribution>();
	private readonly _fileSequencer = new SequencerByKey<string>();
	private readonly _preparedFlushes = new Map<string, IPreparedFlush>();
	private readonly _preparingFlushes = new Map<string, Promise<IPreparedEditAttributionFlush | undefined>>();
	private readonly _settledFlushes = new Map<string, { readonly result: IEditAttributionFlushResult; readonly timestamp: number }>();
	private readonly _standaloneOwnership = new Map<string, IStandaloneOwnership>();
	private readonly _repositories = new Map<string, IAgentEditAttributionGitState>();
	private readonly _nonRepositoryDirectories = new Map<string, number>();
	private _trackedTextLength = 0;
	private _sequence = 0;
	private _generation = 0;
	private _enabled = true;

	constructor(
		private readonly _gitStateReader: AgentEditAttributionGitStateReader = readGitState,
		private readonly _now: () => number = Date.now,
		@IFileService private readonly _fileService: IFileService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(new IntervalTimer()).cancelAndSet(() => {
			void this._flushAll('10hours');
		}, 10 * 60 * 60 * 1000);
		this._register(new IntervalTimer()).cancelAndSet(() => {
			void this.checkGitState();
		}, GIT_STATE_POLL_INTERVAL);
	}

	setEnabled(enabled: boolean): void {
		if (!this._enabled || enabled) {
			return;
		}
		this._enabled = false;
		this._generation++;
		this._resources.clear();
		this._claimedResources.clear();
		this._recordingEdits.clear();
		this._preparedFlushes.clear();
		this._preparingFlushes.clear();
		this._settledFlushes.clear();
		this._standaloneOwnership.clear();
		this._repositories.clear();
		this._nonRepositoryDirectories.clear();
		this._trackedTextLength = 0;
	}

	async recordEdit(edit: IAgentEditAttribution): Promise<IFileEditAttributionMarker | undefined> {
		if (
			!this._enabled ||
			this._telemetryService.telemetryLevel < TelemetryLevel.USAGE
		) {
			return undefined;
		}
		if (Math.max(edit.beforeText.length, edit.afterText.length) > MAX_EDIT_ATTRIBUTION_FILE_SIZE) {
			return {
				version: 1,
				editId: generateUuid(),
				sequence: ++this._sequence,
				status: 'skipped',
				reason: 'fileTooLarge',
				insertedCount: edit.changes.reduce((sum, change) => sum + change.newText.length, 0),
			};
		}

		this._recordingEdits.add(edit);
		try {
			const fileKey = this._filePathKey(edit.filePath);
			return await this._fileSequencer.queue(fileKey, () => this._recordEdit(edit, this._generation, fileKey));
		} finally {
			this._recordingEdits.delete(edit);
		}
	}

	private async _recordEdit(edit: IAgentEditAttribution, generation: number, fileKey: string): Promise<IFileEditAttributionMarker | undefined> {
		const key = resourceKey(edit.sessionUri, edit.filePath);
		await this._ensureCapacity(key, edit.afterText.length, generation, fileKey);
		if (!this._isCurrentGeneration(generation)) {
			return undefined;
		}
		let resource = this._resources.get(key);
		const repository = resource?.repositoryRoot
			? this._repositories.get(resource.repositoryRoot)
			: await this._getOrCreateRepository(edit.filePath, generation);
		if (!this._isCurrentGeneration(generation)) {
			return undefined;
		}
		if (!resource) {
			resource = {
				key,
				sessionUri: edit.sessionUri,
				filePath: edit.filePath,
				currentContent: edit.beforeText,
				intervals: [],
				sources: new Map(),
				repositoryRoot: repository?.root,
				lastSequence: 0,
			};
			this._resources.set(key, resource);
			this._trackedTextLength += edit.beforeText.length;
		} else {
			resource.repositoryRoot = repository?.root;
			this._resources.delete(key);
			this._resources.set(key, resource);
		}

		if (resource.currentContent !== edit.beforeText) {
			const bridge = await this._diffComputeService.computeDiffCounts(resource.currentContent, edit.beforeText);
			if (!this._isCurrentGeneration(generation)) {
				return undefined;
			}
			this._applyChanges(resource, bridge.changes, undefined, edit.beforeText);
		}

		const provider = AgentSession.provider(edit.sessionUri) ?? 'unknown';
		const modelSegment = edit.modelId ? `-$modelId:${edit.modelId}` : '';
		const sourceKey = `source:Chat.applyEdits${modelSegment}-$harness:${provider}-$origin:agentHost`;
		let source = resource.sources.get(sourceKey);
		if (!source) {
			source = {
				sourceKey,
				sourceKeyCleaned: `source:Chat.applyEdits-$harness:${provider}-$origin:agentHost`,
				modelId: edit.modelId,
				conversationId: AgentSession.id(edit.sessionUri),
				requestId: edit.turnId,
				harness: provider,
				insertedCount: 0,
			};
			resource.sources.set(sourceKey, source);
		}
		this._applyChanges(resource, edit.changes, source, edit.afterText);
		const marker: IFileEditAttributionMarker = {
			version: 1,
			editId: generateUuid(),
			sequence: ++this._sequence,
			beforeDigest: createFileEditContentDigest(edit.beforeText),
			afterDigest: createFileEditContentDigest(edit.afterText),
		};
		resource.lastSequence = marker.sequence;
		if (resource.intervals.length > MAX_INTERVALS_PER_RESOURCE) {
			await this._flushStandalone(resource, 'closed', generation, true);
			return this._isCurrentGeneration(generation) ? marker : undefined;
		}

		return marker;
	}

	async flushSession(sessionUri: string): Promise<void> {
		const generation = this._generation;
		if (!this._isCurrentGeneration(generation)) {
			return;
		}
		const resources = Array.from(this._resources.values()).filter(resource => resource.sessionUri === sessionUri);
		await Promise.allSettled(resources.map(resource => this._flushStandalone(resource, 'closed', generation)));
	}

	async prepareFlush(params: IPrepareEditAttributionFlushParams): Promise<IPreparedEditAttributionFlush | undefined> {
		const generation = this._generation;
		if (!this._isCurrentGeneration(generation)) {
			return undefined;
		}
		await this._expireFlushState();
		if (params.isDirty) {
			return undefined;
		}
		const preparing = this._preparingFlushes.get(params.flushToken);
		if (preparing) {
			return preparing;
		}
		const existing = this._preparedFlushes.get(params.flushToken);
		if (existing) {
			return {
				flushToken: existing.token,
				agentModifiedCount: existing.agentModifiedCount,
				lastSequence: existing.lastSequence,
			};
		}
		if (this._settledFlushes.has(params.flushToken)) {
			return undefined;
		}
		const prepare = this._prepareFlush(params, generation);
		this._preparingFlushes.set(params.flushToken, prepare);
		try {
			return await prepare;
		} finally {
			if (this._preparingFlushes.get(params.flushToken) === prepare) {
				this._preparingFlushes.delete(params.flushToken);
			}
		}
	}

	private async _prepareFlush(params: IPrepareEditAttributionFlushParams, generation: number): Promise<IPreparedEditAttributionFlush | undefined> {
		return this._fileSequencer.queue(this._filePathKey(params.resource.fsPath), () => this._prepareFlushLocked(params, generation));
	}

	private async _prepareFlushLocked(params: IPrepareEditAttributionFlushParams, generation: number): Promise<IPreparedEditAttributionFlush | undefined> {
		const standaloneOwnershipKey = this._filePathKey(params.resource.fsPath);
		let standaloneOwnership = this._standaloneOwnership.get(standaloneOwnershipKey);
		if (standaloneOwnership) {
			this._standaloneOwnership.delete(standaloneOwnershipKey);
		}
		const resources = Array.from(this._resources.values()).filter(resource => extUriBiasedIgnorePathCase.isEqual(URI.file(resource.filePath), params.resource));
		if (resources.length === 0 && !standaloneOwnership) {
			return undefined;
		}
		const preparedResources: IPreparedFlush[] = [];
		try {
			for (const resource of resources) {
				const prepared = await this._prepareResourceNow(resource, params.trigger, params.statsUuid, generation);
				if (!this._isCurrentGeneration(generation)) {
					return undefined;
				}
				if (prepared) {
					preparedResources.push(prepared);
				}
			}
		} catch (error) {
			for (const prepared of preparedResources) {
				this._restoreResources(prepared.resources);
			}
			if (standaloneOwnership) {
				this._restoreStandaloneOwnership([[standaloneOwnershipKey, standaloneOwnership]]);
			}
			throw error;
		}
		if (!standaloneOwnership) {
			standaloneOwnership = this._standaloneOwnership.get(standaloneOwnershipKey);
			if (standaloneOwnership) {
				this._standaloneOwnership.delete(standaloneOwnershipKey);
			}
		}
		if (preparedResources.length === 0 && !standaloneOwnership) {
			return undefined;
		}
		const prepared = combinePreparedFlushes(
			preparedResources,
			standaloneOwnershipKey,
			params.trigger,
			params.statsUuid,
			params.flushToken,
			params.languageId,
			standaloneOwnership ? [[standaloneOwnershipKey, standaloneOwnership]] : [],
			this._now(),
		);
		if (!this._isCurrentGeneration(generation)) {
			return undefined;
		}
		if (this._settledFlushes.has(params.flushToken)) {
			this._restoreResources(prepared.resources);
			this._restoreStandaloneOwnership(prepared.standaloneOwnership);
			return undefined;
		}
		this._preparedFlushes.set(prepared.token, prepared);
		return {
			flushToken: prepared.token,
			agentModifiedCount: prepared.agentModifiedCount,
			lastSequence: prepared.lastSequence,
		};
	}

	async commitFlush(params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		if (!this._enabled) {
			return { outcome: 'missing', agentModifiedCount: 0 };
		}
		await this._expireFlushState();
		const prepared = this._preparedFlushes.get(params.flushToken);
		if (!prepared) {
			return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: 'missing', agentModifiedCount: 0 };
		}
		return this._fileSequencer.queue(prepared.fileKey, async () => this._commitFlushNow(params));
	}

	private _commitFlushNow(params: ICommitEditAttributionFlushParams): IEditAttributionFlushResult {
		if (!this._enabled) {
			return { outcome: 'missing', agentModifiedCount: 0 };
		}
		const prepared = this._preparedFlushes.get(params.flushToken);
		if (!prepared) {
			return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: 'missing', agentModifiedCount: 0 };
		}
		this._preparedFlushes.delete(params.flushToken);
		this._releaseResourceClaims(prepared.resources);
		this._emitTelemetry(prepared, params.totalModifiedCount);
		const result = { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount } as const;
		this._recordSettledFlush(params.flushToken, result);
		this._cleanupRepositories(prepared.resources);
		return result;
	}

	async cancelFlush(params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		const preparing = this._preparingFlushes.get(params.flushToken);
		if (preparing) {
			try {
				await preparing;
			} catch {
				// The prepare path restores its own resources before rejecting.
			}
		}
		if (!this._enabled) {
			return { outcome: 'missing', agentModifiedCount: 0 };
		}
		await this._expireFlushState();
		const settled = this._settledFlushes.get(params.flushToken);
		if (settled) {
			return settled.result;
		}
		const prepared = this._preparedFlushes.get(params.flushToken);
		if (!prepared) {
			const result = { outcome: 'cancelled', agentModifiedCount: 0 } as const;
			this._recordSettledFlush(params.flushToken, result);
			return result;
		}
		return this._fileSequencer.queue(prepared.fileKey, async () => this._cancelFlushNow(params));
	}

	private _cancelFlushNow(params: ICancelEditAttributionFlushParams): IEditAttributionFlushResult {
		if (!this._enabled) {
			return { outcome: 'missing', agentModifiedCount: 0 };
		}
		const settled = this._settledFlushes.get(params.flushToken);
		if (settled) {
			return settled.result;
		}
		const prepared = this._preparedFlushes.get(params.flushToken);
		if (!prepared) {
			const result = { outcome: 'cancelled', agentModifiedCount: 0 } as const;
			this._recordSettledFlush(params.flushToken, result);
			return result;
		}
		this._preparedFlushes.delete(params.flushToken);
		if (prepared.resources.some(resource => this._resources.has(resource.key))) {
			this._releaseResourceClaims(prepared.resources);
			this._emitTelemetry(prepared, prepared.agentModifiedCount);
			const result = { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount } as const;
			this._recordSettledFlush(params.flushToken, result);
			this._cleanupRepositories(prepared.resources);
			return result;
		} else {
			this._restoreResources(prepared.resources);
			this._restoreStandaloneOwnership(prepared.standaloneOwnership);
		}
		const result = { outcome: 'cancelled', agentModifiedCount: 0 } as const;
		this._recordSettledFlush(params.flushToken, result);
		this._cleanupRepositories(prepared.resources);
		return result;
	}

	private async _ensureCapacity(key: string, nextLength: number, generation: number, lockedFileKey: string): Promise<void> {
		while (this._isCurrentGeneration(generation)) {
			const existing = this._resources.get(key);
			const projectedTextLength = this._trackedTextLength - (existing?.currentContent.length ?? 0) + nextLength;
			if (this._resources.size < MAX_TRACKED_RESOURCES && projectedTextLength <= MAX_TOTAL_TRACKED_TEXT) {
				return;
			}
			const sameFileResource = Array.from(this._resources.values()).find(resource => this._filePathKey(resource.filePath) === lockedFileKey);
			const resource = existing ?? sameFileResource ?? this._resources.values().next().value;
			if (!resource) {
				return;
			}
			await this._flushStandalone(resource, 'closed', generation, this._filePathKey(resource.filePath) === lockedFileKey);
		}
	}

	private _applyChanges(resource: ITrackedResource, changes: readonly IOffsetEdit[], source: ISourceStatistics | undefined, afterText: string, updateTrackedTextLength = true): void {
		const normalizedChanges = validateChanges(resource.currentContent, afterText, changes)
			? changes
			: [createMinimalChange(resource.currentContent, afterText)];
		const intervals = transformIntervals(resource.intervals, normalizedChanges);
		let delta = 0;
		for (const change of normalizedChanges) {
			if (source && change.newText.length > 0) {
				const start = change.startOffset + delta;
				intervals.push({
					start,
					endExclusive: start + change.newText.length,
					sourceKey: source.sourceKey,
				});
				source.insertedCount += change.newText.length;
			}
			delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
		}
		intervals.sort((a, b) => a.start - b.start);
		resource.intervals = mergeIntervals(intervals);
		if (updateTrackedTextLength) {
			this._trackedTextLength += afterText.length - resource.currentContent.length;
		}
		resource.currentContent = afterText;
	}

	private async _flushAll(trigger: EditTelemetryTrigger): Promise<void> {
		const generation = this._generation;
		if (!this._isCurrentGeneration(generation)) {
			return;
		}
		await Promise.allSettled(Array.from(this._resources.values(), resource => this._flushStandalone(resource, trigger, generation)));
	}

	async checkGitState(): Promise<void> {
		const generation = this._generation;
		if (!this._isCurrentGeneration(generation)) {
			return;
		}
		await this._expireFlushState();
		for (const repository of Array.from(this._repositories.values())) {
			let current: IAgentEditAttributionGitState | undefined;
			try {
				current = await this._gitStateReader(repository.root);
			} catch (error) {
				this._logService.warn(`[AgentEditAttributionService] Failed to read Git state for ${repository.root}: ${error}`);
				continue;
			}
			if (!this._isCurrentGeneration(generation)) {
				return;
			}
			if (!current) {
				continue;
			}
			const trigger = current.branch !== repository.branch
				? 'branchChange'
				: current.head !== repository.head
					? 'hashChange'
					: undefined;
			if (!trigger) {
				continue;
			}
			const resources = Array.from(this._resources.values()).filter(resource => resource.repositoryRoot === repository.root && !this._isRecordingFile(resource.filePath));
			const results = await Promise.allSettled(resources.map(resource => this._flushStandalone(resource, trigger, generation)));
			const hasPendingResources = Array.from(this._resources.values()).some(resource => resource.repositoryRoot === repository.root);
			const hasClaimedResources = Array.from(this._claimedResources).some(resource => resource.repositoryRoot === repository.root);
			const hasRecordingEdits = Array.from(this._recordingEdits).some(edit => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repository.root)));
			if (this._isCurrentGeneration(generation) && results.every(result => result.status === 'fulfilled') && !hasPendingResources && !hasClaimedResources && !hasRecordingEdits) {
				repository.branch = current.branch;
				repository.head = current.head;
			}
		}
	}

	private async _getOrCreateRepository(filePath: string, generation: number): Promise<IAgentEditAttributionGitState | undefined> {
		const workingDirectory = dirname(filePath);
		const nonRepositoryTimestamp = this._nonRepositoryDirectories.get(workingDirectory);
		if (nonRepositoryTimestamp !== undefined && nonRepositoryTimestamp >= this._now() - NON_REPOSITORY_DIRECTORY_TTL) {
			return undefined;
		}
		this._nonRepositoryDirectories.delete(workingDirectory);
		const current = await this._gitStateReader(workingDirectory);
		if (!this._isCurrentGeneration(generation)) {
			return undefined;
		}
		if (!current) {
			this._recordNonRepositoryDirectory(workingDirectory);
			return undefined;
		}
		const existing = this._repositories.get(current.root);
		if (existing) {
			return existing;
		}
		this._repositories.set(current.root, current);
		return current;
	}

	private async _flushStandalone(resource: ITrackedResource, trigger: EditTelemetryTrigger, generation: number, fileLockHeld = false): Promise<void> {
		if (!fileLockHeld) {
			return this._fileSequencer.queue(this._filePathKey(resource.filePath), () => this._flushStandalone(resource, trigger, generation, true));
		}
		const prepared = await this._prepareResourceNow(resource, trigger, generateUuid(), generation);
		if (!prepared || !this._isCurrentGeneration(generation)) {
			return;
		}
		this._preparedFlushes.set(prepared.token, prepared);
		this._commitFlushNow({
			flushToken: prepared.token,
			totalModifiedCount: prepared.agentModifiedCount,
		});
		if (this._isCurrentGeneration(generation)) {
			this._recordStandaloneOwnership(resource.filePath, prepared.agentModifiedCount, prepared.lastSequence);
		}
	}

	private async _prepareResourceNow(resource: ITrackedResource, trigger: EditTelemetryTrigger, statsUuid: string, generation: number): Promise<IPreparedFlush | undefined> {
		if (!this._isCurrentGeneration(generation) || this._resources.get(resource.key) !== resource) {
			return undefined;
		}
		this._resources.delete(resource.key);
		this._claimedResources.add(resource);
		this._trackedTextLength -= resource.currentContent.length;
		try {
			const currentContent = await this._readCurrentContent(resource.filePath);
			if (!this._isCurrentGeneration(generation)) {
				return undefined;
			}
			if (currentContent !== resource.currentContent) {
				const diff = await this._diffComputeService.computeDiffCounts(resource.currentContent, currentContent);
				if (!this._isCurrentGeneration(generation)) {
					return undefined;
				}
				this._applyChanges(resource, diff.changes, undefined, currentContent, false);
			}
			const retainedBySource = new Map<string, number>();
			for (const interval of resource.intervals) {
				retainedBySource.set(interval.sourceKey, (retainedBySource.get(interval.sourceKey) ?? 0) + interval.endExclusive - interval.start);
			}
			const prepared: IPreparedFlush = {
				token: generateUuid(),
				fileKey: this._filePathKey(resource.filePath),
				trigger,
				statsUuid,
				languageId: undefined,
				sources: Array.from(resource.sources.values())
					.toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0))
					.slice(0, 30),
				retainedBySource,
				agentModifiedCount: Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
				lastSequence: resource.lastSequence,
				resources: [resource],
				standaloneOwnership: [],
				timestamp: this._now(),
			};
			return prepared;
		} catch (error) {
			if (!this._isCurrentGeneration(generation)) {
				return undefined;
			}
			this._logService.warn(`[AgentEditAttributionService] Failed to flush ${resource.filePath}: ${error}`);
			this._restoreResources([resource]);
			throw error;
		}
	}

	private _emitTelemetry(prepared: IPreparedFlush, totalModifiedCount: number): void {
		if (!this._enabled) {
			return;
		}
		for (const source of prepared.sources) {
			const data = {
				mode: 'longterm',
				sourceKey: source.sourceKey,
				sourceKeyCleaned: source.sourceKeyCleaned,
				extensionId: undefined,
				extensionVersion: undefined,
				modelId: source.modelId,
				trigger: prepared.trigger,
				languageId: prepared.languageId,
				statsUuid: prepared.statsUuid,
				conversationId: source.conversationId,
				requestId: source.requestId,
				origin: 'agentHost',
				harness: source.harness,
				modifiedCount: prepared.retainedBySource.get(source.sourceKey) ?? 0,
				deltaModifiedCount: source.insertedCount,
				totalModifiedCount,
			} as const;
			sendEditSourcesDetailsTelemetry(this._telemetryService, data);
			const agentHostTelemetryService = this._telemetryService as Partial<IAgentHostTelemetryService>;
			agentHostTelemetryService.sendGHTelemetryEvent?.('editTelemetry.editSources.details', {
				mode: data.mode,
				sourceKey: data.sourceKey,
				sourceKeyCleaned: data.sourceKeyCleaned,
				extensionId: '',
				extensionVersion: '',
				modelId: data.modelId ?? '',
				trigger: data.trigger,
				languageId: data.languageId ?? '',
				statsUuid: data.statsUuid,
				conversationId: data.conversationId,
				requestId: data.requestId,
				origin: data.origin,
				harness: data.harness,
			}, {
				modifiedCount: data.modifiedCount,
				deltaModifiedCount: data.deltaModifiedCount,
				totalModifiedCount: data.totalModifiedCount,
			});
		}
	}

	private async _readCurrentContent(filePath: string): Promise<string> {
		try {
			return (await this._fileService.readFile(URI.file(filePath))).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return '';
			}
			throw error;
		}
	}

	private _restoreResources(resources: readonly ITrackedResource[]): void {
		for (const resource of resources) {
			this._claimedResources.delete(resource);
			if (!this._resources.has(resource.key)) {
				this._resources.set(resource.key, resource);
				this._trackedTextLength += resource.currentContent.length;
			}
		}
	}

	private _releaseResourceClaims(resources: readonly ITrackedResource[]): void {
		for (const resource of resources) {
			this._claimedResources.delete(resource);
		}
	}

	private _cleanupRepositories(resources: readonly ITrackedResource[]): void {
		for (const resource of resources) {
			const repositoryRoot = resource.repositoryRoot;
			if (
				repositoryRoot &&
				!Array.from(this._resources.values()).some(candidate => candidate.repositoryRoot === repositoryRoot) &&
				!Array.from(this._claimedResources).some(candidate => candidate.repositoryRoot === repositoryRoot) &&
				!Array.from(this._recordingEdits).some(edit => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repositoryRoot))) &&
				!Array.from(this._preparedFlushes.values()).some(prepared => prepared.resources.some(candidate => candidate.repositoryRoot === repositoryRoot))
			) {
				this._repositories.delete(repositoryRoot);
			}
			const workingDirectory = dirname(resource.filePath);
			if (
				!Array.from(this._resources.values()).some(candidate => dirname(candidate.filePath) === workingDirectory) &&
				!Array.from(this._claimedResources).some(candidate => dirname(candidate.filePath) === workingDirectory) &&
				!Array.from(this._preparedFlushes.values()).some(prepared => prepared.resources.some(candidate => dirname(candidate.filePath) === workingDirectory))
			) {
				this._nonRepositoryDirectories.delete(workingDirectory);
			}
		}
	}

	private _recordNonRepositoryDirectory(workingDirectory: string): void {
		this._nonRepositoryDirectories.delete(workingDirectory);
		this._nonRepositoryDirectories.set(workingDirectory, this._now());
		while (this._nonRepositoryDirectories.size > MAX_NON_REPOSITORY_DIRECTORIES) {
			const oldestDirectory = this._nonRepositoryDirectories.keys().next().value;
			if (oldestDirectory === undefined) {
				break;
			}
			this._nonRepositoryDirectories.delete(oldestDirectory);
		}
	}

	private _isCurrentGeneration(generation: number): boolean {
		return this._enabled && generation === this._generation;
	}

	private _recordSettledFlush(flushToken: string, result: IEditAttributionFlushResult): void {
		this._settledFlushes.delete(flushToken);
		this._settledFlushes.set(flushToken, { result, timestamp: this._now() });
		while (this._settledFlushes.size > MAX_SETTLED_FLUSHES) {
			const oldestToken = this._settledFlushes.keys().next().value;
			if (oldestToken === undefined) {
				break;
			}
			this._settledFlushes.delete(oldestToken);
		}
	}

	private _recordStandaloneOwnership(filePath: string, agentModifiedCount: number, lastSequence: number): void {
		const key = this._filePathKey(filePath);
		this._restoreStandaloneOwnership([[key, {
			timestamp: this._now(),
			agentModifiedCount,
			lastSequence,
		}]]);
	}

	private _restoreStandaloneOwnership(ownership: readonly (readonly [string, IStandaloneOwnership])[]): void {
		for (const [key, value] of ownership) {
			const existing = this._standaloneOwnership.get(key);
			this._standaloneOwnership.delete(key);
			this._standaloneOwnership.set(key, {
				timestamp: Math.max(existing?.timestamp ?? 0, value.timestamp),
				agentModifiedCount: (existing?.agentModifiedCount ?? 0) + value.agentModifiedCount,
				lastSequence: Math.max(existing?.lastSequence ?? 0, value.lastSequence),
			});
		}
		while (this._standaloneOwnership.size > MAX_STANDALONE_OWNERSHIP) {
			const oldestKey = this._standaloneOwnership.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this._standaloneOwnership.delete(oldestKey);
		}
	}

	private _filePathKey(filePath: string): string {
		return extUriBiasedIgnorePathCase.getComparisonKey(URI.file(filePath));
	}

	private _isRecordingFile(filePath: string): boolean {
		const resource = URI.file(filePath);
		return Array.from(this._recordingEdits).some(edit => extUriBiasedIgnorePathCase.isEqual(URI.file(edit.filePath), resource));
	}

	private async _expireFlushState(): Promise<void> {
		const now = this._now();
		const expirations: Promise<void>[] = [];
		for (const [flushToken, prepared] of this._preparedFlushes) {
			if (prepared.timestamp < now - PREPARED_FLUSH_TTL) {
				expirations.push(this._fileSequencer.queue(prepared.fileKey, async () => this._expirePreparedFlush(flushToken, prepared, now)));
			}
		}
		await Promise.allSettled(expirations);
		for (const [flushToken, settled] of this._settledFlushes) {
			if (settled.timestamp < now - SETTLED_FLUSH_TTL) {
				this._settledFlushes.delete(flushToken);
			}
		}
		for (const [resourceKey, ownership] of this._standaloneOwnership) {
			if (ownership.timestamp < now - STANDALONE_OWNERSHIP_TTL) {
				this._standaloneOwnership.delete(resourceKey);
			}
		}
	}

	private _expirePreparedFlush(flushToken: string, prepared: IPreparedFlush, now: number): void {
		if (this._preparedFlushes.get(flushToken) !== prepared || prepared.timestamp >= now - PREPARED_FLUSH_TTL) {
			return;
		}
		this._preparedFlushes.delete(flushToken);
		if (prepared.resources.some(resource => this._resources.has(resource.key))) {
			this._releaseResourceClaims(prepared.resources);
			this._emitTelemetry(prepared, prepared.agentModifiedCount);
			this._recordSettledFlush(flushToken, { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount });
		} else {
			this._restoreResources(prepared.resources);
			this._restoreStandaloneOwnership(prepared.standaloneOwnership);
			this._recordSettledFlush(flushToken, { outcome: 'cancelled', agentModifiedCount: 0 });
		}
		this._cleanupRepositories(prepared.resources);
	}

	override dispose(): void {
		void this._flushAll('closed');
		super.dispose();
	}
}

function resourceKey(sessionUri: string, filePath: string): string {
	return `${sessionUri}\0${filePath}`;
}

function combinePreparedFlushes(
	flushes: readonly IPreparedFlush[],
	fileKey: string,
	trigger: EditTelemetryTrigger,
	statsUuid: string,
	flushToken: string,
	languageId: string,
	standaloneOwnership: readonly (readonly [string, IStandaloneOwnership])[],
	timestamp: number,
): IPreparedFlush {
	const retainedBySource = new Map<string, number>();
	const sources = new Map<string, ISourceStatistics>();
	for (const flush of flushes) {
		for (const [sourceKey, retainedCount] of flush.retainedBySource) {
			retainedBySource.set(sourceKey, (retainedBySource.get(sourceKey) ?? 0) + retainedCount);
		}
		for (const source of flush.sources) {
			const existing = sources.get(source.sourceKey);
			if (existing) {
				existing.insertedCount += source.insertedCount;
			} else {
				sources.set(source.sourceKey, { ...source });
			}
		}
	}
	return {
		token: flushToken,
		fileKey,
		trigger,
		statsUuid,
		languageId,
		sources: Array.from(sources.values())
			.toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0))
			.slice(0, 30),
		retainedBySource,
		agentModifiedCount: standaloneOwnership.reduce((sum, [, value]) => sum + value.agentModifiedCount, 0) + Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
		lastSequence: Math.max(
			0,
			...flushes.map(flush => flush.lastSequence),
			...standaloneOwnership.map(([, value]) => value.lastSequence),
		),
		resources: flushes.flatMap(flush => flush.resources),
		standaloneOwnership,
		timestamp,
	};
}

function validateChanges(before: string, after: string, changes: readonly IOffsetEdit[]): boolean {
	let result = '';
	let lastOffset = 0;
	for (const change of changes) {
		if (change.startOffset < lastOffset || change.endOffsetExclusive < change.startOffset || change.endOffsetExclusive > before.length) {
			return false;
		}
		result += before.substring(lastOffset, change.startOffset);
		result += change.newText;
		lastOffset = change.endOffsetExclusive;
	}
	return result + before.substring(lastOffset) === after;
}

function createMinimalChange(before: string, after: string): IOffsetEdit {
	let prefixLength = 0;
	while (prefixLength < before.length && prefixLength < after.length && before.charCodeAt(prefixLength) === after.charCodeAt(prefixLength)) {
		prefixLength++;
	}
	let suffixLength = 0;
	while (
		suffixLength < before.length - prefixLength &&
		suffixLength < after.length - prefixLength &&
		before.charCodeAt(before.length - suffixLength - 1) === after.charCodeAt(after.length - suffixLength - 1)
	) {
		suffixLength++;
	}
	return {
		startOffset: prefixLength,
		endOffsetExclusive: before.length - suffixLength,
		newText: after.substring(prefixLength, after.length - suffixLength),
	};
}

function transformIntervals(intervals: readonly IAttributedInterval[], changes: readonly IOffsetEdit[]): IAttributedInterval[] {
	const result: IAttributedInterval[] = [];
	for (const interval of intervals) {
		let cursor = interval.start;
		let delta = 0;
		for (const change of changes) {
			if (change.endOffsetExclusive <= cursor) {
				delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
				continue;
			}
			if (change.startOffset >= interval.endExclusive) {
				break;
			}
			if (cursor < change.startOffset) {
				result.push({
					start: cursor + delta,
					endExclusive: Math.min(interval.endExclusive, change.startOffset) + delta,
					sourceKey: interval.sourceKey,
				});
			}
			cursor = Math.max(cursor, change.endOffsetExclusive);
			delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
		}
		if (cursor < interval.endExclusive) {
			result.push({
				start: cursor + delta,
				endExclusive: interval.endExclusive + delta,
				sourceKey: interval.sourceKey,
			});
		}
	}
	return result;
}

function mergeIntervals(intervals: readonly IAttributedInterval[]): IAttributedInterval[] {
	const result: IAttributedInterval[] = [];
	for (const interval of intervals) {
		if (interval.start === interval.endExclusive) {
			continue;
		}
		const previous = result[result.length - 1];
		if (previous?.sourceKey === interval.sourceKey && previous.endExclusive === interval.start) {
			result[result.length - 1] = {
				start: previous.start,
				endExclusive: interval.endExclusive,
				sourceKey: interval.sourceKey,
			};
		} else {
			result.push(interval);
		}
	}
	return result;
}

async function readGitState(workingDirectory: string): Promise<IAgentEditAttributionGitState | undefined> {
	try {
		const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel', 'HEAD', '--abbrev-ref', 'HEAD'], {
			cwd: workingDirectory,
			timeout: GIT_STATE_TIMEOUT,
		});
		const [root, head, branch] = stdout.trim().split(/\r?\n/);
		if (!root || !head || !branch) {
			return undefined;
		}
		return {
			root,
			head,
			branch: branch === 'HEAD' ? '' : branch,
		};
	} catch {
		return undefined;
	}
}
