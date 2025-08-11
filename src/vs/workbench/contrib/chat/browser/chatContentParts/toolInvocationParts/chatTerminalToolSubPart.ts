/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { asArray } from '../../../../../../base/common/arrays.js';
import { ErrorNoTelemetry } from '../../../../../../base/common/errors.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { thenIfNotDisposed } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { IChatToolInvocation, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import type { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { CancelChatActionId } from '../../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export interface ITerminalNewAutoApproveRule {
	key: string;
	value: boolean | {
		approve: boolean;
		matchCommandLine?: boolean;
	};
}

export type TerminalNewAutoApproveButtonData = (
	{ type: 'configure' } |
	{ type: 'newRule'; rule: ITerminalNewAutoApproveRule | ITerminalNewAutoApproveRule[] }
);

export class TerminalConfirmationWidgetSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super(toolInvocation);

		if (!toolInvocation.confirmationMessages) {
			throw new Error('Confirmation messages are missing');
		}

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const { title, message, disclaimer, terminalCustomActions } = toolInvocation.confirmationMessages;
		const continueLabel = localize('continue', "Continue");
		const continueKeybinding = keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
		const continueTooltip = continueKeybinding ? `${continueLabel} (${continueKeybinding})` : continueLabel;
		const cancelLabel = localize('cancel', "Cancel");
		const cancelKeybinding = keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
		const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;

		const buttons: IChatConfirmationButton[] = [
			{
				label: continueLabel,
				data: true,
				tooltip: continueTooltip,
				moreActions: terminalCustomActions,
			},
			{
				label: cancelLabel,
				data: false,
				isSecondary: true,
				tooltip: cancelTooltip,
			}];
		const renderedMessage = this._register(this.renderer.render(
			typeof message === 'string' ? new MarkdownString(message) : message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on',
				readOnly: false,
				tabFocusMode: true,
				ariaLabel: typeof title === 'string' ? title : title.value
			}
		};
		const langId = this.languageService.getLanguageIdByLanguageName(terminalData.language ?? 'sh') ?? 'shellscript';
		const model = this.modelService.createModel(
			terminalData.commandLine.toolEdited ?? terminalData.commandLine.original,
			this.languageService.createById(langId),
			this._getUniqueCodeBlockUri(),
			true
		);
		const editor = this._register(this.editorPool.get());
		const renderPromise = editor.object.render({
			codeBlockIndex: this.codeBlockStartIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			languageId: langId,
			renderOptions: codeBlockRenderOptions,
			textModel: Promise.resolve(model),
			chatSessionId: this.context.element.sessionId
		}, this.currentWidthDelegate());
		this._register(thenIfNotDisposed(renderPromise, () => this._onDidChangeHeight.fire()));
		this.codeblocks.push({
			codeBlockIndex: this.codeBlockStartIndex,
			codemapperUri: undefined,
			elementId: this.context.element.id,
			focus: () => editor.object.focus(),
			isStreaming: false,
			ownerMarkdownPartId: this.codeblocksPartId,
			uri: model.uri,
			uriPromise: Promise.resolve(model.uri),
			chatSessionId: this.context.element.sessionId
		});
		this._register(editor.object.onDidChangeContentHeight(() => {
			editor.object.layout(this.currentWidthDelegate());
			this._onDidChangeHeight.fire();
		}));
		this._register(model.onDidChangeContent(e => {
			terminalData.commandLine.userEdited = model.getValue();
		}));
		const element = dom.$('');
		dom.append(element, editor.object.element);
		dom.append(element, renderedMessage.element);
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget,
			this.context.container,
			{ title, message: element, buttons },
		));

		if (disclaimer) {
			this._appendMarkdownPart(element, disclaimer, codeBlockRenderOptions);
		}

		ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService).set(true);
		this._register(confirmWidget.onDidClick(async button => {
			let doComplete = true;
			const data = button.data as TerminalNewAutoApproveButtonData | boolean;
			if (typeof data !== 'boolean') {
				switch (data.type) {
					case 'newRule': {
						const newRules = asArray(data.rule);
						const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
						const oldValue = (inspect.user?.value as Record<string, unknown> | undefined) ?? {};
						let newValue: Record<string, unknown>;
						if (isObject(oldValue)) {
							newValue = { ...oldValue };
							for (const newRule of newRules) {
								newValue[newRule.key] = newRule.value;
							}
						} else {
							this.preferencesService.openSettings({
								jsonEditor: true,
								target: ConfigurationTarget.USER,
								revealSetting: {
									key: TerminalContribSettingId.AutoApprove
								},
							});
							throw new ErrorNoTelemetry(`Cannot add new rule, existing setting is unexpected format`);
						}
						await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue);
						if (newRules.length === 1) {
							terminalData.autoApproveInfo = new MarkdownString(localize('newRule', 'Auto approve rule {0} added', `[\`${newRules[0].key}\`](settings_a)`));
						} else if (newRules.length > 1) {
							terminalData.autoApproveInfo = new MarkdownString(localize('newRule.plural', 'Auto approve rules {0} added', newRules.map(r => `[\`${r.key}\`](settings_a)`).join(', ')));
						}
						break;
					}
					case 'configure': {
						this.preferencesService.openSettings({
							target: ConfigurationTarget.USER,
							query: `@id:${TerminalContribSettingId.AutoApprove}`,
						});
						doComplete = false;
						break;
					}
				}
			}
			if (doComplete) {
				toolInvocation.confirmed.complete(button.data);
				this.chatWidgetService.getWidgetBySessionId(this.context.element.sessionId)?.focusInput();
			}
		}));
		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		toolInvocation.confirmed.p.then(() => {
			ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService).set(false);
			this._onNeedsRerender.fire();
		});
		this.domNode = confirmWidget.domNode;
	}

	private _getUniqueCodeBlockUri() {
		return URI.from({
			scheme: Schemas.vscodeChatCodeBlock,
			path: generateUuid(),
		});
	}

	private _appendMarkdownPart(container: HTMLElement, message: string | IMarkdownString, codeBlockRenderOptions: ICodeBlockRenderOptions) {
		const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart,
			{
				kind: 'markdownContent',
				content: typeof message === 'string' ? new MarkdownString().appendMarkdown(message) : message
			},
			this.context,
			this.editorPool,
			false,
			this.codeBlockStartIndex,
			this.renderer,
			undefined,
			this.currentWidthDelegate(),
			this.codeBlockModelCollection,
			{ codeBlockRenderOptions }
		));
		dom.append(container, part.domNode);
		this._register(part.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
	}
}
