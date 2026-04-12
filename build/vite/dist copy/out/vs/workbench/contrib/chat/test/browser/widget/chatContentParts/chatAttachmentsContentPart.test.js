/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatAttachmentsContentPart } from '../../../../browser/widget/chatContentParts/chatAttachmentsContentPart.js';
suite('ChatAttachmentsContentPart', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    setup(() => {
        disposables = store.add(new DisposableStore());
        instantiationService = workbenchInstantiationService(undefined, store);
    });
    teardown(() => {
        disposables.dispose();
    });
    function createFileEntry(name, uri) {
        const fileUri = uri ?? URI.file(`/test/${name}`);
        return {
            kind: 'file',
            id: `file-${name}`,
            name,
            fullName: fileUri.path,
            value: fileUri
        };
    }
    function createImageEntry(name, buffer, mimeType = 'image/png') {
        return {
            kind: 'image',
            id: `image-${name}`,
            name,
            value: buffer,
            mimeType,
            isURL: false,
            references: [{ kind: 'reference', reference: URI.file(`/test/${name}`) }]
        };
    }
    suite('updateVariables', () => {
        test('should update variables and re-render', () => {
            const initialVariables = [
                createFileEntry('file1.ts'),
                createFileEntry('file2.ts')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables: initialVariables }));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            // Initial state should have 2 attachments
            const initialAttachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(initialAttachments.length, 2, 'Should have 2 initial attachments');
            // Update with new variables
            const newVariables = [
                createFileEntry('file1.ts'),
                createFileEntry('file2.ts'),
                createFileEntry('file3.ts')
            ];
            part.updateVariables(newVariables);
            // Should now have 3 attachments
            const updatedAttachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(updatedAttachments.length, 3, 'Should have 3 attachments after update');
        });
        test('should handle updating from file to image', () => {
            const initialVariables = [
                createFileEntry('image.png')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables: initialVariables }));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            // Initial state should have 1 file attachment
            assert.strictEqual(part.domNode.querySelectorAll('.chat-attached-context-attachment').length, 1);
            // Update with image entry (simulating lazy load completion)
            const imageBuffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
            const newVariables = [
                createImageEntry('image.png', imageBuffer)
            ];
            part.updateVariables(newVariables);
            // Should still have 1 attachment (now as image)
            const updatedAttachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(updatedAttachments.length, 1, 'Should have 1 attachment after update');
        });
        test('should preserve contextMenuHandler after update', () => {
            const initialVariables = [
                createFileEntry('file1.ts')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables: initialVariables }));
            const handler = () => { };
            part.contextMenuHandler = handler;
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            // Update with new variables
            const newVariables = [
                createFileEntry('file1.ts'),
                createFileEntry('file2.ts')
            ];
            part.updateVariables(newVariables);
            // The handler property should be preserved (updateVariables doesn't clear it)
            assert.strictEqual(part.contextMenuHandler, handler, 'contextMenuHandler should be preserved after update');
        });
        test('should handle empty variables array', () => {
            const initialVariables = [
                createFileEntry('file1.ts')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables: initialVariables }));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            assert.strictEqual(part.domNode.querySelectorAll('.chat-attached-context-attachment').length, 1);
            // Update with empty array
            part.updateVariables([]);
            // Should have no attachments
            const updatedAttachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(updatedAttachments.length, 0, 'Should have 0 attachments after clearing');
        });
        test('should handle updating same variables (no-op)', () => {
            const variables = [
                createFileEntry('file1.ts'),
                createFileEntry('file2.ts')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables }));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            // Update with same variables (different array, same content)
            part.updateVariables([...variables]);
            // Should re-render (we don't optimize for same content)
            const updatedAttachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(updatedAttachments.length, 2, 'Should still have 2 attachments');
        });
    });
    suite('basic rendering', () => {
        test('should render file attachments', () => {
            const variables = [
                createFileEntry('file1.ts'),
                createFileEntry('file2.ts')
            ];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables }));
            mainWindow.document.body.appendChild(part.domNode);
            disposables.add(toDisposable(() => part.domNode?.remove()));
            const attachments = part.domNode.querySelectorAll('.chat-attached-context-attachment');
            assert.strictEqual(attachments.length, 2, 'Should render 2 file attachments');
        });
        test('should have chat-attached-context class on domNode', () => {
            const variables = [createFileEntry('file.ts')];
            const part = store.add(instantiationService.createInstance(ChatAttachmentsContentPart, { variables }));
            assert.ok(part.domNode.classList.contains('chat-attached-context'), 'Should have chat-attached-context class');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUd2SCxLQUFLLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO0lBQ3hDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxXQUE0QixDQUFDO0lBQ2pDLElBQUksb0JBQXNFLENBQUM7SUFFM0UsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLFdBQVcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUMvQyxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsV0FBVyxDQUFDLE9BQU8sRUFBRSxD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