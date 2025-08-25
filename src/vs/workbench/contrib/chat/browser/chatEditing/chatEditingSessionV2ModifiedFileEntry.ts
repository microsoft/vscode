/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { setsEqual } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, derivedOpts, IObservable, ITransaction, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
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
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ISnapshotEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatUserAction, IChatService } from '../../common/chatService.js';
import { ChatEditOperationState, OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { IChatEditOperation } from './chatEditingSessionV2Operations.js';

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


export abstract class ChatEditingV2ModifiedFileEntry extends Disposable implements IModifiedFileEntry {
	private readonly _editorIntegrations = this._register(new DisposableMap<IEditorPane, IModifiedFileEntryEditorIntegration>());

	public readonly state: IObservable<ModifiedFileEntryState>;
	public readonly isCurrentlyBeingModifiedByRequestId: IObservable<ReadonlySet<string>>;

	

	protected readonly _lastModifyingResponseObs = observableValueOpts<IChatResponseModel | undefined>({ equalsFn: (a, b) => a?.requestId === b?.requestId }, undefined);
	readonly lastModifyingResponse: IObservable<IChatResponseModel | undefined> = this._lastModifyingResponseObs;

	protected readonly _waitsForLastEdits = observableValue<boolean>(this, false);
	readonly waitsForLastEdits: IObservable<boolean> = this._waitsForLastEdits;

	protected readonly _rewriteRatioObs = observableValue<number>(this, 0);
	readonly rewriteRatio: IObservable<number> = this._rewriteRatioObs;

	constructor(
		private readonly operationHistoryManager: OperationHistoryManager,
	) {
		super();

		const modifyingOps = derivedOpts<IChatEditOperation[]>({ debugName: 'modifyingOps', equalsFn: arraysEqual }, reader => {
			return operationHistoryManager.operations.read(reader)
				.filter(op => op.state.read(reader) === ChatEditOperationState.Pending)
				.map(op => op.op);
		});

		this.state = modifyingOps.map(ops => ops.length ? ModifiedFileEntryState.Modified : ModifiedFileEntryState.Accepted);

		this.isCurrentlyBeingModifiedByRequestId = derivedOpts<ReadonlySet<string>>({ debugName: 'isCurrentlyBeingModifiedByRequestId', equalsFn: setsEqual }, reader => {
			const requestIds = new Set<string>();
			for (const op of modifyingOps.read(reader)) {
				requestIds.add(op.requestId);
			}
			return requestIds;
		});
	}

	getEditorIntegration(pane: IEditorPane): IModifiedFileEntryEditorIntegration {
		let value = this._editorIntegrations.get(pane);
		if (!value) {
			value = this._createEditorIntegration(pane);
			this._editorIntegrations.set(pane, value);
		}
		return value;
	}

	protected _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const codeEditor = getCodeEditor(editor.getControl());
		assertType(codeEditor);

		const diffInfo = this._textModelChangeService.diffInfo;

		return this._instantiationService.createInstance(ChatEditingCodeEditorIntegration, this, codeEditor, diffInfo, false);
	}
}
