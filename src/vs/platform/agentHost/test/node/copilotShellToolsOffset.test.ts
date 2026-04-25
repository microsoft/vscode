/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getContentSinceOffset } from '../../node/copilot/copilotShellTools.js';

suite('CopilotShellToolOutput', () => {
	test('keeps current content when the saved offset is no longer valid', () => {
		assert.strictEqual(getContentSinceOffset('hello', Number.NaN), 'hello');
		assert.strictEqual(getContentSinceOffset('hello', -1), 'hello');
		assert.strictEqual(getContentSinceOffset('hello', 99), 'hello');
		assert.strictEqual(getContentSinceOffset('hello', 2), 'llo');
	});
});
