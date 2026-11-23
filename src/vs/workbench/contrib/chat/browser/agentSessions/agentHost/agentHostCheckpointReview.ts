/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout } from '../../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { IObservable, IReader, ITransaction, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { FileEditKind } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import type { IToolCallFileEdit } from './stateToProgressAdapter.js';

export interface IAgentHostCheckpointReviewFile {
	readonly diff: IEditSessionEntryDiff;
	readonly nonce: string | undefined;
}

export interface IAgentHostCheckpointReviewSource {
	readonly channel: URI;
	readonly ready: boolean;
	readonly failed?: boolean;
	readonly files: readonly IAgentHostCheckpointReviewFile[];
}

interface IRestoredReviewFile extends IAgentHostCheckpointReviewFile {
	readonly channel: URI;
}

/** Excludes fully restored revisions during reversible checkpoint preview, without discarding host history. */
export class AgentHostCheckpointReview extends Disposable {
	private readonly _sources = new Set<IObservable<IAgentHostCheckpointReviewSource | undefined>>();
	private readonly _restored = observableValue<readonly IRestoredReviewFile[]>(this, []);
	private readonly _lifetime = cancelOnDispose(this._store);

	constructor(private readonly _fileService: IFileService, private readonly _logService: ILogService) {
		super();
	}

	registerSource(source: IObservable<IAgentHostCheckpointReviewSource | undefined>): IDisposable {
		this._sources.add(source);
		return toDisposable(() => this._sources.delete(source));
	}

	project<T extends IAgentHostCheckpointReviewFile>(channel: URI, files: readonly T[], reader?: IReader): readonly T[] {
		const restored = this._restored.read(reader);
		return files.filter(file => !restored.some(previous =>
			isEqual(previous.channel, channel)
			&& isEqual(previous.diff.modifiedURI, file.diff.modifiedURI)
			&& isEqual(previous.diff.originalURI, file.diff.originalURI)
			&& isEqual(previous.diff.modifiedSnapshotURI, file.diff.modifiedSnapshotURI)
			&& !!previous.diff.isCreated === !!file.diff.isCreated
			&& !!previous.diff.isDeleted === !!file.diff.isDeleted
			&& previous.nonce === file.nonce));
	}

	/** Prepares visibility for the affected resources, using cumulative history to recognize fully restored revisions. */
	async prepareRestore(checkpoints: readonly { readonly edits: readonly IToolCallFileEdit[] }[], undo: boolean, affectedResources: readonly URI[]): Promise<(tx: ITransaction) => void> {
		const targets = new ResourceMap<IToolCallFileEdit>();
		const endpoints = new ResourceMap<IToolCallFileEdit>();
		const chains = new ResourceMap<IToolCallFileEdit[]>();
		const renamed = new ResourceSet();
		for (const checkpoint of undo ? [...checkpoints].reverse() : checkpoints) {
			for (const edit of checkpoint.edits) {
				if (edit.kind === FileEditKind.Rename) {
					renamed.add(edit.resource);
					if (edit.originalResource) {
						renamed.add(edit.originalResource);
					}
				}
				if (!endpoints.has(edit.resource)) {
					endpoints.set(edit.resource, edit);
				}
				const chain = chains.get(edit.resource) ?? [];
				if (undo) {
					chain.unshift(edit);
				} else {
					chain.push(edit);
				}
				chains.set(edit.resource, chain);
				targets.set(edit.resource, edit);
			}
		}
		const affected = new ResourceSet(affectedResources);
		const restored = this._restored.get().filter(file => !affected.has(file.diff.modifiedURI));
		if (undo) {
			const sources = await Promise.all([...this._sources].map(source => this._whenReady(source)));
			for (const current of sources) {
				if (!current?.ready || current.failed) {
					continue;
				}
				for (const file of current.files) {
					try {
						const target = targets.get(file.diff.modifiedURI);
						const endpoint = endpoints.get(file.diff.modifiedURI);
						if (!target || !endpoint || !affected.has(file.diff.modifiedURI) || renamed.has(file.diff.modifiedURI)) {
							continue;
						}
						// A peer's or a newer revision must not disappear with this chat's checkpoint.
						if (file.diff.isDeleted
							? endpoint.kind !== FileEditKind.Delete || !await this._isContinuous(chains.get(file.diff.modifiedURI)!)
							: !endpoint.afterContentUri || !isEqual(endpoint.afterContentUri, file.diff.modifiedSnapshotURI)) {
							continue;
						}
						if (target.kind === FileEditKind.Create && file.diff.isCreated) {
							restored.push({ ...file, channel: current.channel });
						} else if (target.beforeContentUri && !file.diff.isCreated) {
							const [baseline, restoredContent] = await Promise.all([
								this._fileService.readFile(file.diff.originalURI),
								this._fileService.readFile(target.beforeContentUri),
							]);
							if (baseline.value.equals(restoredContent.value)) {
								restored.push({ ...file, channel: current.channel });
							}
						}
					} catch (error) {
						if (isCancellationError(error)) {
							throw error;
						}
						this._logService.warn('[AgentHostCheckpointReview] Could not compare the restored checkpoint with its working set', error);
					}
				}
			}
		}
		return tx => this._restored.set(restored, tx);
	}

	private async _whenReady(source: IObservable<IAgentHostCheckpointReviewSource | undefined>): Promise<IAgentHostCheckpointReviewSource | undefined> {
		const pending = () => source.get()?.ready === false && !source.get()?.failed;
		if (pending()) {
			const ready = Event.toPromise(Event.filter(Event.fromObservableLight(source), () => !pending()));
			try {
				await raceCancellationError(raceTimeout(ready, 30_000, () => ready.cancel()), this._lifetime);
			} finally {
				ready.cancel();
			}
			if (pending()) {
				this._logService.warn('[AgentHostCheckpointReview] The working set did not finish updating before checkpoint restoration');
			}
			if (source.get()?.failed) {
				this._logService.warn('[AgentHostCheckpointReview] The working set is unavailable during checkpoint restoration');
			}
		}
		return source.get();
	}

	private async _isContinuous(edits: readonly IToolCallFileEdit[]): Promise<boolean> {
		for (let index = 1; index < edits.length; index++) {
			const after = edits[index - 1].afterContentUri;
			const before = edits[index].beforeContentUri;
			if (isEqual(after, before)) {
				continue;
			}
			if (!after || !before) {
				return false;
			}
			const [previous, current] = await Promise.all([this._fileService.readFile(after), this._fileService.readFile(before)]);
			if (!previous.value.equals(current.value)) {
				return false;
			}
		}
		return true;
	}
}
