/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { NullLogService } from '../../../log/common/log.js';
import { BrowserClipboardService } from '../../browser/clipboardService.js';

class TestLayoutService extends mock<ILayoutService>() {
	override readonly mainContainer = mainWindow.document.implementation.createHTMLDocument().body;
	override readonly onDidAddContainer = Event.None;
}

class PendingWriteClipboardService extends BrowserClipboardService {
	setPendingWrite(data: DeferredPromise<string>, result: Promise<void>): void {
		this.webKitPendingClipboardWrite = { data, result };
	}

	get hasPendingWrite(): boolean {
		return !!this.webKitPendingClipboardWrite;
	}
}

suite('BrowserClipboardService text writes', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the Safari clipboard write acknowledgement', async () => {
		const service = disposables.add(new PendingWriteClipboardService(new TestLayoutService(), disposables.add(new NullLogService())));
		const data = new DeferredPromise<string>();
		const result = new DeferredPromise<void>();
		service.setPendingWrite(data, result.p);
		let finished = false;
		const write = service.writeText('copied text').then(() => { finished = true; });
		try {
			const copiedText = await data.p;
			const beforeWrite = { finished, hasPendingWrite: service.hasPendingWrite };
			result.complete();
			await write;
			assert.deepStrictEqual({ copiedText, beforeWrite, finished }, {
				copiedText: 'copied text',
				beforeWrite: { finished: false, hasPendingWrite: false },
				finished: true,
			});
		} finally {
			if (!result.isSettled) {
				result.complete();
			}
			await write;
		}
	});

	test('rejects when the Safari clipboard write fails after receiving its data', async () => {
		const service = disposables.add(new PendingWriteClipboardService(new TestLayoutService(), disposables.add(new NullLogService())));
		const data = new DeferredPromise<string>();
		const result = new DeferredPromise<void>();
		service.setPendingWrite(data, result.p);
		const error = new Error('Clipboard access denied');
		const rejection = assert.rejects(service.writeText('copied text'), err => err === error);
		const copiedText = await data.p;
		result.error(error);
		await rejection;
		assert.deepStrictEqual({ copiedText, hasPendingWrite: service.hasPendingWrite }, {
			copiedText: 'copied text',
			hasPendingWrite: false,
		});
	});
});
