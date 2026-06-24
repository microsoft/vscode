/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { AccessibilityService } from '../../browser/accessibilityService.js';

suite('AccessibilityService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let configurationService: TestConfigurationService;
	let container: HTMLElement;

	function createService(config: Record<string, unknown> = {}): AccessibilityService {
		const instantiationService = store.add(new TestInstantiationService());

		configurationService = new TestConfigurationService({
			'editor.accessibilitySupport': 'off',
			'workbench.reduceMotion': 'off',
			'workbench.reduceTransparency': 'off',
			'accessibility.underlineLinks': false,
			...config,
		});
		instantiationService.stub(IConfigurationService, configurationService);

		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));

		container = document.createElement('div');
		instantiationService.stub(ILayoutService, {
			mainContainer: container,
			activeContainer: container,
			getContainer() { return container; },
			onDidLayoutContainer: Event.None,
		});

		return store.add(instantiationService.createInstance(AccessibilityService));
	}

	suite('isTransparencyReduced', () => {

		test('returns false when config is off', () => {
			const service = createService({ 'workbench.reduceTransparency': 'off' });
			assert.strictEqual(service.isTransparencyReduced(), false);
		});

		test('returns true when config is on', () => {
			const service = createService({ 'workbench.reduceTransparency': 'on' });
			assert.strictEqual(service.isTransparencyReduced(), true);
		});

		test('adds CSS class when config is on', () => {
			createService({ 'workbench.reduceTransparency': 'on' });
			assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), true);
		});

		test('does not add CSS class when config is off', () => {
			createService({ 'workbench.reduceTransparency': 'off' });
			assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), false);
		});

		test('fires event and updates class on config change', () => {
			const service = createService({ 'workbench.reduceTransparency': 'off' });
			assert.strictEqual(service.isTransparencyReduced(), false);

			let fired = false;
			store.add(service.onDidChangeReducedTransparency(() => { fired = true; }));

			// Simulate config change
			configurationService.setUserConfiguration('workbench.reduceTransparency', 'on');
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration(id: string) { return id === 'workbench.reduceTransparency'; },
			} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);

			assert.strictEqual(fired, true);
			assert.strictEqual(service.isTransparencyReduced(), true);
			assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), true);
		});
	});

	suite('isMotionReduced', () => {

		test('returns false when config is off', () => {
			const service = createService({ 'workbench.reduceMotion': 'off' });
			assert.strictEqual(service.isMotionReduced(), false);
		});

		test('returns true when config is on', () => {
			const service = createService({ 'workbench.reduceMotion': 'on' });
			assert.strictEqual(service.isMotionReduced(), true);
		});

		test('adds CSS classes when config is on', () => {
			createService({ 'workbench.reduceMotion': 'on' });
			assert.strictEqual(container.classList.contains('monaco-reduce-motion'), true);
			assert.strictEqual(container.classList.contains('monaco-enable-motion'), false);
		});

		test('adds CSS classes when config is off', () => {
			createService({ 'workbench.reduceMotion': 'off' });
			assert.strictEqual(container.classList.contains('monaco-reduce-motion'), false);
			assert.strictEqual(container.classList.contains('monaco-enable-motion'), true);
		});
	});
});
