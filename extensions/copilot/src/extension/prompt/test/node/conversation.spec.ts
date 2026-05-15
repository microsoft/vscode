/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-unused-expressions */
import { describe, expect, it } from 'vitest';
import type { ChatResult } from 'vscode';
import { ChatVariablesCollection } from '../../common/chatVariablesCollection';
import { IResultMetadata, normalizeSummariesOnRounds, Turn, TurnMessage, TurnStatus } from '../../common/conversation';
import { ToolCallRound } from '../../common/toolCallRound';

describe('Turn', () => {
	describe('setResponse', () => {
		it('should set the response message and status correctly', () => {
			const request: TurnMessage = { type: 'user', message: 'Hello' };
			const turn = new Turn('1', request, new ChatVariablesCollection([]));

			const result: ChatResult = { metadata: {} };
			const response: TurnMessage = { type: 'model', message: 'Hi there!' };
			turn.setResponse(TurnStatus.Success, response, undefined, result);

			expect(turn.responseMessage).to.equal(response);
			expect(turn.responseStatus).to.equal(TurnStatus.Success);
			expect(turn.responseChatResult === result);
		});

		it('should throw an error if setResponse is called more than once', () => {
			const request: TurnMessage = { type: 'user', message: 'Hello' };
			const turn = new Turn('1', request, new ChatVariablesCollection([]));

			const response: TurnMessage = { type: 'model', message: 'Hi there!' };
			turn.setResponse(TurnStatus.Success, response, undefined, undefined);

			expect(() => turn.setResponse(TurnStatus.Success, response, undefined, undefined)).to.throw();
		});

		it('should default status to InProgress if not set', () => {
			const request: TurnMessage = { type: 'user', message: 'Hello' };
			const turn = new Turn('1', request, new ChatVariablesCollection([]));

			expect(turn.responseStatus).to.equal(TurnStatus.InProgress);
		});

		const genericToolCall = { id: 'id', name: 'name', arguments: '{}' };
		it('should restore summaries from metadata to current turns', () => {
			const turn1 = new Turn('1', { type: 'user', message: 'Hello' });
			const turn1Meta: Partial<IResultMetadata> = {
				summary: {
					text: 'summary 1',
					toolCallRoundId: 'round1'
				},
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round1'),
					new ToolCallRound('Hello', [], undefined, 'round2'),
				]
			};
			turn1.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn1Meta });
			normalizeSummariesOnRounds([turn1]);
			expect(turn1.rounds[0].summary).to.equal('summary 1');
		});

		it('should restore only the last summary from summaries array', () => {
			const turn1 = new Turn('1', { type: 'user', message: 'Hello' });
			const turn1Meta: Partial<IResultMetadata> = {
				summaries: [
					{ text: 'summary 1', toolCallRoundId: 'round1' },
					{ text: 'summary 2', toolCallRoundId: 'round2' },
				],
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round1'),
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round2'),
					new ToolCallRound('Hello', [], undefined, 'round3'),
				]
			};
			turn1.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn1Meta });
			normalizeSummariesOnRounds([turn1]);
			expect(turn1.rounds[0].summary).to.be.undefined;
			expect(turn1.rounds[1].summary).to.equal('summary 2');
		});

		it('should restore only the last summary across turns', () => {
			const turn1 = new Turn('1', { type: 'user', message: 'Hello' });
			const turn1Meta: Partial<IResultMetadata> = {
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round1'),
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round2'),
				]
			};
			turn1.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn1Meta });

			const turn2 = new Turn('2', { type: 'user', message: 'Hello' });
			const turn2Meta: Partial<IResultMetadata> = {
				summaries: [
					{ text: 'summary for round1', toolCallRoundId: 'round1' },
					{ text: 'summary for round3', toolCallRoundId: 'round3' },
				],
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round3'),
					new ToolCallRound('Hello', [], undefined, 'round4'),
				]
			};
			turn2.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn2Meta });

			normalizeSummariesOnRounds([turn1, turn2]);
			expect(turn1.rounds[0].summary).to.be.undefined;
			expect(turn2.rounds[0].summary).to.equal('summary for round3');
		});

		it('should restore summaries from pendingSummaries when resultMetadata is absent', () => {
			// Simulates the mid-tool-call-loop case: setResponse hasn't been called yet,
			// so resultMetadata is empty, but addPendingSummary stored the summary.
			const turn1 = new Turn('1', { type: 'user', message: 'Hello' });
			turn1.addPendingSummary('round1', 'pending summary text');
			// No setResponse call — this is the key: resultMetadata doesn't exist
			// Manually set rounds so normalizeSummariesOnRounds can find the target
			const turn1Meta: Partial<IResultMetadata> = {
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round1'),
					new ToolCallRound('Hello', [], undefined, 'round2'),
				]
			};
			turn1.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn1Meta });
			// Clear resultMetadata summaries to simulate mid-loop state
			(turn1.responseChatResult!.metadata as Record<string, unknown>)['summaries'] = undefined;
			(turn1.responseChatResult!.metadata as Record<string, unknown>)['summary'] = undefined;

			normalizeSummariesOnRounds([turn1]);
			expect(turn1.rounds[0].summary).to.equal('pending summary text');
		});

		it('should restore summaries from metadata to previous turns', () => {
			const turn1 = new Turn('1', { type: 'user', message: 'Hello' });
			const turn1Meta: Partial<IResultMetadata> = {
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round1'),
					new ToolCallRound('Hello', [], undefined, 'round2'),
				]
			};
			turn1.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn1Meta });

			const turn2 = new Turn('2', { type: 'user', message: 'Hello' });
			const turn2Meta: Partial<IResultMetadata> = {
				summary: {
					text: 'summary',
					toolCallRoundId: 'round1'
				},
				toolCallRounds: [
					new ToolCallRound('Hello', [genericToolCall], undefined, 'round3'),
					new ToolCallRound('Hello', [], undefined, 'round4'),
				]
			};
			turn2.setResponse(TurnStatus.Success, { type: 'model', message: 'Hi there!' }, undefined, { metadata: turn2Meta });

			normalizeSummariesOnRounds([turn1, turn2]);
			expect(turn1.rounds[0].summary).to.equal('summary');
			expect(turn2.rounds[0].summary).to.equal(undefined);
		});
	});
});
