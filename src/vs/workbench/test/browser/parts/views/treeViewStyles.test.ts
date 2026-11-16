/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ObjectTree } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getListStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import '../../../../browser/parts/views/media/views.css';

suite('Custom tree action backgrounds', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const location of ['sidebar', 'auxiliarybar', 'panel']) {
		for (const translucent of [false, true]) {
			test(`${location} actions match row states with ${translucent ? 'translucent' : 'opaque'} highlights`, async () => {
				const root = $('.monaco-workbench');
				store.add(toDisposable(() => root.remove()));
				root.style.setProperty('--vscode-spacing-size120', '12px');
				const colors = {
					'--vscode-sideBar-background': '#191a1b',
					'--vscode-panel-background': '#282930',
					'--vscode-list-hoverBackground': translucent ? '#ffffff14' : '#303030',
					'--vscode-list-activeSelectionBackground': translucent ? '#ffffff22' : '#404040',
					'--vscode-list-inactiveSelectionBackground': translucent ? '#ffffff33' : '#505050',
					'--vscode-list-focusBackground': translucent ? '#ffffff44' : '#606060',
					'--vscode-list-inactiveFocusBackground': translucent ? '#ffffff55' : '#707070',
				};
				for (const [name, value] of Object.entries(colors)) {
					root.style.setProperty(name, value);
				}
				const part = root.appendChild($(`.part.${location}`));
				const container = part.appendChild($('.customview-tree'));
				container.style.width = '160px';
				container.style.height = '100px';
				const outside = root.appendChild($('button', undefined, 'Outside'));
				mainWindow.document.body.appendChild(root);
				const renderer: ITreeRenderer<string, void, HTMLElement> = {
					templateId: 'item',
					renderTemplate: container => {
						const item = container.appendChild($('.custom-view-tree-node-item'));
						item.style.width = '600px';
						item.appendChild($('.custom-view-tree-node-item-resourceLabel', undefined, 'A long script name and command that scrolls underneath the actions'));
						const actions = item.appendChild($('.actions'));
						const bar = store.add(new ActionBar(actions));
						bar.push(store.add(new Action('run', 'Run', 'codicon codicon-play')), { icon: true, label: false });
						return actions;
					},
					renderElement: (_element: ITreeNode<string, void>, _index: number, _actions: HTMLElement) => { },
					disposeTemplate: () => { },
				};
				const tree = store.add(new ObjectTree<string>('action-background-test', container, {
					getHeight: () => 22,
					getTemplateId: () => 'item',
				}, [renderer], {
					horizontalScrolling: true,
					accessibilityProvider: { getAriaLabel: element => element, getWidgetAriaLabel: () => 'Scripts' },
				}));
				tree.style(getListStyles({ listBackground: location === 'panel' ? 'panel.background' : 'sideBar.background' }));
				tree.layout(100, 160);
				tree.setChildren(null, [{ element: 'script' }]);
				const row = container.querySelector<HTMLElement>('.monaco-list-row')!;
				const actions = row.querySelector<HTMLElement>('.actions')!;
				const snapshots: { state: string; base: string; tintMatches: boolean; visible: boolean; coversTrailingText: boolean }[] = [];
				const record = async (state: string) => {
					await timeout(0);
					const styles = getWindow(actions).getComputedStyle(actions);
					const rowColor = getWindow(row).getComputedStyle(row).backgroundColor;
					const item = actions.parentElement!;
					const visibleRight = Math.min(item.getBoundingClientRect().right, tree.getHTMLElement().getBoundingClientRect().right);
					snapshots.push({
						state,
						base: styles.backgroundColor,
						tintMatches: styles.backgroundImage === `linear-gradient(${rowColor}, ${rowColor})`,
						visible: styles.display !== 'none',
						coversTrailingText: actions.getBoundingClientRect().right >= visibleRight,
					});
				};

				outside.focus();
				row.classList.add('hovered');
				await record('hover');
				row.classList.remove('hovered');
				tree.setSelection(['script']);
				await record('inactive selection');
				tree.domFocus();
				await record('active selection');
				tree.setFocus(['script']);
				await record('active selection and focus');
				tree.setSelection([]);
				await record('active focus');
				root.style.removeProperty('--vscode-list-focusBackground');
				await record('active focus without a background');
				outside.focus();
				await record('inactive focus');
				tree.scrollLeft = 100;
				await record('scrolled inactive focus');
				tree.scrollLeft = 600;
				await record('end-scrolled inactive focus');

				assert.deepStrictEqual(snapshots, snapshots.map(snapshot => ({
					state: snapshot.state,
					base: location === 'panel' ? 'rgb(40, 41, 48)' : 'rgb(25, 26, 27)',
					tintMatches: true,
					visible: true,
					coversTrailingText: true,
				})));
			});
		}
	}
});
