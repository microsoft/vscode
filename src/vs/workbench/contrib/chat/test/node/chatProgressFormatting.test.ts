/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { safeIntl } from '../../../../../base/common/date.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Chat timestamp regional formatting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const timestamp = Date.UTC(2026, 8, 11, 0, 48);
	const formattingModule = new URL('../../common/chatProgressFormatting.js', import.meta.url).href;
	const sinonModule = pathToFileURL(createRequire(import.meta.url).resolve('sinon')).href;

	for (const { name, userLocale, osLocale, regionalLocale, timeZone } of [
		{ name: 'Latvian region with English UI and OS language', userLocale: 'en', osLocale: 'en-us', regionalLocale: 'lv-lv', timeZone: 'UTC' },
		{ name: 'British region with an explicit US English UI locale', userLocale: 'en-us', osLocale: 'en-us', regionalLocale: 'en-gb', timeZone: 'UTC' },
		{ name: 'US region with an explicit British English UI locale', userLocale: 'en-gb', osLocale: 'lv-lv', regionalLocale: 'en-us', timeZone: 'UTC' },
		{ name: 'regional hour-cycle extension and local time zone', userLocale: 'en', osLocale: 'en-us', regionalLocale: 'en-us-u-hc-h23', timeZone: 'America/Los_Angeles' },
		{ name: 'older NLS configuration without a regional locale', userLocale: 'en', osLocale: 'en-gb', regionalLocale: undefined, timeZone: 'UTC' },
	]) {
		test(name, async () => {
			// A fresh process resolves the locale before the shared formatters are initialized.
			const { stdout } = await promisify(execFile)(process.env['VSCODE_TEST_ELECTRON_PATH'] ?? process.execPath, [
				'--input-type=module',
				'--eval', `
					import sinon from ${JSON.stringify(sinonModule)};
					import { formatChatRequestTimestamp } from ${JSON.stringify(formattingModule)};
					const clock = sinon.useFakeTimers({ now: ${timestamp}, toFake: ['Date'] });
					try {
						console.log(JSON.stringify(formatChatRequestTimestamp(${timestamp})));
					} finally {
						clock.restore();
					}
				`,
			], {
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: '1',
					VSCODE_NLS_CONFIG: JSON.stringify({ userLocale, osLocale, regionalLocale, resolvedLanguage: 'en' }),
					TZ: timeZone,
				},
				timeout: 10_000,
			});

			const expectedLocale = regionalLocale ?? osLocale;
			assert.deepStrictEqual(JSON.parse(stdout), {
				text: safeIntl.DateTimeFormat(expectedLocale, { hour: 'numeric', minute: '2-digit', timeZone }).value.format(timestamp),
				fullText: safeIntl.DateTimeFormat(expectedLocale, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).value.format(timestamp),
				dateTime: '2026-09-11T00:48:00.000Z',
				isRelative: false,
			});
		});
	}
});
