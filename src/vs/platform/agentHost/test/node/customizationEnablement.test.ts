/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { sortCustomizationEnablement, withCustomizationEnablement } from '../../common/customizationEnablement.js';
import { CustomizationEnablementKind } from '../../common/state/protocol/channels-session/state.js';

suite('Customization enablement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts decisions by specificity and preserves equal-kind order', () => {
		assert.deepStrictEqual(sortCustomizationEnablement([
			{ kind: CustomizationEnablementKind.Global, enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
			{ kind: CustomizationEnablementKind.Session, enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
		]), [
			{ kind: CustomizationEnablementKind.Session, enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		]);
	});

	test('preserves an already sorted input and accepts an empty input', () => {
		const sorted = [
			{ kind: CustomizationEnablementKind.Session, enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		] as const;

		assert.deepStrictEqual({
			sorted: sortCustomizationEnablement(sorted),
			empty: sortCustomizationEnablement([]),
		}, {
			sorted,
			empty: [],
		});
	});

	test('replaces one kind while preserving other decisions in sorted order', () => {
		assert.deepStrictEqual(withCustomizationEnablement(
			[
				{ kind: CustomizationEnablementKind.Global, enabled: false },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: true },
				{ kind: CustomizationEnablementKind.Session, enabled: false },
			],
			CustomizationEnablementKind.Workspace,
			[
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
			],
		), [
			{ kind: CustomizationEnablementKind.Session, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
			{ kind: CustomizationEnablementKind.Global, enabled: false },
		]);
	});
});
