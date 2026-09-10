/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow, isHTMLElement } from '../../browser/dom.js';
import { IconLabel } from '../../browser/ui/iconLabel/iconLabel.js';
import { renderLabelWithIcons } from '../../browser/ui/iconLabel/iconLabels.js';
import { mainWindow } from '../../browser/window.js';
import { Codicon } from '../../common/codicons.js';
import { toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('renderLabelWithIcons', () => {

	test('no icons', () => {
		const result = renderLabelWithIcons(' hello World .');

		assert.strictEqual(elementsToString(result), ' hello World .');
	});

	test('icons only', () => {
		const result = renderLabelWithIcons('$(alert)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-alert"></span>');
	});

	test('icon and non-icon strings', () => {
		const result = renderLabelWithIcons(` $(alert) Unresponsive`);

		assert.strictEqual(elementsToString(result), ' <span class="codicon codicon-alert"></span> Unresponsive');
	});

	test('multiple icons', () => {
		const result = renderLabelWithIcons('$(check)$(error)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-check"></span><span class="codicon codicon-error"></span>');
	});

	test('escaped icons', () => {
		const result = renderLabelWithIcons('\\$(escaped)');

		assert.strictEqual(elementsToString(result), '$(escaped)');
	});

	test('icon with animation', () => {
		const result = renderLabelWithIcons('$(zip~anim)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-zip codicon-modifier-anim"></span>');
	});

	const elementsToString = (elements: Array<HTMLElement | string>): string => {
		return elements
			.map(elem => isHTMLElement(elem) ? elem.outerHTML : elem)
			.reduce((a, b) => a + b, '');
	};

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('IconLabel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLabel(): IconLabel {
		const container = $('div');
		container.style.cssText = `
			--vscode-iconSize-small: 16px;
			--vscode-spacing-sizeNone: 0px;
			--vscode-spacing-size60: 6px;
		`;
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		return store.add(new IconLabel(container, { supportIcons: true }));
	}

	test('owns equivalent spacing for pseudo-element and explicit icon paths', () => {
		const pseudoLabel = createLabel();
		pseudoLabel.setLabel('Pseudo icon', undefined, {
			extraClasses: ['file-icon'],
			title: 'Pseudo icon',
		});

		const pathLabel = createLabel();
		pathLabel.setLabel('Explicit icon', undefined, {
			iconPath: Codicon.file,
			title: 'Explicit icon',
		});

		const pseudoStyle = getWindow(pseudoLabel.element).getComputedStyle(pseudoLabel.element, '::before');
		const iconPath = pathLabel.element.querySelector<HTMLElement>('.monaco-icon-label-iconpath')!;
		const pathStyle = getWindow(pathLabel.element).getComputedStyle(iconPath);

		assert.deepStrictEqual({
			pseudoClasses: pseudoLabel.element.className,
			pseudoWidth: pseudoStyle.width,
			pseudoSpacing: pseudoStyle.paddingInlineEnd,
			pseudoAriaLabel: pseudoLabel.element.getAttribute('aria-label'),
			pathClasses: pathLabel.element.className,
			pathWidth: pathStyle.width,
			pathSpacing: pathStyle.marginInlineEnd,
			pathFlex: pathStyle.flex,
			pathAriaLabel: pathLabel.element.getAttribute('aria-label'),
		}, {
			pseudoClasses: 'monaco-icon-label monaco-icon-label-spacing-default file-icon',
			pseudoWidth: '16px',
			pseudoSpacing: '6px',
			pseudoAriaLabel: 'Pseudo icon',
			pathClasses: 'monaco-icon-label monaco-icon-label-spacing-default',
			pathWidth: '16px',
			pathSpacing: '6px',
			pathFlex: '0 0 auto',
			pathAriaLabel: 'Explicit icon',
		});
	});

	test('updates the spacing variant with the label value', () => {
		const label = createLabel();
		label.setLabel('Icon only', undefined, {
			iconPath: Codicon.file,
			iconLabelSpacing: 'none',
		});

		const iconPath = label.element.querySelector<HTMLElement>('.monaco-icon-label-iconpath')!;
		assert.deepStrictEqual({
			classes: label.element.className,
			spacing: getWindow(label.element).getComputedStyle(iconPath).marginInlineEnd,
		}, {
			classes: 'monaco-icon-label monaco-icon-label-spacing-none',
			spacing: '0px',
		});

		label.setLabel('Label restored', undefined, { iconPath: Codicon.file });

		assert.deepStrictEqual({
			classes: label.element.className,
			spacing: getWindow(label.element).getComputedStyle(iconPath).marginInlineEnd,
		}, {
			classes: 'monaco-icon-label monaco-icon-label-spacing-default',
			spacing: '6px',
		});
	});
});
