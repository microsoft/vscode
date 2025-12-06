/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITransaction, autorun, transaction } from '../../../../../base/common/observable.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { TextEdit as EditorTextEdit } from '../../../../../editor/common/core/edits/textEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { Location, TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IUndoRedoElement, IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane, SaveReason } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService, isTextFileEditorModel, stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ISnapshotEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingCodeEditorIntegration } from './chatEditingCodeEditorIntegration.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingTextModelChangeService } from './chatEditingTextModelChangeService.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

interface IMultiDiffEntryDelegate {
	collapse: (transaction: ITransaction | undefined) => void;
}


export class ChatEditingModifiedDocumentEntry extends AbstractChatEditingModifiedFileEntry implements IModifiedFileEntry {

	readonly initialContent: string;

	private readonly originalModel: ITextModel;
	private readonly modifiedModel: ITextModel;

	private readonly _docFileEditorModel: IResolvedTextEditorModel;

	override get changesCount() {
		return this._textModelChangeService.diffInfo.map(diff => diff.changes.length);
	}

	get diffInfo() {
		return this._textModelChangeService.diffInfo;
	}

	get linesAdded() {
		return this._textModelChangeService.diffInfo.map(diff => {
			let added = 0;
			for (const c of diff.changes) {
				added += Math.max(0, c.modified.endLineNumberExclusive - c.modified.startLineNumber);
			}
			return added;
		});
	}
	get linesRemoved() {
		return this._textModelChangeService.diffInfo.map(diff => {
			let removed = 0;
			for (const c of diff.changes) {
				removed += Math.max(0, c.original.endLineNumberExclusive - c.original.startLineNumber);
			}
			return removed;
		});
	}

	readonly originalURI: URI;
	private readonly _textModelChangeService: ChatEditingTextModelChangeService;

	constructor(
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: IMultiDiffEntryDelegate,
		telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string | undefined,
		@IMarkerService markerService: IMarkerService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService fileService: IFileService,
		@IUndoRedoService undoRedoService: IUndoRedoService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAiEditTelemetryService aiEditTelemetryService: IAiEditTelemetryService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super(
			resourceRef.object.textEditorModel.uri,
			telemetryInfo,
			kind,
			configService,
			fileConfigService,
			chatService,
			fileService,
			undoRedoService,
			instantiationService,
			aiEditTelemetryService,
		);

		this._docFileEditorModel = this._register(resourceRef).object;
		this.modifiedModel = resourceRef.object.textEditorModel;
		this.originalURI = ChatEditingTextModelContentProvider.getFileURI(telemetryInfo.sessionResource, this.entryId, this.modifiedURI.path);

		this.initialContent = initialContent ?? this.modifiedModel.getValue();
		const docSnapshot = this.originalModel = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(initialContent !== undefined ? stringToSnapshot(initialContent) : this.modifiedModel.createSnapshot()),
				languageService.createById(this.modifiedModel.getLanguageId()),
				this.originalURI,
				false
			)
		);

		this._textModelChangeService = this._register(instantiationService.createInstance(ChatEditingTextModelChangeService,
			this.originalModel, this.modifiedModel, this._stateObs, () => this._isExternalEditInProgress));

		this._register(this._textModelChangeService.onDidAcceptOrRejectAllHunks(action => {
			this._stateObs.set(action, undefined);
			this._notifySessionAction(action === ModifiedFileEntryState.Accepted ? 'accepted' : 'rejected');
		}));

		this._register(this._textModelChangeService.onDidAcceptOrRejectLines(action => {
			this._notifyAction({
				kind: 'chatEditingHunkAction',
				uri: this.modifiedURI,
				outcome: action.state,
				languageId: this.modifiedModel.getLanguageId(),
				...action
			});
		}));

		// Create a reference to this model to avoid it being disposed from under our nose
		(async () => {
			const reference = await textModelService.createModelReference(docSnapshot.uri);
			if (this._store.isDisposed) {
				reference.dispose();
				return;
			}
			this._register(reference);
		})();


		this._register(this._textModelChangeService.onDidUserEditModel(() => {
			this._userEditScheduler.schedule();
			const didResetToOriginalContent = this.modifiedModel.getValue() === this.initialContent;
			if (this._stateObs.get() === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
				this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
			}
		}));

		const resourceFilter = this._register(new MutableDisposable());
		this._register(autorun(r => {
			const inProgress = this._waitsForLastEdits.read(r);
			if (inProgress) {
				const res = this._lastModifyingResponseObs.read(r);
				const req = res && res.session.getRequests().find(value => value.id === res.requestId);
				resourceFilter.value = markerService.installResourceFilter(this.modifiedURI, req?.message.text || localize('default', "Chat Edits"));
			} else {
				resourceFilter.clear();
			}
		}));
	}

	equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			this.modifiedURI.toString() === snapshot.resource.toString() &&
			this.modifiedModel.getLanguageId() === snapshot.languageId &&
			this.originalModel.getValue() === snapshot.original &&
			this.modifiedModel.getValue() === snapshot.current &&
			this.state.get() === snapshot.state;
	}

	createSnapshot(chatSessionResource: URI, requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: this.modifiedModel.getLanguageId(),
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(chatSessionResource, requestId, undoStop, this.modifiedURI.path),
			original: this.originalModel.getValue(),
			current: this.modifiedModel.getValue(),
			state: this.state.get(),
			telemetryInfo: this._telemetryInfo
		};
	}

	public getCurrentContents() {
		return this.modifiedModel.getValue();
	}

	public override hasModificationAt(location: Location): boolean {
		return location.uri.toString() === this.modifiedModel.uri.toString() && this._textModelChangeService.hasHunkAt(location.range);
	}

	async restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk = true) {
		this._stateObs.set(snapshot.state, undefined);
		await this._textModelChangeService.resetDocumentValues(snapshot.original, restoreToDisk ? snapshot.current : undefined);
	}

	async resetToInitialContent() {
		await this._textModelChangeService.resetDocumentValues(undefined, this.initialContent);
	}

	protected override async _areOriginalAndModifiedIdentical(): Promise<boolean> {
		return this._textModelChangeService.areOriginalAndModifiedIdentical();
	}

	protected override _resetEditsState(tx: ITransaction): void {
		super._resetEditsState(tx);
		this._textModelChangeService.clearCurrentEditLineDecoration();
	}

	protected override _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement {
		const request = response.session.getRequests().find(req => req.id === response.requestId);
		const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
		return new SingleModelEditStackElement(label, 'chat.edit', this.modifiedModel, null);
	}

	async acceptAgentEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<void> {

		const result = await this._textModelChangeService.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);

		transaction((tx) => {
			this._waitsForLastEdits.set(!isLastEdits, tx);
			this._stateObs.set(ModifiedFileEntryState.Modified, tx);

			if (!isLastEdits) {
				this._rewriteRatioObs.set(result.rewriteRatio, tx);
			} else {
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});
		if (isLastEdits && this._shouldAutoSave()) {
			await this._textFileService.save(this.modifiedModel.uri, {
				reason: SaveReason.AUTO,
				skipSaveParticipants: true,
			});
		}
	}


	protected override async _doAccept(): Promise<void> {
		this._textModelChangeService.keep();
		this._multiDiffEntryDelegate.collapse(undefined);

		const config = this._fileConfigService.getAutoSaveConfiguration(this.modifiedURI);
		if (!config.autoSave || !this._textFileService.isDirty(this.modifiedURI)) {
			// SAVE after accept for manual-savers, for auto-savers
			// trigger explict save to get save participants going
			try {
				await this._textFileService.save(this.modifiedURI, {
					reason: SaveReason.EXPLICIT,
					force: true,
					ignoreErrorHandler: true
				});
			} catch {
				// ignored
			}
		}
	}

	protected override async _doReject(): Promise<void> {
		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			if (isTextFileEditorModel(this._docFileEditorModel)) {
				await this._docFileEditorModel.revert({ soft: true });
				await this._fileService.del(this.modifiedURI).catch(err => {
					// don't block if file is already deleted
				});
			}
			this._onDidDelete.fire();
		} else {
			this._textModelChangeService.undo();
			if (this._textModelChangeService.allEditsAreFromUs && isTextFileEditorModel(this._docFileEditorModel) && this._shouldAutoSave()) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				await this._docFileEditorModel.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
			}
			this._multiDiffEntryDelegate.collapse(undefined);
		}
	}

	protected _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const codeEditor = getCodeEditor(editor.getControl());
		assertType(codeEditor);

		const diffInfo = this._textModelChangeService.diffInfo;

		return this._instantiationService.createInstance(ChatEditingCodeEditorIntegration, this, codeEditor, diffInfo, false);
	}

	private _shouldAutoSave() {
		return this.modifiedURI.scheme !== Schemas.untitled;
	}

	async computeEditsFromSnapshots(beforeSnapshot: string, afterSnapshot: string): Promise<(TextEdit | ICellEditOperation)[]> {
		const stringEdit = await this._editorWorkerService.computeStringEditFromDiff(
			beforeSnapshot,
			afterSnapshot,
			{ maxComputationTimeMs: 5000 },
			'advanced'
		);

		const editorTextEdit = EditorTextEdit.fromStringEdit(stringEdit, new StringText(beforeSnapshot));
		return editorTextEdit.replacements.slice();
	}

	async save(): Promise<void> {
		if (this.modifiedModel.uri.scheme === Schemas.untitled) {
			return;
		}

		// Save the current model state to disk if dirty
		if (this._textFileService.isDirty(this.modifiedModel.uri)) {
			await this._textFileService.save(this.modifiedModel.uri, {
				reason: SaveReason.EXPLICIT,
				skipSaveParticipants: true
			});
		}
	}

	async revertToDisk(): Promise<void> {
		if (this.modifiedModel.uri.scheme === Schemas.untitled) {
			return;
		}

		// Revert to reload from disk, ensuring in-memory model matches disk
		const fileModel = this._textFileService.files.get(this.modifiedModel.uri);
		if (fileModel && !fileModel.isDisposed()) {
			await fileModel.revert({ soft: false });
		}
	}
}
