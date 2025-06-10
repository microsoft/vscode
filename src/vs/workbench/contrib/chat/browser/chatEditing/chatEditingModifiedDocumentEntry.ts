/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ITransaction, autorun, transaction } from '../../../../../base/common/observable.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { offsetEditFromLineRangeMapping } from '../../../../../editor/common/model/textModelStringEdit.js';
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
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ChatEditKind, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingCodeEditorIntegration } from './chatEditingCodeEditorIntegration.js';
import { AbstractChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo, ISnapshotEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedTextModel } from './chatEditingModifiedTextModel.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';


export class ChatEditingModifiedDocumentEntry extends AbstractChatEditingModifiedFileEntry implements IModifiedFileEntry {

	readonly initialContent: string;

	private readonly originalModel: ITextModel;
	private readonly modifiedModel: ITextModel;

	private readonly _docFileEditorModel: IResolvedTextEditorModel;

	private _edit: StringEdit = StringEdit.empty;

	override get changesCount() {
		return this.modifiedTextModel.diffInfo.map(diff => diff.changes.length);
	}

	readonly originalURI: URI;
	private readonly modifiedTextModel: ChatEditingModifiedTextModel;

	constructor(
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
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
		@IInstantiationService instantiationService: IInstantiationService
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
			instantiationService
		);

		this._docFileEditorModel = this._register(resourceRef).object;
		this.modifiedModel = resourceRef.object.textEditorModel;
		this.originalURI = ChatEditingTextModelContentProvider.getFileURI(telemetryInfo.sessionId, this.entryId, this.modifiedURI.path);

		this.initialContent = initialContent ?? this.modifiedModel.getValue();
		const docSnapshot = this.originalModel = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(initialContent ? stringToSnapshot(initialContent) : this.modifiedModel.createSnapshot()),
				languageService.createById(this.modifiedModel.getLanguageId()),
				this.originalURI,
				false
			)
		);

		this.modifiedTextModel = this._register(instantiationService.createInstance(ChatEditingModifiedTextModel,
			this.originalModel, this.modifiedModel, this._stateObs));

		this._register(this.modifiedTextModel.onHunkAction(action => {
			if (action === 'acceptedAllChanges') {
				this._stateObs.set(ModifiedFileEntryState.Accepted, undefined);
				this._notifyAction('accepted');
			} else {
				this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
				this._notifyAction('rejected');
			}
		}));

		this._register(autorun(r => {
			const diffInfo = this.modifiedTextModel.diffInfo.read(r);
			if (this.state.get() !== ModifiedFileEntryState.Modified) {
				return;
			}
			// If the diff has changed, then recompute the edit
			this._edit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diffInfo.changes);
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


		this._register(this.modifiedModel.onDidChangeContent(e => {
			this._edit = this.modifiedTextModel.mirrorEdits(e, this._edit);

			if (!this.modifiedTextModel.isEditFromUs) {
				this._userEditScheduler.schedule();
				const didResetToOriginalContent = this.modifiedModel.getValue() === this.initialContent;
				if (this._stateObs.get() === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
					this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
				}
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
			this._edit.equals(snapshot.originalToCurrentEdit) &&
			this.state.get() === snapshot.state;
	}

	createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: this.modifiedModel.getLanguageId(),
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this._telemetryInfo.sessionId, requestId, undoStop, this.modifiedURI.path),
			original: this.originalModel.getValue(),
			current: this.modifiedModel.getValue(),
			originalToCurrentEdit: this._edit,
			state: this.state.get(),
			telemetryInfo: this._telemetryInfo
		};
	}

	restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk = true) {
		this._stateObs.set(snapshot.state, undefined);
		this.originalModel.setValue(snapshot.original);
		if (restoreToDisk) {
			this.modifiedTextModel.setDocValue(snapshot.current);
		}
		this._edit = snapshot.originalToCurrentEdit;
		this.modifiedTextModel.updateDiffInfo();
	}

	resetToInitialContent() {
		this.modifiedTextModel.setDocValue(this.initialContent);
	}

	protected override async _areOriginalAndModifiedIdentical(): Promise<boolean> {
		return this.modifiedTextModel.areOriginalAndModifiedIdentical();
	}

	protected override _resetEditsState(tx: ITransaction): void {
		super._resetEditsState(tx);
		this.modifiedTextModel.clearCurrentEditLineDecoration();
	}

	protected override _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement {
		const request = response.session.getRequests().find(req => req.id === response.requestId);
		const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
		return new SingleModelEditStackElement(label, 'chat.edit', this.modifiedModel, null);
	}

	async acceptAgentEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {

		const result = await this.modifiedTextModel.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);

		transaction((tx) => {
			this._waitsForLastEdits.set(!isLastEdits, tx);
			this._stateObs.set(ModifiedFileEntryState.Modified, tx);

			if (!isLastEdits) {
				this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
				this._rewriteRatioObs.set(result.rewriteRatio, tx);
			} else {
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});
		if (isLastEdits) {
			await this._textFileService.save(this.modifiedModel.uri, {
				reason: SaveReason.AUTO,
				skipSaveParticipants: true,
			});
		}
	}


	protected override async _doAccept(): Promise<void> {
		this.originalModel.setValue(this.modifiedModel.createSnapshot());
		await this.modifiedTextModel.updateDiffInfo();
		this._edit = StringEdit.empty;
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
				await this._fileService.del(this.modifiedURI);
			}
			this._onDidDelete.fire();
		} else {
			this.modifiedTextModel.setDocValue(this.originalModel.getValue());
			if (this.modifiedTextModel.allEditsAreFromUs && isTextFileEditorModel(this._docFileEditorModel)) {
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

		const diffInfo = this.modifiedTextModel.diffInfo;

		return this._instantiationService.createInstance(ChatEditingCodeEditorIntegration, this, codeEditor, diffInfo, false);
	}
}
