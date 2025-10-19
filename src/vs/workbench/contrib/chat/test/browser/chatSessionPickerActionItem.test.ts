/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatSessionPickerActionItem } from '../../browser/chatSessions/chatSessionPickerActionItem.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IAction } from '../../../../../base/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';

suite('ChatSessionPickerActionItem', () => {

	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createTestOptionGroup(id: string, hidden?: boolean, locked?: boolean): IChatSessionProviderOptionGroup {
		return {
			id,
			name: `Test Group ${id}`,
			description: 'Test Description',
			items: [
				{ id: 'item1', name: 'Item 1' },
				{ id: 'item2', name: 'Item 2' }
			],
			hidden,
			locked
		};
	}

	test('should create picker with unlocked state by default', () => {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
		}, store);

		const optionGroup = createTestOptionGroup('test');
		const item = optionGroup.items[0];
		const onDidChangeOption = new Emitter<IChatSessionProviderOptionItem>();
		store.add(onDidChangeOption);

		const action: IAction = {
			id: 'test.action',
			label: 'Test Action',
			tooltip: '',
			class: undefined,
			enabled: true,
			run: async () => { }
		};

		const delegate = {
			getCurrentOption: () => item,
			onDidChangeOption: onDidChangeOption.event,
			setOption: (option: IChatSessionProviderOptionItem) => { },
			getAllOptions: () => optionGroup.items
		};

		const widget = store.add(instaService.createInstance(
			ChatSessionPickerActionItem,
			action,
			{ group: optionGroup, item },
			delegate
		));

		assert.strictEqual(widget.currentOption, item);
	});

	test('should create picker with locked state when group is locked', () => {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
		}, store);

		const optionGroup = createTestOptionGroup('test', false, true);
		const item = optionGroup.items[0];
		const onDidChangeOption = new Emitter<IChatSessionProviderOptionItem>();
		store.add(onDidChangeOption);

		const action: IAction = {
			id: 'test.action',
			label: 'Test Action',
			tooltip: '',
			class: undefined,
			enabled: true,
			run: async () => { }
		};

		const delegate = {
			getCurrentOption: () => item,
			onDidChangeOption: onDidChangeOption.event,
			setOption: (option: IChatSessionProviderOptionItem) => { },
			getAllOptions: () => optionGroup.items
		};

		const widget = store.add(instaService.createInstance(
			ChatSessionPickerActionItem,
			action,
			{ group: optionGroup, item },
			delegate
		));

		assert.strictEqual(widget.currentOption, item);
		// Locked pickers should have the action disabled
		assert.strictEqual((widget as any).action?.enabled, false);
	});

	test('should update current option when option changes', () => {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
		}, store);

		const optionGroup = createTestOptionGroup('test');
		const item1 = optionGroup.items[0];
		const item2 = optionGroup.items[1];
		const onDidChangeOption = new Emitter<IChatSessionProviderOptionItem>();
		store.add(onDidChangeOption);

		const action: IAction = {
			id: 'test.action',
			label: 'Test Action',
			tooltip: '',
			class: undefined,
			enabled: true,
			run: async () => { }
		};

		const delegate = {
			getCurrentOption: () => item1,
			onDidChangeOption: onDidChangeOption.event,
			setOption: (option: IChatSessionProviderOptionItem) => { },
			getAllOptions: () => optionGroup.items
		};

		const widget = store.add(instaService.createInstance(
			ChatSessionPickerActionItem,
			action,
			{ group: optionGroup, item: item1 },
			delegate
		));

		assert.strictEqual(widget.currentOption, item1);

		// Change the option
		onDidChangeOption.fire(item2);

		assert.strictEqual(widget.currentOption, item2);
	});
});
