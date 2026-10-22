/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { createFileDataTransferItem, createStringDataTransferItem, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readClipboardData, supportsClipboardData, writeClipboardData } from '../../browser/clipboardData.js';

class TestClipboardItem implements ClipboardItem {
	readonly presentationStyle = 'unspecified';
	readonly types: string[];

	constructor(private readonly data: Record<string, string | Blob | PromiseLike<string | Blob>>) {
		this.types = Object.keys(data);
	}

	static supports(type: string): boolean {
		return ['text/plain', 'text/html', 'image/png'].includes(type) || type.startsWith('web ');
	}

	async getType(type: string): Promise<Blob> {
		if (!this.types.includes(type)) {
			throw new DOMException('Missing clipboard format', 'NotFoundError');
		}
		const value = await this.data[type];
		return typeof value === 'string' ? new Blob([value], { type }) : value;
	}
}

class TestClipboard extends EventTarget implements Clipboard {
	items: ClipboardItem[] = [];
	writes = 0;

	async read(): Promise<ClipboardItem[]> {
		return this.items;
	}

	async readText(): Promise<string> {
		const item = this.items.find(item => item.types.includes('text/plain'));
		return item ? (await item.getType('text/plain')).text() : '';
	}

	async write(items: ClipboardItem[]): Promise<void> {
		++this.writes;
		if (!items.length) {
			return;
		}
		await Promise.all(items.flatMap(item => item.types.map(type => item.getType(type))));
		this.items = items;
	}

	async writeText(text: string): Promise<void> {
		await this.write([new TestClipboardItem({ 'text/plain': text })]);
	}
}

suite('Clipboard data', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requires support for rich reads, writes and custom formats', () => {
		class StandardClipboardItem extends TestClipboardItem {
			static override supports(type: string): boolean {
				return type === 'text/plain';
			}
		}
		assert.deepStrictEqual({
			supported: supportsClipboardData(new TestClipboard(), TestClipboardItem),
			insecureContext: supportsClipboardData(undefined, TestClipboardItem),
			missingClipboardItem: supportsClipboardData(new TestClipboard(), undefined),
			standardFormatsOnly: supportsClipboardData(new TestClipboard(), StandardClipboardItem),
		}, {
			supported: true,
			insecureContext: false,
			missingClipboardItem: false,
			standardFormatsOnly: false,
		});
	});

	test('round trips text, HTML, custom metadata and image bytes', async () => {
		const data = new VSDataTransfer();
		data.replace('text/plain', createStringDataTransferItem('first\r\nsecond'));
		data.replace('text/html', createStringDataTransferItem('<b>first</b><br>second'));
		data.replace('application/vnd.code.editor-data', createStringDataTransferItem('{"version":1,"isBlock":true}'));
		data.replace('application/vnd.code.copymetadata', createStringDataTransferItem('{"id":"copy-provider"}'));
		data.replace('image/png', createFileDataTransferItem('source.png', undefined, async () => new Uint8Array([1, 2, 3])));

		const clipboard = new TestClipboard();
		await writeClipboardData(clipboard, data, TestClipboardItem);
		const result = await readClipboardData(clipboard);
		const image = result.get('image/png')?.asFile();
		assert.ok(image);
		assert.deepStrictEqual({
			formats: clipboard.items[0].types,
			text: await result.get('text/plain')?.asString(),
			html: await result.get('text/html')?.asString(),
			editorMetadata: await result.get('application/vnd.code.editor-data')?.asString(),
			providerMetadata: await result.get('application/vnd.code.copymetadata')?.asString(),
			image: { name: image.name, bytes: Array.from(await image.data()) },
		}, {
			formats: ['text/plain', 'text/html', 'web application/vnd.code.editor-data', 'web application/vnd.code.copymetadata', 'image/png'],
			text: 'first\r\nsecond',
			html: '<b>first</b><br>second',
			editorMetadata: '{"version":1,"isBlock":true}',
			providerMetadata: '{"id":"copy-provider"}',
			image: { name: 'image.png', bytes: [1, 2, 3] },
		});
	});

	test('starts writing while asynchronous text is still pending', async () => {
		const text = new DeferredPromise<string>();
		const data = new VSDataTransfer();
		data.replace('text/plain', createStringDataTransferItem(text.p));
		const clipboard = new TestClipboard();
		const write = writeClipboardData(clipboard, data, TestClipboardItem);
		const writesBeforeTextResolved = clipboard.writes;
		text.complete('from the initiating user gesture');
		await write;
		assert.deepStrictEqual({
			writesBeforeTextResolved,
			text: await clipboard.readText(),
		}, {
			writesBeforeTextResolved: 1,
			text: 'from the initiating user gesture',
		});
	});

	test('empty clipboard data remains an empty successful read', async () => {
		const data = await readClipboardData(new TestClipboard());
		assert.strictEqual(data.size, 0);
	});

	test('writing an empty transfer leaves the clipboard unchanged', async () => {
		const clipboard = new TestClipboard();
		await clipboard.writeText('unchanged');
		await writeClipboardData(clipboard, new VSDataTransfer(), TestClipboardItem);
		assert.strictEqual(await clipboard.readText(), 'unchanged');
	});

	test('propagates read and write failures', async () => {
		const error = new DOMException('Clipboard access denied', 'NotAllowedError');
		const clipboard = new class extends TestClipboard {
			override async read(): Promise<ClipboardItem[]> { throw error; }
			override async write(): Promise<void> { throw error; }
		};
		const data = new VSDataTransfer();
		data.replace('text/plain', createStringDataTransferItem('not copied'));
		await assert.rejects(readClipboardData(clipboard), err => err === error);
		await assert.rejects(writeClipboardData(clipboard, data, TestClipboardItem), err => err === error);
	});
});
