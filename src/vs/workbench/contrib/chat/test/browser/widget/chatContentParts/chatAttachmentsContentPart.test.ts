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
import { IChatRequestVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';

suite('ChatAttachmentsContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);
	});

	teardown(() => {
		disposables.dispose();
	});

	function createFileEntry(name: string, uri?: URI): IChatRequestVariableEntry {
		const fileUri = uri ?? URI.file(`/test/${name}`);
		return {
			kind: 'file',
			id: `file-${name}`,
			name,
			fullName: fileUri.path,
			value: fileUri
		};
	}

	function createImageEntry(name: string, buffer: Uint8Array, mimeType: string = 'image/png'): IChatRequestVariableEntry {
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
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Initial state should have 2 attachments
			const initialAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(initialAttachments.length, 2, 'Should have 2 initial attachments');

			// Update with new variables
			const newVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts'),
				createFileEntry('file3.ts')
			];

			part.updateVariables(newVariables);

			// Should now have 3 attachments
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 3, 'Should have 3 attachments after update');
		});

		test('should handle updating from file to image', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('image.png')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Initial state should have 1 file attachment
			assert.strictEqual(part.domNode!.querySelectorAll('.chat-attached-context-attachment').length, 1);

			// Update with image entry (simulating lazy load completion)
			const imageBuffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
			const newVariables: IChatRequestVariableEntry[] = [
				createImageEntry('image.png', imageBuffer)
			];

			part.updateVariables(newVariables);

			// Should still have 1 attachment (now as image)
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 1, 'Should have 1 attachment after update');
		});

		test('should preserve contextMenuHandler after update', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables }
			));

			const handler = () => { /* handler logic */ };
			part.contextMenuHandler = handler;

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Update with new variables
			const newVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			part.updateVariables(newVariables);

			// The handler property should be preserved (updateVariables doesn't clear it)
			assert.strictEqual(part.contextMenuHandler, handler, 'contextMenuHandler should be preserved after update');
		});

		test('should handle empty variables array', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			assert.strictEqual(part.domNode!.querySelectorAll('.chat-attached-context-attachment').length, 1);

			// Update with empty array
			part.updateVariables([]);

			// Should have no attachments
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 0, 'Should have 0 attachments after clearing');
		});

		test('should handle updating same variables (no-op)', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Update with same variables (different array, same content)
			part.updateVariables([...variables]);

			// Should re-render (we don't optimize for same content)
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 2, 'Should still have 2 attachments');
		});
	});

	suite('basic rendering', () => {
		test('should render file attachments', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			const attachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(attachments.length, 2, 'Should render 2 file attachments');
		});

		test('should have chat-attached-context class on domNode', () => {
			const variables: IChatRequestVariableEntry[] = [createFileEntry('file.ts')];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables }
			));

			assert.ok(part.domNode!.classList.contains('chat-attached-context'), 'Should have chat-attached-context class');
		});
	});
});
