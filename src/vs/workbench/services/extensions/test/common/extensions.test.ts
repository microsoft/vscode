/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { ApiProposalName } from '../../../../../platform/extensions/common/extensionsApiProposals.js';
import { isProposedApiEnabled, setEnabledApiProposalsFallbackExperiment } from '../../common/extensions.js';

suite('isProposedApiEnabled (extensionEnabledApiProposalsFallback experiment)', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function desc(id: string, enabledApiProposals: string[] | undefined): IExtensionDescription {
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
			enabledApiProposals: enabledApiProposals as ApiProposalName[] | undefined,
			preRelease: false,
		};
	}

	test('experiment enables a declared-but-missing proposal on stable, honoring the declared value otherwise', () => {
		const declared = desc('test.declared', ['someProposal']);
		const missingButInExperiment = desc('test.missing', ['unrelatedProposal']);
		const other = desc('test.other', ['unrelatedProposal']);

		store.add(setEnabledApiProposalsFallbackExperiment('test.missing:someProposal', 'stable'));

		assert.deepStrictEqual(
			{
				declared: isProposedApiEnabled(declared, 'someProposal' as ApiProposalName),
				missingInExperiment: isProposedApiEnabled(missingButInExperiment, 'someProposal' as ApiProposalName),
				missingOutsideExperiment: isProposedApiEnabled(missingButInExperiment, 'otherProposal' as ApiProposalName),
				otherExtension: isProposedApiEnabled(other, 'someProposal' as ApiProposalName),
			},
			{
				declared: true,
				missingInExperiment: true,
				missingOutsideExperiment: false,
				otherExtension: false,
			}
		);
	});

	test('experiment does not grant access to extensions that declare no proposals', () => {
		const noProposals = desc('test.missing', undefined);
		store.add(setEnabledApiProposalsFallbackExperiment('test.missing:someProposal', 'stable'));
		assert.strictEqual(isProposedApiEnabled(noProposals, 'someProposal' as ApiProposalName), false);
	});

	test('experiment has no effect on non-stable builds', () => {
		const missing = desc('test.missing', ['unrelatedProposal']);
		store.add(setEnabledApiProposalsFallbackExperiment('test.missing:someProposal', 'insider'));
		assert.strictEqual(isProposedApiEnabled(missing, 'someProposal' as ApiProposalName), false);
	});

	test('disposing the experiment removes the fallback', () => {
		const missing = desc('test.missing', ['unrelatedProposal']);
		const disposable = store.add(setEnabledApiProposalsFallbackExperiment('test.missing:someProposal', 'stable'));
		assert.strictEqual(isProposedApiEnabled(missing, 'someProposal' as ApiProposalName), true);
		disposable.dispose();
		assert.strictEqual(isProposedApiEnabled(missing, 'someProposal' as ApiProposalName), false);
	});
});
