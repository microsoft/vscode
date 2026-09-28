/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { IChatModelFeedbackSurveyService } from '../feedbackSurvey/chatModelFeedbackSurveyService.js';
import '../feedbackSurvey/media/chatModelFeedbackSurvey.css';
import { CHAT_CATEGORY } from './chatActions.js';

export const ChatModelFeedbackSurveyActionId = 'workbench.action.chat.openModelFeedbackSurvey';

const thumbsUpIconClasses = ThemeIcon.asClassNameArray(Codicon.thumbsup);
const thumbsDownIconClasses = ThemeIcon.asClassNameArray(Codicon.thumbsdown);

/**
 * The combined thumbs up and down control that stands in for the helpful and unhelpful actions
 * while a survey applies. It is neutral and opens the survey rather than recording a vote.
 */
class ChatModelFeedbackSurveyActionViewItem extends MenuEntryActionViewItem {

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element || !this.label) {
			return;
		}

		// The label is the focusable anchor that carries the accessible name, so the styling and
		// the icons hang off it rather than off the outer list item.
		this.label.classList.add('chat-feedback-survey-pill');
		this.resetLabel();

		const icons = dom.append(this.label, dom.$('.chat-feedback-survey-pill-icons'));
		icons.setAttribute('aria-hidden', 'true');
		for (const iconClasses of [thumbsUpIconClasses, thumbsDownIconClasses]) {
			const icon = dom.append(icons, dom.$('.chat-feedback-survey-pill-icon'));
			icon.classList.add(...iconClasses);
		}
	}

	protected override updateClass(): void {
		super.updateClass();
		this.resetLabel();
	}

	/**
	 * The control discloses a panel rather than holding a pressed state, so it reports
	 * `aria-expanded` instead of the `aria-pressed` the base item would apply.
	 */
	protected override updateChecked(): void {
		super.updateChecked();
		this.label?.removeAttribute('aria-pressed');
		this.label?.setAttribute('aria-expanded', String(!!this.action.checked));
	}

	/**
	 * The base item paints one icon onto the label, so that has to be cleared before drawing two.
	 * The label keeps its `aria-label` and only the icons are hidden from screen readers.
	 */
	private resetLabel(): void {
		if (!this.label) {
			return;
		}
		this.label.classList.remove('icon', ...thumbsUpIconClasses, ...thumbsDownIconClasses);
		this.label.style.backgroundImage = '';
		this.label.textContent = '';
	}
}

export class ChatModelFeedbackSurveyActionRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.modelFeedbackSurveyActionRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const disposable = this._register(actionViewItemService.register(MenuId.ChatMessageFooter, ChatModelFeedbackSurveyActionId, (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChatModelFeedbackSurveyActionViewItem, action, options);
		}));

		markAsSingleton(disposable);
	}
}

/** The part of a toolbar needed to find and focus one of its actions. */
export interface IFeedbackSurveyToolBar {
	getItemsLength(): number;
	getItemAction(index: number): IAction | undefined;
	focus(index?: number): void;
}

/**
 * Puts focus on the feedback control in `toolbar`, used when the survey panel it opened is torn
 * down. Falls back to the toolbar itself when the control is not currently shown.
 */
export function focusChatModelFeedbackSurveyAction(toolbar: IFeedbackSurveyToolBar): void {
	for (let i = 0; i < toolbar.getItemsLength(); i++) {
		if (toolbar.getItemAction(i)?.id === ChatModelFeedbackSurveyActionId) {
			toolbar.focus(i);
			return;
		}
	}
	toolbar.focus();
}

export function registerChatModelFeedbackSurveyActions(): void {
	registerAction2(class OpenModelFeedbackSurveyAction extends Action2 {
		constructor() {
			super({
				id: ChatModelFeedbackSurveyActionId,
				title: localize2('chat.feedbackSurvey.open.label', "Give Feedback"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.thumbsup,
				toggled: ChatContextKeys.responseFeedbackSurveyOpen,
				menu: [{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 2,
					// The survey service checks these too, so a shown report is never sent for a
					// control that cannot render. This drops the vote actions'
					// `lockedToCodingAgent.negate()` because every agent host session is locked to
					// its agent, which would make the `harnesses` selector unreachable.
					when: ContextKeyExpr.and(
						ChatContextKeys.responseHasFeedbackSurvey,
						ChatContextKeys.isResponse,
						ChatContextKeys.responseHasError.negate(),
						ContextKeyExpr.has('config.telemetry.feedback.enabled'),
					),
				}],
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]): void {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}
			accessor.get(IChatModelFeedbackSurveyService).toggle(item);
		}
	});
}
