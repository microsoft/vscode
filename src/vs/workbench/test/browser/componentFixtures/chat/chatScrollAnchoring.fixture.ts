/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatProgressAnimation, ChatProgressVerbosity } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from './chatWidget.fixture.js';

async function renderScrollAnchoring(context: ComponentFixtureContext, completed: boolean, offscreen: boolean, kind: 'tools' | 'thinking' = 'tools'): Promise<void> {
	const { container, disposableStore } = context;
	container.style.width = '720px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = 'var(--vscode-spacing-size80)';
	const controls = dom.append(container, dom.$('div', { role: 'group', 'aria-label': 'Scroll anchoring scenario controls' }));
	controls.style.display = 'flex';
	controls.style.gap = 'var(--vscode-spacing-size80)';
	const measurements = dom.append(container, dom.$('div.scroll-anchoring-measurements'));
	const preview = dom.append(container, dom.$('div'));
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: preview }, {
		width: 720,
		height: 480,
		listHeight: 480,
		stickyScroll: true,
		inputVisible: false,
		persistentContentHeight: 32,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: completed ? ChatProgressVerbosity.Verbose : ChatProgressVerbosity.Compact,
		collapseCompletedResponses: completed,
		messages: [{
			user: 'Review the earlier results',
			assistant: [{ kind: 'markdown', text: Array.from({ length: 16 }, (_, index) => `Earlier result ${index + 1}.`).join('\n\n') }],
		}, {
			user: kind === 'thinking' ? 'Keep investigating please' : 'Review a long sequence of tool calls without leaving empty scroll space',
			responseComplete: completed,
			assistant: [
				...(kind === 'thinking' ? [{
					kind: 'thinking' as const,
					text: '**Exploring session components**\n\nInspect the component explorer to find the session and available fixtures. Compare the collapsed and expanded reasoning while keeping the surrounding content stationary.',
				}] : Array.from({ length: 48 }, (_, index) => ({
					kind: 'tool' as const,
					toolId: 'read_file',
					displayName: 'Read file',
					invocationMessage: `Read progress renderer ${index + 1}`,
					complete: true,
				}))),
				...(completed ? [{ kind: 'markdown' as const, text: 'The review is complete. All 48 tool calls have finished.' }] : []),
			],
		}],
		onRendered: rendered => handle = rendered,
	});
	if (!handle) {
		throw new Error('The scroll anchoring fixture did not initialize');
	}
	const { model, viewModel, listWidget } = handle;
	const response = model.getRequests().at(-1)?.response;
	const request = model.getRequests().at(-1);
	if (!request || !response) {
		throw new Error('The scroll anchoring fixture requires a response');
	}
	const headerSelector = completed ? '.completed-response-summary' : kind === 'thinking' ? '.chat-persistent-reasoning > .chat-used-context-label' : '.chat-tool-chain-collapsible > .chat-used-context-label';
	const getHeader = () => {
		const header = preview.querySelector<HTMLElement>(headerSelector);
		if (!header) {
			throw new Error('The collapsible header did not render');
		}
		return header;
	};
	const settle = async () => {
		let previousHeight = -1;
		let stableFrames = 0;
		for (let frame = 0; frame < 120; frame++) {
			await new Promise<void>(resolve => dom.getWindow(container).requestAnimationFrame(() => resolve()));
			const height = listWidget.contentHeight;
			const animating = preview.getAnimations({ subtree: true }).some(animation =>
				(animation.playState === 'running' || animation.pending) && animation.effect?.getComputedTiming().endTime !== Infinity);
			stableFrames = height === previousHeight && !animating ? stableFrames + 1 : 0;
			previousHeight = height;
			if (stableFrames >= 3) {
				return;
			}
		}
		throw new Error('The scroll anchoring fixture did not settle');
	};
	const measure = () => {
		const header = preview.querySelector<HTMLElement>(headerSelector);
		const sticky = listWidget.stickyScrollDomNode?.getBoundingClientRect();
		const shadow = listWidget.stickyScrollDomNode?.querySelector('.monaco-tree-sticky-container-shadow')?.getBoundingClientRect();
		const metrics = {
			complete: response.isComplete,
			canceled: response.isCanceled,
			scrollTop: listWidget.scrollTop,
			contentHeight: listWidget.contentHeight,
			scrollHeight: listWidget.scrollHeight,
			viewportHeight: listWidget.renderHeight,
			extraPadding: listWidget.scrollHeight - listWidget.contentHeight - 32,
			headerTop: header ? Math.round(header.getBoundingClientRect().top - listWidget.domNode.getBoundingClientRect().top) : null,
			stickyHeight: Math.round(Math.max(0, (sticky?.bottom ?? 0) - listWidget.domNode.getBoundingClientRect().top, (shadow?.bottom ?? 0) - listWidget.domNode.getBoundingClientRect().top)),
		};
		measurements.dataset.metrics = JSON.stringify(metrics);
		measurements.textContent = `${metrics.canceled ? 'Stopped' : metrics.complete ? 'Completed' : 'Streaming'} | Extra collapse padding: ${metrics.extraPadding}px | Header: ${metrics.headerTop === null ? 'offscreen' : `${metrics.headerTop}px`} | Viewport: ${metrics.viewportHeight}px`;
	};
	let step = 0;
	const updateControls: (() => void)[] = [];
	const addControl = (label: string, action: () => void, enabled = () => true) => {
		const button = disposableStore.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		button.element.style.width = 'auto';
		updateControls.push(() => button.enabled = enabled());
		disposableStore.add(button.onDidClick(async () => {
			action();
			await settle();
			measure();
			measurements.dataset.step = String(++step);
		}));
	};
	disposableStore.add(listWidget.onDidScroll(measure));
	disposableStore.add(listWidget.onDidChangeContentHeight(measure));
	disposableStore.add(viewModel.onDidChange(() => updateControls.forEach(update => update())));
	if (completed) {
		addControl('Toggle Completed Steps', () => getHeader().click());
	} else {
		addControl(kind === 'thinking' ? 'Toggle Reasoning' : 'Toggle Tool Calls', () => {
			const button = getHeader().querySelector<HTMLElement>('.monaco-button');
			if (!button) {
				throw new Error('The tool-call disclosure did not render');
			}
			button.click();
		});
		addControl('Resume Response', () => model.acceptResponseProgress(request, {
			kind: 'markdownContent', content: new MarkdownString('The next response follows the collapsed tools.'),
		}), () => !response.isComplete);
		addControl('Complete Response', () => response.complete(), () => !response.isComplete);
		addControl('Stop Response', () => response.cancel(), () => !response.isComplete);
	}
	updateControls.forEach(update => update());
	addControl('Scroll to Bottom', () => listWidget.scrollToEnd());
	listWidget.scrollToEnd();
	if (completed) {
		getHeader().click();
	}
	listWidget.layout(480, 720);
	listWidget.scrollTop += getHeader().getBoundingClientRect().top - listWidget.domNode.getBoundingClientRect().top - (offscreen ? -600 : 16);
	measure();
	measurements.dataset.step = '0';
}

async function renderReasoningExpansion(context: ComponentFixtureContext): Promise<void> {
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		width: 720,
		height: 480,
		listHeight: 480,
		inputVisible: false,
		stickyScroll: true,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Compact,
		collapseCompletedResponses: false,
		messages: [{
			user: 'Investigate the renderer',
			assistant: [{ kind: 'markdown', text: Array.from({ length: 16 }, (_, index) => `Earlier result ${index + 1}.`).join('\n\n') }],
		}, {
			user: 'Keep investigating please',
			responseComplete: false,
			assistant: [
				{ kind: 'tool', toolId: 'read_file', displayName: 'Read file', invocationMessage: 'Reviewed the chat renderer and ran git commands', complete: true },
				{ kind: 'markdown', text: 'The code history points to two separate changes. Check the earlier results and the rendering fixtures before making changes.' },
				{ kind: 'tool', toolId: 'skill', displayName: 'Read skill', invocationMessage: 'Read the component fixtures guide', complete: true },
				{ kind: 'thinking', text: '**Exploring session components**\n\nInspect the component explorer to find the session and available fixtures.\n\nCompare the collapsed and expanded reasoning while keeping the surrounding content stationary.' },
				{ kind: 'tool', toolId: 'mcp_sessions', displayName: 'Sessions', invocationMessage: 'List component explorer sessions', complete: true },
				{ kind: 'tool', toolId: 'mcp_list_fixtures', displayName: 'List fixtures', invocationMessage: 'List component fixtures', complete: true },
			],
		}],
		onRendered: rendered => handle = rendered,
	});
	if (!handle) {
		throw new Error('The reasoning expansion fixture did not initialize');
	}
	handle.listWidget.scrollToEnd();
}

export default defineThemedFixtureGroup({ path: 'chat/scrollAnchoring/' }, {
	StreamingVisibleHeader: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, false) }),
	StreamingOffscreenHeader: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, true) }),
	CompletedVisibleHeader: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, true, false) }),
	CompletedOffscreenHeader: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, true, true) }),
	ReasoningExpansion: defineComponentFixture({ virtualTime: { enabled: false }, render: renderReasoningExpansion }),
	StreamingReasoningHeader: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, false, 'thinking') }),
});
