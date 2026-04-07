/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import type { IChatEndpoint } from '../../../networking/common/networking';
import { modelSupportsPDFDocuments } from '../../common/chatModelCapabilities';

function fakeModel(family: string) {
	return { family } as unknown as IChatEndpoint;
}

describe('modelSupportsPDFDocuments', () => {
	test('returns true for claude family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('claude-3.5-sonnet'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-3-opus'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-4-sonnet'))).toBe(true);
	});

	test('returns true for Anthropic family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic-custom'))).toBe(true);
	});

	test('returns false for non-Anthropic families', () => {
		expect(modelSupportsPDFDocuments(fakeModel('gpt-4'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.1'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gemini-2.0-flash'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('o4-mini'))).toBe(false);
	});
});
