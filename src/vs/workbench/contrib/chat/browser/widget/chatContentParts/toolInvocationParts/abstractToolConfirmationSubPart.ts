/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ConfirmationOptionKind, ConfirmationOption } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IEditorIdentifier } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../../chat.js';
import { IChatToolRiskAssessmentService } from '../../../tools/chatToolRiskAssessmentService.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { IRenderFileWidgetsOptions } from '../chatInlineAnchorWidget.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { createApprovalReasonBadge, createToolRiskBadge } from './toolRiskBadgeHelper.js';

/**
 * Remembers editors that the user opened by clicking a file link inside a confirmation
 * message so that they can be closed again once the confirmation has been answered.
 */
export class ChatConfirmationOpenedEditors extends Disposable {

	private readonly _opened: IEditorIdentifier[] = [];

	readonly fileWidgetOptions: IRenderFileWidgetsOptions = {
		trackOpen: open => this._trackOpen(open),
	};

	constructor(
		private readonly _toolInvocation: IChatToolInvocation,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
	}

	/**
	 * The opener API doesn't report which editor it opened, so attribute the editor the click
	 * left active. Editors that were already open beforehand are left alone.
	 */
	private async _trackOpen(open: () => Promise<void>): Promise<void> {
		const before = new Set(this._editorService.editors);
		try {
			await open();
		} finally {
			const pane = this._editorService.activeEditorPane;
			if (pane?.input && !before.has(pane.input)) {
				this._opened.push({ editor: pane.input, groupId: pane.group.id });
			}
		}
	}

	/**
	 * A confirmation can be answered by clicking a button, but also by keybinding or voice. All
	 * of those transition the invocation out of its waiting state, which re-renders and disposes
	 * this sub part, so cleaning up here covers every path. Editors are kept when the part is
	 * disposed for any other reason, such as the list virtualizing the response away.
	 */
	override dispose(): void {
		const stateKind = this._toolInvocation.state.get().type;
		if (stateKind !== IChatToolInvocation.StateKind.WaitingForConfirmation && stateKind !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
			const toClose = this._opened.filter(({ editor }) => !editor.isDisposed() && !editor.isDirty());
			if (toClose.length) {
				this._editorService.closeEditors(toClose).catch(onUnexpectedError);
			}
		}

		this._opened.length = 0;
		super.dispose();
	}
}

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

	/**
	 * Tracks files the user opened from links in the confirmation message so they can be
	 * closed again when the confirmation is answered.
	 */
	protected readonly openedEditors: ChatConfirmationOpenedEditors;

	constructor(
		protected override readonly toolInvocation: IChatToolInvocation,
		protected readonly context: IChatContentPartRenderContext,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IChatWidgetService protected readonly chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService protected readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatToolRiskAssessmentService protected readonly riskAssessmentService: IChatToolRiskAssessmentService,
	) {
		super(toolInvocation);

		if (toolInvocation.kind !== 'toolInvocation') {
			throw new Error('Confirmation only works with live tool invocations');
		}

		this.openedEditors = this._register(instantiationService.createInstance(ChatConfirmationOpenedEditors, toolInvocation));
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
		// Risk badges describe a pending action, so they only show on the pre-execution
		// confirmation, not after the tool has run.
		const approvalReasonBadge = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
			? createApprovalReasonBadge(this._store, this.instantiationService, state.confirmationMessages?.approvalReason)
			: undefined;
		const riskBadge = approvalReasonBadge?.domNode ?? (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
			? this.createRiskBadgeDomNode(state.parameters)
			: undefined);
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget<(() => void)>,
			this.context,
			{
				title: this.getTitle(),
				icon: tool?.icon && 'id' in tool.icon ? tool.icon : Codicon.tools,
				subtitle: config.subtitle,
				buttons,
				message: contentElement,
				footerBanner: riskBadge,
				fileWidgetOptions: this.openedEditors.fileWidgetOptions,
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
				this.confirmWith(toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: option.id, selectedButtonKind: option.kind });
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
	 * Create the risk-assessment badge DOM node for this confirmation, or
	 * `undefined` when the feature is disabled or the tool is unknown. Returned
	 * as a `footerBanner` for the confirmation widget.
	 */
	protected createRiskBadgeDomNode(parameters: unknown): HTMLElement | undefined {
		return createToolRiskBadge(this._store, this.instantiationService, this.riskAssessmentService, this.languageModelToolsService, this.toolInvocation.toolId, parameters)?.domNode;
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
