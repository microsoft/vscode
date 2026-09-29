/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { ApiProposalName } from '../../../../../platform/extensions/common/extensionsApiProposals.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../common/extensions.js';

suite('Proposed API checks', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function desc(id: string, enabledApiProposals: ApiProposalName[] | undefined): IExtensionDescription {
		return {
			name: id,
			publisher: 'test',
			version: '0.0.0',
			engines: { vscode: '^1.0.0' },
			identifier: new ExtensionIdentifier(id),
			extensionLocation: URI.parse('nothing://nowhere'),
			isBuiltin: false,
			isUnderDevelopment: false,
			isUserBuiltin: false,
			activationEvents: ['*'],
			main: 'index.js',
			targetPlatform: TargetPlatform.UNDEFINED,
			extensionDependencies: [],
			enabledApiProposals,
			preRelease: false,
		};
	}

	test('only enables explicitly declared proposals', () => {
		assert.deepStrictEqual(
			{
				declared: isProposedApiEnabled(desc('test.declared', ['fileSearchProvider']), 'fileSearchProvider'),
				missing: isProposedApiEnabled(desc('test.missing', ['textSearchProvider']), 'fileSearchProvider'),
				empty: isProposedApiEnabled(desc('test.empty', []), 'fileSearchProvider'),
				undefined: isProposedApiEnabled(desc('test.undefined', undefined), 'fileSearchProvider'),
			},
			{
				declared: true,
				missing: false,
				empty: false,
				undefined: false,
			}
		);
	});

	test('checking a declared proposal succeeds', () => {
		assert.doesNotThrow(() => checkProposedApiEnabled(desc('test.declared', ['fileSearchProvider']), 'fileSearchProvider'));
	});

	test('checking an undeclared proposal throws even when another proposal is declared', () => {
		assert.throws(() => checkProposedApiEnabled(desc('test.missing', ['textSearchProvider']), 'fileSearchProvider'), /CANNOT use API proposal: fileSearchProvider/);
	});

	test('checking a proposal throws when the declaration is empty', () => {
		assert.throws(() => checkProposedApiEnabled(desc('test.empty', []), 'fileSearchProvider'), /CANNOT use API proposal: fileSearchProvider/);
	});

	test('checking a proposal throws when no proposals are declared', () => {
		assert.throws(() => checkProposedApiEnabled(desc('test.undefined', undefined), 'fileSearchProvider'), /CANNOT use API proposal: fileSearchProvider/);
	});
});
