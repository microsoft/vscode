/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { OnTypeFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { getOnTypeFormattingEdits, getDocumentFormattingEdits, getDocumentRangeFormattingEdits, FormattingPriorities } from '../common/format';
import { EditOperationsCommand } from './formatCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

import ModeContextKeys = editorCommon.ModeContextKeys;
import EditorContextKeys = editorCommon.EditorContextKeys;

@commonEditorContribution
class FormatOnType implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.autoFormat';

	private _editor: editorCommon.ICommonCodeEditor;
	private _callOnDispose: IDisposable[];
	private _callOnModel: IDisposable[];

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		this._editor = editor;
		this._callOnDispose = [];
		this._callOnModel = [];

		this._callOnDispose.push(editor.onDidChangeConfiguration(() => this._update()));
		this._callOnDispose.push(editor.onDidChangeModel(() => this._update()));
		this._callOnDispose.push(editor.onDidChangeModelMode(() => this._update()));
		this._callOnDispose.push(OnTypeFormattingEditProviderRegistry.onDidChange(this._update, this));
	}

	private _update(): void {

		// clean up
		this._callOnModel = dispose(this._callOnModel);

		// we are disabled
		if (!this._editor.getConfiguration().contribInfo.formatOnType) {
			return;
		}

		// no model
		if (!this._editor.getModel()) {
			return;
		}

		const model = this._editor.getModel();

		// no support
		const [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.autoFormatTriggerCharacters) {
			return;
		}

		// register typing listeners that will trigger the format
		support.autoFormatTriggerCharacters.forEach(ch => {
			this._callOnModel.push(this._editor.addTypingListener(ch, this._trigger.bind(this, ch)));
		});
	}

	private _trigger(ch: string): void {

		if (this._editor.getSelections().length > 1) {
			return;
		}

		const model = this._editor.getModel();
		const position = this._editor.getPosition();
		let canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. If so, we won't
		// apply the format edits
		var listener = this._editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
			if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
				// a model.setValue() was called
				canceled = true;
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLineChanged) {
				var changedLine = (<editorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				canceled = changedLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesInserted) {
				var insertLine = (<editorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				canceled = insertLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesDeleted) {
				var deleteLine2 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				canceled = deleteLine2 <= position.lineNumber;
			}

			if (canceled) {
				// cancel only once
				listener.dispose();
			}
		});

		const {tabSize, insertSpaces} = model.getOptions();
		const prios = FormattingPriorities.value(this._configurationService);

		getOnTypeFormattingEdits(model, position, ch, { tabSize, insertSpaces }, prios).then(edits => {

			listener.dispose();

			if (canceled || arrays.isFalsyOrEmpty(edits)) {
				return;
			}

			this._editor.executeCommand(this.getId(), new EditOperationsCommand(edits, this._editor.getSelection()));

		}, (err) => {
			listener.dispose();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this._callOnDispose = dispose(this._callOnDispose);
		this._callOnModel = dispose(this._callOnModel);
	}
}

@editorAction
export class FormatAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.format',
			label: nls.localize('formatAction.label', "Format Code"),
			alias: 'Format Code',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasFormattingProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
			},
			menuOpts: {
				group: '1_modification',
				order: 1.3
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<void> {

		const model = editor.getModel();
		const editorSelection = editor.getSelection();
		const {tabSize, insertSpaces} = model.getOptions();
		const prios = FormattingPriorities.value(accessor.get(IConfigurationService));

		let formattingPromise: TPromise<editorCommon.ISingleEditOperation[]>;

		if (editorSelection.isEmpty()) {
			formattingPromise = getDocumentFormattingEdits(model, { tabSize, insertSpaces }, prios);
		} else {
			formattingPromise = getDocumentRangeFormattingEdits(model, editorSelection, { tabSize, insertSpaces }, prios);
		}

		if (!formattingPromise) {
			return TPromise.as(void 0);
		}

		// Capture the state of the editor
		var state = editor.captureState(editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then((result: editorCommon.ISingleEditOperation[]) => {

			if (!state.validate(editor)) {
				return;
			}

			if (!result || result.length === 0) {
				return;
			}

			this.apply(editor, editorSelection, result);

			editor.focus();
		});
	}

	public apply(editor: editorCommon.ICommonCodeEditor, editorSelection: Selection, value: editorCommon.ISingleEditOperation[]): void {
		const command = new EditOperationsCommand(value, editorSelection);
		editor.executeCommand(this.id, command);
	}
}
