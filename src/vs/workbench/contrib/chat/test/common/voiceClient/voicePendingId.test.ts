/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { derivePendingId, getVoiceToolApprovalCommand, isPendingIdResolved, markPendingIdResolved, peekPendingId, restoreResolvedPendingId } from '../../../common/voiceClient/voiceClientService.js';

suite('derivePendingId', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// This id is the only thing routing a spoken answer back to the form that
	// asked. The controller mints it when it describes a pending request and the
	// dispatch service looks it up again to find that request, so these
	// properties are what stop an answer from landing on the wrong part -- or,
	// if the two ever disagreed, from landing anywhere at all.

	const part = (kind: string): object => ({ kind });

	test('is stable for the same request and part', () => {
		const carousel = part('questionCarousel');
		assert.strictEqual(derivePendingId('req-1', carousel), derivePendingId('req-1', carousel));
	});

	test('distinguishes two pending parts in one response', () => {
		assert.notStrictEqual(
			derivePendingId('req-1', part('questionCarousel')),
			derivePendingId('req-1', part('questionCarousel')),
		);
	});

	test('distinguishes the same part in different requests', () => {
		const carousel = part('questionCarousel');
		assert.notStrictEqual(derivePendingId('req-1', carousel), derivePendingId('req-2', carousel));
	});

	test('does not reuse an id when a part is replaced at the same position', () => {
		// `Response.clearToPreviousToolInvocation` splices the part list, so a
		// retry can seat a new part where an already-published one used to be.
		// Under the previous index-based scheme both got `req#5`, which let a
		// draft written for the first form be submitted against the second.
		const parts = [part('markdown'), part('questionCarousel')];
		const first = derivePendingId('req-1', parts[1]);
		parts.splice(1, 1, part('questionCarousel'));
		assert.notStrictEqual(derivePendingId('req-1', parts[1]), first);
	});

	test('peek does not match a part that was never published as pending', () => {
		assert.strictEqual(peekPendingId('req-1', part('markdown')), undefined);
	});

	test('peek resolves a part that was published', () => {
		const carousel = part('questionCarousel');
		const minted = derivePendingId('req-1', carousel);
		assert.strictEqual(peekPendingId('req-1', carousel), minted);
	});

	test('keys tool approvals by command and active lifetime rather than callbacks', () => {
		const firstConfirm = () => { };
		const state = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm config get registry' },
			confirm: firstConfirm,
		});
		const tool = { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation;
		const first = derivePendingId('req-1', tool);

		// Callback churn while the command stays pending is presentation noise.
		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm config get registry' },
			confirmationMessages: { title: 'Updated title' },
			confirm: () => { },
		}, undefined);
		const presentationUpdate = derivePendingId('req-1', tool);

		// Agent Host can refresh the actionable command without leaving the
		// pending status. That is a new occurrence even if the callback is kept.
		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm install --registry=https://registry.npmjs.org' },
			confirmationMessages: { title: 'Updated title' },
			confirm: firstConfirm,
		}, undefined);
		const changedCommand = derivePendingId('req-1', tool);

		state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm install --registry=https://registry.npmjs.org' },
			confirm: () => { },
		}, undefined);
		const afterInteraction = derivePendingId('req-1', tool);

		assert.deepStrictEqual({
			presentationUpdateMatches: presentationUpdate === first,
			changedCommandDiffers: changedCommand !== first,
			afterInteractionDiffers: afterInteraction !== changedCommand,
			currentPartNoLongerResolvesOldId: peekPendingId('req-1', tool) !== first,
		}, {
			presentationUpdateMatches: true,
			changedCommandDiffers: true,
			afterInteractionDiffers: true,
			currentPartNoLongerResolvesOldId: true,
		});

		state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
	});

	test('user-edited terminal commands replace the pending occurrence', () => {
		const terminalData = {
			kind: 'terminal' as const,
			commandLine: {
				original: 'npm install',
				userEdited: undefined as string | undefined,
			},
		};
		const state = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm install' },
			confirm: () => { },
		});
		const tool = {
			kind: 'toolInvocation',
			toolCallId: 'tool-call',
			toolSpecificData: terminalData,
			state,
		} as unknown as IChatToolInvocation;
		const originalId = derivePendingId('req-edit', tool);

		terminalData.commandLine.userEdited = 'npm install --ignore-scripts';
		const editedId = derivePendingId('req-edit', tool);

		assert.deepStrictEqual({
			command: getVoiceToolApprovalCommand(tool),
			editedIdDiffers: editedId !== originalId,
		}, {
			command: 'npm install --ignore-scripts',
			editedIdDiffers: true,
		});

		state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
	});

	test('preserves significant command whitespace in occurrence keys', () => {
		const state = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: `printf 'a  b'` },
			confirm: () => { },
		});
		const tool = { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation;
		const first = derivePendingId('req-whitespace', tool);

		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: `printf 'a b'` },
			confirm: () => { },
		}, undefined);
		const second = derivePendingId('req-whitespace', tool);

		assert.notStrictEqual(second, first);
		state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
	});

	test('rehydrated copies share one active tool occurrence', () => {
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'npm install' },
				confirm: () => { },
			});
			return { part: { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation, state };
		};
		const first = tool();
		const rehydrated = tool();
		const pendingId = derivePendingId('req-1', first.part);

		assert.strictEqual(peekPendingId('req-1', rehydrated.part), pendingId);

		for (const copy of [first, rehydrated]) {
			copy.state.set({
				type: IChatToolInvocation.StateKind.Cancelled,
				reason: ToolConfirmKind.Skipped,
				parameters: {},
			}, undefined);
		}
	});

	test('a command change retires stale rehydrated copies', () => {
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'npm install' },
				confirm: () => { },
			});
			return { part: { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation, state };
		};
		const authoritative = tool();
		const stale = tool();
		const originalId = derivePendingId('req-command-change', authoritative.part);
		assert.strictEqual(derivePendingId('req-command-change', stale.part), originalId);

		authoritative.state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command: 'npm install --ignore-scripts' },
			confirm: () => { },
		}, undefined);
		const refreshedId = derivePendingId('req-command-change', authoritative.part);

		assert.deepStrictEqual({
			refreshedIdDiffers: refreshedId !== originalId,
			originalIdResolved: isPendingIdResolved(originalId),
			staleCopyIsNotActionable: peekPendingId('req-command-change', stale.part),
		}, {
			refreshedIdDiffers: true,
			originalIdResolved: true,
			staleCopyIsNotActionable: undefined,
		});

		for (const copy of [authoritative, stale]) {
			copy.state.set({
				type: IChatToolInvocation.StateKind.Cancelled,
				reason: ToolConfirmKind.Skipped,
				parameters: {},
			}, undefined);
		}
	});

	test('retiring one copy makes every rehydrated copy stale', () => {
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'npm install' },
				confirm: () => { },
			});
			return { part: { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation, state };
		};
		const first = tool();
		const rehydrated = tool();
		const pendingId = derivePendingId('req-retire', first.part);
		assert.strictEqual(derivePendingId('req-retire', rehydrated.part), pendingId);

		assert.strictEqual(markPendingIdResolved(pendingId), true);
		assert.strictEqual(isPendingIdResolved(pendingId), true);
		assert.strictEqual(peekPendingId('req-retire', first.part), undefined);
		assert.strictEqual(peekPendingId('req-retire', rehydrated.part), undefined);
		assert.strictEqual(derivePendingId('req-retire', rehydrated.part), pendingId);

		// A new invocation published after the interaction is a new occurrence,
		// even when the provider reuses the tool-call id and command.
		const rearmed = tool();
		const rearmedId = derivePendingId('req-retire', rearmed.part);
		assert.notStrictEqual(rearmedId, pendingId);
		assert.strictEqual(peekPendingId('req-retire', rearmed.part), rearmedId);

		for (const copy of [first, rehydrated, rearmed]) {
			copy.state.set({
				type: IChatToolInvocation.StateKind.Cancelled,
				reason: ToolConfirmKind.Skipped,
				parameters: {},
			}, undefined);
		}
	});

	test('restores the retired identity for a late rehydrated copy', () => {
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'echo high' },
				confirm: () => { },
			});
			return { part: { kind: 'toolInvocation', toolCallId: 'late-tool-call', state } as unknown as IChatToolInvocation, state };
		};
		const original = tool();
		const pendingId = derivePendingId('req-late-copy', original.part);
		assert.strictEqual(markPendingIdResolved(pendingId), true);
		original.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);

		const lateCopy = tool();
		assert.strictEqual(restoreResolvedPendingId('req-late-copy', lateCopy.part), pendingId);
		assert.strictEqual(derivePendingId('req-late-copy', lateCopy.part), pendingId);
		assert.strictEqual(isPendingIdResolved(pendingId), true);

		lateCopy.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
	});

	test('one copy leaving pending retires the shared occurrence', () => {
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'npm install' },
				confirm: () => { },
			});
			return { part: { kind: 'toolInvocation', toolCallId: 'tool-call', state } as unknown as IChatToolInvocation, state };
		};
		const authoritative = tool();
		const stale = tool();
		const pendingId = derivePendingId('req-transition', authoritative.part);
		assert.strictEqual(derivePendingId('req-transition', stale.part), pendingId);

		authoritative.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);

		assert.strictEqual(isPendingIdResolved(pendingId), true);
		assert.strictEqual(peekPendingId('req-transition', stale.part), undefined);

		stale.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
	});

	test('keeps authentication identity stable until the tool leaves the pending state', () => {
		const tool = new ChatToolInvocation(undefined, {
			id: 'mcpTool',
			displayName: 'MCP Tool',
			modelDescription: 'Calls an MCP tool',
			source: ToolDataSource.External,
		}, 'tool-call', undefined, {}, {});
		const firstCancel = () => { };
		const refreshedCancel = () => { };
		const nextCancel = () => { };
		const server = { id: 'server', name: 'MCP Server', resource: 'https://mcp.example.com' };

		tool.setAuthenticationRequired(server, firstCancel);
		const first = derivePendingId('req-1', tool);
		tool.setAuthenticationRequired({ ...server, reason: 'Updated scope' }, refreshedCancel);
		const refreshed = derivePendingId('req-1', tool);
		const refreshedState = tool.state.get();
		tool.setAuthenticationRequired({ ...server, resource: 'https://mcp.example.com/new-resource' }, refreshedCancel);
		const changedResource = derivePendingId('req-1', tool);

		tool.setAuthenticationResolved();
		tool.setAuthenticationRequired(server, nextCancel);
		const next = derivePendingId('req-1', tool);
		const nextState = tool.state.get();

		assert.deepStrictEqual({
			refreshedMatches: refreshed === first,
			refreshedUsesOriginalCancel: refreshedState.type === IChatToolInvocation.StateKind.WaitingForAuthentication && refreshedState.cancel === firstCancel,
			changedResourceDiffers: changedResource !== first,
			nextDiffers: next !== changedResource,
			nextUsesNewCancel: nextState.type === IChatToolInvocation.StateKind.WaitingForAuthentication && nextState.cancel === nextCancel,
		}, {
			refreshedMatches: true,
			refreshedUsesOriginalCancel: true,
			changedResourceDiffers: true,
			nextDiffers: true,
			nextUsesNewCancel: true,
		});
		tool.setAuthenticationResolved();
	});
});
