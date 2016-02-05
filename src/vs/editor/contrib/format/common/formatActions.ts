/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import lifecycle = require('vs/base/common/lifecycle');
import arrays = require('vs/base/common/arrays');
import nls = require('vs/nls');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import formatCommand = require('./formatCommand');
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {FormatOnTypeRegistry, FormatRegistry, formatRange, formatDocument, formatAfterKeystroke} from '../common/format';

interface IFormatOnTypeResult {
	range: EditorCommon.IEditorRange;
	id: string;
	lineText: string;
}

class FormatOnType implements EditorCommon.IEditorContribution {

	public static ID = 'editor.contrib.autoFormat';

	private editor: EditorCommon.ICommonCodeEditor;
	private formattingOptions: EditorCommon.IInternalIndentationOptions;
	private callOnDispose: lifecycle.IDisposable[];
	private callOnModel: Function[];

	constructor(editor: EditorCommon.ICommonCodeEditor, @INullService ns: INullService) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged,(e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.formattingSupport) {
				this.update();
			}
		}));
		this.callOnDispose.push(FormatOnTypeRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = lifecycle.cAll(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().formatOnType) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		var model = this.editor.getModel();

		// no support
		var [support] = FormatOnTypeRegistry.ordered(model);
		if (!support || !support.autoFormatTriggerCharacters) {
			return;
		}

		// remember options
		this.formattingOptions = this.editor.getIndentationOptions();

		// register typing listeners that will trigger the format
		support.autoFormatTriggerCharacters.forEach(ch => {
			this.callOnModel.push(this.editor.addTypingListener(ch, this.trigger.bind(this, ch)));
		});
	}

	private trigger(ch: string): void {

		if (this.editor.getSelections().length > 1) {
			return;
		}

		var model = this.editor.getModel(),
			position = this.editor.getPosition(),
			canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. Iff so, we won't
		// apply the format edits
		var unbind = this.editor.addListener(EditorCommon.EventType.ModelContentChanged,(e: EditorCommon.IModelContentChangedEvent) => {
			if (e.changeType === EditorCommon.EventType.ModelContentChangedFlush) {
				// a model.setValue() was called
				canceled = true;
			} else if (e.changeType === EditorCommon.EventType.ModelContentChangedLineChanged) {
				var changedLine = (<EditorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				canceled = changedLine <= position.lineNumber;

			} else if (e.changeType === EditorCommon.EventType.ModelContentChangedLinesInserted) {
				var insertLine = (<EditorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				canceled = insertLine <= position.lineNumber;

			} else if (e.changeType === EditorCommon.EventType.ModelContentChangedLinesDeleted) {
				var deleteLine2 = (<EditorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				canceled = deleteLine2 <= position.lineNumber;
			}

			if (canceled) {
				// cancel only once
				unbind();
			}
		});

		formatAfterKeystroke(model, position, ch, this.formattingOptions).then(edits => {

			unbind();

			if (canceled || arrays.isFalsyOrEmpty(edits)) {
				return;
			}

			this.editor.executeCommand(this.getId(), new formatCommand.EditOperationsCommand(edits, this.editor.getSelection()));

		},(err) => {
			unbind();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this.callOnDispose = lifecycle.disposeAll(this.callOnDispose);
		while (this.callOnModel.length > 0) {
			this.callOnModel.pop()();
		}
	}
}

export class FormatAction extends EditorAction {

	public static ID = 'editor.action.format';

	private _disposable: lifecycle.IDisposable;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.UpdateOnModelChange | Behaviour.ShowInContextMenu);
		this._disposable = FormatRegistry.onDidChange(() => this.resetEnablementState());
	}

	public dispose() {
		super.dispose();
		this._disposable.dispose();
	}

	public getGroupId(): string {
		return '2_change/2_format';
	}

	public isSupported(): boolean {
		return FormatRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	public run(): TPromise<boolean> {

		const model = this.editor.getModel(),
			editorSelection = this.editor.getSelection(),
			options = this.editor.getIndentationOptions();

		let formattingPromise: TPromise<EditorCommon.ISingleEditOperation[]>;

		if (editorSelection.isEmpty()) {
			formattingPromise = formatDocument(model, options);
		} else {
			formattingPromise = formatRange(model, editorSelection, options);
		}

		if (!formattingPromise) {
			return TPromise.as(false);
		}

		// Capture the state of the editor
		var state = this.editor.captureState(EditorCommon.CodeEditorStateFlag.Value, EditorCommon.CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then((result: EditorCommon.ISingleEditOperation[]) => {

			if (!state.validate(this.editor)) {
				return false;
			}

			if (!result || result.length === 0) {
				return false;
			}

			this.apply(this.editor, editorSelection, result);
			this.editor.focus();
			return true;
		});
	}

	public apply(editor: EditorCommon.ICommonCodeEditor, editorSelection: EditorCommon.IEditorSelection, value: EditorCommon.ISingleEditOperation[]): void {
		var state: EditorCommon.IEditorViewState = null;

		if (editorSelection.isEmpty()) {
			state = editor.saveViewState();
		}
		var command = new formatCommand.EditOperationsCommand(value, editorSelection);
		editor.executeCommand(this.id, command);

		if (state) {
			editor.restoreViewState(state);
		}
	}
}

// register action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FormatAction, FormatAction.ID, nls.localize('formatAction.label', "Format Code"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
	linux: { primary:KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
}));
CommonEditorRegistry.registerEditorContribution(FormatOnType);