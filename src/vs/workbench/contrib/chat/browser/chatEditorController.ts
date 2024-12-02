/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorController.css';
import { autorun, observableFromEvent, transaction } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { nullDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEditingSessionState, IChatEditingService, isTextFileEntry } from '../common/chatEditingService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatEditorControllerBase } from './chatEditorControllerBase.js';

export const ctxHasEditorModification = new RawContextKey<boolean>('chat.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));
export const ctxHasRequestInProgress = new RawContextKey<boolean>('chat.ctxHasRequestInProgress', false, localize('chat.ctxHasRequestInProgress', "The current editor shows a file from an edit session which is still in progress"));

export class ChatEditorController extends ChatEditorControllerBase {

	public static readonly ID = 'editor.contrib.chatEditorController';

	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly _ctxRequestInProgress: IContextKey<boolean>;

	static get(editor: ICodeEditor): ChatEditorController | null {
		const controller = editor.getContribution<ChatEditorController>(ChatEditorController.ID);
		return controller;
	}

	constructor(
		_editor: ICodeEditor,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IChatEditingService _chatEditingService: IChatEditingService,
		@IEditorService _editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(_editor, _instantiationService, _chatEditingService, _editorService);

		this._ctxHasEditorModification = ctxHasEditorModification.bindTo(contextKeyService);
		this._ctxRequestInProgress = ctxHasRequestInProgress.bindTo(contextKeyService);

		this._register(autorun(r => {
			this._ctxHasEditorModification.set(this.hasEditorModification.read(r));
		}));
		this._store.add(autorun(r => {
			const session = _chatEditingService.currentEditingSessionObs.read(r);
			this._ctxRequestInProgress.set(session?.state.read(r) === ChatEditingSessionState.StreamingEdits);
		}));


		const modelObs = observableFromEvent(this._editor.onDidChangeModel, _ => this._editor.getModel());

		this._register(autorun(r => {

			if (this._editor.getOption(EditorOption.inDiffEditor)) {
				return;
			}
			const model = modelObs.read(r);

			const session = _chatEditingService.currentEditingSessionObs.read(r);
			const entry = model?.uri ? session?.readEntry(model.uri, r) : undefined;
			if (entry && isTextFileEntry(entry)) {
				const diff = entry?.diffInfo.read(r) ?? nullDocumentDiff;
				const maxLineNumber = entry?.maxLineNumber.read(r) ?? 0;
				transaction(tx => {
					this._entry.set(entry, tx);
					this.originalModel.set(entry.originalModel, tx);
					this.diff.set(diff, tx);
					this.maxLineNumber.set(maxLineNumber, tx);
				});
			}

		}));

	}
}
