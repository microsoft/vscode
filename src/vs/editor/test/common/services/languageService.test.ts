/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../common/languages/modesRegistry.js';
import { LanguageService } from '../../../common/services/languageService.js';

suite('LanguageService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('LanguageSelection does not leak a disposable', () => {
		const languageService = new LanguageService();
		const languageSelection1 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		assert.strictEqual(languageSelection1.languageId, PLAINTEXT_LANGUAGE_ID);
		const languageSelection2 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		const listener = languageSelection2.onDidChange(() => { });
		assert.strictEqual(languageSelection2.languageId, PLAINTEXT_LANGUAGE_ID);
		listener.dispose();
		languageService.dispose();
	});

});
