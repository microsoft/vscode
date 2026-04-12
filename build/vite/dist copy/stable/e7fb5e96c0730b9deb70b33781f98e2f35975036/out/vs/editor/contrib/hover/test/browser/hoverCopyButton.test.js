/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { HoverCopyButton } from '../../browser/hoverCopyButton.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
suite('Hover Copy Button', () => {
    const disposables = new DisposableStore();
    let clipboardService;
    let hoverService;
    let container;
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
        disposables.add(new HoverCopyButton(container, () => 'test content', clipboardService, hoverService));
        const buttonElement = container.querySelector('.hover-copy-button');
        assert.ok(buttonElement, 'Button element should be created');
        assert.strictEqual(buttonElement?.getAttribute('role'), 'button');
        assert.strictEqual(buttonElement?.getAttribute('tabindex'), '0');
        assert.strictEqual(buttonElement?.getAttribute('aria-label'), 'Copy');
    });
    test('should add hover-row-with-copy class to container', () => {
        assert.ok(!container.classList.contains('hover-row-with-copy'), 'Container should not have class before button creation');
        disposables.add(new HoverCopyButton(container, () => 'test content', clipboardService, hoverService));
        assert.ok(container.classList.contains('hover-row-with-copy'), 'Container should have hover-row-with-copy class after button creation');
    });
    test('should have copy icon', () => {
        disposables.add(new HoverCopyButton(container, () => 'test content', clipboardService, hoverService));
        const icon = container.querySelector('.codicon-copy');
        assert.ok(icon, 'Copy icon should be present');
    });
    test('should copy content on click', async () => {
        const testContent = 'test content to copy';
        disposables.add(new HoverCopyButton(container, () => testContent, clipboardService, hoverService));
        const buttonElement = container.querySelector('.hover-copy-button');
        assert.ok(buttonElement);
        buttonElement.click();
        const copiedText = await clipboardService.readText();
        assert.strictEqual(copiedText, testContent, 'Content should be copied to clipboard');
    });
    test('should copy content on Enter key', async () => {
        const testContent = 'test content for enter key';
        disposables.add(new HoverCopyButton(container, () => testContent, clipboardService, hoverService));
        const buttonElement = container.querySelector('.hover-copy-button');
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
        disposables.add(new HoverCopyButton(container, () => testContent, clipboardService, hoverService));
        const buttonElement = container.querySelector('.hover-copy-button');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJDb3B5QnV0dG9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci90ZXN0L2Jyb3dzZXIvaG92ZXJDb3B5QnV0dG9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFFN0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDbEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRW5FLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7SUFDL0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxJQUFJLGdCQUFzQyxDQUFDO0lBQzNDLElBQUksWUFBMkIsQ0FBQztJQUNoQyxJQUFJLFNBQXNCLENBQUM7SUFFM0IsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLGdCQUFnQixHQUFHLElBQUksb0JBQW9CLEVBQUUsQ0FBQztRQUM5QyxZQUFZLEdBQUcsZ0JBQWdCLENBQUM7UUFDaEMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JELFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEs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