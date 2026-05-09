/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	test('renders widget for link with vscodeLinkType query parameter', () => {
		const element = createTestElement('mySkill', 'file:///test.txt?vscodeLinkType=skill');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for link with vscodeLinkType query parameter');
	});

	test('renders widget for empty link text', () => {
		const element = createTestElement('');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for empty link text');
	});

	test('renders widget for vscodeLinkType=file', () => {
		const element = createTestElement('document.txt', 'file:///path/to/document.txt?vscodeLinkType=file');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for vscodeLinkType=file');
	});

	test('does not render widget for link without vscodeLinkType query parameter', () => {
		const element = createTestElement('regular link text', 'file:///test.txt');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for link without vscodeLinkType query parameter');
	});

	test('does not render widget when URI scheme is missing', () => {
		const element = createTestElement('mySkill', ''); // Empty href
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered when URI scheme is missing');
	});

	test('renders widget with various vscodeLinkType values', () => {
		const element = createTestElement('customName', 'file:///test.txt?vscodeLinkType=custom');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for any vscodeLinkType value');
	});

	test('handles vscodeLinkType with other query parameters', () => {
		const element = createTestElement('skillName', 'file:///test.txt?other=value&vscodeLinkType=skill&another=param');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered when vscodeLinkType is among multiple query parameters');
	});

	test('handles multiple links in same element', () => {
		const container = mainWindow.document.createElement('div');

		// Add link with vscodeLinkType query parameter
		const validAnchor = mainWindow.document.createElement('a');
		validAnchor.textContent = 'validSkill';
		validAnchor.setAttribute('data-href', 'file:///valid.txt?vscodeLinkType=skill');
		container.appendChild(validAnchor);

		// Add link without vscodeLinkType query parameter
		const invalidAnchor = mainWindow.document.createElement('a');
		invalidAnchor.textContent = 'regular text';
		invalidAnchor.setAttribute('data-href', 'file:///invalid.txt');
		container.appendChild(invalidAnchor);

		// Add empty link text
		const emptyAnchor = mainWindow.document.createElement('a');
		emptyAnchor.textContent = '';
		emptyAnchor.setAttribute('data-href', 'file:///empty.txt');
		container.appendChild(emptyAnchor);

		renderFileWidgets(container, instantiationService, mockAnchorService, disposables);

		const widgets = container.querySelectorAll('.chat-inline-anchor-widget');
		assert.strictEqual(widgets.length, 2, 'Should render widgets for link with vscodeLinkType and empty link text only');
	});

	test('uses link text as fileName in metadata', () => {
		const element = createTestElement('myCustomFileName', 'file:///test.txt?vscodeLinkType=skill');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered');
		// The link text becomes the fileName which is used as the label
		const labelElement = widget?.querySelector('.icon-label');
		assert.ok(labelElement?.textContent?.includes('myCustomFileName'), 'Label should contain the link text as fileName');
	});

	test('does not render widget for malformed URI', () => {
		const element = createTestElement('mySkill', '://malformed-uri-without-scheme');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for malformed URI');
	});
});
