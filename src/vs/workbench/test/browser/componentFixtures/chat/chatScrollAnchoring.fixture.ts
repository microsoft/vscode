/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatProgressAnimation, ChatProgressVerbosity } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from './chatWidget.fixture.js';

async function waitForListToSettle(container: HTMLElement, listWidget: IChatWidgetFixtureHandle['listWidget'], waitForIdle = false): Promise<void> {
	const targetWindow = dom.getWindow(container);
	await targetWindow.document.fonts.ready;
	let previousLayout: string | undefined;
	let stableFrames = 0;
	for (let frame = 0; frame < 120; frame++) {
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
		const layout = JSON.stringify([listWidget.contentHeight, listWidget.scrollHeight, listWidget.scrollTop, listWidget.renderHeight]);
		const animating = container.getAnimations({ subtree: true }).some(animation =>
			(animation.playState === 'running' || animation.pending) && animation.effect?.getComputedTiming().endTime !== Infinity);
		const scrollbarWillHide = waitForIdle && !listWidget.domNode.matches(':hover') && listWidget.domNode.querySelector('.scrollbar.visible');
		stableFrames = layout === previousLayout && !animating && !scrollbarWillHide ? stableFrames + 1 : 0;
		previousLayout = layout;
		if (stableFrames >= 3) {
			return;
		}
	}
	throw new Error(`The scroll anchoring fixture did not settle: ${previousLayout}`);
}

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
		thinkingPhrases: ['Working'],
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
	const settle = () => waitForListToSettle(preview, listWidget);
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
	await settle();
	listWidget.layout(listWidget.domNode.clientHeight, 720);
	listWidget.scrollToEnd();
	await settle();
	if (completed) {
		getHeader().click();
		await settle();
	}
	const viewportTop = listWidget.domNode.getBoundingClientRect().top;
	const stickyBottom = listWidget.stickyScrollDomNode?.getBoundingClientRect().bottom ?? viewportTop;
	const headerOffset = offscreen ? -600 : Math.max(0, stickyBottom - viewportTop) + 16;
	listWidget.scrollTop += getHeader().getBoundingClientRect().top - viewportTop - headerOffset;
	await waitForListToSettle(preview, listWidget, true);
	const viewport = listWidget.domNode.getBoundingClientRect();
	const header = getHeader().getBoundingClientRect();
	const visibleTop = Math.max(viewport.top, listWidget.stickyScrollDomNode?.getBoundingClientRect().bottom ?? viewport.top);
	const positioned = offscreen ? header.bottom < viewport.top : header.top >= visibleTop && header.bottom <= viewport.bottom;
	if (!positioned) {
		throw new Error(`The scroll anchoring header did not become ${offscreen ? 'offscreen' : 'fully visible'}`);
	}
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
		thinkingPhrases: ['Working'],
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
	await waitForListToSettle(context.container, handle.listWidget);
	handle.listWidget.layout(handle.listWidget.domNode.clientHeight, 720);
	handle.listWidget.scrollToEnd();
	await waitForListToSettle(context.container, handle.listWidget, true);
}

async function renderBottomProgress(context: ComponentFixtureContext): Promise<void> {
	const { container, disposableStore } = context;
	container.style.width = '500px';
	const controls = dom.append(container, dom.$('div', { role: 'group', 'aria-label': 'Bottom progress scenario controls' }));
	controls.style.display = 'flex';
	controls.style.gap = 'var(--vscode-spacing-size80)';
	const measurements = dom.append(container, dom.$('div.bottom-progress-measurements'));
	measurements.textContent = 'Progress movement: 0px';
	const preview = dom.append(container, dom.$('div'));
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: preview }, {
		width: 500, height: 420, listHeight: 420, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		thinkingPhrases: ['Evaluating'],
		collapseCompletedResponses: false,
		messages: [{
			user: 'Review the earlier results',
			assistant: [{ kind: 'markdown', text: Array.from({ length: 20 }, (_, index) => `Earlier paragraph ${index}.`).join('\n\n') }],
		}, {
			user: 'Continue the response',
			responseComplete: false,
			assistant: [{ kind: 'markdown', text: 'Starting response.' }],
		}],
		onRendered: rendered => handle = rendered,
	});
	if (!handle) {
		throw new Error('The bottom progress fixture did not initialize');
	}
	const { model, listWidget } = handle;
	const request = model.getRequests().at(-1);
	if (!request) {
		throw new Error('The bottom progress fixture requires a request');
	}
	const measure = () => {
		const progress = preview.querySelector<HTMLElement>('.chat-working-progress');
		const label = progress?.querySelector<HTMLElement>('.progress-step');
		const icon = progress?.querySelector<HTMLElement>('.chat-progress-icon');
		if (!progress || !label || !icon) {
			throw new Error('The bottom progress row did not render');
		}
		return {
			top: progress.getBoundingClientRect().top,
			label: label.getBoundingClientRect().top,
			icon: icon.getBoundingClientRect().top,
			scrollTop: listWidget.scrollTop,
			atBottom: listWidget.isScrolledToBottom,
		};
	};
	let paragraph = 0;
	for (const { label, run } of [{
		label: 'Stream Paragraphs',
		run: async () => {
			const samples = [measure()];
			for (let step = 0; step < 8; step++) {
				const text = `Streamed paragraph ${++paragraph}.`;
				model.acceptResponseProgress(request, {
					kind: 'markdownContent', content: new MarkdownString(`\n\n${text}\n\n`),
				});
				await waitForFixtureCondition(() => preview.textContent?.includes(text) === true, 'The streamed paragraph did not render');
				await waitForListToSettle(preview, listWidget);
				samples.push(measure());
			}
			measurements.dataset.samples = JSON.stringify(samples);
			measurements.textContent = `Progress movement: ${Math.max(...samples.map(sample => sample.top)) - Math.min(...samples.map(sample => sample.top))}px`;
		},
	}, {
		label: 'Scroll Up',
		run: async () => { listWidget.scrollTop -= 100; },
	}, {
		label: 'Scroll to Bottom',
		run: async () => { listWidget.scrollToEnd(); },
	}]) {
		const button = disposableStore.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		disposableStore.add(button.onDidClick(async () => {
			button.enabled = false;
			try {
				await run();
			} finally {
				button.enabled = true;
			}
		}));
	}
	await waitForListToSettle(preview, listWidget);
	listWidget.scrollToEnd();
	await waitForListToSettle(preview, listWidget, true);
	measurements.dataset.initial = JSON.stringify(measure());
}

export default defineThemedFixtureGroup({ path: 'chat/scrollAnchoring/' }, {
	BottomProgress: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: renderBottomProgress }),
	StreamingVisibleHeader: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, false) }),
	StreamingOffscreenHeader: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, true) }),
	CompletedVisibleHeader: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, true, false) }),
	CompletedOffscreenHeader: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, true, true) }),
	ReasoningExpansion: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: renderReasoningExpansion }),
	StreamingReasoningHeader: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: context => renderScrollAnchoring(context, false, false, 'thinking') }),
});
