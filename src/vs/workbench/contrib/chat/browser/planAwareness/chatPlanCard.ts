/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPlanAwareness.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../accessibility/common/accessibilityCommands.js';
import { IPlanFact } from '../../common/planAwareness/chatPlanAwareness.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatPlanAwarenessContextKeys, FOCUS_PLAN_MOMENT_COMMAND_ID, IChatPlanAwarenessService, IPlanMoment } from './chatPlanAwarenessService.js';

const $ = dom.$;

const FOCUS_PLAN_CARD_COMMAND_ID = '_chat.planAwareness.focusCard';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FOCUS_PLAN_MOMENT_COMMAND_ID,
			title: localize2('planAwareness.moment.focus', "Focus Copilot Plan Suggestion"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatPlanAwarenessContextKeys.momentVisible,
		});
	}

	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		const keybindingService = accessor.get(IKeybindingService);
		accessor.get(ICommandService).executeCommand(FOCUS_PLAN_CARD_COMMAND_ID);
		const helpKeybinding = keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
		if (helpKeybinding && configurationService.getValue(AccessibilityVerbositySettingId.ChatPlanNudge)) {
			status(localize('planAwareness.moment.focus.help', "Press {0} for accessibility help.", helpKeybinding));
		}
	}
});

interface IPlanCardDelegate {
	run(): void;
	close(): void;
	dismiss(): void;
	onFocusChange(focused: boolean): void;
}

let cardCount = 0;

function appendIcon(container: HTMLElement, icon: ThemeIcon): void {
	const element = dom.append(container, $('span.chat-plan-card-icon'));
	element.classList.add(...ThemeIcon.asClassNameArray(icon));
	element.setAttribute('aria-hidden', 'true');
}

/**
 * A non-modal card in the corner of the window that offers to let Copilot take
 * over, and lists what the plan includes. It never takes focus by itself.
 */
class ChatPlanCardWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly primaryButton: Button;
	private previouslyFocused: HTMLElement | undefined;

	constructor(
		container: HTMLElement,
		moment: IPlanMoment,
		facts: readonly IPlanFact[],
		delegate: IPlanCardDelegate,
	) {
		super();

		const id = `chat-plan-card-${++cardCount}`;
		this.element = dom.append(container, $('div.chat-plan-card', {
			role: 'dialog',
			'aria-modal': 'false',
			'aria-labelledby': `${id}-title`,
			'aria-describedby': `${id}-body`,
			tabindex: '-1',
		}));
		this._register({
			dispose: () => {
				// Give focus back to where the user was when they focused the card
				const restore = this.hasFocus() ? this.previouslyFocused : undefined;
				this.element.remove();
				if (restore?.isConnected) {
					restore.focus();
				}
			}
		});

		const header = dom.append(this.element, $('div.chat-plan-card-header'));
		appendIcon(header, Codicon.copilot);
		dom.append(header, $('span.chat-plan-card-title', { id: `${id}-title` }, moment.title));
		const toolbar = this._register(new ActionBar(dom.append(header, $('div.chat-plan-card-toolbar')), { hoverDelegate: getDefaultHoverDelegate('element') }));
		toolbar.push([
			this._register(new Action('chatPlanCard.dismiss', localize('planAwareness.card.dismiss', "Don't Show Again"), ThemeIcon.asClassName(Codicon.bellSlash), true, async () => delegate.dismiss())),
			this._register(new Action('chatPlanCard.close', localize('planAwareness.card.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, async () => delegate.close())),
		], { icon: true, label: false });

		const body = dom.append(this.element, $('div.chat-plan-card-body', { id: `${id}-body` }));
		dom.append(body, $('p.chat-plan-card-message', undefined, moment.message));
		if (facts.length > 0) {
			const list = dom.append(body, $('ul.chat-plan-card-facts', { 'aria-label': localize('planAwareness.card.plan', "Your Copilot plan") }));
			for (const fact of facts) {
				const item = dom.append(list, $('li'));
				appendIcon(item, Codicon.check);
				dom.append(item, $('span', undefined, fact.before, $('strong', undefined, fact.emphasis), fact.after));
			}
		}

		const actions = dom.append(this.element, $('div.chat-plan-card-actions'));
		this.primaryButton = this._register(new Button(actions, { ...defaultButtonStyles, title: moment.primary.tooltip ?? false }));
		this.primaryButton.label = moment.primary.label;
		this._register(this.primaryButton.onDidClick(() => delegate.run()));

		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopPropagation();
				delegate.close();
			}
		}));

		const focusTracker = this._register(dom.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => delegate.onFocusChange(true)));
		this._register(focusTracker.onDidBlur(() => delegate.onFocusChange(false)));
	}

	focus(): void {
		if (!this.hasFocus()) {
			const active = dom.getActiveElement();
			this.previouslyFocused = dom.isHTMLElement(active) ? active : undefined;
		}
		this.primaryButton.focus();
	}

	hasFocus(): boolean {
		return dom.isAncestorOfActiveElement(this.element);
	}
}

/**
 * Shows the offered moment as a card in the bottom right corner of the window.
 */
export class ChatPlanCardContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPlanCard';

	private readonly card = this._register(new MutableDisposable<ChatPlanCardWidget>());

	constructor(
		@IChatPlanAwarenessService planAwarenessService: IChatPlanAwarenessService,
		@ILayoutService layoutService: ILayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const focusedContext = ChatPlanAwarenessContextKeys.momentFocused.bindTo(contextKeyService);
		this._register(autorun(reader => {
			const moment = planAwarenessService.moment.read(reader);
			// A moment that changes in place, like a usage limit that is reached after it was close, keeps the focus
			const hadFocus = !!this.card.value?.hasFocus();
			this.card.clear();
			focusedContext.set(false);
			if (!moment) {
				return;
			}
			this.card.value = new ChatPlanCardWidget(layoutService.mainContainer, moment, moment.showPlan ? planAwarenessService.getPlanFacts() : [], {
				run: () => planAwarenessService.runMoment(),
				close: () => planAwarenessService.closeMoment(false),
				dismiss: () => planAwarenessService.closeMoment(true),
				onFocusChange: focused => focusedContext.set(focused),
			});
			if (hadFocus) {
				this.card.value.focus();
			}
		}));

		this._register(CommandsRegistry.registerCommand(FOCUS_PLAN_CARD_COMMAND_ID, () => this.card.value?.focus()));
	}
}
