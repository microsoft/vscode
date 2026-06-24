/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullExtensionService } from '../../../../services/extensions/common/extensions.js';
import { stub } from 'sinon';
import { NotebookRendererMessagingService } from '../../browser/services/notebookRendererMessagingServiceImpl.js';
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('NotebookRendererMessaging', () => {
	let extService: NullExtensionService;
	let m: NotebookRendererMessagingService;
	let sent: unknown[] = [];

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		sent = [];
		extService = new NullExtensionService();
		m = ds.add(new NotebookRendererMessagingService(extService));
		ds.add(m.onShouldPostMessage(e => sent.push(e)));
	});

	test('activates on prepare', () => {
		const activate = stub(extService, 'activateByEvent').returns(Promise.resolve());
		m.prepare('foo');
		m.prepare('foo');
		m.prepare('foo');

		assert.deepStrictEqual(activate.args, [['onRenderer:foo']]);
	});

	test('buffers and then plays events', async () => {
		stub(extService, 'activateByEvent').returns(Promise.resolve());

		const scoped = m.getScoped('some-editor');
		scoped.postMessage('foo', 1);
		scoped.postMessage('foo', 2);
		assert.deepStrictEqual(sent, []);

		await timeout(0);

		const expected = [
			{ editorId: 'some-editor', rendererId: 'foo', message: 1 },
			{ editorId: 'some-editor', rendererId: 'foo', message: 2 }
		];

		assert.deepStrictEqual(sent, expected);

		scoped.postMessage('foo', 3);

		assert.deepStrictEqual(sent, [
			...expected,
			{ editorId: 'some-editor', rendererId: 'foo', message: 3 }
		]);
	});
});
