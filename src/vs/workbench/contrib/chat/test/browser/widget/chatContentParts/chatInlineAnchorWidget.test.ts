/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { renderFileWidgets } from '../../../../browser/widget/chatContentParts/chatInlineAnchorWidget.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';

suite('ChatInlineAnchorWidget Metadata Validation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockAnchorService: IChatMarkdownAnchorService;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);

		// Mock the anchor service
		mockAnchorService = {
			_serviceBrand: undefined,
			register: () => ({ dispose: () => { } }),
			lastFocusedAnchor: undefined
		};

		instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
	});

	function createTestElement(linkText: string, href: string = 'file:///test.txt'): HTMLElement {
		const container = mainWindow.document.createElement('div');
		const anchor = mainWindow.document.createElement('a');
		anchor.textContent = linkText;
		anchor.setAttribute('data-href', href);
		container.appendChild(anchor);
		return container;
	}

	test('renders widget for valid metadata with correct format', () => {
		const validMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 'test.txt'
		});

		const element = createTestElement(validMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for valid metadata');
	});

	test('renders widget for empty link text', () => {
		const element = createTestElement('');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for empty link text');
	});

	test('does not render widget for metadata exceeding length limit', () => {
		// Create a string longer than 1000 characters
		const longMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 'a'.repeat(1000)
		});

		const element = createTestElement(longMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for metadata exceeding length limit');
	});

	test('does not render widget for metadata that is an array', () => {
		const arrayMetadata = JSON.stringify([
			{ vscodeLinkType: 'file', fileName: 'test.txt' }
		]);

		const element = createTestElement(arrayMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for array metadata');
	});

	test('does not render widget for metadata that is a primitive value', () => {
		const primitiveMetadata = JSON.stringify('file:test.txt');

		const element = createTestElement(primitiveMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for primitive metadata');
	});

	test('does not render widget for metadata with null value', () => {
		const element = createTestElement('null');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for null metadata');
	});

	test('does not render widget for metadata missing vscodeLinkType', () => {
		const invalidMetadata = JSON.stringify({
			fileName: 'test.txt'
		});

		const element = createTestElement(invalidMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for metadata missing vscodeLinkType');
	});

	test('does not render widget for metadata with wrong vscodeLinkType', () => {
		const invalidMetadata = JSON.stringify({
			vscodeLinkType: 'folder',
			fileName: 'test.txt'
		});

		const element = createTestElement(invalidMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for metadata with wrong vscodeLinkType');
	});

	test('does not render widget for metadata with non-string fileName', () => {
		const invalidMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 123
		});

		const element = createTestElement(invalidMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for metadata with non-string fileName');
	});

	test('does not render widget for invalid JSON', () => {
		const invalidJSON = '{ vscodeLinkType: "file", fileName: "test.txt" }'; // Missing quotes

		const element = createTestElement(invalidJSON);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for invalid JSON');
	});

	test('does not render widget for regular text that looks like JSON', () => {
		const regularText = 'This is a regular file link';

		const element = createTestElement(regularText);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for regular text');
	});

	test('does not render widget when URI scheme is missing', () => {
		const validMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 'test.txt'
		});

		const element = createTestElement(validMetadata, ''); // Empty href
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered when URI scheme is missing');
	});

	test('handles metadata at exact length limit', () => {
		// Create metadata that is exactly 1000 characters
		const fileNameLength = 1000 - '{"vscodeLinkType":"file","fileName":""}'.length;
		const fileName = 'a'.repeat(fileNameLength);
		const exactLimitMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: fileName
		});

		assert.strictEqual(exactLimitMetadata.length, 1000, 'Metadata should be exactly 1000 characters');

		const element = createTestElement(exactLimitMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for metadata at exact length limit');
	});

	test('handles metadata one character over limit', () => {
		// Create metadata that is 1001 characters
		const fileNameLength = 1001 - '{"vscodeLinkType":"file","fileName":""}'.length;
		const fileName = 'a'.repeat(fileNameLength);
		const overLimitMetadata = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: fileName
		});

		assert.strictEqual(overLimitMetadata.length, 1001, 'Metadata should be 1001 characters');

		const element = createTestElement(overLimitMetadata);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for metadata one character over limit');
	});

	test('handles multiple links in same element', () => {
		const container = mainWindow.document.createElement('div');

		// Add valid metadata link
		const validAnchor = mainWindow.document.createElement('a');
		validAnchor.textContent = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 'valid.txt'
		});
		validAnchor.setAttribute('data-href', 'file:///valid.txt');
		container.appendChild(validAnchor);

		// Add invalid metadata link
		const invalidAnchor = mainWindow.document.createElement('a');
		invalidAnchor.textContent = JSON.stringify({
			vscodeLinkType: 'invalid',
			fileName: 'invalid.txt'
		});
		invalidAnchor.setAttribute('data-href', 'file:///invalid.txt');
		container.appendChild(invalidAnchor);

		// Add empty link text
		const emptyAnchor = mainWindow.document.createElement('a');
		emptyAnchor.textContent = '';
		emptyAnchor.setAttribute('data-href', 'file:///empty.txt');
		container.appendChild(emptyAnchor);

		renderFileWidgets(container, instantiationService, mockAnchorService, disposables);

		const widgets = container.querySelectorAll('.chat-inline-anchor-widget');
		assert.strictEqual(widgets.length, 2, 'Should render widgets for valid and empty link text only');
	});

	test('preserves widget for additional properties in metadata', () => {
		const metadataWithExtra = JSON.stringify({
			vscodeLinkType: 'file',
			fileName: 'test.txt',
			additionalProperty: 'value'
		});

		const element = createTestElement(metadataWithExtra);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered even with additional properties');
	});
});
