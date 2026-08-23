/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { SessionsDiffRenderSideBySideContext } from '../../common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../browser/diffEditorOptionsService.js';

suite('DiffEditorOptionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to responsive side by side and persists the shared preference', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new DiffEditorOptionsService(storageService, contextKeyService));

		const initial = {
			renderSideBySide: service.renderSideBySide.get(),
			contextValue: contextKeyService.getContextKeyValue(SessionsDiffRenderSideBySideContext.key),
			storedValue: storageService.getBoolean('sessions.diffEditor.renderSideBySide', StorageScope.PROFILE),
		};
		service.toggleRenderSideBySide();

		assert.deepStrictEqual({
			initial,
			renderSideBySide: service.renderSideBySide.get(),
			contextValue: contextKeyService.getContextKeyValue(SessionsDiffRenderSideBySideContext.key),
			storedValue: storageService.getBoolean('sessions.diffEditor.renderSideBySide', StorageScope.PROFILE),
		}, {
			initial: {
				renderSideBySide: true,
				contextValue: true,
				storedValue: undefined,
			},
			renderSideBySide: false,
			contextValue: false,
			storedValue: false,
		});
	});
});
