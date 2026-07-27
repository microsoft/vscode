/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isRestrictedTelemetryEnabled, parseCopilotTokenFields } from '../../node/copilot/copilotTokenFields.js';

suite('copilotTokenFields', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseCopilotTokenFields', () => {
		test('returns empty map for undefined token', () => {
			assert.strictEqual(parseCopilotTokenFields(undefined).size, 0);
		});

		test('returns empty map for empty token', () => {
			assert.strictEqual(parseCopilotTokenFields('').size, 0);
		});

		test('parses fields from the leading colon-delimited segment', () => {
			const fields = parseCopilotTokenFields('tid=abc;exp=123;rt=1:HMACSIGNATURE');
			assert.strictEqual(fields.get('tid'), 'abc');
			assert.strictEqual(fields.get('exp'), '123');
			assert.strictEqual(fields.get('rt'), '1');
		});

		test('parses fields when no colon separator is present', () => {
			const fields = parseCopilotTokenFields('tid=abc;rt=1');
			assert.strictEqual(fields.get('tid'), 'abc');
			assert.strictEqual(fields.get('rt'), '1');
		});

		test('skips segments without a value separator', () => {
			const fields = parseCopilotTokenFields('tid=abc;rt;exp=123:HMAC');
			assert.strictEqual(fields.has('rt'), false);
			assert.strictEqual(fields.get('tid'), 'abc');
			assert.strictEqual(fields.get('exp'), '123');
		});
	});

	suite('isRestrictedTelemetryEnabled', () => {
		test('false for undefined token', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled(undefined), false);
		});

		test('false for empty token', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled(''), false);
		});

		test('false when rt field is missing', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('tid=abc;exp=123:HMAC'), false);
		});

		test('false when rt=0', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('tid=abc;rt=0;exp=123:HMAC'), false);
		});

		test('true when rt=1 with other fields', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('tid=abc;rt=1;exp=123:HMAC'), true);
		});

		test('true when rt=1 is the first field', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('rt=1;tid=abc:HMAC'), true);
		});

		test('true when rt=1 is the last field', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('tid=abc;exp=123;rt=1:HMAC'), true);
		});

		test('true when token has no colon-delimited signature segment', () => {
			assert.strictEqual(isRestrictedTelemetryEnabled('tid=abc;rt=1'), true);
		});
	});
});
