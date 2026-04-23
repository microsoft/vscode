/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ConfirmationOptionKind, ConfirmationOption } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../../chat.js';
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

export interface IAbstractToolPrimaryAction extends IChatConfirmationButton<(() => void)> {
	scope?: 'session' | 'workspace' | 'profile';
}

type AbstractToolPrimaryAction = IAbstractToolPrimaryAction | Separator;

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

		const state = toolInvocation.state.get();
		const customOptions = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
			? state.confirmationMessages?.customOptions
			: undefined;

		let buttons: IChatConfirmationButton<(() => void)>[];

		if (customOptions && customOptions.length > 0) {
			buttons = this.buildCustomOptionButtons(toolInvocation, customOptions);
		} else {
			const allowTooltip = keybindingService.appendKeybinding(config.allowLabel, config.allowActionId);
			const skipTooltip = keybindingService.appendKeybinding(config.skipLabel, config.skipActionId);

			const additionalActions = this.additionalPrimaryActions();

			// find session scoped action
			const sessionAction = this.useAllowOnceAsPrimary() ? undefined : additionalActions.find(
				(action): action is IAbstractToolPrimaryAction => 'scope' in action && action.scope === 'session'
			);

			// regular allow action
			const allowAction: IAbstractToolPrimaryAction = {
				label: config.allowLabel,
				tooltip: allowTooltip,
				data: () => { this.confirmWith(toolInvocation, { type: ToolConfirmKind.UserAction }); },
			};

			const primaryAction = sessionAction ?? allowAction;

			// rebuild additional list with allow action
			const moreActions = sessionAction
				? [allowAction, ...additionalActions.filter(a => a !== sessionAction)]
				: additionalActions;

			buttons = [
				{
					label: primaryAction.label,
					tooltip: primaryAction.tooltip,
					data: primaryAction.data,
					moreActions: moreActions.length > 0 ? moreActions : undefined,
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
		}

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

		this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
			button.data();
			if (!isTouchClick) {
				this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
			}
		}));

		this._register(toDisposable(() => hasToolConfirmation.reset()));

		this.domNode = confirmWidget.domNode;
	}

	protected confirmWith(toolInvocation: IChatToolInvocation, reason: ConfirmedReason): void {
		IChatToolInvocation.confirmWith(toolInvocation, reason);
	}

	private buildCustomOptionButtons(toolInvocation: IChatToolInvocation, options: readonly ConfirmationOption[]): IChatConfirmationButton<(() => void)>[] {
		const approve: ConfirmationOption[] = [];
		const deny: ConfirmationOption[] = [];
		for (const option of options) {
			(option.kind === ConfirmationOptionKind.Deny ? deny : approve).push(option);
		}

		const makeAction = (option: ConfirmationOption): IChatConfirmationButton<(() => void)> => ({
			label: option.label,
			data: () => {
				this.confirmWith(toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: option.id });
			},
		});

		const makeGroupButton = (group: ConfirmationOption[], isSecondary: boolean): IChatConfirmationButton<(() => void)> => {
			const [primary, ...rest] = group;
			const button: IChatConfirmationButton<(() => void)> = {
				...makeAction(primary),
				isSecondary,
			};
			if (rest.length > 0) {
				const moreActions: (IChatConfirmationButton<(() => void)> | Separator)[] = [];
				let prevGroup = primary.group;
				for (const option of rest) {
					if (option.group !== prevGroup) {
						moreActions.push(new Separator());
					}
					moreActions.push(makeAction(option));
					prevGroup = option.group;
				}
				button.moreActions = moreActions;
			}
			return button;
		};

		const buttons: IChatConfirmationButton<(() => void)>[] = [];
		if (approve.length > 0) {
			buttons.push(makeGroupButton(approve, false));
		}
		if (deny.length > 0) {
			buttons.push(makeGroupButton(deny, approve.length > 0));
		}
		return buttons;
	}

	protected additionalPrimaryActions(): AbstractToolPrimaryAction[] {
		return [];
	}

	/**
	 * When true, "Allow Once" stays the primary button even when a
	 * session-scoped action is available. Subclasses override this
	 * to keep the simple allow-once default (e.g. when combination
	 * approval options are present).
	 */
	protected useAllowOnceAsPrimary(): boolean {
		return false;
	}

	protected abstract createContentElement(): HTMLElement | string;
	protected abstract getTitle(): string;
}
