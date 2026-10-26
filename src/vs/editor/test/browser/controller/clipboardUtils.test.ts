/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ClipboardStoredMetadata, createClipboardCopyEvent, createClipboardCopyEventFromData, createClipboardPasteEvent, createClipboardPasteEventFromData, InMemoryClipboardMetadataManager } from '../../../browser/controller/editContext/clipboardUtils.js';
import { Selection } from '../../../common/core/selection.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { createTextModel } from '../../common/testTextModel.js';
import { createTestCodeEditor } from '../testCodeEditor.js';

suite('ClipboardUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pasting files copied in a file manager generates text from their paths, falling back to their names', () => {
		// Chromium only exposes the files in this case and withholds the clipboard text
		const files = [
			new File(['hello'], 'example.txt', { type: 'text/plain' }),
			new File(['# hi'], 'notes #1.md', { type: 'text/markdown' }),
		];
		const paths = new Map([
			['example.txt', '/home/john/Downloads/example.txt'],
			['notes #1.md', '/home/john/Downloads/my folder/notes #1.md'],
		]);

		function paste(getFilePath?: (file: File) => string | undefined) {
			const clipboardData = new DataTransfer();
			for (const file of files) {
				clipboardData.items.add(file);
			}
			const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }), getFilePath);
			return { text: event.text, metadata: event.metadata };
		}

		assert.deepStrictEqual({
			filesWithPaths: paste(file => paths.get(file.name)),
			filesWithoutPaths: paste(() => undefined),
			inMemoryFiles: paste(),
		}, {
			filesWithPaths: { text: '/home/john/Downloads/example.txt\n/home/john/Downloads/my folder/notes #1.md', metadata: null },
			filesWithoutPaths: { text: 'example.txt\nnotes #1.md', metadata: null },
			inMemoryFiles: { text: 'example.txt\nnotes #1.md', metadata: null },
		});
	});
});

suite('ClipboardUtils - Clipboard API', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		InMemoryClipboardMetadataManager.INSTANCE.get('');
	});

	test('DOM and Clipboard API copy factories populate their own clipboard targets', () => {
		for (const useDomEvent of [true, false]) {
			for (const isCut of [false, true]) {
				const model = store.add(createTextModel('source', 'clipboard-test'));
				const editor = store.add(createTestCodeEditor(model, { copyWithSyntaxHighlighting: true }));
				const viewModel = editor.getViewModel()!;
				editor.setSelection(new Selection(1, 1, 1, 7));
				const clipboardData = new DataTransfer();
				const browserEvent = new ClipboardEvent(isCut ? 'cut' : 'copy', { clipboardData, cancelable: true });
				const context = new class extends mock<ViewContext>() {
					override readonly viewModel = viewModel;
				};
				const logService = store.add(new NullLogService());
				const event = useDomEvent
					? createClipboardCopyEvent(browserEvent, isCut, context, logService, false)
					: createClipboardCopyEventFromData(clipboardData, isCut, viewModel, logService, false);
				event.clipboardData.setData('application/x-test', 'provider data');
				event.ensureClipboardGetsEditorData();
				const metadataMime = useDomEvent ? 'vscode-editor-data' : 'application/vnd.code.editor-data';
				const metadata: ClipboardStoredMetadata = JSON.parse(clipboardData.getData(metadataMime));
				assert.deepStrictEqual({
					isCut: event.isCut,
					text: clipboardData.getData('text/plain'),
					html: clipboardData.getData('text/html'),
					metadata: { ...metadata, id: typeof metadata.id },
					providerData: clipboardData.getData('application/x-test'),
					defaultPrevented: browserEvent.defaultPrevented,
					handled: event.isHandled,
				}, {
					isCut,
					text: 'source',
					html: event.dataToCopy.html,
					metadata: {
						version: 1,
						id: 'string',
						isFromEmptySelection: false,
						isBlock: false,
						multicursorText: event.dataToCopy.multicursorText,
						mode: event.dataToCopy.mode,
					},
					providerData: 'provider data',
					defaultPrevented: useDomEvent,
					handled: false,
				});
			}
		}
	});

	test('DOM and Clipboard API paste factories accept legacy editor metadata', () => {
		const metadata: ClipboardStoredMetadata = {
			version: 1,
			id: 'legacy-paste',
			isFromEmptySelection: true,
			isBlock: false,
			multicursorText: ['left', 'right'],
			mode: 'test-language',
		};
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', 'left\nright');
		clipboardData.setData('vscode-editor-data', JSON.stringify(metadata));
		const browserEvent = new ClipboardEvent('paste', { clipboardData });
		assert.deepStrictEqual([
			createClipboardPasteEvent(browserEvent).metadata,
			createClipboardPasteEventFromData(clipboardData).metadata,
		], [metadata, metadata]);
	});

	test('DOM and Clipboard API paste factories handle browser events independently', async () => {
		const metadata: ClipboardStoredMetadata = {
			version: 1,
			id: 'paste-test',
			isFromEmptySelection: false,
			isBlock: true,
			multicursorText: ['left', 'right'],
			mode: 'test-language',
		};
		for (const useDomEvent of [true, false]) {
			const clipboardData = new DataTransfer();
			clipboardData.setData('text/plain', 'left\nright');
			clipboardData.setData('application/vnd.code.editor-data', JSON.stringify(metadata));
			clipboardData.setData('application/x-test', 'provider data');
			const browserEvent = new ClipboardEvent('paste', { clipboardData, cancelable: true });
			const event = useDomEvent
				? createClipboardPasteEvent(browserEvent)
				: createClipboardPasteEventFromData(clipboardData);
			const initiallyHandled = event.isHandled;
			const external = event.toExternalVSDataTransfer();
			event.setHandled();
			assert.deepStrictEqual({
				text: event.text,
				metadata: event.metadata,
				providerData: await external?.get('application/x-test')?.asString(),
				browserEvent: event.browserEvent,
				initiallyHandled,
				handled: event.isHandled,
				defaultPrevented: browserEvent.defaultPrevented,
				propagationStopped: browserEvent.cancelBubble,
			}, {
				text: 'left\nright',
				metadata,
				providerData: 'provider data',
				browserEvent: useDomEvent ? browserEvent : undefined,
				initiallyHandled: false,
				handled: true,
				defaultPrevented: useDomEvent,
				propagationStopped: useDomEvent,
			});
		}
	});

	test('DOM and Clipboard API paste factories preserve cached metadata and empty clipboard data', () => {
		const metadata: ClipboardStoredMetadata = {
			version: 1,
			id: 'cached-paste-test',
			isFromEmptySelection: true,
			isBlock: false,
			multicursorText: null,
			mode: null,
		};
		for (const useDomEvent of [true, false]) {
			InMemoryClipboardMetadataManager.INSTANCE.set('cached text', metadata);
			const clipboardData = new DataTransfer();
			clipboardData.setData('text/plain', 'cached text');
			const cached = useDomEvent
				? createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }))
				: createClipboardPasteEventFromData(clipboardData);
			const empty = useDomEvent
				? createClipboardPasteEvent(new ClipboardEvent('paste'))
				: createClipboardPasteEventFromData(new DataTransfer());
			assert.deepStrictEqual({
				cached: { text: cached.text, metadata: cached.metadata },
				empty: { text: empty.text, metadata: empty.metadata, types: empty.clipboardData.types, externalSize: empty.toExternalVSDataTransfer()?.size },
			}, {
				cached: { text: 'cached text', metadata },
				empty: { text: '', metadata: null, types: [], externalSize: useDomEvent ? undefined : 0 },
			});
		}
	});

	test('Clipboard API paste uses file paths and falls back to file names', () => {
		const clipboardData = new DataTransfer();
		clipboardData.items.add(new File(['hello'], 'example.txt', { type: 'text/plain' }));
		clipboardData.items.add(new File(['# hi'], 'notes #1.md', { type: 'text/markdown' }));
		const event = createClipboardPasteEventFromData(clipboardData, file => file.name === 'example.txt' ? '/files/example.txt' : undefined);
		const withoutPaths = createClipboardPasteEventFromData(clipboardData, () => undefined);
		assert.deepStrictEqual({
			text: event.text,
			metadata: event.metadata,
			withoutPaths: withoutPaths.text,
		}, {
			text: '/files/example.txt\nnotes #1.md',
			metadata: null,
			withoutPaths: 'example.txt\nnotes #1.md',
		});
	});

	test('preserves normalized Clipboard API formats for editor metadata and paste providers', async () => {
		const clipboardData = new DataTransfer();
		const metadata: ClipboardStoredMetadata = {
			version: 1,
			id: 'clipboard-test',
			isFromEmptySelection: false,
			isBlock: true,
			multicursorText: ['left', 'right'],
			mode: 'test-language',
		};
		clipboardData.setData('text/plain', 'left\nright');
		clipboardData.setData('application/vnd.code.editor-data', JSON.stringify(metadata));
		clipboardData.setData('application/vnd.code.copymetadata', '{"id":"provider-test"}');
		const event = createClipboardPasteEventFromData(clipboardData);
		const external = event.toExternalVSDataTransfer();
		event.setHandled();
		assert.deepStrictEqual({
			text: event.text,
			metadata: event.metadata,
			types: event.clipboardData.types,
			providerData: event.clipboardData.getData('application/vnd.code.copymetadata'),
			externalProviderData: await external?.get('application/vnd.code.copymetadata')?.asString(),
			handled: event.isHandled,
			browserEvent: event.browserEvent,
		}, {
			text: 'left\nright',
			metadata,
			types: ['text/plain', 'application/vnd.code.editor-data', 'application/vnd.code.copymetadata'],
			providerData: '{"id":"provider-test"}',
			externalProviderData: '{"id":"provider-test"}',
			handled: true,
			browserEvent: undefined,
		});
	});

	test('preserves empty normalized Clipboard API values', async () => {
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', '');
		clipboardData.setData('application/x-test', '');
		const event = createClipboardPasteEventFromData(clipboardData);
		const external = event.toExternalVSDataTransfer();
		assert.deepStrictEqual({
			text: event.text,
			textAlias: event.clipboardData.getData('Text'),
			customData: event.clipboardData.getData('application/x-test'),
			externalCustomData: await external?.get('application/x-test')?.asString(),
			types: event.clipboardData.types,
		}, {
			text: '',
			textAlias: '',
			customData: '',
			externalCustomData: '',
			types: ['text/plain', 'application/x-test'],
		});
	});
});
