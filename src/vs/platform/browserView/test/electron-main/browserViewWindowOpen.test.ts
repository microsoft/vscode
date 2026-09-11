/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IBrowserViewAppPolicy } from '../../common/browserAppPolicy.js';
import { assertBrowserViewCanInheritSession, createBrowserViewWindowOpenHandler, NewPageLocation } from '../../electron-main/browserViewWindowOpen.js';

suite('BrowserViewWindowOpen', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const dispositions = ['foreground-tab', 'background-tab', 'new-window'] as const;

	test('all creation paths reject unsourced children in a confined session', () => {
		const policy = { allowedOrigin: 'http://127.0.0.1:8123' };
		assert.throws(() => assertBrowserViewCanInheritSession(policy, undefined), /cannot open additional browser tabs/);
		assert.doesNotThrow(() => assertBrowserViewCanInheritSession(policy, URI.parse('canvas:/owned')));
		assert.doesNotThrow(() => assertBrowserViewCanInheritSession(undefined, undefined));
	});

	function createHandler(policy?: IBrowserViewAppPolicy) {
		const permissions: NewPageLocation[] = [];
		const external: string[] = [];
		const children: { location: NewPageLocation; url: string }[] = [];
		let userGesture = true;
		const handler = createBrowserViewWindowOpenHandler(() => policy, location => {
			permissions.push(location);
			return location !== NewPageLocation.NewWindow || userGesture;
		}, url => external.push(url), (location, url) => {
			children.push({ location, url });
			return upcastPartial<Electron.WebContents>({ id: 42 });
		});
		const open = (url: string, disposition: Parameters<typeof handler>[0]['disposition']) => {
			const result = handler(upcastPartial<Parameters<typeof handler>[0]>({ url, disposition }));
			result.createWindow?.({});
			return { action: result.action, outlivesOpener: result.outlivesOpener };
		};
		return { open, permissions, external, children, withoutGesture: () => { userGesture = false; } };
	}

	test('same-origin policy popups cannot create generic children even with a user gesture', () => {
		const fixture = createHandler({ allowedOrigin: 'http://127.0.0.1:8123', allowExternalLinks: true });
		const results = dispositions.map(disposition => fixture.open('http://127.0.0.1:8123/canvas?instance=owned', disposition));
		assert.deepStrictEqual({ results, permissions: fixture.permissions, external: fixture.external, children: fixture.children }, {
			results: Array.from({ length: 3 }, () => ({ action: 'deny', outlivesOpener: undefined })),
			permissions: [], external: [], children: [],
		});
	});

	test('ordinary browser tabs and gesture-gated windows retain their existing child behavior', () => {
		const fixture = createHandler();
		const url = 'http://127.0.0.1:8123/page';
		const results = dispositions.map(disposition => fixture.open(url, disposition));
		fixture.withoutGesture();
		results.push(fixture.open(url, 'new-window'));
		assert.deepStrictEqual({ results, children: fixture.children, external: fixture.external }, {
			results: [
				{ action: 'allow', outlivesOpener: true }, { action: 'allow', outlivesOpener: true },
				{ action: 'allow', outlivesOpener: true }, { action: 'deny', outlivesOpener: undefined },
			],
			children: [NewPageLocation.Foreground, NewPageLocation.Background, NewPageLocation.NewWindow].map(location => ({ location, url })),
			external: [],
		});
	});

	test('explicit off-origin handoff requires user intent and never creates an in-app child', () => {
		const fixture = createHandler({ allowedOrigin: 'http://127.0.0.1:8123', allowExternalLinks: true });
		const url = 'https://example.invalid/intentional-link';
		fixture.open(url, 'new-window');
		fixture.withoutGesture();
		fixture.open(url, 'new-window');
		fixture.open('data:text/html,opaque', 'foreground-tab');
		const confined = createHandler({ allowedOrigin: 'http://127.0.0.1:8123' });
		confined.open(url, 'new-window');
		assert.deepStrictEqual({ external: fixture.external, children: fixture.children, confined: confined.external }, {
			external: [url], children: [], confined: [],
		});
	});
});
