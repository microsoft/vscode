/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { OnTypeFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { getOnTypeFormattingEdits, getDocumentFormattingEdits, getDocumentRangeFormattingEdits } from '../common/format';
import { EditOperationsCommand } from './formatCommand';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import { Range } from 'vs/editor/common/core/range';

import ModeContextKeys = editorCommon.ModeContextKeys;
import EditorContextKeys = editorCommon.EditorContextKeys;

@commonEditorContribution
class FormatOnType implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.autoFormat';

	private editor: editorCommon.ICommonCodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: editorCommon.ICommonCodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
		this.editor = editor;
		this.workerService = workerService;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
		this.callOnDispose.push(OnTypeFormattingEditProviderRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.formatOnType) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		var model = this.editor.getModel();

		// no support
		var [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.autoFormatTriggerCharacters) {
			return;
		}

		// register typing listeners that will trigger the format
		let triggerChars = new CharacterSet();
		for (let ch of support.autoFormatTriggerCharacters) {
			triggerChars.add(ch.charCodeAt(0));
		}
		this.callOnModel.push(this.editor.onDidType((text: string) => {
			let lastCharCode = text.charCodeAt(text.length - 1);
			if (triggerChars.has(lastCharCode)) {
				this.trigger(String.fromCharCode(lastCharCode));
			}
		}));
	}

	private trigger(ch: string): void {

		if (this.editor.getSelections().length > 1) {
			return;
		}

		var model = this.editor.getModel(),
			position = this.editor.getPosition(),
			canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. If so, we won't
		// apply the format edits
		var unbind = this.editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
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
				unbind.dispose();
			}
		});

		let modelOpts = model.getOptions();

		getOnTypeFormattingEdits(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {
			return this.workerService.computeMoreMinimalEdits(model.uri, edits, []);
		}).then(edits => {

			unbind.dispose();

			if (canceled || isFalsyOrEmpty(edits)) {
				return;
			}

			this.editor.executeCommand(this.getId(), new EditOperationsCommand(edits, this.editor.getSelection()));

		}, (err) => {
			unbind.dispose();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

@commonEditorContribution
class FormatOnPaste implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.formatOnPaste';

	private editor: editorCommon.ICommonCodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: editorCommon.ICommonCodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
		this.editor = editor;
		this.workerService = workerService;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
		this.callOnDispose.push(DocumentRangeFormattingEditProviderRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.formatOnPaste) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		let model = this.editor.getModel();

		// no support
		let [support] = DocumentRangeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.provideDocumentRangeFormattingEdits) {
			return;
		}

		this.callOnModel.push(this.editor.onDidPaste((range: Range) => {
			this.trigger(range);
		}));
	}

	private trigger(range: Range): void {
		if (this.editor.getSelections().length > 1) {
			return;
		}

		const model = this.editor.getModel();
		const { tabSize, insertSpaces } = model.getOptions();
		const state = this.editor.captureState(editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Position);

		getDocumentRangeFormattingEdits(model, range, { tabSize, insertSpaces }).then(edits => {
			return this.workerService.computeMoreMinimalEdits(model.uri, edits, []);
		}).then(edits => {
			if (!state.validate(this.editor) || isFalsyOrEmpty(edits)) {
				return;
			}
			const command = new EditOperationsCommand(edits, this.editor.getSelection());
			this.editor.executeCommand(this.getId(), command);
		});
	}

	public getId(): string {
		return FormatOnPaste.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

export abstract class AbstractFormatAction extends EditorAction {

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<void> {

		const workerService = accessor.get(IEditorWorkerService);

		const formattingPromise = this._getFormattingEdits(editor);
		if (!formattingPromise) {
			return TPromise.as(void 0);
		}

		// Capture the state of the editor
		const state = editor.captureState(editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then(edits => workerService.computeMoreMinimalEdits(editor.getModel().uri, edits, editor.getSelections())).then(edits => {
			if (!state.validate(editor) || isFalsyOrEmpty(edits)) {
				return;
			}
			const command = new EditOperationsCommand(edits, editor.getSelection());
			editor.executeCommand(this.id, command);
			editor.focus();
		});
	}

	protected abstract _getFormattingEdits(editor: editorCommon.ICommonCodeEditor): TPromise<editorCommon.ISingleEditOperation[]>;
}


@editorAction
export class FormatDocumentAction extends AbstractFormatAction {

	constructor() {
		super({
			id: 'editor.action.formatDocument',
			label: nls.localize('formatDocument.label', "Format Document"),
			alias: 'Format Document',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasDocumentFormattingProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				// secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_D)],
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
			},
			menuOpts: {
				group: '1_modification',
				order: 1.3
			}
		});
	}

	protected _getFormattingEdits(editor: editorCommon.ICommonCodeEditor): TPromise<editorCommon.ISingleEditOperation[]> {
		const model = editor.getModel();
		const { tabSize, insertSpaces} = model.getOptions();
		return getDocumentFormattingEdits(model, { tabSize, insertSpaces });
	}
}

@editorAction
export class FormatSelectionAction extends AbstractFormatAction {

	constructor() {
		super({
			id: 'editor.action.formatSelection',
			label: nls.localize('formatSelection.label', "Format Selection"),
			alias: 'Format Code',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasDocumentSelectionFormattingProvider, EditorContextKeys.HasNonEmptySelection),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_F)
			},
			menuOpts: {
				group: '1_modification',
				order: 1.31
			}
		});
	}

	protected _getFormattingEdits(editor: editorCommon.ICommonCodeEditor): TPromise<editorCommon.ISingleEditOperation[]> {
		const model = editor.getModel();
		const { tabSize, insertSpaces} = model.getOptions();
		return getDocumentRangeFormattingEdits(model, editor.getSelection(), { tabSize, insertSpaces });
	}
}

// this is the old format action that does both (format document OR format selection)
// and we keep it here such that existing keybinding configurations etc will still work
CommandsRegistry.registerCommand('editor.action.format', accessor => {
	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor) {
		return new class extends AbstractFormatAction {
			constructor() {
				super(<any>{});
			}
			_getFormattingEdits(editor: editorCommon.ICommonCodeEditor): TPromise<editorCommon.ISingleEditOperation[]> {
				const model = editor.getModel();
				const editorSelection = editor.getSelection();
				const {tabSize, insertSpaces } = model.getOptions();

				return editorSelection.isEmpty()
					? getDocumentFormattingEdits(model, { tabSize, insertSpaces })
					: getDocumentRangeFormattingEdits(model, editorSelection, { tabSize, insertSpaces });
			}
		}().run(accessor, editor);
	}
	return undefined;
});
