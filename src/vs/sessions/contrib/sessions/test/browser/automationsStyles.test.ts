/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/media/style.css';
import '../../browser/media/automationsCards.css';
import '../../../../../workbench/browser/media/chatPills.css';
import '../../../../../base/browser/ui/actionbar/actionbar.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Automations Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('section disclosures inset their content inside the hover target', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size60: 6px';
		store.add(toDisposable(() => root.remove()));

		const insets = ['automations-ownership-summary', 'automations-template-section-summary'].map(className => {
			const section = append(root, $('details'));
			const summary = append(section, $(`summary.${className}`));
			const label = append(summary, $('span', undefined, 'Automations'));
			const bounds = summary.getBoundingClientRect();
			const content = label.getBoundingClientRect();
			return {
				top: content.top - bounds.top,
				right: bounds.right - content.right,
				bottom: bounds.bottom - content.bottom,
				left: content.left - bounds.left,
			};
		});

		assert.deepStrictEqual(insets, [
			{ top: 2, right: 6, bottom: 2, left: 6 },
			{ top: 2, right: 6, bottom: 2, left: 6 },
		]);
	});

	test('template titles stay aligned with descriptions and card grids', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size60: 6px; --vscode-codiconFontSize: 16px';
		store.add(toDisposable(() => root.remove()));
		const section = append(root, $('details.automations-template-section', { open: true }));
		const summary = append(section, $('summary.automations-template-section-summary'));
		append(summary, $('span.automations-template-section-chevron'));
		const title = append(summary, $('span.automations-template-section-title', undefined, 'Built-in Templates'));
		const description = append(section, $('p.automations-templates-description', undefined, 'Choose a starting point.'));
		const grid = append(section, $('.automations-templates-grid'));

		assert.deepStrictEqual({
			descriptionOffset: description.getBoundingClientRect().left - title.getBoundingClientRect().left,
			gridOffset: grid.getBoundingClientRect().left - title.getBoundingClientRect().left,
		}, { descriptionOffset: 0, gridOffset: 0 });
	});

	test('empty-state creation button stays compact and single-line without clipping its label', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.width = '600px';
		store.add(toDisposable(() => root.remove()));
		const sizes = ['automations-cards-create-button', 'automations-cards-state-create-button'].map(className => {
			const empty = append(root, $('.automations-cards-empty'));
			const button = store.add(new Button(empty, {}));
			button.element.classList.add(className);
			button.label = 'Create with Agent';
			return {
				width: button.element.getBoundingClientRect().width,
				height: button.element.getBoundingClientRect().height,
				clipped: button.element.scrollWidth > button.element.clientWidth,
			};
		});

		assert.deepStrictEqual(sizes, [{ width: 160, height: 26, clipped: false }, { width: 160, height: 26, clipped: false }]);
	});

	test('header buttons share height and outer corners including the split button', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.cssText = '--vscode-cornerRadius-small: 4px; --vscode-cornerRadius-medium: 6px';
		store.add(toDisposable(() => root.remove()));
		const view = append(root, $('.custom-view-node', { 'data-view-id': 'sessions.customView.automations' }));
		const actions = append(view, $('.custom-view-header-actions'));
		const actionBar = append(actions, $('.monaco-action-bar'));
		const items = append(actionBar, $('ul.actions-container'));
		const create = store.add(new Button(append(items, $('li.action-item.chat-pill-item')), {}));
		create.element.classList.add('chat-pill-button');
		create.label = 'Create with Agent';
		const manual = store.add(new ButtonWithDropdown(append(items, $('li.action-item')), {
			contextMenuProvider: { showContextMenu: () => { } },
			actions: [],
		}));
		manual.label = 'Create Manually';
		const refresh = store.add(new Button(append(items, $('li.action-item.chat-pill-item')), { supportIcons: true }));
		refresh.element.classList.add('chat-pill-button');
		refresh.label = '$(refresh)';

		assert.deepStrictEqual(
			{
				buttons: [create.element, manual.primaryButton.element, manual.dropdownButton.element, refresh.element].map(element => ({
					height: element.getBoundingClientRect().height,
					radius: mainWindow.getComputedStyle(element).borderRadius,
				})),
				dropdownWidth: manual.dropdownButton.element.getBoundingClientRect().width,
			},
			{
				buttons: [
					{ height: 26, radius: '4px' },
					{ height: 26, radius: '4px 0px 0px 4px' },
					{ height: 26, radius: '0px 4px 4px 0px' },
					{ height: 26, radius: '4px' },
				],
				dropdownWidth: 26,
			},
		);
	});

	test('keyboard-focused cards retain their focus boundary while hovered', () => {
		const describe = (theme: 'vs' | 'hc-black') => {
			const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${theme}`));
			root.style.cssText = [
				'--vscode-strokeThickness: 1px',
				'--vscode-editorWidget-border: #112233',
				'--vscode-list-hoverBackground: #223344',
				'--vscode-contrastActiveBorder: #445566',
				'--vscode-focusBorder: #778899',
			].join(';');
			store.add(toDisposable(() => root.remove()));

			const card = append(root, $('.automations-card.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered.hovered'));
			append(card, $('button.automations-card-main.focus-visible'));
			const style = mainWindow.getComputedStyle(card);
			return {
				background: style.backgroundColor,
				borderColor: style.borderColor,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
			};
		};

		assert.deepStrictEqual({
			defaultTheme: describe('vs'),
			highContrast: describe('hc-black'),
		}, {
			defaultTheme: {
				background: 'rgba(0, 0, 0, 0)',
				borderColor: 'rgb(17, 34, 51)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			highContrast: {
				background: 'rgba(0, 0, 0, 0)',
				borderColor: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-2px',
				outlineStyle: 'solid',
				outlineWidth: '2px',
			},
		});
	});

	test('nested action hover and open states do not outline the parent card', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.hc-black'));
		root.style.cssText = [
			'--vscode-strokeThickness: 1px',
			'--vscode-editorWidget-border: #112233',
			'--vscode-list-hoverBackground: #223344',
			'--vscode-toolbar-hoverBackground: #334455',
			'--vscode-contrastActiveBorder: #445566',
			'--vscode-focusBorder: #778899',
		].join(';');
		store.add(toDisposable(() => root.remove()));

		const card = append(root, $('.automations-card.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered.hovered'));
		append(card, $('button.automations-card-main'));
		const actions = append(card, $('.automations-card-actions.hovered'));
		const button = append(actions, $('button.monaco-button.automations-card-action-button.hovered'));
		const readOutline = (element: HTMLElement) => {
			const style = mainWindow.getComputedStyle(element);
			return {
				color: style.outlineStyle === 'none' ? 'none' : style.outlineColor,
				style: style.outlineStyle,
				width: style.outlineStyle === 'none' ? '0px' : style.outlineWidth,
			};
		};
		const hovered = {
			card: {
				background: mainWindow.getComputedStyle(card).backgroundColor,
				borderColor: mainWindow.getComputedStyle(card).borderColor,
				outline: readOutline(card),
			},
			button: readOutline(button),
		};
		button.setAttribute('aria-expanded', 'true');
		actions.classList.add('menu-open');
		const open = {
			card: readOutline(card),
			button: readOutline(button),
		};
		actions.classList.remove('hovered', 'menu-open');
		actions.classList.add('focus-within');
		button.removeAttribute('aria-expanded');
		button.classList.remove('hovered');
		button.classList.add('focus-visible');
		const focused = {
			card: readOutline(card),
			button: readOutline(button),
		};

		assert.deepStrictEqual({ hovered, open, focused }, {
			hovered: {
				card: {
					background: 'rgba(0, 0, 0, 0)',
					borderColor: 'rgb(17, 34, 51)',
					outline: { color: 'none', style: 'none', width: '0px' },
				},
				button: { color: 'rgb(68, 85, 102)', style: 'dashed', width: '1px' },
			},
			open: {
				card: { color: 'none', style: 'none', width: '0px' },
				button: { color: 'rgb(68, 85, 102)', style: 'solid', width: '1px' },
			},
			focused: {
				card: { color: 'none', style: 'none', width: '0px' },
				button: { color: 'rgb(119, 136, 153)', style: 'solid', width: '1px' },
			},
		});
	});
});
