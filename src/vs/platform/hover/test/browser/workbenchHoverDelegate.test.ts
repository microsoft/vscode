/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkbenchHoverDelegate } from '../../browser/hover.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter } from '../../../../base/common/event.js';
import { IQuickInputService } from '../../../quickinput/common/quickInput.js';
import { IHoverService } from '../../browser/hover.js';

suite('WorkbenchHoverDelegate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should suppress hover when QuickInput is visible', () => {
		const onShowEmitter = new Emitter<void>();
		const onHideEmitter = new Emitter<void>();

		const mockQuickInputService: IQuickInputService = {
			onShow: onShowEmitter.event,
			onHide: onHideEmitter.event,
		} as any;

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('workbench', { hover: { delay: 500 } });

		// Track calls to showInstantHover to verify suppression behavior
		let hoverCallCount = 0;
		const mockHoverService: IHoverService = {
			showInstantHover: () => {
				hoverCallCount++;
				return undefined;
			},
			hideHover: () => { },
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			setupManagedHover: () => ({
				dispose: () => { },
				show: () => { },
				hide: () => { },
				update: () => { }
			}),
			showAndFocusLastHover: () => { },
			showManagedHover: () => { }
		} as any;

		const delegate = store.add(new WorkbenchHoverDelegate(
			'element',
			undefined,
			{},
			configService,
			mockHoverService,
			mockQuickInputService
		));

		// Initially, hover processing should occur
		hoverCallCount = 0;
		delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(hoverCallCount, 1, 'Hover service should be called initially');

		// Trigger QuickInput show
		onShowEmitter.fire();

		// Now hover should be suppressed (showInstantHover not called)
		hoverCallCount = 0;
		const result = delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(result, undefined, 'showHover should return undefined when suppressed');
		assert.strictEqual(hoverCallCount, 0, 'Hover service should not be called when QuickInput is visible');

		// Trigger QuickInput hide
		onHideEmitter.fire();

		// Hover processing should work again
		hoverCallCount = 0;
		delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(hoverCallCount, 1, 'Hover service should be called after QuickInput is hidden');

		onShowEmitter.dispose();
		onHideEmitter.dispose();
	});
});
