/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createActiveTurn, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ChatState, type ICompletedToolCall, type ResponsePart } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { resolveAgentHostToolResultImage } from '../../../browser/agentSessions/agentHost/agentHostToolResultImages.js';
import { rewriteAgentHostLinkTarget } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

suite('AgentHostToolResultImages', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const resolve = (href: string) => rewriteAgentHostLinkTarget(href, 'sandbox', undefined, URI.file('/workspace'));
	const image = { type: ToolResultContentType.EmbeddedResource, contentType: 'image/png', data: 'aW1hZ2U=' } as const;

	function tool(overrides: Partial<Extract<ICompletedToolCall, { status: ToolCallStatus.Completed }>> = {}): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall, toolCall: {
				status: ToolCallStatus.Completed, toolCallId: 'screenshot', toolName: 'arbitrary_tool', displayName: 'Screenshot',
				invocationMessage: 'Taking screenshot', pastTenseMessage: 'Screenshot taken', success: true,
				confirmed: ToolCallConfirmationReason.NotNeeded, toolInput: '{"filename":"/tmp/my image.png"}',
				content: [image], ...overrides,
			},
		};
	}

	function chat(parts: ResponsePart[]): Pick<ChatState, 'turns' | 'activeTurn'> {
		return { turns: [{ id: 'turn', message: { text: '', origin: { kind: MessageKind.User } }, responseParts: parts, state: TurnState.Complete, usage: undefined }], activeTurn: undefined };
	}

	for (const path of ['/tmp/my%20image.png', 'file:///tmp/my%20image.png', resolve('/tmp/my image.png')]) {
		test(`resolves recorded tool bytes for ${path}`, () => {
			assert.strictEqual(resolveAgentHostToolResultImage(chat([tool()]), resolve(path), resolve), 'data:image/png;base64,aW1hZ2U=');
		});
	}

	test('uses the most recent result, including a running tool in the active turn', () => {
		const state = chat([tool()]);
		state.activeTurn = createActiveTurn('active', { text: '', origin: { kind: MessageKind.User } }, new Date().toISOString());
		const active = tool({ content: [{ ...image, data: 'bmV3' }] });
		if (active.kind === ResponsePartKind.ToolCall && active.toolCall.status === ToolCallStatus.Completed) {
			state.activeTurn.responseParts.push({ ...active, toolCall: { ...active.toolCall, status: ToolCallStatus.Running } });
		}
		assert.strictEqual(resolveAgentHostToolResultImage(state, resolve('/tmp/my image.png'), resolve), 'data:image/png;base64,bmV3');
	});

	test('normalizes relative tool paths against the owning chat', () => {
		assert.strictEqual(resolveAgentHostToolResultImage(chat([tool({ toolInput: '{"path":"images/result.png"}' })]), resolve('/workspace/images/result.png'), resolve), 'data:image/png;base64,aW1hZ2U=');
	});

	test('does not guess ambiguous mappings, unsupported formats, malformed arguments, or unrelated paths', () => {
		const cases = [
			tool({ toolInput: 'not JSON' }), tool({ toolInput: 'null' }), tool({ toolInput: '[]' }),
			tool({ toolInput: '{"other":"/tmp/my image.png"}' }),
			tool({ toolInput: '{"path":"/tmp/other.png","filename":"/tmp/my image.png"}' }),
			tool({ content: [image, image] }),
			tool({ content: [{ ...image, contentType: 'image/svg+xml' }] }),
			tool({ content: [{ ...image, data: '' }] }),
		];
		assert.deepStrictEqual(cases.map(part => resolveAgentHostToolResultImage(chat([part]), resolve('/tmp/my image.png'), resolve)), cases.map(() => undefined));
	});

	test('does not resolve links to other chats, hosts, or web images', () => {
		assert.deepStrictEqual([
			resolveAgentHostToolResultImage(chat([]), resolve('/tmp/my image.png'), resolve),
			resolveAgentHostToolResultImage(chat([tool()]), rewriteAgentHostLinkTarget('/tmp/my image.png', 'other'), resolve),
			resolveAgentHostToolResultImage(chat([tool()]), 'https://example.com/image.png', resolve),
		], [undefined, undefined, undefined]);
	});
});
