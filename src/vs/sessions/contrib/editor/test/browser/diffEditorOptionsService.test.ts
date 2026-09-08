/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionsDiffViewModeContext } from '../../common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../browser/diffEditorOptionsService.js';

suite('DiffEditorOptionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to automatic and persists explicit modes', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService));

		const initial = {
			viewMode: service.viewMode.get(),
			renderSideBySide: service.renderSideBySide.get(),
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
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService));

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
});
