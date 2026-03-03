/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatTipStorageKeys } from '../../browser/chatTipStorageKeys.js';
import { ITipDefinition } from '../../browser/chatTipCatalog.js';
import { IChatTipService } from '../../browser/chatTipService.js';
import { YoloModeTipContribution } from '../../browser/chatYoloModeTip.js';
import { ThinkingPhrasesTipContribution } from '../../browser/chatThinkingPhrasesTip.js';

function fireConfigChange(configurationService: TestConfigurationService, key: string): void {
	configurationService.onDidChangeConfigurationEmitter.fire({
		affectsConfiguration: (k: string) => k === key,
		affectedKeys: new Set([key]),
		change: null!,
		source: ConfigurationTarget.USER,
	} satisfies IConfigurationChangeEvent);
}

suite('YoloModeTipContribution', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let storageService: InMemoryStorageService;
	let registeredTips: Map<string, IDisposable>;

	function createMockTipService(): IChatTipService {
		registeredTips = new Map();
		return {
			_serviceBrand: undefined,
			registerTip(tip: ITipDefinition): IDisposable {
				const disposable = {
					dispose: () => { registeredTips.delete(tip.id); },
				};
				registeredTips.set(tip.id, disposable);
				return disposable;
			},
		} as IChatTipService;
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		storageService = testDisposables.add(new InMemoryStorageService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IChatTipService, createMockTipService());
	});

	test('registers the tip when auto-approve was never enabled', () => {
		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));

		assert.ok(registeredTips.has('tip.yoloMode'), 'tip.yoloMode should be registered');
	});

	test('does not register the tip when auto-approve is currently enabled', () => {
		configurationService.setUserConfiguration(ChatConfiguration.GlobalAutoApprove, true);

		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));

		assert.ok(!registeredTips.has('tip.yoloMode'), 'tip.yoloMode should not be registered when auto-approve is enabled');
		assert.strictEqual(
			storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false),
			true,
			'Should persist yoloModeEverEnabled when auto-approve is currently on',
		);
	});

	test('does not register the tip when yoloModeEverEnabled storage flag is set', () => {
		storageService.store(ChatTipStorageKeys.YoloModeEverEnabled, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));

		assert.ok(!registeredTips.has('tip.yoloMode'), 'tip.yoloMode should not be registered when storage flag is set');
	});

	test('does not register the tip when policy restricts auto-approve', () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string, overrides?: Parameters<typeof configurationService.inspect>[1]) => {
			if (key === ChatConfiguration.GlobalAutoApprove) {
				return { ...originalInspect(key, overrides), policyValue: false } as T;
			}
			return originalInspect(key, overrides);
		};

		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));

		assert.ok(!registeredTips.has('tip.yoloMode'), 'tip.yoloMode should not be registered when policy blocks it');
		assert.strictEqual(
			storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false),
			true,
			'Should persist yoloModeEverEnabled when policy blocks it',
		);
	});

	test('unregisters the tip and persists storage flag when auto-approve is enabled', () => {
		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));
		assert.ok(registeredTips.has('tip.yoloMode'), 'tip should start registered');

		// Simulate enabling auto-approve
		configurationService.setUserConfiguration(ChatConfiguration.GlobalAutoApprove, true);
		fireConfigChange(configurationService, ChatConfiguration.GlobalAutoApprove);

		assert.ok(!registeredTips.has('tip.yoloMode'), 'tip should be unregistered after enabling auto-approve');
		assert.strictEqual(
			storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false),
			true,
			'Should persist the yoloModeEverEnabled flag',
		);
	});

	test('does not unregister on config change if auto-approve is still false', () => {
		testDisposables.add(instantiationService.createInstance(YoloModeTipContribution));
		assert.ok(registeredTips.has('tip.yoloMode'));

		fireConfigChange(configurationService, ChatConfiguration.GlobalAutoApprove);

		assert.ok(registeredTips.has('tip.yoloMode'), 'tip should remain registered when auto-approve stays false');
	});
});

suite('ThinkingPhrasesTipContribution', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let storageService: InMemoryStorageService;
	let registeredTips: Map<string, IDisposable>;

	function createMockTipService(): IChatTipService {
		registeredTips = new Map();
		return {
			_serviceBrand: undefined,
			registerTip(tip: ITipDefinition): IDisposable {
				const disposable = {
					dispose: () => { registeredTips.delete(tip.id); },
				};
				registeredTips.set(tip.id, disposable);
				return disposable;
			},
		} as IChatTipService;
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		storageService = testDisposables.add(new InMemoryStorageService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IChatTipService, createMockTipService());
	});

	test('registers the tip when the setting was never modified', () => {
		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));

		assert.ok(registeredTips.has('tip.thinkingPhrases'), 'tip.thinkingPhrases should be registered');
	});

	test('does not register the tip when thinkingPhrasesEverModified storage flag is set', () => {
		storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));

		assert.ok(!registeredTips.has('tip.thinkingPhrases'), 'tip should not be registered when storage flag is set');
	});

	test('does not register the tip when the setting has a user value', () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string, overrides?: Parameters<typeof configurationService.inspect>[1]) => {
			if (key === ChatConfiguration.ThinkingPhrases) {
				return { ...originalInspect(key, overrides), userValue: ['custom phrase'] } as T;
			}
			return originalInspect(key, overrides);
		};

		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));

		assert.ok(!registeredTips.has('tip.thinkingPhrases'), 'tip should not be registered when setting has user value');
	});

	test('does not register the tip when the setting has a workspace value', () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string, overrides?: Parameters<typeof configurationService.inspect>[1]) => {
			if (key === ChatConfiguration.ThinkingPhrases) {
				return { ...originalInspect(key, overrides), workspaceValue: 'compact' } as T;
			}
			return originalInspect(key, overrides);
		};

		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));

		assert.ok(!registeredTips.has('tip.thinkingPhrases'), 'tip should not be registered when setting has workspace value');
	});

	test('unregisters the tip and persists storage flag when setting is modified', () => {
		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));
		assert.ok(registeredTips.has('tip.thinkingPhrases'), 'tip should start registered');

		fireConfigChange(configurationService, ChatConfiguration.ThinkingPhrases);

		assert.ok(!registeredTips.has('tip.thinkingPhrases'), 'tip should be unregistered after setting is modified');
		assert.strictEqual(
			storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, StorageScope.APPLICATION, false),
			true,
			'Should persist the thinkingPhrasesEverModified flag',
		);
	});

	test('does not unregister when an unrelated config change fires', () => {
		testDisposables.add(instantiationService.createInstance(ThinkingPhrasesTipContribution));
		assert.ok(registeredTips.has('tip.thinkingPhrases'));

		fireConfigChange(configurationService, 'some.other.setting');

		assert.ok(registeredTips.has('tip.thinkingPhrases'), 'tip should remain registered for unrelated config changes');
	});
});
