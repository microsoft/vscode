/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { QuickInputTreeController } from '../../../browser/tree/quickInputTreeController.js';
import { IQuickTreeItem } from '../../../common/quickInput.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { IListService, ListService } from '../../../../list/browser/listService.js';
import { IConfigurationService } from '../../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../configuration/test/common/testConfigurationService.js';
import { IThemeService } from '../../../../theme/common/themeService.js';
import { TestThemeService } from '../../../../theme/test/common/testThemeService.js';
import { IContextKeyService } from '../../../../contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../contextkey/browser/contextKeyService.js';
import { IKeybindingService } from '../../../../keybinding/common/keybinding.js';
import { NoMatchingKb } from '../../../../keybinding/common/keybindingResolver.js';

suite('QuickInputTreeController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; }
		});
	});

	test('ensures only the most recent tree item keeps focus', () => {
		const controller = store.add(instantiationService.createInstance(QuickInputTreeController, container, undefined));
		const treeItems: IQuickTreeItem[] = [
			{ label: 'Built-in', children: [{ label: 'details' }] },
			{ label: 'Extensions', children: [{ label: 'insiders' }] }
		];

		controller.setTreeData(treeItems);

		controller.tree.setFocus([treeItems[0]]);
		assert.deepStrictEqual(controller.tree.getFocus(), [treeItems[0]]);

		controller.tree.setFocus([treeItems[0], treeItems[1]]);
		const focus = controller.tree.getFocus();

		assert.strictEqual(focus.length, 1);
		assert.strictEqual(focus[0], treeItems[1]);
	});

	test('selection tracks latest focused item', () => {
		const controller = store.add(instantiationService.createInstance(QuickInputTreeController, container, undefined));
		const treeItems: IQuickTreeItem[] = [
			{ label: 'Built-in', children: [{ label: 'details' }] },
			{ label: 'Extensions', children: [{ label: 'insiders' }] }
		];

		controller.setTreeData(treeItems);

		controller.tree.setFocus([treeItems[0]]);
		assert.deepStrictEqual(controller.tree.getSelection(), [treeItems[0]], 'selection should follow initial focus');

		controller.tree.setFocus([treeItems[1]]);
		const selection = controller.tree.getSelection();
		assert.deepStrictEqual(selection, [treeItems[1]], 'selection should move to the newly focused item');
	});
});
