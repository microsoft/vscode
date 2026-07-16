/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ElicitationRequest } from '@anthropic-ai/claude-agent-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer } from '../../common/state/sessionState.js';
import { buildElicitationRequest, cancelledElicitationResult, elicitationResultFromAnswers } from '../../node/claude/claudeElicitation.js';
import { handleElicitation } from '../../node/claude/claudeElicitationBridge.js';

suite('claudeElicitation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const formRequest: ElicitationRequest = {
		serverName: 'srv',
		message: 'Please configure',
		mode: 'form',
		requestedSchema: {
			type: 'object',
			required: ['name', 'count'],
			properties: {
				name: { type: 'string', title: 'Name', description: 'Your name', minLength: 1 },
				count: { type: 'integer', title: 'Count', minimum: 0, maximum: 9 },
				enabled: { type: 'boolean', title: 'Enabled', default: true },
				color: { type: 'string', title: 'Color', enum: ['red', 'green'], enumNames: ['Red', 'Green'] },
				size: { type: 'string', title: 'Size', oneOf: [{ const: 's', title: 'Small' }, { const: 'l', title: 'Large' }] },
				tags: { type: 'array', title: 'Tags', items: { type: 'string', enum: ['a', 'b'] } },
			},
		},
	};

	const urlRequest: ElicitationRequest = {
		serverName: 'srv',
		message: 'Authorize',
		mode: 'url',
		url: 'https://example.com/auth',
		elicitationId: 'e1',
	};

	test('buildElicitationRequest (form) projects every primitive field kind', () => {
		assert.deepStrictEqual(buildElicitationRequest('req-1', formRequest), {
			id: 'req-1',
			message: 'Please configure',
			questions: [
				{ kind: ChatInputQuestionKind.Text, id: 'name', title: 'Name', message: 'Your name', required: true, format: undefined, min: 1, max: undefined, defaultValue: undefined },
				{ kind: ChatInputQuestionKind.Integer, id: 'count', title: 'Count', message: 'Count', required: true, min: 0, max: 9, defaultValue: undefined },
				{ kind: ChatInputQuestionKind.Boolean, id: 'enabled', title: 'Enabled', message: 'Enabled', required: false, defaultValue: true },
				{ kind: ChatInputQuestionKind.SingleSelect, id: 'color', title: 'Color', message: 'Color', required: false, allowFreeformInput: false, options: [{ id: 'red', label: 'Red' }, { id: 'green', label: 'Green' }] },
				{ kind: ChatInputQuestionKind.SingleSelect, id: 'size', title: 'Size', message: 'Size', required: false, allowFreeformInput: false, options: [{ id: 's', label: 'Small' }, { id: 'l', label: 'Large' }] },
				{ kind: ChatInputQuestionKind.MultiSelect, id: 'tags', title: 'Tags', message: 'Tags', required: false, allowFreeformInput: false, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], min: undefined, max: undefined },
			],
		});
	});

	test('buildElicitationRequest (url) surfaces the url with no questions', () => {
		assert.deepStrictEqual(buildElicitationRequest('req-2', urlRequest), {
			id: 'req-2',
			message: 'Authorize',
			url: 'https://example.com/auth',
		});
	});

	test('buildElicitationRequest degrades a malformed schema to a message-only request', () => {
		const malformed: ElicitationRequest = {
			serverName: 'srv',
			message: 'Broken',
			mode: 'form',
			requestedSchema: { type: 'object', properties: 'not-an-object' as unknown as Record<string, unknown> },
		};
		assert.deepStrictEqual(buildElicitationRequest('req-3', malformed), { id: 'req-3', message: 'Broken' });
	});

	test('buildElicitationRequest drops a field that fails validation but keeps valid siblings', () => {
		const mixed: ElicitationRequest = {
			serverName: 'srv',
			message: 'Mixed',
			mode: 'form',
			requestedSchema: {
				type: 'object',
				properties: {
					// `enum` must be a string array — a bare string is malformed and would
					// otherwise reach `.map` and throw. It is dropped by validation.
					broken: { type: 'string', title: 'Broken', enum: 'red' },
					ok: { type: 'string', title: 'Ok' },
				},
			},
		};
		assert.deepStrictEqual(buildElicitationRequest('req-4', mixed), {
			id: 'req-4',
			message: 'Mixed',
			questions: [
				{ kind: ChatInputQuestionKind.Text, id: 'ok', title: 'Ok', message: 'Ok', required: false, format: undefined, min: undefined, max: undefined, defaultValue: undefined },
			],
		});
	});

	test('buildElicitationRequest (form) projects the remaining field variants', () => {
		// Complements the canonical fixture above: number (non-integer), titled
		// multi-select (`items.anyOf` + min/maxItems), plain enum (no enumNames),
		// rich text (format/maxLength/string default), an unknown `type`, and a
		// missing `type` — the last two fall back to a plain text field.
		const variants: ElicitationRequest = {
			serverName: 'srv',
			message: 'Variants',
			mode: 'form',
			requestedSchema: {
				type: 'object',
				properties: {
					ratio: { type: 'number', title: 'Ratio', minimum: 0, maximum: 1, default: 0.5 },
					langs: { type: 'array', title: 'Langs', items: { anyOf: [{ const: 'ts', title: 'TypeScript' }, { const: 'go', title: 'Go' }] }, minItems: 1, maxItems: 2 },
					plain: { type: 'string', title: 'Plain', enum: ['a', 'b'] },
					email: { type: 'string', title: 'Email', description: 'Your email', format: 'email', maxLength: 50, default: 'x@y.z' },
					mystery: { type: 'widget', title: 'Mystery' },
					freeText: { title: 'Free' },
				},
			},
		};
		assert.deepStrictEqual(buildElicitationRequest('req-5', variants), {
			id: 'req-5',
			message: 'Variants',
			questions: [
				{ kind: ChatInputQuestionKind.Number, id: 'ratio', title: 'Ratio', message: 'Ratio', required: false, min: 0, max: 1, defaultValue: 0.5 },
				{ kind: ChatInputQuestionKind.MultiSelect, id: 'langs', title: 'Langs', message: 'Langs', required: false, allowFreeformInput: false, options: [{ id: 'ts', label: 'TypeScript' }, { id: 'go', label: 'Go' }], min: 1, max: 2 },
				{ kind: ChatInputQuestionKind.SingleSelect, id: 'plain', title: 'Plain', message: 'Plain', required: false, allowFreeformInput: false, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] },
				{ kind: ChatInputQuestionKind.Text, id: 'email', title: 'Email', message: 'Your email', required: false, format: 'email', min: undefined, max: 50, defaultValue: 'x@y.z' },
				{ kind: ChatInputQuestionKind.Text, id: 'mystery', title: 'Mystery', message: 'Mystery', required: false, format: undefined, min: undefined, max: undefined, defaultValue: undefined },
				{ kind: ChatInputQuestionKind.Text, id: 'freeText', title: 'Free', message: 'Free', required: false, format: undefined, min: undefined, max: undefined, defaultValue: undefined },
			],
		});
	});

	test('buildElicitationRequest degrades every empty/broken form to a message-only request', () => {
		const cases = {
			// `url` mode without a url field
			urlNoUrl: buildElicitationRequest('a', { serverName: 'srv', message: 'NoUrl', mode: 'url' }),
			// `form` mode with no requestedSchema at all
			formNoSchema: buildElicitationRequest('b', { serverName: 'srv', message: 'NoSchema', mode: 'form' }),
			// `form` mode with an empty properties object
			formEmptyProps: buildElicitationRequest('c', { serverName: 'srv', message: 'Empty', mode: 'form', requestedSchema: { type: 'object', properties: {} } }),
			// `form` mode where every field fails validation and is dropped
			formAllInvalid: buildElicitationRequest('d', { serverName: 'srv', message: 'AllBad', mode: 'form', requestedSchema: { type: 'object', properties: { a: { type: 'string', enum: 123 }, b: { minimum: 'nope' } } } }),
		};
		assert.deepStrictEqual(cases, {
			urlNoUrl: { id: 'a', message: 'NoUrl' },
			formNoSchema: { id: 'b', message: 'NoSchema' },
			formEmptyProps: { id: 'c', message: 'Empty' },
			formAllInvalid: { id: 'd', message: 'AllBad' },
		});
	});

	test('elicitationResultFromAnswers maps decline/cancel/accept', () => {
		const accepted: Record<string, ChatInputAnswer> = {
			name: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'Ada' } },
			count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
			enabled: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
			color: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'red' } },
			tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['a', 'b'] } },
			size: { state: ChatInputAnswerState.Skipped },
		};
		assert.deepStrictEqual({
			decline: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Decline, undefined),
			cancel: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Cancel, undefined),
			accept: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, accepted),
		}, {
			decline: { action: 'decline' },
			cancel: { action: 'cancel' },
			accept: { action: 'accept', content: { name: 'Ada', count: 3, enabled: false, color: 'red', tags: ['a', 'b'] } },
		});
	});

	test('elicitationResultFromAnswers (url accept) carries no content', () => {
		assert.deepStrictEqual(
			elicitationResultFromAnswers(urlRequest, ChatInputResponseKind.Accept, undefined),
			{ action: 'accept' },
		);
	});

	test('elicitationResultFromAnswers accept edge cases: broken form omits content, empty answers yield empty content', () => {
		const brokenForm: ElicitationRequest = { serverName: 'srv', message: 'x', mode: 'form', requestedSchema: { properties: 'nope' } };
		assert.deepStrictEqual({
			// Accepting a form whose schema can't be parsed → no content object.
			brokenAccept: elicitationResultFromAnswers(brokenForm, ChatInputResponseKind.Accept, undefined),
			// Accepting a valid form with no answers → an empty content object.
			emptyAnswers: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, undefined),
		}, {
			brokenAccept: { action: 'accept' },
			emptyAnswers: { action: 'accept', content: {} },
		});
	});

	test('elicitationResultFromAnswers coerces text answers to the field schema type', () => {
		// The workbench renders number/integer/boolean questions as text inputs
		// and returns them as text answers, so `"3"` / `"0.5"` / `"false"` must be
		// coerced back to the schema type; an uncoercible value is dropped.
		const request: ElicitationRequest = {
			serverName: 'srv', message: 'Coerce', mode: 'form',
			requestedSchema: {
				type: 'object',
				properties: {
					count: { type: 'integer' },
					ratio: { type: 'number' },
					flag: { type: 'boolean' },
					pick: { type: 'string', enum: ['a', 'b'] },
					bad: { type: 'integer' },
				},
			},
		};
		const answers: Record<string, ChatInputAnswer> = {
			count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: '3' } },
			ratio: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: '0.5' } },
			flag: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'false' } },
			pick: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'a' } },
			bad: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'not-a-number' } },
		};
		assert.deepStrictEqual(
			elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
			{ action: 'accept', content: { count: 3, ratio: 0.5, flag: false, pick: 'a' } },
		);
	});

	test('elicitationResultFromAnswers is safe against prototype-polluting field names', () => {
		// JSON.parse produces own `__proto__` / `constructor` keys (unlike an object
		// literal). Reading answers by those names must use own-property lookup so an
		// inherited member is never read (which would crash), and content must be
		// built without prototype setters.
		const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"string"},"ok":{"type":"string"}}');
		const request: ElicitationRequest = { serverName: 'srv', message: 'x', mode: 'form', requestedSchema: { type: 'object', properties } };
		const answers: Record<string, ChatInputAnswer> = { ok: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'yes' } } };
		assert.deepStrictEqual(
			elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
			{ action: 'accept', content: { ok: 'yes' } },
		);
	});

	test('cancelledElicitationResult is a plain cancel', () => {
		assert.deepStrictEqual(cancelledElicitationResult(), { action: 'cancel' });
	});

	test('handleElicitation cancels when the session lookup misses', async () => {
		// The SDK can fire an elicitation for a session that is already gone
		// (teardown race). The bridge returns before touching any session, so
		// this needs no session — just a lookup that misses.
		const result = await handleElicitation(
			{ getSession: () => undefined },
			'missing-session',
			{ serverName: 'srv', message: 'q', mode: 'form', requestedSchema: { type: 'object', properties: { side: { type: 'string' } } } },
			{ signal: new AbortController().signal },
		);
		assert.deepStrictEqual(result, { action: 'cancel' });
	});

});
