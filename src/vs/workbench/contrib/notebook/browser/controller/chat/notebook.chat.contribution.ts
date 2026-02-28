/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { codiconsLibrary } from '../../../../../../base/common/codiconsLibrary.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IWordAtPosition } from '../../../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItemKind, CompletionList } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService } from '../../../../chat/browser/attachments/chatContextPickService.js';
import { ChatDynamicVariableModel } from '../../../../chat/browser/attachments/chatDynamicVariables.js';
import { computeCompletionRanges } from '../../../../chat/browser/widget/input/editor/chatInputCompletions.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { chatVariableLeader } from '../../../../chat/common/requestParser/chatParserTypes.js';
import { ChatAgentLocation } from '../../../../chat/common/constants.js';
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from '../../../common/notebookContextKeys.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { createNotebookOutputVariableEntry, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST } from '../../contrib/chat/notebookChatUtils.js';
import { getNotebookEditorFromEditorPane, ICellOutputViewModel, INotebookEditor } from '../../notebookBrowser.js';
import * as icons from '../../notebookIcons.js';
import { getOutputViewModelFromId } from '../cellOutputActions.js';
import { INotebookOutputActionContext, NOTEBOOK_ACTIONS_CATEGORY } from '../coreActions.js';
import './cellChatActions.js';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from './notebookChatContext.js';

const NotebookKernelVariableKey = 'kernelVariable';

class NotebookChatContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.notebookChatContribution';

	private readonly _ctxHasProvider: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatContextPickService chatContextPickService: IChatContextPickService
	) {
		super();

		this._register(chatContextPickService.registerChatContextItem(new KernelVariableContextPicker(this.editorService, this.notebookKernelService)));

		this._ctxHasProvider = CTX_NOTEBOOK_CHAT_HAS_AGENT.bindTo(contextKeyService);

		const updateNotebookAgentStatus = () => {
			const hasNotebookAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
			this._ctxHasProvider.set(hasNotebookAgent);
		};

		updateNotebookAgentStatus();
		this._register(chatAgentService.onDidChangeAgents(updateNotebookAgentStatus));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatKernelDynamicCompletions',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				if (widget.location !== ChatAgentLocation.Notebook) {
					return null;
				}

				const variableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g');
				const range = computeCompletionRanges(model, position, variableNameDef, true);
				if (!range) {
					return null;
				}

				const result: CompletionList = { suggestions: [] };

				const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + `${chatVariableLeader}${NotebookKernelVariableKey}:`.length);
				result.suggestions.push({
					label: `${chatVariableLeader}${NotebookKernelVariableKey}`,
					insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:`,
					detail: localize('pickKernelVariableLabel', "Pick a variable from the kernel"),
					range,
					kind: CompletionItemKind.Text,
					command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: afterRange }] },
					sortText: 'z'
				});

				await this.addKernelVariableCompletion(widget, result, range, token);

				return result;
			}
		}));

		// output context
		NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.bindTo(contextKeyService).set(NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST);
	}

	private async addKernelVariableCompletion(widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {
		let pattern: string | undefined;
		if (info.varWord?.word && info.varWord.word.startsWith(chatVariableLeader)) {
			pattern = info.varWord.word.toLowerCase().slice(1);
		}

		const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;

		if (!notebook) {
			return;
		}

		const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
		const hasVariableProvider = selectedKernel?.hasVariableProvider;

		if (!hasVariableProvider) {
			return;
		}

		const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, CancellationToken.None);

		for await (const variable of variables) {
			if (pattern && !variable.name.toLowerCase().includes(pattern)) {
				continue;
			}

			result.suggestions.push({
				label: { label: variable.name, description: variable.type },
				insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:${variable.name} `,
				filterText: `${chatVariableLeader}${variable.name}`,
				range: info,
				kind: CompletionItemKind.Variable,
				sortText: 'z',
				command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: info.insert, variable: variable.name }] },
				detail: variable.type,
				documentation: variable.value,
			});
		}
	}
}

export class SelectAndInsertKernelVariableAction extends Action2 {
	constructor() {
		super({
			id: SelectAndInsertKernelVariableAction.ID,
			title: '' // not displayed
		});
	}

	static readonly ID = 'notebook.chat.selectAndInsertKernelVariable';

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notebookKernelService = accessor.get(INotebookKernelService);
		const quickInputService = accessor.get(IQuickInputService);

		const notebook = getNotebookEditorFromEditorPane(editorService.activeEditorPane)?.getViewModel()?.notebookDocument;

		if (!notebook) {
			return;
		}

		const context = args[0] as { widget: IChatWidget; range?: Range; variable?: string } | undefined;
		if (!context || !('widget' in context) || !('range' in context)) {
			return;
		}

		const widget = context.widget;
		const range = context.range;
		const variable = context.variable;

		if (variable !== undefined) {
			this.addVariableReference(widget, variable, range, false);
			return;
		}

		const selectedKernel = notebookKernelService.getMatchingKernel(notebook).selected;
		const hasVariableProvider = selectedKernel?.hasVariableProvider;

		if (!hasVariableProvider) {
			return;
		}

		const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, CancellationToken.None);

		const quickPickItems: IQuickPickItem[] = [];
		for await (const variable of variables) {
			quickPickItems.push({
				label: variable.name,
				description: variable.value,
				detail: variable.type,
			});
		}

		const placeHolder = quickPickItems.length > 0
			? localize('selectKernelVariablePlaceholder', "Select a kernel variable")
			: localize('noKernelVariables', "No kernel variables found");

		const pickedVariable = await quickInputService.pick(quickPickItems, { placeHolder });
		if (!pickedVariable) {
			return;
		}

		this.addVariableReference(widget, pickedVariable.label, range, true);
	}

	private addVariableReference(widget: IChatWidget, variableName: string, range?: Range, updateText?: boolean) {
		if (range) {
			const text = `#kernelVariable:${variableName}`;

			if (updateText) {
				const editor = widget.inputEditor;
				const success = editor.executeEdits('chatInsertFile', [{ range, text: text + ' ' }]);
				if (!success) {
					return;
				}
			}

			widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
				id: 'vscode.notebook.variable',
				range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
				data: variableName,
				fullName: variableName,
				icon: codiconsLibrary.variable,
			});
		} else {
			widget.attachmentModel.addContext({
				id: 'vscode.notebook.variable',
				name: variableName,
				value: variableName,
				icon: codiconsLibrary.variable,
				kind: 'generic'
			});
		}
	}
}

class KernelVariableContextPicker implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.notebook.kernelVariable', 'Kernel Variable...');
	readonly icon = Codicon.serverEnvironment;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		return widget.location === ChatAgentLocation.Notebook && Boolean(getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument);
	}

	asPicker(): IChatContextPicker {

		const picks = (async () => {

			const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;

			if (!notebook) {
				return [];
			}

			const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
			const hasVariableProvider = selectedKernel?.hasVariableProvider;

			if (!hasVariableProvider) {
				return [];
			}

			const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, CancellationToken.None);

			const result: IChatContextPickerPickItem[] = [];
			for await (const variable of variables) {
				result.push({
					label: variable.name,
					description: variable.value,
					asAttachment: () => {
						return {
							kind: 'generic',
							id: 'vscode.notebook.variable',
							name: variable.name,
							value: variable.value,
							icon: codiconsLibrary.variable,
						};
					},
				});
			}

			return result;
		})();

		return {
			placeholder: localize('chatContext.notebook.kernelVariable.placeholder', 'Select a kernel variable'),
			picks
		};
	}
}


registerAction2(class AddCellOutputToChatAction extends Action2 {
	constructor() {
		super({
			id: 'notebook.cellOutput.addToChat',
			title: localize('notebookActions.addOutputToChat', "Add Cell Output to Chat"),
			menu: {
				id: MenuId.NotebookOutputToolbar,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, ContextKeyExpr.in(NOTEBOOK_CELL_OUTPUT_MIMETYPE.key, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.key)),
				order: 10,
				group: 'notebook_chat_actions'
			},
			category: NOTEBOOK_ACTIONS_CATEGORY,
			icon: icons.copyIcon,
			precondition: ChatContextKeys.enabled
		});
	}

	private getNoteboookEditor(editorService: IEditorService, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): INotebookEditor | undefined {
		if (outputContext && 'notebookEditor' in outputContext) {
			return outputContext.notebookEditor;
		}
		return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	}

	async run(accessor: ServicesAccessor, outputContext: INotebookOutputActionContext | { outputViewModel: ICellOutputViewModel } | undefined): Promise<void> {
		const notebookEditor = this.getNoteboookEditor(accessor.get(IEditorService), outputContext);

		if (!notebookEditor) {
			return;
		}

		let outputViewModel: ICellOutputViewModel | undefined;
		if (outputContext && 'outputId' in outputContext && typeof outputContext.outputId === 'string') {
			outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
		} else if (outputContext && 'outputViewModel' in outputContext) {
			outputViewModel = outputContext.outputViewModel;
		}

		if (!outputViewModel) {
			// not able to find the output from the provided context, use the active cell
			const activeCell = notebookEditor.getActiveCell();
			if (!activeCell) {
				return;
			}

			if (activeCell.focusedOutputId !== undefined) {
				outputViewModel = activeCell.outputsViewModels.find(output => {
					return output.model.outputId === activeCell.focusedOutputId;
				});
			} else {
				outputViewModel = activeCell.outputsViewModels.find(output => output.pickedMimeType?.isTrusted);
			}
		}

		if (!outputViewModel) {
			return;
		}

		const mimeType = outputViewModel.pickedMimeType?.mimeType;

		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = await chatWidgetService.revealWidget();
		if (widget && mimeType && NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST.includes(mimeType)) {

			const entry = createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor);
			if (!entry) {
				return;
			}

			widget.attachmentModel.addContext(entry);
			(await chatWidgetService.revealWidget())?.focusInput();
		}
	}

});

registerAction2(SelectAndInsertKernelVariableAction);
registerWorkbenchContribution2(NotebookChatContribution.ID, NotebookChatContribution, WorkbenchPhase.BlockRestore);
