/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { CopyAction } from '../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IUntitledTextResourceEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { accessibleViewInCodeBlock } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { EditDeltaInfo } from '../../../../../editor/common/textModelEditSource.js';
import { reviewEdits } from '../../../inlineChat/browser/inlineChatController.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatCopyKind, IChatService } from '../../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatCodeBlockContextProviderService, IChatWidgetService } from '../chat.js';
import { DefaultChatTextEditor, ICodeBlockActionContext, ICodeCompareBlockActionContext } from '../codeBlockPart.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ApplyCodeBlockOperation, InsertCodeBlockOperation } from './codeBlockOperations.js';

const shellLangIds = [
	'fish',
	'ps1',
	'pwsh',
	'powershell',
	'sh',
	'shellscript',
	'zsh'
];

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

abstract class ChatCodeBlockAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: unknown[]) {
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	abstract runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext): any;
}

const APPLY_IN_EDITOR_ID = 'workbench.action.chat.applyInEditor';

export class CodeBlockActionRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.codeBlockActionRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		const disposable = actionViewItemService.register(MenuId.ChatCodeBlock, APPLY_IN_EDITOR_ID, (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(class extends MenuEntryActionViewItem {
				protected override getTooltip(): string {
					const context = this._context;
					if (isCodeBlockActionContext(context) && context.codemapperUri) {
						const label = labelService.getUriLabel(context.codemapperUri, { relative: true });
						return localize('interactive.applyInEditorWithURL.label', "Apply to {0}", label);
					}
					return super.getTooltip();
				}
				override setActionContext(newContext: unknown): void {
					super.setActionContext(newContext);
					this.updateTooltip();
				}
			}, action, undefined);
		});

		// Reduces flicker a bit on reload/restart
		markAsSingleton(disposable);
	}
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

		run(accessor: ServicesAccessor, ...args: unknown[]) {
			const context = args[0];
			if (!isCodeBlockActionContext(context) || isResponseFiltered(context)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);
			clipboardService.writeText(context.code);

			if (isResponseVM(context.element)) {
				const chatService = accessor.get(IChatService);
				const requestId = context.element.requestId;
				const request = context.element.session.getItems().find(item => item.id === requestId && isRequestVM(item)) as IChatRequestViewModel | undefined;
				chatService.notifyUserAction({
					agentId: context.element.agent?.id,
					command: context.element.slashCommand?.name,
					sessionResource: context.element.sessionResource,
					requestId: context.element.requestId,
					result: context.element.result,
					action: {
						kind: 'copy',
						codeBlockIndex: context.codeBlockIndex,
						copyKind: ChatCopyKind.Toolbar,
						copiedCharacters: context.code.length,
						totalCharacters: context.code.length,
						copiedText: context.code,
						copiedLines: context.code.split('\n').length,
						languageId: context.languageId,
						totalLines: context.code.split('\n').length,
						modelId: request?.modelId ?? ''
					}
				});

				const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);
				aiEditTelemetryService.handleCodeAccepted({
					acceptanceMethod: 'copyButton',
					suggestionId: codeBlockInfo?.suggestionId,
					editDeltaInfo: EditDeltaInfo.fromText(context.code),
					feature: 'sideBarChat',
					languageId: context.languageId,
					modeId: context.element.model.request?.modeInfo?.modeId,
					modelId: request?.modelId,
					presentation: 'codeBlock',
					applyCodeBlockSuggestionId: undefined,
					source: undefined,
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
		const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);
		const element = context.element as IChatResponseViewModel | undefined;
		if (isResponseVM(element)) {
			const requestId = element.requestId;
			const request = element.session.getItems().find(item => item.id === requestId && isRequestVM(item)) as IChatRequestViewModel | undefined;
			chatService.notifyUserAction({
				agentId: element.agent?.id,
				command: element.slashCommand?.name,
				sessionResource: element.sessionResource,
				requestId: element.requestId,
				result: element.result,
				action: {
					kind: 'copy',
					codeBlockIndex: context.codeBlockIndex,
					copyKind: ChatCopyKind.Action,
					copiedText,
					copiedCharacters: copiedText.length,
					totalCharacters,
					languageId: context.languageId,
					totalLines: context.code.split('\n').length,
					copiedLines: copiedText.split('\n').length,
					modelId: request?.modelId ?? ''
				}
			});

			const codeBlockInfo = element.model.codeBlockInfos?.at(context.codeBlockIndex);
			aiEditTelemetryService.handleCodeAccepted({
				acceptanceMethod: 'copyManual',
				suggestionId: codeBlockInfo?.suggestionId,
				editDeltaInfo: EditDeltaInfo.fromText(copiedText),
				feature: 'sideBarChat',
				languageId: context.languageId,
				modeId: element.model.request?.modeInfo?.modeId,
				modelId: request?.modelId,
				presentation: 'codeBlock',
				applyCodeBlockSuggestionId: undefined,
				source: undefined,
			});
		}

		// Copy full cell if no selection, otherwise fall back on normal editor implementation
		if (noSelection) {
			accessor.get(IClipboardService).writeText(context.code);
			return true;
		}

		return false;
	});

	registerAction2(class SmartApplyInEditorAction extends ChatCodeBlockAction {

		private operation: ApplyCodeBlockOperation | undefined;

		constructor() {
			super({
				id: APPLY_IN_EDITOR_ID,
				title: localize2('interactive.applyInEditor.label', "Apply in Editor"),
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.gitPullRequestGoToChanges,

				menu: [
					{
						id: MenuId.ChatCodeBlock,
						group: 'navigation',
						when: ContextKeyExpr.and(
							...shellLangIds.map(e => ContextKeyExpr.notEquals(EditorContextKeys.languageId.key, e))
						),
						order: 10
					},
					{
						id: MenuId.ChatCodeBlock,
						when: ContextKeyExpr.or(
							...shellLangIds.map(e => ContextKeyExpr.equals(EditorContextKeys.languageId.key, e))
						)
					},
				],
				keybinding: {
					when: ContextKeyExpr.or(ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()), accessibleViewInCodeBlock),
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
					weight: KeybindingWeight.ExternalExtension + 1
				},
			});
		}

		override runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
			if (!this.operation) {
				this.operation = accessor.get(IInstantiationService).createInstance(ApplyCodeBlockOperation);
			}
			return this.operation.run(context);
		}
	});

	registerAction2(class InsertAtCursorAction extends ChatCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.insertCodeBlock',
				title: localize2('interactive.insertCodeBlock.label', "Insert At Cursor"),
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.insert,
				menu: [{
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Terminal)),
					order: 20
				}, {
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Terminal)),
					isHiddenByDefault: true,
					order: 20
				}],
				keybinding: {
					when: ContextKeyExpr.or(ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()), accessibleViewInCodeBlock),
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
					weight: KeybindingWeight.ExternalExtension + 1
				},
			});
		}

		override runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
			const operation = accessor.get(IInstantiationService).createInstance(InsertCodeBlockOperation);
			return operation.run(context);
		}
	});

	registerAction2(class InsertIntoNewFileAction extends ChatCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.insertIntoNewFile',
				title: localize2('interactive.insertIntoNewFile.label', "Insert into New File"),
				precondition: ChatContextKeys.enabled,
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
			const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);

			editorService.openEditor({ contents: context.code, languageId: context.languageId, resource: undefined } satisfies IUntitledTextResourceEditorInput);

			if (isResponseVM(context.element)) {
				const requestId = context.element.requestId;
				const request = context.element.session.getItems().find(item => item.id === requestId && isRequestVM(item)) as IChatRequestViewModel | undefined;
				chatService.notifyUserAction({
					agentId: context.element.agent?.id,
					command: context.element.slashCommand?.name,
					sessionResource: context.element.sessionResource,
					requestId: context.element.requestId,
					result: context.element.result,
					action: {
						kind: 'insert',
						codeBlockIndex: context.codeBlockIndex,
						totalCharacters: context.code.length,
						newFile: true,
						totalLines: context.code.split('\n').length,
						languageId: context.languageId,
						modelId: request?.modelId ?? ''
					}
				});

				const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);

				aiEditTelemetryService.handleCodeAccepted({
					acceptanceMethod: 'insertInNewFile',
					suggestionId: codeBlockInfo?.suggestionId,
					editDeltaInfo: EditDeltaInfo.fromText(context.code),
					feature: 'sideBarChat',
					languageId: context.languageId,
					modeId: context.element.model.request?.modeInfo?.modeId,
					modelId: request?.modelId,
					presentation: 'codeBlock',
					applyCodeBlockSuggestionId: undefined,
					source: undefined,
				});
			}
		}
	});

	registerAction2(class RunInTerminalAction extends ChatCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.runInTerminal',
				title: localize2('interactive.runInTerminal.label', "Insert into Terminal"),
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
				icon: Codicon.terminal,
				menu: [{
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					when: ContextKeyExpr.and(
						ChatContextKeys.inChatSession,
						ContextKeyExpr.or(...shellLangIds.map(e => ContextKeyExpr.equals(EditorContextKeys.languageId.key, e)))
					),
				},
				{
					id: MenuId.ChatCodeBlock,
					group: 'navigation',
					isHiddenByDefault: true,
					when: ContextKeyExpr.and(
						ChatContextKeys.inChatSession,
						...shellLangIds.map(e => ContextKeyExpr.notEquals(EditorContextKeys.languageId.key, e))
					)
				}],
				keybinding: [{
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
					mac: {
						primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
					},
					weight: KeybindingWeight.EditorContrib,
					when: ContextKeyExpr.or(ChatContextKeys.inChatSession, accessibleViewInCodeBlock),
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
					sessionResource: context.element.sessionResource,
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

		const elementId = curCodeBlockInfo?.elementId;
		const element = elementId ? widget.viewModel?.getItems().find(item => item.id === elementId) : undefined;
		const currentResponse = element ??
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
					when: ChatContextKeys.inChatSession,
				},
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]) {
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
					when: ChatContextKeys.inChatSession,
				},
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]) {
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

	const element = widget?.viewModel?.getItems().find(item => item.id === codeBlockInfo.elementId);
	return {
		element,
		codeBlockIndex: codeBlockInfo.codeBlockIndex,
		code: editor.getValue(),
		languageId: editor.getModel()!.getLanguageId(),
		codemapperUri: codeBlockInfo.codemapperUri,
		chatSessionResource: codeBlockInfo.chatSessionResource,
	};
}

export function registerChatCodeCompareBlockActions() {

	abstract class ChatCompareCodeBlockAction extends Action2 {
		run(accessor: ServicesAccessor, ...args: unknown[]) {
			const context = args[0];
			if (!isCodeCompareBlockActionContext(context)) {
				return;
				// TODO@jrieken derive context
			}

			return this.runWithContext(accessor, context);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		abstract runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): any;
	}

	registerAction2(class ApplyEditsCompareBlockAction extends ChatCompareCodeBlockAction {
		constructor() {
			super({
				id: 'workbench.action.chat.applyCompareEdits',
				title: localize2('interactive.compare.apply', "Apply Edits"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.gitPullRequestGoToChanges,
				precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, ChatContextKeys.editApplied.negate()),
				menu: {
					id: MenuId.ChatCompareBlock,
					group: 'navigation',
					order: 1,
				}
			});
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): Promise<any> {

			const instaService = accessor.get(IInstantiationService);
			const editorService = accessor.get(ICodeEditorService);

			const item = context.edit;
			const response = context.element;

			if (item.state?.applied) {
				// already applied
				return false;
			}

			if (!response.response.value.includes(item)) {
				// bogous item
				return false;
			}

			const firstEdit = item.edits[0]?.[0];
			if (!firstEdit) {
				return false;
			}
			const textEdits = AsyncIterableObject.fromArray(item.edits);

			const editorToApply = await editorService.openCodeEditor({ resource: item.uri }, null);
			if (editorToApply) {
				editorToApply.revealLineInCenterIfOutsideViewport(firstEdit.range.startLineNumber);
				instaService.invokeFunction(reviewEdits, editorToApply, textEdits, CancellationToken.None, undefined);
				response.setEditApplied(item, 1);
				return true;
			}
			return false;
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
				precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, ChatContextKeys.editApplied.negate()),
				menu: {
					id: MenuId.ChatCompareBlock,
					group: 'navigation',
					order: 2,
				}
			});
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async runWithContext(accessor: ServicesAccessor, context: ICodeCompareBlockActionContext): Promise<any> {
			const instaService = accessor.get(IInstantiationService);
			const editor = instaService.createInstance(DefaultChatTextEditor);
			editor.discard(context.element, context.edit);
		}
	});
}
