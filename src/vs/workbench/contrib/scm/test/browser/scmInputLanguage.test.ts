/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { SCMInputLanguageContribution } from '../../browser/scm.contribution.js';

suite('SCMInputLanguageContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers surroundingPairs for scminput language', () => {
		const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
		disposables.add(new SCMInputLanguageContribution(languageConfigurationService));

		const config = languageConfigurationService.getLanguageConfiguration('scminput');
		const surroundingPairs = config.getSurroundingPairs();

		assert.strictEqual(surroundingPairs.length, 7);
		assert.deepStrictEqual(surroundingPairs.map(p => [p.open, p.close]), [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['<', '>'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
		]);
	});

	test('auto-closes brackets but not quotes', () => {
		const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
		disposables.add(new SCMInputLanguageContribution(languageConfigurationService));

		const config = languageConfigurationService.getLanguageConfiguration('scminput');
		const autoClosingPairs = config.characterPair.getAutoClosingPairs();

		const pairs = autoClosingPairs
			.map(p => [p.open, p.close])
			.sort(([a], [b]) => a.localeCompare(b));

		assert.deepStrictEqual(pairs, [
			['(', ')'],
			['[', ']'],
			['{', '}'],
		]);
	});
});
