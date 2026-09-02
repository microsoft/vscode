/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener } from '../../../../../../../base/browser/dom.js';
import { IRenderedMarkdown, renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatSystemNotificationContentPart } from '../../../../browser/widget/chatContentParts/chatSystemNotificationContentPart.js';

suite('ChatSystemNotificationContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders persistent checked notification content', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const renderer: IMarkdownRenderer = {
			render: (markdown: IMarkdownString): IRenderedMarkdown => {
				const element = mainWindow.document.createElement('div');
				element.textContent = renderAsPlaintext(markdown);
				return { element, dispose: () => { } };
			},
		};
		const part = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			{ kind: 'systemNotification', content: new MarkdownString('Background command completed') },
			renderer,
		));
		const inlineTimingPart = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			{ kind: 'systemNotification', content: new MarkdownString('Agent Merge started'), icon: Codicon.gitMerge, renderInlineTiming: true },
			renderer,
		));

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			hasCheck: !!part.domNode.querySelector('.codicon-check-compact'),
			sameContent: part.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Background command completed') }),
			differentContent: part.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Different') }),
			inlineTiming: {
				isLayout: inlineTimingPart.domNode.classList.contains('chat-system-notification-layout'),
				hasMergeIcon: !!inlineTimingPart.domNode.querySelector('.codicon-git-merge'),
				hasTimingContainer: inlineTimingPart.inlineTimingContainer?.classList.contains('chat-system-notification-timing'),
				sameContent: inlineTimingPart.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Agent Merge started'), icon: Codicon.gitMerge, renderInlineTiming: true }),
				differentPresentation: inlineTimingPart.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Agent Merge started'), icon: Codicon.gitMerge }),
			},
		}, {
			text: 'Background command completed',
			hasCheck: true,
			sameContent: true,
			differentContent: false,
			inlineTiming: {
				isLayout: true,
				hasMergeIcon: true,
				hasTimingContainer: true,
				sameContent: true,
				differentPresentation: false,
			},
		});
	});

	test('renders collapsible notification details with accessible mouse and keyboard controls', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const renderedValues: string[] = [];
		const renderer: IMarkdownRenderer = {
			render: (markdown: IMarkdownString): IRenderedMarkdown => {
				renderedValues.push(markdown.value);
				const element = mainWindow.document.createElement('div');
				element.textContent = renderAsPlaintext(markdown);
				return { element, dispose: () => { } };
			},
		};
		const notification = {
			kind: 'systemNotification' as const,
			content: new MarkdownString('Agent Merge is on for `feature`.\n\n- It will fix failing CI checks.\n- It will address review comments.'),
			icon: Codicon.gitMerge,
			collapsible: true,
		};
		const part = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			notification,
			renderer,
		));
		const header = part.domNode.querySelector<HTMLElement>('.chat-system-notification-disclosure-header')!;
		const details = part.domNode.querySelector<HTMLElement>('.chat-system-notification-disclosure-body')!;
		let toggleEventCount = 0;
		disposables.add(addDisposableListener(part.domNode, ChatCollapsibleContentPart.userToggleEvent, () => toggleEventCount++));

		assert.deepStrictEqual({
			renderedValues,
			collapsed: part.domNode.classList.contains('collapsed'),
			expanded: header.ariaExpanded,
			label: header.ariaLabel,
			tabIndex: header.tabIndex,
			role: header.getAttribute('role'),
			summary: part.domNode.querySelector('.chat-system-notification-disclosure-summary')?.textContent,
			details: details.textContent,
			iconsAreDecorative: [...part.domNode.querySelectorAll('.codicon')].every(icon => icon.getAttribute('aria-hidden') === 'true'),
			hasMergeIcon: !!part.domNode.querySelector('.codicon-git-merge'),
			hasChevron: !!part.domNode.querySelector('.chat-collapsible-hover-chevron'),
			toggleEventCount,
		}, {
			renderedValues: [
				'Agent Merge is on for `feature`.',
				'- It will fix failing CI checks.\n- It will address review comments.',
			],
			collapsed: true,
			expanded: 'false',
			label: 'Show details for Agent Merge is on for feature.',
			tabIndex: 0,
			role: 'button',
			summary: 'Agent Merge is on for feature.',
			details: 'It will fix failing CI checks.\n\nIt will address review comments.',
			iconsAreDecorative: true,
			hasMergeIcon: true,
			hasChevron: true,
			toggleEventCount: 0,
		});

		header.click();
		assert.deepStrictEqual({
			collapsed: part.domNode.classList.contains('collapsed'),
			expanded: header.ariaExpanded,
			label: header.ariaLabel,
			toggleEventCount,
		}, {
			collapsed: false,
			expanded: 'true',
			label: 'Hide details for Agent Merge is on for feature.',
			toggleEventCount: 1,
		});

		const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		Object.defineProperty(enterEvent, 'keyCode', { get: () => 13 });
		header.dispatchEvent(enterEvent);
		assert.deepStrictEqual({
			collapsed: part.domNode.classList.contains('collapsed'),
			expanded: header.ariaExpanded,
			toggleEventCount,
		}, {
			collapsed: true,
			expanded: 'false',
			toggleEventCount: 2,
		});
	});

	test('uses the ordinary compact icon and avoids a disclosure without details', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const renderer: IMarkdownRenderer = {
			render: (markdown: IMarkdownString): IRenderedMarkdown => {
				const element = mainWindow.document.createElement('div');
				element.textContent = renderAsPlaintext(markdown);
				return { element, dispose: () => { } };
			},
		};
		const withDetails = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			{ kind: 'systemNotification', content: new MarkdownString('Summary\n\n- Detail'), collapsible: true },
			renderer,
		));
		const withoutDetails = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			{ kind: 'systemNotification', content: new MarkdownString('Summary\n\n'), collapsible: true },
			renderer,
		));

		assert.deepStrictEqual({
			withDetailsHasCompactCheck: !!withDetails.domNode.querySelector('.chat-system-notification-disclosure-icon.codicon-check-compact'),
			withoutDetailsIsDisclosure: withoutDetails.domNode.classList.contains('chat-system-notification-disclosure'),
			withoutDetailsHasOrdinaryProgress: withoutDetails.domNode.classList.contains('progress-container'),
		}, {
			withDetailsHasCompactCheck: true,
			withoutDetailsIsDisclosure: false,
			withoutDetailsHasOrdinaryProgress: true,
		});
	});
});
