/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';

// CompletionProvider tests that can run without the VS Code extension host.
// Tests that require vscode APIs must use the integration test runner.

suite('CompletionProvider — unit helpers', () => {
	test('placeholder test to keep suite present without duplicating implementation details', () => {
		// This test intentionally avoids re-implementing internal logic such as
		// excluded language sets or comment/string detection heuristics.
		// Behavior of CompletionProvider helpers should be covered by integration
		// tests that exercise the real implementation rather than mirroring it here.
		assert.ok(true);
	});
});
