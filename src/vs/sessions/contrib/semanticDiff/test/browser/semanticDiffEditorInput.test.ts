/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { ISemanticDiffEditorSource, ISemanticDiffSourceResolverService } from '../../../../../workbench/contrib/chat/common/semanticDiffEditor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SemanticDiffEditorInput, SemanticDiffEditorSerializer } from '../../browser/semanticDiffEditorInput.js';
import { createSemanticDiffEditorData } from './semanticDiffTestUtils.js';

suite('SemanticDiffEditorInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to the highest present hunk type', () => {
		const { request } = createSemanticDiffEditorData(['supporting', 'test', 'supporting']);
		const input = store.add(new SemanticDiffEditorInput(request));
		assert.deepStrictEqual({ available: input.availableTypes, selected: [...input.selectedTypes.get()] }, {
			available: ['test', 'supporting'], selected: ['test'],
		});
	});

	test('clones and freezes validated reports, rejecting invalid group identities', () => {
		const { request } = createSemanticDiffEditorData();
		const input = store.add(new SemanticDiffEditorInput(request));
		request.report.analysis.groups[0].title = 'Mutated';
		assert.deepStrictEqual({
			name: input.getName(),
			frozen: Object.isFrozen(input.request.report.analysis.hunks[0].classification),
			readonly: input.hasCapability(EditorInputCapabilities.Readonly),
			dirty: input.isDirty(),
		}, { name: 'Guard billing totals', frozen: true, readonly: true, dirty: false });
		assert.throws(() => new SemanticDiffEditorInput({ ...request, groupId: 'missing' }), /group/i);
	});

	test('matches immutable result and group identity independently of filters', () => {
		const { request } = createSemanticDiffEditorData();
		const first = store.add(new SemanticDiffEditorInput(request));
		const second = store.add(new SemanticDiffEditorInput(request));
		const other = store.add(new SemanticDiffEditorInput({ ...request, groupId: 'other' }));
		const otherResult = store.add(new SemanticDiffEditorInput({ ...request, toolCallId: 'another-call' }));
		first.setSelectedTypes([]);
		assert.deepStrictEqual({
			same: first.matches(second), group: first.matches(other), result: first.matches(otherResult),
			first: [...first.selectedTypes.get()], second: [...second.selectedTypes.get()],
			stable: first.getProjectionUri('file', 'modified').toString() === second.getProjectionUri('file', 'modified').toString(),
			authority: first.getProjectionUri('//host/../file', 'modified').authority,
		}, { same: true, group: false, result: false, first: [], second: ['logic'], stable: true, authority: '' });
	});

	test('resolves once and projects primary-only filters without changing the full report', async () => {
		const { request, source } = createSemanticDiffEditorData();
		let calls = 0;
		const resolver: ISemanticDiffSourceResolverService = { _serviceBrand: undefined, resolve: async () => { calls++; return source; } };
		const input = store.add(new SemanticDiffEditorInput(request));
		await input.resolveSource(resolver);
		const initial = input.projections.get().flatMap(file => file.hunks.map(hunk => hunk.id));
		input.toggleType('supporting');
		const union = input.projections.get().flatMap(file => file.hunks.map(hunk => hunk.id));
		input.showAll();
		const all = input.projections.get().flatMap(file => file.hunks.map(hunk => hunk.id));
		input.setSelectedTypes([]);
		await input.resolveSource(resolver);
		assert.deepStrictEqual({ initial, union, all, empty: input.projections.get(), calls, total: input.hunks.length }, {
			initial: ['hunk-1'], union: ['hunk-0', 'hunk-1'], all: ['hunk-0', 'hunk-1', 'hunk-2'], empty: [], calls: 1, total: 3,
		});
	});

	test('serializes filters, resolved repository binding and collapsed state but not source content', async () => {
		const { request, source } = createSemanticDiffEditorData();
		const input = store.add(new SemanticDiffEditorInput({ ...request, repositoryUri: undefined }));
		input.setSelectedTypes([]);
		input.viewState = { scrollState: { top: 42, left: 7 }, docStates: { file: { collapsed: true } } };
		await input.resolveSource({ _serviceBrand: undefined, resolve: async () => source });
		const serializer = new SemanticDiffEditorSerializer();
		const serialized = serializer.serialize(input)!;
		const restored = store.add(serializer.deserialize(store.add(new TestInstantiationService()), serialized) as SemanticDiffEditorInput);
		assert.deepStrictEqual({
			match: restored.matches(input), selected: [...restored.selectedTypes.get()], viewState: restored.viewState,
			binding: restored.request.repositoryUri, originalBinding: input.request.repositoryUri,
			state: restored.sourceState.get().kind, containsSource: serialized.includes('const cap'),
		}, {
			match: true, selected: [], viewState: { scrollState: { top: 42, left: 7 }, docStates: Object.assign(Object.create(null), { file: { collapsed: true } }) },
			binding: 'file:///billing', originalBinding: undefined, state: 'initial', containsSource: false,
		});
		assert.strictEqual(serializer.deserialize(store.add(new TestInstantiationService()), '{"version":2}'), undefined);
	});

	test('reports source errors and retries only explicitly', async () => {
		const { request, source } = createSemanticDiffEditorData();
		const input = store.add(new SemanticDiffEditorInput(request));
		let calls = 0;
		const resolver: ISemanticDiffSourceResolverService = {
			_serviceBrand: undefined,
			resolve: async () => {
				if (++calls === 1) { throw new Error('Recorded source unavailable'); }
				return source;
			},
		};
		await input.resolveSource(resolver);
		const error = input.sourceState.get();
		input.showAll();
		await input.resolveSource(resolver);
		const callsAfterFilter = calls;
		await input.resolveSource(resolver, true);
		assert.deepStrictEqual({ error, callsAfterFilter, calls, final: input.sourceState.get().kind }, {
			error: { kind: 'error', message: 'Recorded source unavailable' }, callsAfterFilter: 1, calls: 2, final: 'ready',
		});
	});

	test('coalesces concurrent source loads and cancels/discards late results on disposal', async () => {
		const { request, source } = createSemanticDiffEditorData();
		const input = store.add(new SemanticDiffEditorInput(request));
		const result = new DeferredPromise<ISemanticDiffEditorSource>();
		let token = CancellationToken.None;
		let calls = 0;
		const resolver: ISemanticDiffSourceResolverService = {
			_serviceBrand: undefined, resolve: async (_request, cancellation) => { calls++; token = cancellation; return result.p; },
		};
		const first = input.resolveSource(resolver);
		const second = input.resolveSource(resolver);
		input.dispose();
		await result.complete(source);
		await Promise.all([first, second]);
		assert.deepStrictEqual({ calls, cancelled: token.isCancellationRequested, state: input.sourceState.get().kind }, { calls: 1, cancelled: true, state: 'loading' });
	});
});
