/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { append, h } from '../../../../../../../base/browser/dom.js';
import { HoverStyle } from '../../../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../../../base/browser/ui/hover/hoverWidget.js';
import { Separator } from '../../../../../../../base/common/actions.js';
import { asArray } from '../../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ErrorNoTelemetry } from '../../../../../../../base/common/errors.js';
import { createCommandUri, MarkdownString, type IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { thenIfNotDisposed, thenRegisterOrDispose, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import Severity from '../../../../../../../base/common/severity.js';
import { isObject } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { TerminalContribCommandId, TerminalContribSettingId } from '../../../../../terminal/terminalContribExports.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatToolInvocation, ToolConfirmKind, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../../common/chatService/chatService.js';
import type { CodeBlockModelCollection } from '../../../../common/widget/codeBlockModelCollection.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { EditorPool } from '../chatContentCodePools.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export const enum TerminalToolConfirmationStorageKeys {
	TerminalAutoApproveWarningAccepted = 'chat.tools.terminal.autoApprove.warningAccepted'
}

export interface ITerminalNewAutoApproveRule {
	key: string;
	value: boolean | {
		approve: boolean;
		matchCommandLine?: boolean;
	};
}

export type TerminalNewAutoApproveButtonData = (
	{ type: 'enable' } |
	{ type: 'configure' } |
	{ type: 'skip' } |
	{ type: 'newRule'; rule: ITerminalNewAutoApproveRule | ITerminalNewAutoApproveRule[] } |
	{ type: 'sessionApproval' }
);

export class ChatTerminalToolConfirmationSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IStorageService private readonly storageService: IStorageService,
		@ITerminalChatService private readonly terminalChatService: ITerminalChatService,
		@ITextModelService textModelService: ITextModelService,
		@IHoverService hoverService: IHoverService,
	) {
		super(toolInvocation);

		// Tag for sub-agent styling
		if (toolInvocation.fromSubAgent) {
			context.container.classList.add('from-sub-agent');
		}

		if (!toolInvocation.confirmationMessages?.title) {
			throw new Error('Confirmation messages are missing');
		}

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const { title, message, disclaimer, terminalCustomActions } = toolInvocation.confirmationMessages;

		const autoApproveEnabled = this.configurationService.getValue(TerminalContribSettingId.EnableAutoApprove) === true;
		const autoApproveWarningAccepted = this.storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
		let moreActions: (IChatConfirmationButton<TerminalNewAutoApproveButtonData> | Separator)[] | undefined = undefined;
		if (autoApproveEnabled) {
			moreActions = [];
			if (!autoApproveWarningAccepted) {
				moreActions.push({
					label: localize('autoApprove.enable', 'Enable Auto Approve...'),
					data: {
						type: 'enable'
					}
				});
				moreActions.push(new Separator());
				if (terminalCustomActions) {
					for (const action of terminalCustomActions) {
						if (!(action instanceof Separator)) {
							action.disabled = true;
						}
					}
				}
			}
			if (terminalCustomActions) {
				moreActions.push(...terminalCustomActions);
			}
			if (moreActions.length === 0) {
				moreActions = undefined;
			}
		}

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
		const languageId = this.languageService.getLanguageIdByLanguageName(terminalData.language ?? 'sh') ?? 'shellscript';
		const model = this._register(this.modelService.createModel(
			terminalData.commandLine.toolEdited ?? terminalData.commandLine.original,
			this.languageService.createById(languageId),
			this._getUniqueCodeBlockUri(),
			true
		));
		thenRegisterOrDispose(textModelService.createModelReference(model.uri), this._store);
		const editor = this._register(this.editorPool.get());
		const renderPromise = editor.object.render({
			codeBlockIndex: this.codeBlockStartIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			languageId,
			renderOptions: codeBlockRenderOptions,
			textModel: Promise.resolve(model),
			chatSessionResource: this.context.element.sessionResource
		}, this.currentWidthDelegate());
		this._register(thenIfNotDisposed(renderPromise, () => this._onDidChangeHeight.fire()));
		this.codeblocks.push({
			codeBlockIndex: this.codeBlockStartIndex,
			codemapperUri: undefined,
			elementId: this.context.element.id,
			focus: () => editor.object.focus(),
			ownerMarkdownPartId: this.codeblocksPartId,
			uri: model.uri,
			uriPromise: Promise.resolve(model.uri),
			chatSessionResource: this.context.element.sessionResource
		});
		this._register(editor.object.onDidChangeContentHeight(() => {
			editor.object.layout(this.currentWidthDelegate());
			this._onDidChangeHeight.fire();
		}));
		this._register(model.onDidChangeContent(e => {
			terminalData.commandLine.userEdited = model.getValue();
		}));
		const elements = h('.chat-confirmation-message-terminal', [
			h('.chat-confirmation-message-terminal-editor@editor'),
			h('.chat-confirmation-message-terminal-disclaimer@disclaimer'),
		]);
		append(elements.editor, editor.object.element);
		this._register(hoverService.setupDelayedHover(elements.editor, {
			content: message || '',
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.LEFT },
		}));
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget<TerminalNewAutoApproveButtonData | boolean>,
			this.context,
			{
				title,
				icon: Codicon.terminal,
				message: elements.root,
				buttons: this._createButtons(moreActions)
			},
		));

		if (disclaimer) {
			this._appendMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
		}

		const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmationKey.set(true);
		this._register(toDisposable(() => hasToolConfirmationKey.reset()));

		this._register(confirmWidget.onDidClick(async button => {
			let doComplete = true;
			const data = button.data;
			let toolConfirmKind: ToolConfirmKind = ToolConfirmKind.Denied;
			if (typeof data === 'boolean') {
				if (data) {
					toolConfirmKind = ToolConfirmKind.UserAction;
					// Clear out any auto approve info since this was an explicit user action. This
					// can happen when the auto approve feature is off.
					if (terminalData.autoApproveInfo) {
						terminalData.autoApproveInfo = undefined;
					}
				}
			} else if (typeof data !== 'boolean') {
				switch (data.type) {
					case 'enable': {
						const optedIn = await this._showAutoApproveWarning();
						if (optedIn) {
							this.storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, StorageTarget.USER);
							// This is good to auto approve immediately
							if (!terminalCustomActions) {
								toolConfirmKind = ToolConfirmKind.UserAction;
							}
							// If this would not have been auto approved, enable the options and
							// do not complete
							else {
								for (const action of terminalCustomActions) {
									if (!(action instanceof Separator)) {
										action.disabled = false;
									}
								}

								confirmWidget.updateButtons(this._createButtons(terminalCustomActions));
								doComplete = false;
							}
						} else {
							doComplete = false;
						}
						break;
					}
					case 'skip': {
						toolConfirmKind = ToolConfirmKind.Skipped;
						break;
					}
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
						await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.USER);
						function formatRuleLinks(newRules: ITerminalNewAutoApproveRule[]): string {
							return newRules.map(e => {
								const settingsUri = createCommandUri(TerminalContribCommandId.OpenTerminalSettingsLink, ConfigurationTarget.USER);
								return `[\`${e.key}\`](${settingsUri.toString()} "${localize('ruleTooltip', 'View rule in settings')}")`;
							}).join(', ');
						}
						const mdTrustSettings = {
							isTrusted: {
								enabledCommands: [TerminalContribCommandId.OpenTerminalSettingsLink]
							}
						};
						if (newRules.length === 1) {
							terminalData.autoApproveInfo = new MarkdownString(localize('newRule', 'Auto approve rule {0} added', formatRuleLinks(newRules)), mdTrustSettings);
						} else if (newRules.length > 1) {
							terminalData.autoApproveInfo = new MarkdownString(localize('newRule.plural', 'Auto approve rules {0} added', formatRuleLinks(newRules)), mdTrustSettings);
						}
						toolConfirmKind = ToolConfirmKind.UserAction;
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
					case 'sessionApproval': {
						const sessionId = this.context.element.sessionId;
						this.terminalChatService.setChatSessionAutoApproval(sessionId, true);
						const disableUri = createCommandUri(TerminalContribCommandId.DisableSessionAutoApproval, sessionId);
						const mdTrustSettings = {
							isTrusted: {
								enabledCommands: [TerminalContribCommandId.DisableSessionAutoApproval]
							}
						};
						terminalData.autoApproveInfo = new MarkdownString(`${localize('sessionApproval', 'All commands will be auto approved for this session')} ([${localize('sessionApproval.disable', 'Disable')}](${disableUri.toString()}))`, mdTrustSettings);
						toolConfirmKind = ToolConfirmKind.UserAction;
						break;
					}
				}
			}

			if (doComplete) {
				IChatToolInvocation.confirmWith(toolInvocation, { type: toolConfirmKind });
				this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
			}
		}));
		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this.domNode = confirmWidget.domNode;
	}

	private _createButtons(moreActions: (IChatConfirmationButton<TerminalNewAutoApproveButtonData> | Separator)[] | undefined): IChatConfirmationButton<boolean | TerminalNewAutoApproveButtonData>[] {
		const getLabelAndTooltip = (label: string, actionId: string, tooltipDetail: string = label): { label: string; tooltip: string } => {
			const keybinding = this.keybindingService.lookupKeybinding(actionId)?.getLabel();
			const tooltip = keybinding ? `${tooltipDetail} (${keybinding})` : (tooltipDetail);
			return { label, tooltip };
		};
		return [
			{
				...getLabelAndTooltip(localize('tool.allow', "Allow"), AcceptToolConfirmationActionId),
				data: true,
				moreActions,
			},
			{
				...getLabelAndTooltip(localize('tool.skip', "Skip"), SkipToolConfirmationActionId, localize('skip.detail', 'Proceed without executing this command')),
				data: { type: 'skip' },
				isSecondary: true,
			},
		];
	}

	private async _showAutoApproveWarning(): Promise<boolean> {
		const promptResult = await this.dialogService.prompt({
			type: Severity.Info,
			message: localize('autoApprove.title', 'Enable terminal auto approve?'),
			buttons: [{
				label: localize('autoApprove.button.enable', 'Enable'),
				run: () => true
			}],
			cancelButton: true,
			custom: {
				icon: Codicon.shield,
				markdownDetails: [{
					markdown: new MarkdownString(localize('autoApprove.markdown', 'This will enable a configurable subset of commands to run in the terminal autonomously. It provides *best effort protections* and assumes the agent is not acting maliciously.')),
				}, {
					markdown: new MarkdownString(`[${localize('autoApprove.markdown2', 'Learn more about the potential risks and how to avoid them.')}](https://code.visualstudio.com/docs/copilot/security#_security-considerations)`)
				}],
			}
		});
		return promptResult.result === true;
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
			{ codeBlockRenderOptions },
		));
		append(container, part.domNode);
		this._register(part.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
	}
}
