/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import {
	buildClaudeCodeSession,
	sdkSessionInfoToSessionInfo,
	sdkSessionMessagesToStoredMessages,
	SubagentCorrelationMap,
} from '../sdkSessionAdapter';

// #region Test Helpers

function createSdkSessionInfo(overrides?: Partial<SDKSessionInfo>): SDKSessionInfo {
	return {
		sessionId: 'test-session-id',
		summary: 'Test session summary',
		lastModified: 1700000000000,
		...overrides,
	};
}

function createUserSessionMessage(overrides?: Partial<SessionMessage> & { messageContent?: unknown }): SessionMessage {
	const { messageContent, ...rest } = overrides ?? {};
	return {
		type: 'user',
		uuid: 'user-uuid-1',
		session_id: 'test-session-id',
		message: messageContent ?? {
			role: 'user',
			content: 'Hello, Claude!',
		},
		parent_tool_use_id: null,
		...rest,
	};
}

function createAssistantSessionMessage(overrides?: Partial<SessionMessage> & { messageContent?: unknown }): SessionMessage {
	const { messageContent, ...rest } = overrides ?? {};
	return {
		type: 'assistant',
		uuid: 'assistant-uuid-1',
		session_id: 'test-session-id',
		message: messageContent ?? {
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Hello! How can I help you?' },
			],
		},
		parent_tool_use_id: null,
		...rest,
	};
}

// #endregion

// #region sdkSessionInfoToSessionInfo

describe('sdkSessionInfoToSessionInfo', () => {
	it('maps basic fields correctly', () => {
		const info = createSdkSessionInfo({
			sessionId: 'abc-123',
			summary: 'Fix bug in parser',
			lastModified: 1700000000000,
			createdAt: 1699999990000,
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.id).toBe('abc-123');
		expect(result.label).toBe('Fix bug in parser');
		expect(result.created).toBe(1699999990000);
		expect(result.lastRequestEnded).toBe(1700000000000);
	});

	it('uses lastModified as created when createdAt is missing', () => {
		const info = createSdkSessionInfo({ createdAt: undefined });

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.created).toBe(info.lastModified);
	});

	it('passes folderName through', () => {
		const info = createSdkSessionInfo();

		const result = sdkSessionInfoToSessionInfo(info, 'my-project');

		expect(result.folderName).toBe('my-project');
	});

	it('uses customTitle over summary when present', () => {
		const info = createSdkSessionInfo({
			customTitle: 'My Custom Title',
			summary: 'This is the summary',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('My Custom Title');
	});

	it('strips <system-reminder> tags from summary', () => {
		const info = createSdkSessionInfo({
			summary: '<system-reminder>some internal stuff</system-reminder>Fix the login bug',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('Fix the login bug');
	});

	it('strips <system-reminder> tags from firstPrompt', () => {
		const info = createSdkSessionInfo({
			summary: '',
			firstPrompt: '<system-reminder>internal</system-reminder>Hello, help me with React',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('Hello, help me with React');
	});

	it('falls back to firstPrompt when summary is empty', () => {
		const info = createSdkSessionInfo({
			summary: '',
			firstPrompt: 'My first prompt',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('My first prompt');
	});

	it('falls back to "Claude Session" when all label sources are empty', () => {
		const info = createSdkSessionInfo({
			summary: '',
			firstPrompt: '',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('Claude Session');
	});

	it('truncates long labels to 50 characters', () => {
		const longSummary = 'This is a very long summary that exceeds fifty characters in length and should be truncated';
		const info = createSdkSessionInfo({ summary: longSummary });

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label.length).toBeLessThanOrEqual(51); // 50 + ellipsis character
		expect(result.label).toContain('…');
	});

	it('handles summary that is only <system-reminder> tags', () => {
		const info = createSdkSessionInfo({
			summary: '<system-reminder>only internal stuff here</system-reminder>',
			firstPrompt: 'Fallback prompt',
		});

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.label).toBe('Fallback prompt');
	});

	it('passes cwd through from SDKSessionInfo', () => {
		const info = createSdkSessionInfo({ cwd: '/home/user/project' });

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.cwd).toBe('/home/user/project');
	});

	it('returns undefined cwd when not present in SDKSessionInfo', () => {
		const info = createSdkSessionInfo();

		const result = sdkSessionInfoToSessionInfo(info);

		expect(result.cwd).toBeUndefined();
	});
});

// #endregion

// #region sdkSessionMessagesToStoredMessages

describe('sdkSessionMessagesToStoredMessages', () => {
	it('converts a user message', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({
				uuid: 'u1',
				session_id: 'sess-1',
				messageContent: { role: 'user', content: 'Hello!' },
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(1);
		expect(result[0].uuid).toBe('u1');
		expect(result[0].sessionId).toBe('sess-1');
		expect(result[0].type).toBe('user');
		expect(result[0].message).toEqual({ role: 'user', content: 'Hello!' });
		expect(result[0].parentUuid).toBeNull();
		expect(result[0].timestamp).toEqual(new Date(0));
	});

	it('converts an assistant message', () => {
		const messages: SessionMessage[] = [
			createAssistantSessionMessage({
				uuid: 'a1',
				session_id: 'sess-1',
				messageContent: {
					role: 'assistant',
					content: [{ type: 'text', text: 'Hi there!' }],
				},
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(1);
		expect(result[0].uuid).toBe('a1');
		expect(result[0].type).toBe('assistant');
		expect(result[0].message).toEqual({
			role: 'assistant',
			content: [{ type: 'text', text: 'Hi there!' }],
		});
	});

	it('converts a multi-turn conversation', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', messageContent: { role: 'user', content: 'Hello' } }),
			createAssistantSessionMessage({
				uuid: 'a1',
				messageContent: { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
			}),
			createUserSessionMessage({ uuid: 'u2', messageContent: { role: 'user', content: 'Help me' } }),
			createAssistantSessionMessage({
				uuid: 'a2',
				messageContent: { role: 'assistant', content: [{ type: 'text', text: 'Sure!' }] },
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(4);
		expect(result.map(m => m.type)).toEqual(['user', 'assistant', 'user', 'assistant']);
	});

	it('skips messages with invalid content', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', messageContent: { role: 'user', content: 'Valid' } }),
			createUserSessionMessage({ uuid: 'u2', messageContent: { role: 'invalid', content: 123 } }),
			createAssistantSessionMessage({
				uuid: 'a1',
				messageContent: { role: 'assistant', content: [{ type: 'text', text: 'Valid' }] },
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(2);
		expect(result[0].uuid).toBe('u1');
		expect(result[1].uuid).toBe('a1');
	});

	it('handles empty message array', () => {
		const result = sdkSessionMessagesToStoredMessages([]);

		expect(result).toEqual([]);
	});

	it('sets toolUseResultAgentId from subagent correlation map', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', messageContent: { role: 'user', content: 'Run task' } }),
		];
		const correlation: SubagentCorrelationMap = new Map([['u1', 'agent-abc']]);

		const result = sdkSessionMessagesToStoredMessages(messages, correlation);

		expect(result).toHaveLength(1);
		expect(result[0].toolUseResultAgentId).toBe('agent-abc');
	});

	it('does not set toolUseResultAgentId when UUID is not in correlation map', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', messageContent: { role: 'user', content: 'No task' } }),
		];
		const correlation: SubagentCorrelationMap = new Map([['other-uuid', 'agent-xyz']]);

		const result = sdkSessionMessagesToStoredMessages(messages, correlation);

		expect(result).toHaveLength(1);
		expect(result[0].toolUseResultAgentId).toBeUndefined();
	});

	it('handles user message with content block array', () => {
		const messages: SessionMessage[] = [
			createUserSessionMessage({
				uuid: 'u1',
				messageContent: {
					role: 'user',
					content: [
						{ type: 'text', text: 'Multi-block user message' },
					],
				},
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('user');
	});

	it('handles assistant message with tool_use blocks', () => {
		const messages: SessionMessage[] = [
			createAssistantSessionMessage({
				uuid: 'a1',
				messageContent: {
					role: 'assistant',
					content: [
						{ type: 'text', text: 'Let me search for that.' },
						{
							type: 'tool_use',
							id: 'toolu_123',
							name: 'Glob',
							input: { pattern: '**/*.ts' },
						},
					],
				},
			}),
		];

		const result = sdkSessionMessagesToStoredMessages(messages);

		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('assistant');
	});
});

// #endregion

// #region buildClaudeCodeSession

describe('buildClaudeCodeSession', () => {
	it('assembles full session from SDK data', () => {
		const info = createSdkSessionInfo({
			sessionId: 'sess-1',
			summary: 'Test session',
			lastModified: 1700000000000,
			createdAt: 1699999990000,
		});
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', session_id: 'sess-1', messageContent: { role: 'user', content: 'Hi' } }),
			createAssistantSessionMessage({
				uuid: 'a1',
				session_id: 'sess-1',
				messageContent: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
			}),
		];

		const result = buildClaudeCodeSession(info, messages, []);

		expect(result.id).toBe('sess-1');
		expect(result.label).toBe('Test session');
		expect(result.created).toBe(1699999990000);
		expect(result.lastRequestEnded).toBe(1700000000000);
		expect(result.messages).toHaveLength(2);
		expect(result.subagents).toEqual([]);
	});

	it('includes subagents in the assembled session', () => {
		const info = createSdkSessionInfo({ sessionId: 'sess-1' });
		const messages: SessionMessage[] = [
			createUserSessionMessage({ session_id: 'sess-1', messageContent: { role: 'user', content: 'Run task' } }),
		];
		const subagents = [{
			agentId: 'agent-1',
			messages: [],
			timestamp: new Date(1700000000000),
		}];

		const result = buildClaudeCodeSession(info, messages, subagents);

		expect(result.subagents).toHaveLength(1);
		expect(result.subagents[0].agentId).toBe('agent-1');
	});

	it('passes subagent correlation to stored messages', () => {
		const info = createSdkSessionInfo({ sessionId: 'sess-1' });
		const messages: SessionMessage[] = [
			createUserSessionMessage({ uuid: 'u1', session_id: 'sess-1', messageContent: { role: 'user', content: 'task result' } }),
		];
		const correlation: SubagentCorrelationMap = new Map([['u1', 'agent-abc']]);

		const result = buildClaudeCodeSession(info, messages, [], correlation);

		expect(result.messages[0].toolUseResultAgentId).toBe('agent-abc');
	});

	it('passes folderName through to session info', () => {
		const info = createSdkSessionInfo();
		const messages: SessionMessage[] = [
			createUserSessionMessage({ messageContent: { role: 'user', content: 'Hi' } }),
		];

		const result = buildClaudeCodeSession(info, messages, [], undefined, 'my-workspace');

		expect(result.folderName).toBe('my-workspace');
	});
});

// #endregion
