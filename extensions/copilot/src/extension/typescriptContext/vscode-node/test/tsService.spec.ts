/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';

import type * as vscode from 'vscode';
import { suite, test, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { TypeScript } from '../tsService';

suite('TypeScript service', () => {
	test('prefers the current TS7 extension and falls back to the legacy extension', () => {
		const currentExtensionId = 'typescriptteam.vscode-typescript';
		const legacyExtensionId = 'typescriptteam.native-preview';
		const scenarios = [
			[currentExtensionId, legacyExtensionId],
			[legacyExtensionId],
			[],
		];

		const actual = scenarios.map(extensionIds => {
			const available = new Map<string, vscode.Extension<unknown>>();
			for (const extensionId of extensionIds) {
				available.set(extensionId, { id: extensionId } as vscode.Extension<unknown>);
			}
			const lookups: string[] = [];
			const extension = TypeScript.getVersion7Extension(extensionId => {
				lookups.push(extensionId);
				return available.get(extensionId);
			});
			return { selected: extension?.id, lookups };
		});

		assert.deepStrictEqual(actual, [
			{ selected: currentExtensionId, lookups: [currentExtensionId] },
			{ selected: legacyExtensionId, lookups: [currentExtensionId, legacyExtensionId] },
			{ selected: undefined, lookups: [currentExtensionId, legacyExtensionId] },
		]);
	});
});
