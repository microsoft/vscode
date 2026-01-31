/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ChatTipService } from '../../browser/chatTipService.js';

class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
	override contextMatchesRules(): boolean {
		return true;
	}
}

suite('ChatTipService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let contextKeyService: MockContextKeyServiceWithRulesMatching;
	let configurationService: TestConfigurationService;

	function createProductService(hasCopilot: boolean): IProductService {
		return {
			_serviceBrand: undefined,
			defaultChatAgent: hasCopilot ? { chatExtensionId: 'github.copilot-chat' } : undefined,
		} as IProductService;
	}

	function createService(hasCopilot: boolean = true, tipsEnabled: boolean = true): ChatTipService {
		instantiationService.stub(IProductService, createProductService(hasCopilot));
		configurationService.setUserConfiguration('chat.tips.enabled', tipsEnabled);
		return instantiationService.createInstance(ChatTipService);
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		contextKeyService = new MockContextKeyServiceWithRulesMatching();
		configurationService = new TestConfigurationService();
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IConfigurationService, configurationService);
	});

	test('returns a tip for new requests with timestamp after service creation', () => {
		const service = createService();
		const now = Date.now();

		// Request created after service initialization
		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip, 'Should return a tip for requests created after service instantiation');
		assert.ok(tip.id.startsWith('tip.'), 'Tip should have a valid ID');
		assert.ok(tip.content.value.length > 0, 'Tip should have content');
	});

	test('returns undefined for old requests with timestamp before service creation', () => {
		const service = createService();
		const now = Date.now();

		// Request created before service initialization (simulating restored chat)
		const tip = service.getNextTip('old-request', now - 10000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip for requests created before service instantiation');
	});

	test('only shows one tip per session', () => {
		const service = createService();
		const now = Date.now();

		// First request gets a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1, 'First request should get a tip');

		// Second request does not get a tip
		const tip2 = service.getNextTip('request-2', now + 2000, contextKeyService);
		assert.strictEqual(tip2, undefined, 'Second request should not get a tip');
	});

	test('returns same tip on rerender of same request', () => {
		const service = createService();
		const now = Date.now();

		// First call gets a tip
		const tip1 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip1);

		// Same request ID gets the same tip on rerender
		const tip2 = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.ok(tip2);
		assert.strictEqual(tip1.id, tip2.id, 'Should return same tip for stable rerender');
		assert.strictEqual(tip1.content.value, tip2.content.value);
	});

	test('returns undefined when Copilot is not enabled', () => {
		const service = createService(/* hasCopilot */ false);
		const now = Date.now();

		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip when Copilot is not enabled');
	});

	test('returns undefined when tips setting is disabled', () => {
		const service = createService(/* hasCopilot */ true, /* tipsEnabled */ false);
		const now = Date.now();

		const tip = service.getNextTip('request-1', now + 1000, contextKeyService);
		assert.strictEqual(tip, undefined, 'Should not return a tip when tips setting is disabled');
	});

	test('old requests do not consume the session tip allowance', () => {
		const service = createService();
		const now = Date.now();

		// Old request should not consume the tip allowance
		const oldTip = service.getNextTip('old-request', now - 10000, contextKeyService);
		assert.strictEqual(oldTip, undefined);

		// New request should still be able to get a tip
		const newTip = service.getNextTip('new-request', now + 1000, contextKeyService);
		assert.ok(newTip, 'New request should get a tip after old request was skipped');
	});

	test('multiple old requests do not affect new request tip', () => {
		const service = createService();
		const now = Date.now();

		// Simulate multiple restored requests being rendered
		service.getNextTip('old-1', now - 30000, contextKeyService);
		service.getNextTip('old-2', now - 20000, contextKeyService);
		service.getNextTip('old-3', now - 10000, contextKeyService);

		// New request should still get a tip
		const tip = service.getNextTip('new-request', now + 1000, contextKeyService);
		assert.ok(tip, 'New request should get a tip after multiple old requests');
	});
});
