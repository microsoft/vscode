/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getPnpmWorkspacePackageEntry, type IPnpmWorkspaceDocument } from '../features/pnpmWorkspace';

suite('pnpmWorkspace', () => {
	function createMockDocument(content: string): IPnpmWorkspaceDocument {
		const lines = content.split('\n');
		return {
			lineAt: (lineNumber: number) => ({ text: lines[lineNumber] ?? '' })
		};
	}

	test('matches catalog entries on key and value', () => {
		const document = createMockDocument([
			'catalog:',
			'  \'@types/node\': 24.12.0',
		].join('\n'));

		assert.deepStrictEqual([
			getPnpmWorkspacePackageEntry(document, { line: 1, character: 4 }),
			getPnpmWorkspacePackageEntry(document, { line: 1, character: 18 }),
		], [
			{ packageName: '@types/node', range: { line: 1, startCharacter: 2, endCharacter: 15 } },
			{ packageName: '@types/node', range: { line: 1, startCharacter: 17, endCharacter: 24 } },
		]);
	});

	test('matches nested catalogs entries on key and value', () => {
		const document = createMockDocument([
			'catalogs:',
			'  stripe-shop:',
			'    \'@stripe/stripe-js\': 7.3.1',
		].join('\n'));

		assert.deepStrictEqual([
			getPnpmWorkspacePackageEntry(document, { line: 2, character: 6 }),
			getPnpmWorkspacePackageEntry(document, { line: 2, character: 26 }),
		], [
			{ packageName: '@stripe/stripe-js', range: { line: 2, startCharacter: 4, endCharacter: 23 } },
			{ packageName: '@stripe/stripe-js', range: { line: 2, startCharacter: 25, endCharacter: 30 } },
		]);
	});

	test('ignores section headers and unrelated sections', () => {
		const document = createMockDocument([
			'allowBuilds:',
			'  sharp: true',
			'catalog:',
			'  \'@radix-ui/react-portal\': 1.1.10',
		].join('\n'));

		assert.deepStrictEqual([
			getPnpmWorkspacePackageEntry(document, { line: 0, character: 1 }),
			getPnpmWorkspacePackageEntry(document, { line: 1, character: 4 }),
			getPnpmWorkspacePackageEntry(document, { line: 3, character: 16 }),
		], [
			undefined,
			undefined,
			{ packageName: '@radix-ui/react-portal', range: { line: 3, startCharacter: 2, endCharacter: 26 } },
		]);
	});
});
