/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { formatSessionConfigChipLabel, shouldShowSessionConfigChipTitle } from '../../common/sessionConfigLabel.js';
import type { SessionConfigPropertySchema } from '../../common/state/protocol/commands.js';

suite('sessionConfigLabel', () => {
	test('returns value-only label when showChipTitle is false', () => {
		assert.strictEqual(formatSessionConfigChipLabel(false, 'Reasoning Effort', 'Medium'), 'Medium');
	});

	test('returns title-prefixed label when showChipTitle is true', () => {
		assert.strictEqual(formatSessionConfigChipLabel(true, 'Approvals', 'On Request'), 'Approvals: On Request');
	});

	test('reads showChipTitle extension from schema object', () => {
		const schema = {
			type: 'string',
			title: 'Approvals',
			enum: ['on-request'],
			showChipTitle: true,
		} as unknown as SessionConfigPropertySchema;

		assert.strictEqual(shouldShowSessionConfigChipTitle(schema), true);
	});
});
