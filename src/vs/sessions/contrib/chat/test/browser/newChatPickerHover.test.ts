/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { setupNewChatPickerHover } from '../../browser/newChatPickerHover.js';

class TestPickerHoverService extends HoverService {
	readonly shown: { content: IHoverOptions['content']; focus: boolean | undefined; compact: boolean | undefined; skipFadeInAnimation: boolean | undefined }[] = [];

	override showInstantHover(options: IHoverOptions, focus?: boolean): IHoverWidget | undefined {
		this.shown.push({
			content: options.content,
			focus,
			compact: options.appearance?.compact,
			skipFadeInAnimation: options.appearance?.skipFadeInAnimation,
		});
		return undefined;
	}
}

suite('New chat picker hover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let hoverService: TestPickerHoverService;
	let target: HTMLElement;

	setup(() => {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ 'workbench.hover.delay': 1000 });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
		}());
		instantiation.stub(IKeybindingService, new class extends mock<IKeybindingService>() { }());
		instantiation.stub(ILayoutService, new class extends mock<ILayoutService>() { }());
		instantiation.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() { }());
		hoverService = store.add(instantiation.createInstance(TestPickerHoverService));
		target = document.createElement('button');
		document.body.appendChild(target);
		store.add(toDisposable(() => target.remove()));
	});

	for (const input of ['mouse', 'keyboard'] as const) {
		test(`shows immediately on ${input} navigation without moving focus`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			store.add(setupNewChatPickerHover(hoverService, target, 'Choose a workspace'));
			const focused = document.activeElement;
			target.dispatchEvent(input === 'mouse'
				? new MouseEvent('mouseover', { bubbles: true })
				: new FocusEvent('focus', { relatedTarget: document.body }));
			await timeout(0);

			assert.deepStrictEqual({
				shown: hoverService.shown,
				focusPreserved: document.activeElement === focused,
			}, {
				shown: [{ content: 'Choose a workspace', focus: false, compact: true, skipFadeInAnimation: true }],
				focusPreserved: true,
			});
		}));
	}

	test('evaluates dynamic content and supports explicit keyboard hover access', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let content = 'Base branch';
		store.add(setupNewChatPickerHover(hoverService, target, () => content));
		content = 'Base branch, 2 uncommitted files';
		hoverService.showManagedHover(target);
		await timeout(0);

		assert.deepStrictEqual(hoverService.shown, [{
			content: 'Base branch, 2 uncommitted files', focus: true, compact: true, skipFadeInAnimation: true,
		}]);
	}));

	test('disposal cancels a pending hover', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const hover = store.add(setupNewChatPickerHover(hoverService, target, 'Choose a workspace'));
		target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		hover.dispose();
		await timeout(0);
		target.dispatchEvent(new FocusEvent('focus', { relatedTarget: document.body }));
		await timeout(0);

		assert.deepStrictEqual(hoverService.shown, []);
	}));
});
