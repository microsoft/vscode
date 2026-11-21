/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../base/browser/dom.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService, WorkbenchCompressibleAsyncDataTree, WorkbenchObjectTree } from '../../../platform/list/browser/listService.js';
import '../../browser/actions/listCommands.js';
import { TestListService, workbenchInstantiationService } from './workbenchTestServices.js';

suite('Workbench trees - recursive collapse', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const setting = 'workbench.tree.collapseRecursive';
	let configurationService: TestConfigurationService;
	let instantiationService: TestInstantiationService;
	let listService: TestListService;

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		listService = new TestListService();
		instantiationService.stub(IListService, listService);
	});

	function createTree(collapseRecursive?: boolean): WorkbenchObjectTree<string> {
		const container = document.body.appendChild($('.workbench-tree-collapse-recursive-test'));
		disposables.add(toDisposable(() => container.remove()));
		const tree = disposables.add(instantiationService.createInstance(WorkbenchObjectTree<string>, 'test', container,
			{ getHeight: () => 20, getTemplateId: () => 'test' },
			[{
				templateId: 'test',
				renderTemplate: container => container,
				renderElement: (node, _index, container) => { container.textContent = node.element; },
				disposeTemplate: () => { },
			}],
			{
				collapseRecursive,
				accessibilityProvider: { getAriaLabel: element => element, getWidgetAriaLabel: () => 'Test' },
			}));
		tree.layout(200, 200);
		tree.setChildren(null, [{
			element: 'parent', collapsed: false, children: [{
				element: 'child', collapsed: false, children: [{
					element: 'grandchild', collapsed: false, children: [{ element: 'leaf' }],
				}],
			}],
		}]);
		return tree;
	}

	async function setCollapseRecursive(enabled: boolean): Promise<void> {
		await configurationService.setUserConfiguration(setting, enabled);
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([setting]),
			change: { keys: [setting], overrides: [] },
			affectsConfiguration: key => key === setting,
		});
	}

	test('uses the default and current configuration for mouse collapses when creating a tree', async () => {
		const actual: { configured: boolean | undefined; hidden: boolean[]; reopened: boolean[] }[] = [];
		for (const configured of [undefined, true]) {
			await configurationService.setUserConfiguration(setting, configured);
			const tree = createTree();
			const twistie = tree.getHTMLElement().querySelector<HTMLElement>('.monaco-tl-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			const hidden = [tree.isCollapsed('child'), tree.isCollapsed('grandchild')];
			tree.expand('parent');
			actual.push({ configured, hidden, reopened: [tree.isCollapsed('child'), tree.isCollapsed('grandchild')] });
		}

		assert.deepStrictEqual(actual, [
			{ configured: undefined, hidden: [false, false], reopened: [false, false] },
			{ configured: true, hidden: [true, true], reopened: [true, true] },
		]);
	});

	test('updates existing trees for the workbench keyboard collapse command', async () => {
		const tree = createTree();
		listService.lastFocusedList = tree;
		tree.setFocus(['parent']);
		const command = CommandsRegistry.getCommand('list.collapse');
		assert.ok(command);
		tree.collapse('child');

		await setCollapseRecursive(true);
		const beforeCollapse = [tree.isCollapsed('child'), tree.isCollapsed('grandchild')];
		instantiationService.invokeFunction(command.handler);
		const enabled = [tree.isCollapsed('child'), tree.isCollapsed('grandchild')];
		tree.expand('parent', true);

		await setCollapseRecursive(false);
		instantiationService.invokeFunction(command.handler);
		tree.expand('parent');

		assert.deepStrictEqual({ beforeCollapse, enabled, disabled: [tree.isCollapsed('child'), tree.isCollapsed('grandchild')] }, {
			beforeCollapse: [true, false],
			enabled: [true, true],
			disabled: [false, false],
		});
	});

	test('collapses descendants of compressed async tree nodes using the global configuration', async () => {
		await configurationService.setUserConfiguration(setting, true);
		const children = new Map<string, string[]>([
			['root', ['parent']],
			['parent', ['child']],
			['child', ['grandchild', 'sibling']],
			['grandchild', ['leaf']],
		]);
		const container = document.body.appendChild($('.workbench-tree-collapse-recursive-test'));
		disposables.add(toDisposable(() => container.remove()));
		const tree = disposables.add(instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree<string, string>, 'test', container,
			{ getHeight: () => 20, getTemplateId: () => 'test' },
			{ isIncompressible: element => !children.has(element) },
			[{
				templateId: 'test',
				renderTemplate: container => container,
				renderElement: (node, _index, container) => { container.textContent = node.element; },
				renderCompressedElements: (node, _index, container) => { container.textContent = node.element.elements.join('/'); },
				disposeTemplate: () => { },
			}],
			{
				hasChildren: element => children.has(element),
				getChildren: async element => children.get(element) ?? [],
			},
			{
				compressionEnabled: true,
				collapseByDefault: () => false,
				accessibilityProvider: { getAriaLabel: element => element, getWidgetAriaLabel: () => 'Test' },
			}));
		tree.layout(200, 200);
		await tree.setInput('root');
		await tree.expand('parent');
		await tree.expand('child');
		await tree.expand('grandchild');
		const compressed = tree.getCompressedTreeNode('parent')?.elements.map(node => node.element);
		const beforeCollapse = tree.isCollapsed('grandchild');

		tree.collapse('parent');
		const hidden = tree.isCollapsed('grandchild');
		await tree.expand('parent');

		assert.deepStrictEqual({ compressed, beforeCollapse, hidden, reopened: tree.isCollapsed('grandchild') }, {
			compressed: ['parent', 'child'],
			beforeCollapse: false,
			hidden: true,
			reopened: true,
		});
	});

	test('preserves explicit tree options across configuration changes', async () => {
		const actual: { collapseRecursive: boolean; initial: boolean[]; updated: boolean[] }[] = [];
		for (const collapseRecursive of [false, true]) {
			await configurationService.setUserConfiguration(setting, !collapseRecursive);
			const tree = createTree(collapseRecursive);
			tree.collapse('parent');
			const initial = [tree.isCollapsed('child'), tree.isCollapsed('grandchild')];
			tree.expand('parent', true);

			await setCollapseRecursive(collapseRecursive);
			await setCollapseRecursive(!collapseRecursive);
			tree.collapse('parent');
			actual.push({ collapseRecursive, initial, updated: [tree.isCollapsed('child'), tree.isCollapsed('grandchild')] });
		}

		assert.deepStrictEqual(actual, [
			{ collapseRecursive: false, initial: [false, false], updated: [false, false] },
			{ collapseRecursive: true, initial: [true, true], updated: [true, true] },
		]);
	});
});
