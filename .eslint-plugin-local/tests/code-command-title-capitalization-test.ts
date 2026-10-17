/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test file to verify the code-command-title-capitalization ESLint rule works correctly
// Note: This file is analyzed by ESLint, not executed, so we use mock function calls

// Mock functions for ESLint analysis
declare function localize(key: string, message: string | { message: string }): string;
declare function localize2(key: string, message: string | { message: string }): string;
declare const nls: { localize: typeof localize; localize2: typeof localize };

// Valid cases - should not trigger warnings
const valid1 = nls.localize('key1', 'Open File');
const valid2 = nls.localize2('key2', 'Save As');
const valid3 = nls.localize('key3', 'Format Document');
const valid4 = nls.localize2('key4', 'Go to Line');
const valid5 = nls.localize('key5', 'Find in Files');

// Articles - valid cases
const valid6 = nls.localize('key6', 'The Document'); // "The" is first word, should be capitalized
const valid7 = nls.localize('key7', 'Open the File'); // "the" is not first word, should be lowercase
const valid8 = nls.localize('key8', 'A New File'); // "A" is first word, should be capitalized
const valid9 = nls.localize('key9', 'Create a New File'); // "a" is not first word, should be lowercase
const valid10 = nls.localize('key10', 'An Example'); // "An" is first word, should be capitalized

// Conjunctions - valid cases
const valid11 = nls.localize('key11', 'Copy and Paste'); // "and" is not first/last word, should be lowercase
const valid12 = nls.localize('key12', 'Import or Export'); // "or" is not first/last word, should be lowercase

// Hyphenated words - valid cases
const valid13 = nls.localize('key13', 'Self-Paced Training'); // both parts capitalized
const valid14 = nls.localize('key14', 'Copy-and-Paste'); // all parts capitalized
const valid15 = nls.localize('key15', 'Five Essential Snap-Ins'); // Snap capitalized, Ins capitalized (last part)

// Invalid cases - should trigger warnings
const invalid1 = nls.localize('key20', 'Open file'); // "file" should be capitalized
const invalid2 = nls.localize2('key21', 'Save With As'); // "With" should be lowercase
const invalid3 = nls.localize('key22', 'Format The Document'); // "The" should be lowercase
const invalid4 = nls.localize2('key23', 'Go To Line'); // "To" should be lowercase
const invalid5 = nls.localize('key24', 'Find In Files'); // "In" should be lowercase
const invalid6 = nls.localize('key25', 'Copy And Paste'); // "And" should be lowercase
const invalid7 = nls.localize('key26', 'Create A New File'); // "A" should be lowercase
const invalid8 = nls.localize('key27', 'Self-paced Training'); // "paced" should be capitalized
const invalid9 = nls.localize('key28', 'Copy-and-paste'); // "paste" should be capitalized

// Non-localize calls - should not trigger warnings
const regularString = "This is a regular string";
const regularString2 = 'Open file'; // This should not trigger the rule

// Template literals (no expressions) - should be validated
const validTemplate = nls.localize('key30', `Open File`); // Template literal without expressions

// Object expression with message property - should be validated
const validObject = nls.localize('key31', { message: 'Open File' });
const validObjectStringKey = nls.localize('key31b', { 'message': 'Open File' }); // String literal key

// More hyphenated edge cases
const validHyphenatedWithLowercase = nls.localize('key32', 'Up-to-Date Information'); // "to" lowercase in middle
const validHyphenatedComplex = nls.localize('key33', 'State-of-the-Art Technology'); // "of" "the" lowercase in middle

// Invalid hyphenated cases
const invalidHyphenated1 = nls.localize('key50', 'Up-To-Date Information'); // "To" should be lowercase in middle
const invalidHyphenated2 = nls.localize('key51', 'State-Of-The-Art Technology'); // "Of" "The" should be lowercase in middle

// Edge cases - single words
const validSingleWord = nls.localize('key52', 'Open'); // Single word, capitalized
const validSingleWordArticle = nls.localize('key53', 'The'); // Single article, capitalized (first word)

// Edge cases - lowercase words at start/end
const validPrepositionStart = nls.localize('key54', 'To Personalize Windows'); // "To" is first word, capitalized
const validPrepositionEnd = nls.localize('key55', 'A Home to Go Back To'); // "To" is last word, capitalized
const validTrailingSpace = nls.localize('key56', 'A Home to Go Back To '); // Trailing space, "To" still last word

// Mixed case scenarios - invalid
const invalidMixedCase = nls.localize('key57', 'OPEN FILE'); // All caps should be normalized
const invalidMixedCase2 = nls.localize('key58', 'oPEN fILE'); // Random capitalization should be normalized

// Empty and whitespace edge cases
const validEmptyAfter = nls.localize('key59', 'Open File '); // Trailing space (should be handled by split)
const validMultipleSpaces = nls.localize('key60', 'Open  File'); // Multiple spaces (should be handled by split)
