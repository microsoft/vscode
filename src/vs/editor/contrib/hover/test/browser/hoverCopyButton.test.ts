/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { HoverCopyButton } from '../../browser/hoverCopyButton.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { mainWindow } from '../../../../../base/browser/window.js';

suite('Hover Copy Button', () => {
	const disposables = new DisposableStore();
	let clipboardService: TestClipboardService;
	let hoverService: IHoverService;
	let container: HTMLElement;

	setup(() => {
		clipboardService = new TestClipboardService();
		hoverService = NullHoverService;
		container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		disposables.clear();
		if (container.parentElement) {
			container.parentElement.removeChild(container);
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should create button element in container', () => {
		disposables.add(new HoverCopyButton(
			container,
			() => 'test content',
			clipboardService,
			hoverService
		));

		const buttonElement = container.querySelector('.hover-copy-button');
		assert.ok(buttonElement, 'Button element should be created');
		assert.strictEqual(buttonElement?.getAttribute('role'), 'button');
		assert.strictEqual(buttonElement?.getAttribute('tabindex'), '0');
		assert.strictEqual(buttonElement?.getAttribute('aria-label'), 'Copy');
	});

	test('should add hover-row-with-copy class to container', () => {
		assert.ok(!container.classList.contains('hover-row-with-copy'), 'Container should not have class before button creation');

		disposables.add(new HoverCopyButton(
			container,
			() => 'test content',
			clipboardService,
			hoverService
		));

		assert.ok(container.classList.contains('hover-row-with-copy'), 'Container should have hover-row-with-copy class after button creation');
	});

	test('should have copy icon', () => {
		disposables.add(new HoverCopyButton(
			container,
			() => 'test content',
			clipboardService,
			hoverService
		));

		const icon = container.querySelector('.codicon-copy');
		assert.ok(icon, 'Copy icon should be present');
	});

	test('should copy content on click', async () => {
		const testContent = 'test content to copy';
		disposables.add(new HoverCopyButton(
			container,
			() => testContent,
			clipboardService,
			hoverService
		));

		const buttonElement = container.querySelector('.hover-copy-button') as HTMLElement;
		assert.ok(buttonElement);

		buttonElement.click();

		const copiedText = await clipboardService.readText();
		assert.strictEqual(copiedText, testContent, 'Content should be copied to clipboard');
	});

	test('should copy content on Enter key', async () => {
		const testContent = 'test content for enter key';
		disposables.add(new HoverCopyButton(
			container,
			() => testContent,
			clipboardService,
			hoverService
		));

		const buttonElement = container.querySelector('.hover-copy-button') as HTMLElement;
		assert.ok(buttonElement);

		// Simulate Enter key press - need to override keyCode for StandardKeyboardEvent
		const keyEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			code: 'Enter',
			bubbles: true
		});
		Object.defineProperty(keyEvent, 'keyCode', { get: () => 13 }); // Enter keyCode
		buttonElement.dispatchEvent(keyEvent);

		const copiedText = await clipboardService.readText();
		assert.strictEqual(copiedText, testContent, 'Content should be copied on Enter key');
	});

	test('should copy content on Space key', async () => {
		const testContent = 'test content for space key';
		disposables.add(new HoverCopyButton(
			container,
			() => testContent,
			clipboardService,
			hoverService
		));

		const buttonElement = container.querySelector('.hover-copy-button') as HTMLElement;
		assert.ok(buttonElement);

		// Simulate Space key press - need to override keyCode for StandardKeyboardEvent
		const keyEvent = new KeyboardEvent('keydown', {
			key: ' ',
			code: 'Space',
			bubbles: true
		});
		Object.defineProperty(keyEvent, 'keyCode', { get: () => 32 }); // Space keyCode
		buttonElement.dispatchEvent(keyEvent);

		const copiedText = await clipboardService.readText();
		assert.strictEqual(copiedText, testContent, 'Content should be copied on Space key');
	});
});
