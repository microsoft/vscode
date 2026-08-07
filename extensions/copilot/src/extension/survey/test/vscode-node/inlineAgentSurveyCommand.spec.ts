/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { validateInlineAgentSurveyPayload } from '../../vscode-node/inlineAgentSurveyCommand';

describe('validateInlineAgentSurveyPayload', () => {
	it('accepts a well-formed payload and normalizes rating casing', () => {
		const result = validateInlineAgentSurveyPayload({
			rating: 'Partly',
			reason: 'too_slow',
			trigger: 'mature_response',
			surface: 'agents_window',
			turnCount: 5,
			conversationId: 'sess-1',
			requestId: 'resp-1',
			model: 'gpt-4o',
		});

		expect(result).toEqual({
			rating: 'partly',
			reason: 'too_slow',
			trigger: 'mature_response',
			surface: 'agents_window',
			turnCount: 5,
			conversationId: 'sess-1',
			requestId: 'resp-1',
			model: 'gpt-4o',
		});
	});

	it('drops an unknown reason and floors the turn count', () => {
		const result = validateInlineAgentSurveyPayload({
			rating: 'no',
			reason: 'not_a_reason',
			trigger: 'first_response',
			surface: 'editor_chat',
			turnCount: 3.9,
		});

		expect(result?.reason).toBeUndefined();
		expect(result?.turnCount).toBe(3);
	});

	it('clamps negative or non-finite turn counts to zero', () => {
		const negative = validateInlineAgentSurveyPayload({ rating: 'yes', trigger: 'first_response', surface: 'editor_chat', turnCount: -5 });
		const nan = validateInlineAgentSurveyPayload({ rating: 'yes', trigger: 'first_response', surface: 'editor_chat', turnCount: 'many' });
		expect(negative?.turnCount).toBe(0);
		expect(nan?.turnCount).toBe(0);
	});

	it('omits blank or oversized correlation identifiers', () => {
		const result = validateInlineAgentSurveyPayload({
			rating: 'yes',
			trigger: 'first_response',
			surface: 'editor_chat',
			turnCount: 1,
			conversationId: '   ',
			requestId: 'x'.repeat(300),
			model: 42,
		});

		expect(result?.conversationId).toBeUndefined();
		expect(result?.requestId).toBeUndefined();
		expect(result?.model).toBeUndefined();
	});

	it('rejects payloads with invalid rating, trigger, or surface', () => {
		expect(validateInlineAgentSurveyPayload({ rating: 'maybe', trigger: 'first_response', surface: 'editor_chat' })).toBeUndefined();
		expect(validateInlineAgentSurveyPayload({ rating: 'yes', trigger: 'unknown', surface: 'editor_chat' })).toBeUndefined();
		expect(validateInlineAgentSurveyPayload({ rating: 'yes', trigger: 'first_response', surface: 'inline_chat' })).toBeUndefined();
	});

	it('rejects non-object payloads', () => {
		expect(validateInlineAgentSurveyPayload(undefined)).toBeUndefined();
		expect(validateInlineAgentSurveyPayload(null)).toBeUndefined();
		expect(validateInlineAgentSurveyPayload('yes')).toBeUndefined();
	});
});
