/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { h } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { MarshalledId } from '../../../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ChatViewTitleControl } from '../../../../browser/widgetHosts/viewPane/chatViewTitleControl.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
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

	function createInstantiationService(displayName?: string): TestInstantiationService {
		const instantiationService = disposables.add(new TestInstantiationService());
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
