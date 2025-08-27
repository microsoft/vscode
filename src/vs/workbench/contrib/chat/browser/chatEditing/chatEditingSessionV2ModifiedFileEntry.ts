/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { setsEqual } from '../../../../../base/common/map.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, derivedOpts, IObservable, observableValue, observableValueOpts } from '../../../../../base/common/observable.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorBackground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatEditingCodeEditorIntegration } from './chatEditingCodeEditorIntegration.js';
import { ChatEditOperationState } from './chatEditingSessionV2.js';
import { IChatEditOptionRecord, OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { ChatEditingTextModelChangeService } from './chatEditingTextModelChangeService.js';

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


export class AbstractChatEditingV2ModifiedFileEntry extends Disposable implements IModifiedFileEntry {
	private readonly _editorIntegrations = this._register(new DisposableMap<IEditorPane, IModifiedFileEntryEditorIntegration>());

	public readonly state: IObservable<ModifiedFileEntryState>;
	public readonly isCurrentlyBeingModifiedByRequestId: IObservable<ReadonlySet<string>>;

	protected readonly _lastModifyingResponseObs = observableValueOpts<IChatResponseModel | undefined>({ equalsFn: (a, b) => a?.requestId === b?.requestId }, undefined);
	readonly lastModifyingResponse: IObservable<IChatResponseModel | undefined> = this._lastModifyingResponseObs;

	protected readonly _waitsForLastEdits = observableValue<boolean>(this, false);
	readonly waitsForLastEdits: IObservable<boolean> = this._waitsForLastEdits;

	protected readonly _rewriteRatioObs = observableValue<number>(this, 0);
	readonly rewriteRatio: IObservable<number> = this._rewriteRatioObs;

	private readonly _reviewModeTempObs = observableValue<true | undefined>(this, undefined);
	readonly reviewMode: IObservable<boolean>;

	private readonly _autoAcceptCtrl = observableValue<AutoAcceptControl | undefined>(this, undefined);
	readonly autoAcceptController: IObservable<AutoAcceptControl | undefined> = this._autoAcceptCtrl;

	public get modifiedURI() {
		return this.uri;
	}

	public get originalURI() {
		return this.uri; // todo@connor4312
	}

	private _lastModifyingRequestId: IObservable<string | undefined>;
	public get lastModifyingRequestId() {
		return this._lastModifyingRequestId.get() || '';
	}

	private _modifyingOps: IObservable<readonly IChatEditOptionRecord[]>;

	private readonly _textModelChangeService = observableValue<ChatEditingTextModelChangeService | undefined>(this, undefined);

	get changesCount() {
		return this._textModelChangeService.map((cs, reader) => cs?.diffInfo.read(reader)).map(diff => diff?.changes.length || 0);
	}

	get linesAdded() {
		return this._textModelChangeService.map((cs, reader) => cs?.diffInfo.read(reader)).map(diff => {
			let added = 0;
			for (const c of diff?.changes || []) {
				added += Math.max(0, c.modified.endLineNumberExclusive - c.modified.startLineNumber);
			}
			return added;
		});
	}
	get linesRemoved() {
		return this._textModelChangeService.map((cs, reader) => cs?.diffInfo.read(reader)).map(diff => {
			let removed = 0;
			for (const c of diff?.changes || []) {
				removed += Math.max(0, c.original.endLineNumberExclusive - c.original.startLineNumber);
			}
			return removed;
		});
	}


	constructor(
		public readonly entryId: string,
		public readonly uri: URI,
		uriOfFileWithoutUnacceptedChanges: URI,
		modifyingModels: IObservable<(IChatResponseModel | undefined)[]>,
		private readonly operationHistoryManager: OperationHistoryManager,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@ITextModelService textModelService: ITextModelService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
	) {
		super();

		const modifyingOps = this._modifyingOps = derivedOpts<IChatEditOptionRecord[]>({ debugName: 'modifyingOps', equalsFn: arraysEqual }, reader => {
			return operationHistoryManager.operations.read(reader)
				.filter(op => op.op.getAffectedResources().has(uri))
				.filter(op => op.state.read(reader) === ChatEditOperationState.Pending);
		});

		this._lastModifyingRequestId = modifyingOps.map(ops => ops.at(-1)?.op.requestId);

		this.state = modifyingOps.map(ops => ops.length ? ModifiedFileEntryState.Modified : ModifiedFileEntryState.Accepted);

		this.isCurrentlyBeingModifiedByRequestId = derivedOpts<ReadonlySet<string>>({ debugName: 'isCurrentlyBeingModifiedByRequestId', equalsFn: setsEqual }, reader => {
			const requestIds = new Set<string>();
			for (const model of modifyingModels.read(reader)) {
				if (model) {
					requestIds.add(model.requestId);
				}
			}
			return requestIds;
		});

		this.lastModifyingResponse = modifyingModels.map(models => models.at(-1));

		const autoAcceptRaw = observableConfigValue('chat.editing.autoAcceptDelay', 0, configService);
		const autoAcceptTimeout = derived(r => {
			const value = autoAcceptRaw.read(r);
			return clamp(value, 0, 100);
		});

		this.reviewMode = derived(r => {
			const configuredValue = autoAcceptTimeout.read(r);
			const tempValue = this._reviewModeTempObs.read(r);
			return tempValue ?? configuredValue === 0;
		});

		const autoSaveOff = this._store.add(new MutableDisposable());
		this._store.add(autorun(r => {
			if (this._waitsForLastEdits.read(r)) {
				autoSaveOff.value = fileConfigService.disableAutoSave(this.modifiedURI);
			} else {
				autoSaveOff.clear();
			}
		}));

		this._store.add(autorun(r => {
			const inProgress = modifyingModels.read(r);
			if (inProgress.length && !this.reviewMode.read(r)) {
				// AUTO accept mode (when request is done)

				const acceptTimeout = autoAcceptTimeout.get() * 1000;
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


		Promise.all([
			textModelService.createModelReference(uri),
			textModelService.createModelReference(uriOfFileWithoutUnacceptedChanges),
		]).then(([modified, original]) => {
			if (this._store.isDisposed) {
				modified.dispose();
				original.dispose();
				return;
			}

			this._register(modified);
			this._register(original);

			this._textModelChangeService.set(this._register(this.instantiationService.createInstance(ChatEditingTextModelChangeService, original.object.textEditorModel, modified.object.textEditorModel, this.state)), undefined);
		});
	}

	async accept(): Promise<void> {
		await this.operationHistoryManager.accept(this._modifyingOps.get().map(o => o.op));
	}

	async reject(): Promise<void> {
		await this.operationHistoryManager.reject(this._modifyingOps.get().map(o => o.op));
	}

	getEditorIntegration(pane: IEditorPane): IModifiedFileEntryEditorIntegration {
		let value = this._editorIntegrations.get(pane);
		if (!value) {
			value = this._createEditorIntegration(pane);
			this._editorIntegrations.set(pane, value);
		}
		return value;
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

	protected _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const codeEditor = getCodeEditor(editor.getControl());
		assertType(codeEditor);

		const diffInfo = this._textModelChangeService.map((cs, reader) => cs?.diffInfo.read(reader));
		return this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, this, codeEditor, diffInfo, false);
	}
}
