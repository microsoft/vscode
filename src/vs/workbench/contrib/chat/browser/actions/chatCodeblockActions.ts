/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IActiveCodeEditor, ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { DocumentContextItem, WorkspaceEdit } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CopyAction } from 'vs/editor/contrib/clipboard/browser/clipboard';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { accessibleViewInCodeBlock } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService, IChatCodeBlockContextProviderService } from 'vs/workbench/contrib/chat/browser/chat';
import { DefaultChatTextEditor, ICodeBlockActionContext, ICodeCompareBlockActionContext } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_EDIT_APPLIED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatCopyKind, IChatService, IDocumentContext } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { insertCell } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import * as strings from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';

export interface IChatCodeBlockActionContext extends ICodeBlockActionContext {
	element: IChatResponseViewModel;
}

export function isCodeBlockActionContext(thing: unknown): thing is ICodeBlockActionContext {
	return typeof thing === 'object' && thing !== null && 'code' in thing && 'element' in thing;
}

export function isCodeCompareBlockActionContext(thing: unknown): thing is ICodeCompareBlockActionContext {
	return typeof thing === 'object' && thing !== null && 'element' in thing;
}

function isResponseFiltered(context: ICodeBlockActionContext) {
	return isResponseVM(context.element) && context.element.errorDetails?.responseIsFiltered;
}

function getUsedDocuments(context: ICodeBlockActionContext): IDocumentContext[] | undefined {
	return isResponseVM(context.element) ? context.element.usedContext?.documents : undefined;
}

abstract class ChatCodeBlockAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: any[]) {
		let context = args[0];
		if (!isCodeBlockActionContext(context)) {
			const codeEditorService = accessor.get(ICodeEditorService);
			const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
			if (!editor) {
				return;
			}

			context = getContextFromEditor(editor, accessor);
			if (!isCodeBlockActionContext(context)) {
				return;
			}
		}

		return this.runWithContext(accessor, context);
	}

	abstract runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext): any;
}

abstract class InsertCodeBlockAction extends ChatCodeBlockAction {

	override async runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
		const editorService = accessor.get(IEditorService);
		const textFileService = accessor.get(ITextFileService);

		if (isResponseFiltered(context)) {
			// When run from command palette
			return;
		}

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

		if (!activeEditorControl.hasModel()) {
			return;
		}
		const activeModelUri = activeEditorControl.getModel().uri;

		// Check if model is editable, currently only support untitled and text file
		const activeTextModel = textFileService.files.get(activeModelUri) ?? textFileService.untitled.get(activeModelUri);
		if (!activeTextModel || activeTextModel.isReadonly()) {
			return;
		}

		await this.handleTextEditor(accessor, activeEditorControl, context);
	}

	private async handleNotebookEditor(accessor: ServicesAccessor, notebookEditor: INotebookEditor, context: ICodeBlockActionContext) {
		if (!notebookEditor.hasModel()) {
			return;
		}

		if (notebookEditor.isReadOnly) {
			return;
		}

		if (notebookEditor.activeCodeEditor?.hasTextFocus()) {
			const codeEditor = notebookEditor.activeCodeEditor;
			if (codeEditor.hasModel()) {
				return this.handleTextEditor(accessor, codeEditor, context);
			}
		}

		const languageService = accessor.get(ILanguageService);
		const focusRange = notebookEditor.getFocus();
		const next = Math.max(focusRange.end - 1, 0);
		insertCell(languageService, notebookEditor, next, CellKind.Code, 'below', context.code, true);
		this.notifyUserAction(accessor, context);
	}

	protected async computeEdits(accessor: ServicesAccessor, codeEditor: IActiveCodeEditor, codeBlockActionContext: ICodeBlockActionContext): Promise<ResourceEdit[] | WorkspaceEdit> {
		const activeModel = codeEditor.getModel();
		const range = codeEditor.getSelection() ?? new Range(activeModel.getLineCount(), 1, activeModel.getLineCount(), 1);
		const text = reindent(codeBlockActionContext.code, activeModel, range.startLineNumber);
		return [new ResourceTextEdit(activeModel.uri, { range, text })];
	}

	private async handleTextEditor(accessor: ServicesAccessor, codeEditor: IActiveCodeEditor, codeBlockActionContext: ICodeBlockActionContext) {
		const bulkEditService = accessor.get(IBulkEditService);
		const codeEditorService = accessor.get(ICodeEditorService);

		this.notifyUserAction(accessor, codeBlockActionContext);
		const activeModel = codeEditor.getModel();

		const mappedEdits = await this.computeEdits(accessor, codeEditor, codeBlockActionContext);

		await bulkEditService.apply(mappedEdits);
		codeEditorService.listCodeEditors().find(editor => editor.getModel()?.uri.toString() === activeModel.uri.toString())?.focus();
	}

	private notifyUserAction(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
		if (isResponseVM(context.element)) {
			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction({
				agentId: context.element.agent?.id,
				command: context.element.slashCommand?.name,
				sessionId: context.element.sessionId,
				requestId: context.element.requestId,
				result: context.element.result,
				action: {
					kind: 'insert',
					codeBlockIndex: context.codeBlockIndex,
					totalCharacters: context.code.length,
				}
			});
		}
	}

}

function reindent(codeBlockContent: string, model: ITextModel, seletionStartLine: number) {
	const newContent = strings.splitLines(codeBlockContent);
	if (newContent.length === 0) {
		return codeBlockContent;
	}

	const formattingOptions = model.getFormattingOptions();
	const codeIndentLevel = computeIndentation(model.getLineContent(seletionStartLine), formattingOptions.tabSize).level;

	const indents = newContent.map(line => computeIndentation(line, formattingOptions.tabSize));

	// find the smallest indent level in the code block
	const newContentIndentLevel = indents.reduce<number>((min, indent, index) => {
		if (indent.length !== newContent[index].length) { // ignore empty lines
			return Math.min(indent.level, min);
		}
		return min;
	}, Number.MAX_VALUE);

	if (newContentIndentLevel === Number.MAX_VALUE || newContentIndentLevel === codeIndentLevel) {
		// all lines are empty or the indent is already correct
		return codeBlockContent;
	}
	const newLines = [];
	for (let i = 0; i < newContent.length; i++) {
		const { level, length } = indents[i];
		const newLevel = Math.max(0, codeIndentLevel + level - newContentIndentLevel);
		const newIndentation = formattingOptions.insertSpaces ? ' '.repeat(formattingOptions.tabSize * newLevel) : '\t'.repeat(newLevel);
		newLines.push(newIndentation + newContent[i].substring(length));
	}
	return newLines.join('\n');
}

// TODO: Merge with `computeIndentLevel` from `vs/editor/common/model/utils.ts`
function computeIndentation(line: string, tabSize: number): { level: number; length: number } {
	let nSpaces = 0;
	let level = 0;
	let i = 0;
	let length = 0;
	const len = line.length;
	while (i < len) {
		const chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			nSpaces++;
			if (nSpaces === tabSize) {
				level++;
				nSpaces = 0;
				length = i + 1;
			}
		} else if (chCode === CharCode.Tab) {
			level++;
			nSpaces = 0;
			length = i + 1;
		} else {
			break;
		}
		i++;
	}
	return { level, length };
}

export function registerChatCodeBlockActions() {
	registerAction2(class CopyCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyCodeBlock',
				title: localize2('interactive.copyCodeBlock.label', "Copy"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.copy,
				menu: {
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					order: 30
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context) || isResponseFiltered(context)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			clipboardService.writeText(context.code);

			if (isResponseVM(context.element)) {
				const chatService = accessor.get(IChatService);
				chatService.notifyUserAction({
					agentId: context.element.agent?.id,
					command: context.element.slashCommand?.name,
					sessionId: context.element.sessionId,
					requestId: context.element.requestId,
					result: context.element.result,
					action: {
						kind: 'copy',
						codeBlockIndex: context.codeBlockIndex,
						copyKind: ChatCopyKind.Toolbar,
						copiedCharacters: context.code.length,
						totalCharacters: context.code.length,
						copiedText: context.code,
					}
				});
			}
		}
	});

	CopyAction?.addImplementation(50000, 'chat-codeblock', (accessor) => {
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
		const chatService = accessor.get(IChatService);
		const element = context.element as IChatResponseViewModel | undefined;
		if (element) {
			chatService.notifyUserAction({
				agentId: element.agent?.id,
				command: element.slashCommand?.name,
				sessionId: element.sessionId,
				requestId: element.requestId,
				result: element.result,
				action: {
					kind: 'copy',
					codeBlockIndex: context.codeBlockIndex,
					copyKind: ChatCopyKind.Action,
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

	registerAction2(class SmartApplyInEditorAction extends InsertCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.applyInEditor',
				title: localize2('interactive.applyInEditor.label', "Apply in Editor"),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.sparkle,
				menu: {
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: CONTEXT_IN_CHAT_SESSION,
					order: 10
				},
				keybinding: {
					when: ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate()), accessibleViewInCodeBlock),
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
					weight: KeybindingWeight.ExternalExtension + 1
				},
			});
		}

		protected override async computeEdits(accessor: ServicesAccessor, codeEditor: IActiveCodeEditor, codeBlockActionContext: ICodeBlockActionContext): Promise<ResourceEdit[] | WorkspaceEdit> {

			const progressService = accessor.get(IProgressService);
			const notificationService = accessor.get(INotificationService);

			const activeModel = codeEditor.getModel();

			const mappedEditsProviders = accessor.get(ILanguageFeaturesService).mappedEditsProvider.ordered(activeModel);
			if (mappedEditsProviders.length > 0) {

				// 0th sub-array - editor selections array if there are any selections
				// 1st sub-array - array with documents used to get the chat reply
				const docRefs: DocumentContextItem[][] = [];

				const currentDocUri = activeModel.uri;
				const currentDocVersion = activeModel.getVersionId();
				const selections = codeEditor.getSelections();
				if (selections.length > 0) {
					docRefs.push([
						{
							uri: currentDocUri,
							version: currentDocVersion,
							ranges: selections,
						}
					]);
				}
				const usedDocuments = getUsedDocuments(codeBlockActionContext);
				if (usedDocuments) {
					docRefs.push(usedDocuments);
				}

				const cancellationTokenSource = new CancellationTokenSource();
				try {
					const edits = await progressService.withProgress(
						{ location: ProgressLocation.Notification, delay: 500, sticky: true, cancellable: true },
						async progress => {
							for (const provider of mappedEditsProviders) {
								progress.report({ message: localize('applyCodeBlock.progress', "Applying code block using {0}...", provider.displayName) });
								const mappedEdits = await provider.provideMappedEdits(
									activeModel,
									[codeBlockActionContext.code],
									{ documents: docRefs },
									cancellationTokenSource.token
								);
								if (mappedEdits) {
									return mappedEdits;
								}
							}
							return undefined;
						},
						() => cancellationTokenSource.cancel()
					);
					if (edits) {
						return edits;
					}
				} catch (e) {
					notificationService.notify({ severity: Severity.Error, message: localize('applyCodeBlock.error', "Failed to apply code block: {0}", e.message) });

				} finally {
					cancellationTokenSource.dispose();
				}
			}
			// fall back to inserting the code block as is
			return super.computeEdits(accessor, codeEditor, codeBlockActionContext);
		}
	});

	registerAction2(class SmartApplyInEditorAction extends InsertCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.insertCodeBlock',
				title: localize2('interactive.insertCodeBlock.label', "Insert At Cursor"),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: CONTEXT_IN_CHAT_SESSION,
					order: 20
				},
				keybinding: {
					when: ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate()), accessibleViewInCodeBlock),
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
					weight: KeybindingWeight.ExternalExtension + 1
				},
			});
		}
	});

	registerAction2(class InsertIntoNewFileAction extends ChatCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.insertIntoNewFile',
				title: localize2('interactive.insertIntoNewFile.label', "Insert into New File"),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.newFile,
				menu: {
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					isHiddenByDefault: true,
					order: 40,
				}
			});
		}

		override async runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
			if (isResponseFiltered(context)) {
				// When run from command palette
				return;
			}

			const editorService = accessor.get(IEditorService);
			const chatService = accessor.get(IChatService);

			editorService.openEditor({ contents: context.code, languageId: context.languageId, resource: undefined } satisfies IUntitledTextResourceEditorInput);

			if (isResponseVM(context.element)) {
				chatService.notifyUserAction({
					agentId: context.element.agent?.id,
					command: context.element.slashCommand?.name,
					sessionId: context.element.sessionId,
					requestId: context.element.requestId,
					result: context.element.result,
					action: {
						kind: 'insert',
						codeBlockIndex: context.codeBlockIndex,
						totalCharacters: context.code.length,
						newFile: true
					}
				});
			}
		}
	});

	const shellLangIds = [
		'fish',
		'ps1',
		'pwsh',
		'powershell',
		'sh',
		'shellscript',
		'zsh'
	];
	registerAction2(class RunInTerminalAction extends ChatCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.runInTerminal',
				title: localize2('interactive.runInTerminal.label', "Insert into Terminal"),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.terminal,
				menu: [{
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: ContextKeyExpr.and(
						CONTEXT_IN_CHAT_SESSION,
						ContextKeyExpr.or(...shellLangIds.map(e => ContextKeyExpr.equals(EditorContextKeys.languageId.key, e)))
					),
				},
				{
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					isHiddenByDefault: true,
					when: ContextKeyExpr.and(
						CONTEXT_IN_CHAT_SESSION,
						...shellLangIds.map(e => ContextKeyExpr.notEquals(EditorContextKeys.languageId.key, e))
					)
				}],
				keybinding: [{
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
					mac: {
						primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
					},
					weight: KeybindingWeight.EditorContrib,
					when: ContextKeyExpr.or(CONTEXT_IN_CHAT_SESSION, accessibleViewInCodeBlock),
				}]
			});
		}

		override async runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
			if (isResponseFiltered(context)) {
				// When run from command palette
				return;
			}

			const chatService = accessor.get(IChatService);
			const terminalService = accessor.get(ITerminalService);
			const editorService = accessor.get(IEditorService);
			const terminalEditorService = accessor.get(ITerminalEditorService);
			const terminalGroupService = accessor.get(ITerminalGroupService);

			let terminal = await terminalService.getActiveOrCreateInstance();

			// isFeatureTerminal = debug terminal or task terminal
			const unusableTerminal = terminal.xterm?.isStdinDisabled || terminal.shellLaunchConfig.isFeatureTerminal;
			terminal = unusableTerminal ? await terminalService.createTerminal() : terminal;

			terminalService.setActiveInstance(terminal);
			await terminal.focusWhenReady(true);
			if (terminal.target === TerminalLocation.Editor) {
				const existingEditors = editorService.findEditors(terminal.resource);
				terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
			} else {
				terminalGroupService.showPanel(true);
			}

			terminal.runCommand(context.code, false);

			if (isResponseVM(context.element)) {
				chatService.notifyUserAction({
					agentId: context.element.agent?.id,
					command: context.element.slashCommand?.name,
					sessionId: context.element.sessionId,
					requestId: context.element.requestId,
					result: context.element.result,
					action: {
						kind: 'runInTerminal',
						codeBlockIndex: context.codeBlockIndex,
						languageId: context.languageId,
					}
				});
			}
		}
	});

	function navigateCodeBlocks(accessor: ServicesAccessor, reverse?: boolean): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const editor = codeEditorService.getFocusedCodeEditor();
		const editorUri = editor?.getModel()?.uri;
		const curCodeBlockInfo = editorUri ? widget.getCodeBlockInfoForEditor(editorUri) : undefined;
		const focused = !widget.inputEditor.hasWidgetFocus() && widget.getFocus();
		const focusedResponse = isResponseVM(focused) ? focused : undefined;

		const currentResponse = curCodeBlockInfo ?
			curCodeBlockInfo.element :
			(focusedResponse ?? widget.viewModel?.getItems().reverse().find((item): item is IChatResponseViewModel => isResponseVM(item)));
		if (!currentResponse || !isResponseVM(currentResponse)) {
			return;
		}

		widget.reveal(currentResponse);
		const responseCodeblocks = widget.getCodeBlockInfosForResponse(currentResponse);
		const focusIdx = curCodeBlockInfo ?
			(curCodeBlockInfo.codeBlockIndex + (reverse ? -1 : 1) + responseCodeblocks.length) % responseCodeblocks.length :
			reverse ? responseCodeblocks.length - 1 : 0;

		responseCodeblocks[focusIdx]?.focus();
	}

	registerAction2(class NextCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.nextCodeBlock',
				title: localize2('interactive.nextCodeBlock.label', "Next Code Block"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown, },
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_SESSION,
				},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateCodeBlocks(accessor);
		}
	});

	registerAction2(class PreviousCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.previousCodeBlock',
				title: localize2('interactive.previousCodeBlock.label', "Previous Code Block"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp, },
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_SESSION,
				},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateCodeBlocks(accessor, true);
		}
	});
}

function getContextFromEditor(editor: ICodeEditor, accessor: ServicesAccessor): ICodeBlockActionContext | undefined {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatCodeBlockContextProviderService = accessor.get(IChatCodeBlockContextProviderService);
	const model = editor.getModel();
	if (!model) {
		return;
	}

	const widget = chatWidgetService.lastFocusedWidget;
	const codeBlockInfo = widget?.getCodeBlockInfoForEditor(model.uri);
	if (!codeBlockInfo) {
		for (const provider of chatCodeBlockContextProviderService.providers) {
			const context = provider.getCodeBlockContext(editor);
			if (context) {
				return context;
			}
		}
		return;
	}

	return {
		element: codeBlockInfo.element,
		codeBlockIndex: codeBlockInfo.codeBlockIndex,
		code: editor.getValue(),
		languageId: editor.getModel()!.getLanguageId(),
	};
}

export function registerChatCodeCompareBlockActions() {

	abstract class ChatCompareCodeBlockAction extends Action2 {
		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeCompareBlockActionContext(context)) {
				return;
				// TODO@jrieken derive context
			}

			return this.runWithContext(accessor, context);
		}

		abstract runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): any;
	}

	registerAction2(class ApplyEditsCompareBlockAction extends ChatCompareCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.applyCompareEdits',
				title: localize2('interactive.compare.apply', "Apply Edits"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.check,
				precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, CONTEXT_CHAT_EDIT_APPLIED.negate()),
				menu: {
					id: MenuId.ChatCompareBlock,
					group: 'navigation',
					order: 1,
				}
			});
		}

		async runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): Promise<any> {

			const editorService = accessor.get(IEditorService);
			const instaService = accessor.get(IInstantiationService);

			const editor = instaService.createInstance(DefaultChatTextEditor);
			await editor.apply(context.element, context.edit, context.diffEditor);

			await editorService.openEditor({
				resource: context.edit.uri,
				options: { revealIfVisible: true },
			});
		}
	});

	registerAction2(class DiscardEditsCompareBlockAction extends ChatCompareCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.discardCompareEdits',
				title: localize2('interactive.compare.discard', "Discard Edits"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.trash,
				precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, CONTEXT_CHAT_EDIT_APPLIED.negate()),
				menu: {
					id: MenuId.ChatCompareBlock,
					group: 'navigation',
					order: 2,
				}
			});
		}

		async runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): Promise<any> {
			const instaService = accessor.get(IInstantiationService);
			const editor = instaService.createInstance(DefaultChatTextEditor);
			editor.discard(context.element, context.edit);
		}
	});
}
