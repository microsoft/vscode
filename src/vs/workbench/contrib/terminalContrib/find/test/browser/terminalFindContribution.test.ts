/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IFocusTracker } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalWidgetManager } from '../../../../terminal/browser/widgets/widgetManager.js';
import { ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { TerminalFindContribution } from '../../browser/terminal.find.contribution.js';
import { TerminalFindWidget } from '../../browser/terminalFindWidget.js';

suite('TerminalFindContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture() {
		const instantiationService = store.add(new TestInstantiationService());
		const focus = store.add(new Emitter<void>());
		const blur = store.add(new Emitter<void>());
		const focusTracker = store.add(new class extends Disposable implements IFocusTracker {
			readonly onDidFocus = focus.event;
			readonly onDidBlur = blur.event;
			refreshState(): void { }
		}());
		let widgetDisposed = false;
		instantiationService.stubInstance(TerminalFindWidget, {
			focusTracker,
			getDomNode: () => document.createElement('div'),
			dispose: () => { widgetDisposed = true; },
		});
		let forced = 0;
		let reset = 0;
		let activated = 0;
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly instanceId = 1;
			override readonly domElement = document.createElement('div');
			override forceScrollbarVisibility(): void { forced++; }
			override resetScrollbarVisibility(): void { reset++; }
		}();
		instantiationService.stub(ITerminalService, {
			setActiveInstance: activeInstance => {
				assert.strictEqual(activeInstance, instance);
				activated++;
			},
		});
		const contribution = store.add(instantiationService.createInstance(TerminalFindContribution, {
			instance,
			processManager: new class extends mock<ITerminalProcessManager>() { }(),
			widgetManager: new class extends mock<TerminalWidgetManager>() { }(),
		}));
		return {
			contribution, instance, focus, blur,
			get state() { return { forced, reset, activated, widgetDisposed }; },
		};
	}

	test('disposes focus subscriptions with the contribution', () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.contribution.findWidget, fixture.contribution.findWidget);
		fixture.focus.fire();
		assert.strictEqual(TerminalFindContribution.activeFindWidget, fixture.contribution);
		fixture.blur.fire();
		assert.strictEqual(TerminalFindContribution.activeFindWidget, undefined);
		fixture.focus.fire();

		fixture.contribution.dispose();
		fixture.focus.fire();
		fixture.blur.fire();

		assert.deepStrictEqual({
			...fixture.state,
			focusListener: fixture.focus.hasListeners(),
			blurListener: fixture.blur.hasListeners(),
			activeFindWidget: TerminalFindContribution.activeFindWidget,
		}, {
			forced: 2,
			reset: 1,
			activated: 2,
			widgetDisposed: true,
			focusListener: false,
			blurListener: false,
			activeFindWidget: undefined,
		});
	});

	test('does not create the widget when disposing an unused contribution', () => {
		const fixture = createFixture();
		fixture.contribution.dispose();
		assert.deepStrictEqual({
			...fixture.state,
			children: fixture.instance.domElement.childElementCount,
			focusListener: fixture.focus.hasListeners(),
			blurListener: fixture.blur.hasListeners(),
		}, {
			forced: 0,
			reset: 0,
			activated: 0,
			widgetDisposed: false,
			children: 0,
			focusListener: false,
			blurListener: false,
		});
	});
});
