/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test file to verify the code-command-title-capitalization ESLint rule works correctly

// Valid cases - should not trigger warnings
const valid1 = nls.localize('key1', 'Open File');
const valid2 = nls.localize2('key2', 'Save As');
const valid3 = nls.localize('key3', 'Format Document');
const valid4 = nls.localize2('key4', 'Go to Line');
const valid5 = nls.localize('key5', 'Find in Files');

// Invalid cases - should trigger warnings
// eslint-disable-next-line local/code-command-title-capitalization
const invalid1 = nls.localize('key6', 'Open file'); // "file" should be capitalized
// eslint-disable-next-line local/code-command-title-capitalization
const invalid2 = nls.localize2('key7', 'Save With As'); // "With" should be lowercase
// eslint-disable-next-line local/code-command-title-capitalization
const invalid3 = nls.localize('key8', 'Format The Document'); // "The" should be lowercase
// eslint-disable-next-line local/code-command-title-capitalization
const invalid4 = nls.localize2('key9', 'Go To Line'); // "To" should be lowercase
// eslint-disable-next-line local/code-command-title-capitalization
const invalid5 = nls.localize('key10', 'Find In Files'); // "In" should be lowercase

// Non-localize calls - should not trigger warnings
const regularString = "This is a regular string";
const regularString2 = 'Open file'; // This should not trigger the rule
