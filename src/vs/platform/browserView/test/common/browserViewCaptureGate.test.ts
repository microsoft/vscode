/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { BrowserViewCaptureGate } from '../../common/browserViewCaptureGate.js';

suite('BrowserViewCaptureGate', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('takes screenshots one at a time, and holds changes to the view back while a full-page screenshot is taken', async () => {
		const gate = disposables.add(new BrowserViewCaptureGate());
		const steps: string[] = [];
		const visibleArea = new DeferredPromise<string>();
		const fullPage = new DeferredPromise<string>();
		const capture = (name: string, result: Promise<string>) => () => {
			steps.push(`${name} starts`);
			return result;
		};

		const screenshots = Promise.all([
			gate.capture(false, capture('visible area', visibleArea.p)),
			gate.capture(true, capture('full page', fullPage.p)),
			gate.capture(false, capture('next visible area', Promise.resolve('next visible area'))),
		]);
		await timeout(0);
		steps.push('visible area done');
		visibleArea.complete('visible area');
		await timeout(0);
		gate.applyChange(() => steps.push('show'));
		gate.applyChange(() => steps.push('move'));
		steps.push('full page done');
		fullPage.complete('full page');
		const results = await screenshots;
		gate.applyChange(() => steps.push('move again'));

		assert.deepStrictEqual({ steps, results }, {
			steps: ['visible area starts', 'visible area done', 'full page starts', 'full page done', 'show', 'move', 'next visible area starts', 'move again'],
			results: ['visible area', 'full page', 'next visible area'],
		});
	});

	test('applies a change that cannot wait right away, after the changes that wait, and takes the full-page screenshot again', async () => {
		const gate = disposables.add(new BrowserViewCaptureGate());
		const steps: string[] = [];
		const attempts = [new DeferredPromise<string>(), new DeferredPromise<string>()];
		let attempt = 0;

		const screenshot = gate.capture(true, () => {
			steps.push(`full page attempt ${attempt + 1}`);
			return attempts[attempt++].p;
		});
		await timeout(0);
		gate.applyChange(() => steps.push('show'));
		gate.applyChange(() => steps.push('hide'), false);
		gate.applyChange(() => steps.push('move'));
		attempts[0].complete('cut short');
		await timeout(0);
		attempts[1].complete('full page');

		assert.deepStrictEqual({ result: await screenshot, steps }, {
			result: 'full page',
			steps: ['full page attempt 1', 'show', 'hide', 'full page attempt 2', 'move'],
		});
	});

	test('drops the held changes once disposed', async () => {
		const gate = new BrowserViewCaptureGate();
		const steps: string[] = [];
		const fullPage = new DeferredPromise<string>();

		const screenshot = gate.capture(true, () => fullPage.p);
		await timeout(0);
		gate.applyChange(() => steps.push('show'));
		gate.dispose();
		fullPage.complete('full page');

		assert.deepStrictEqual({ result: await screenshot, steps }, { result: 'full page', steps: [] });
	});

	test('stops waiting after a while, so that a screenshot that does not finish cannot freeze the view', () => runWithFakedTimers({}, async () => {
		const gate = disposables.add(new BrowserViewCaptureGate());
		const steps: string[] = [];

		void gate.capture(true, () => new Promise<string>(() => { }));
		const screenshot = gate.capture(false, async () => 'visible area');
		await timeout(0);
		gate.applyChange(() => steps.push('show'));
		await timeout(BrowserViewCaptureGate.MAX_WAIT_MS - 1);
		const stepsBeforeTheLimit = [...steps];
		await timeout(1);

		assert.deepStrictEqual({ stepsBeforeTheLimit, steps, result: await screenshot }, { stepsBeforeTheLimit: [], steps: ['show'], result: 'visible area' });
	}));
});
