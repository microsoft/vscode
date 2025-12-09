/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService.js';
import { ILanguageModelToolsService } from '../../../common/languageModelToolsService.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export interface IToolConfirmationConfig {
	allowActionId: string;
	skipActionId: string;
	allowLabel: string;
	skipLabel: string;
	partType: string;
	subtitle?: string;
}

type AbstractToolPrimaryAction = IChatConfirmationButton<(() => void)> | Separator;

/**
 * Base class for a tool confirmation.
 *
 * note that implementors MUST call render() after they construct.
 */
export abstract class AbstractToolConfirmationSubPart extends BaseChatToolInvocationSubPart {
	public domNode!: HTMLElement;

	constructor(
		protected override readonly toolInvocation: IChatToolInvocation,
		protected readonly context: IChatContentPartRenderContext,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IChatWidgetService protected readonly chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService protected readonly languageModelToolsService: ILanguageModelToolsService,
	) {
		super(toolInvocation);

		if (toolInvocation.kind !== 'toolInvocation') {
			throw new Error('Confirmation only works with live tool invocations');
		}
	}
	protected render(config: IToolConfirmationConfig) {
		const { keybindingService, languageModelToolsService, toolInvocation } = this;
		const allowKeybinding = keybindingService.lookupKeybinding(config.allowActionId)?.getLabel();
		const allowTooltip = allowKeybinding ? `${config.allowLabel} (${allowKeybinding})` : config.allowLabel;
		const skipKeybinding = keybindingService.lookupKeybinding(config.skipActionId)?.getLabel();
		const skipTooltip = skipKeybinding ? `${config.skipLabel} (${skipKeybinding})` : config.skipLabel;


		const additionalActions = this.additionalPrimaryActions();
		const buttons: IChatConfirmationButton<(() => void)>[] = [
			{
				label: config.allowLabel,
				tooltip: allowTooltip,
				data: () => {
					this.confirmWith(toolInvocation, { type: ToolConfirmKind.UserAction });
				},
				moreActions: additionalActions.length > 0 ? additionalActions : undefined,
			},
			{
				label: localize('skip', "Skip"),
				tooltip: skipTooltip,
				data: () => {
					this.confirmWith(toolInvocation, { type: ToolConfirmKind.Skipped });
				},
				isSecondary: true,
			}
		];

		const contentElement = this.createContentElement();
		const tool = languageModelToolsService.getTool(toolInvocation.toolId);
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget<(() => void)>,
			this.context,
			{
				title: this.getTitle(),
				icon: tool?.icon && 'id' in tool.icon ? tool.icon : Codicon.tools,
				subtitle: config.subtitle,
				buttons,
				message: contentElement,
				toolbarData: {
					arg: toolInvocation,
					partType: config.partType,
					partSource: toolInvocation.source.type
				}
			}
		));

		const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmation.set(true);

		this._register(confirmWidget.onDidClick(button => {
			button.data();
			this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
		}));

		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._register(toDisposable(() => hasToolConfirmation.reset()));

		this.domNode = confirmWidget.domNode;
	}

	protected confirmWith(toolInvocation: IChatToolInvocation, reason: ConfirmedReason): void {
		IChatToolInvocation.confirmWith(toolInvocation, reason);
	}

	protected additionalPrimaryActions(): AbstractToolPrimaryAction[] {
		return [];
	}

	protected abstract createContentElement(): HTMLElement | string;
	protected abstract getTitle(): string;
}
