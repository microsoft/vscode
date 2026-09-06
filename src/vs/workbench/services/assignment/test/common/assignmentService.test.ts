/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveScopedTreatment } from '../../common/assignmentService.js';

suite('resolveScopedTreatment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const BARE = 'config.chat.agentHost.copilot.multiTurnContextRouting.enabled';
	const SCOPED = `/vscode/${BARE}`;

	function readFrom(values: Record<string, string | number | boolean>): (name: string) => string | number | boolean | undefined {
		return name => values[name];
	}

	test('prefers the /vscode/ scoped value (new endpoint) over the bare value on collision', () => {
		const read = readFrom({ [BARE]: 'legacy', [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('falls back to the bare value when only the legacy endpoint assigns it', () => {
		const read = readFrom({ [BARE]: 'legacy' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'legacy');
	});

	test('uses the scoped value when only the new endpoint assigns it', () => {
		const read = readFrom({ [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('returns undefined when neither endpoint assigns it', () => {
		const read = readFrom({});
		assert.strictEqual(resolveScopedTreatment(read, BARE), undefined);
	});

	test('preserves a defined falsy scoped value instead of falling back to bare', () => {
		const read = readFrom({ [BARE]: true, [SCOPED]: false });
		assert.strictEqual(resolveScopedTreatment(read, BARE), false);
	});
});
