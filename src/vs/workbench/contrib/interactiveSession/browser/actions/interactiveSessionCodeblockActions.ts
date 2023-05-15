/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { CopyAction } from 'vs/editor/contrib/clipboard/browser/clipboard';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { CONTEXT_IN_INTERACTIVE_SESSION } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionCopyAction, IInteractiveSessionService, IInteractiveSessionUserActionEvent, InteractiveSessionCopyKind } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveResponseViewModel, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { insertCell } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export interface IInteractiveSessionCodeBlockActionContext {
	code: string;
	languageId: string;
	codeBlockIndex: number;
	element: IInteractiveResponseViewModel;
}

export function isCodeBlockActionContext(thing: unknown): thing is IInteractiveSessionCodeBlockActionContext {
	return typeof thing === 'object' && thing !== null && 'code' in thing && 'element' in thing;
}

export function registerInteractiveSessionCodeBlockActions() {
	registerAction2(class CopyCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.copyCodeBlock',
				title: {
					value: localize('interactive.copyCodeBlock.label', "Copy"),
					original: 'Copy'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.copy,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			clipboardService.writeText(context.code);

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: context.element.providerId,
				action: <IInteractiveSessionCopyAction>{
					kind: 'copy',
					responseId: context.element.providerResponseId,
					codeBlockIndex: context.codeBlockIndex,
					copyType: InteractiveSessionCopyKind.Toolbar,
					copiedCharacters: context.code.length,
					totalCharacters: context.code.length,
					copiedText: context.code,
				}
			});
		}
	});

	CopyAction?.addImplementation(50000, 'interactiveSession-codeblock', (accessor) => {
		// get active code editor
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!editor) {
			return false;
		}

		const editorModel = editor.getModel();
		if (!editorModel) {
			return false;
		}

		const context = getContextFromEditor(editor, accessor);
		if (!context) {
			return false;
		}

		const noSelection = editor.getSelections()?.length === 1 && editor.getSelection()?.isEmpty();
		const copiedText = noSelection ?
			editorModel.getValue() :
			editor.getSelections()?.reduce((acc, selection) => acc + editorModel.getValueInRange(selection), '') ?? '';
		const totalCharacters = editorModel.getValueLength();

		// Report copy to extensions
		if (context.element.providerResponseId) {
			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction({
				providerId: context.element.providerId,
				action: {
					kind: 'copy',
					codeBlockIndex: context.codeBlockIndex,
					responseId: context.element.providerResponseId,
					copyType: InteractiveSessionCopyKind.Action,
					copiedText,
					copiedCharacters: copiedText.length,
					totalCharacters,
				}
			});
		}

		// Copy full cell if no selection, otherwise fall back on normal editor implementation
		if (noSelection) {
			accessor.get(IClipboardService).writeText(context.code);
			return true;
		}

		return false;
	});

	registerAction2(class InsertCodeBlockAction extends EditorAction2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.insertCodeBlock',
				title: {
					value: localize('interactive.insertCodeBlock.label', "Insert at Cursor"),
					original: 'Insert at Cursor'
				},
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
					group: 'navigation',
				}
			});
		}

		override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
			let context = args[0];
			if (!isCodeBlockActionContext(context)) {
				context = getContextFromEditor(editor, accessor);
				if (!isCodeBlockActionContext(context)) {
					return;
				}
			}

			const editorService = accessor.get(IEditorService);
			const textFileService = accessor.get(ITextFileService);

			if (editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
				return this.handleNotebookEditor(accessor, editorService.activeEditorPane.getControl() as INotebookEditor, context);
			}

			let activeEditorControl = editorService.activeTextEditorControl;
			if (isDiffEditor(activeEditorControl)) {
				activeEditorControl = activeEditorControl.getOriginalEditor().hasTextFocus() ? activeEditorControl.getOriginalEditor() : activeEditorControl.getModifiedEditor();
			}

			if (!isCodeEditor(activeEditorControl)) {
				return;
			}

			const activeModel = activeEditorControl.getModel();
			if (!activeModel) {
				return;
			}

			// Check if model is editable, currently only support untitled and text file
			const activeTextModel = textFileService.files.get(activeModel.uri) ?? textFileService.untitled.get(activeModel.uri);
			if (!activeTextModel || activeTextModel.isReadonly()) {
				return;
			}

			await this.handleTextEditor(accessor, activeEditorControl, activeModel, context);
		}

		private async handleNotebookEditor(accessor: ServicesAccessor, notebookEditor: INotebookEditor, context: IInteractiveSessionCodeBlockActionContext) {
			if (!notebookEditor.hasModel()) {
				return;
			}

			if (notebookEditor.isReadOnly) {
				return;
			}

			if (notebookEditor.activeCodeEditor?.hasTextFocus()) {
				const codeEditor = notebookEditor.activeCodeEditor;
				const textModel = codeEditor.getModel();

				if (textModel) {
					return this.handleTextEditor(accessor, codeEditor, textModel, context);
				}
			}

			const languageService = accessor.get(ILanguageService);
			const focusRange = notebookEditor.getFocus();
			const next = Math.max(focusRange.end - 1, 0);
			insertCell(languageService, notebookEditor, next, CellKind.Code, 'below', context.code, true);
			this.notifyUserAction(accessor, context);
		}

		private async handleTextEditor(accessor: ServicesAccessor, codeEditor: ICodeEditor, activeModel: ITextModel, context: IInteractiveSessionCodeBlockActionContext) {
			this.notifyUserAction(accessor, context);
			const bulkEditService = accessor.get(IBulkEditService);

			const activeSelection = codeEditor.getSelection() ?? new Range(activeModel.getLineCount(), 1, activeModel.getLineCount(), 1);
			await bulkEditService.apply([new ResourceTextEdit(activeModel.uri, {
				range: activeSelection,
				text: context.code,
			})]);
		}

		private notifyUserAction(accessor: ServicesAccessor, context: IInteractiveSessionCodeBlockActionContext) {
			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: context.element.providerId,
				action: {
					kind: 'insert',
					responseId: context.element.providerResponseId,
					codeBlockIndex: context.codeBlockIndex,
					totalCharacters: context.code.length,
				}
			});
		}

	});

	registerAction2(class InsertIntoNewFileAction extends EditorAction2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.insertIntoNewFile',
				title: {
					value: localize('interactive.insertIntoNewFile.label', "Insert Into New File"),
					original: 'Insert Into New File'
				},
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.newFile,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
					group: 'navigation',
					isHiddenByDefault: true,
				}
			});
		}

		override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
			let context = args[0];
			if (!isCodeBlockActionContext(context)) {
				context = getContextFromEditor(editor, accessor);
				if (!isCodeBlockActionContext(context)) {
					return;
				}
			}

			const editorService = accessor.get(IEditorService);
			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			editorService.openEditor(<IUntitledTextResourceEditorInput>{ contents: context.code, languageId: context.languageId, resource: undefined });

			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: context.element.providerId,
				action: {
					kind: 'insert',
					responseId: context.element.providerResponseId,
					codeBlockIndex: context.codeBlockIndex,
					totalCharacters: context.code.length,
					newFile: true
				}
			});
		}
	});

	registerAction2(class RunInTerminalAction extends EditorAction2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.runInTerminal',
				title: {
					value: localize('interactive.runInTerminal.label', "Run in Terminal"),
					original: 'Run in Terminal'
				},
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.terminal,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
					group: 'navigation',
					isHiddenByDefault: true,
				},
				keybinding: {
					primary: KeyMod.WinCtrl | KeyCode.Enter,
					win: {
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
					},
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
			let context = args[0];
			if (!isCodeBlockActionContext(context)) {
				context = getContextFromEditor(editor, accessor);
				if (!isCodeBlockActionContext(context)) {
					return;
				}
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			const terminalService = accessor.get(ITerminalService);
			const editorService = accessor.get(IEditorService);
			const terminalEditorService = accessor.get(ITerminalEditorService);
			const terminalGroupService = accessor.get(ITerminalGroupService);

			let terminal = await terminalService.getActiveOrCreateInstance();

			// Why does getActiveOrCreateInstance return a disposed terminal? #180018
			// isFeatureTerminal = debug terminal
			const unusableTerminal = terminal.isDisposed || terminal.xterm?.isStdinDisabled || terminal.shellLaunchConfig.isFeatureTerminal;
			terminal = unusableTerminal ? await terminalService.createTerminal() : terminal;

			terminalService.setActiveInstance(terminal);
			await terminal.focusWhenReady(true);
			if (terminal.target === TerminalLocation.Editor) {
				const existingEditors = editorService.findEditors(terminal.resource);
				terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
			} else {
				terminalGroupService.showPanel(true);
			}

			terminal.sendText(context.code, false, true);

			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: context.element.providerId,
				action: {
					kind: 'runInTerminal',
					responseId: context.element.providerResponseId,
					codeBlockIndex: context.codeBlockIndex,
					languageId: context.languageId,
				}
			});
		}
	});

	function navigateCodeBlocks(accessor: ServicesAccessor, reverse?: boolean): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const interactiveSessionWidgetService = accessor.get(IInteractiveSessionWidgetService);
		const widget = interactiveSessionWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const editor = codeEditorService.getFocusedCodeEditor();
		const editorUri = editor?.getModel()?.uri;
		const curCodeBlockInfo = editorUri ? widget.getCodeBlockInfoForEditor(editorUri) : undefined;

		const focusResponse = curCodeBlockInfo ?
			curCodeBlockInfo.element :
			widget.viewModel?.getItems().reverse().find((item): item is IInteractiveResponseViewModel => isResponseVM(item));
		if (!focusResponse) {
			return;
		}

		const responseCodeblocks = widget.getCodeBlockInfosForResponse(focusResponse);
		const focusIdx = curCodeBlockInfo ?
			(curCodeBlockInfo.codeBlockIndex + (reverse ? -1 : 1) + responseCodeblocks.length) % responseCodeblocks.length :
			reverse ? responseCodeblocks.length - 1 : 0;

		responseCodeblocks[focusIdx]?.focus();
	}

	registerAction2(class NextCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.nextCodeBlock',
				title: {
					value: localize('interactive.nextCodeBlock.label', "Next Code Block"),
					original: 'Next Code Block'
				},
				keybinding: {
					primary: KeyCode.F9,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_INTERACTIVE_SESSION,
				},
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateCodeBlocks(accessor);
		}
	});

	registerAction2(class PreviousCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.previousCodeBlock',
				title: {
					value: localize('interactive.previousCodeBlock.label', "Previous Code Block"),
					original: 'Previous Code Block'
				},
				keybinding: {
					primary: KeyMod.Shift | KeyCode.F9,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_INTERACTIVE_SESSION,
				},
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateCodeBlocks(accessor, true);
		}
	});
}

function getContextFromEditor(editor: ICodeEditor, accessor: ServicesAccessor): IInteractiveSessionCodeBlockActionContext | undefined {
	const interactiveSessionWidgetService = accessor.get(IInteractiveSessionWidgetService);
	const model = editor.getModel();
	if (!model) {
		return;
	}

	const widget = interactiveSessionWidgetService.lastFocusedWidget;
	if (!widget) {
		return;
	}

	const codeBlockInfo = widget.getCodeBlockInfoForEditor(model.uri);
	if (!codeBlockInfo) {
		return;
	}

	return {
		element: codeBlockInfo.element,
		codeBlockIndex: codeBlockInfo.codeBlockIndex,
		code: editor.getValue(),
		languageId: editor.getModel()!.getLanguageId(),
	};
}
