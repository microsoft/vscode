/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function testRedundantHasBeforeDelete() {
	const m = new Map<string, number>();
	const s = new Set<string>();

	// Invalid cases
	m.delete('key');

	s.delete('key');

	// Cases with else clause
	if (!m.delete('key')) {
		console.log('not found');
	}

	if (m.delete('key')) {
		console.log('deleted');
	} else {
		console.log('not found');
	}

	// Valid cases
	m.delete('key');
	s.delete('key');

	if (m.has('key')) {
		console.log('deleting');
		m.delete('key');
	}

	if (m.has('key')) {
		m.delete('otherKey');
	}
}
