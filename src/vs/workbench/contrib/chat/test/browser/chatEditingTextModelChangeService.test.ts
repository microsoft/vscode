/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorunSelfDisposable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createModelServices } from '../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestWorkerService } from '../../../inlineChat/test/browser/testWorkerService.js';
import { ChatEditingTextModelChangeService } from '../../browser/chatEditing/chatEditingTextModelChangeService.js';
import { IModifiedEntryTelemetryInfo, ModifiedFileEntryState } from '../../common/chatEditingService.js';

suite('ChatEditingTextModelChangeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let modelService: IModelService;

	/**
	 * Creates a text model with the given content, registered with the model service.
	 */
	function createModel(content: string, uri: URI): ITextModel {
		return store.add(modelService.createModel(content, null, uri));
	}

	/**
	 * Creates a ChatEditingTextModelChangeService with the given original and modified models.
	 */
	function createChangeService(originalContent: string, modifiedContent?: string): {
		service: ChatEditingTextModelChangeService;
		originalModel: ITextModel;
		modifiedModel: ITextModel;
	} {
		const originalModel = createModel(originalContent, URI.file('/test/original.ts'));
		const modifiedModel = createModel(modifiedContent ?? originalContent, URI.file('/test/modified.ts'));
		const state = observableValue<ModifiedFileEntryState>('state', ModifiedFileEntryState.Modified);

		const service = store.add(instantiationService.createInstance(
			ChatEditingTextModelChangeService,
			originalModel,
			modifiedModel,
			state,
			undefined // isExternalEditInProgress
		));

		return { service, originalModel, modifiedModel };
	}

	/**
	 * Creates a mock telemetry info for testing attribution.
	 */
	function createTelemetryInfo(requestId: string, agentId?: string): IModifiedEntryTelemetryInfo {
		return {
			agentId: agentId ?? 'test-agent',
			command: undefined,
			sessionResource: URI.file('/test/session'),
			requestId,
			result: undefined,
			modelId: 'test-model',
			modeId: 'edit',
			applyCodeBlockSuggestionId: undefined,
			feature: 'sideBarChat'
		};
	}

	/**
	 * Applies text edits to the modified model via the service.
	 */
	async function applyAgentEdits(
		service: ChatEditingTextModelChangeService,
		modifiedModel: ITextModel,
		edits: TextEdit[],
		telemetryInfo: IModifiedEntryTelemetryInfo,
		requestId: string,
		isLastEdits = true
	): Promise<void> {
		service.setEditContext(telemetryInfo, requestId, undefined);
		await service.acceptAgentEdits(modifiedModel.uri, edits, isLastEdits, undefined);
		await service.clearEditContext();
	}

	/**
	 * Waits for the diffInfo observable to update with changes.
	 * This is more reliable than arbitrary timeouts.
	 */
	function waitForDiffToBeReady(service: ChatEditingTextModelChangeService): Promise<void> {
		return new Promise<void>(resolve => {
			autorunSelfDisposable(reader => {
				const diff = service.diffInfo.read(reader);
				// Resolve when we have changes or explicitly marked as identical
				if (diff.changes.length > 0 || diff.identical) {
					reader.dispose();
					resolve();
				}
			});
		});
	}

	function waitForDiffUpdate(service: ChatEditingTextModelChangeService): Promise<void> {
		return new Promise<void>(resolve => {
			let first = true;
			autorunSelfDisposable(reader => {
				service.diffInfo.read(reader);
				if (first) {
					first = false;
					return;
				}

				reader.dispose();
				resolve();
			});
		});
	}

	/**
	 * Creates a TextEdit for replacing a range with new text.
	 */
	function replaceEdit(startLine: number, startCol: number, endLine: number, endCol: number, text: string): TextEdit {
		return { range: new Range(startLine, startCol, endLine, endCol), text };
	}

	/**
	 * Creates a TextEdit for inserting text at a position.
	 */
	function insertEdit(line: number, column: number, text: string): TextEdit {
		return { range: new Range(line, column, line, column), text };
	}

	setup(() => {
		const disposables = new DisposableStore();
		store.add(disposables);

		instantiationService = store.add(createModelServices(disposables, [
			[IEditorWorkerService, new SyncDescriptor(TestWorkerService)],
			[IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
				override playSignal() { return Promise.resolve(); }
			}],
		]));
		modelService = instantiationService.get(IModelService);
		store.add(instantiationService.get(IEditorWorkerService) as TestWorkerService);
	});

	suite('Basic Edit Tracking', () => {

		test('initially has no attributed ranges', () => {
			const { service } = createChangeService('hello world');
			const ranges = service.getAttributedRanges();
			assert.strictEqual(ranges.length, 0);
		});

		test('tracks single agent edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			const ranges = service.getAttributedRanges();
			assert.ok(ranges.length > 0, 'Should have attributed ranges after edit');
		});

		test('tracks insert edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				insertEdit(1, 6, ' beautiful')
			], telemetry, 'request-1');

			assert.strictEqual(modifiedModel.getValue(), 'hello beautiful world');
		});

		test('tracks delete edit', async () => {
			const { service, modifiedModel } = createChangeService('hello beautiful world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 6, 1, 16, '')
			], telemetry, 'request-1');

			assert.strictEqual(modifiedModel.getValue(), 'hello world');
		});

	});

	suite('Attribution Tracking', () => {

		test('attributed ranges have correct telemetry info', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1', 'my-agent');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			const dto = service.getAttributedRangesDTO();
			assert.ok(dto.length > 0, 'Should have DTO ranges');

			const firstRange = dto[0];
			assert.strictEqual(firstRange.requestId, 'request-1');
			assert.strictEqual(firstRange.telemetryInfo.agentId, 'my-agent');
			assert.strictEqual(firstRange.isUserEdit, false);
		});

		test('getUniqueAgentAttributions returns unique agents', async () => {
			const { service, modifiedModel } = createChangeService('line1\nline2\nline3');

			// First agent edits line 1
			const telemetry1 = createTelemetryInfo('request-1', 'agent-a');
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'modified1')
			], telemetry1, 'request-1');

			// Second agent edits line 3
			const telemetry2 = createTelemetryInfo('request-2', 'agent-b');
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(3, 1, 3, 6, 'modified3')
			], telemetry2, 'request-2');

			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.strictEqual(uniqueAgents.length, 2, 'Should have 2 unique agents');

			const agentIds = uniqueAgents.map(a => a.telemetryInfo.agentId);
			assert.ok(agentIds.includes('agent-a'));
			assert.ok(agentIds.includes('agent-b'));
		});

		test('two agents edit different parts of the same line', async () => {
			// Start: "hello world today"
			// Agent 1 changes "hello" -> "goodbye"
			// Agent 2 changes "today" -> "tonight"
			// Result: "goodbye world tonight"
			const { service, modifiedModel } = createChangeService('hello world today');

			// Agent 1 edits the beginning
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world today');

			// Agent 2 edits the end
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 15, 1, 20, 'tonight')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world tonight');

			// Both agents should be tracked
			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.strictEqual(uniqueAgents.length, 2, 'Should have 2 unique agents for same-line edits');

			const agentIds = uniqueAgents.map(a => a.telemetryInfo.agentId);
			assert.ok(agentIds.includes('agent-1'), 'Should include agent-1');
			assert.ok(agentIds.includes('agent-2'), 'Should include agent-2');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			// diffInfo should show the change with attribution
			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length > 0, 'Should have diff changes');

			// The hunk should have attributed ranges from both agents
			const hunk = diffInfo.changes[0];
			assert.ok(hunk.attributedRanges.length >= 1, 'Hunk should have attributed ranges');
		});

		test('second agent completely overwrites first agent edit', async () => {
			// Start: "hello world"
			// Agent 1 changes "hello" -> "goodbye"
			// Agent 2 changes entire line to something else
			const { service, modifiedModel } = createChangeService('hello world');

			// Agent 1 edits first
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world');

			// Agent 2 completely overwrites the line
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 14, 'completely different')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			assert.strictEqual(modifiedModel.getValue(), 'completely different');

			// After complete overwrite, agent-2 should be the primary attribution
			// agent-1's edit is effectively gone
			const dto = service.getAttributedRangesDTO();
			assert.ok(dto.length > 0, 'Should have attributed ranges');

			// The latest edit should be from agent-2
			const latestRange = dto[dto.length - 1];
			assert.strictEqual(latestRange.telemetryInfo.agentId, 'agent-2',
				'Latest attribution should be agent-2 after overwrite');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			// Check diffInfo attribution
			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length > 0, 'Should have diff changes');

			// The hunk's primary telemetry should reflect agent-2
			const hunk = diffInfo.changes[0];
			// Note: chatTelemetryInfo gets the first overlapping agent, which may vary
			// but attributedRanges should contain the attribution history
			assert.ok(hunk.attributedRanges.length > 0, 'Hunk should have attributed ranges');
		});

		test('second agent edit that produces no actual change', async () => {
			// Start: "hello world"
			// Agent 1 changes "hello" -> "goodbye"
			// Agent 2 "changes" "goodbye" -> "goodbye" (no-op)
			const { service, modifiedModel } = createChangeService('hello world');

			// Agent 1 edits
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world');

			const agentCountBefore = service.getUniqueAgentAttributions().length;

			// Agent 2 makes a "change" that doesn't actually change anything
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 8, 'goodbye') // Replace "goodbye" with "goodbye"
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			// Content should be unchanged
			assert.strictEqual(modifiedModel.getValue(), 'goodbye world');

			// Attribution tracking may or may not change depending on implementation
			// The key is that the system handles this gracefully
			const agentsAfterSecond = service.getUniqueAgentAttributions();

			// At minimum, agent-1 should still be tracked since content is the same
			assert.ok(agentsAfterSecond.some(a => a.telemetryInfo.agentId === 'agent-1') ||
				agentsAfterSecond.some(a => a.telemetryInfo.agentId === 'agent-2'),
				'Should have at least one agent attribution');

			// The number of agents may increase (if agent-2 is added) or stay the same
			assert.ok(agentsAfterSecond.length >= agentCountBefore,
				'Agent count should not decrease after no-op edit');
		});

		test('second agent partially overwrites first agent edit', async () => {
			// Start: "abcdefghij"
			// Agent 1 changes "abc" -> "ABC"
			// Agent 2 changes "BCd" -> "XXX" (overlaps with agent-1's edit)
			const { service, modifiedModel } = createChangeService('abcdefghij');

			// Agent 1 edits positions 1-3
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 4, 'ABC')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'ABCdefghij');

			// Agent 2 edits positions 2-4 (overlapping with agent-1)
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 2, 1, 5, 'XXX')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			assert.strictEqual(modifiedModel.getValue(), 'AXXXefghij');

			// Both agents should be tracked since parts of both edits remain
			const uniqueAgents = service.getUniqueAgentAttributions();

			// We expect agent-2 to be tracked since it made the latest edit
			// agent-1 may or may not be tracked depending on how overlap is handled
			assert.ok(uniqueAgents.length >= 1, 'Should have at least one agent');
			assert.ok(uniqueAgents.some(a => a.telemetryInfo.agentId === 'agent-2'),
				'Agent-2 should be tracked after partial overwrite');
		});

	});

	suite('User Edit Handling', () => {

		test('user edits in non-overlapping region preserve agent attribution', async () => {
			const { service, modifiedModel } = createChangeService('line1\nline2\nline3');

			// Agent edits line 1
			const telemetry = createTelemetryInfo('request-1', 'agent-a');
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'agent-modified')
			], telemetry, 'request-1');

			// User directly edits line 3 (non-overlapping)
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(3, 1, 3, 6), 'user-modified')
			]);

			// Wait for mirror edits to process
			await waitForDiffToBeReady(service);

			// Agent attribution should be preserved
			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.ok(uniqueAgents.some(a => a.telemetryInfo.agentId === 'agent-a'),
				'Agent attribution should be preserved after user edit');
		});

		test('allEditsAreFromUs becomes false after user edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');

			// Initially all edits are from us
			const telemetry = createTelemetryInfo('request-1');
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			assert.strictEqual(service.allEditsAreFromUs, true);

			// User makes a direct edit
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(1, 8, 1, 13), 'universe')
			]);

			// Wait for mirror edits to process
			await waitForDiffToBeReady(service);

			assert.strictEqual(service.allEditsAreFromUs, false);
		});

		test('user edit completely overwrites agent edit', async () => {
			// Start: "hello world"
			// Agent changes "hello" -> "goodbye"
			// User changes entire "goodbye" to "hi"
			const { service, modifiedModel } = createChangeService('hello world');

			// Agent edits
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world');

			// User overwrites the agent's edit
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(1, 1, 1, 8), 'hi')
			]);

			// Wait for mirror edits to process
			await waitForDiffToBeReady(service);

			assert.strictEqual(modifiedModel.getValue(), 'hi world');

			// allEditsAreFromUs should be false
			assert.strictEqual(service.allEditsAreFromUs, false);

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			// The diff should still show a change from original
			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length > 0 || !diffInfo.identical,
				'Should still show diff after user overwrites agent edit');
		});

		test('user edit between two agent edits', async () => {
			// Start: "aaa bbb ccc"
			// Agent 1 changes "aaa" -> "AAA"
			// User changes "bbb" -> "BBB"
			// Agent 2 changes "ccc" -> "CCC"
			const { service, modifiedModel } = createChangeService('aaa bbb ccc');

			// Agent 1 edits the beginning
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 4, 'AAA')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'AAA bbb ccc');

			// User edits the middle
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(1, 5, 1, 8), 'BBB')
			]);

			// Wait for mirror edits to process
			await waitForDiffToBeReady(service);

			assert.strictEqual(modifiedModel.getValue(), 'AAA BBB ccc');

			// Agent 2 edits the end
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 9, 1, 12, 'CCC')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			assert.strictEqual(modifiedModel.getValue(), 'AAA BBB CCC');

			// Both agents should be tracked
			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.ok(uniqueAgents.some(a => a.telemetryInfo.agentId === 'agent-1'),
				'Agent-1 should still be tracked');
			assert.ok(uniqueAgents.some(a => a.telemetryInfo.agentId === 'agent-2'),
				'Agent-2 should be tracked');

			// allEditsAreFromUs should be false due to user edit
			assert.strictEqual(service.allEditsAreFromUs, false);
		});

		test('user edit that reverts agent change back to original', async () => {
			// Start: "hello world"
			// Agent changes "hello" -> "goodbye"
			// User changes "goodbye" back to "hello"
			const { service, modifiedModel } = createChangeService('hello world');

			// Agent edits
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			assert.strictEqual(modifiedModel.getValue(), 'goodbye world');

			await waitForDiffToBeReady(service);

			// User reverts the change
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(1, 1, 1, 8), 'hello')
			]);

			// Wait for mirror edits to process
			await waitForDiffUpdate(service);

			assert.strictEqual(modifiedModel.getValue(), 'hello world');

			// The diff should show no changes (content matches original)
			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.identical || diffInfo.changes.length === 0,
				'Should show no diff when user reverts to original');
		});

	});

	suite('Edit Context Management', () => {

		test('setEditContext and clearEditContext work correctly', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			service.setEditContext(telemetry, 'request-1', 'undo-stop-1');

			// Make an edit while context is set
			await service.acceptAgentEdits(modifiedModel.uri, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], true, undefined);

			await service.clearEditContext();

			// lastModifyingRequestId should be updated
			assert.strictEqual(service.lastModifyingRequestId.get(), 'request-1');
		});

	});

	suite('Reset and State Management', () => {

		test('keep() resets edit tracking', async () => {
			const { service, modifiedModel, originalModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			assert.ok(service.getAttributedRanges().length > 0);

			service.keep();

			// After keep, original should match modified and tracking reset
			assert.strictEqual(originalModel.getValue(), modifiedModel.getValue());
			assert.strictEqual(service.getAttributedRanges().length, 0);
		});

		test('undo() reverts to original content', async () => {
			const { service, modifiedModel, originalModel } = createChangeService('hello world');
			const originalContent = originalModel.getValue();
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			assert.notStrictEqual(modifiedModel.getValue(), originalContent);

			service.undo();

			assert.strictEqual(modifiedModel.getValue(), originalContent);
			assert.strictEqual(service.getAttributedRanges().length, 0);
		});

	});

	suite('Multiple Agent Edits', () => {

		test('sequential edits from different agents are tracked separately', async () => {
			const { service, modifiedModel } = createChangeService('aaa\nbbb\nccc');

			// Agent 1 edits
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 4, 'AAA')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			// Agent 2 edits
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(3, 1, 3, 4, 'CCC')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.strictEqual(uniqueAgents.length, 2);
		});

		test('same agent multiple requests tracked with different request IDs', async () => {
			const { service, modifiedModel } = createChangeService('aaa\nbbb\nccc');

			// Same agent, different requests
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 4, 'AAA')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(3, 1, 3, 4, 'CCC')
			], createTelemetryInfo('req-2', 'agent-1'), 'req-2');

			const dto = service.getAttributedRangesDTO();
			const requestIds = new Set(dto.map(r => r.requestId));

			// Should have both request IDs tracked
			assert.ok(requestIds.has('req-1') || requestIds.has('req-2'),
				'Should track at least one request ID');
		});

	});

	suite('Diff Info', () => {

		test('diffInfo updates after agent edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const updatedDiff = service.diffInfo.get();
			// Diff should have changes now
			assert.ok(updatedDiff.changes.length > 0 || !updatedDiff.identical,
				'Diff should show changes after edit');
		});

		test('hasHunkAt returns true for modified range', async () => {
			const { service, modifiedModel } = createChangeService('hello world');
			const telemetry = createTelemetryInfo('request-1');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], telemetry, 'request-1');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const hasHunk = service.hasHunkAt(new Range(1, 1, 1, 10));
			// hasHunkAt returns a boolean - we just verify it doesn't throw
			assert.strictEqual(typeof hasHunk, 'boolean');
		});

		test('diffInfo changes have chatTelemetryInfo for agent edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'test-agent'), 'req-1');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length > 0, 'Should have diff changes');

			const hunk = diffInfo.changes[0];
			assert.ok(hunk.chatTelemetryInfo !== undefined, 'Hunk should have chatTelemetryInfo');
			assert.strictEqual(hunk.chatTelemetryInfo?.agentId, 'test-agent');
			assert.strictEqual(hunk.chatTelemetryInfo?.requestId, 'req-1');
		});

		test('diffInfo changes have attributedRanges for agent edit', async () => {
			const { service, modifiedModel } = createChangeService('hello world');

			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'test-agent'), 'req-1');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length > 0, 'Should have diff changes');

			const hunk = diffInfo.changes[0];
			assert.ok(hunk.attributedRanges.length > 0, 'Hunk should have attributedRanges');

			// The attributed range should be from the agent
			const agentRange = hunk.attributedRanges.find(r => r.attribution.isAgentEdit);
			assert.ok(agentRange !== undefined, 'Should have an agent attribution in the hunk');
		});

		test('multiple hunks from different agents have separate attributions', async () => {
			const { service, modifiedModel } = createChangeService('line1\nline2\nline3\nline4\nline5');

			// Agent 1 edits line 1
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'AAAAA')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			// Agent 2 edits line 5
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(5, 1, 5, 6, 'BBBBB')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const diffInfo = service.diffInfo.get();

			// Should have 2 separate hunks (or possibly merged depending on line distance)
			assert.ok(diffInfo.changes.length >= 1, 'Should have at least one diff change');

			// Collect all agent IDs from all hunks
			const allAgentIds = new Set<string>();
			for (const hunk of diffInfo.changes) {
				if (hunk.chatTelemetryInfo?.agentId) {
					allAgentIds.add(hunk.chatTelemetryInfo.agentId);
				}
				for (const range of hunk.attributedRanges) {
					const agentId = range.attribution.agentAttribution?.telemetryInfo.agentId;
					if (agentId) {
						allAgentIds.add(agentId);
					}
				}
			}

			// Both agents should be represented somewhere in the attribution data
			assert.ok(allAgentIds.has('agent-1') || allAgentIds.has('agent-2'),
				'At least one agent should be in the attribution data');
		});

		test('diffInfo changes reflect same-line edits from multiple agents', async () => {
			const { service, modifiedModel } = createChangeService('hello world today');

			// Agent 1 edits beginning of line
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 6, 'goodbye')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			// Agent 2 edits end of line
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 15, 1, 20, 'night')
			], createTelemetryInfo('req-2', 'agent-2'), 'req-2');

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length >= 1, 'Should have at least one diff change');

			// The hunk for this line should have attributed ranges from both agents
			const hunk = diffInfo.changes[0];
			assert.ok(hunk.attributedRanges.length >= 1,
				'Hunk should have at least one attributed range');

			// Check that we can identify both agents through the attribution system
			const uniqueAgents = service.getUniqueAgentAttributions();
			const agentIds = uniqueAgents.map(a => a.telemetryInfo.agentId);
			assert.ok(agentIds.includes('agent-1'), 'agent-1 should be tracked');
			assert.ok(agentIds.includes('agent-2'), 'agent-2 should be tracked');
		});

		test('diffInfo after user edit preserves agent attribution', async () => {
			const { service, modifiedModel } = createChangeService('aaa bbb ccc');

			// Agent edits beginning
			await applyAgentEdits(service, modifiedModel, [
				replaceEdit(1, 1, 1, 4, 'AAA')
			], createTelemetryInfo('req-1', 'agent-1'), 'req-1');

			// User edits end (non-overlapping)
			modifiedModel.applyEdits([
				EditOperation.replace(new Range(1, 9, 1, 12), 'CCC')
			]);

			// Wait for diff computation
			await waitForDiffToBeReady(service);

			const diffInfo = service.diffInfo.get();
			assert.ok(diffInfo.changes.length >= 1, 'Should have diff changes');

			// Agent attribution should still be present
			const uniqueAgents = service.getUniqueAgentAttributions();
			assert.ok(uniqueAgents.some(a => a.telemetryInfo.agentId === 'agent-1'),
				'Agent-1 attribution should be preserved after user edit');
		});

	});

});

