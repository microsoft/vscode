/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAttachmentDetail, withAttachmentDetail } from '../../common/meta/attachmentMeta.js';
import { readErrorDetail } from '../../common/meta/errorMeta.js';
import { readAgentMessagePresentation, withMessageHiddenFromTranscript, withMessageRequestHiddenFromTranscript } from '../../common/meta/agentMessageMeta.js';
import { readAgentModelCallDetail } from '../../common/meta/agentModelCallMeta.js';
import { readAgentModelPricingMeta } from '../../common/meta/agentModelMeta.js';
import { AgentPermissionRequestKind, readAgentPermissionRequestMeta, withPermissionDiff } from '../../common/meta/agentPermissionRequestMeta.js';
import { readAgentToolOutputDelta, readToolCallMeta, withAgentToolPreferences } from '../../common/meta/agentToolCallMeta.js';
import { readAgentContextUsage, readUsageInfoMeta } from '../../common/meta/agentUsageMeta.js';
import { MessageAttachmentKind, MessageKind, type Message, type ToolDefinition } from '../../common/state/protocol/state.js';

function readerMatrix<T>(name: string, read: (meta: Record<string, unknown> | undefined) => T, absent: T, cases: { name: string; meta: Record<string, unknown>; expected: T }[]): void {
	suite(name, () => {
		for (const entry of [
			{ name: 'absent metadata', meta: undefined, expected: absent },
			{ name: 'empty metadata', meta: {}, expected: absent },
			{ name: 'unrelated metadata', meta: { future: { enabled: true } }, expected: absent },
			...cases,
		]) {
			test(entry.name, () => assert.deepStrictEqual(read(entry.meta), entry.expected));
		}
	});
}

suite('Metadata compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('permission diffs are additive and do not change native VS Code presentation', () => {
		const original = { toolKind: 'read', mcpServerName: 'server' };
		const meta = withPermissionDiff(original, '--- a/file\n+++ b/file\n');
		assert.deepStrictEqual({
			meta,
			native: readToolCallMeta({ _meta: meta }),
			permission: readAgentPermissionRequestMeta({ _meta: meta }),
			noDiff: withPermissionDiff(original, undefined),
			original,
		}, {
			meta: { ...original, permissionRequest: { diff: '--- a/file\n+++ b/file\n' } },
			native: original,
			permission: {},
			noDiff: original,
			original,
		});
	});

	const presentation = { hiddenFromTranscript: false, requestHiddenFromTranscript: false, systemInitiatedLabel: undefined };
	const message = (meta?: Record<string, unknown>): Message => ({ text: 'display', origin: { kind: MessageKind.User }, _meta: meta });
	readerMatrix('message presentation', meta => readAgentMessagePresentation(message(meta)), presentation, [
		{ name: 'VS Code', meta: { 'vscode.chat.requestHiddenFromTranscript': true }, expected: { ...presentation, requestHiddenFromTranscript: true } },
		{ name: 'Copilot D', meta: { 'copilot.visibility': 'internal' }, expected: { ...presentation, requestHiddenFromTranscript: true } },
		{ name: 'both styles preserve explicit VS Code false', meta: { 'vscode.chat.requestHiddenFromTranscript': false, 'copilot.visibility': 'internal' }, expected: presentation },
		{ name: 'malformed VS Code does not fall through', meta: { 'vscode.chat.requestHiddenFromTranscript': null, 'copilot.visibility': 'internal' }, expected: presentation },
		{ name: 'malformed Copilot D', meta: { 'copilot.visibility': true }, expected: presentation },
	]);

	const attachment = { type: 'selection', text: 'captured', future: { value: 1 } };
	const attachmentDetail = { type: 'selection', raw: attachment, text: 'captured', url: undefined };
	readerMatrix('attachment detail', meta => readAttachmentDetail({ _meta: meta }), undefined, [
		{ name: 'VS Code-only attachments remain independent', meta: { browserView: { url: 'https://example.com' } }, expected: undefined },
		{ name: 'Copilot D preserves open payloads', meta: { 'copilot.attachmentDetail': attachment }, expected: attachmentDetail },
		{ name: 'other attachment metadata does not hide Copilot detail', meta: { 'copilot.attachmentDetail': attachment, browserView: null }, expected: attachmentDetail },
		{ name: 'malformed detail', meta: { 'copilot.attachmentDetail': { type: 1 } }, expected: undefined },
	]);
	const forwarded = { fetchError: { type: 'failed', requestId: 'vscode' } };
	readerMatrix('error detail', meta => readErrorDetail({ _meta: meta }), undefined, [
		{ name: 'VS Code', meta: { chatError: forwarded }, expected: { kind: 'fetch', value: forwarded } },
		{ name: 'Copilot D preserves false and zero', meta: { 'copilot.errorDetail': { statusCode: 0, eligibleForAutoSwitch: false } }, expected: { kind: 'diagnostic', statusCode: 0, eligibleForAutoSwitch: false } },
		{ name: 'both styles choose a complete VS Code result', meta: { chatError: forwarded, 'copilot.errorDetail': { url: 'https://example.com' } }, expected: { kind: 'fetch', value: forwarded } },
		{ name: 'malformed VS Code falls back', meta: { chatError: {}, 'copilot.errorDetail': { errorCode: 'remote' } }, expected: { kind: 'diagnostic', errorCode: 'remote' } },
		{ name: 'malformed Copilot D', meta: { 'copilot.errorDetail': [] }, expected: undefined },
	]);

	const latest = { cost: 0, duration: 12, contentFilterTriggered: false };
	readerMatrix('usage', meta => readUsageInfoMeta({ inputTokens: 10, outputTokens: 3, _meta: meta }), {}, [
		{ name: 'VS Code preserves zero turn cost', meta: { cost: 0 }, expected: { cost: 0 } },
		{ name: 'Copilot D latest call is not a whole-turn cost', meta: { 'copilot.usageDetail': latest }, expected: { latestModelCall: latest } },
		{ name: 'both styles do not mix cost scopes', meta: { cost: 2, 'copilot.usageDetail': latest }, expected: { cost: 2 } },
		{ name: 'malformed VS Code does not fall through', meta: { cost: null, 'copilot.usageDetail': latest }, expected: {} },
		{ name: 'meaningful empty VS Code usage wins', meta: { copilotUsage: {}, 'copilot.usageDetail': latest }, expected: { copilotUsage: {} } },
		{ name: 'malformed Copilot D', meta: { 'copilot.usageDetail': [] }, expected: {} },
	]);
	const context = { currentTokens: 0, tokenLimit: 100, messagesLength: 0 };
	readerMatrix('context usage', meta => readAgentContextUsage({ _meta: meta }, undefined), undefined, [
		{ name: 'Copilot D zero counts', meta: { 'copilot.usageInfo': context }, expected: context },
		{ name: 'native usage tokens are not context occupancy', meta: { 'copilot.usageDetail': { inputTokens: 50 } }, expected: undefined },
		{ name: 'invalid capacity', meta: { 'copilot.usageInfo': { ...context, tokenLimit: 0 } }, expected: undefined },
	]);
	readerMatrix('model pricing', meta => readAgentModelPricingMeta({ id: 'model', provider: 'copilot', name: 'Model', _meta: meta }), {}, [
		{ name: 'VS Code preserves zero prices', meta: { inputCost: 0, category: 'lightweight' }, expected: { inputCost: 0, category: 'lightweight' } },
		{ name: 'Copilot D', meta: { 'copilot.modelPickerCategory': 'powerful' }, expected: { category: 'powerful' } },
		{ name: 'both styles do not fill in the category', meta: { inputCost: 1, 'copilot.modelPickerCategory': 'powerful' }, expected: { inputCost: 1 } },
		{ name: 'malformed VS Code does not fall through', meta: { category: null, 'copilot.modelPickerCategory': 'powerful' }, expected: {} },
		{ name: 'unknown Copilot category', meta: { 'copilot.modelPickerCategory': 'future' }, expected: {} },
	]);
	readerMatrix('model-call detail', meta => {
		const detail = readAgentModelCallDetail({ inputTokens: 10, outputTokens: 3, _meta: meta });
		return detail && { providerCallId: detail.providerCallId, durationMs: detail.durationMs, timeToFirstTokenMs: detail.timeToFirstTokenMs };
	}, undefined, [
		{ name: 'VS Code correlation remains available', meta: { 'vscode.modelCall': { schemaVersion: 1, sdkSessionId: 'sdk', eventId: 'event', providerCallId: 'vs', durationMs: 0 } }, expected: { providerCallId: 'vs', durationMs: 0, timeToFirstTokenMs: undefined } },
		{ name: 'Copilot D normalized duration', meta: { 'copilot.usageDetail': { providerCallId: 'remote', duration: 12, timeToFirstTokenMs: 0 } }, expected: { providerCallId: 'remote', durationMs: 12, timeToFirstTokenMs: 0 } },
		{ name: 'invalid VS Code IDs do not borrow Copilot correlation', meta: { 'vscode.modelCall': { schemaVersion: 1 }, 'copilot.usageDetail': { providerCallId: 'remote', duration: 12 } }, expected: undefined },
		{ name: 'malformed Copilot D', meta: { 'copilot.usageDetail': [] }, expected: undefined },
	]);
	readerMatrix('tool presentation', meta => readToolCallMeta({ _meta: meta }), {}, [
		{ name: 'VS Code terminal', meta: { toolKind: 'terminal', language: 'shellscript', autoApproveBySetting: false }, expected: { toolKind: 'terminal', language: 'shellscript', autoApproveBySetting: false } },
		{ name: 'Copilot origin does not fabricate a tool kind', meta: { 'copilot.toolOrigin': { kind: 'builtin', namespacedName: 'bash' } }, expected: {} },
		{ name: 'unknown VS Code kind', meta: { toolKind: 'future' }, expected: {} },
		{ name: 'portable MCP app metadata', meta: { ui: { resourceUri: 'ui://app', channel: 'mcp://server' } }, expected: { ui: { resourceUri: 'ui://app', channel: 'mcp://server' } } },
	]);
	readerMatrix('tool output', meta => readAgentToolOutputDelta({ _meta: meta }, {}, {}), undefined, [
		{ name: 'Copilot D', meta: { 'copilot.toolOutputDelta': 'output' }, expected: { output: 'output', isPty: false } },
		{ name: 'PTY does not imply a terminal resource', meta: { ptyTerminal: { output: 'output' } }, expected: { output: 'output', isPty: true } },
		{ name: 'empty output', meta: { 'copilot.toolOutputDelta': '' }, expected: undefined },
		{ name: 'malformed output', meta: { 'copilot.toolOutputDelta': 7 }, expected: undefined },
	]);
	readerMatrix('legacy permission bridge', meta => readAgentPermissionRequestMeta({ _meta: meta }), {}, [
		{ name: 'VS Code tool kind remains authoritative', meta: { toolKind: 'read', permissionRequest: { kind: 'shell' } }, expected: {} },
		{ name: 'Copilot shell', meta: { permissionRequest: { kind: 'shell' } }, expected: { kind: AgentPermissionRequestKind.Commands } },
		{ name: 'projected read permission', meta: { promptRequest: { kind: 'read' } }, expected: { kind: AgentPermissionRequestKind.Read } },
		{ name: 'projected write permission', meta: { promptRequest: { kind: 'write', fileName: '/workspace/file.ts' } }, expected: { kind: AgentPermissionRequestKind.Write, fileName: '/workspace/file.ts' } },
		{ name: 'raw write permission', meta: { permissionRequest: { kind: 'write', fileName: '/workspace/file.ts' } }, expected: { kind: AgentPermissionRequestKind.Write, fileName: '/workspace/file.ts' } },
		{ name: 'projected request wins without borrowing a raw filename', meta: { promptRequest: { kind: 'write' }, permissionRequest: { kind: 'write', fileName: '/other.ts' } }, expected: { kind: AgentPermissionRequestKind.Write } },
		{ name: 'malformed filename', meta: { promptRequest: { kind: 'write', fileName: 42 } }, expected: { kind: AgentPermissionRequestKind.Write } },
		{ name: 'empty filename', meta: { promptRequest: { kind: 'write', fileName: ' ' } }, expected: { kind: AgentPermissionRequestKind.Write } },
		{ name: 'malformed projected request falls back to raw', meta: { promptRequest: [], permissionRequest: { kind: 'write', fileName: '/workspace/file.ts' } }, expected: { kind: AgentPermissionRequestKind.Write, fileName: '/workspace/file.ts' } },
		{ name: 'malformed VS Code does not fall through', meta: { toolKind: null, permissionRequest: { kind: 'shell' } }, expected: {} },
		{ name: 'unrecognized permission is generic', meta: { permissionRequest: { kind: 'path', accessKind: 'shell' } }, expected: {} },
	]);

	test('VS Code context attribution and tool rendering take precedence at either lifecycle stage', () => {
		assert.deepStrictEqual({
			context: readAgentContextUsage({ _meta: { 'copilot.usageInfo': context } }, { inputTokens: 10, outputTokens: 3, _meta: { contextAttribution: null } }),
			toolOutput: [null, 'terminal'].flatMap(toolKind => [
				readAgentToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': 'output' } }, { _meta: { toolKind } }, {}),
				readAgentToolOutputDelta({ _meta: { 'copilot.toolOutputDelta': 'output' } }, {}, { _meta: { toolKind } }),
			]),
			legacyPrefix: readAgentMessagePresentation({ ...message({ 'copilot.visibility': 'internal' }), text: '<!-- vscode-hidden-from-transcript -->\ndisplay' }),
		}, {
			context: undefined, toolOutput: [undefined, undefined, undefined, undefined],
			legacyPrefix: { ...presentation, hiddenFromTranscript: true },
		});
	});

	test('public message visibility writers preserve legacy text and metadata without duplicating prefixes', () => {
		const original: Message = { ...message({ opaque: false }), text: 'continue' };
		const hidden = withMessageRequestHiddenFromTranscript(original, true);
		assert.deepStrictEqual({
			text: hidden.text, meta: hidden._meta, repeat: withMessageRequestHiddenFromTranscript(hidden, true).text,
			unchanged: withMessageRequestHiddenFromTranscript(original, false) === original,
			fullyHidden: withMessageRequestHiddenFromTranscript(withMessageHiddenFromTranscript(original, true), true)._meta,
		}, {
			text: '<!-- vscode-request-hidden-from-transcript -->\ncontinue',
			meta: { opaque: false, 'vscode.chat.requestHiddenFromTranscript': true, 'copilot.visibility': 'internal' },
			repeat: hidden.text, unchanged: true,
			fullyHidden: { opaque: false, 'vscode.chat.hiddenFromTranscript': true },
		});
	});
	test('attachment and tool writers preserve siblings and do not invent preferences', () => {
		const tool: ToolDefinition = { name: 'test', description: 'Test', inputSchema: { type: 'object' }, _meta: { opaque: 0 } };
		const value = withAttachmentDetail({ type: MessageAttachmentKind.Simple, label: 'selection', _meta: { opaque: false } }, attachment);
		assert.deepStrictEqual({
			attachment: value._meta,
			tool: withAgentToolPreferences(tool, { defer: 'never', availability: 'userChats' })._meta,
			noPreference: withAgentToolPreferences(tool, undefined) === tool,
		}, {
			attachment: { opaque: false, 'copilot.attachmentDetail': attachment },
			tool: { opaque: 0, 'copilot.toolDefer': 'never', 'copilot.toolAvailability': 'userChats' },
			noPreference: true,
		});
	});
});
