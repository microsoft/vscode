/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionCopyAction, IInteractiveSessionService, IInteractiveSessionUserActionEvent, InteractiveSessionCopyKind } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveResponseViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
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

	registerAction2(class InsertCodeBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.insertCodeBlock',
				title: {
					value: localize('interactive.insertCodeBlock.label', "Insert at Cursor"),
					original: 'Insert at Cursor'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.insert,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
					group: 'navigation',
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context)) {
				return;
			}

			const editorService = accessor.get(IEditorService);
			const bulkEditService = accessor.get(IBulkEditService);
			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			const textFileService = accessor.get(ITextFileService);

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

			const activeTextModel = textFileService.files.get(activeModel.uri);
			if (!activeTextModel || activeTextModel.isReadonly()) {
				return;
			}

			const activeSelection = activeEditorControl.getSelection() ?? new Range(activeModel.getLineCount(), 1, activeModel.getLineCount(), 1);
			await bulkEditService.apply([new ResourceTextEdit(activeModel.uri, {
				range: activeSelection,
				text: context.code,
			})]);

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

	registerAction2(class InsertIntoNewFileAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.insertIntoNewFile',
				title: {
					value: localize('interactive.insertIntoNewFile.label', "Insert Into New File"),
					original: 'Insert Into New File'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context)) {
				return;
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

	registerAction2(class RunInTerminalAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.runInTerminal',
				title: {
					value: localize('interactive.runInTerminal.label', "Run in Terminal"),
					original: 'Run in Terminal'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				menu: {
					id: MenuId.InteractiveSessionCodeBlock,
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			const terminalService = accessor.get(ITerminalService);
			const editorService = accessor.get(IEditorService);
			const terminalEditorService = accessor.get(ITerminalEditorService);
			const terminalGroupService = accessor.get(ITerminalGroupService);

			let terminal = await terminalService.getActiveOrCreateInstance();

			// Why does getActiveOrCreateInstance return a disposed terminal?
			terminal = terminal.isDisposed ? await terminalService.createTerminal() : terminal;

			await terminal.focusWhenReady();
			if (terminal.target === TerminalLocation.Editor) {
				const existingEditors = editorService.findEditors(terminal.resource);
				terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
			} else {
				terminalGroupService.showPanel(true);
			}

			terminal.sendText(context.code, false);

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
}
