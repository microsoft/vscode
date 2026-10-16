/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCompletionReferenceKind, toAgentHostCompletionVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { defaultChatMediaPreviewSkills, getChatMediaItems, IChatMediaPreviewRequest, isChatMediaPreviewTurn } from '../../common/chatMediaPreview.js';
import { IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';

function artifactCall(toolId: string, rawInput: unknown, overrides: Partial<IChatToolInvocationSerialized> = {}): IChatToolInvocationSerialized {
	return {
		kind: 'toolInvocationSerialized',
		toolCallId: `call-${toolId}`,
		toolId,
		invocationMessage: 'Recording the artifact',
		originMessage: undefined,
		pastTenseMessage: 'Recorded the artifact',
		isConfirmed: true,
		isComplete: true,
		source: undefined,
		presentation: undefined,
		resultDetails: undefined,
		toolSpecificData: { kind: 'input', rawInput },
		...overrides,
	};
}

function file(name: string, isArtifact = true) {
	return { type: 'file', label: name, isArtifact, uri: URI.file(`/out/${name}`).toString() };
}

suite('Chat media preview', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds the videos and decks a response recorded as artifacts', () => {
		const parts = [
			artifactCall('add_artifact_or_reference', { items: [file('demo.mp4'), file('deck.PDF'), file('still.png'), file('clip.mov'), file('linked.mp4', false)] }),
			artifactCall('mcp__vscode__add_artifact_or_reference', file('demo.webm')),
			artifactCall('add_artifact', file('legacy.webm')),
			artifactCall('add_artifact_or_reference', file('failed.mp4'), { resultError: 'Could not record the artifact' }),
			artifactCall('add_artifact_or_reference', file('error.mp4'), { resultDetails: { input: '{}', output: [], isError: true } }),
			artifactCall('add_artifact_or_reference', undefined, { toolSpecificData: undefined, resultDetails: { input: JSON.stringify(file('details.mp4')), output: [] } }),
			artifactCall('add_artifact_or_reference', undefined, { toolSpecificData: { kind: 'simpleToolInvocation', input: JSON.stringify({ items: [file('agent-host.pdf')] }), output: '' } }),
			artifactCall('remove_artifact_or_reference', file('removed.mp4')),
		];

		assert.deepStrictEqual(getChatMediaItems(parts).map(item => `${item.kind} ${item.uri.path}`), [
			'video /out/demo.mp4',
			'deck /out/deck.PDF',
			'video /out/legacy.webm',
			'video /out/details.mp4',
			'deck /out/agent-host.pdf',
		]);
	});

	test('shows previews from the turn that runs a listed skill onward', () => {
		const request = (id: string, text: string, skillReference?: string): IChatMediaPreviewRequest => ({
			id,
			message: { text, parts: [] },
			variableData: { variables: skillReference ? [toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, skillReference, undefined, undefined)] : [] },
		});
		const skills = ['pr-studio:generate-video'];
		const chat = [request('before', 'Record these files'), request('typed', '  /pr-studio:generate-video 1'), request('later', 'Make it shorter')];

		assert.deepStrictEqual([
			isChatMediaPreviewTurn(chat, 'before', skills),
			isChatMediaPreviewTurn(chat, 'typed', skills),
			isChatMediaPreviewTurn(chat, 'later', skills),
			isChatMediaPreviewTurn([request('attached', 'Explain this', '/PR-Studio:Generate-Video')], 'attached', skills),
			isChatMediaPreviewTurn([request('longer', '/pr-studio:generate-videos 1')], 'longer', skills),
			isChatMediaPreviewTurn(chat, 'typed', []),
			isChatMediaPreviewTurn([request('walkthrough', '/create-code-walkthrough main')], 'walkthrough', defaultChatMediaPreviewSkills),
		], [false, true, true, true, false, false, true]);
	});
});
