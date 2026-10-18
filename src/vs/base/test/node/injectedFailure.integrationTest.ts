/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TEMPORARY (do not merge): proves that a node.js integration test failure fails CI.
suite('INJECTED FAILURE (do not merge) — node.js integration', () => {
	test('a node.js integration test failure fails the step', () => {
		throw new Error('Injected node.js integration failure');
	});
});
