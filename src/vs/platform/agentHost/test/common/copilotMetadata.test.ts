/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentModelPricingMeta } from '../../common/agentModelPricing.js';
import { readAgentErrorTelemetryMeta, readErrorDetail } from '../../common/meta/errorMeta.js';
import { readAttachmentDetail, withAttachmentDetail } from '../../common/meta/attachmentMeta.js';
import { readAgentToolOutputDelta } from '../../common/meta/agentToolCallMeta.js';
import { readAgentContextUsage } from '../../common/meta/agentUsageMeta.js';
import { readAgentMessagePresentation } from '../../common/meta/agentMessageMeta.js';
import { hasAgentMetadata } from '../../common/meta/metadata.js';
import { readCopilotCommand, readCopilotContextUsage, readCopilotErrorDetail, readCopilotModelText, readCopilotToolOrigin, readCopilotToolOutputDelta, readCopilotUsageDetail, withCopilotCommand, withCopilotModelText, withCopilotToolPreferences } from '../../common/meta/copilotd/copilotdMetadataReader.js';
import { isMessageHiddenFromTranscript, isMessageRequestHiddenFromTranscript, MessageAttachmentKind, MessageKind, readUsageInfoMeta, withMessageRequestHiddenFromTranscript, type Message } from '../../common/state/sessionState.js';

suite('Copilot metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects VS Code metadata by presence, not valid or truthy fields', () => {
		assert.deepStrictEqual([false, 0, '', null, undefined].map(value => hasAgentMetadata({ _meta: { present: value } }, ['present'])), [true, true, true, true, true]);
	});

	test('features dispatch without inspecting private host data', () => {
		const detail = { type: 'selection', text: 'captured' };
		assert.deepStrictEqual({
			attachment: readAttachmentDetail({ _meta: { 'copilot.attachmentDetail': detail } }),
			attachmentWithOtherMetadata: readAttachmentDetail({ _meta: { 'copilot.attachmentDetail': detail, browserView: null } }),
			chunk: readAgentToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': 'output' } }, {}, {}),
			preferredChunk: readAgentToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': 'output' } }, { _meta: { toolKind: null } }, {}),
			context: readAgentContextUsage({ _meta: { 'copilot.usageInfo': { currentTokens: 0, tokenLimit: 100, messagesLength: 0 } } }, { _meta: { contextAttribution: null } }),
			presentation: readAgentMessagePresentation({ text: 'display', origin: { kind: MessageKind.Tool }, _meta: { 'copilot.visibility': 'internal' } }),
		}, {
			attachment: { type: 'selection', raw: detail, text: 'captured', url: undefined },
			attachmentWithOtherMetadata: { type: 'selection', raw: detail, text: 'captured', url: undefined },
			chunk: { output: 'output', isPty: false },
			preferredChunk: undefined,
			context: undefined,
			presentation: { hiddenFromTranscript: false, requestHiddenFromTranscript: true, systemInitiatedLabel: undefined },
		});
	});

	test('error correlation uses the first usable result without mixing fields', () => {
		const detail = { providerCallId: 'copilot', serviceRequestId: 'service' };
		const read = (extra: Record<string, unknown>) => readAgentErrorTelemetryMeta({ errorType: 'error', message: 'failed', _meta: { 'copilot.errorDetail': detail, ...extra } });
		assert.deepStrictEqual([read({}), read({ chatError: { fetchError: { requestId: 'vscode' } } }), ...[null, {}, { fetchError: {} }, { fetchError: { requestId: '' } }].map(chatError => read({ chatError }))], [
			{ providerCallId: 'copilot', serviceRequestId: 'service' },
			{ providerCallId: 'vscode', serviceRequestId: undefined },
			{ providerCallId: 'copilot', serviceRequestId: 'service' },
			{ providerCallId: 'copilot', serviceRequestId: 'service' },
			{ providerCallId: 'copilot', serviceRequestId: 'service' },
			{ providerCallId: 'copilot', serviceRequestId: 'service' },
		]);
	});

	test('error detail prefers a valid forwarded error and falls back from invalid shapes', () => {
		const detail = { errorCode: 'copilot', statusCode: 429 };
		const forwarded = { fetchError: { type: 'rateLimited' }, copilotPlan: 'free' };
		const read = (chatError: unknown) => readErrorDetail({ _meta: { 'copilot.errorDetail': detail, chatError } });
		assert.deepStrictEqual([
			read(forwarded),
			...[undefined, null, false, [], {}, { fetchError: {} }, { fetchError: { type: 42 } }].map(read),
			readErrorDetail({}),
			readErrorDetail({ _meta: { chatError: null } }),
		], [
			{ kind: 'fetch', value: forwarded },
			...[undefined, null, false, [], {}, { fetchError: {} }, { fetchError: { type: 42 } }].map(() => ({ kind: 'diagnostic', ...detail })),
			undefined,
			undefined,
		]);
	});

	test('model pricing does not mix a local cost with a Copilot category', () => {
		const model = { id: 'model', provider: 'copilot', name: 'Model' };
		assert.deepStrictEqual([
			readAgentModelPricingMeta({ ...model, _meta: { 'copilot.modelPickerCategory': 'powerful' } }),
			readAgentModelPricingMeta({ ...model, _meta: { cost: 1, 'copilot.modelPickerCategory': 'future' } }),
			readAgentModelPricingMeta({ ...model, _meta: { inputCost: 0, 'copilot.modelPickerCategory': 'powerful' } }),
			readAgentModelPricingMeta({ ...model, _meta: { category: null, 'copilot.modelPickerCategory': 'powerful' } }),
		], [{ category: 'powerful' }, {}, { inputCost: 0 }, {}]);
	});

	test('internal visibility hides only the request and never overrides a VS Code flag', () => {
		const message: Message = { text: 'injected', origin: { kind: MessageKind.Tool }, _meta: { 'copilot.visibility': 'internal' } };
		assert.deepStrictEqual([
			[isMessageHiddenFromTranscript(message), isMessageRequestHiddenFromTranscript(message)],
			isMessageRequestHiddenFromTranscript({ ...message, _meta: { ...message._meta, 'vscode.chat.requestHiddenFromTranscript': false } }),
			isMessageRequestHiddenFromTranscript({ ...message, _meta: { ...message._meta, 'vscode.chat.requestHiddenFromTranscript': 'invalid' } }),
			withMessageRequestHiddenFromTranscript({ text: 'hidden', origin: { kind: MessageKind.User }, _meta: { opaque: 1 } }, true)._meta,
		], [[false, true], false, false, { opaque: 1, 'vscode.chat.requestHiddenFromTranscript': true, 'copilot.visibility': 'internal' }]);
	});

	test('latest call costs remain separate from whole-turn costs', () => {
		const usage = { inputTokens: 30, outputTokens: 10, _meta: { 'copilot.usageDetail': { cost: 0.5, duration: 12 } } };
		assert.deepStrictEqual([
			readUsageInfoMeta(usage),
			readUsageInfoMeta({ ...usage, _meta: { ...usage._meta, cost: 0 } }),
			readUsageInfoMeta({ ...usage, _meta: { ...usage._meta, cost: 'invalid' } }),
		], [{ latestModelCall: { cost: 0.5, duration: 12 } }, { cost: 0 }, {}]);
	});

	test('validates optional fields without dropping open wire payloads', () => {
		assert.deepStrictEqual({
			error: readCopilotErrorDetail({ _meta: { 'copilot.errorDetail': { statusCode: 1.5, eligibleForAutoSwitch: false, providerCallId: 42 } } }),
			usage: readCopilotUsageDetail({ _meta: { 'copilot.usageDetail': { cost: Infinity, duration: -1, timeToFirstTokenMs: 1.5, copilotUsage: { totalNanoAiu: 'bad', future: true } } } }),
			context: readCopilotContextUsage({ _meta: { 'copilot.usageInfo': { currentTokens: 0, tokenLimit: 100, messagesLength: 0, future: true } } }),
			origin: readCopilotToolOrigin({ _meta: { 'copilot.toolOrigin': { kind: 'future', mcpServerName: 42 } } }),
		}, {
			error: { eligibleForAutoSwitch: false },
			usage: { timeToFirstTokenMs: 1.5, copilotUsage: { future: true } },
			context: { currentTokens: 0, tokenLimit: 100, messagesLength: 0 },
			origin: { kind: 'future' },
		});
	});

	test('model text and command writers preserve siblings and declared intent', () => {
		const message: Message = { text: '/compact', origin: { kind: MessageKind.User }, _meta: { opaque: 0 } };
		const model = withCopilotModelText(message, 'Do not compact; explain the command');
		const command = withCopilotCommand(model, { name: 'compact', focus: '  keep auth  ' });
		assert.deepStrictEqual({
			display: model.text,
			prompt: readCopilotModelText(model),
			command: readCopilotCommand(command),
			meta: command._meta,
			empty: withCopilotModelText(message, '') === message,
		}, {
			display: '/compact',
			prompt: 'Do not compact; explain the command',
			command: { name: 'compact', focus: 'keep auth' },
			meta: { opaque: 0, 'copilot.modelText': 'Do not compact; explain the command', 'copilot.command': { name: 'compact', focus: '  keep auth  ' } },
			empty: true,
		});
	});

	test('attachment round trips preserve captured text and unknown fields', () => {
		const detail = { type: 'selection', text: 'captured', filePath: '/remote/file', future: { value: true } };
		const attachment = withAttachmentDetail({ type: MessageAttachmentKind.Simple, label: 'file', _meta: { opaque: false, browserView: { url: 'https://example.com' } } }, detail);
		assert.deepStrictEqual({ detail: readAttachmentDetail(attachment), meta: attachment._meta }, {
			detail: { type: 'selection', raw: detail, text: 'captured', url: undefined },
			meta: { opaque: false, browserView: { url: 'https://example.com' }, 'copilot.attachmentDetail': detail },
		});
	});

	test('tool preferences are explicit and output chunks are not tool input', () => {
		const tool = { name: 'tool', _meta: { opaque: true } };
		assert.deepStrictEqual({
			unchanged: withCopilotToolPreferences(tool, undefined) === tool,
			preferred: withCopilotToolPreferences(tool, { defer: 'auto', availability: 'userChats' }),
			text: readCopilotToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': 'output' } }),
			pty: readCopilotToolOutputDelta({ _meta: { ptyTerminal: { input: '', output: '\u001b[31moutput' } } }),
			empty: readCopilotToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': '' } }),
		}, {
			unchanged: true,
			preferred: { name: 'tool', _meta: { opaque: true, 'copilot.toolDefer': 'auto', 'copilot.toolAvailability': 'userChats' } },
			text: { output: 'output', isPty: false },
			pty: { output: '\u001b[31moutput', isPty: true },
			empty: undefined,
		});
	});
});
