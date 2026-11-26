/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { List } from '../../../../../base/browser/ui/list/listWidget.js';
import { ResizableHTMLElement } from '../../../../../base/browser/ui/resizable/resizable.js';
import { range } from '../../../../../base/common/arrays.js';
import { retry } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import '../../../../../editor/contrib/suggest/browser/media/suggest.css';
import '../../../../services/suggest/browser/media/suggest.css';
import '../../browser/media/roundedCorners.css';
import '../../browser/media/frostedGlass.css';
import '../../browser/media/suggestWidget.css';

suite('Dialog corners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const { modern, glass } of [false, true].flatMap(modern => [false, true].map(glass => ({ modern, glass })))) {
		test(`matches the dialog frame with Modern UI ${modern ? 'enabled' : 'disabled'} and glass ${glass ? 'enabled' : 'disabled'}`, async () => {
			const root = append(document.body, $('.monaco-workbench'));
			store.add(toDisposable(() => root.remove()));
			root.classList.toggle('modern-ui', modern);
			root.classList.toggle('modern-ui-frosted-glass', glass);
			root.style.setProperty('--vscode-cornerRadius-large', '8px');
			root.style.setProperty('--vscode-cornerRadius-xLarge', '12px');
			root.style.setProperty('--vscode-editorWidget-background', '#eeeeee');
			root.style.setProperty('--vscode-widget-border', '#80808080');
			const dialog = store.add(new Dialog(root, 'Confirmation', ['Cancel'], {
				buttonStyles: defaultButtonStyles,
				checkboxStyles: defaultCheckboxStyles,
				inputBoxStyles: defaultInputBoxStyles,
				dialogStyles: defaultDialogStyles,
			}));
			const result = dialog.show();
			const surface = root.querySelector<HTMLElement>('.monaco-dialog-box')!;
			const shadow = surface.parentElement!;
			const targetWindow = getWindow(surface);
			const expectedRadius = modern ? '8px' : '12px';
			const supportsGlass = CSS.supports('backdrop-filter', 'blur(12px)')
				&& CSS.supports('background-color', 'color-mix(in srgb, black 92%, transparent)')
				&& targetWindow.matchMedia('(prefers-reduced-transparency: no-preference) and (forced-colors: none)').matches;
			const paint = targetWindow.getComputedStyle(shadow, '::before');
			assert.deepStrictEqual({
				surfaceRadius: targetWindow.getComputedStyle(surface).borderRadius,
				shadowRadius: targetWindow.getComputedStyle(shadow).borderRadius,
				surfaceFilter: targetWindow.getComputedStyle(surface, '::before').backdropFilter,
				paintFilter: paint.backdropFilter,
				paintRadius: glass && supportsGlass ? paint.borderRadius : undefined,
				paintBorderWidth: glass && supportsGlass ? paint.borderTopWidth : undefined,
				paintSize: glass && supportsGlass ? [parseFloat(paint.width), parseFloat(paint.height)] : undefined,
				surfaceBorderWidth: targetWindow.getComputedStyle(surface).borderTopWidth,
				matchingBounds: shadow.getBoundingClientRect().toJSON(),
			}, {
				surfaceRadius: expectedRadius,
				shadowRadius: expectedRadius,
				surfaceFilter: 'none',
				paintFilter: glass && supportsGlass ? 'blur(12px)' : 'none',
				paintRadius: glass && supportsGlass ? expectedRadius : undefined,
				paintBorderWidth: glass && supportsGlass ? '0px' : undefined,
				paintSize: glass && supportsGlass ? [surface.offsetWidth, surface.offsetHeight] : undefined,
				surfaceBorderWidth: '1px',
				matchingBounds: surface.getBoundingClientRect().toJSON(),
			});

			dialog.dispose();
			await result;
		});
	}
});

suite('Suggestion menu corners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const controlCorners = ['4px', '4px', '4px', '4px'];
	const workbenchClasses = ['modern-ui', 'agent-sessions-workbench'] as const;

	function corners(element: HTMLElement): string[] {
		const style = getWindow(element).getComputedStyle(element);
		return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
	}

	suiteSetup(async () => {
		const root = append(document.body, $('.modern-ui'));
		root.style.setProperty('--vscode-cornerRadius-small', '4px');
		root.style.setProperty('--vscode-cornerRadius-large', '8px');
		const widget = append(root, $('.editor-widget.suggest-widget'));
		const row = append(append(widget, $('.monaco-list')), $('.monaco-list-row'));
		row.dataset.index = '0';
		try {
			// Browser CSS imports can still be loading when the module resolves.
			await retry(async () => assert.deepStrictEqual(corners(row), ['8px', '8px', '4px', '4px']), 10, 100);
		} finally {
			root.remove();
		}
	});

	for (const { workbenchClass, kind } of workbenchClasses.flatMap(workbenchClass =>
		['editor', 'workbench'].map(kind => ({ workbenchClass, kind }))
	)) {
		function createList(count: number, withStatusBar = false, theme = 'vs') {
			const root = append(document.body, $(`.monaco-workbench.${workbenchClass}.${theme}`));
			store.add(toDisposable(() => root.remove()));
			root.style.setProperty('--vscode-cornerRadius-small', '4px');
			root.style.setProperty('--vscode-cornerRadius-large', '8px');
			root.style.setProperty('--vscode-editorSuggestWidget-focusOutline', '#123456');
			const editor = append(root, $(`.monaco-editor.${theme}`));
			const widget = append(editor, $(kind === 'editor' ? '.editor-widget.suggest-widget' : '.workbench-suggest-widget'));
			widget.classList.toggle('with-status-bar', withStatusBar);
			const tree = append(widget, $('.tree'));
			tree.style.height = '60px';
			tree.style.flexShrink = '0';
			const list = store.add(new List<number>('test.suggestionCorners', tree, {
				getHeight: () => 20,
				getTemplateId: () => 'item',
			}, [{
				templateId: 'item',
				renderTemplate: () => { },
				renderElement: () => { },
				disposeTemplate: () => { },
			}]));
			list.layout(60, 200);
			list.splice(0, 0, range(count));
			if (withStatusBar) {
				const statusBar = append(widget, $('.suggest-status-bar'));
				statusBar.style.height = '20px';
				statusBar.style.flexShrink = '0';
			}
			const rows = () => [...tree.querySelectorAll<HTMLElement>('.monaco-list-row')].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
			return { root, widget, list, rows, listElement: list.getHTMLElement() };
		}

		test(`${workbenchClass} ${kind} rounds only logical boundary rows after scrolling`, () => {
			const { widget, list, rows } = createList(12);
			const top = rows().map(corners);
			list.scrollTop = 80;
			const middle = rows().map(corners);
			list.scrollTop = list.scrollHeight;
			const bottom = rows().map(corners);
			list.scrollTop = 0;
			assert.deepStrictEqual({
				widget: corners(widget),
				top,
				middle,
				bottom,
				returnedToTop: rows().map(corners),
			}, {
				widget: ['8px', '8px', '8px', '8px'],
				top: [['8px', '8px', '4px', '4px'], controlCorners, controlCorners],
				middle: [controlCorners, controlCorners, controlCorners],
				bottom: [controlCorners, controlCorners, ['4px', '4px', '8px', '8px']],
				returnedToTop: top,
			});
		});

		test(`${workbenchClass} ${kind} rounds all corners when filtering to one item`, () => {
			const { list, rows } = createList(12);
			list.scrollTop = list.scrollHeight;
			list.splice(0, list.length, [0]);
			list.reveal(0);
			assert.deepStrictEqual(rows().map(corners), [['8px', '8px', '8px', '8px']]);
		});

		for (const withStatusBar of [false, true]) {
			test(`${workbenchClass} ${kind} clips partially scrolled rows to the viewport${withStatusBar ? ' above a footer' : ''}`, () => {
				const { widget, list, listElement } = createList(12, withStatusBar);
				widget.style.position = 'fixed';
				widget.style.left = '100px';
				widget.style.top = '100px';
				widget.style.width = '200px';
				widget.style.height = withStatusBar ? '80px' : '60px';
				widget.style.zIndex = '1000';
				list.setFocus([1]);
				list.scrollTop = 30;
				const bounds = listElement.getBoundingClientRect();
				const style = getWindow(listElement).getComputedStyle(listElement);
				const focusedRow = listElement.querySelector<HTMLElement>('.monaco-list-row.focused')!;
				const rowBounds = focusedRow.getBoundingClientRect();
				const clip = kind === 'editor' ? widget : listElement;
				const clipBounds = clip.getBoundingClientRect();
				assert.deepStrictEqual({
					corners: corners(listElement),
					overflow: [style.overflowX, style.overflowY],
					clipCorners: corners(clip),
					clipOverflow: getWindow(clip).getComputedStyle(clip).overflow,
					outsideCornerHit: focusedRow.contains(document.elementFromPoint(clipBounds.left + 1, clipBounds.top + 1)),
					viewport: [bounds.width, bounds.height],
					scrollTop: list.scrollTop,
					focusedRow: [focusedRow.dataset.index, rowBounds.top - bounds.top, rowBounds.height],
					interiorHit: listElement.contains(document.elementFromPoint(bounds.left + 8, bounds.top + 1)),
				}, {
					corners: kind === 'editor' ? ['0px', '0px', '0px', '0px'] : withStatusBar ? ['8px', '8px', '0px', '0px'] : ['8px', '8px', '8px', '8px'],
					overflow: ['hidden', 'hidden'],
					clipCorners: kind === 'workbench' && withStatusBar ? ['8px', '8px', '0px', '0px'] : ['8px', '8px', '8px', '8px'],
					clipOverflow: 'hidden',
					outsideCornerHit: false,
					viewport: [200, 60],
					scrollTop: 30,
					focusedRow: ['1', -10, 20],
					interiorHit: true,
				});
			});
		}

		test(`${workbenchClass} ${kind} keeps the footer seam at the control tier`, () => {
			const { widget, list, rows, listElement } = createList(1, true);
			const single = rows().map(corners);
			list.splice(0, 1, range(3));
			assert.deepStrictEqual({
				single,
				rows: rows().map(corners),
				viewportBottom: corners(listElement).slice(2),
				widgetOverflow: getWindow(widget).getComputedStyle(widget).overflow,
			}, {
				single: [['8px', '8px', '4px', '4px']],
				rows: [['8px', '8px', '4px', '4px'], controlCorners, controlCorners],
				viewportBottom: ['0px', '0px'],
				widgetOverflow: kind === 'editor' ? 'hidden' : 'visible',
			});
		});

		test(`${workbenchClass} ${kind} preserves boundary focus indicators in every theme`, () => {
			for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
				const { list, rows } = createList(1, false, theme);
				list.setFocus([0]);
				const row = rows()[0];
				const style = getWindow(row).getComputedStyle(row);
				assert.deepStrictEqual({
					corners: corners(row),
					focused: row.classList.contains('focused'),
					...(kind === 'editor' ? { outline: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset } : {}),
				}, {
					corners: ['8px', '8px', '8px', '8px'],
					focused: true,
					...(kind === 'editor' ? { outline: 'solid', outlineWidth: '1px', outlineOffset: '-1px' } : {}),
				});
			}
		});

		test(`${workbenchClass} ${kind} leaves classic suggestions unchanged`, () => {
			const { root, widget, rows, listElement } = createList(1);
			root.classList.remove(workbenchClass);
			assert.deepStrictEqual({
				rows: rows().map(corners),
				viewport: corners(listElement),
				widgetOverflow: getWindow(widget).getComputedStyle(widget).overflow,
			}, {
				rows: [['0px', '0px', '0px', '0px']],
				viewport: kind === 'editor' ? ['8px', '8px', '8px', '8px'] : ['0px', '0px', '0px', '0px'],
				widgetOverflow: 'visible',
			});
		});
	}

	for (const workbenchClass of workbenchClasses) {
		test(`${workbenchClass} workbench suggestion resize sashes remain reachable outside the widget`, () => {
			const root = append(document.body, $(`.monaco-workbench.${workbenchClass}`));
			store.add(toDisposable(() => root.remove()));
			root.style.setProperty('--vscode-cornerRadius-large', '8px');
			const resizable = store.add(new ResizableHTMLElement());
			const widget = append(root, resizable.domNode);
			widget.classList.add('workbench-suggest-widget');
			widget.style.left = '100px';
			widget.style.top = '100px';
			widget.style.zIndex = '1000';
			resizable.layout(60, 200);
			resizable.enableSashes(true, true, true, true);
			const bounds = widget.getBoundingClientRect();
			const isSash = (x: number, y: number) => document.elementFromPoint(x, y)?.classList.contains('monaco-sash') ?? false;
			assert.deepStrictEqual({
				overflow: getWindow(widget).getComputedStyle(widget).overflow,
				top: isSash(bounds.left + 100, bounds.top - 1),
				right: isSash(bounds.left + 201, bounds.top + 30),
				bottom: isSash(bounds.left + 100, bounds.top + 61),
				left: isSash(bounds.left - 1, bounds.top + 30),
			}, {
				overflow: 'visible',
				top: true,
				right: true,
				bottom: true,
				left: true,
			});
		});
	}
});
