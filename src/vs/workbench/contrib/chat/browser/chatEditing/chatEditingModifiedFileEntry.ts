/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, IObservable, ITransaction, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorBackground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoElement, IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IChatAgentResult } from '../../common/chatAgents.js';
import { ChatEditKind, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';

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

	protected readonly _isCurrentlyBeingModifiedByObs = observableValue<IChatResponseModel | undefined>(this, undefined);
	readonly isCurrentlyBeingModifiedBy: IObservable<IChatResponseModel | undefined> = this._isCurrentlyBeingModifiedByObs;

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

	protected readonly _userEditScheduler = this._register(new RunOnceScheduler(() => this._notifyAction('userModified'), 1000));

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

		const autoSaveOff = this._store.add(new MutableDisposable());
		this._store.add(autorun(r => {
			if (this.isCurrentlyBeingModifiedBy.read(r)) {
				autoSaveOff.value = _fileConfigService.disableAutoSave(this.modifiedURI);
			} else {
				autoSaveOff.clear();
			}
		}));
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

	async accept(tx: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		await this._doAccept(tx);
		this._stateObs.set(ModifiedFileEntryState.Accepted, tx);
		this._autoAcceptCtrl.set(undefined, tx);

		this._notifyAction('accepted');
	}

	protected abstract _doAccept(tx: ITransaction | undefined): Promise<void>;

	async reject(tx: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this._notifyAction('rejected');
		await this._doReject(tx);
		this._stateObs.set(ModifiedFileEntryState.Rejected, tx);
		this._autoAcceptCtrl.set(undefined, tx);
	}

	protected abstract _doReject(tx: ITransaction | undefined): Promise<void>;

	protected _notifyAction(outcome: 'accepted' | 'rejected' | 'userModified') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.modifiedURI, hasRemainingEdits: false, outcome },
			agentId: this._telemetryInfo.agentId,
			command: this._telemetryInfo.command,
			sessionId: this._telemetryInfo.sessionId,
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

	acceptStreamingEditsStart(responseModel: IChatResponseModel, tx: ITransaction) {
		this._resetEditsState(tx);
		this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
		this._autoAcceptCtrl.get()?.cancel();

		const undoRedoElement = this._createUndoRedoElement(responseModel);
		if (undoRedoElement) {
			this._undoRedoService.pushElement(undoRedoElement);
		}
	}

	protected abstract _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement | undefined;

	abstract acceptAgentEdits(uri: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void>;

	async acceptStreamingEditsEnd(tx: ITransaction) {
		this._resetEditsState(tx);

		if (await this._areOriginalAndModifiedIdentical()) {
			// ACCEPT if identical
			this.accept(tx);

		} else if (!this.reviewMode.get() && !this._autoAcceptCtrl.get()) {
			// AUTO accept mode

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

	protected abstract _areOriginalAndModifiedIdentical(): Promise<boolean>;

	protected _resetEditsState(tx: ITransaction): void {
		this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
		this._rewriteRatioObs.set(0, tx);
	}

	// --- snapshot

	abstract createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry;

	abstract equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean;

	abstract restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk?: boolean): void;

	// --- inital content

	abstract resetToInitialContent(): void;

	abstract initialContent: string;
}

export interface IModifiedEntryTelemetryInfo {
	readonly agentId: string | undefined;
	readonly command: string | undefined;
	readonly sessionId: string;
	readonly requestId: string;
	readonly result: IChatAgentResult | undefined;
}

export interface ISnapshotEntry {
	readonly resource: URI;
	readonly languageId: string;
	readonly snapshotUri: URI;
	readonly original: string;
	readonly current: string;
	readonly originalToCurrentEdit: OffsetEdit;
	readonly state: ModifiedFileEntryState;
	telemetryInfo: IModifiedEntryTelemetryInfo;
}
