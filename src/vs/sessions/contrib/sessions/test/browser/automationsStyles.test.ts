/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/media/style.css';
import '../../browser/media/automationsCards.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Automations Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
