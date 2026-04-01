/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { GlobalCompositeBar, isAccountsActionVisible, AccountsActivityActionViewItem } from '../../../browser/parts/globalCompositeBar.js';
import { TestStorageService } from '../../common/workbenchTestServices.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionService, NullExtensionService } from '../../../services/extensions/common/extensions.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

suite('GlobalCompositeBar', () => {

	const disposables = new DisposableStore();

	function createGlobalCompositeBar(options?: {
		chatInActivityBar?: boolean;
		accountsVisible?: boolean;
	}): {
		bar: GlobalCompositeBar;
		configService: TestConfigurationService;
		storageService: TestStorageService;
	} {
		const chatInActivityBar = options?.chatInActivityBar ?? false;
		const accountsVisible = options?.accountsVisible ?? true;

		const configService = new TestConfigurationService({
			'chat.showInActivityBar': chatInActivityBar,
			'workbench.sideBar.location': 'left',
		});

		const storageService = disposables.add(new TestStorageService());
		// Set accounts visibility preference
		storageService.store(
			AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
			accountsVisible,
			StorageScope.PROFILE,
			StorageTarget.USER
		);

		const extensionService: IExtensionService = {
			...new NullExtensionService(),
			whenInstalledExtensionsRegistered: () => Promise.resolve(true),
		} as unknown as IExtensionService;

		// Stub instantiation service — returns minimal action view items
		// so the ActionBar can push them without needing full DI
		const instantiationService = {
			createInstance: () => {
				const store = new DisposableStore();
				return store.add({
					action: { id: 'stub', label: '', tooltip: '', class: undefined, enabled: true, checked: false, run: () => Promise.resolve() },
					actionRunner: null as any,
					render: () => { },
					isEnabled: () => true,
					focus: () => { },
					blur: () => { },
					setActionContext: () => { },
					dispose: () => store.dispose(),
					showHover: () => { },
				});
			},
		} as unknown as IInstantiationService;

		const bar = disposables.add(new GlobalCompositeBar(
			() => [],
			() => ({
				activeBackgroundColor: undefined,
				inactiveBackgroundColor: undefined,
				activeBorderColor: undefined,
				activeBackground: undefined,
				activeBorderBottomColor: undefined,
				activeForegroundColor: undefined,
				inactiveForegroundColor: undefined,
				badgeBackground: undefined,
				badgeForeground: undefined,
				dragAndDropBorder: undefined,
			}),
			{ position: () => HoverPosition.RIGHT },
			configService,
			instantiationService,
			storageService,
			extensionService,
		));

		return { bar, configService, storageService };
	}

	function fireConfigChange(configService: TestConfigurationService, key: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (k: string) => k === key,
		} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
	}

	teardown(() => {
		disposables.clear();
	});

	// --- Initial state tests ---

	test('default state: only accounts and manage are shown', () => {
		const { bar } = createGlobalCompositeBar();
		assert.strictEqual(bar.size(), 2, 'should have accounts + manage');
	});

	test('default state with accounts hidden: only manage is shown', () => {
		const { bar } = createGlobalCompositeBar({ accountsVisible: false });
		assert.strictEqual(bar.size(), 1, 'should have manage only');
	});

	test('chat enabled: chat + accounts + manage are shown', () => {
		const { bar } = createGlobalCompositeBar({ chatInActivityBar: true });
		assert.strictEqual(bar.size(), 3, 'should have chat + accounts + manage');
	});

	test('chat enabled, accounts hidden: chat + manage are shown', () => {
		const { bar } = createGlobalCompositeBar({ chatInActivityBar: true, accountsVisible: false });
		assert.strictEqual(bar.size(), 2, 'should have chat + manage');
	});

	// --- Dynamic toggle: chat ---

	test('toggling chat.showInActivityBar adds the chat action', () => {
		const { bar, configService } = createGlobalCompositeBar();
		assert.strictEqual(bar.size(), 2, 'initially accounts + manage');

		configService.setUserConfiguration('chat.showInActivityBar', true);
		fireConfigChange(configService, 'chat.showInActivityBar');

		assert.strictEqual(bar.size(), 3, 'now chat + accounts + manage');
	});

	test('toggling chat.showInActivityBar off removes the chat action', () => {
		const { bar, configService } = createGlobalCompositeBar({ chatInActivityBar: true });
		assert.strictEqual(bar.size(), 3, 'initially chat + accounts + manage');

		configService.setUserConfiguration('chat.showInActivityBar', false);
		fireConfigChange(configService, 'chat.showInActivityBar');

		assert.strictEqual(bar.size(), 2, 'now accounts + manage');
	});

	test('toggling chat when already in desired state is a no-op', () => {
		const { bar, configService } = createGlobalCompositeBar({ chatInActivityBar: true });
		assert.strictEqual(bar.size(), 3);

		// Fire the config change again with same value — should not crash or change size
		fireConfigChange(configService, 'chat.showInActivityBar');

		assert.strictEqual(bar.size(), 3);
	});

	// --- Dynamic toggle: accounts with chat present ---

	test('toggling accounts visibility works when chat is shown', async () => {
		const { bar, storageService } = createGlobalCompositeBar({ chatInActivityBar: true });
		assert.strictEqual(bar.size(), 3, 'initially chat + accounts + manage');

		// Wait for async listener registration
		await Promise.resolve();

		// Hide accounts
		storageService.store(
			AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
			false,
			StorageScope.PROFILE,
			StorageTarget.USER
		);

		assert.strictEqual(bar.size(), 2, 'now chat + manage');

		// Show accounts again
		storageService.store(
			AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
			true,
			StorageScope.PROFILE,
			StorageTarget.USER
		);

		assert.strictEqual(bar.size(), 3, 'back to chat + accounts + manage');
	});

	test('toggling accounts visibility works when chat is hidden', async () => {
		const { bar, storageService } = createGlobalCompositeBar({ chatInActivityBar: false });
		assert.strictEqual(bar.size(), 2, 'initially accounts + manage');

		// Wait for async listener registration
		await Promise.resolve();

		// Hide accounts
		storageService.store(
			AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
			false,
			StorageScope.PROFILE,
			StorageTarget.USER
		);

		assert.strictEqual(bar.size(), 1, 'now just manage');
	});

	// --- isAccountsActionVisible utility ---

	test('isAccountsActionVisible reads from storage', () => {
		const storageService = disposables.add(new TestStorageService());

		// Default (not set) → true
		assert.strictEqual(isAccountsActionVisible(storageService), true);

		storageService.store(
			AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,
			false,
			StorageScope.PROFILE,
			StorageTarget.USER
		);
		assert.strictEqual(isAccountsActionVisible(storageService), false);
	});

	// --- Context menu ---

	test('getContextMenuActions returns accounts toggle action', () => {
		const { bar } = createGlobalCompositeBar();
		const actions = bar.getContextMenuActions();
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].id, 'toggleAccountsVisibility');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
