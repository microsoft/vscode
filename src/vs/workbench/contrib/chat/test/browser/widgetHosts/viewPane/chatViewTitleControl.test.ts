/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
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
		const root = mainWindow.document.createElement('div');
		root.className = 'chat-viewpane';
		const titleContainer = mainWindow.document.createElement('div');
		titleContainer.className = 'chat-view-title-container';
		const navigationToolbar = mainWindow.document.createElement('div');
		navigationToolbar.className = 'chat-view-title-navigation-toolbar';
		const actionItem = mainWindow.document.createElement('div');
		actionItem.className = 'chat-view-title-action-item';
		const labelContainer = mainWindow.document.createElement('div');
		labelContainer.className = 'chat-view-title-label-container';
		const harness = mainWindow.document.createElement('span');
		harness.className = 'chat-view-title-harness';
		const title = mainWindow.document.createElement('span');
		title.className = 'chat-view-title-label';
		labelContainer.append(harness, title);
		actionItem.appendChild(labelContainer);
		navigationToolbar.appendChild(actionItem);
		titleContainer.appendChild(navigationToolbar);
		root.appendChild(titleContainer);
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));

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
});
