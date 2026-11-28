/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { h } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { MarshalledId } from '../../../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ChatViewTitleControl } from '../../../../browser/widgetHosts/viewPane/chatViewTitleControl.js';
import { ChatConfiguration, ChatResponseStats } from '../../../../common/constants.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../common/model/chatModel.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../../common/chatSessionsService.js';

class TestResizeObserver implements ResizeObserver {
	static instance: TestResizeObserver | undefined;
	private observedTarget: Element | undefined;
	observedBox: ResizeObserverBoxOptions | undefined;

	constructor(private readonly callback: ResizeObserverCallback) {
		TestResizeObserver.instance = this;
	}

	observe(target: Element, options?: ResizeObserverOptions): void {
		this.observedTarget = target;
		this.observedBox = options?.box;
	}

	unobserve(): void { }
	disconnect(): void { }
	takeRecords(): ResizeObserverEntry[] { return []; }

	fire(height: number): void {
		assert.ok(this.observedTarget);
		const size: ResizeObserverSize = { inlineSize: 0, blockSize: height };
		this.callback([{
			target: this.observedTarget,
			contentRect: DOMRectReadOnly.fromRect({ height }),
			borderBoxSize: [size],
			contentBoxSize: [size],
			devicePixelContentBoxSize: [size],
		}], this);
	}
}

suite('ChatViewTitleControl', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstantiationService(displayName?: string, responseStats = ChatResponseStats.Off): TestInstantiationService {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ResponseStats]: responseStats }));
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getChatSessionContribution: () => displayName
				? upcastPartial<ResolvedChatSessionsExtensionPoint>({ displayName })
				: undefined,
		}));
		return instantiationService;
	}

	/**
	 * Renders the title label elements inside the ancestors that the title control's styles are scoped to,
	 * with the font of the workbench and the spacing token that those styles use.
	 */
	function renderTitleLabel() {
		const elements = h('div.chat-viewpane', [
			h('div.chat-view-title-container.visible', [
				h('div.chat-view-title-navigation-toolbar', [
					h('div.chat-view-title-action-item', [
						h('div.chat-view-title-label-container@labelContainer', [
							h('span.chat-view-title-harness@harness'),
							h('span.chat-view-title-separator@separator'),
							h('span.chat-view-title-label@title'),
						]),
					]),
				]),
			]),
		]);
		elements.harness.textContent = 'Copilot';
		elements.separator.textContent = '·';
		elements.title.textContent = 'Session title';
		elements.root.style.fontSize = '13px';
		elements.root.style.lineHeight = '1.4em';
		elements.root.style.setProperty('--vscode-spacing-size40', '4px');
		mainWindow.document.body.appendChild(elements.root);
		disposables.add(toDisposable(() => elements.root.remove()));
		return elements;
	}

	/**
	 * Returns the vertical position of the text baseline of the first line of the element.
	 */
	function getBaseline(element: HTMLElement): number {
		// An empty inline-block sits with its bottom edge on the baseline of its line
		const probe = mainWindow.document.createElement('span');
		probe.style.display = 'inline-block';
		element.prepend(probe);
		const baseline = probe.getBoundingClientRect().bottom;
		probe.remove();
		return baseline;
	}

	test('tracks height changes from ResizeObserver', () => {
		const container = document.createElement('div');
		const instantiationService = createInstantiationService();
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			container,
			{ focusChat: () => { }, getInputUri: () => undefined },
			TestResizeObserver
		));
		const resizeObserver = TestResizeObserver.instance;
		assert.ok(resizeObserver);
		const observedHeights: number[] = [];
		disposables.add(control.onDidChangeHeight(() => observedHeights.push(control.getHeight())));

		resizeObserver.fire(22);
		resizeObserver.fire(22);
		resizeObserver.fire(0);

		assert.deepStrictEqual({
			height: control.getHeight(),
			observedHeights,
			observedBox: resizeObserver.observedBox
		}, {
			height: 0,
			observedHeights: [22, 0],
			observedBox: 'border-box'
		});
	});

	test('forwards the originating input URI alongside the session in toolbar contexts', () => {
		const instantiationService = createInstantiationService();
		const toolbar = { context: undefined, dispose: () => { } };
		instantiationService.stubInstance(MenuWorkbenchToolBar, toolbar);
		const firstInput = URI.from({ scheme: Schemas.vscodeChatInput, path: '/first' });
		const secondInput = URI.from({ scheme: Schemas.vscodeChatInput, path: '/second' });
		let inputUri = firstInput;
		const control = disposables.add(instantiationService.createInstance(ChatViewTitleControl, document.createElement('div'), {
			focusChat: () => { },
			getInputUri: () => inputUri,
		}, TestResizeObserver));
		const sessionResource = URI.parse('agent-host-copilotcli:/untitled-session');
		const model = upcastPartial<IChatModel>({ sessionResource, title: 'Draft', onDidChange: Event.None });
		control.update(model);
		const firstContext = toolbar.context;
		inputUri = secondInput;
		control.update(model);
		assert.deepStrictEqual({ firstContext, secondContext: toolbar.context }, {
			firstContext: { $mid: MarshalledId.ChatViewContext, sessionResource, inputUri: firstInput },
			secondContext: { $mid: MarshalledId.ChatViewContext, sessionResource, inputUri: secondInput },
		});
	});

	test('resolves the harness label from the active session contribution', () => {
		const instantiationService = createInstantiationService('Copilot');
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			document.createElement('div'),
			{ focusChat: () => { }, getInputUri: () => undefined },
			TestResizeObserver
		));
		const model = upcastPartial<IChatModel>({
			sessionResource: URI.parse('agent-host-copilotcli:/untitled-session'),
			title: 'Session title',
			onDidChange: Event.None,
		});
		control.update(model);

		assert.strictEqual(Reflect.get(control, 'harnessLabel'), 'Copilot');
	});

	test('resolves the built-in Local harness label without a session contribution', () => {
		const instantiationService = createInstantiationService();
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			document.createElement('div'),
			{ focusChat: () => { }, getInputUri: () => undefined },
			TestResizeObserver
		));
		control.update(upcastPartial<IChatModel>({
			sessionResource: URI.parse('local:/untitled-session'),
			title: 'Local session',
			onDidChange: Event.None,
		}));

		assert.strictEqual(Reflect.get(control, 'harnessLabel'), 'Local');
	});

	test('shows the stats of the shown chat\'s running response ahead of the actions toolbar', () => {
		const instantiationService = createInstantiationService(undefined, ChatResponseStats.Title);
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const container = document.createElement('div');
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			container,
			{ focusChat: () => { }, getInputUri: () => undefined },
			TestResizeObserver
		));
		const stats = container.querySelector<HTMLElement>('.chat-live-response-stats');
		assert.ok(stats);
		const shown = () => stats.hidden ? undefined : stats.textContent;
		// Waiting for a confirmation keeps the time still.
		const response = upcastPartial<IChatResponseModel>({
			isIncomplete: constObservable(true),
			confirmationAdjustedTimestamp: constObservable(1000),
			isPendingConfirmation: constObservable({ startedWaitingAt: 84_000 }),
			usageObs: constObservable({ kind: 'usage', promptTokens: 900, completionTokens: 310, latestModelCall: { duration: 5000 } }),
		});
		const noChat = shown();
		control.update(upcastPartial<IChatModel>({
			sessionResource: URI.parse('local:/running'),
			title: 'Running',
			onDidChange: Event.None,
			lastRequestObs: constObservable(upcastPartial<IChatRequestModel>({ response })),
		}));
		const runningChat = shown();
		control.update(upcastPartial<IChatModel>({
			sessionResource: URI.parse('local:/idle'),
			title: 'Idle',
			onDidChange: Event.None,
			lastRequestObs: constObservable(undefined),
		}));

		assert.deepStrictEqual({
			noChat,
			runningChat,
			idleChat: shown(),
			aheadOfActions: stats.nextElementSibling?.classList.contains('chat-view-title-actions-toolbar'),
		}, {
			noChat: undefined,
			runningChat: '1m 23s \u00b7 62 tk/s',
			idleChat: undefined,
			aheadOfActions: true,
		});
	});

	test('lays out the running response stats right after the title, leaving the actions at the end', () => {
		const root = $('.chat-viewpane');
		root.style.width = '400px';
		// The harness and the stats are set smaller than the title, on a taller line.
		root.style.font = '11px/20px sans-serif';
		root.style.setProperty('--vscode-spacing-size40', '4px');
		const inner = append(append(root, $('.chat-view-title-container.visible')), $('.chat-view-title-inner'));
		// The navigation toolbar as its action bar renders the title.
		const navigationToolbar = append(inner, $('.chat-view-title-navigation-toolbar'));
		const actionItem = append(append(append(append(navigationToolbar, $('.monaco-toolbar')), $('.monaco-action-bar')), $('ul.actions-container')), $('li.action-item.chat-view-title-action-item'));
		const label = append(actionItem, $('a.action-label.chat-view-title-label-container'));
		const harness = append(label, $('span.chat-view-title-harness', undefined, 'Copilot'));
		append(label, $('span.chat-view-title-separator', undefined, '\u00b7'));
		const title = append(label, $('span.chat-view-title-label'));
		title.style.fontSize = '12px';
		const stats = append(inner, $('span.chat-live-response-stats', undefined, '1m 23s'));
		const actionsToolbar = append(inner, $('.chat-view-title-actions-toolbar', undefined, 'Actions'));
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const baseline = (element: HTMLElement) => {
			const probe = append(element, $('span', { style: 'display: inline-block; width: 0; height: 0;' }));
			const y = probe.getBoundingClientRect().bottom;
			probe.remove();
			return y;
		};
		const layout = (titleText: string) => {
			title.textContent = titleText;
			return {
				// Only the padding of the title's label separates them.
				statsFollowTitle: stats.hidden ? undefined : Math.abs(stats.getBoundingClientRect().left - title.getBoundingClientRect().right) < 16,
				titleTruncated: title.scrollWidth > title.clientWidth,
				actionsAtEnd: Math.round(inner.getBoundingClientRect().right - actionsToolbar.getBoundingClientRect().right) === 0,
			};
		};

		const shortTitle = layout('Short');
		const sharedBaseline = [harness, stats].every(element => Math.abs(baseline(element) - baseline(title)) < 0.25);
		// Only the title clips its overflow, so it keeps the room below its baseline that the tallest line has, while the label's content stays as tall.
		const height = (element: HTMLElement) => element.getBoundingClientRect().height;
		const excess = (value: number, limit: number) => Math.max(0, Math.round((value - limit) * 10) / 10);
		const labelStyle = mainWindow.getComputedStyle(label);
		const labelContentHeight = height(label) - parseFloat(labelStyle.paddingTop) - parseFloat(labelStyle.paddingBottom);
		const descenderRoom = { titleShorterThanHarnessBy: excess(height(harness), height(title)), labelTallerThanHarnessBy: excess(labelContentHeight, height(harness)) };
		const statsSeparator = mainWindow.getComputedStyle(stats, '::before').content;
		const longTitle = layout('A title that is much too long to fit next to the stats and the actions of the chat');
		stats.hidden = true;
		assert.deepStrictEqual({ shortTitle, sharedBaseline, descenderRoom, statsSeparator, longTitle, withoutStats: layout('Short') }, {
			shortTitle: { statsFollowTitle: true, titleTruncated: false, actionsAtEnd: true },
			sharedBaseline: true,
			descenderRoom: { titleShorterThanHarnessBy: 0, labelTallerThanHarnessBy: 0 },
			statsSeparator: '"\u00b7"',
			longTitle: { statsFollowTitle: true, titleTruncated: true, actionsAtEnd: true },
			withoutStats: { statsFollowTitle: undefined, titleTruncated: false, actionsAtEnd: true },
		});
	});

	test('keeps the harness visible while the session title owns truncation', () => {
		const { harness, title } = renderTitleLabel();

		const harnessStyle = mainWindow.getComputedStyle(harness);
		const titleStyle = mainWindow.getComputedStyle(title);
		assert.deepStrictEqual({
			harnessFlexShrink: harnessStyle.flexShrink,
			harnessOverflow: harnessStyle.overflow,
			harnessTextOverflow: harnessStyle.textOverflow,
			titleFlexShrink: titleStyle.flexShrink,
			titleOverflow: titleStyle.overflow,
			titleTextOverflow: titleStyle.textOverflow,
		}, {
			harnessFlexShrink: '0',
			harnessOverflow: 'visible',
			harnessTextOverflow: 'clip',
			titleFlexShrink: '1',
			titleOverflow: 'hidden',
			titleTextOverflow: 'ellipsis',
		});
	});

	test('aligns the harness, separator and session title on one text baseline', () => {
		const { root, harness, separator, title } = renderTitleLabel();
		const getBaselineOffsets = () => {
			const harnessBaseline = getBaseline(harness);
			const getOffset = (element: HTMLElement) => Math.round(Math.abs(getBaseline(element) - harnessBaseline) * 10) / 10;
			return { separator: getOffset(separator), title: getOffset(title) };
		};

		// The harness and separator inherit the line height of the workbench, the title sets its own
		const differentLineHeights = getBaselineOffsets();

		// With equal line heights, the title can still use a larger font size than the harness and separator
		root.style.lineHeight = '16px';
		title.style.fontSize = '16px';
		const differentFontSizes = getBaselineOffsets();

		assert.deepStrictEqual({ differentLineHeights, differentFontSizes }, {
			differentLineHeights: { separator: 0, title: 0 },
			differentFontSizes: { separator: 0, title: 0 },
		});
	});

	test('keeps room for descenders below the session title without growing the label', () => {
		const { labelContainer, harness, title } = renderTitleLabel();
		const getHeight = (element: HTMLElement) => element.getBoundingClientRect().height;
		const getExcess = (value: number, limit: number) => Math.max(0, Math.round((value - limit) * 10) / 10);

		// Only the title clips its overflow. When the label stretched its items, the title was as tall as the
		// harness, whose line is the tallest. It keeps that room below its baseline while the label stays as tall.
		assert.deepStrictEqual({
			titleShorterThanHarnessBy: getExcess(getHeight(harness), getHeight(title)),
			labelTallerThanHarnessBy: getExcess(getHeight(labelContainer), getHeight(harness)),
		}, {
			titleShorterThanHarnessBy: 0,
			labelTallerThanHarnessBy: 0,
		});
	});
});
