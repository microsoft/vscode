/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readToolCallMeta, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { readAgentCustomizationMeta, toAgentCustomizationMeta } from '../../common/meta/agentCustomizationMeta.js';
import { getCommandArgumentHint, readCompletionAttachmentMeta, toCommandCompletionAttachmentMeta, toSkillCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import { CustomizationType, MessageAttachmentKind, ToolCallStatus, type AgentCustomization, type ToolCallState } from '../../common/state/sessionState.js';
import type { SimpleMessageAttachment } from '../../common/state/protocol/state.js';

/** Wraps a `_meta` bag in a minimal {@link ToolCallState} so the reader sees the right source type. */
function toolCall(meta: Record<string, unknown> | undefined): ToolCallState {
	return { status: ToolCallStatus.Streaming, toolCallId: 't', toolName: 'n', displayName: 'd', _meta: meta };
}

/** Wraps a `_meta` bag in a minimal {@link AgentCustomization}. */
function agentCustomization(meta: Record<string, unknown> | undefined): AgentCustomization {
	return { type: CustomizationType.Agent, id: 'a', uri: 'file:///a', name: 'n', _meta: meta };
}

/** Wraps a `_meta` bag in a minimal {@link SimpleMessageAttachment}. */
function attachment(meta: Record<string, unknown> | undefined): SimpleMessageAttachment {
	return { type: MessageAttachmentKind.Simple, label: 'l', _meta: meta };
}

suite('Agent host _meta readers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('readToolCallMeta', () => {
		test('returns empty when no _meta', () => {
			assert.deepStrictEqual(readToolCallMeta(toolCall(undefined)), {});
		});

		test('reads valid keys and drops wrong-typed / unknown keys', () => {
			const result = readToolCallMeta(toolCall({
				toolKind: 'terminal',
				language: 'bash',
				subagentDescription: 'Find files',
				subagentAgentName: 'explore',
				mcpServerName: 'srv',
				mcpToolName: 'tool',
				autoApproveBySetting: true,
				ui: { resourceUri: 'ui://app', channel: 'mcp://c' },
				language2: 123,            // unknown key, ignored
				somethingElse: 5,          // unknown key, ignored
			}));
			assert.deepStrictEqual(result, {
				toolKind: 'terminal',
				language: 'bash',
				subagentDescription: 'Find files',
				subagentAgentName: 'explore',
				mcpServerName: 'srv',
				mcpToolName: 'tool',
				autoApproveBySetting: true,
				ui: { resourceUri: 'ui://app', channel: 'mcp://c' },
			});
		});

		test('drops an invalid toolKind and a malformed ui bag', () => {
			const result = readToolCallMeta(toolCall({ toolKind: 'nope', ui: { channel: 'mcp://c' } }));
			assert.deepStrictEqual(result, {});
		});

		test('preserves a present toolArguments value, drops undefined', () => {
			assert.deepStrictEqual(readToolCallMeta(toolCall({ toolArguments: { a: 1 } })), { toolArguments: { a: 1 } });
			assert.deepStrictEqual(readToolCallMeta(toolCall({ toolArguments: undefined })), {});
		});

		test('toToolCallMeta round-trips and returns undefined when empty', () => {
			assert.strictEqual(toToolCallMeta({}), undefined);
			const wire = toToolCallMeta({ toolKind: 'search', language: undefined });
			assert.deepStrictEqual(wire, { toolKind: 'search' });
			assert.deepStrictEqual(readToolCallMeta(toolCall(wire)), { toolKind: 'search' });
		});
	});

	suite('readAgentCustomizationMeta', () => {
		test('reads userInvocable, ignores garbage, round-trips', () => {
			assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization(undefined)), {});
			assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization({ userInvocable: 'yes' })), {});
			assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization({ userInvocable: false })), { userInvocable: false });
			assert.strictEqual(toAgentCustomizationMeta({}), undefined);
			assert.deepStrictEqual(toAgentCustomizationMeta({ userInvocable: true }), { userInvocable: true });
		});
	});

	suite('readCompletionAttachmentMeta', () => {
		test('classifies a command bag', () => {
			assert.deepStrictEqual(
				readCompletionAttachmentMeta(attachment({ command: 'rename', description: 'Rename this chat', argumentHint: 'New name' })),
				{ kind: 'command', command: 'rename', description: 'Rename this chat', argumentHint: 'New name' }
			);
		});

		test('classifies a skill bag, dropping wrong-typed optional fields', () => {
			assert.deepStrictEqual(
				readCompletionAttachmentMeta(attachment({ uri: 'file:///s/SKILL.md', name: 'mon', displayName: 'mon', description: 5 })),
				{ kind: 'skill', uri: 'file:///s/SKILL.md', name: 'mon', displayName: 'mon' }
			);
		});

		test('returns undefined for an unrecognized or empty bag', () => {
			assert.strictEqual(readCompletionAttachmentMeta(attachment(undefined)), undefined);
			assert.strictEqual(readCompletionAttachmentMeta(attachment({ foo: 'bar' })), undefined);
			assert.strictEqual(readCompletionAttachmentMeta(attachment({ command: 5 })), undefined);
		});

		test('builders produce wire bags that round-trip', () => {
			const cmd = toCommandCompletionAttachmentMeta({ command: 'rename' });
			assert.deepStrictEqual(cmd, { command: 'rename' });
			assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(cmd)), { kind: 'command', command: 'rename' });

			const cmdWithHint = toCommandCompletionAttachmentMeta({ command: 'rename', argumentHint: 'New name', description: undefined });
			assert.deepStrictEqual(cmdWithHint, { command: 'rename', argumentHint: 'New name' });
			assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(cmdWithHint)), { kind: 'command', command: 'rename', argumentHint: 'New name' });

			const skill = toSkillCompletionAttachmentMeta({ uri: 'file:///s/SKILL.md', name: 'mon', displayName: 'mon', description: undefined });
			assert.deepStrictEqual(skill, { uri: 'file:///s/SKILL.md', name: 'mon', displayName: 'mon' });
			assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(skill)), { kind: 'skill', uri: 'file:///s/SKILL.md', name: 'mon', displayName: 'mon' });
		});

		test('getCommandArgumentHint reads the hint and ignores wrong-typed / absent bags', () => {
			assert.strictEqual(getCommandArgumentHint({ argumentHint: 'New name' }), 'New name');
			assert.strictEqual(getCommandArgumentHint({ argumentHint: 5 }), undefined);
			assert.strictEqual(getCommandArgumentHint({ command: 'rename' }), undefined);
			assert.strictEqual(getCommandArgumentHint(undefined), undefined);
		});
	});
});
