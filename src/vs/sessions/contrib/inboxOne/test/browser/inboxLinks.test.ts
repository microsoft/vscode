/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { openInboxLink } from '../../browser/inboxLinks.js';

suite('Inbox links', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const scheme of ['http', 'https', 'file', 'vscode-remote']) {
		test(`${scheme} uses the appropriate opener policy`, async () => {
			const uri = URI.from({ scheme, authority: 'example.test', path: '/artifact' });
			let options: OpenOptions | undefined;
			const opener = upcastPartial<IOpenerService>({
				open: async (target, suppliedOptions) => {
					assert.strictEqual(target, uri);
					options = suppliedOptions;
					return true;
				},
			});
			const opened = await openInboxLink(opener, uri);
			assert.deepStrictEqual({ opened, options }, {
				opened: true,
				options: scheme === 'http' || scheme === 'https'
					? { fromUserGesture: true, openExternal: true, allowContributedOpeners: true }
					: { fromUserGesture: true },
			});
		});
	}

	test('preserves opener failures', async () => {
		const error = new Error('Open failed');
		await assert.rejects(openInboxLink(upcastPartial<IOpenerService>({
			open: async () => { throw error; },
		}), URI.parse('https://example.test/')), error);
	});
});
