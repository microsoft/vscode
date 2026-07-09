/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
	buildSubagentSession,
	parseSessionFileContent,
} from '../claudeSessionParser';
import { isUserRequest } from '../claudeSessionSchema';

describe('claudeSessionParser', () => {
	// ========================================================================
	// parseSessionFileContent (Layer 2)
	// ========================================================================

	describe('parseSessionFileContent', () => {
		it('should parse empty content', () => {
			const result = parseSessionFileContent('');

			expect(result.nodes.size).toBe(0);
			expect(result.summaries.size).toBe(0);
			expect(result.errors.length).toBe(0);
			expect(result.stats.totalLines).toBe(1);
			expect(result.stats.skippedEmpty).toBe(1);
		});

		it('should parse queue operation (no uuid, skipped)', () => {
			const content = '{"type":"queue-operation","operation":"dequeue","timestamp":"2026-01-31T00:34:50.025Z","sessionId":"6762c0b9-ee55-42cc-8998-180da7f37462"}';
			const result = parseSessionFileContent(content);

			expect(result.nodes.size).toBe(0);
			expect(result.stats.queueOperations).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		it('should parse user message as chain node', () => {
			const content = JSON.stringify({
				parentUuid: null,
				isSidechain: false,
				type: 'user',
				message: { role: 'user', content: 'Hello, Claude!' },
				uuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:34:50.049Z',
				cwd: '/Users/test/project',
				version: '2.1.5',
				gitBranch: 'main',
				slug: 'test-session',
				userType: 'external',
			});

			const result = parseSessionFileContent(content);

			expect(result.nodes.size).toBe(1);
			expect(result.stats.chainNodes).toBe(1);
			expect(result.errors.length).toBe(0);

			const node = result.nodes.get('8d4dcda5-3984-42c4-9b9e-d57f64a924dc');
			expect(node).toBeDefined();
			expect(node?.raw.type).toBe('user');
			expect(node?.parentUuid).toBeNull();
		});

		it('should parse assistant message as chain node', () => {
			const content = JSON.stringify({
				parentUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				isSidechain: false,
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'text', text: 'Hello!' }],
					id: 'msg_123',
					model: 'claude-opus-4-5-20251101',
					stop_reason: 'end_turn',
					stop_sequence: null,
				},
				uuid: 'cc74a117-72ce-4ea6-8d01-4401e60ddfeb',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:35:00.000Z',
			});

			const result = parseSessionFileContent(content);

			expect(result.nodes.size).toBe(1);
			expect(result.stats.chainNodes).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		it('should parse assistant message with cache_creation: null in usage', () => {
			const content = JSON.stringify({
				parentUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				isSidechain: false,
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'text', text: 'Hello!' }],
					id: 'msg_123',
					model: 'claude-sonnet-4',
					type: 'message',
					stop_reason: null,
					stop_sequence: null,
					usage: {
						input_tokens: 0,
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
						output_tokens: 1,
						cache_creation: null,
					},
				},
				uuid: 'cc74a117-72ce-4ea6-8d01-4401e60ddfeb',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:35:00.000Z',
			});

			const result = parseSessionFileContent(content);

			expect(result.nodes.size).toBe(1);
			expect(result.stats.chainNodes).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		it('should parse compact boundary using logicalParentUuid', () => {
			const content = JSON.stringify({
				type: 'system',
				subtype: 'compact_boundary',
				uuid: 'compact-uuid',
				parentUuid: null,
				logicalParentUuid: 'pre-compact-uuid',
				isSidechain: false,
				content: 'Conversation compacted',
				timestamp: '2026-02-09T06:49:50.112Z',
			});

			const result = parseSessionFileContent(content);

			expect(result.stats.chainNodes).toBe(1);
			expect(result.errors.length).toBe(0);
			const node = result.nodes.get('compact-uuid');
			expect(node).toBeDefined();
			// logicalParentUuid takes precedence over parentUuid
			expect(node?.parentUuid).toBe('pre-compact-uuid');
		});

		it('should keep isCompactSummary user messages as chain nodes (not excluded)', () => {
			const lines = [
				JSON.stringify({
					parentUuid: null,
					type: 'user',
					message: { role: 'user', content: 'Hello' },
					uuid: 'uuid-1',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:01:00.000Z',
				}),
				JSON.stringify({
					parentUuid: 'uuid-1',
					type: 'user',
					message: { role: 'user', content: 'This is a compaction summary of the conversation...' },
					uuid: 'uuid-summary',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:02:00.000Z',
					isCompactSummary: true,
				}),
				JSON.stringify({
					parentUuid: 'uuid-summary',
					type: 'assistant',
					message: { role: 'assistant', content: [{ type: 'text', text: 'After compaction' }], stop_reason: 'end_turn', stop_sequence: null },
					uuid: 'uuid-2',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:03:00.000Z',
				}),
			];

			const result = parseSessionFileContent(lines.join('\n'));

			// All 3 entries are chain nodes (isCompactSummary is just a flag for layer 3)
			expect(result.nodes.size).toBe(3);
			expect(result.nodes.has('uuid-summary')).toBe(true);
		});

		it('should parse microcompact boundary using parentUuid when no logicalParentUuid', () => {
			const content = JSON.stringify({
				type: 'system',
				subtype: 'microcompact_boundary',
				uuid: 'micro-uuid',
				parentUuid: 'parent-uuid',
				isSidechain: false,
				content: 'Context microcompacted',
				timestamp: '2026-02-09T20:29:41.238Z',
			});

			const result = parseSessionFileContent(content);

			expect(result.stats.chainNodes).toBe(1);
			expect(result.errors.length).toBe(0);
			expect(result.nodes.get('micro-uuid')?.parentUuid).toBe('parent-uuid');
		});

		it('should parse summary entry', () => {
			const content = JSON.stringify({
				type: 'summary',
				summary: 'Implementing dark mode',
				leafUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
			});

			const result = parseSessionFileContent(content);

			expect(result.summaries.size).toBe(1);
			expect(result.stats.summaries).toBe(1);
			expect(result.summaries.get('8d4dcda5-3984-42c4-9b9e-d57f64a924dc')?.summary).toBe('Implementing dark mode');
		});

		it('should parse custom-title entry', () => {
			const content = JSON.stringify({
				type: 'custom-title',
				customTitle: 'omega-3',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
			});

			const result = parseSessionFileContent(content);

			expect(result.customTitle).toBeDefined();
			expect(result.customTitle!.customTitle).toBe('omega-3');
			expect(result.customTitle!.sessionId).toBe('6762c0b9-ee55-42cc-8998-180da7f37462');
			expect(result.stats.customTitles).toBe(1);
		});

		it('should parse empty custom-title entry', () => {
			const content = JSON.stringify({
				type: 'custom-title',
				customTitle: '',
				sessionId: 'session-1',
			});

			const result = parseSessionFileContent(content);

			expect(result.customTitle).toBeDefined();
			expect(result.customTitle!.customTitle).toBe('');
			expect(result.stats.customTitles).toBe(1);
		});

		it('should use last custom-title entry when multiple exist', () => {
			const lines = [
				JSON.stringify({ type: 'custom-title', customTitle: 'first-name', sessionId: 'session-1' }),
				JSON.stringify({ type: 'custom-title', customTitle: 'renamed-again', sessionId: 'session-1' }),
			];

			const result = parseSessionFileContent(lines.join('\n'));

			expect(result.customTitle).toBeDefined();
			expect(result.customTitle!.customTitle).toBe('renamed-again');
			expect(result.stats.customTitles).toBe(2);
		});

		it('should skip API error summaries', () => {
			const content = JSON.stringify({
				type: 'summary',
				summary: 'API error: 401 Unauthorized',
				leafUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
			});

			const result = parseSessionFileContent(content);

			expect(result.summaries.size).toBe(0);
			expect(result.stats.summaries).toBe(1); // Still counted
		});

		it('should handle multiple lines', () => {
			const lines = [
				'{"type":"queue-operation","operation":"dequeue","timestamp":"2026-01-31T00:34:50.025Z","sessionId":"6762c0b9-ee55-42cc-8998-180da7f37462"}',
				JSON.stringify({
					parentUuid: null,
					type: 'user',
					message: { role: 'user', content: 'Hello' },
					uuid: 'uuid-1234-5678-9012-123456789abc',
					sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
					timestamp: '2026-01-31T00:34:50.049Z',
				}),
				JSON.stringify({
					parentUuid: 'uuid-1234-5678-9012-123456789abc',
					type: 'assistant',
					message: { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }], stop_reason: 'end_turn', stop_sequence: null },
					uuid: 'uuid-aaaa-bbbb-cccc-ddddeeeeeeee',
					sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
					timestamp: '2026-01-31T00:35:00.000Z',
				}),
			];

			const result = parseSessionFileContent(lines.join('\n'));

			expect(result.nodes.size).toBe(2);
			expect(result.stats.chainNodes).toBe(2);
			expect(result.stats.queueOperations).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		it('should handle invalid JSON gracefully', () => {
			const content = 'not valid json\n{"valid":"json"}';
			const result = parseSessionFileContent(content, 'test-file.jsonl');

			expect(result.stats.errors).toBeGreaterThanOrEqual(1);
			expect(result.errors.length).toBeGreaterThanOrEqual(1);
			expect(result.errors[0].message).toContain('test-file.jsonl:1');
		});

		it('should skip empty lines', () => {
			const content = '\n\n{"type":"queue-operation","operation":"dequeue","timestamp":"2026-01-31T00:34:50.025Z","sessionId":"6762c0b9-ee55-42cc-8998-180da7f37462"}\n\n';
			const result = parseSessionFileContent(content);

			expect(result.stats.skippedEmpty).toBe(4);
			expect(result.stats.queueOperations).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		it('should parse progress entries as chain nodes', () => {
			const content = JSON.stringify({
				uuid: 'progress-uuid',
				parentUuid: 'msg-uuid',
				type: 'progress',
				data: { type: 'agent_progress' },
			});

			const result = parseSessionFileContent(content);

			expect(result.nodes.size).toBe(1);
			expect(result.nodes.get('progress-uuid')?.parentUuid).toBe('msg-uuid');
		});
	});

	// ========================================================================
	// isUserRequest
	// ========================================================================

	describe('isUserRequest', () => {
		it('should return true for string content', () => {
			expect(isUserRequest('Hello world')).toBe(true);
		});

		it('should return true for array with text block', () => {
			expect(isUserRequest([{ type: 'text', text: 'Hello' }])).toBe(true);
		});

		it('should return false for array with only tool_result blocks', () => {
			expect(isUserRequest([
				{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
				{ type: 'tool_result', tool_use_id: 'tool-2', content: 'result' },
			])).toBe(false);
		});

		it('should return true for mixed array with tool_result and text', () => {
			expect(isUserRequest([
				{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
				{ type: 'text', text: 'Follow-up question' },
			])).toBe(true);
		});

		it('should return false for empty array', () => {
			expect(isUserRequest([])).toBe(false);
		});
	});

	// #region buildSubagentSession

	describe('buildSubagentSession', () => {
		it('should build subagent session from parsed content', () => {
			const lines = [
				JSON.stringify({
					parentUuid: null,
					type: 'user',
					message: { role: 'user', content: 'Task for subagent' },
					uuid: 'uuid-1',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:34:50.049Z',
					agentId: 'a139fcf',
				}),
				JSON.stringify({
					parentUuid: 'uuid-1',
					type: 'assistant',
					message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }], stop_reason: 'end_turn', stop_sequence: null },
					uuid: 'uuid-2',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:35:00.000Z',
					agentId: 'a139fcf',
				}),
			];

			const parseResult = parseSessionFileContent(lines.join('\n'));
			const subagent = buildSubagentSession('a139fcf', parseResult);

			expect(subagent).not.toBeNull();
			expect(subagent!.agentId).toBe('a139fcf');
			expect(subagent!.messages.length).toBe(2);
			expect(subagent!.messages[0].uuid).toBe('uuid-1');
			expect(subagent!.messages[1].uuid).toBe('uuid-2');
			expect(subagent!.timestamp).toEqual(new Date('2026-01-31T00:35:00.000Z'));
		});

		it('should return null for empty content', () => {
			const parseResult = parseSessionFileContent('');
			const subagent = buildSubagentSession('a139fcf', parseResult);

			expect(subagent).toBeNull();
		});

		it('should walk through chain link entries', () => {
			const lines = [
				JSON.stringify({
					uuid: 'chain-1',
					parentUuid: null,
					type: 'progress',
				}),
				JSON.stringify({
					parentUuid: 'chain-1',
					type: 'user',
					message: { role: 'user', content: 'Hello' },
					uuid: 'uuid-2',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:35:00.000Z',
				}),
			];

			const parseResult = parseSessionFileContent(lines.join('\n'));
			const subagent = buildSubagentSession('test-agent', parseResult);

			expect(subagent).not.toBeNull();
			expect(subagent!.messages.length).toBe(1);
		});

		it('should pick the chain with most visible messages when multiple leaves exist', () => {
			const lines = [
				JSON.stringify({
					parentUuid: null,
					type: 'user',
					message: { role: 'user', content: 'Start' },
					uuid: 'uuid-1',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:34:00.000Z',
				}),
				JSON.stringify({
					parentUuid: 'uuid-1',
					type: 'assistant',
					message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }], stop_reason: 'end_turn', stop_sequence: null },
					uuid: 'uuid-2',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:35:00.000Z',
				}),
				JSON.stringify({
					parentUuid: 'uuid-2',
					type: 'user',
					message: { role: 'user', content: 'Follow-up' },
					uuid: 'uuid-3',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:36:00.000Z',
				}),
				// Orphaned branch
				JSON.stringify({
					parentUuid: 'uuid-1',
					type: 'user',
					message: { role: 'user', content: 'Tool result' },
					uuid: 'uuid-orphan',
					sessionId: 'session-1',
					timestamp: '2026-01-31T00:35:30.000Z',
				}),
			];

			const parseResult = parseSessionFileContent(lines.join('\n'));
			const subagent = buildSubagentSession('test-agent', parseResult);

			expect(subagent).not.toBeNull();
			expect(subagent!.messages.length).toBe(3);
			expect(subagent!.messages[2].uuid).toBe('uuid-3');
		});
	});

	// #endregion
});

