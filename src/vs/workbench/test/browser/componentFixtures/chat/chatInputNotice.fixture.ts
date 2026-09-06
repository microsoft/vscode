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
 * Mounts one notice above a stand-in chat input, inside a real stack.
 *
 * The notice is wrapped in a slot that reports its state, so the squared join
 * between the two - and the rounding they share - is produced by the stack
 * rather than hardcoded here, and this breaks if that mechanism does.
 */
function addNoticeStack(context: ComponentFixtureContext, variant: ChatInputNoticeVariant, className: string, severity?: string): ChatInputNoticeWidget {
	const { container, disposableStore } = context;
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

	const input = dom.append(stack, dom.$('div'));
	input.textContent = 'Chat input';
	// Match the real input's host radius and square its top corners when docked.
	input.style.cssText = 'padding:10px;color:var(--vscode-descriptionForeground);'
		+ 'background:var(--vscode-agentsChatInput-background, var(--vscode-input-background));'
		+ 'border:var(--vscode-strokeThickness) solid var(--vscode-input-border);'
		+ 'border-radius:'
		+ 'var(--chat-input-stack-radius-top, var(--chat-input-radius, var(--vscode-cornerRadius-large)))'
		+ ' var(--chat-input-stack-radius-top, var(--chat-input-radius, var(--vscode-cornerRadius-large)))'
		+ ' var(--chat-input-radius, var(--vscode-cornerRadius-large))'
		+ ' var(--chat-input-radius, var(--vscode-cornerRadius-large));';

	// Reported last, once the input is in the stack: reporting a slot rescans the
	// stack's children, so doing it before the input exists would leave the input
	// unmarked and its top corners rounded under a docked notice.
	setChatInputStackSlot(slot, variant === ChatInputNoticeVariant.Onboarding
		? ChatInputStackSlot.Standalone
		: ChatInputStackSlot.Docked);

	return notice;
}

function prepareContainer(container: HTMLElement): void {
	container.classList.add('monaco-workbench');
	container.style.width = '320px';
	container.style.padding = '24px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';
	container.style.background = 'var(--vscode-editor-background)';
}

/** A tip: one row of prose, an icon, and a dismiss that sits in the flow. */
function addTip(context: ComponentFixtureContext): void {
	const tip = addNoticeStack(context, ChatInputNoticeVariant.Tip, 'fixture-tip');
	dom.append(tip.domNode, dom.$(ThemeIcon.asCSSSelector(Codicon.lightbulb)));
	dom.append(tip.domNode, dom.$('span')).textContent = 'Start a parallel conversation to build on all the changes made in this session.';
	tip.addDismissAction({ onActivate: () => { } });
}

/** A notification: the same frame at every severity, only the tint changes. */
function addNotification(context: ComponentFixtureContext, severity: string, icon: ThemeIcon, message: string): void {
	const notification = addNoticeStack(context, ChatInputNoticeVariant.Notification, 'chat-input-notification-widget', severity);
	const header = dom.append(notification.domNode, dom.$('.chat-input-notification-header'));
	dom.append(dom.append(header, dom.$('.chat-input-notification-icon')), dom.$(ThemeIcon.asCSSSelector(icon)));
	dom.append(header, dom.$('.chat-input-notification-title')).textContent = message;
	notification.addDismissAction({ parent: header, onActivate: () => { } });
}

/** An onboarding card: a stack, with its close pinned to the corner. */
function addOnboardingCard(context: ComponentFixtureContext): void {
	const card = addNoticeStack(context, ChatInputNoticeVariant.Onboarding, 'fixture-card');
	const copy = dom.append(card.domNode, dom.$('div'));
	copy.style.paddingRight = 'var(--vscode-spacing-size240)';
	dom.append(copy, dom.$('div')).textContent = 'Welcome to Voice Mode';
	dom.append(copy, dom.$('div')).textContent = 'Choose how your agent speaks to you.';
	card.addDismissAction({ onActivate: () => { } });
}

/**
 * The three notice variants side by side. Five producers share one frame, and
 * the only way to see that they still agree - and that severity only tints what
 * it is meant to - is to put the variants next to each other at one width.
 */
function renderNotices(context: ComponentFixtureContext): void {
	prepareContainer(context.container);

	addTip(context);
	for (const [severity, icon, message] of [
		['severity-info', Codicon.info, 'You are approaching your monthly limit.'],
		['severity-warning', Codicon.warning, 'This model is temporarily unavailable.'],
		['severity-error', Codicon.error, 'Sign in to keep using chat.'],
	] as const) {
		addNotification(context, severity, icon, message);
	}
	addOnboardingCard(context);
}

/** Renders notices at the compact input radius, declared inline because this fixture does not load `chat.css`. */
function renderNoticesInCompactInput(context: ComponentFixtureContext): void {
	prepareContainer(context.container);
	context.container.style.setProperty('--chat-input-radius', 'var(--vscode-cornerRadius-small)');

	addTip(context);
	addNotification(context, 'severity-info', Codicon.info, 'You are approaching your monthly limit.');
	addOnboardingCard(context);
}

export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
	'Chat input notices': defineComponentFixture({ render: renderNotices }),
	'Chat input notices in a compact input': defineComponentFixture({ render: renderNoticesInCompactInput }),
});
