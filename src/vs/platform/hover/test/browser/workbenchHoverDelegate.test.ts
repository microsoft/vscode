/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkbenchHoverDelegate } from '../../browser/hover.js';
import { NullHoverService } from './nullHoverService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { Emitter } from '../../../../base/common/event.js';
import { IQuickInputService } from '../../../quickinput/common/quickInput.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('WorkbenchHoverDelegate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should suppress hover when QuickInput is visible', () => {
		const onShowEmitter = new Emitter<void>();
		const onHideEmitter = new Emitter<void>();

		const mockQuickInputService: IQuickInputService = {
			onShow: onShowEmitter.event,
			onHide: onHideEmitter.event,
		} as any;

		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IQuickInputService, mockQuickInputService);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('workbench', { hover: { delay: 500 } });

		const delegate = store.add(new WorkbenchHoverDelegate(
			'element',
			undefined,
			{},
			configService,
			NullHoverService,
			mockQuickInputService
		));

		// Initially, hover should work (return something)
		const result1 = delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(result1, undefined, 'Initially hover returns undefined from NullHoverService');

		// Trigger QuickInput show
		onShowEmitter.fire();

		// Now hover should be suppressed (return undefined immediately)
		const result2 = delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(result2, undefined, 'Hover should be suppressed when QuickInput is visible');

		// Trigger QuickInput hide
		onHideEmitter.fire();

		// Hover should work again
		const result3 = delegate.showHover({
			content: 'test',
			target: document.createElement('div')
		});
		assert.strictEqual(result3, undefined, 'After QuickInput is hidden, hover returns undefined from NullHoverService');

		onShowEmitter.dispose();
		onHideEmitter.dispose();
	});
});
