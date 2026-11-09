/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { withCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { getMotionCssVariables } from '../../../../../../platform/theme/common/motion/motionRecipes.js';
import { CustomizationToggle } from '../../../browser/aiCustomization/customizationToggle.js';
import { getPluginToolsGroup, isToolsTreeKeyboardTarget, ToolsListWidget } from '../../../browser/aiCustomization/toolsListWidget.js';
import { IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';

suite('toolsListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handles tree keys only from the row itself', () => {
		const row = document.createElement('div');
		const moreButton = document.createElement('button');
		row.appendChild(moreButton);

		assert.deepStrictEqual({
			row: isToolsTreeKeyboardTarget(row, row),
			moreButton: isToolsTreeKeyboardTarget(moreButton, row),
		}, {
			row: true,
			moreButton: false,
		});
	});

	test('uses switches for customization enablement', () => {
		const enabledToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Enabled', checked: true }));
		const mixedToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Mixed', checked: 'mixed' }));

		assert.deepStrictEqual({
			enabledRole: enabledToggle.domNode.firstElementChild?.getAttribute('role'),
			enabledChecked: enabledToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
			mixedRole: mixedToggle.domNode.firstElementChild?.getAttribute('role'),
			mixedChecked: mixedToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
		}, {
			enabledRole: 'switch',
			enabledChecked: 'true',
			mixedRole: 'switch',
			mixedChecked: 'mixed',
		});
	});

	test('derives plugin tool groups from discovery source', () => {
		const plugin = (source?: string): PluginCustomization => ({
			type: CustomizationType.Plugin,
			id: source ?? 'default',
			uri: `other-host:/${source ?? 'default'}`,
			name: source ?? 'default',
			_meta: source ? withCustomizationDiscoveryMeta(undefined, { source }) : undefined,
		});

		assert.deepStrictEqual([
			getPluginToolsGroup(plugin()),
			getPluginToolsGroup(plugin('user')),
			getPluginToolsGroup(plugin('repository')),
			getPluginToolsGroup(plugin('builtin')),
			getPluginToolsGroup(plugin('future-source')),
		], ['user', 'user', 'workspace', 'application', 'user']);
	});

	test('mixed switch feedback retargets without jumping or moving its layout', () => {
		const toggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Tools' }));
		const container = mainWindow.document.createElement('div');
		container.className = 'monaco-enable-motion';
		container.style.cssText = `
			--vscode-spacing-size280: 28px;
			--vscode-spacing-size160: 16px;
			--vscode-strokeThickness: 1px;
			--vscode-cornerRadius-circle: 9999px;
		`;
		for (const [name, value] of Object.entries(getMotionCssVariables())) {
			container.style.setProperty(name, value);
		}
		container.appendChild(toggle.domNode);
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const button = toggle.domNode.firstElementChild as HTMLButtonElement;
		const thumb = button.firstElementChild as HTMLElement;
		const bounds = button.getBoundingClientRect().toJSON();
		const off = thumb.getBoundingClientRect().x;
		const states = ['mixed', true, 'mixed', false, true, false] as const;
		const results = states.map(state => {
			const before = thumb.getBoundingClientRect().x;
			toggle.checked = state;
			const immediate = thumb.getBoundingClientRect().x;
			const animation = thumb.getAnimations()[0] as CSSTransition;
			assert.ok(animation);
			animation.finish();
			return {
				state: toggle.checked, aria: button.getAttribute('aria-checked'),
				continuous: Math.abs(immediate - before) < 0.001, property: animation.transitionProperty,
				bounds: button.getBoundingClientRect().toJSON(), layoutLeft: thumb.offsetLeft,
				travel: thumb.getBoundingClientRect().x - off,
			};
		});

		toggle.checked = 'mixed';
		const animation = thumb.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 60;
		const before = thumb.getBoundingClientRect().x;
		toggle.checked = true;
		const continuous = Math.abs(thumb.getBoundingClientRect().x - before) < 0.001;
		container.classList.add('monaco-reduce-motion');

		assert.deepStrictEqual({
			results, continuous, reducedTravel: thumb.getBoundingClientRect().x - off,
			animations: thumb.getAnimations().length,
		}, {
			results: states.map(state => ({
				state, aria: String(state), continuous: true, property: 'transform', bounds, layoutLeft: 0,
				travel: state === 'mixed' ? 6 : state ? 12 : 0,
			})),
			continuous: true, reducedTravel: 12, animations: 0,
		});
	});

	test('search treats dashes and spaces as equivalent separators with highlights', () => {
		const toolSet = {
			id: 'chrome-devtools',
			referenceName: 'chrome-devtools',
			description: 'Chrome DevTools MCP',
			source: { type: 'internal', label: 'Internal' },
			getTools: () => [{ id: 'take_screenshot', displayName: 'take-screenshot' }, { id: 'navigate', displayName: 'Navigate Page' }],
		} as unknown as IToolSet;
		const toViewModel = (query: string) => {
			const vm = (ToolsListWidget.prototype as unknown as {
				_toViewModel(this: object, reader: undefined, ts: IToolSet, query: string): { nameMatches?: unknown; visibleTools: { tool: IToolData; nameMatches?: unknown }[] } | undefined;
			})._toViewModel.call({ _resolveSetDetail: () => undefined }, undefined, toolSet, query);
			return vm && { set: vm.nameMatches, tools: vm.visibleTools.map(tool => [tool.tool.id, tool.nameMatches]) };
		};

		assert.deepStrictEqual({
			dashedSet: toViewModel('chrome-devtools'),
			spacedTool: toViewModel('take screenshot'),
			underscoredTool: toViewModel('navigate_page'),
			none: toViewModel('missing'),
		}, {
			dashedSet: { set: [{ start: 0, end: 6 }, { start: 7, end: 15 }], tools: [['take_screenshot', undefined], ['navigate', undefined]] },
			spacedTool: { set: undefined, tools: [['take_screenshot', [{ start: 0, end: 4 }, { start: 5, end: 15 }]]] },
			underscoredTool: { set: undefined, tools: [['navigate', [{ start: 0, end: 8 }, { start: 9, end: 13 }]]] },
			none: undefined,
		});
	});
});
