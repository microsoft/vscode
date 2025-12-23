/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, IObservable, ITransaction, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Location, TextEdit } from '../../../../../editor/common/languages.js';
import { EditDeltaInfo } from '../../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorBackground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoElement, IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ISnapshotEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatUserAction, IChatService } from '../../common/chatService.js';

class AutoAcceptControl {
	constructor(
		readonly total: number,
		readonly remaining: number,
		readonly cancel: () => void
	) { }
}

export const pendingRewriteMinimap = registerColor('minimap.chatEditHighlight',
	transparent(editorBackground, 0.6),
	localize('editorSelectionBackground', "Color of pending edit regions in the minimap"));


export abstract class AbstractChatEditingModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	static readonly scheme = 'modified-file-entry';

	private static lastEntryId = 0;

	readonly entryId = `${AbstractChatEditingModifiedFileEntry.scheme}::${++AbstractChatEditingModifiedFileEntry.lastEntryId}`;

	protected readonly _onDidDelete = this._register(new Emitter<void>());
	readonly onDidDelete = this._onDidDelete.event;

	protected readonly _stateObs = observableValue<ModifiedFileEntryState>(this, ModifiedFileEntryState.Modified);
	readonly state: IObservable<ModifiedFileEntryState> = this._stateObs;

	protected readonly _waitsForLastEdits = observableValue<boolean>(this, false);
	readonly waitsForLastEdits: IObservable<boolean> = this._waitsForLastEdits;

	protected readonly _isCurrentlyBeingModifiedByObs = observableValue<{ responseModel: IChatResponseModel; undoStopId: string | undefined } | undefined>(this, undefined);
	readonly isCurrentlyBeingModifiedBy: IObservable<{ responseModel: IChatResponseModel; undoStopId: string | undefined } | undefined> = this._isCurrentlyBeingModifiedByObs;

	/**
	 * Flag to track if we're currently in an external edit operation.
	 * When true, file system changes should be treated as agent edits, not user edits.
	 */
	protected _isExternalEditInProgress = false;

	protected readonly _lastModifyingResponseObs = observableValueOpts<IChatResponseModel | undefined>({ equalsFn: (a, b) => a?.requestId === b?.requestId }, undefined);
	readonly lastModifyingResponse: IObservable<IChatResponseModel | undefined> = this._lastModifyingResponseObs;

	protected readonly _lastModifyingResponseInProgressObs = this._lastModifyingResponseObs.map((value, r) => {
		return value?.isInProgress.read(r) ?? false;
	});

	protected readonly _rewriteRatioObs = observableValue<number>(this, 0);
	readonly rewriteRatio: IObservable<number> = this._rewriteRatioObs;

	private readonly _reviewModeTempObs = observableValue<true | undefined>(this, undefined);
	readonly reviewMode: IObservable<boolean>;

	private readonly _autoAcceptCtrl = observableValue<AutoAcceptControl | undefined>(this, undefined);
	readonly autoAcceptController: IObservable<AutoAcceptControl | undefined> = this._autoAcceptCtrl;

	protected readonly _autoAcceptTimeout: IObservable<number>;

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	private _refCounter: number = 1;

	readonly abstract originalURI: URI;

	protected readonly _userEditScheduler = this._register(new RunOnceScheduler(() => this._notifySessionAction('userModified'), 1000));

	constructor(
		readonly modifiedURI: URI,
		protected _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService protected _fileConfigService: IFilesConfigurationService,
		@IChatService protected readonly _chatService: IChatService,
		@IFileService protected readonly _fileService: IFileService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IAiEditTelemetryService private readonly _aiEditTelemetryService: IAiEditTelemetryService,
	) {
		super();

		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}

		if (this.modifiedURI.scheme !== Schemas.untitled && this.modifiedURI.scheme !== Schemas.vscodeNotebookCell) {
			this._register(this._fileService.watch(this.modifiedURI));
			this._register(this._fileService.onDidFilesChange(e => {
				if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
					this._onDidDelete.fire();
				}
			}));
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

		this._store.add(toDisposable(() => this._lastModifyingResponseObs.set(undefined, undefined)));

		const autoSaveOff = this._store.add(new MutableDisposable());
		this._store.add(autorun(r => {
			if (this._waitsForLastEdits.read(r)) {
				autoSaveOff.value = _fileConfigService.disableAutoSave(this.modifiedURI);
			} else {
				autoSaveOff.clear();
			}
		}));

		this._store.add(autorun(r => {
			const inProgress = this._lastModifyingResponseInProgressObs.read(r);
			if (inProgress === false && !this.reviewMode.read(r)) {
				// AUTO accept mode (when request is done)

				const acceptTimeout = this._autoAcceptTimeout.read(undefined) * 1000;
				const future = Date.now() + acceptTimeout;
				const update = () => {

					const reviewMode = this.reviewMode.read(undefined);
					if (reviewMode) {
						// switched back to review mode
						this._autoAcceptCtrl.set(undefined, undefined);
						return;
					}

					const remain = Math.round(future - Date.now());
					if (remain <= 0) {
						this.accept();
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
		}));
	}

	override dispose(): void {
		if (--this._refCounter === 0) {
			super.dispose();
		}
	}

	public abstract hasModificationAt(location: Location): boolean;

	acquire() {
		this._refCounter++;
		return this;
	}

	enableReviewModeUntilSettled(): void {

		if (this.state.get() !== ModifiedFileEntryState.Modified) {
			// nothing to do
			return;
		}

		this._reviewModeTempObs.set(true, undefined);

		const cleanup = autorun(r => {
			// reset config when settled
			const resetConfig = this.state.read(r) !== ModifiedFileEntryState.Modified;
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

	async accept(): Promise<void> {
		const callback = await this.acceptDeferred();
		if (callback) {
			transaction(callback);
		}
	}

	/** Accepts and returns a function used to transition the state. This MUST be called by the consumer. */
	async acceptDeferred(): Promise<((tx: ITransaction) => void) | undefined> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		await this._doAccept();

		return (tx: ITransaction) => {
			this._stateObs.set(ModifiedFileEntryState.Accepted, tx);
			this._autoAcceptCtrl.set(undefined, tx);
			this._notifySessionAction('accepted');
		};
	}

	protected abstract _doAccept(): Promise<void>;

	async reject(): Promise<void> {
		const callback = await this.rejectDeferred();
		if (callback) {
			transaction(callback);
		}
	}

	/** Rejects and returns a function used to transition the state. This MUST be called by the consumer. */
	async rejectDeferred(): Promise<((tx: ITransaction) => void) | undefined> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
			// already accepted or rejected
			return undefined;
		}

		this._notifySessionAction('rejected');
		await this._doReject();

		return (tx: ITransaction) => {
			this._stateObs.set(ModifiedFileEntryState.Rejected, tx);
			this._autoAcceptCtrl.set(undefined, tx);
		};
	}

	protected abstract _doReject(): Promise<void>;

	protected _notifySessionAction(outcome: 'accepted' | 'rejected' | 'userModified') {
		this._notifyAction({ kind: 'chatEditingSessionAction', uri: this.modifiedURI, hasRemainingEdits: false, outcome });
	}

	protected _notifyAction(action: ChatUserAction) {
		if (action.kind === 'chatEditingHunkAction') {
			this._aiEditTelemetryService.handleCodeAccepted({
				suggestionId: undefined, // TODO@hediet try to figure this out
				acceptanceMethod: 'accept',
				presentation: 'highlightedEdit',
				modelId: this._telemetryInfo.modelId,
				modeId: this._telemetryInfo.modeId,
				applyCodeBlockSuggestionId: this._telemetryInfo.applyCodeBlockSuggestionId,
				editDeltaInfo: new EditDeltaInfo(
					action.linesAdded,
					action.linesRemoved,
					-1,
					-1,
				),
				feature: this._telemetryInfo.feature,
				languageId: action.languageId,
				source: undefined,
			});
		}

		this._chatService.notifyUserAction({
			action,
			agentId: this._telemetryInfo.agentId,
			modelId: this._telemetryInfo.modelId,
			modeId: this._telemetryInfo.modeId,
			command: this._telemetryInfo.command,
			sessionResource: this._telemetryInfo.sessionResource,
			requestId: this._telemetryInfo.requestId,
			result: this._telemetryInfo.result
		});
	}

	private readonly _editorIntegrations = this._register(new DisposableMap<IEditorPane, IModifiedFileEntryEditorIntegration>());

	getEditorIntegration(pane: IEditorPane): IModifiedFileEntryEditorIntegration {
		let value = this._editorIntegrations.get(pane);
		if (!value) {
			value = this._createEditorIntegration(pane);
			this._editorIntegrations.set(pane, value);
		}
		return value;
	}

	/**
	 * Create the editor integration for this entry and the given editor pane. This will only be called
	 * once (and cached) per pane. The integration is meant to be scoped to this entry only and when the
	 * passed pane/editor changes input, then the editor integration must handle that, e.g use default/null
	 * values
	 */
	protected abstract _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration;

	abstract readonly changesCount: IObservable<number>;

	acceptStreamingEditsStart(responseModel: IChatResponseModel, undoStopId: string | undefined, tx: ITransaction | undefined) {
		this._resetEditsState(tx);
		this._isCurrentlyBeingModifiedByObs.set({ responseModel, undoStopId }, tx);
		this._lastModifyingResponseObs.set(responseModel, tx);
		this._autoAcceptCtrl.get()?.cancel();

		const undoRedoElement = this._createUndoRedoElement(responseModel);
		if (undoRedoElement) {
			this._undoRedoService.pushElement(undoRedoElement);
		}
	}

	protected abstract _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement | undefined;

	abstract acceptAgentEdits(uri: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<void>;

	async acceptStreamingEditsEnd() {
		this._resetEditsState(undefined);

		if (await this._areOriginalAndModifiedIdentical()) {
			// ACCEPT if identical
			await this.accept();
		}
	}

	protected abstract _areOriginalAndModifiedIdentical(): Promise<boolean>;

	protected _resetEditsState(tx: ITransaction | undefined): void {
		this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
		this._rewriteRatioObs.set(0, tx);
		this._waitsForLastEdits.set(false, tx);
	}

	// --- snapshot

	abstract createSnapshot(chatSessionResource: URI, requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry;

	abstract equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean;

	abstract restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk?: boolean): Promise<void>;

	// --- inital content

	abstract resetToInitialContent(): Promise<void>;

	abstract initialContent: string;

	/**
	 * Computes the edits between two snapshots of the file content.
	 * @param beforeSnapshot The content before the changes
	 * @param afterSnapshot The content after the changes
	 * @returns Array of text edits or cell edit operations
	 */
	abstract computeEditsFromSnapshots(beforeSnapshot: string, afterSnapshot: string): Promise<(TextEdit | ICellEditOperation)[]>;

	/**
	 * Marks the start of an external edit operation.
	 * File system changes will be treated as agent edits until stopExternalEdit is called.
	 */
	startExternalEdit(): void {
		this._isExternalEditInProgress = true;
	}

	/**
	 * Marks the end of an external edit operation.
	 */
	stopExternalEdit(): void {
		this._isExternalEditInProgress = false;
	}

	/**
	 * Saves the current model state to disk.
	 */
	abstract save(): Promise<void>;

	/**
	 * Reloads the model from disk to ensure it's in sync with file system changes.
	 */
	abstract revertToDisk(): Promise<void>;
}
