/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../contrib/chat/browser/widget/input/chatInputNoticeWidget.js';
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../contrib/chat/browser/widget/input/chatInputStack.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

/**
 * The three notice variants side by side. Five producers share one frame, and
 * the only way to see that they still agree - and that severity only tints what
 * it is meant to - is to put the variants next to each other at one width.
 */
function renderNotices(context: ComponentFixtureContext): void {
	const { container, disposableStore } = context;
	container.classList.add('monaco-workbench');
	container.style.width = '320px';
	container.style.padding = '24px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';
	container.style.background = 'var(--vscode-editor-background)';

	const addNotice = (variant: ChatInputNoticeVariant, className: string, severity?: string) => {
		// Each notice sits in a real stack above a stand-in for the chat input, and
		// the notice is wrapped in a slot that reports its state. The squared top
		// corner on the input below is therefore produced by the stack rather than
		// hardcoded here, so this breaks if the mechanism does.
		const stack = dom.append(container, dom.$(`.${chatInputStackClass}`));
		stack.style.display = 'flex';
		stack.style.flexDirection = 'column';

		const slot = dom.append(stack, dom.$(`.${chatInputStackSlotClass}`));
		const notice = disposableStore.add(new ChatInputNoticeWidget({
			container: slot,
			variant,
			className,
			ariaLabel: className,
		}));
		if (severity) {
			notice.domNode.classList.add(severity);
		}
		setChatInputStackSlot(slot, variant === ChatInputNoticeVariant.Onboarding
			? ChatInputStackSlot.Standalone
			: ChatInputStackSlot.Docked);

		const input = dom.append(stack, dom.$('div'));
		input.textContent = 'Chat input';
		// Reads the stack's radius the way a real input does: rounded on its own,
		// squared on top while something is docked above it.
		input.style.cssText = 'padding:10px;color:var(--vscode-descriptionForeground);'
			+ 'background:var(--vscode-agentsChatInput-background, var(--vscode-input-background));'
			+ 'border:var(--vscode-strokeThickness) solid var(--vscode-input-border);'
			+ 'border-radius:'
			+ 'var(--chat-input-stack-radius-top, var(--vscode-cornerRadius-large))'
			+ ' var(--chat-input-stack-radius-top, var(--vscode-cornerRadius-large))'
			+ ' var(--vscode-cornerRadius-large) var(--vscode-cornerRadius-large);';
		return notice;
	};

	// A tip: one row of prose, an icon, and a dismiss that sits in the flow.
	const tip = addNotice(ChatInputNoticeVariant.Tip, 'fixture-tip');
	dom.append(tip.domNode, dom.$(ThemeIcon.asCSSSelector(Codicon.lightbulb)));
	dom.append(tip.domNode, dom.$('span')).textContent = 'Start a parallel conversation to build on all the changes made in this session.';
	tip.addDismissAction({ onActivate: () => { } });

	// A notification, at each severity: same frame, only the tint changes.
	for (const [severity, icon, message] of [
		['severity-info', Codicon.info, 'You are approaching your monthly limit.'],
		['severity-warning', Codicon.warning, 'This model is temporarily unavailable.'],
		['severity-error', Codicon.error, 'Sign in to keep using chat.'],
	] as const) {
		const notification = addNotice(ChatInputNoticeVariant.Notification, 'chat-input-notification-widget', severity);
		const header = dom.append(notification.domNode, dom.$('.chat-input-notification-header'));
		dom.append(dom.append(header, dom.$('.chat-input-notification-icon')), dom.$(ThemeIcon.asCSSSelector(icon)));
		dom.append(header, dom.$('.chat-input-notification-title')).textContent = message;
		notification.addDismissAction({ parent: header, onActivate: () => { } });
	}

	// An onboarding card: a stack, with its close pinned to the corner.
	const card = addNotice(ChatInputNoticeVariant.Onboarding, 'fixture-card');
	const copy = dom.append(card.domNode, dom.$('div'));
	copy.style.paddingRight = 'var(--vscode-spacing-size240)';
	dom.append(copy, dom.$('div')).textContent = 'Welcome to Voice Mode';
	dom.append(copy, dom.$('div')).textContent = 'Choose how your agent speaks to you.';
	card.addDismissAction({ onActivate: () => { } });
}

export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
	'Chat input notices': defineComponentFixture({ render: renderNotices }),
});
