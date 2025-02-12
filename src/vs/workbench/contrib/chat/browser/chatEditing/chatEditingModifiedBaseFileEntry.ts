/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, IObservable, ITransaction, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, ISnapshotEntry, ISnapshotEntryDTO, STORAGE_CONTENTS_FOLDER, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { hashAsync, StringSHA1 } from '../../../../../base/common/hash.js';
import { ObservableDisposable } from '../../../../../base/common/observableDisposable.js';
import { IChatResponseModel } from '../../common/chatModel.js';

class AutoAcceptControl {
	constructor(
		readonly total: number,
		readonly remaining: number,
		readonly cancel: () => void
	) { }
}

export abstract class ChatEditingModifiedBaseFileEntry extends ObservableDisposable {
	public static readonly scheme = 'modified-file-entry';
	protected static lastEntryId = 0;
	public readonly entryId = `${ChatEditingModifiedBaseFileEntry.scheme}::${++ChatEditingModifiedBaseFileEntry.lastEntryId}`;

	protected _allEditsAreFromUs: boolean = true;
	public get allEditsAreFromUs() {
		return this._allEditsAreFromUs;
	}

	protected readonly _onDidDelete = this._register(new Emitter<void>());
	public get onDidDelete() {
		return this._onDidDelete.event;
	}

	abstract get originalURI(): URI;

	abstract get modifiedURI(): URI;

	protected readonly _stateObs = observableValue<WorkingSetEntryState>(this, WorkingSetEntryState.Modified);
	public get state(): IObservable<WorkingSetEntryState> {
		return this._stateObs;
	}
	protected readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	public get diffInfo(): IObservable<IDocumentDiff> {
		return this._diffInfo;
	}

	protected readonly _isCurrentlyBeingModifiedByObs = observableValue<IChatResponseModel | undefined>(this, undefined);
	public get isCurrentlyBeingModifiedBy(): IObservable<IChatResponseModel | undefined> {
		return this._isCurrentlyBeingModifiedByObs;
	}

	protected readonly _rewriteRatioObs = observableValue<number>(this, 0);
	public get rewriteRatio(): IObservable<number> {
		return this._rewriteRatioObs;
	}

	protected readonly _maxLineNumberObs = observableValue<number>(this, 0);
	public get maxLineNumber(): IObservable<number> {
		return this._maxLineNumberObs;
	}

	protected readonly _reviewModeTempObs = observableValue<true | undefined>(this, undefined);
	readonly reviewMode: IObservable<boolean>;

	protected readonly _autoAcceptCtrl = observableValue<AutoAcceptControl | undefined>(this, undefined);
	readonly autoAcceptController: IObservable<AutoAcceptControl | undefined> = this._autoAcceptCtrl;

	protected _isFirstEditAfterStartOrSnapshot: boolean = true;
	// protected _isEditFromUs: boolean = false;
	// protected _diffOperation: Promise<any> | undefined;
	// protected _diffOperationIds: number = 0;

	// protected readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	private _refCounter: number = 1;

	protected readonly _autoAcceptTimeout: IObservable<number>;

	constructor(
		protected readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		protected _telemetryInfo: IModifiedEntryTelemetryInfo,
		protected readonly chatEditKind: ChatEditKind,
		@IConfigurationService configService: IConfigurationService,
		@IChatService protected readonly _chatService: IChatService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService protected readonly _undoRedoService: IUndoRedoService,
		@IFileService protected readonly _fileService: IFileService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super();
		if (chatEditKind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}
		// review mode depends on setting and temporary override
		const autoAcceptRaw = observableConfigValue('chat.editing.autoAcceptDelay', 0, configService);
		this._autoAcceptTimeout = derived(r => {
			const value = autoAcceptRaw.read(r);
			return clamp(value, 0, 100);
		});
		this.reviewMode = derived(r => {
			const configuredValue = this._autoAcceptTimeout.read(r);
			const tempValue = this._reviewModeTempObs.read(r);
			return tempValue ?? configuredValue === 0;
		});
	}

	override dispose(): void {
		if (--this._refCounter === 0) {
			super.dispose();
		}
	}

	acquire() {
		this._refCounter++;
		return this;
	}

	enableReviewModeUntilSettled(): void {

		this._reviewModeTempObs.set(true, undefined);

		const cleanup = autorun(r => {
			// reset config when settled
			const resetConfig = this.state.read(r) !== WorkingSetEntryState.Modified;
			if (resetConfig) {
				this._store.delete(cleanup);
				this._reviewModeTempObs.set(undefined, undefined);
			}
		});

		this._store.add(cleanup);
	}
	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo) {
		this._telemetryInfo = telemetryInfo;
	}

	abstract createSnapshot(requestId: string | undefined): Promise<ISnapshotEntry>;

	abstract restoreFromSnapshot(snapshot: ISnapshotEntry): Promise<void>;

	abstract resetToInitialValue(): Promise<void>;

	acceptStreamingEditsStart(tx: ITransaction) {
		this._resetEditsState(tx);
		this._autoAcceptCtrl.get()?.cancel();
	}

	async acceptStreamingEditsEnd(tx: ITransaction) {
		this._resetEditsState(tx);

		// AUTO accept mode
		if (!this.reviewMode.get() && !this._autoAcceptCtrl.get()) {

			const acceptTimeout = this._autoAcceptTimeout.get() * 1000;
			const future = Date.now() + acceptTimeout;
			const update = () => {

				const reviewMode = this.reviewMode.get();
				if (reviewMode) {
					// switched back to review mode
					this._autoAcceptCtrl.set(undefined, undefined);
					return;
				}

				const remain = Math.round(future - Date.now());
				if (remain <= 0) {
					this.accept(undefined);
				} else {
					const handle = setTimeout(update, 100);
					this._autoAcceptCtrl.set(new AutoAcceptControl(acceptTimeout, remain, () => {
						clearTimeout(handle);
						this._autoAcceptCtrl.set(undefined, undefined);
					}), undefined);
				}
			};
			update();
		}
	}

	protected _resetEditsState(tx: ITransaction): void {
		this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
		this._rewriteRatioObs.set(0, tx);
	}

	abstract acceptAgentEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
	// async acceptAgentNotebookEdits(edits: ICellEditOperation[], isLastEdits: boolean): Promise<void> {
	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this._stateObs.set(WorkingSetEntryState.Accepted, transaction);
		this._autoAcceptCtrl.set(undefined, transaction);
		await this.collapse(transaction);
		this._notifyAction('accepted');
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			await this._fileService.del(this.modifiedURI);
			this._onDidDelete.fire();
		} else {
			await this.collapse(transaction);
		}
		this._stateObs.set(WorkingSetEntryState.Rejected, transaction);
		this._autoAcceptCtrl.set(undefined, transaction);
		this._notifyAction('rejected');
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	protected _notifyAction(outcome: 'accepted' | 'rejected') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.modifiedURI, hasRemainingEdits: false, outcome },
			agentId: this._telemetryInfo.agentId,
			command: this._telemetryInfo.command,
			sessionId: this._telemetryInfo.sessionId,
			requestId: this._telemetryInfo.requestId,
			result: this._telemetryInfo.result
		});
	}
}


export async function readSnapshotContentFromStorage(snapshot: ISnapshotEntryDTO, sessionId: string, instantiationService: IInstantiationService): Promise<[original: VSBuffer, current: VSBuffer]> {
	const readContent = async (hash: string) => instantiationService.invokeFunction(async (accessor) => {
		const storageLocation = getStorageLocation(sessionId, accessor.get(IWorkspaceContextService), accessor.get(IEnvironmentService));
		const file = joinPath(storageLocation, hash);
		const content = await accessor.get(IFileService).readFile(file);
		return content.value;
	});

	return Promise.all([readContent(snapshot.originalHash), readContent(snapshot.currentHash)]);
}

export async function writeSnapshotContentIntoStorage(snapshot: ISnapshotEntry, instantiationService: IInstantiationService): Promise<[original: string, current: string]> {
	const writeContent = async (content: VSBuffer) => instantiationService.invokeFunction(async (accessor) => {
		let hash: string;
		if (snapshot.kind === 'notebook') {
			const sha = await hashAsync(content);
			hash = sha.substring(0, 7);
		} else {
			const shaComputer = new StringSHA1();
			shaComputer.update(content.toString());
			hash = shaComputer.digest().substring(0, 7);
		}
		const storageLocation = getStorageLocation(snapshot.telemetryInfo.sessionId, accessor.get(IWorkspaceContextService), accessor.get(IEnvironmentService));

		const file = joinPath(storageLocation, hash);
		const fileService = accessor.get(IFileService);
		if (!(await fileService.exists(file))) {
			await fileService.writeFile(file, content);
		}
		return hash;
	});

	return Promise.all([writeContent(snapshot.original), writeContent(snapshot.current)]);
}


function getStorageLocation(sessionId: string, workspaceContextService: IWorkspaceContextService, environmentService: IEnvironmentService): URI {
	const workspaceId = workspaceContextService.getWorkspace().id;
	return joinPath(environmentService.workspaceStorageHome, workspaceId, 'chatEditingSessions', sessionId, STORAGE_CONTENTS_FOLDER);
}
