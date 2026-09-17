/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionWorkflowSelection } from '../../../../services/sessions/common/sessionsProvider.js';
import { SessionWorkflowDraft } from '../../common/sessionWorkflowDraft.js';

suite('SessionWorkflowDraft', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const selection: SessionWorkflowSelection = {
		snapshot: {
			id: 'workflow', version: 1, label: 'Feature',
			checkpoints: [{
				id: 'plan', label: 'Plan', instructions: 'Write a plan.', inputs: {},
				type: { id: 'plan', version: 1, label: 'Plan', instructions: 'Write a plan.', proofSchema: { type: 'object' }, completion: { kind: 'reported' } },
			}],
		},
		stopAfter: 'plan',
		origin: { runId: 'parent', checkpointId: 'test-plan' },
	};

	test('restores a selection and independent origin without granting execution', () => {
		const storage = store.add(new InMemoryStorageService());
		const model = new SessionWorkflowDraft(storage, new NullLogService());
		model.setSelection(selection);
		const restored = new SessionWorkflowDraft(storage, new NullLogService());
		assert.deepStrictEqual({ selection: restored.selection.get(), error: restored.error.get() }, { selection, error: undefined });
	});

	test('retains a draft with deferred required inputs and still rejects invalid supplied values', () => {
		const storage = store.add(new InMemoryStorageService());
		const model = new SessionWorkflowDraft(storage, new NullLogService());
		const partial: SessionWorkflowSelection = {
			...selection, snapshot: { ...selection.snapshot, inputSchema: { type: 'object', properties: { repository: { type: 'string', format: 'uri' } }, required: ['repository'], additionalProperties: false } },
		};
		model.setSelection(partial);
		const restored = new SessionWorkflowDraft(storage, new NullLogService());
		assert.throws(() => restored.setSelection({ ...partial, inputs: { repository: 17 } }));
		assert.deepStrictEqual({ selection: restored.selection.get(), error: restored.error.get() }, { selection: partial, error: undefined });
	});
	test('removal is persistent and does not alter ordinary composer input', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('test.unrelatedDraft', 'Keep this input', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const model = new SessionWorkflowDraft(storage, new NullLogService());
		model.setSelection(selection);
		model.setSelection(undefined);
		const restored = new SessionWorkflowDraft(storage, new NullLogService());
		assert.deepStrictEqual({
			selection: restored.selection.get(), error: restored.error.get(),
			input: storage.get('test.unrelatedDraft', StorageScope.WORKSPACE),
		}, { selection: undefined, error: undefined, input: 'Keep this input' });
	});

	test('invalid stored selections remain visible as errors until explicitly removed', () => {
		const storage = store.add(new InMemoryStorageService());
		const invalid = JSON.stringify({ ...selection, stopAfter: 'missing' });
		storage.store('sessions.workflowDraft', invalid, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const model = new SessionWorkflowDraft(storage, new NullLogService());
		assert.deepStrictEqual({
			selection: model.selection.get(), hasError: !!model.error.get(),
			stored: storage.get('sessions.workflowDraft', StorageScope.WORKSPACE),
		}, { selection: undefined, hasError: true, stored: invalid });
		model.setSelection(undefined);
		assert.deepStrictEqual({ selection: model.selection.get(), error: model.error.get() }, { selection: undefined, error: undefined });
	});

	test('invalid replacements preserve the prior draft', () => {
		const storage = store.add(new InMemoryStorageService());
		const model = new SessionWorkflowDraft(storage, new NullLogService());
		model.setSelection(selection);
		assert.throws(() => model.setSelection({ ...selection, stopAfter: 'missing' }), /stopping point/);
		assert.deepStrictEqual(new SessionWorkflowDraft(storage, new NullLogService()).selection.get(), selection);
	});
});
