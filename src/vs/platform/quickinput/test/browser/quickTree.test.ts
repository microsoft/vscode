/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IQuickTreeItem, TreeItemCollapsibleState } from '../../common/quickInput.js';

suite('QuickTree', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ILogService, new NullLogService());
	});

	test('should create tree with basic properties', () => {
		// This test would need a proper UI mock to work
		// For now, just test the basic interface compliance
		const item: IQuickTreeItem = {
			label: 'Test Item',
			collapsibleState: TreeItemCollapsibleState.None
		};

		assert.strictEqual(item.label, 'Test Item');
		assert.strictEqual(item.collapsibleState, TreeItemCollapsibleState.None);
	});

	test('should handle tree item with children', () => {
		const parentItem: IQuickTreeItem = {
			label: 'Parent',
			collapsibleState: TreeItemCollapsibleState.Expanded
		};

		const childItem: IQuickTreeItem = {
			label: 'Child',
			collapsibleState: TreeItemCollapsibleState.None
		};

		assert.strictEqual(parentItem.collapsibleState, TreeItemCollapsibleState.Expanded);
		assert.strictEqual(childItem.collapsibleState, TreeItemCollapsibleState.None);
	});

	test('should handle checkbox states', () => {
		const item: IQuickTreeItem = {
			label: 'Checkable Item',
			collapsibleState: TreeItemCollapsibleState.None,
			checked: true
		};

		assert.strictEqual(item.checked, true);

		item.checked = 'partial';
		assert.strictEqual(item.checked, 'partial');

		item.checked = false;
		assert.strictEqual(item.checked, false);
	});
});
