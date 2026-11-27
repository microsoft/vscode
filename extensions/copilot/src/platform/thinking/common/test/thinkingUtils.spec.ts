/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { reasoningSourceFieldFromMetadata, reasoningSourceFieldMetadataKey } from '../thinking';
import { extractThinkingDeltaFromChoice } from '../thinkingUtils';

describe('extractThinkingDeltaFromChoice: reasoning source field', () => {
	it('records reasoning_content as the source of the text', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning_content: 'thinking' } })).toEqual({
			text: 'thinking',
			metadata: { [reasoningSourceFieldMetadataKey]: 'reasoning_content' },
		});
	});

	it('records reasoning as the source of the text', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning: 'thinking' } })).toEqual({
			text: 'thinking',
			metadata: { [reasoningSourceFieldMetadataKey]: 'reasoning' },
		});
	});

	it('names reasoning_content when a server sends both, matching which text is used', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning_content: 'a', reasoning: 'b' } })).toEqual({
			text: 'a',
			metadata: { [reasoningSourceFieldMetadataKey]: 'reasoning_content' },
		});
	});

	it('keeps the id next to the source field', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning_content: 'x', signature: 'sig' } })).toEqual({
			id: 'sig',
			text: 'x',
			metadata: { [reasoningSourceFieldMetadataKey]: 'reasoning_content' },
		});
	});

	it.each([
		['cot_summary', { cot_summary: 'x' }],
		['reasoning_text', { reasoning_text: 'x' }],
		['thinking', { thinking: 'x' }],
	])('records nothing when the text came from %s', (_name, delta) => {
		expect(extractThinkingDeltaFromChoice({ delta })).toEqual({ text: 'x' });
	});

	it('records nothing when cot_summary wins over reasoning_content', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { cot_summary: 'chosen', reasoning_content: 'ignored' } })).toEqual({ text: 'chosen' });
	});

	it('records nothing when there is no text', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { signature: 'sig' } })).toEqual({ id: 'sig' });
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning_content: '' } })).toBeUndefined();
	});

	it('leaves the encrypted shape alone', () => {
		expect(extractThinkingDeltaFromChoice({ delta: { reasoning_opaque: 'blob', reasoning_content: 'x' } })).toEqual({ id: 'blob', text: 'x', encrypted: 'blob' });
	});
});

describe('reasoningSourceFieldFromMetadata', () => {
	it('returns only the two known keys', () => {
		expect(reasoningSourceFieldFromMetadata({ [reasoningSourceFieldMetadataKey]: 'reasoning_content' })).toBe('reasoning_content');
		expect(reasoningSourceFieldFromMetadata({ [reasoningSourceFieldMetadataKey]: 'reasoning' })).toBe('reasoning');
		expect(reasoningSourceFieldFromMetadata({ [reasoningSourceFieldMetadataKey]: 'something_else' })).toBeUndefined();
		expect(reasoningSourceFieldFromMetadata({})).toBeUndefined();
		expect(reasoningSourceFieldFromMetadata(undefined)).toBeUndefined();
	});
});
