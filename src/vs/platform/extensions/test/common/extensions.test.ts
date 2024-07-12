/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { parseEnabledApiProposalNames } from 'vs/platform/extensions/common/extensions';

suite('Parsing Enabled Api Proposals', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parsingEnabledApiProposals', () => {
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@randomstring']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234_random']));
	});

});
