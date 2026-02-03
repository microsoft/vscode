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
import { thenRegisterOrDispose, toDisposable } from '../../../../../../../base/common/lifecycle.js';
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
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation, ToolConfirmKind, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../../common/chatService/chatService.js';
import type { CodeBlockModelCollection } from '../../../../common/widget/codeBlockModelCollection.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { EditorPool } from '../chatContentCodePools.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { ICodeBlockRenderOptions } from '../codeBlockPart.js';
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
	scope: 'session' | 'workspace' | 'user';
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

		const state = toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
			throw new Error('Confirmation messages are missing');
		}

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const { title, message, disclaimer, terminalCustomActions } = state.confirmationMessages;

		// Use pre-computed confirmation data from runInTerminalTool (cd prefix extraction happens there for localization)
		// Use presentationOverrides for display if available (e.g., extracted Python code)
		const initialContent = terminalData.presentationOverrides?.commandLine ?? terminalData.confirmation?.commandLine ?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
		const cdPrefix = terminalData.confirmation?.cdPrefix ?? '';
		// When presentationOverrides is set, the editor should be read-only since the displayed content
		// differs from the actual command (e.g., extracted Python code vs full python -c command)
		const isReadOnly = !!terminalData.presentationOverrides;

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
				readOnly: isReadOnly,
				tabFocusMode: true,
				ariaLabel: typeof title === 'string' ? title : title.value
			}
		};
		const languageId = this.languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language ?? 'sh') ?? 'shellscript';
		const model = this._register(this.modelService.createModel(
			initialContent,
			this.languageService.createById(languageId),
			this._getUniqueCodeBlockUri(),
			true
		));
		thenRegisterOrDispose(textModelService.createModelReference(model.uri), this._store);
		const editor = this._register(this.editorPool.get());
		editor.object.render({
			codeBlockIndex: this.codeBlockStartIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			languageId,
			renderOptions: codeBlockRenderOptions,
			textModel: Promise.resolve(model),
			chatSessionResource: this.context.element.sessionResource
		}, this.currentWidthDelegate());
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
		this._register(model.onDidChangeContent(e => {
			const currentValue = model.getValue();
			// Only set userEdited if the content actually differs from the initial value
			// Prepend cd prefix back if it was extracted for display
			if (currentValue !== initialContent) {
				terminalData.commandLine.userEdited = cdPrefix + currentValue;
			} else {
				terminalData.commandLine.userEdited = undefined;
			}
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
							// If this command would have been auto-approved, approve immediately
							if (terminalData.autoApproveInfo) {
								toolConfirmKind = ToolConfirmKind.UserAction;
							}
							// If this would not have been auto approved, enable the options and
							// do not complete
							else if (terminalCustomActions) {
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

						// Group rules by scope
						const sessionRules = newRules.filter(r => r.scope === 'session');
						const workspaceRules = newRules.filter(r => r.scope === 'workspace');
						const userRules = newRules.filter(r => r.scope === 'user');

						// Handle session-scoped rules (temporary, in-memory only)
						const chatSessionResource = this.context.element.sessionResource;
						for (const rule of sessionRules) {
							this.terminalChatService.addSessionAutoApproveRule(chatSessionResource, rule.key, rule.value);
						}

						// Handle workspace-scoped rules
						if (workspaceRules.length > 0) {
							const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
							const oldValue = (inspect.workspaceValue as Record<string, unknown> | undefined) ?? {};
							if (isObject(oldValue)) {
								const newValue: Record<string, unknown> = { ...oldValue };
								for (const rule of workspaceRules) {
									newValue[rule.key] = rule.value;
								}
								await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.WORKSPACE);
							} else {
								this.preferencesService.openSettings({
									jsonEditor: true,
									target: ConfigurationTarget.WORKSPACE,
									revealSetting: { key: TerminalContribSettingId.AutoApprove },
								});
								throw new ErrorNoTelemetry(`Cannot add new rule, existing workspace setting is unexpected format`);
							}
						}

						// Handle user-scoped rules
						if (userRules.length > 0) {
							const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
							const oldValue = (inspect.userValue as Record<string, unknown> | undefined) ?? {};
							if (isObject(oldValue)) {
								const newValue: Record<string, unknown> = { ...oldValue };
								for (const rule of userRules) {
									newValue[rule.key] = rule.value;
								}
								await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.USER);
							} else {
								this.preferencesService.openSettings({
									jsonEditor: true,
									target: ConfigurationTarget.USER,
									revealSetting: { key: TerminalContribSettingId.AutoApprove },
								});
								throw new ErrorNoTelemetry(`Cannot add new rule, existing setting is unexpected format`);
							}
						}

						function formatRuleLinks(rules: ITerminalNewAutoApproveRule[], scope: 'session' | 'workspace' | 'user'): string {
							return rules.map(e => {
								if (scope === 'session') {
									return `\`${e.key}\``;
								}
								const target = scope === 'workspace' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
								const settingsUri = createCommandUri(TerminalContribCommandId.OpenTerminalSettingsLink, target);
								return `[\`${e.key}\`](${settingsUri.toString()} "${localize('ruleTooltip', 'View rule in settings')}")`;
							}).join(', ');
						}
						const mdTrustSettings = {
							isTrusted: {
								enabledCommands: [TerminalContribCommandId.OpenTerminalSettingsLink]
							}
						};
						const parts: string[] = [];
						if (sessionRules.length > 0) {
							parts.push(sessionRules.length === 1
								? localize('newRule.session', 'Session auto approve rule {0} added', formatRuleLinks(sessionRules, 'session'))
								: localize('newRule.session.plural', 'Session auto approve rules {0} added', formatRuleLinks(sessionRules, 'session')));
						}
						if (workspaceRules.length > 0) {
							parts.push(workspaceRules.length === 1
								? localize('newRule.workspace', 'Workspace auto approve rule {0} added', formatRuleLinks(workspaceRules, 'workspace'))
								: localize('newRule.workspace.plural', 'Workspace auto approve rules {0} added', formatRuleLinks(workspaceRules, 'workspace')));
						}
						if (userRules.length > 0) {
							parts.push(userRules.length === 1
								? localize('newRule.user', 'User auto approve rule {0} added', formatRuleLinks(userRules, 'user'))
								: localize('newRule.user.plural', 'User auto approve rules {0} added', formatRuleLinks(userRules, 'user')));
						}
						if (parts.length > 0) {
							terminalData.autoApproveInfo = new MarkdownString(parts.join(', '), mdTrustSettings);
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
						const sessionResource = this.context.element.sessionResource;
						this.terminalChatService.setChatSessionAutoApproval(sessionResource, true);
						const disableUri = createCommandUri(TerminalContribCommandId.DisableSessionAutoApproval, sessionResource);
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

		this.domNode = confirmWidget.domNode;
	}

	private _createButtons(moreActions: (IChatConfirmationButton<TerminalNewAutoApproveButtonData> | Separator)[] | undefined): IChatConfirmationButton<boolean | TerminalNewAutoApproveButtonData>[] {
		const getLabelAndTooltip = (label: string, actionId: string, tooltipDetail: string = label): { label: string; tooltip: string } => {
			const tooltip = this.keybindingService.appendKeybinding(tooltipDetail, actionId);
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
	}
}
