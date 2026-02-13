/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable, IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { IDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoElement, IUndoRedoService, UndoRedoElementType } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ISnapshotEntry, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IChatResponseModel } from '../../common/model/chatModel.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

interface IMultiDiffEntryDelegate {
	collapse: (transaction: ITransaction | undefined) => void;
}

/**
 * Represents a file that has been deleted by the chat editing session.
 * Unlike ChatEditingModifiedDocumentEntry, this doesn't maintain a live model
 * since the file no longer exists on disk.
 */
export class ChatEditingDeletedFileEntry extends AbstractChatEditingModifiedFileEntry implements IModifiedFileEntry {

	readonly initialContent: string;

	/**
	 * The original content before deletion, stored for diff display and potential restoration.
	 */
	private readonly _originalContent: string;

	/**
	 * Lazily created model for the original content (for diff display).
	 */
	private _originalModel: ITextModel | undefined;

	/**
	 * Lazily created empty model representing the deleted state (for diff display).
	 */
	private _modifiedModel: ITextModel | undefined;

	readonly originalURI: URI;

	readonly diffInfo: IObservable<IDocumentDiff>;
	readonly linesAdded: IObservable<number> = constObservable(0);
	readonly linesRemoved: IObservable<number>;

	private readonly _changesCount = observableValue<number>(this, 1);
	override readonly changesCount = this._changesCount;
	readonly isDeletion = true;

	constructor(
		resource: URI,
		originalContent: string,
		private readonly _multiDiffEntryDelegate: IMultiDiffEntryDelegate,
		telemetryInfo: IModifiedEntryTelemetryInfo,
		private readonly _languageId: string,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@IFileService fileService: IFileService,
		@IUndoRedoService undoRedoService: IUndoRedoService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAiEditTelemetryService aiEditTelemetryService: IAiEditTelemetryService,
	) {
		super(
			resource,
			telemetryInfo,
			ChatEditKind.Deleted,
			configService,
			fileConfigService,
			chatService,
			fileService,
			undoRedoService,
			instantiationService,
			aiEditTelemetryService,
		);

		this._originalContent = originalContent;
		this.initialContent = originalContent;
		this.originalURI = ChatEditingTextModelContentProvider.getFileURI(telemetryInfo.sessionResource, this.entryId, resource.path);
		this.diffInfo = constObservable(this._diffInfo());
		this.linesRemoved = constObservable(this._getOrCreateOriginalModel().getLineCount());
	}

	override dispose(): void {
		this._originalModel?.dispose();
		this._modifiedModel?.dispose();
		super.dispose();
	}

	/**
	 * Gets or creates the original model for diff display.
	 */
	private _getOrCreateOriginalModel(): ITextModel {
		if (!this._originalModel || this._originalModel.isDisposed()) {
			this._originalModel = this._modelService.createModel(
				createTextBufferFactoryFromSnapshot(stringToSnapshot(this._originalContent)),
				this._languageService.createById(this._languageId),
				this.originalURI,
				false
			);
		}
		return this._originalModel;
	}

	/**
	 * Gets or creates an empty model representing the deleted state.
	 */
	private _getOrCreateModifiedModel(): ITextModel {
		if (!this._modifiedModel || this._modifiedModel.isDisposed()) {
			// Create empty model - file is deleted so content is empty
			this._modifiedModel = this._modelService.createModel(
				'',
				this._languageService.createById(this._languageId),
				this.modifiedURI.with({ scheme: 'deleted-file' }),
				false
			);
		}
		return this._modifiedModel;
	}

	private _diffInfo() {
		// For deleted files, return a simple diff showing all content removed
		const originalModel = this._getOrCreateOriginalModel();
		this._getOrCreateModifiedModel(); // Ensure the modified model exists for the diff view
		const originalLineCount = originalModel.getLineCount();

		return {
			changes: [new DetailedLineRangeMapping(
				new LineRange(1, originalLineCount + 1),
				new LineRange(1, 1),
				undefined
			)],
			quitEarly: false,
			identical: false,
			moves: []
		};
	}

	getDiffInfo(): Promise<IDocumentDiff> {
		return Promise.resolve(this._diffInfo());
	}

	equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			this.modifiedURI.toString() === snapshot.resource.toString() &&
			this._languageId === snapshot.languageId &&
			this._originalContent === snapshot.original &&
			snapshot.current === '' &&
			this.state.get() === snapshot.state;
	}

	createSnapshot(chatSessionResource: URI, requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: this._languageId,
			snapshotUri: this.originalURI,
			original: this._originalContent,
			current: '', // File is deleted, so current content is empty
			state: this.state.get(),
			telemetryInfo: this._telemetryInfo,
			isDeleted: true,
		};
	}

	async restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk = true): Promise<void> {
		this._stateObs.set(snapshot.state, undefined);

		if (restoreToDisk && snapshot.current !== '') {
			// Restore file to disk with the snapshot content
			await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(snapshot.current));
		}
	}

	async resetToInitialContent(): Promise<void> {
		// Restore the file with original content
		await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
	}

	protected override async _areOriginalAndModifiedIdentical(): Promise<boolean> {
		// A deleted file is never identical to its original (unless original was empty)
		return this._originalContent === '';
	}

	protected override _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement {
		return {
			type: UndoRedoElementType.Resource,
			resource: this.modifiedURI,
			label: 'Chat File Deletion',
			code: 'chat.delete',
			undo: async () => {
				// Restore the file
				await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
			},
			redo: async () => {
				// Delete the file again
				await this._fileService.del(this.modifiedURI, { useTrash: false });
			}
		};
	}

	async acceptAgentEdits(_uri: URI, _edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, _responseModel: IChatResponseModel | undefined): Promise<void> {
		// For deleted files, there are no incremental edits - the file is just deleted
		transaction((tx) => {
			this._waitsForLastEdits.set(!isLastEdits, tx);
			this._stateObs.set(ModifiedFileEntryState.Modified, tx);

			if (isLastEdits) {
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});
	}

	protected override async _doAccept(): Promise<void> {
		// File deletion is already done - just collapse the entry
		this._multiDiffEntryDelegate.collapse(undefined);
	}

	protected override async _doReject(): Promise<void> {
		// Restore the file from original content
		await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
		this._multiDiffEntryDelegate.collapse(undefined);
	}

	protected _createEditorIntegration(_editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		// Deleted files don't need complex editor integration since there's nothing to navigate
		return {
			currentIndex: observableValue(this, 0),
			reveal: () => { },
			next: () => false,
			previous: () => false,
			enableAccessibleDiffView: () => { },
			acceptNearestChange: async () => { },
			rejectNearestChange: async () => { },
			toggleDiff: async () => { },
			dispose: () => { }
		};
	}

	async computeEditsFromSnapshots(_beforeSnapshot: string, _afterSnapshot: string): Promise<(TextEdit | ICellEditOperation)[]> {
		// For deleted files, we don't compute incremental edits
		return [];
	}

	async save(): Promise<void> {
		// Nothing to save - file is deleted
	}

	async revertToDisk(): Promise<void> {
		// Nothing to revert - file is deleted
	}
}
