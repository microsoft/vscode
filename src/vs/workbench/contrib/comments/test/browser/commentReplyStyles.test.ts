/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../base/browser/ui/inputbox/inputBox.css';
import '../../../../../editor/contrib/placeholderText/browser/placeholderText.css';
import '../../browser/media/review.css';

suite('Floating comment reply styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('matches workbench input typography and spacing instead of the code editor font', () => {
		const editor = dom.$('.monaco-editor');
		editor.style.fontFamily = 'sans-serif';
		editor.style.fontSize = '13px';
		editor.style.lineHeight = '20px';
		editor.style.setProperty('--comment-thread-editor-font-family', 'monospace');
		editor.style.setProperty('--vscode-spacing-size40', '4px');
		editor.style.setProperty('--vscode-spacing-size60', '6px');
		editor.style.setProperty('--vscode-cornerRadius-small', '4px');
		editor.style.setProperty('--vscode-fontWeight-regular', '400');
		editor.style.setProperty('--vscode-editorCommentsWidget-replyInputBackground', 'rgb(30, 40, 50)');
		editor.style.setProperty('--vscode-editor-placeholder-foreground', 'rgb(140, 150, 160)');
		mainWindow.document.body.appendChild(editor);
		store.add(toDisposable(() => editor.remove()));
		const floating = dom.append(editor, dom.$('.comment-thread-floating-widget'));
		const widget = dom.append(floating, dom.$('.review-widget'));
		const body = dom.append(widget, dom.$('.body'));
		const container = dom.append(body, dom.$('.comment-form-container'));
		const form = dom.append(container, dom.$('.comment-form'));
		const reply = dom.append(form, dom.$('button.review-thread-reply-button'));
		reply.textContent = 'Reply...';
		const inputBox = dom.append(editor, dom.$('.monaco-inputbox'));
		const input = dom.append(dom.append(inputBox, dom.$('.ibwrapper')), dom.$('input.input'));
		const inputStyle = mainWindow.getComputedStyle(input);
		const replyStyle = mainWindow.getComputedStyle(reply);
		const measurements = [200, 400].map(width => {
			floating.style.width = `${width}px`;
			return {
				fontFamily: replyStyle.fontFamily,
				fontSize: replyStyle.fontSize,
				padding: replyStyle.padding,
				fitsForm: reply.getBoundingClientRect().width === form.getBoundingClientRect().width,
			};
		});

		assert.deepStrictEqual({
			measurements,
			background: replyStyle.backgroundColor,
			placeholder: replyStyle.color,
			radius: replyStyle.borderRadius,
			weight: replyStyle.fontWeight,
		}, {
			measurements: [200, 400].map(() => ({
				fontFamily: inputStyle.fontFamily,
				fontSize: inputStyle.fontSize,
				padding: inputStyle.padding,
				fitsForm: true,
			})),
			background: 'rgb(30, 40, 50)',
			placeholder: 'rgb(140, 150, 160)',
			radius: '4px',
			weight: '400',
		});
	});

	test('keeps the reply background and placeholder consistent with editor theme colors', () => {
		const editor = dom.$('.monaco-editor');
		editor.style.setProperty('--vscode-spacing-size40', '4px');
		editor.style.setProperty('--vscode-spacing-size60', '6px');
		editor.style.setProperty('--vscode-strokeThickness', '1px');
		editor.style.setProperty('--vscode-cornerRadius-small', '4px');
		editor.style.setProperty('--vscode-input-background', 'rgb(255, 255, 255)');
		editor.style.setProperty('--vscode-input-placeholderForeground', 'rgb(0, 0, 0)');
		editor.style.setProperty('--vscode-editorCommentsWidget-replyInputBackground', 'rgb(30, 40, 50)');
		editor.style.setProperty('--vscode-editor-foreground', 'rgb(255, 255, 255)');
		editor.style.setProperty('--vscode-editor-placeholder-foreground', 'rgb(200, 200, 200)');
		editor.style.setProperty('--vscode-focusBorder', 'rgb(0, 120, 200)');
		mainWindow.document.body.appendChild(editor);
		store.add(toDisposable(() => editor.remove()));
		const floating = dom.append(editor, dom.$('.comment-thread-floating-widget'));
		const widget = dom.append(floating, dom.$('.review-widget'));
		const body = dom.append(widget, dom.$('.body'));
		const container = dom.append(body, dom.$('.comment-form-container.expand'));
		const form = dom.append(container, dom.$('.comment-form'));
		const reply = dom.append(form, dom.$('button.review-thread-reply-button'));
		const expanded = dom.append(form, dom.$('.monaco-editor.focused'));
		const background = dom.append(expanded, dom.$('.monaco-editor-background'));
		const placeholder = dom.append(expanded, dom.$('.editorPlaceholder'));
		const text = dom.append(expanded, dom.$('.view-line'));
		text.style.color = 'var(--vscode-editor-foreground)';
		const replyStyle = mainWindow.getComputedStyle(reply);
		const expandedStyle = mainWindow.getComputedStyle(expanded);

		assert.deepStrictEqual({
			background: expandedStyle.backgroundColor,
			textBackground: mainWindow.getComputedStyle(background).backgroundColor,
			text: mainWindow.getComputedStyle(text).color,
			placeholder: mainWindow.getComputedStyle(placeholder).color,
			radius: expandedStyle.borderRadius,
			paddingLeft: expandedStyle.paddingLeft,
			paddingRight: expandedStyle.paddingRight,
			paddingTop: expandedStyle.paddingTop,
			focus: [expandedStyle.outlineColor, expandedStyle.outlineStyle, expandedStyle.outlineWidth],
		}, {
			background: replyStyle.backgroundColor,
			textBackground: replyStyle.backgroundColor,
			text: 'rgb(255, 255, 255)',
			placeholder: replyStyle.color,
			radius: replyStyle.borderRadius,
			paddingLeft: replyStyle.paddingLeft,
			paddingRight: replyStyle.paddingRight,
			paddingTop: '0px',
			focus: ['rgb(0, 120, 200)', 'solid', '1px'],
		});
	});
});
