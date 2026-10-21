/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionApplication } from '../../common/sessionApplication.js';

suite('SessionApplication', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes Mission Control clients to existing application identities', () => {
		assert.deepStrictEqual([
			'copilot-vscode', 'copilot-cli', 'copilot-app', 'copilot-web', 'copilot-mobile-ios', 'copilot-mobile-android',
		].map(name => getSessionApplication(name)), [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'github/cli', label: 'Copilot CLI' },
			{ id: 'github/autopilot', label: 'Copilot App' },
			{ id: 'copilot-web', label: 'GitHub' },
			{ id: 'copilot-mobile-ios', label: 'GitHub Mobile (iOS)' },
			{ id: 'copilot-mobile-android', label: 'GitHub Mobile (Android)' },
		]);
	});
});
