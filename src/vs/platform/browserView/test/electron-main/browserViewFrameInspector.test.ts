/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IElementData } from '../../common/browserView.js';
import { ICDPConnection } from '../../common/cdp/types.js';
import { BrowserViewFrameInspector } from '../../electron-main/browserViewFrameInspector.js';

suite('BrowserViewFrameInspector remote element handles', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const data: IElementData = { outerHTML: '<a>Selected element</a>', computedStyle: '', bounds: { x: 0, y: 0, width: 10, height: 10 } };

	function createInspector(options: { missingElement?: boolean; releaseError?: Error; extract?: () => Promise<IElementData> } = {}) {
		const released: string[] = [];
		const extracted: string[] = [];
		let nextId = 0;
		const connection = new class extends mock<ICDPConnection>() {
			override readonly onEvent = Event.None;
			override readonly onClose = Event.None;
			override async sendCommand(method: string, params?: { objectId?: string }): Promise<object> {
				if (method === 'Runtime.evaluate') {
					return { result: options.missingElement ? {} : { objectId: `element-${++nextId}` } };
				}
				if (method === 'Runtime.releaseObject') {
					assert.ok(params?.objectId);
					released.push(params.objectId);
					if (options.releaseError) {
						throw options.releaseError;
					}
				}
				return {};
			}
		};
		const frame = new class extends mock<Electron.WebFrameMain>() {
			override readonly ipc = new EventEmitter() as Electron.IpcMain;
		};
		const inspector = disposables.add(new class extends BrowserViewFrameInspector {
			override async extractNodeData(id: { backendNodeId?: number; objectId?: string }): Promise<IElementData> {
				assert.ok(id.objectId);
				extracted.push(id.objectId);
				return options.extract ? options.extract() : data;
			}
		}(connection, frame, 'context', 'frame'));
		return { inspector, released, extracted };
	}

	test('releases each temporary handle after returning serialized element data', async () => {
		const { inspector, released, extracted } = createInspector();
		const first = await inspector.extractNodeDataById('first');
		const second = await inspector.extractNodeDataById('second');
		assert.deepStrictEqual({ first, second, released, extracted }, {
			first: data, second: data, released: ['element-1', 'element-2'], extracted: ['element-1', 'element-2']
		});
	});

	test('releases the temporary handle when extraction fails', async () => {
		const error = new Error('Node removed during extraction');
		const { inspector, released } = createInspector({ extract: async () => { throw error; } });
		await assert.rejects(inspector.extractNodeDataById('selected'), candidate => candidate === error);
		assert.deepStrictEqual(released, ['element-1']);
	});

	test('keeps the handle alive until asynchronous extraction completes', async () => {
		const pending = new DeferredPromise<IElementData>();
		const { inspector, released } = createInspector({ extract: () => pending.p });
		const request = inspector.extractNodeDataById('selected');
		await Promise.resolve();
		assert.deepStrictEqual(released, []);
		await pending.complete(data);
		assert.deepStrictEqual({ result: await request, released }, { result: data, released: ['element-1'] });
	});

	test('preserves extracted data if the execution context disappears during release', async () => {
		const { inspector, released } = createInspector({ releaseError: new Error('Context destroyed') });
		assert.deepStrictEqual({ result: await inspector.extractNodeDataById('selected'), released }, { result: data, released: ['element-1'] });
	});

	test('preserves the original extraction error if release also fails', async () => {
		const error = new Error('Extraction failed');
		const { inspector, released } = createInspector({ releaseError: new Error('Context destroyed'), extract: async () => { throw error; } });
		await assert.rejects(inspector.extractNodeDataById('selected'), candidate => candidate === error);
		assert.deepStrictEqual(released, ['element-1']);
	});

	test('does not extract or release when evaluation returns no object handle', async () => {
		const { inspector, released, extracted } = createInspector({ missingElement: true });
		await assert.rejects(inspector.extractNodeDataById('missing'), /Element not found: missing/);
		assert.deepStrictEqual({ released, extracted }, { released: [], extracted: [] });
	});
});
