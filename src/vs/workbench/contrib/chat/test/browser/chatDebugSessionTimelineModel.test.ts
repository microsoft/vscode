/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createSessionTimelineModel } from '../../browser/chatDebug/chatDebugSessionTimelineModel.js';

suite('ChatDebugSessionTimelineModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds lossless message and paired tool events directly from JSONL', () => {
		const records = [
			{ type: 'system.message', id: 'system', parentId: null, timestamp: '2026-10-07T10:00:00.000Z', data: { content: 'system content', extra: 1 } },
			{ type: 'user.message', id: 'user', parentId: 'system', timestamp: '2026-10-07T10:00:01.000Z', data: { content: 'user content', transformedContent: 'transformed content' } },
			{ type: 'assistant.message', id: 'assistant', parentId: 'user', timestamp: '2026-10-07T10:00:02.000Z', data: { content: '', reasoningText: 'thinking', model: 'model', toolRequests: [{ name: 'read' }], encryptedContent: 'opaque' } },
			{ type: 'tool.execution_start', id: 'tool', parentId: 'assistant', timestamp: '2026-10-07T10:00:03.000Z', data: { toolCallId: 'call', toolName: 'view', arguments: { path: '/workspace/src/file.ts' } } },
			{ type: 'tool.execution_complete', id: 'complete', parentId: 'tool', timestamp: '2026-10-07T10:00:03.025Z', data: { toolCallId: 'call', success: true, result: { content: 'result' }, extra: 'preserved' } },
		];
		const model = createSessionTimelineModel(records.map(record => JSON.stringify(record)).join('\n'));

		assert.deepStrictEqual({
			totalRecords: model.totalRecords,
			errors: model.errors,
			events: model.events.map(event => ({
				parentEventId: event.parentEventId,
				category: event.category,
				title: event.title,
				summary: event.summary,
				summaryPath: event.summaryPath,
				metadata: event.metadata,
				sectionContent: event.sections.map(section => section.content),
				raw: event.rawRecords,
			})),
		}, {
			totalRecords: 5,
			errors: [],
			events: [
				{ parentEventId: undefined, category: 'system', title: '', summary: 'system content', summaryPath: undefined, metadata: [], sectionContent: ['system content'], raw: [records[0]] },
				{ parentEventId: undefined, category: 'user', title: '', summary: 'user content', summaryPath: undefined, metadata: [], sectionContent: ['user content', 'transformed content'], raw: [records[1]] },
				{ parentEventId: 'user', category: 'assistant', title: '', summary: '', summaryPath: undefined, metadata: ['model', 'reasoning (8 chars)', '1 tool request'], sectionContent: ['thinking', '- name: read'], raw: [records[2]] },
				{ parentEventId: 'assistant', category: 'tool', title: 'view', summary: '/workspace/src/file.ts', summaryPath: { directory: '/workspace/src/', basename: 'file.ts' }, metadata: ['25 ms'], sectionContent: ['path: /workspace/src/file.ts', 'content: result'], raw: [records[3], records[4]] },
			],
		});
	});

	test('reports malformed lines instead of silently dropping them', () => {
		const model = createSessionTimelineModel([
			'{"type":"user.message","id":"user","parentId":null,"timestamp":"2026-10-07T10:00:00.000Z","data":{"content":"ok"}}',
			'not-json',
			'{"type":"user.message"}',
		].join('\n'));

		assert.deepStrictEqual({
			totalRecords: model.totalRecords,
			eventCount: model.events.length,
			errors: model.errors.map(error => ({ line: error.line, hasMessage: error.message.length > 0 })),
		}, {
			totalRecords: 1,
			eventCount: 1,
			errors: [
				{ line: 2, hasMessage: true },
				{ line: 3, hasMessage: true },
			],
		});
	});

	test('shows response and reasoning sizes in assistant metadata', () => {
		const record = {
			type: 'assistant.message',
			id: 'assistant',
			parentId: null,
			timestamp: '2026-10-07T10:00:00.000Z',
			data: { content: 'answer', reasoningText: 'x'.repeat(1200), model: 'model' },
		};
		const model = createSessionTimelineModel(JSON.stringify(record));

		assert.deepStrictEqual(model.events.map(event => ({
			summary: event.summary,
			metadata: event.metadata,
		})), [
			{ summary: 'answer', metadata: ['model', 'response (6 chars)', 'reasoning (1.2k chars)'] },
		]);
	});

	test('extracts prompt-derived skills, tools, and instruction sections', () => {
		const content = [
			'<tools>',
			'<bash>Shell guidance</bash>',
			'<view>File guidance</view>',
			'<skill><available_skills>',
			'<skill><name>accessibility</name><description>Accessible UI</description></skill>',
			'<skill><name>unit-tests</name><description>Test guidance</description></skill>',
			'</available_skills></skill>',
			'<task>Delegation guidance</task>',
			'</tools>',
			'<code_change_instructions>Change safely</code_change_instructions>',
			'<custom_instruction>First customization</custom_instruction>',
			'<custom_instruction>Second customization</custom_instruction>',
		].join('\n');
		const record = {
			type: 'system.message',
			id: 'system',
			parentId: null,
			timestamp: '2026-10-07T10:00:00.000Z',
			data: { content },
		};
		const model = createSessionTimelineModel(JSON.stringify(record));

		assert.deepStrictEqual(model.events.map(event => ({
			promptCapabilities: event.promptCapabilities,
			sections: event.sections.map(section => ({ id: section.id, label: section.label, content: section.content })),
		})), [{
			promptCapabilities: {
				skills: ['accessibility', 'unit-tests'],
				tools: ['bash', 'view', 'skill', 'task'],
				instructions: ['Code Change Instructions', 'Custom Instruction (2)'],
				instructionCount: 3,
			},
			sections: [
				{ id: undefined, label: 'Content', content },
				{ id: 'skills', label: 'Advertised Skills', content: 'accessibility\nunit-tests' },
				{ id: 'tools', label: 'Tool Guidance', content: 'bash\nview\nskill\ntask' },
				{ id: 'instructions', label: 'Instruction Sections', content: 'Code Change Instructions\nCustom Instruction (2)' },
			],
		}]);
	});

	test('pairs external tools and subagents while retaining standalone completions', () => {
		const records = [
			{ type: 'external_tool.requested', id: 'external-start', parentId: null, timestamp: '2026-10-07T10:00:00.000Z', data: { requestId: 'request', toolCallId: 'external-call', toolName: 'browser', arguments: { url: 'https://example.com' }, workingDirectory: '/workspace' } },
			{ type: 'external_tool.completed', id: 'external-end', parentId: 'external-start', timestamp: '2026-10-07T10:00:00.100Z', data: { requestId: 'request', result: 'done' } },
			{ type: 'subagent.started', id: 'subagent-start', parentId: 'external-end', timestamp: '2026-10-07T10:00:01.000Z', data: { toolCallId: 'subagent-call', agentName: 'Explore', model: 'model' } },
			{ type: 'subagent.completed', id: 'subagent-end', parentId: 'subagent-start', timestamp: '2026-10-07T10:00:01.050Z', data: { toolCallId: 'subagent-call', result: 'found it' } },
			{ type: 'subagent.completed', id: 'orphan-subagent', parentId: 'subagent-end', timestamp: '2026-10-07T10:00:02.000Z', data: { toolCallId: 'orphan', result: 'standalone' } },
			{ type: 'subagent.deselected', id: 'deselected', parentId: 'orphan-subagent', timestamp: '2026-10-07T10:00:03.000Z', data: {} },
		];
		const model = createSessionTimelineModel(records.map(record => JSON.stringify(record)).join('\n'));

		assert.deepStrictEqual(model.events.map(event => ({
			category: event.category,
			title: event.title,
			summary: event.summary,
			metadata: event.metadata,
			sectionContent: event.sections.map(section => section.content),
			rawRecordIds: event.rawRecords.map(record => record.id),
		})), [
			{ category: 'tool', title: 'browser', summary: 'https://example.com', metadata: ['100 ms'], sectionContent: ['url: https://example.com', 'done'], rawRecordIds: ['external-start', 'external-end'] },
			{ category: 'subagent', title: 'Explore', summary: 'Subagent completed.', metadata: ['model', '50 ms'], sectionContent: ['- agentName: Explore\n  model: model\n- result: found it'], rawRecordIds: ['subagent-start', 'subagent-end'] },
			{ category: 'subagent', title: 'Subagent', summary: 'Subagent completed.', metadata: [], sectionContent: ['result: standalone'], rawRecordIds: ['orphan-subagent'] },
		]);
	});

	test('uses tool request ownership and tool starts for semantic hierarchy', () => {
		const records = [
			{ type: 'user.message', id: 'user', parentId: null, timestamp: '2026-10-07T10:00:00.000Z', data: { content: 'request' } },
			{ type: 'system.message', id: 'system', parentId: 'user', timestamp: '2026-10-07T10:00:01.000Z', data: { content: 'turn instructions' } },
			{ type: 'assistant.message', id: 'assistant', parentId: 'system', timestamp: '2026-10-07T10:00:02.000Z', data: { content: '', toolRequests: [{ toolCallId: 'call', name: 'task' }] } },
			{ type: 'tool.execution_start', id: 'tool', parentId: 'assistant', timestamp: '2026-10-07T10:00:03.000Z', data: { toolCallId: 'call', toolName: 'task', arguments: { description: 'Explore code' } } },
			{ type: 'subagent.started', id: 'subagent', parentId: 'tool', timestamp: '2026-10-07T10:00:04.000Z', data: { toolCallId: 'call', agentName: 'Explore' } },
			{ type: 'assistant.message', id: 'followup', parentId: 'subagent', timestamp: '2026-10-07T10:00:05.000Z', data: { content: 'done' } },
		];
		const model = createSessionTimelineModel(records.map(record => JSON.stringify(record)).join('\n'));

		assert.deepStrictEqual(model.events.map(event => ({
			id: event.id,
			parentEventId: event.parentEventId,
		})), [
			{ id: 'user', parentEventId: undefined },
			{ id: 'system', parentEventId: 'user' },
			{ id: 'assistant', parentEventId: 'system' },
			{ id: 'tool', parentEventId: 'assistant' },
			{ id: 'subagent', parentEventId: 'tool' },
			{ id: 'followup', parentEventId: 'system' },
		]);
	});

	test('keeps agent streams separate and resolves parent tool calls', () => {
		const records = [
			{ type: 'user.message', id: 'main-user', parentId: null, timestamp: '2026-10-07T10:00:00.000Z', data: { content: 'request' } },
			{ type: 'assistant.message', id: 'main-assistant', parentId: 'main-user', timestamp: '2026-10-07T10:00:01.000Z', data: { content: '', toolRequests: [{ toolCallId: 'spawn', name: 'task' }, { toolCallId: 'main-tool', name: 'view' }] } },
			{ type: 'tool.execution_start', id: 'spawn-tool', parentId: 'main-assistant', timestamp: '2026-10-07T10:00:02.000Z', data: { toolCallId: 'spawn', toolName: 'task', arguments: { description: 'Explore' } } },
			{ type: 'assistant.message', id: 'sub-assistant', parentId: 'spawn-tool', agentId: 'subagent-1', timestamp: '2026-10-07T10:00:03.000Z', data: { parentToolCallId: 'spawn', content: 'subagent response' } },
			{ type: 'tool.execution_start', id: 'nested-tool', parentId: 'sub-assistant', timestamp: '2026-10-07T10:00:04.000Z', data: { toolCallId: 'nested', parentToolCallId: 'spawn', toolName: 'rg', arguments: { pattern: 'needle' } } },
			{ type: 'tool.execution_start', id: 'main-tool', parentId: 'nested-tool', timestamp: '2026-10-07T10:00:05.000Z', data: { toolCallId: 'main-tool', toolName: 'view', arguments: { path: '/workspace/file.ts' } } },
		];
		const model = createSessionTimelineModel(records.map(record => JSON.stringify(record)).join('\n'));

		assert.deepStrictEqual(model.events.map(event => ({
			id: event.id,
			parentEventId: event.parentEventId,
		})), [
			{ id: 'main-user', parentEventId: undefined },
			{ id: 'main-assistant', parentEventId: 'main-user' },
			{ id: 'spawn-tool', parentEventId: 'main-assistant' },
			{ id: 'sub-assistant', parentEventId: 'spawn-tool' },
			{ id: 'nested-tool', parentEventId: 'spawn-tool' },
			{ id: 'main-tool', parentEventId: 'main-assistant' },
		]);
	});

	test('summarizes known tools and leaves unknown tools compact', () => {
		const records = [
			{ type: 'tool.execution_start', id: 'view', parentId: null, timestamp: '2026-10-07T10:00:00.000Z', data: { toolName: 'functions.view', arguments: { path: '/workspace/src/chatDebugSessionTimeline.ts' } } },
			{ type: 'tool.execution_start', id: 'rg', parentId: 'view', timestamp: '2026-10-07T10:00:01.000Z', data: { toolName: 'rg', arguments: { pattern: 'createSessionTimelineModel', paths: ['/workspace/src/chatDebugSessionTimelineModel.ts'] } } },
			{ type: 'tool.execution_start', id: 'skill', parentId: 'rg', timestamp: '2026-10-07T10:00:02.000Z', data: { toolName: 'skill', arguments: '{"skill":"accessibility"}' } },
			{ type: 'tool.execution_start', id: 'unknown', parentId: 'skill', timestamp: '2026-10-07T10:00:03.000Z', data: { toolName: 'custom_tool', arguments: { value: 'detail' } } },
		];
		const model = createSessionTimelineModel(records.map(record => JSON.stringify(record)).join('\n'));

		assert.deepStrictEqual(model.events.map(event => ({
			title: event.title,
			summary: event.summary,
			summaryPath: event.summaryPath,
		})), [
			{ title: 'functions.view', summary: '/workspace/src/chatDebugSessionTimeline.ts', summaryPath: { directory: '/workspace/src/', basename: 'chatDebugSessionTimeline.ts' } },
			{ title: 'rg', summary: 'createSessionTimelineModel · chatDebugSessionTimelineModel.ts', summaryPath: undefined },
			{ title: 'skill', summary: 'accessibility', summaryPath: undefined },
			{ title: 'custom_tool', summary: 'detail', summaryPath: undefined },
		]);
	});
});
