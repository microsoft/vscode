/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EncodingMode, IResolvedTextFileEditorModel, isTextFileEditorModel, ITextFileEditorModel, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { Disposable, DisposableMap, DisposableStore, IReference, ReferenceCollection } from '../../../../base/common/lifecycle.js';
import { DiffAlgorithmName, IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';
import { IChange } from '../../../../editor/common/diff/legacyLinesDiffComputer.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextModel, shouldSynchronizeModel } from '../../../../editor/common/model.js';
import { compareChanges, getModifiedEndLineNumber, IQuickDiffService, QuickDiff, QuickDiffChange, QuickDiffResult } from '../common/quickDiff.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { ISCMRepository, ISCMService } from '../common/scm.js';
import { sortedDiff, equals } from '../../../../base/common/arrays.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { ISplice } from '../../../../base/common/sequence.js';
import { DiffState } from '../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { toLineChanges } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { LineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { IDiffEditorModel } from '../../../../editor/common/editorCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../chat/common/editing/chatEditingService.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun } from '../../../../base/common/observable.js';

export const IQuickDiffModelService = createDecorator<IQuickDiffModelService>('IQuickDiffModelService');

export interface QuickDiffModelOptions {
	readonly algorithm: DiffAlgorithmName;
	readonly maxComputationTimeMs?: number;
}

const decoratorQuickDiffModelOptions: QuickDiffModelOptions = {
	algorithm: 'advanced',
	maxComputationTimeMs: 1000
};

export interface IQuickDiffModelService {
	_serviceBrand: undefined;

	/**
	 * Returns `undefined` if the editor model is not resolved.
	 * Model refrence has to be disposed once not needed anymore.
	 * @param resource
	 * @param options
	 */
	createQuickDiffModelReference(resource: URI, options?: QuickDiffModelOptions): IReference<QuickDiffModel> | undefined;
}

class QuickDiffModelReferenceCollection extends ReferenceCollection<QuickDiffModel> {
	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) {
		super();
	}

	protected override createReferencedObject(_key: string, textFileModel: IResolvedTextFileEditorModel, options: QuickDiffModelOptions): QuickDiffModel {
		return this._instantiationService.createInstance(QuickDiffModel, textFileModel, options);
	}

	protected override destroyReferencedObject(_key: string, object: QuickDiffModel): void {
		object.dispose();
	}
}

export class QuickDiffModelService implements IQuickDiffModelService {
	_serviceBrand: undefined;

	private readonly _references: QuickDiffModelReferenceCollection;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		this._references = this.instantiationService.createInstance(QuickDiffModelReferenceCollection);
	}

	createQuickDiffModelReference(resource: URI, options: QuickDiffModelOptions = decoratorQuickDiffModelOptions): IReference<QuickDiffModel> | undefined {
		const textFileModel = this.textFileService.files.get(resource);
		if (!textFileModel?.isResolved()) {
			return undefined;
		}

		resource = this.uriIdentityService.asCanonicalUri(resource).with({ query: JSON.stringify(options) });
		return this._references.acquire(resource.toString(), textFileModel, options);
	}
}

export class QuickDiffModel extends Disposable {

	private readonly _model: ITextFileEditorModel;
	private readonly _originalEditorModels = new ResourceMap<IResolvedTextEditorModel>();
	private readonly _originalEditorModelsDisposables = this._register(new DisposableStore());
	get originalTextModels(): Iterable<ITextModel> {
		return Iterable.map(this._originalEditorModels.values(), editorModel => editorModel.textEditorModel);
	}

	private _disposed = false;
	private _quickDiffs: QuickDiff[] = [];
	private _quickDiffsPromise?: Promise<QuickDiff[]>;
	private _diffDelayer = this._register(new ThrottledDelayer<void>(200));

	private readonly _onDidChange = this._register(new Emitter<{ changes: QuickDiffChange[]; diff: ISplice<QuickDiffChange>[] }>());
	readonly onDidChange: Event<{ changes: QuickDiffChange[]; diff: ISplice<QuickDiffChange>[] }> = this._onDidChange.event;

	private _allChanges: QuickDiffChange[] = [];
	get allChanges(): QuickDiffChange[] { return this._allChanges; }

	private _changes: QuickDiffChange[] = [];
	get changes(): QuickDiffChange[] { return this._changes; }

	/**
	 * Map of quick diff name to the index of the change in `this.changes`
	 */
	private _quickDiffChanges: Map<string, number[]> = new Map();
	get quickDiffChanges(): Map<string, number[]> { return this._quickDiffChanges; }

	private readonly _repositoryDisposables = new DisposableMap<ISCMRepository>();

	constructor(
		textFileModel: IResolvedTextFileEditorModel,
		private readonly options: QuickDiffModelOptions,
		@ISCMService private readonly scmService: ISCMService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();
		this._model = textFileModel;

		this._register(textFileModel.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
		this._register(
			Event.filter(configurationService.onDidChangeConfiguration,
				e => e.affectsConfiguration('scm.diffDecorationsIgnoreTrimWhitespace') || e.affectsConfiguration('diffEditor.ignoreTrimWhitespace')
			)(this.triggerDiff, this)
		);
		this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
		for (const r of scmService.repositories) {
			this.onDidAddRepository(r);
		}

		this._register(this._model.onDidChangeEncoding(() => {
			this._diffDelayer.cancel();
			this._quickDiffs = [];
			this._originalEditorModels.clear();
			this._quickDiffsPromise = undefined;
			this.setChanges([], [], new Map());
			this.triggerDiff();
		}));

		this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));

		this._register(autorun(reader => {
			for (const session of this._chatEditingService.editingSessionsObs.read(reader)) {
				reader.store.add(autorun(r => {
					for (const entry of session.entries.read(r)) {
						entry.state.read(r); // signal
					}
					this.triggerDiff();
				}));
			}
		}));

		this.triggerDiff();
	}

	get quickDiffs(): readonly QuickDiff[] {
		return this._quickDiffs;
	}

	public getQuickDiffResults(): QuickDiffResult[] {
		return this._quickDiffs.map(quickDiff => {
			const changes = this.allChanges
				.filter(change => change.providerId === quickDiff.id);

			return {
				original: quickDiff.originalResource,
				modified: this._model.resource,
				changes: changes.map(change => change.change),
				changes2: changes.map(change => change.change2)
			} satisfies QuickDiffResult;
		});
	}

	public getDiffEditorModel(originalUri: URI): IDiffEditorModel | undefined {
		const editorModel = this._originalEditorModels.get(originalUri);
		return editorModel ?
			{
				modified: this._model.textEditorModel!,
				original: editorModel.textEditorModel
			} : undefined;
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const disposables = new DisposableStore();

		disposables.add(repository.provider.onDidChangeResources(this.triggerDiff, this));

		const onDidRemoveRepository = Event.filter(this.scmService.onDidRemoveRepository, r => r === repository);
		disposables.add(onDidRemoveRepository(() => this._repositoryDisposables.deleteAndDispose(repository)));

		this._repositoryDisposables.set(repository, disposables);

		this.triggerDiff();
	}

	private triggerDiff(): void {
		if (!this._diffDelayer) {
			return;
		}

		this._diffDelayer
			.trigger(async () => {
				const result: { allChanges: QuickDiffChange[]; changes: QuickDiffChange[]; mapChanges: Map<string, number[]> } | null = await this.diff();

				const editorModels = Array.from(this._originalEditorModels.values());
				if (!result || this._disposed || this._model.isDisposed() || editorModels.some(editorModel => editorModel.isDisposed())) {
					return; // disposed
				}

				this.setChanges(result.allChanges, result.changes, result.mapChanges);
			})
			.catch(err => onUnexpectedError(err));
	}

	private setChanges(allChanges: QuickDiffChange[], changes: QuickDiffChange[], mapChanges: Map<string, number[]>): void {
		const diff = sortedDiff(this.changes, changes, (a, b) => compareChanges(a.change, b.change));
		this._allChanges = allChanges;
		this._changes = changes;
		this._quickDiffChanges = mapChanges;
		this._onDidChange.fire({ changes, diff });
	}

	private diff(): Promise<{ allChanges: QuickDiffChange[]; changes: QuickDiffChange[]; mapChanges: Map<string, number[]> } | null> {
		return this.progressService.withProgress({ location: ProgressLocation.Scm, delay: 250 }, async () => {
			const originalURIs = await this.getQuickDiffsPromise();
			if (this._disposed || this._model.isDisposed() || (originalURIs.length === 0)) {
				// Disposed
				return Promise.resolve({ allChanges: [], changes: [], mapChanges: new Map() });
			}

			const quickDiffs = originalURIs
				.filter(quickDiff => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
			if (quickDiffs.length === 0) {
				// All files are too large
				return Promise.resolve({ allChanges: [], changes: [], mapChanges: new Map() });
			}

			const quickDiffPrimary = quickDiffs.find(quickDiff => quickDiff.kind === 'primary');

			const ignoreTrimWhitespaceSetting = this.configurationService.getValue<'true' | 'false' | 'inherit'>('scm.diffDecorationsIgnoreTrimWhitespace');
			const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === 'inherit'
				? this.configurationService.getValue<boolean>('diffEditor.ignoreTrimWhitespace')
				: ignoreTrimWhitespaceSetting !== 'false';

			const diffs: QuickDiffChange[] = [];
			const secondaryDiffs: QuickDiffChange[] = [];

			for (const quickDiff of quickDiffs) {
				const diff = await this._diff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
				if (diff.changes && diff.changes2 && diff.changes.length === diff.changes2.length) {
					for (let index = 0; index < diff.changes.length; index++) {
						const change2 = diff.changes2[index];

						// The secondary diffs are complimentary to the primary diffs, and
						// they can overlap. We need to remove the secondary quick diffs that
						// overlap for the UI, but we need to expose all diffs through the API.
						if (quickDiffPrimary && quickDiff.kind === 'secondary') {
							// Check whether the:
							// 1. the modified line range is equal
							// 2. the original line range length is equal
							const primaryQuickDiffChange = diffs
								.find(d => d.change2.modified.equals(change2.modified) &&
									d.change2.original.length === change2.original.length);

							if (primaryQuickDiffChange) {
								// Check whether the original content matches
								const primaryModel = this._originalEditorModels.get(quickDiffPrimary.originalResource)?.textEditorModel;
								const primaryContent = primaryModel?.getValueInRange(primaryQuickDiffChange.change2.toRangeMapping().originalRange);

								const secondaryModel = this._originalEditorModels.get(quickDiff.originalResource)?.textEditorModel;
								const secondaryContent = secondaryModel?.getValueInRange(change2.toRangeMapping().originalRange);
								if (primaryContent === secondaryContent) {
									secondaryDiffs.push({
										providerId: quickDiff.id,
										original: quickDiff.originalResource,
										modified: this._model.resource,
										change: diff.changes[index],
										change2: diff.changes2[index]
									});

									continue;
								}
							}
						}

						diffs.push({
							providerId: quickDiff.id,
							original: quickDiff.originalResource,
							modified: this._model.resource,
							change: diff.changes[index],
							change2: diff.changes2[index]
						});
					}
				}
			}

			const diffsSorted = diffs.sort((a, b) => compareChanges(a.change, b.change));
			const allDiffsSorted = [...diffs, ...secondaryDiffs].sort((a, b) => compareChanges(a.change, b.change));

			const map: Map<string, number[]> = new Map();
			for (let i = 0; i < diffsSorted.length; i++) {
				const providerId = diffsSorted[i].providerId;
				if (!map.has(providerId)) {
					map.set(providerId, []);
				}
				map.get(providerId)!.push(i);
			}

			return { allChanges: allDiffsSorted, changes: diffsSorted, mapChanges: map };
		});
	}

	private async _diff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): Promise<{ changes: readonly IChange[] | null; changes2: readonly LineRangeMapping[] | null }> {
		const maxComputationTimeMs = this.options.maxComputationTimeMs ?? Number.MAX_SAFE_INTEGER;

		const result = await this.editorWorkerService.computeDiff(original, modified, {
			computeMoves: false, ignoreTrimWhitespace, maxComputationTimeMs
		}, this.options.algorithm);

		return { changes: result ? toLineChanges(DiffState.fromDiffResult(result)) : null, changes2: result?.changes ?? null };
	}

	private getQuickDiffsPromise(): Promise<QuickDiff[]> {
		if (this._quickDiffsPromise) {
			return this._quickDiffsPromise;
		}

		this._quickDiffsPromise = this.getOriginalResource().then(async (quickDiffs) => {
			if (this._disposed) { // disposed
				return [];
			}

			if (quickDiffs.length === 0) {
				this._quickDiffs = [];
				this._originalEditorModels.clear();
				return [];
			}

			if (equals(this._quickDiffs, quickDiffs, (a, b) =>
				a.id === b.id &&
				a.originalResource.toString() === b.originalResource.toString() &&
				this.quickDiffService.isQuickDiffProviderVisible(a.id) === this.quickDiffService.isQuickDiffProviderVisible(b.id))
			) {
				return quickDiffs;
			}

			this._quickDiffs = quickDiffs;

			this._originalEditorModels.clear();
			this._originalEditorModelsDisposables.clear();
			return (await Promise.all(quickDiffs.map(async (quickDiff) => {
				try {
					const ref = await this.textModelResolverService.createModelReference(quickDiff.originalResource);
					if (this._disposed) { // disposed
						ref.dispose();
						return [];
					}

					this._originalEditorModels.set(quickDiff.originalResource, ref.object);

					if (isTextFileEditorModel(ref.object) && !ref.object.isDirty()) {
						const encoding = this._model.getEncoding();

						if (encoding) {
							(ref.object as ITextFileEditorModel).setEncoding(encoding, EncodingMode.Decode);
						}
					}

					this._originalEditorModelsDisposables.add(ref);
					this._originalEditorModelsDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));

					return quickDiff;
				} catch (error) {
					return []; // possibly invalid reference
				}
			}))).flat();
		});

		return this._quickDiffsPromise.finally(() => {
			this._quickDiffsPromise = undefined;
		});
	}

	private async getOriginalResource(): Promise<QuickDiff[]> {
		if (this._disposed) {
			return Promise.resolve([]);
		}
		const uri = this._model.resource;

		// disable dirty diff when doing chat edits
		const isBeingModifiedByChatEdits = this._chatEditingService.editingSessionsObs.get()
			.some(session => session.getEntry(uri)?.state.get() === ModifiedFileEntryState.Modified);
		if (isBeingModifiedByChatEdits) {
			return Promise.resolve([]);
		}

		const isSynchronized = this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : undefined;
		return this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), isSynchronized);
	}

	findNextClosestChange(lineNumber: number, inclusive = true, providerId?: string): number {
		const visibleQuickDiffIds = new Set(this.quickDiffs
			.filter(quickDiff => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id))
			.map(quickDiff => quickDiff.id));

		for (let i = 0; i < this.changes.length; i++) {
			if (providerId && this.changes[i].providerId !== providerId) {
				continue;
			}

			// Skip quick diffs that are not visible
			if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
				continue;
			}

			const change = this.changes[i].change;

			if (inclusive) {
				if (getModifiedEndLineNumber(change) >= lineNumber) {
					return i;
				}
			} else {
				if (change.modifiedStartLineNumber > lineNumber) {
					return i;
				}
			}
		}

		return 0;
	}

	findPreviousClosestChange(lineNumber: number, inclusive = true, providerId?: string): number {
		const visibleQuickDiffIds = new Set(this.quickDiffs
			.filter(quickDiff => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id))
			.map(quickDiff => quickDiff.id));

		for (let i = this.changes.length - 1; i >= 0; i--) {
			if (providerId && this.changes[i].providerId !== providerId) {
				continue;
			}

			// Skip quick diffs that are not visible
			if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
				continue;
			}

			const change = this.changes[i].change;

			if (inclusive) {
				if (change.modifiedStartLineNumber <= lineNumber) {
					return i;
				}
			} else {
				if (getModifiedEndLineNumber(change) < lineNumber) {
					return i;
				}
			}
		}

		return this.changes.length - 1;
	}

	override dispose(): void {
		this._disposed = true;

		this._quickDiffs = [];
		this._diffDelayer.cancel();
		this._originalEditorModels.clear();
		this._repositoryDisposables.dispose();

		super.dispose();
	}
}
