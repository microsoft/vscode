/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { parseAndDispatch, type SlashCommandContext } from '../src/chat/ChatSlashCommands';
import type { ModelId } from '../src/llm/LlmClient';

// ── Fakes ─────────────────────────────────────────────────────────────────────

interface SpyContext extends SlashCommandContext {
	specialistId: string;
	model: ModelId;
	clearedCount: number;
	providerStatus: { name: string; connected: boolean }[];
	setSpecialistCalls: string[];
	setModelCalls: ModelId[];
	failProviderStatus: boolean;
}

function makeContext(overrides: Partial<SpyContext> = {}): SpyContext {
	const ctx: SpyContext = {
		specialistId: 'anton',
		model: 'sonnet',
		clearedCount: 0,
		providerStatus: [],
		setSpecialistCalls: [],
		setModelCalls: [],
		failProviderStatus: false,
		getSpecialistId() { return ctx.specialistId; },
		setSpecialistId(id: string) {
			ctx.setSpecialistCalls.push(id);
			ctx.specialistId = id;
		},
		getModel() { return ctx.model; },
		setModel(id: ModelId) {
			ctx.setModelCalls.push(id);
			ctx.model = id;
		},
		async clearConversation() { ctx.clearedCount += 1; },
		async getProviderStatus() {
			if (ctx.failProviderStatus) {
				throw new Error('broker offline');
			}
			return ctx.providerStatus;
		},
		...overrides,
	};
	return ctx;
}

// ── ChatSlashCommands tests ──────────────────────────────────────────────────

suite('ChatSlashCommands', () => {
	test('empty input is not handled', async () => {
		const ctx = makeContext();
		assert.deepStrictEqual(
			await parseAndDispatch('', ctx),
			{ handled: false, output: '' },
		);
	});

	test('non-slash input is not handled', async () => {
		const ctx = makeContext();
		assert.deepStrictEqual(
			await parseAndDispatch('hello there', ctx),
			{ handled: false, output: '' },
		);
	});

	test('/help lists all six commands', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/help', ctx);

		const expected = ['/help', '/clear', '/specialist', '/model', '/agents', '/status'];
		assert.deepStrictEqual(
			{
				handled: result.handled,
				containsAll: expected.every(c => result.output.includes(c)),
			},
			{ handled: true, containsAll: true },
		);
	});

	test('/clear invokes clearConversation and returns empty output', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/clear', ctx);

		assert.deepStrictEqual(
			{ handled: result.handled, output: result.output, clearedCount: ctx.clearedCount },
			{ handled: true, output: '', clearedCount: 1 },
		);
	});

	test('/specialist anton-code switches the specialist', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/specialist anton-code', ctx);

		assert.deepStrictEqual(
			{
				handled: result.handled,
				calls: ctx.setSpecialistCalls,
				containsName: result.output.includes('Anton Code'),
			},
			{ handled: true, calls: ['anton-code'], containsName: true },
		);
	});

	test('/specialist tolerates a leading "@" prefix', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/specialist @anton-code', ctx);

		assert.deepStrictEqual(
			{ handled: result.handled, calls: ctx.setSpecialistCalls },
			{ handled: true, calls: ['anton-code'] },
		);
	});

	test('/specialist with an unknown id reports the error and does not call the setter', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/specialist nonsense', ctx);

		assert.deepStrictEqual(
			{
				handled: result.handled,
				calls: ctx.setSpecialistCalls,
				outputMentionsUnknown: result.output.toLowerCase().includes('unknown'),
			},
			{ handled: true, calls: [], outputMentionsUnknown: true },
		);
	});

	test('/model haiku switches the model', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/model haiku', ctx);

		assert.deepStrictEqual(
			{ handled: result.handled, calls: ctx.setModelCalls },
			{ handled: true, calls: ['haiku' as ModelId] },
		);
	});

	test('/model with unknown id reports the error and does not call the setter', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/model not-a-real-model', ctx);

		assert.deepStrictEqual(
			{
				handled: result.handled,
				calls: ctx.setModelCalls,
				outputMentionsUnknown: result.output.toLowerCase().includes('unknown'),
			},
			{ handled: true, calls: [], outputMentionsUnknown: true },
		);
	});

	test('/agents lists the registered specialists', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/agents', ctx);

		assert.deepStrictEqual(
			{
				handled: result.handled,
				containsCode: result.output.includes('@anton-code'),
				containsTest: result.output.includes('@anton-test'),
			},
			{ handled: true, containsCode: true, containsTest: true },
		);
	});

	test('/status surfaces the current specialist and model', async () => {
		const ctx = makeContext({ specialistId: 'anton-code', model: 'opus' });
		const result = await parseAndDispatch('/status', ctx);

		assert.deepStrictEqual(
			{
				handled: result.handled,
				containsSpecialist: result.output.includes('Anton Code'),
				containsModel: result.output.includes('opus'),
			},
			{ handled: true, containsSpecialist: true, containsModel: true },
		);
	});

	test('/status falls back to "unavailable" when the broker errors', async () => {
		const ctx = makeContext({ failProviderStatus: true });
		const result = await parseAndDispatch('/status', ctx);

		assert.deepStrictEqual(
			{ handled: result.handled, mentionsUnavailable: result.output.includes('unavailable') },
			{ handled: true, mentionsUnavailable: true },
		);
	});

	test('unknown slash command falls through to LLM (handled=false)', async () => {
		const ctx = makeContext();
		assert.deepStrictEqual(
			await parseAndDispatch('/unknownCommand here', ctx),
			{ handled: false, output: '' },
		);
	});

	test('command parsing is case-insensitive', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('/HELP', ctx);

		assert.strictEqual(result.handled, true);
		assert.ok(result.output.includes('/help'));
	});

	test('leading and trailing whitespace are tolerated', async () => {
		const ctx = makeContext();
		const result = await parseAndDispatch('   /help  ', ctx);

		assert.deepStrictEqual(
			{ handled: result.handled, isHelp: result.output.includes('Available commands') },
			{ handled: true, isHelp: true },
		);
	});
});
