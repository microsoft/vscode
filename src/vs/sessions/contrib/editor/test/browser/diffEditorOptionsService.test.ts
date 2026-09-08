/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SESSIONS_EDITOR_WORD_WRAP_SETTING, SessionsDiffViewModeContext } from '../../common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../browser/diffEditorOptionsService.js';

suite('DiffEditorOptionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to automatic and persists explicit modes', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		const configurationService = new TestConfigurationService({
			[SESSIONS_EDITOR_WORD_WRAP_SETTING]: 'inherit',
		});
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService, configurationService));

		const initial = {
			viewMode: service.viewMode.get(),
			renderSideBySide: service.renderSideBySide.get(),
			wordWrap: service.wordWrap.get(),
			contextValue: contextKeyService.getContextKeyValue(SessionsDiffViewModeContext.key),
			storedValue: storageService.get('sessions.diffEditor.viewMode', StorageScope.PROFILE),
		};
		service.setViewMode('sideBySide');

		assert.deepStrictEqual({
			initial,
			viewMode: service.viewMode.get(),
			renderSideBySide: service.renderSideBySide.get(),
			contextValue: contextKeyService.getContextKeyValue(SessionsDiffViewModeContext.key),
			storedValue: storageService.get('sessions.diffEditor.viewMode', StorageScope.PROFILE),
		}, {
			initial: {
				viewMode: 'automatic',
				renderSideBySide: true,
				wordWrap: 'inherit',
				contextValue: 'automatic',
				storedValue: undefined,
			},
			viewMode: 'sideBySide',
			renderSideBySide: true,
			contextValue: 'sideBySide',
			storedValue: 'sideBySide',
		});
	});

	test('migrates the legacy inline preference and toggles back to automatic', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.diffEditor.renderSideBySide', false, StorageScope.PROFILE, StorageTarget.USER);
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService, new TestConfigurationService()));

		const migratedViewMode = service.viewMode.get();
		service.toggleRenderSideBySide();

		assert.deepStrictEqual({
			migratedViewMode,
			viewMode: service.viewMode.get(),
			storedValue: storageService.get('sessions.diffEditor.viewMode', StorageScope.PROFILE),
		}, {
			migratedViewMode: 'inline',
			viewMode: 'automatic',
			storedValue: 'automatic',
		});
	});

	test('uses and updates the experiment-controlled word wrap setting', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		const updates: Array<{ key: string; value: unknown }> = [];
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				updates.push({ key, value });
				return Promise.resolve();
			}
		}({
			[SESSIONS_EDITOR_WORD_WRAP_SETTING]: 'on',
		});
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService, configurationService));

		await service.setWordWrap('off');

		assert.deepStrictEqual({
			wordWrap: service.wordWrap.get(),
			updates,
		}, {
			wordWrap: 'on',
			updates: [{
				key: SESSIONS_EDITOR_WORD_WRAP_SETTING,
				value: 'off',
			}],
		});
	});
});
