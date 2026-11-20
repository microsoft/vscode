/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { renderSection } from '../../browser/chatDebug/chatDebugToolCallContentRenderer.js';

suite('Chat debug section copy button', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('copies the section without collapsing it and shows feedback only after success', async () => {
		const clock = sinon.useFakeTimers();
		const pending = new DeferredPromise<void>();
		const copied: string[] = [];
		const clipboard = new class extends mock<IClipboardService>() {
			override async writeText(value: string): Promise<void> {
				copied.push(value);
				await pending.p;
			}
		}();
		const container = $('div');
		renderSection(container, 'Arguments', '{"path":"file.ts"}', undefined, store.add(new DisposableStore()), false, clipboard);
		const button = container.querySelector<HTMLElement>('.chat-debug-section-copy-btn')!;
		const wrapper = container.querySelector<HTMLElement>('.chat-debug-message-section-content-wrapper')!;
		const states: object[] = [];
		const record = () => states.push({
			label: button.getAttribute('aria-label'),
			check: button.classList.contains('codicon-check'),
			display: wrapper.style.display,
		});

		button.click();
		record();
		await pending.complete();
		await Promise.resolve();
		await Promise.resolve();
		record();
		clock.tick(1200);
		record();

		assert.deepStrictEqual({ copied, states }, {
			copied: ['{"path":"file.ts"}'],
			states: [
				{ label: 'Copy', check: false, display: 'block' },
				{ label: 'Copied', check: true, display: 'block' },
				{ label: 'Copy', check: false, display: 'block' },
			],
		});
	});
});
