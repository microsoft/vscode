/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { TestLayoutService } from '../../workbenchTestServices.js';
import { BannerPart } from '../../../../browser/parts/banner/bannerPart.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IBannerItem } from '../../../../services/banner/browser/bannerService.js';

suite('BannerPart', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	function createBannerPart(): BannerPart {
		const themeService = new TestThemeService();
		const storageService = disposables.add(new TestStorageService());
		const layoutService = new TestLayoutService();
		const contextKeyService = new MockContextKeyService();

		// Minimal stubs — these services must not be invoked when `show()`
		// returns early because the content area hasn't been created yet.
		const instantiationService = { createInstance: () => { throw new Error('not expected'); } } as unknown as IInstantiationService;
		const markdownRendererService = { render: () => { throw new Error('not expected'); } } as unknown as IMarkdownRendererService;

		return disposables.add(new BannerPart(
			themeService,
			layoutService,
			storageService,
			contextKeyService,
			instantiationService,
			markdownRendererService,
		));
	}

	// Regression test for https://github.com/microsoft/vscode/issues/310358.
	// `BannerPart.show()` can be invoked by `WorkspaceTrustManagementService.onDidChangeTrust`
	// during startup before the workbench layout has created the part's DOM element.
	// Prior to the fix, this threw `TypeError: Cannot read properties of undefined
	// (reading 'firstChild')` from `clearNode(this.element)`.
	test('show() does not throw when called before createContentArea()', () => {
		const part = createBannerPart();

		const item: IBannerItem = {
			id: 'test.banner',
			icon: undefined,
			message: 'hello',
		};

		assert.doesNotThrow(() => part.show(item));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
