/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { TestLayoutService } from '../../../../platform/layout/browser/test/testLayoutService.js';
import { AccessibilityService } from '../accessibilityService.js';
import { IAccessibilityService } from '../../common/accessibility.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../platform/contextkey/test/common/mockContextKeyService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

suite('AccessibilityService', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let layoutService: TestLayoutService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		layoutService = new TestLayoutService();

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILayoutService, layoutService);
		instantiationService.stub(IContextKeyService, MockContextKeyService);
	});

	teardown(() => {
		disposables.dispose();
	});

	test('enhanced focus configuration and class toggle', () => {
		configurationService.setUserConfiguration('accessibility.enhancedFocus', true);
		const service = disposables.add(instantiationService.createInstance(AccessibilityService));
		
		assert.strictEqual(layoutService.mainContainer.classList.contains('enhanced-focus'), true);

		let eventFired = false;
		disposables.add(service.onDidChangeEnhancedFocus(() => {
			eventFired = true;
		}));

		configurationService.setUserConfiguration('accessibility.enhancedFocus', false);
		assert.strictEqual(layoutService.mainContainer.classList.contains('enhanced-focus'), false);
		assert.strictEqual(eventFired, true);
	});
});
