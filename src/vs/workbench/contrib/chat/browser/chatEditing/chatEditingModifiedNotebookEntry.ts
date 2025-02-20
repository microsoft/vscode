/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../base/common/assert.js';
import { decodeBase64, encodeBase64, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITransaction, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { ChatEditingNotebookFileSystemProvider } from '../../../notebook/browser/contrib/chatEdit/chatEditingNotebookFileSystemProvider.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { ICellEditOperation, IResolvedNotebookEditorModel, NotebookData, NotebookSetting, TransientOptions } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditKind, IModifiedFileEntryEditorIntegration } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { AbstractChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo, ISnapshotEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingSnapshotTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

export class ChatEditingModifiedNotebookEntry extends AbstractChatEditingModifiedFileEntry {

	private readonly modifiedModel: NotebookTextModel;
	private readonly originalModel: NotebookTextModel;
	override originalURI: URI;
	override initialContent: string;

	private readonly _changesCount = observableValue<number>(this, 0);
	override changesCount: IObservable<number> = this._changesCount;

	public static async create(uri: URI, _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void }, telemetryInfo: IModifiedEntryTelemetryInfo, chatKind: ChatEditKind, initialContent: string | undefined, instantiationService: IInstantiationService): Promise<AbstractChatEditingModifiedFileEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const resolver = accessor.get(INotebookEditorModelResolverService);
			const resourceRef: IReference<IResolvedNotebookEditorModel> = await resolver.resolve(uri);
			const notebook = resourceRef.object.notebook;
			const originalUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(telemetryInfo.requestId, notebook.uri.path);

			const [options, buffer] = await Promise.all([
				notebookService.withNotebookDataProvider(resourceRef.object.notebook.notebookType),
				notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(s => streamToBuffer(s))
			]);
			const originalDisposables = new DisposableStore();
			originalDisposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));

			const originalRef = await resolver.resolve(originalUri, notebook.viewType);
			originalDisposables.add(originalRef);
			if (initialContent) {
				restoreSnapshot(originalRef.object.notebook, initialContent);
			}
			initialContent = initialContent || createSnapshot(originalRef.object.notebook, options.serializer.options, accessor.get(IConfigurationService));
			return instantiationService.createInstance(ChatEditingModifiedNotebookEntry, resourceRef, originalRef, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent);
		});
	}


	constructor(
		modifiedResourceRef: IReference<IResolvedNotebookEditorModel>,
		originalResourceRef: IReference<IResolvedNotebookEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private readonly transientOptions: TransientOptions | undefined,
		telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService

	) {
		super(modifiedResourceRef.object.notebook.uri, telemetryInfo, kind, configurationService, fileConfigService, chatService, fileService, instantiationService);
		this._register(modifiedResourceRef);
		this._register(originalResourceRef);
		this.modifiedModel = modifiedResourceRef.object.notebook;
		this.originalModel = originalResourceRef.object.notebook;
		this.originalURI = this.originalModel.uri;
		this.initialContent = initialContent;
	}

	protected override async _doAccept(tx: ITransaction | undefined): Promise<void> {
		const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
		const snapshot = this.modifiedModel.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions: this.transientOptions });
		this.originalModel.restoreSnapshot(snapshot, this.transientOptions);
		this._changesCount.set(0, tx);
		// this._diffInfo.set(nullDocumentDiff, tx);
		// this._edit = OffsetEdit.empty;
		await this._collapse(tx);

	}

	protected override async _doReject(tx: ITransaction | undefined): Promise<void> {
		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			// await this.docFileEditorModel.revert({ soft: true });
			await this._fileService.del(this.modifiedURI);
			this._onDidDelete.fire();
		} else {
			const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
			const snapshot = this.originalModel.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions: this.transientOptions });
			this.modifiedModel.restoreSnapshot(snapshot, this.transientOptions);
			// if (this._allEditsAreFromUs) {
			// 	// 	// save the file after discarding so that the dirty indicator goes away
			// 	// 	// and so that an intermediate saved state gets reverted
			// 	// 	await this.docFileEditorModel.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
			// }
			await this._collapse(tx);
		}

	}
	private async _collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	protected override _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		throw new Error('Method not implemented.');
	}

	override acceptAgentEdits(resource: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): void {

		const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
		assert(isCellUri || isEqual(resource, this.modifiedURI));
		assertType(edits.every(edit => !TextEdit.isTextEdit(edit) || isCellUri));

		// needs to handle notebook and textual cell edits

		throw new Error('Method not implemented.');
	}

	override createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: 'notebook',
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this._telemetryInfo.sessionId, requestId, undoStop, this.modifiedURI.path),
			original: this.initialContent,
			current: createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService),
			originalToCurrentEdit: OffsetEdit.empty,
			state: this.state.get(),
			telemetryInfo: this.telemetryInfo,
		};
	}

	override equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			this.modifiedURI.toString() === snapshot.resource.toString() &&
			this.state.get() === snapshot.state &&
			createSnapshot(this.originalModel, this.transientOptions, this.configurationService) === snapshot.original &&
			createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService) === snapshot.current;

	}

	override restoreFromSnapshot(snapshot: ISnapshotEntry): void {
		this._stateObs.set(snapshot.state, undefined);
		restoreSnapshot(this.originalModel, snapshot.original);
		restoreSnapshot(this.modifiedModel, snapshot.current);
		// this._edit = snapshot.originalToCurrentEdit;
		// this._updateDiffInfoSeq();
		restoreSnapshot(this.modifiedModel, snapshot.current);

	}

	override resetToInitialContent(): void {
		restoreSnapshot(this.modifiedModel, this.initialContent);
	}
}

const BufferMarker = 'ArrayBuffer-4f56482b-5a03-49ba-8356-210d3b0c1c3d';
function createSnapshot(notebook: NotebookTextModel, transientOptions: TransientOptions | undefined, configurationService: IConfigurationService): string {
	const outputSizeLimit = configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
	return serializeSnapshot(notebook.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions }), transientOptions);
}

function restoreSnapshot(notebook: NotebookTextModel, snapshot: string): void {
	const { transientOptions, data } = deserializeSnapshot(snapshot);
	notebook.restoreSnapshot(data, transientOptions);
}

function serializeSnapshot(data: NotebookData, transientOptions: TransientOptions | undefined): string {
	return JSON.stringify([
		JSON.stringify(transientOptions)
		, JSON.stringify(data, (_key, value) => {
			if (value instanceof VSBuffer) {
				return {
					type: BufferMarker,
					data: encodeBase64(value)
				};
			}
			return value;
		})
	]);
}

function deserializeSnapshot(snapshot: string): { transientOptions: TransientOptions | undefined; data: NotebookData } {
	const [transientOptionsStr, dataStr] = JSON.parse(snapshot);
	const transientOptions = transientOptionsStr ? JSON.parse(transientOptionsStr) as TransientOptions : undefined;

	const data: NotebookData = JSON.parse(dataStr, (_key, value) => {
		if (value && value.type === BufferMarker) {
			return decodeBase64(value.data);
		}
		return value;
	});

	return { transientOptions, data };
}
