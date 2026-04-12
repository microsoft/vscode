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
    let disposables;
    let instantiationService;
    let mockAnchorService;
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
    function createTestElement(linkText, href = 'file:///test.txt') {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElubGluZUFuY2hvcldpZGdldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdElubGluZUFuY2hvcldpZGdldC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRXRILEtBQUssQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7SUFDeEQsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLFdBQTRCLENBQUM7SUFDakMsSUFBSSxvQkFBc0UsQ0FBQztJQUMzRSxJQUFJLGlCQUE2QyxDQUFDO0lBRWxELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDL0Msb0JBQW9CLEdBQUcsNkJBQTZCLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXZFLDBCQUEwQjtRQUMxQixpQkFBaUIsR0FBRztZQUNuQixhQUFhLEVBQUUsU0FBUztZQUN4QixRQUFRLEVB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