/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionCopyAction, IInteractiveSessionService, IInteractiveSessionUserActionEvent, InteractiveSessionCopyKind } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveResponseViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export interface IInteractiveSessionCodeBlockActionContext {
	code: string;
	codeBlockIndex: number;
	element: IInteractiveResponseViewModel;
}

function isCodeBlockActionContext(thing: unknown): thing is IInteractiveSessionCodeBlockActionContext {
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
			const activeEditorControl = editorService.activeTextEditorControl;
			if (isCodeEditor(activeEditorControl)) {
				const activeModel = activeEditorControl.getModel();
				if (!activeModel) {
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
					}
				});
			}
		}
	});
}
