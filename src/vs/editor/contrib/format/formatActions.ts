/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerEditorAction, ServicesAccessor, EditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { OnTypeFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, DocumentFormattingEditProviderRegistry, FormattingOptions } from 'vs/editor/common/modes';
import { getOnTypeFormattingEdits, NoProviderError } from 'vs/editor/contrib/format/format';
import { FormattingEdit } from 'vs/editor/contrib/format/formattingEdit';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import { Range } from 'vs/editor/common/core/range';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor, IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISingleEditOperation } from 'vs/editor/common/model';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { sequence } from 'vs/base/common/async';

function alertFormattingEdits(edits: ISingleEditOperation[]): void {

	edits = edits.filter(edit => edit.range);
	if (!edits.length) {
		return;
	}

	let { range } = edits[0];
	for (let i = 1; i < edits.length; i++) {
		range = Range.plusRange(range, edits[i].range);
	}
	const { startLineNumber, endLineNumber } = range;
	if (startLineNumber === endLineNumber) {
		if (edits.length === 1) {
			alert(nls.localize('hint11', "Made 1 formatting edit on line {0}", startLineNumber));
		} else {
			alert(nls.localize('hintn1', "Made {0} formatting edits on line {1}", edits.length, startLineNumber));
		}
	} else {
		if (edits.length === 1) {
			alert(nls.localize('hint1n', "Made 1 formatting edit between lines {0} and {1}", startLineNumber, endLineNumber));
		} else {
			alert(nls.localize('hintnn', "Made {0} formatting edits between lines {1} and {2}", edits.length, startLineNumber, endLineNumber));
		}
	}
}

export const enum FormatRangeType {
	Full,
	Selection,
}

export function formatDocumentRange(workerService: IEditorWorkerService, editor: IActiveCodeEditor, rangeOrRangeType: Range | FormatRangeType, options: FormattingOptions, token: CancellationToken): Promise<void> {

	const provider = DocumentRangeFormattingEditProviderRegistry.ordered(editor.getModel()).slice(0, 1);
	if (provider.length === 0) {
		return Promise.reject(new NoProviderError());
	}

	let allEdits: ISingleEditOperation[] = [];

	editor.pushUndoStop();
	return sequence(provider.map(provider => {
		// create a formatting task per provider. they run sequentially,
		// potentially undoing the working of a previous formatter
		return () => {
			const state = new EditorState(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
			const model = editor.getModel();

			let range: Range;
			if (rangeOrRangeType === FormatRangeType.Full) {
				// full
				range = model.getFullModelRange();

			} else if (rangeOrRangeType === FormatRangeType.Selection) {
				// selection or line (when empty)
				range = editor.getSelection();
				if (range.isEmpty()) {
					range = new Range(range.startLineNumber, 1, range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
				}
			} else {
				// as is
				range = rangeOrRangeType;
			}
			return Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token)).then(edits => {
				// break edits into smaller edits
				return workerService.computeMoreMinimalEdits(editor.getModel().uri, edits);
			}).then(edits => {
				// make edit only when the editor didn't change while
				// computing and only when there are edits
				if (state.validate(editor) && isNonEmptyArray(edits)) {
					FormattingEdit.execute(editor, edits);
					allEdits = allEdits.concat(edits);
				}
			});
		};
	})).then(() => {
		alertFormattingEdits(allEdits);
		editor.pushUndoStop();
		editor.focus();
		editor.revealPositionInCenterIfOutsideViewport(editor.getPosition(), editorCommon.ScrollType.Immediate);
	});
}

export function formatDocument(workerService: IEditorWorkerService, editor: IActiveCodeEditor, options: FormattingOptions, token: CancellationToken): Promise<void> {
	const provider = DocumentFormattingEditProviderRegistry.ordered(editor.getModel()).slice(0);
	if (provider.length === 0) {
		return formatDocumentRange(workerService, editor, FormatRangeType.Full, options, token);
	}

	let allEdits: ISingleEditOperation[] = [];

	editor.pushUndoStop();
	return sequence(provider.map(provider => {
		// create a formatting task per provider. they run sequentially,
		// potentially undoing the working of a previous formatter
		return () => {
			const state = new EditorState(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
			const model = editor.getModel();
			return Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token)).then(edits => {
				// break edits into smaller edits
				return workerService.computeMoreMinimalEdits(editor.getModel().uri, edits);
			}).then(edits => {
				// make edit only when the editor didn't change while
				// computing and only when there are edits
				if (state.validate(editor) && isNonEmptyArray(edits)) {
					FormattingEdit.execute(editor, edits);
					allEdits = allEdits.concat(edits);
				}
			});
		};
	})).then(() => {
		alertFormattingEdits(allEdits);
		editor.pushUndoStop();
		editor.focus();
		editor.revealPositionInCenterIfOutsideViewport(editor.getPosition(), editorCommon.ScrollType.Immediate);
	});
}

class FormatOnType implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.autoFormat';

	private editor: ICodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
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
		if (!this.editor.hasModel()) {
			return;
		}

		const model = this.editor.getModel();

		// no support
		const [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
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
		if (!this.editor.hasModel()) {
			return;
		}

		if (this.editor.getSelections().length > 1) {
			return;
		}

		const model = this.editor.getModel();
		const position = this.editor.getPosition();
		let canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. If so, we won't
		// apply the format edits
		const unbind = this.editor.onDidChangeModelContent((e) => {
			if (e.isFlush) {
				// a model.setValue() was called
				// cancel only once
				canceled = true;
				unbind.dispose();
				return;
			}

			for (let i = 0, len = e.changes.length; i < len; i++) {
				const change = e.changes[i];
				if (change.range.endLineNumber <= position.lineNumber) {
					// cancel only once
					canceled = true;
					unbind.dispose();
					return;
				}
			}

		});

		let modelOpts = model.getOptions();

		getOnTypeFormattingEdits(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {
			return this.workerService.computeMoreMinimalEdits(model.uri, edits);
		}).then(edits => {

			unbind.dispose();

			if (canceled) {
				return;
			}

			if (isNonEmptyArray(edits)) {
				FormattingEdit.execute(this.editor, edits);
				alertFormattingEdits(edits);
			}

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

class FormatOnPaste implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.formatOnPaste';

	private editor: ICodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
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
		if (!this.editor.hasModel()) {
			return;
		}

		let model = this.editor.getModel();

		// no support
		if (!DocumentRangeFormattingEditProviderRegistry.has(model)) {
			return;
		}

		this.callOnModel.push(this.editor.onDidPaste((range: Range) => {
			this.trigger(range);
		}));
	}

	private trigger(range: Range): void {
		if (!this.editor.hasModel()) {
			return;
		}

		if (this.editor.getSelections().length > 1) {
			return;
		}

		const model = this.editor.getModel();
		const { tabSize, insertSpaces } = model.getOptions();
		formatDocumentRange(this.workerService, this.editor, range, { tabSize, insertSpaces }, CancellationToken.None);
	}

	public getId(): string {
		return FormatOnPaste.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

export class FormatDocumentAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatDocument',
			label: nls.localize('formatDocument.label', "Format Document"),
			alias: 'Format Document',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				// secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_D)],
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				when: EditorContextKeys.hasDocumentFormattingProvider,
				group: '1_modification',
				order: 1.3
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> | void {
		if (!editor.hasModel()) {
			return;
		}
		const notificationService = accessor.get(INotificationService);
		const workerService = accessor.get(IEditorWorkerService);
		const { tabSize, insertSpaces } = editor.getModel().getOptions();
		return formatDocument(workerService, editor, { tabSize, insertSpaces }, CancellationToken.None).catch(err => {
			if (NoProviderError.is(err)) {
				notificationService.info(nls.localize('no.documentprovider', "There is no document formatter for '{0}'-files installed.", editor.getModel().getLanguageIdentifier().language));
			}
		});
	}
}

export class FormatSelectionAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatSelection',
			label: nls.localize('formatSelection.label', "Format Selection"),
			alias: 'Format Code',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_F),
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				when: ContextKeyExpr.and(EditorContextKeys.hasDocumentSelectionFormattingProvider, EditorContextKeys.hasNonEmptySelection),
				group: '1_modification',
				order: 1.31
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> | void {
		if (!editor.hasModel()) {
			return;
		}
		const notificationService = accessor.get(INotificationService);
		const workerService = accessor.get(IEditorWorkerService);
		const { tabSize, insertSpaces } = editor.getModel().getOptions();
		return formatDocumentRange(workerService, editor, FormatRangeType.Selection, { tabSize, insertSpaces }, CancellationToken.None).catch(err => {
			if (NoProviderError.is(err)) {
				notificationService.info(nls.localize('no.selectionprovider', "There is no selection formatter for '{0}'-files installed.", editor.getModel().getLanguageIdentifier().language));
			}
		});
	}
}

registerEditorContribution(FormatOnType);
registerEditorContribution(FormatOnPaste);
registerEditorAction(FormatDocumentAction);
registerEditorAction(FormatSelectionAction);

// this is the old format action that does both (format document OR format selection)
// and we keep it here such that existing keybinding configurations etc will still work
CommandsRegistry.registerCommand('editor.action.format', accessor => {
	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (!editor || !editor.hasModel()) {
		return undefined;
	}
	const { tabSize, insertSpaces } = editor.getModel().getOptions();
	const workerService = accessor.get(IEditorWorkerService);

	if (editor.getSelection().isEmpty()) {
		return formatDocument(workerService, editor, { tabSize, insertSpaces }, CancellationToken.None);
	} else {
		return formatDocumentRange(workerService, editor, FormatRangeType.Selection, { tabSize, insertSpaces }, CancellationToken.None);
	}
});
