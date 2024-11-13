/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { AsyncReferenceCollection, Disposable, DisposableStore, dispose, IReference, ReferenceCollection, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IChatEditingService, WorkingSetEntryState, IModifiedFileEntry, ChatEditingSessionState } from '../../chat/common/chatEditingService.js';
import { INotebookService } from '../common/notebookService.js';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { NotebookTextModel } from '../common/model/notebookTextModel.js';
import { INotebookEditor, INotebookEditorContribution } from './notebookBrowser.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { raceCancellation, ThrottledDelayer } from '../../../../base/common/async.js';
import { CellDiffInfo, computeDiff, prettyChanges } from './diff/notebookDiffViewModel.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { INotebookEditorWorkerService } from '../common/services/notebookWorkerService.js';
import { ChatEditingModifiedFileEntry } from '../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { CellEditType, CellKind, CellUri, ICellDto2, ICellReplaceEdit, NotebookData, NotebookSetting } from '../common/notebookCommon.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { ICodeEditor, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { RenderOptions, LineSource, renderLines } from '../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from '../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { ITextModel, TrackedRangeStickiness, MinimapPosition, IModelDeltaDecoration, OverviewRulerLane } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../../editor/common/viewModel.js';
import { overviewRulerModifiedForeground, minimapGutterModifiedBackground, overviewRulerAddedForeground, minimapGutterAddedBackground, overviewRulerDeletedForeground, minimapGutterDeletedBackground } from '../../scm/browser/dirtydiffDecorator.js';
import { Range } from '../../../../editor/common/core/range.js';
import { NotebookCellTextModel } from '../common/model/notebookCellTextModel.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { INotebookLoggingService } from '../common/notebookLoggingService.js';
import { TextEdit } from '../../../../editor/common/core/textEdit.js';
import { Position } from '../../../../editor/common/core/position.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { tokenizeToString } from '../../../../editor/common/languages/textToHtmlTokenizer.js';
import * as DOM from '../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { splitLines } from '../../../../base/common/strings.js';
import { DefaultLineHeight } from './diff/diffElementViewModel.js';
import { filter } from '../../../../base/common/objects.js';
import { INotebookEditorModelResolverService } from '../common/notebookEditorModelResolverService.js';
import { SaveReason } from '../../../common/editor.js';
import { IChatService } from '../../chat/common/chatService.js';


export const INotebookOriginalModelReferenceFactory = createDecorator<INotebookOriginalModelReferenceFactory>('INotebookOriginalModelReferenceFactory');

export interface INotebookOriginalModelReferenceFactory {
	readonly _serviceBrand: undefined;
	getOrCreate(fileEntry: IModifiedFileEntry, viewType: string): Promise<IReference<NotebookTextModel>>;
}


export class NotebookChatEditorControllerContrib extends Disposable implements INotebookEditorContribution {

	public static readonly ID: string = 'workbench.notebook.chatEditorController';
	readonly _serviceBrand: undefined;
	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,

	) {
		super();
		if (configurationService.getValue<boolean>('notebook.experimental.chatEdits')) {
			this._register(instantiationService.createInstance(NotebookChatEditorController, notebookEditor));
		}
	}
}


class NotebookChatEditorController extends Disposable {
	private readonly deletedCellOverlayer: NotebookDeletedCellOverlayer;
	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@INotebookOriginalModelReferenceFactory private readonly originalModelRefFactory: INotebookOriginalModelReferenceFactory,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.deletedCellOverlayer = this._register(instantiationService.createInstance(NotebookDeletedCellOverlayer, notebookEditor));
		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);
		const entryObs = observableValue<IModifiedFileEntry | undefined>('fileentry', undefined);
		const notebookDiff = observableValue<{ cellDiff: CellDiffInfo[]; modelVersion: number } | undefined>('cellDiffInfo', undefined);
		const originalModel = observableValue<NotebookTextModel | undefined>('originalModel', undefined);
		this._register(toDisposable(() => {
			disposeDecorators();
		}));
		this._register(autorun(r => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}
			const entry = session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri));

			if (!entry || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				disposeDecorators();
				return;
			}
			// If we have a new entry for the file, then clear old decorators.
			// User could be cycling through different edit sessions (Undo Last Edit / Redo Last Edit).
			if (entryObs.read(r) && entryObs.read(r) !== entry) {
				disposeDecorators();
			}
			entryObs.set(entry, undefined);
		}));

		this._register(autorunWithStore(async (r, store) => {
			const entry = entryObs.read(r);
			const model = notebookModel.read(r);
			if (!entry || !model) {
				return;
			}
			const notebookSynchronizer = store.add(this.instantiationService.createInstance(NotebookModelSynchronizer, this.notebookEditor, entry, model.viewType));
			notebookDiff.set(undefined, undefined);
			await notebookSynchronizer.createSnapshot();
			store.add(notebookSynchronizer.onDidUpdateNotebookModel(e => {
				notebookDiff.set(e, undefined);
			}));
			store.add(notebookSynchronizer.onDidRevert(e => {
				if (e) {
					notebookDiff.set(undefined, undefined);
					disposeDecorators();
					this.deletedCellOverlayer.clear();
				}
			}));
			store.add(notebookSynchronizer.onDidAccept(() => {
				notebookDiff.set(undefined, undefined);
				disposeDecorators();
				this.deletedCellOverlayer.clear();
			}));
			const result = this._register(await this.originalModelRefFactory.getOrCreate(entry, model.viewType));
			originalModel.set(result.object, undefined);
		}));

		const onDidChangeVisibleRanges = observableFromEvent(this.notebookEditor.onDidChangeVisibleRanges, () => this.notebookEditor.visibleRanges);
		const decorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();
		const disposeDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
		};
		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiff.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			onDidChangeVisibleRanges.read(r);

			if (!entry || !modified || !original || !diffInfo || diffInfo.modelVersion !== modified.versionId) {
				return;
			}

			diffInfo.cellDiff.forEach((diff) => {
				if (diff.type === 'modified' || diff.type === 'insert') {
					const modifiedCell = modified.cells[diff.modifiedCellIndex];
					const originalCellValue = diff.type === 'modified' ? original.cells[diff.originalCellIndex].getValue() : undefined;
					const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];
					if (editor && decorators.get(modifiedCell)?.editor !== editor) {
						decorators.get(modifiedCell)?.dispose();
						const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, editor, originalCellValue, modifiedCell.cellKind);
						decorators.set(modifiedCell, decorator);
						this._register(editor.onDidDispose(() => {
							decorator.dispose();
							if (decorators.get(modifiedCell) === decorator) {
								decorators.set(modifiedCell, decorator);
							}
						}));
					}
				}
			});
		}));
		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiff.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			if (!entry || !modified || !original || (diffInfo && diffInfo.modelVersion !== modified.versionId)) {
				return;
			}
			if (!diffInfo) {
				// User reverted or accepted the changes, hence original === modified.
				this.deletedCellOverlayer.clear();
				return;
			}
			this.deletedCellOverlayer.createNecessaryOverlays(diffInfo.cellDiff, original);
		}));
	}
}


class NotebookCellDiffDecorator extends DisposableStore {
	private readonly _decorations = this.editor.createDecorationsCollection();
	private _viewZones: string[] = [];
	private readonly throttledDecorator = new ThrottledDelayer(100);

	constructor(
		public readonly editor: ICodeEditor,
		private readonly originalCellValue: string | undefined,
		private readonly cellKind: CellKind,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IModelService private readonly modelService: IModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILanguageService private readonly _languageService: ILanguageService,

	) {
		super();
		this.add(this.editor.onDidChangeModel(() => this.update()));
		this.add(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
				this.update();
			}
		}));

		const shouldBeReadOnly = derived(this, r => {
			const value = this._chatEditingService.currentEditingSessionObs.read(r);
			if (!value || value.state.read(r) !== ChatEditingSessionState.StreamingEdits) {
				return false;
			}
			return value.entries.read(r).some(e => isEqual(e.modifiedURI, this.editor.getModel()?.uri));
		});


		let actualReadonly: boolean | undefined;
		let actualDeco: 'off' | 'editable' | 'on' | undefined;

		this.add(autorun(r => {
			const value = shouldBeReadOnly.read(r);
			if (value) {
				actualReadonly ??= this.editor.getOption(EditorOption.readOnly);
				actualDeco ??= this.editor.getOption(EditorOption.renderValidationDecorations);

				this.editor.updateOptions({
					readOnly: true,
					renderValidationDecorations: 'off'
				});
			} else {
				if (actualReadonly !== undefined && actualDeco !== undefined) {
					this.editor.updateOptions({
						readOnly: actualReadonly,
						renderValidationDecorations: actualDeco
					});
					actualReadonly = undefined;
					actualDeco = undefined;
				}
			}
		}));
		this.update();
	}

	override dispose(): void {
		this._clearRendering();
		super.dispose();
	}

	public update(): void {
		this.throttledDecorator.trigger(() => this._updateImpl());
	}

	private async _updateImpl() {
		if (this.isDisposed) {
			return;
		}
		if (!this.editor.hasModel()) {
			this._clearRendering();
			return;
		}
		if (this.editor.getOption(EditorOption.inDiffEditor)) {
			this._clearRendering();
			return;
		}
		const model = this.editor.getModel();
		if (!model) {
			this._clearRendering();
			return;
		}

		const version = model.getVersionId();
		const originalModel = this.getOrCreateOriginalModel();
		const diff = originalModel ? await this.computeDiff() : undefined;
		if (this.isDisposed) {
			return;
		}

		if ((originalModel && !diff) || model !== this.editor.getModel() || this.editor.getModel()?.getVersionId() !== version) {
			this._clearRendering();
		}

		if (diff && originalModel) {
			this._updateWithDiff(originalModel, diff);
		} else {
			const edit = TextEdit.insert(new Position(0, 0), model.getValue());
			const rangeMapping = RangeMapping.fromEdit(edit);
			const insertDiff: IDocumentDiff = {
				identical: false,
				moves: [],
				quitEarly: false,
				changes: [DetailedLineRangeMapping.fromRangeMappings(rangeMapping)],
			};
			this._updateWithDiff(undefined, insertDiff);
		}
	}

	private _clearRendering() {
		this.editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
		});
		this._viewZones = [];
		this._decorations.clear();
	}

	private _originalModel?: ITextModel;
	private getOrCreateOriginalModel() {
		if (this._originalModel) {
			return this._originalModel;
		}
		if (!this.originalCellValue) {
			return;
		}
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		const cellUri = model.uri;
		const languageId = model.getLanguageId();

		const scheme = `${CellUri.scheme}-chat-edit`;
		const originalCellUri = URI.from({ scheme, fragment: cellUri.fragment, path: cellUri.path });
		const languageSelection = this._languageService.getLanguageIdByLanguageName(languageId) ? this._languageService.createById(languageId) : this.cellKind === CellKind.Markup ? this._languageService.createById('markdown') : null;
		return this._originalModel = this.add(this.modelService.createModel(this.originalCellValue, languageSelection, originalCellUri));
	}
	private async computeDiff() {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		const originalModel = this.getOrCreateOriginalModel();
		if (!originalModel) {
			return;
		}

		return this._editorWorkerService.computeDiff(
			originalModel.uri,
			model.uri,
			{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER },
			'advanced'
		);
	}

	private _updateWithDiff(originalModel: ITextModel | undefined, diff: IDocumentDiff): void {
		const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
			...diffAddDecoration,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		});
		const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
			...diffWholeLineAddDecoration,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
		const createOverviewDecoration = (overviewRulerColor: string, minimapColor: string) => {
			return ModelDecorationOptions.createDynamic({
				description: 'chat-editing-decoration',
				overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
				minimap: { color: themeColorFromId(minimapColor), position: MinimapPosition.Gutter },
			});
		};
		const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
		const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
		const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);

		this.editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
			this._viewZones = [];
			const modifiedDecorations: IModelDeltaDecoration[] = [];
			const mightContainNonBasicASCII = originalModel?.mightContainNonBasicASCII();
			const mightContainRTL = originalModel?.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(this.editor);

			for (const diffEntry of diff.changes) {
				const originalRange = diffEntry.original;
				if (originalModel) {
					originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
				}
				const source = new LineSource(
					(originalRange.length && originalModel) ? originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)) : [],
					[],
					mightContainNonBasicASCII,
					mightContainRTL,
				);
				const decorations: InlineDecoration[] = [];
				for (const i of diffEntry.innerChanges || []) {
					decorations.push(new InlineDecoration(
						i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)),
						diffDeleteDecoration.className!,
						InlineDecorationType.Regular
					));
					modifiedDecorations.push({
						range: i.modifiedRange, options: chatDiffAddDecoration
					});
				}
				if (!diffEntry.modified.isEmpty) {
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!, options: chatDiffWholeLineAddDecoration
					});
				}

				if (diffEntry.original.isEmpty) {
					// insertion
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: addedDecoration
					});
				} else if (diffEntry.modified.isEmpty) {
					// deletion
					modifiedDecorations.push({
						range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
						options: deletedDecoration
					});
				} else {
					// modification
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: modifiedDecoration
					});
				}
				const domNode = document.createElement('div');
				domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
				const result = renderLines(source, renderOptions, decorations, domNode);

				const isCreatedContent = decorations.length === 1 && decorations[0].range.isEmpty() && decorations[0].range.startLineNumber === 1;
				if (!isCreatedContent) {
					const viewZoneData: IViewZone = {
						afterLineNumber: diffEntry.modified.startLineNumber - 1,
						heightInLines: result.heightInLines,
						domNode,
						ordinal: 50000 + 2 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
					};

					this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
				}
			}

			this._decorations.set(modifiedDecorations);
		});
	}
}


class NotebookModelSynchronizer extends Disposable {
	private readonly throttledUpdateNotebookModel = new ThrottledDelayer(200);
	private readonly _onDidUpdateNotebookModel = this._register(new Emitter<{ cellDiff: CellDiffInfo[]; modelVersion: number }>);
	public readonly onDidUpdateNotebookModel = this._onDidUpdateNotebookModel.event;
	private readonly _onDidRevert = this._register(new Emitter<boolean>());
	public readonly onDidRevert = this._onDidRevert.event;
	private readonly _onDidAccept = this._register(new Emitter<void>());
	public readonly onDidAccept = this._onDidAccept.event;
	private snapshot?: { bytes: VSBuffer; dirty: boolean };
	private isEditFromUs: boolean = false;
	constructor(
		private readonly notebookEditor: INotebookEditor,
		public readonly entry: IModifiedFileEntry,
		private readonly viewType: string,
		@INotebookService private readonly notebookService: INotebookService,
		@IChatService chatService: IChatService,
		@INotebookLoggingService private readonly logService: INotebookLoggingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookEditorModelResolverService private readonly notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		super();

		this._register(chatService.onDidPerformUserAction(async e => {
			if (e.action.kind === 'chatEditingSessionAction' && !e.action.hasRemainingEdits && isEqual(e.action.uri, entry.modifiedURI)) {
				if (e.action.outcome === 'accepted') {
					await this.accept();
					await this.createSnapshot();
					this._onDidAccept.fire();
				}
				else if (e.action.outcome === 'rejected') {
					if (await this.revert()) {
						this._onDidRevert.fire(true);
					}
				}
			}
		}));

		const cancellationTokenStore = this._register(new DisposableStore());
		let cancellationToken = cancellationTokenStore.add(new CancellationTokenSource());
		const updateNotebookModel = (entry: IModifiedFileEntry, viewType: string, token: CancellationToken) => {
			this.throttledUpdateNotebookModel.trigger(() => this.updateNotebookModel(entry, viewType, token));
		};
		const modelObs = observableFromEvent(notebookEditor.onDidChangeModel, e => e);
		const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
		this._register(modifiedModel.onDidChangeContent(async () => {
			cancellationTokenStore.clear();
			if (!modifiedModel.isDisposed() && !entry.originalModel.isDisposed() && modifiedModel.getValue() === entry.originalModel.getValue()) {
				if (await this.revert()) {
					this._onDidRevert.fire(true);
				}
				return;
			}
			cancellationToken = cancellationTokenStore.add(new CancellationTokenSource());
			updateNotebookModel(entry, viewType, cancellationToken.token);
		}));
		this._register(autorunWithStore((r, store) => {
			const model = modelObs.read(r);
			if (model) {
				store.add(model.onDidChangeContent(() => {
					// Track changes from the user.
					if (!this.isEditFromUs && this.snapshot) {
						this.snapshot.dirty = true;
					}
				}));
			}
		}));

		updateNotebookModel(entry, viewType, cancellationToken.token);


	}

	public async createSnapshot() {
		const model = this.notebookEditor.textModel;
		if (!model) {
			return;
		}
		const [serializer, ref] = await Promise.all([
			this.getNotebookSerializer(),
			this.notebookModelResolverService.resolve(this.notebookEditor.textModel.uri)
		]);

		try {
			const data: NotebookData = {
				metadata: filter(model.metadata, key => !serializer.options.transientDocumentMetadata[key]),
				cells: [],
			};

			let outputSize = 0;
			for (const cell of model.cells) {
				const cellData: ICellDto2 = {
					cellKind: cell.cellKind,
					language: cell.language,
					mime: cell.mime,
					source: cell.getValue(),
					outputs: [],
					internalMetadata: cell.internalMetadata
				};

				const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
				if (outputSizeLimit > 0) {
					cell.outputs.forEach(output => {
						output.outputs.forEach(item => {
							outputSize += item.data.byteLength;
						});
					});
					if (outputSize > outputSizeLimit) {
						return;
					}
				}

				cellData.outputs = !serializer.options.transientOutputs ? cell.outputs : [];
				cellData.metadata = filter(cell.metadata, key => !serializer.options.transientCellMetadata[key]);

				data.cells.push(cellData);
			}

			const bytes = await serializer.notebookToData(data);
			this.snapshot = { bytes, dirty: ref.object.isDirty() };
		} finally {
			ref.dispose();
		}
	}

	private async revert(): Promise<boolean> {
		if (!this.snapshot) {
			return false;
		}
		await this.updateNotebook(this.snapshot.bytes, this.snapshot.dirty);
		return true;
	}

	private async updateNotebook(bytes: VSBuffer, dirty: boolean) {
		if (!this.notebookEditor.textModel) {
			return;
		}

		const ref = await this.notebookModelResolverService.resolve(this.notebookEditor.textModel.uri);
		try {
			const serializer = await this.getNotebookSerializer();
			const data = await serializer.dataToNotebook(bytes);
			this.notebookEditor.textModel.reset(data.cells, data.metadata, serializer.options);

			if (!dirty) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				// await this.notebookEditor.textModel.save({ reason: SaveReason.EXPLICIT });
				await ref.object.save({ reason: SaveReason.EXPLICIT });
			}
		} finally {
			ref.dispose();
		}
	}

	private async accept() {
		const modifiedModel = (this.entry as ChatEditingModifiedFileEntry).modifiedModel;
		const content = modifiedModel.getValue();
		await this.updateNotebook(VSBuffer.fromString(content), false);
	}

	async getNotebookSerializer() {
		const info = await this.notebookService.withNotebookDataProvider(this.viewType);
		return info.serializer;
	}

	private async updateNotebookModel(entry: IModifiedFileEntry, viewType: string, token: CancellationToken) {
		const modifiedModelVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		const original = this.notebookEditor.textModel;
		const originalModelVersion = original?.versionId ?? 0;
		const model = await this.getModifiedModelForDiff(entry, viewType, token);
		if (!model || token.isCancellationRequested || !original) {
			return;
		}
		const cellDiffInfo = (await this.computeDiff(original, model, token))?.cellDiffInfo;
		const currentVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		if (!cellDiffInfo || token.isCancellationRequested || currentVersion !== modifiedModelVersion || originalModelVersion !== original.versionId) {
			return;
		}
		if (cellDiffInfo.every(d => d.type === 'unchanged')) {
			return;
		}

		// All edits from here on are from us.
		this.isEditFromUs = true;
		try {
			const edits: ICellReplaceEdit[] = [];
			const mappings = new Map<number, number>();

			// First Delete.
			const deletedIndexes: number[] = [];
			cellDiffInfo.reverse().forEach(diff => {
				if (diff.type === 'delete') {
					deletedIndexes.push(diff.originalCellIndex);
					edits.push({
						editType: CellEditType.Replace,
						index: diff.originalCellIndex,
						cells: [],
						count: 1
					});
				}
			});
			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Next insert.
			cellDiffInfo.reverse().forEach(diff => {
				if (diff.type === 'modified' || diff.type === 'unchanged') {
					mappings.set(diff.modifiedCellIndex, diff.originalCellIndex);
				}
				if (diff.type === 'insert') {
					const originalIndex = mappings.get(diff.modifiedCellIndex - 1) ?? 0;
					mappings.set(diff.modifiedCellIndex, originalIndex);
					const cell = model.cells[diff.modifiedCellIndex];
					const newCell: ICellDto2 =
					{
						source: cell.getValue(),
						cellKind: cell.cellKind,
						language: cell.language,
						outputs: cell.outputs.map(output => output.asDto()),
						mime: cell.mime,
						metadata: cell.metadata,
						collapseState: cell.collapseState,
						internalMetadata: cell.internalMetadata
					};
					edits.push({
						editType: CellEditType.Replace,
						index: originalIndex + 1,
						cells: [newCell],
						count: 0
					});
				}
			});
			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Finally update
			cellDiffInfo.forEach(diff => {
				if (diff.type === 'modified') {
					const cell = original.cells[diff.originalCellIndex];
					const textModel = cell.textModel;
					if (textModel) {
						const newText = model.cells[diff.modifiedCellIndex].getValue();
						textModel.pushEditOperations(null, [
							EditOperation.replace(textModel.getFullModelRange(), newText)
						], () => null);
					}
				}
			});

			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
			}
			this._onDidRevert.fire(false);
			this._onDidUpdateNotebookModel.fire({ cellDiff: cellDiffInfo, modelVersion: original.versionId });
		}
		finally {
			this.isEditFromUs = false;
		}
	}
	private previousUriOfModelForDiff?: URI;

	private async getModifiedModelForDiff(entry: IModifiedFileEntry, viewType: string, token: CancellationToken): Promise<NotebookTextModel | undefined> {
		const text = (entry as ChatEditingModifiedFileEntry).modifiedModel.getValue();
		const bytes = VSBuffer.fromString(text);
		const uri = entry.modifiedURI.with({ scheme: `NotebookChatEditorController.modifiedScheme${Date.now().toString()}` });
		const stream = bufferToStream(bytes);
		if (this.previousUriOfModelForDiff) {
			this.notebookService.getNotebookTextModel(this.previousUriOfModelForDiff)?.dispose();
		}
		this.previousUriOfModelForDiff = uri;
		try {
			const model = await this.notebookService.createNotebookTextModel(viewType, uri, stream);
			if (token.isCancellationRequested) {
				model.dispose();
				return;
			}
			this._register(model);
			return model;
		} catch (ex) {
			this.logService.warn('NotebookChatEdit', `Failed to deserialize Notebook for ${uri.toString}, ${ex.message}`);
			this.logService.debug('NotebookChatEdit', ex.toString());
			return;
		}
	}

	async computeDiff(original: NotebookTextModel, modified: NotebookTextModel, token: CancellationToken) {
		const diffResult = await raceCancellation(this.notebookEditorWorkerService.computeDiff(original.uri, modified.uri), token);
		if (!diffResult || token.isCancellationRequested) {
			// after await the editor might be disposed.
			return;
		}

		prettyChanges(original, modified, diffResult.cellsDiff);

		return computeDiff(original, modified, diffResult);
	}
}

const ttPolicy = createTrustedTypesPolicy('notebookChatEditController', { createHTML: value => value });

class NotebookDeletedCellOverlayer extends Disposable {
	private readonly zoneRemover = this._register(new DisposableStore());
	private readonly createdViewZones = new Map<number, string>();
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
	}


	public createNecessaryOverlays(diffInfo: CellDiffInfo[], original: NotebookTextModel): void {
		this.clear();

		let currentIndex = 0;
		const deletedCellsToRender: { cells: NotebookCellTextModel[]; index: number } = { cells: [], index: 0 };
		diffInfo.forEach(diff => {
			if (diff.type === 'delete') {
				const deletedCell = original.cells[diff.originalCellIndex];
				if (deletedCell) {
					deletedCellsToRender.cells.push(deletedCell);
					deletedCellsToRender.index = currentIndex;
				}
			} else {
				if (deletedCellsToRender.cells.length) {
					this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
					deletedCellsToRender.cells.length = 0;
				}
				currentIndex = diff.modifiedCellIndex;
			}
		});
		if (deletedCellsToRender.cells.length) {
			this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
		}
	}

	public clear() {
		this.zoneRemover.clear();
	}


	private _createWidget(index: number, cells: NotebookCellTextModel[]) {
		this._createWidgetImpl(index, cells);
	}
	private async _createWidgetImpl(index: number, cells: NotebookCellTextModel[]) {
		const rootContainer = document.createElement('div');
		const widgets = cells.map(cell => new NotebookDeletedCellWidget(this._notebookEditor, cell.getValue(), cell.language, rootContainer, this.languageService));
		const heights = await Promise.all(widgets.map(w => w.render()));
		const totalHeight = heights.reduce<number>((prev, curr) => prev + curr, 0);

		this._notebookEditor.changeViewZones(accessor => {
			const notebookViewZone = {
				afterModelPosition: index,
				heightInPx: totalHeight,
				domNode: rootContainer
			};

			const id = accessor.addZone(notebookViewZone);
			accessor.layoutZone(id);
			this.createdViewZones.set(index, id);
			this.zoneRemover.add(toDisposable(() => {
				if (this.createdViewZones.get(index) === id) {
					this.createdViewZones.delete(index);
				}
				if (!this._notebookEditor.isDisposed) {
					this._notebookEditor.changeViewZones(accessor => {
						accessor.removeZone(id);
						dispose(widgets);
					});
				}
			}));
		});
	}

}


export class OriginalNotebookModelReferenceCollection extends ReferenceCollection<Promise<NotebookTextModel>> {
	private readonly modelsToDispose = new Set<string>();
	constructor(@INotebookService private readonly notebookService: INotebookService) {
		super();
	}

	protected override async createReferencedObject(key: string, fileEntry: IModifiedFileEntry, viewType: string): Promise<NotebookTextModel> {
		this.modelsToDispose.delete(key);
		const uri = fileEntry.originalURI;
		const model = this.notebookService.getNotebookTextModel(uri);
		if (model) {
			return model;
		}
		const bytes = VSBuffer.fromString(fileEntry.originalModel.getValue());
		const stream = bufferToStream(bytes);

		return this.notebookService.createNotebookTextModel(viewType, uri, stream);
	}
	protected override destroyReferencedObject(key: string, modelPromise: Promise<NotebookTextModel>): void {
		this.modelsToDispose.add(key);

		(async () => {
			try {
				const model = await modelPromise;

				if (!this.modelsToDispose.has(key)) {
					// return if model has been acquired again meanwhile
					return;
				}

				// Finally we can dispose the model
				model.dispose();
			} catch (error) {
				// ignore
			} finally {
				this.modelsToDispose.delete(key); // Untrack as being disposed
			}
		})();
	}
}

class NotebookDeletedCellWidget extends Disposable {
	private readonly container: HTMLElement;
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		// private readonly _index: number,
		private readonly code: string,
		private readonly language: string,
		container: HTMLElement,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this.container = DOM.append(container, document.createElement('div'));
		this._register(toDisposable(() => {
			container.removeChild(this.container);
		}));
	}

	public async render() {
		const code = this.code;
		const languageId = this.language;
		const codeHtml = await tokenizeToString(this.languageService, code, languageId);

		// const colorMap = this.getDefaultColorMap();
		const fontInfo = this._notebookEditor.getBaseCellEditorOptions(languageId).value;
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';
		// If we have any editors, then use left layout of one of those.
		const editor = this._notebookEditor.codeEditors.map(c => c[1]).find(c => c);
		const layoutInfo = editor?.getOptions().get(EditorOption.layoutInfo);

		const style = ``
			+ `font-family: var(${fontFamilyVar});`
			+ `font-weight: var(${fontWeightVar});`
			+ `font-size: var(${fontSizeVar});`
			+ fontInfo.lineHeight ? `line-height: ${fontInfo.lineHeight}px;` : ''
				+ layoutInfo?.contentLeft ? `margin-left: ${layoutInfo}px;` : ''
		+ `white-space: pre;`;



		const rootContainer = this.container;
		rootContainer.classList.add('code-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const focusIndicatorLeft = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
		const cellContainer = DOM.append(container, DOM.$('.cell.code'));
		DOM.append(focusIndicatorLeft, DOM.$('div.execution-count-label'));
		const editorPart = DOM.append(cellContainer, DOM.$('.cell-editor-part'));
		let editorContainer = DOM.append(editorPart, DOM.$('.cell-editor-container'));
		editorContainer = DOM.append(editorContainer, DOM.$('.code', { style }));
		if (fontInfo.fontFamily) {
			editorContainer.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		}
		if (fontInfo.fontSize) {
			editorContainer.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
		}
		if (fontInfo.fontWeight) {
			editorContainer.style.setProperty(fontWeightVar, fontInfo.fontWeight);
		}
		editorContainer.innerHTML = (ttPolicy?.createHTML(codeHtml) || codeHtml) as string;

		const lineCount = splitLines(code).length;
		const height = (lineCount * (fontInfo.lineHeight || DefaultLineHeight)) + 12 + 12; // We have 12px top and bottom in generated code HTML;
		const totalHeight = height + 16;

		return totalHeight;
	}
}

export class NotebookOriginalModelReferenceFactory implements INotebookOriginalModelReferenceFactory {
	readonly _serviceBrand: undefined;
	private _resourceModelCollection: OriginalNotebookModelReferenceCollection & ReferenceCollection<Promise<NotebookTextModel>> /* TS Fail */ | undefined = undefined;
	private get resourceModelCollection() {
		if (!this._resourceModelCollection) {
			this._resourceModelCollection = this.instantiationService.createInstance(OriginalNotebookModelReferenceCollection);
		}

		return this._resourceModelCollection;
	}

	private _asyncModelCollection: AsyncReferenceCollection<NotebookTextModel> | undefined = undefined;
	private get asyncModelCollection() {
		if (!this._asyncModelCollection) {
			this._asyncModelCollection = new AsyncReferenceCollection(this.resourceModelCollection);
		}

		return this._asyncModelCollection;
	}

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	getOrCreate(fileEntry: IModifiedFileEntry, viewType: string): Promise<IReference<NotebookTextModel>> {
		return this.asyncModelCollection.acquire(fileEntry.originalURI.toString(), fileEntry, viewType);
	}
}

