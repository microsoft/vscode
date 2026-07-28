/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { promisify } from 'util';
import { IntervalTimer } from '../../../../base/common/async.js';
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
const PREPARED_FLUSH_TTL = 5 * 60 * 1000;
const SETTLED_FLUSH_TTL = 10 * 60 * 1000;
const STANDALONE_OWNERSHIP_TTL = 10 * 60 * 60 * 1000;
const GIT_STATE_POLL_INTERVAL = 30_000;
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

interface ITrackedResource {
	readonly key: string;
	readonly sessionUri: string;
	readonly filePath: string;
	currentContent: string;
	intervals: IAttributedInterval[];
	readonly sources: Map<string, ISourceStatistics>;
	repositoryRoot: string | undefined;
}

export interface IAgentEditAttributionGitState {
	readonly root: string;
	branch: string;
	head: string;
}

export type AgentEditAttributionGitStateReader = (workingDirectory: string) => Promise<IAgentEditAttributionGitState | undefined>;

interface IPreparedFlush {
	readonly token: string;
	readonly trigger: EditTelemetryTrigger;
	readonly statsUuid: string;
	readonly languageId: string | undefined;
	readonly sources: readonly ISourceStatistics[];
	readonly retainedBySource: ReadonlyMap<string, number>;
	readonly agentModifiedCount: number;
	readonly resources: readonly ITrackedResource[];
	readonly standaloneOwnershipKeys: readonly string[];
	readonly timestamp: number;
}

export class AgentEditAttributionService extends Disposable implements IAgentEditAttributionService {
	declare readonly _serviceBrand: undefined;

	private readonly _resources = new Map<string, ITrackedResource>();
	private readonly _preparedFlushes = new Map<string, IPreparedFlush>();
	private readonly _settledFlushes = new Map<string, { readonly result: IEditAttributionFlushResult; readonly timestamp: number }>();
	private readonly _standaloneOwnership = new Map<string, { readonly timestamp: number; readonly agentModifiedCount: number }>();
	private readonly _repositories = new Map<string, IAgentEditAttributionGitState>();
	private readonly _nonRepositoryDirectories = new Set<string>();
	private _trackedTextLength = 0;
	private _sequence = 0;
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
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;
		if (!enabled) {
			this._resources.clear();
			this._preparedFlushes.clear();
			this._settledFlushes.clear();
			this._standaloneOwnership.clear();
			this._repositories.clear();
			this._nonRepositoryDirectories.clear();
			this._trackedTextLength = 0;
		}
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

		const key = resourceKey(edit.sessionUri, edit.filePath);
		await this._ensureCapacity(key, edit.afterText.length);
		let resource = this._resources.get(key);
		const repository = resource?.repositoryRoot
			? this._repositories.get(resource.repositoryRoot)
			: await this._getOrCreateRepository(edit.filePath);
		if (!resource) {
			resource = {
				key,
				sessionUri: edit.sessionUri,
				filePath: edit.filePath,
				currentContent: edit.beforeText,
				intervals: [],
				sources: new Map(),
				repositoryRoot: repository?.root,
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
		if (resource.intervals.length > MAX_INTERVALS_PER_RESOURCE) {
			await this._flushStandalone(resource, 'closed');
			return undefined;
		}

		return {
			version: 1,
			editId: generateUuid(),
			sequence: ++this._sequence,
			beforeDigest: createFileEditContentDigest(edit.beforeText),
			afterDigest: createFileEditContentDigest(edit.afterText),
		};
	}

	async flushSession(sessionUri: string): Promise<void> {
		const resources = Array.from(this._resources.values()).filter(resource => resource.sessionUri === sessionUri);
		await Promise.all(resources.map(resource => this._flushStandalone(resource, 'closed')));
	}

	async prepareFlush(params: IPrepareEditAttributionFlushParams): Promise<IPreparedEditAttributionFlush | undefined> {
		this._expireFlushState();
		if (params.isDirty) {
			return undefined;
		}
		const existing = this._preparedFlushes.get(params.flushToken);
		if (existing) {
			return {
				flushToken: existing.token,
				agentModifiedCount: existing.agentModifiedCount,
			};
		}
		if (this._settledFlushes.has(params.flushToken)) {
			return undefined;
		}
		const standaloneOwnershipKey = this._filePathKey(params.resource.fsPath);
		const standaloneOwnership = this._standaloneOwnership.get(standaloneOwnershipKey);
		const resources = Array.from(this._resources.values()).filter(resource => extUriBiasedIgnorePathCase.isEqual(URI.file(resource.filePath), params.resource));
		if (resources.length === 0 && !standaloneOwnership) {
			return undefined;
		}
		const preparedResources: IPreparedFlush[] = [];
		try {
			for (const resource of resources) {
				const prepared = await this._prepareResource(resource, params.trigger, params.statsUuid);
				if (prepared) {
					preparedResources.push(prepared);
				}
			}
		} catch (error) {
			for (const prepared of preparedResources) {
				this._restoreResources(prepared.resources);
			}
			throw error;
		}
		const prepared = combinePreparedFlushes(
			preparedResources,
			params.trigger,
			params.statsUuid,
			params.flushToken,
			params.languageId,
			standaloneOwnership ? [standaloneOwnershipKey] : [],
			standaloneOwnership?.agentModifiedCount ?? 0,
			this._now(),
		);
		this._preparedFlushes.set(prepared.token, prepared);
		return {
			flushToken: prepared.token,
			agentModifiedCount: prepared.agentModifiedCount,
		};
	}

	async commitFlush(params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		this._expireFlushState();
		const prepared = this._preparedFlushes.get(params.flushToken);
		if (!prepared) {
			return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: 'missing', agentModifiedCount: 0 };
		}
		this._preparedFlushes.delete(params.flushToken);
		this._emitTelemetry(prepared, params.totalModifiedCount);
		for (const ownershipKey of prepared.standaloneOwnershipKeys) {
			this._standaloneOwnership.delete(ownershipKey);
		}
		const result = { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount } as const;
		this._recordSettledFlush(params.flushToken, result);
		this._cleanupRepositories(prepared.resources);
		return result;
	}

	async cancelFlush(params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		this._expireFlushState();
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
			this._emitTelemetry(prepared, prepared.agentModifiedCount);
			for (const ownershipKey of prepared.standaloneOwnershipKeys) {
				this._standaloneOwnership.delete(ownershipKey);
			}
			const result = { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount } as const;
			this._recordSettledFlush(params.flushToken, result);
			this._cleanupRepositories(prepared.resources);
			return result;
		} else {
			this._restoreResources(prepared.resources);
		}
		const result = { outcome: 'cancelled', agentModifiedCount: 0 } as const;
		this._recordSettledFlush(params.flushToken, result);
		this._cleanupRepositories(prepared.resources);
		return result;
	}

	private async _ensureCapacity(key: string, nextLength: number): Promise<void> {
		const existingLength = this._resources.get(key)?.currentContent.length ?? 0;
		while (
			this._resources.size >= MAX_TRACKED_RESOURCES ||
			this._trackedTextLength - existingLength + nextLength > MAX_TOTAL_TRACKED_TEXT
		) {
			const oldest = this._resources.values().next().value;
			if (!oldest) {
				return;
			}
			await this._flushStandalone(oldest, 'closed');
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
		await Promise.all(Array.from(this._resources.values(), resource => this._flushStandalone(resource, trigger)));
	}

	async checkGitState(): Promise<void> {
		this._expireFlushState();
		for (const repository of Array.from(this._repositories.values())) {
			const current = await this._gitStateReader(repository.root);
			if (!current) {
				continue;
			}
			const trigger = current.branch !== repository.branch
				? 'branchChange'
				: current.head !== repository.head
					? 'hashChange'
					: undefined;
			repository.branch = current.branch;
			repository.head = current.head;
			if (!trigger) {
				continue;
			}
			const resources = Array.from(this._resources.values()).filter(resource => resource.repositoryRoot === repository.root);
			await Promise.all(resources.map(resource => this._flushStandalone(resource, trigger)));
		}
	}

	private async _getOrCreateRepository(filePath: string): Promise<IAgentEditAttributionGitState | undefined> {
		const workingDirectory = dirname(filePath);
		if (this._nonRepositoryDirectories.has(workingDirectory)) {
			return undefined;
		}
		const current = await this._gitStateReader(workingDirectory);
		if (!current) {
			this._nonRepositoryDirectories.add(workingDirectory);
			return undefined;
		}
		const existing = this._repositories.get(current.root);
		if (existing) {
			return existing;
		}
		this._repositories.set(current.root, current);
		return current;
	}

	private async _flushStandalone(resource: ITrackedResource, trigger: EditTelemetryTrigger): Promise<void> {
		const prepared = await this._prepareResource(resource, trigger, generateUuid());
		if (!prepared) {
			return;
		}
		this._preparedFlushes.set(prepared.token, prepared);
		await this.commitFlush({
			flushToken: prepared.token,
			totalModifiedCount: prepared.agentModifiedCount,
		});
		this._recordStandaloneOwnership(resource.filePath, prepared.agentModifiedCount);
	}

	private async _prepareResource(resource: ITrackedResource, trigger: EditTelemetryTrigger, statsUuid: string): Promise<IPreparedFlush | undefined> {
		if (this._resources.get(resource.key) !== resource) {
			return undefined;
		}
		this._resources.delete(resource.key);
		this._trackedTextLength -= resource.currentContent.length;
		try {
			const currentContent = await this._readCurrentContent(resource.filePath);
			if (currentContent !== resource.currentContent) {
				const diff = await this._diffComputeService.computeDiffCounts(resource.currentContent, currentContent);
				this._applyChanges(resource, diff.changes, undefined, currentContent, false);
			}
			const retainedBySource = new Map<string, number>();
			for (const interval of resource.intervals) {
				retainedBySource.set(interval.sourceKey, (retainedBySource.get(interval.sourceKey) ?? 0) + interval.endExclusive - interval.start);
			}
			const prepared: IPreparedFlush = {
				token: generateUuid(),
				trigger,
				statsUuid,
				languageId: undefined,
				sources: Array.from(resource.sources.values())
					.toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0))
					.slice(0, 30),
				retainedBySource,
				agentModifiedCount: Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
				resources: [resource],
				standaloneOwnershipKeys: [],
				timestamp: this._now(),
			};
			return prepared;
		} catch (error) {
			this._logService.warn(`[AgentEditAttributionService] Failed to flush ${resource.filePath}: ${error}`);
			if (!this._resources.has(resource.key)) {
				this._resources.set(resource.key, resource);
				this._trackedTextLength += resource.currentContent.length;
			}
			throw error;
		}
	}

	private _emitTelemetry(prepared: IPreparedFlush, totalModifiedCount: number): void {
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
			if (!this._resources.has(resource.key)) {
				this._resources.set(resource.key, resource);
				this._trackedTextLength += resource.currentContent.length;
			}
		}
	}

	private _cleanupRepositories(resources: readonly ITrackedResource[]): void {
		for (const resource of resources) {
			const repositoryRoot = resource.repositoryRoot;
			if (
				repositoryRoot &&
				!Array.from(this._resources.values()).some(candidate => candidate.repositoryRoot === repositoryRoot) &&
				!Array.from(this._preparedFlushes.values()).some(prepared => prepared.resources.some(candidate => candidate.repositoryRoot === repositoryRoot))
			) {
				this._repositories.delete(repositoryRoot);
			}
		}
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

	private _recordStandaloneOwnership(filePath: string, agentModifiedCount: number): void {
		const key = this._filePathKey(filePath);
		const existing = this._standaloneOwnership.get(key);
		this._standaloneOwnership.delete(key);
		this._standaloneOwnership.set(key, {
			timestamp: this._now(),
			agentModifiedCount: (existing?.agentModifiedCount ?? 0) + agentModifiedCount,
		});
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

	private _expireFlushState(): void {
		const now = this._now();
		for (const [flushToken, prepared] of this._preparedFlushes) {
			if (prepared.timestamp < now - PREPARED_FLUSH_TTL) {
				this._preparedFlushes.delete(flushToken);
				if (prepared.resources.some(resource => this._resources.has(resource.key))) {
					this._emitTelemetry(prepared, prepared.agentModifiedCount);
					this._recordSettledFlush(flushToken, { outcome: 'committed', agentModifiedCount: prepared.agentModifiedCount });
				} else {
					this._restoreResources(prepared.resources);
					this._recordSettledFlush(flushToken, { outcome: 'cancelled', agentModifiedCount: 0 });
				}
				this._cleanupRepositories(prepared.resources);
			}
		}
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
	trigger: EditTelemetryTrigger,
	statsUuid: string,
	flushToken: string,
	languageId: string,
	standaloneOwnershipKeys: readonly string[],
	standaloneAgentModifiedCount: number,
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
		trigger,
		statsUuid,
		languageId,
		sources: Array.from(sources.values())
			.toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0))
			.slice(0, 30),
		retainedBySource,
		agentModifiedCount: standaloneAgentModifiedCount + Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
		resources: flushes.flatMap(flush => flush.resources),
		standaloneOwnershipKeys,
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
		const [{ stdout: rootOutput }, { stdout: headOutput }, branchResult] = await Promise.all([
			execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: workingDirectory }),
			execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workingDirectory }),
			execFileAsync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: workingDirectory }).catch(() => ({ stdout: '' })),
		]);
		return {
			root: rootOutput.trim(),
			head: headOutput.trim(),
			branch: branchResult.stdout.trim(),
		};
	} catch {
		return undefined;
	}
}
