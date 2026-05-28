/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { formatSessionConfigChipLabel, getSessionConfigChipLabel } from '../../common/sessionConfigLabel.js';
import type { SessionConfigPropertySchema } from '../../common/state/protocol/commands.js';

suite('sessionConfigLabel', () => {
	test('returns value-only label when chipLabel is absent', () => {
		assert.strictEqual(formatSessionConfigChipLabel(undefined, 'Medium'), 'Medium');
	});

	test('returns title-prefixed label when chipLabel is provided', () => {
		assert.strictEqual(formatSessionConfigChipLabel('Approvals', 'On Request'), 'Approvals: On Request');
	});

	test('reads chipLabel extension from schema object', () => {
		const schema = {
			type: 'string',
			title: 'Approvals',
			enum: ['on-request'],
			chipLabel: 'Approvals',
		} as unknown as SessionConfigPropertySchema;

		assert.strictEqual(getSessionConfigChipLabel(schema), 'Approvals');
	});
});
