/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ParseErrorCode } from '../../common/json.js';
import { getParseErrorMessage } from '../../common/jsonErrorMessages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('JSON Error Messages', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getParseErrorMessage', () => {
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidSymbol), 'Invalid symbol');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidNumberFormat), 'Invalid number format');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.PropertyNameExpected), 'Property name expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.ValueExpected), 'Value expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.ColonExpected), 'Colon expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.CommaExpected), 'Comma expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.CloseBraceExpected), 'Closing brace expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.CloseBracketExpected), 'Closing bracket expected');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.EndOfFileExpected), 'End of file expected');

		// Default cases
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidCommentToken), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.UnexpectedEndOfComment), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.UnexpectedEndOfString), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.UnexpectedEndOfNumber), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidUnicode), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidEscapeCharacter), '');
		assert.strictEqual(getParseErrorMessage(ParseErrorCode.InvalidCharacter), '');
	});
});
