/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EncodingMode, IResolvedTextFileEditorModel, isTextFileEditorModel, ITextFileEditorModel, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { DiffAlgorithmName, IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';
import { IChange } from '../../../../editor/common/diff/legacyLinesDiffComputer.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextModel, shouldSynchronizeModel } from '../../../../editor/common/model.js';
import { IQuickDiffService, QuickDiff, QuickDiffChange, QuickDiffResult } from '../common/quickDiff.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { ISCMRepository, ISCMService } from '../common/scm.js';
import { sortedDiff, equals } from '../../../../base/common/arrays.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { ISplice } from '../../../../base/common/sequence.js';
import { DiffState } from '../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { toLineChanges } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { LineRangeMapping, lineRangeMappingFromChange } from '../../../../editor/common/diff/rangeMapping.js';
import { IDiffEditorModel } from '../../../../editor/common/editorCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IChatEditingService, WorkingSetEntryState } from '../../chat/common/chatEditingService.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export const IDirtyDiffModelService = createDecorator<IDirtyDiffModelService>('IDirtyDiffModelService');

export interface IDirtyDiffModelService {
	_serviceBrand: undefined;

	/**
	 * Returns `undefined` if the editor model is not resolved
	 * @param uri
	 */
	getDirtyDiffModel(uri: URI): DirtyDiffModel | undefined;

	/**
	 * Returns `undefined` if the editor model is not resolved
	 * @param uri
	 * @param algorithm
	 */
	getDiffModel(uri: URI, algorithm: DiffAlgorithmName): DirtyDiffModel | undefined;
}

export class DirtyDiffModelService extends Disposable implements IDirtyDiffModelService {
	_serviceBrand: undefined;

	private readonly _dirtyDiffModels = new ResourceMap<DirtyDiffModel>();
	private readonly _diffModels = new ResourceMap<Map<DiffAlgorithmName, DirtyDiffModel>>();

	private _visibleTextEditorControls = observableFromEvent(
		this.editorService.onDidVisibleEditorsChange,
		() => this.editorService.visibleTextEditorControls);

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this._register(autorun(reader => {
			const visibleTextEditorControls = this._visibleTextEditorControls.read(reader);

			// Dispose dirty diff models for text editors that are not visible
			for (const [uri, dirtyDiffModel] of this._dirtyDiffModels) {
				const textEditorControl = visibleTextEditorControls
					.find(editor => isCodeEditor(editor) &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));

				if (textEditorControl) {
					continue;
				}

				dirtyDiffModel.dispose();
				this._dirtyDiffModels.delete(uri);
			}

			// Dispose diff models for diff editors that are not visible
			for (const [uri, dirtyDiffModel] of this._diffModels) {
				const diffEditorControl = visibleTextEditorControls
					.find(editor => isDiffEditor(editor) &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.modified.uri, uri));

				if (diffEditorControl) {
					continue;
				}

				for (const algorithm of dirtyDiffModel.keys()) {
					dirtyDiffModel.get(algorithm)?.dispose();
					dirtyDiffModel.delete(algorithm);
				}
				this._diffModels.delete(uri);
			}
		}));
	}

	getDirtyDiffModel(uri: URI): DirtyDiffModel | undefined {
		let model = this._dirtyDiffModels.get(uri);
		if (model) {
			return model;
		}

		const textFileModel = this.textFileService.files.get(uri);
		if (!textFileModel?.isResolved()) {
			return undefined;
		}

		model = this.instantiationService.createInstance(DirtyDiffModel, textFileModel, undefined);
		this._dirtyDiffModels.set(uri, model);

		return model;
	}

	getDiffModel(uri: URI, algorithm: DiffAlgorithmName): DirtyDiffModel | undefined {
		let model = this._diffModels.get(uri)?.get(algorithm);
		if (model) {
			return model;
		}

		const textFileModel = this.textFileService.files.get(uri);
		if (!textFileModel?.isResolved()) {
			return undefined;
		}

		model = this.instantiationService.createInstance(DirtyDiffModel, textFileModel, algorithm);
		if (!this._diffModels.has(uri)) {
			this._diffModels.set(uri, new Map());
		}
		this._diffModels.get(uri)!.set(algorithm, model);

		return model;
	}
}

export class DirtyDiffModel extends Disposable {

	private _model: ITextFileEditorModel;

	private readonly _originalEditorModels = new ResourceMap<IResolvedTextEditorModel>();
	private readonly _originalEditorModelsDisposables = this._register(new DisposableStore());
	get originalTextModels(): Iterable<ITextModel> {
		return Iterable.map(this._originalEditorModels.values(), editorModel => editorModel.textEditorModel);
	}

	private _disposed = false;
	private _quickDiffs: QuickDiff[] = [];
	private _quickDiffsPromise?: Promise<QuickDiff[]>;
	private _diffDelayer = new ThrottledDelayer<void>(200);

	private readonly _onDidChange = new Emitter<{ changes: QuickDiffChange[]; diff: ISplice<QuickDiffChange>[] }>();
	readonly onDidChange: Event<{ changes: QuickDiffChange[]; diff: ISplice<QuickDiffChange>[] }> = this._onDidChange.event;

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
		private readonly algorithm: DiffAlgorithmName | undefined,
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
			this.setChanges([], new Map());
			this.triggerDiff();
		}));

		this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));
		this._register(this._chatEditingService.onDidChangeEditingSession(() => this.triggerDiff()));
		this.triggerDiff();
	}

	get quickDiffs(): readonly QuickDiff[] {
		return this._quickDiffs;
	}

	public getQuickDiffResults(): QuickDiffResult[] {
		return this._quickDiffs.map(quickDiff => {
			const changes = this.changes
				.filter(change => change.label === quickDiff.label);

			return {
				label: quickDiff.label,
				original: quickDiff.originalResource,
				modified: this._model.resource,
				changes: changes.map(change => change.change),
				changes2: changes.map(change => change.change2)
			};
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
				const result: { changes: QuickDiffChange[]; mapChanges: Map<string, number[]> } | null = await this.diff();

				const editorModels = Array.from(this._originalEditorModels.values());
				if (!result || this._disposed || this._model.isDisposed() || editorModels.some(editorModel => editorModel.isDisposed())) {
					return; // disposed
				}

				if (editorModels.every(editorModel => editorModel.textEditorModel.getValueLength() === 0)) {
					result.changes = [];
				}

				this.setChanges(result.changes, result.mapChanges);
			})
			.catch(err => onUnexpectedError(err));
	}

	private setChanges(changes: QuickDiffChange[], mapChanges: Map<string, number[]>): void {
		const diff = sortedDiff(this.changes, changes, (a, b) => compareChanges(a.change, b.change));
		this._changes = changes;
		this._quickDiffChanges = mapChanges;
		this._onDidChange.fire({ changes, diff });
	}

	private diff(): Promise<{ changes: QuickDiffChange[]; mapChanges: Map<string, number[]> } | null> {
		return this.progressService.withProgress({ location: ProgressLocation.Scm, delay: 250 }, async () => {
			const originalURIs = await this.getQuickDiffsPromise();
			if (this._disposed || this._model.isDisposed() || (originalURIs.length === 0)) {
				return Promise.resolve({ changes: [], mapChanges: new Map() }); // disposed
			}

			const filteredToDiffable = originalURIs.filter(quickDiff => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
			if (filteredToDiffable.length === 0) {
				return Promise.resolve({ changes: [], mapChanges: new Map() }); // All files are too large
			}

			const ignoreTrimWhitespaceSetting = this.configurationService.getValue<'true' | 'false' | 'inherit'>('scm.diffDecorationsIgnoreTrimWhitespace');
			const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === 'inherit'
				? this.configurationService.getValue<boolean>('diffEditor.ignoreTrimWhitespace')
				: ignoreTrimWhitespaceSetting !== 'false';

			const allDiffs: QuickDiffChange[] = [];
			for (const quickDiff of filteredToDiffable) {
				const dirtyDiff = await this._diff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
				if (dirtyDiff.changes && dirtyDiff.changes2 && dirtyDiff.changes.length === dirtyDiff.changes2.length) {
					for (let index = 0; index < dirtyDiff.changes.length; index++) {
						allDiffs.push({
							label: quickDiff.label,
							original: quickDiff.originalResource,
							modified: this._model.resource,
							change: dirtyDiff.changes[index],
							change2: dirtyDiff.changes2[index]
						});
					}
				}
			}
			const sorted = allDiffs.sort((a, b) => compareChanges(a.change, b.change));
			const map: Map<string, number[]> = new Map();
			for (let i = 0; i < sorted.length; i++) {
				const label = sorted[i].label;
				if (!map.has(label)) {
					map.set(label, []);
				}
				map.get(label)!.push(i);
			}
			return { changes: sorted, mapChanges: map };
		});
	}

	private async _diff(original: URI, modified: URI, ignoreTrimWhitespace: boolean): Promise<{ changes: readonly IChange[] | null; changes2: readonly LineRangeMapping[] | null }> {
		if (this.algorithm === undefined) {
			const changes = await this.editorWorkerService.computeDirtyDiff(original, modified, ignoreTrimWhitespace);
			return { changes, changes2: changes?.map(change => lineRangeMappingFromChange(change)) ?? null };
		}

		const result = await this.editorWorkerService.computeDiff(original, modified, {
			computeMoves: false,
			ignoreTrimWhitespace,
			maxComputationTimeMs: Number.MAX_SAFE_INTEGER
		}, this.algorithm);

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

			if (equals(this._quickDiffs, quickDiffs, (a, b) => a.originalResource.toString() === b.originalResource.toString() && a.label === b.label)) {
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

					if (isTextFileEditorModel(ref.object)) {
						const encoding = this._model.getEncoding();

						if (encoding) {
							ref.object.setEncoding(encoding, EncodingMode.Decode);
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

		const session = this._chatEditingService.currentEditingSession;
		if (session && session.getEntry(uri)?.state.get() === WorkingSetEntryState.Modified) {
			// disable dirty diff when doing chat edits
			return Promise.resolve([]);
		}

		const isSynchronized = this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : undefined;
		const quickDiffs = await this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), isSynchronized);

		// TODO@lszomoru - find a long term solution for this
		// When the DirtyDiffModel is created for a diff editor, there is no
		// need to compute the diff information for the `isSCM` quick diff
		// provider as that information will be provided by the diff editor
		return this.algorithm !== undefined
			? quickDiffs.filter(quickDiff => !quickDiff.isSCM)
			: quickDiffs;
	}

	findNextClosestChange(lineNumber: number, inclusive = true, provider?: string): number {
		let preferredProvider: string | undefined;
		if (!provider && inclusive) {
			preferredProvider = this.quickDiffs.find(value => value.isSCM)?.label;
		}

		const possibleChanges: number[] = [];
		for (let i = 0; i < this.changes.length; i++) {
			if (provider && this.changes[i].label !== provider) {
				continue;
			}

			// Skip quick diffs that are not visible
			if (!this.quickDiffs.find(quickDiff => quickDiff.label === this.changes[i].label)?.visible) {
				continue;
			}

			const change = this.changes[i];
			const possibleChangesLength = possibleChanges.length;

			if (inclusive) {
				if (getModifiedEndLineNumber(change.change) >= lineNumber) {
					if (preferredProvider && change.label !== preferredProvider) {
						possibleChanges.push(i);
					} else {
						return i;
					}
				}
			} else {
				if (change.change.modifiedStartLineNumber > lineNumber) {
					return i;
				}
			}
			if ((possibleChanges.length > 0) && (possibleChanges.length === possibleChangesLength)) {
				return possibleChanges[0];
			}
		}

		return possibleChanges.length > 0 ? possibleChanges[0] : 0;
	}

	findPreviousClosestChange(lineNumber: number, inclusive = true, provider?: string): number {
		for (let i = this.changes.length - 1; i >= 0; i--) {
			if (provider && this.changes[i].label !== provider) {
				continue;
			}

			// Skip quick diffs that are not visible
			if (!this.quickDiffs.find(quickDiff => quickDiff.label === this.changes[i].label)?.visible) {
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

function compareChanges(a: IChange, b: IChange): number {
	let result = a.modifiedStartLineNumber - b.modifiedStartLineNumber;

	if (result !== 0) {
		return result;
	}

	result = a.modifiedEndLineNumber - b.modifiedEndLineNumber;

	if (result !== 0) {
		return result;
	}

	result = a.originalStartLineNumber - b.originalStartLineNumber;

	if (result !== 0) {
		return result;
	}

	return a.originalEndLineNumber - b.originalEndLineNumber;
}

export function getChangeHeight(change: IChange): number {
	const modified = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
	const original = change.originalEndLineNumber - change.originalStartLineNumber + 1;

	if (change.originalEndLineNumber === 0) {
		return modified;
	} else if (change.modifiedEndLineNumber === 0) {
		return original;
	} else {
		return modified + original;
	}
}

export function getModifiedEndLineNumber(change: IChange): number {
	if (change.modifiedEndLineNumber === 0) {
		return change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber;
	} else {
		return change.modifiedEndLineNumber;
	}
}

export function lineIntersectsChange(lineNumber: number, change: IChange): boolean {
	// deletion at the beginning of the file
	if (lineNumber === 1 && change.modifiedStartLineNumber === 0 && change.modifiedEndLineNumber === 0) {
		return true;
	}

	return lineNumber >= change.modifiedStartLineNumber && lineNumber <= (change.modifiedEndLineNumber || change.modifiedStartLineNumber);
}
