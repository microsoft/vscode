/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { EditSources, EditSuggestionId } from '../../../../../editor/common/textModelEditSource.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { AnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { DiffService } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
import { IAiEditTelemetryService } from '../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { EditSourceTrackingImpl } from '../../browser/telemetry/editSourceTrackingImpl.js';
import { IScmRepoAdapter, ScmAdapter } from '../../browser/telemetry/scmAdapter.js';
import { IRandomService } from '../../browser/randomService.js';
import { MutableObservableWorkspace } from './editTelemetry.test.js';

suite('Edit Source Tracking Windows', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flushes and recreates the long-term tracker on hash and branch changes', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'beta', chatEdit('request-2')));
		await timeout(1500);
		context.branch.set('feature', undefined);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
			modifiedCount: event.modifiedCount,
			deltaModifiedCount: event.deltaModifiedCount,
		})), [
			{ trigger: 'hashChange', requestId: 'request-1', modifiedCount: 5, deltaModifiedCount: 5 },
			{ trigger: 'branchChange', requestId: 'request-2', modifiedCount: 3, deltaModifiedCount: 3 },
		]);

		context.disposables.dispose();
	}));

	test('flushes the long-term tracker when the document closes', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		context.document.dispose();
		await timeout(0);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
		})), [{ trigger: 'closed', requestId: 'request-1' }]);

		context.disposables.dispose();
	}));

	test('flushes and recreates the long-term tracker after ten hours', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('hello'), 'alpha', chatEdit('request-1')));
		await timeout(1500);
		await timeout(10 * 60 * 60 * 1000);

		context.document.applyEdit(StringEditWithReason.replace(context.document.findRange('alpha'), 'beta', chatEdit('request-2')));
		await timeout(1500);
		context.headHash.set('hash-2', undefined);

		assert.deepStrictEqual(context.details.map(event => ({
			trigger: event.trigger,
			requestId: event.requestId,
		})), [
			{ trigger: '10hours', requestId: 'request-1' },
			{ trigger: 'hashChange', requestId: 'request-2' },
		]);

		context.disposables.dispose();
	}));

	test('emits only the top thirty long-term sources by retained count', () => runWithFakedTimers({}, async () => {
		const context = setup();
		await timeout(10);

		for (let i = 1; i <= 31; i++) {
			context.document.applyEdit(StringEditWithReason.replace(
				OffsetRange.emptyAt(context.document.value.get().value.length),
				'x'.repeat(i),
				EditSources.unknown({ name: `source-${i}` }),
			));
		}
		await timeout(10);
		context.headHash.set('hash-2', undefined);

		assert.deepStrictEqual({
			count: context.details.length,
			first: context.details[0].sourceKey,
			last: context.details.at(-1)?.sourceKey,
			containsSmallest: context.details.some(event => event.sourceKey === 'source:unknown-name:source-1'),
		}, {
			count: 30,
			first: 'source:unknown-name:source-31',
			last: 'source:unknown-name:source-2',
			containsSmallest: false,
		});

		context.disposables.dispose();
	}));

	test('starts after first visibility and keeps only the long-term tracker while hidden', () => runWithFakedTimers({}, async () => {
		const visible = observableValue('visible', false);
		const context = setup(visible);
		await timeout(10);

		assert.strictEqual(context.impl.docsState.get().size, 0);

		visible.set(true, undefined);
		const visibleState = context.impl.docsState.get().get(context.document);
		if (!visibleState) {
			throw new Error('Expected visible document state');
		}
		assert.ok(visibleState.longtermTracker.get());
		const firstWindowedTracker = visibleState.windowedTracker.get();
		assert.ok(firstWindowedTracker);
		assert.ok(visibleState.windowedFocusTracker.get());

		visible.set(false, undefined);
		const hiddenState = context.impl.docsState.get().get(context.document);
		if (!hiddenState) {
			throw new Error('Expected hidden document state');
		}
		assert.ok(hiddenState.longtermTracker.get());
		assert.strictEqual(hiddenState.windowedTracker.get(), undefined);
		assert.strictEqual(hiddenState.windowedFocusTracker.get(), undefined);

		visible.set(true, undefined);
		const visibleAgainState = context.impl.docsState.get().get(context.document);
		if (!visibleAgainState) {
			throw new Error('Expected visible document state after reopening');
		}
		assert.ok(visibleAgainState.windowedTracker.get());
		assert.notStrictEqual(visibleAgainState.windowedTracker.get(), firstWindowedTracker);

		context.disposables.dispose();
	}));
});

function setup(visible: ISettableObservable<boolean> = observableValue('visible', true)) {
	const disposables = new DisposableStore();
	const headHash = observableValue('headHash', 'hash-1');
	const branch = observableValue('branch', 'main');
	const repo = {
		headCommitHashObs: headHash,
		headBranchNameObs: branch,
		isIgnored: async () => false,
	} satisfies IScmRepoAdapter;
	const details: Array<{ sourceKey: string; trigger: string; requestId: string | undefined; modifiedCount: number; deltaModifiedCount: number }> = [];
	let uuid = 0;
	const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
	instantiationService.stub(ITelemetryService, {
		publicLog2(eventName, data) {
			const eventData = data as { mode?: string } | undefined;
			if (eventName === 'editTelemetry.editSources.details' && eventData?.mode === 'longterm') {
				details.push(data as typeof details[number]);
			}
		},
	});
	instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced') });
	instantiationService.stubInstance(ScmAdapter, { getRepo: () => repo });
	instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (_uri, reader) => visible.read(reader) });
	instantiationService.stub(IRandomService, {
		_serviceBrand: undefined,
		generateUuid: () => `stats-${++uuid}`,
		generatePrefixedUuid: namespace => `${namespace}-${++uuid}`,
	});
	instantiationService.stub(IUserAttentionService, {
		_serviceBrand: undefined,
		isVsCodeFocused: constObservable(true),
		isUserActive: constObservable(true),
		hasUserAttention: constObservable(true),
		totalFocusTimeMs: 0,
		fireAfterGivenFocusTimePassed: () => Disposable.None,
	});
	instantiationService.stub(IAiEditTelemetryService, {
		_serviceBrand: undefined,
		createSuggestionId: () => EditSuggestionId.newId(() => 'sgt-test'),
		handleCodeAccepted: () => { },
		handleCodeRejected: () => { },
	});
	instantiationService.stub(ILogService, new NullLogService());

	const workspace = new MutableObservableWorkspace();
	const annotatedDocuments = disposables.add(new AnnotatedDocuments(workspace, instantiationService));
	const impl = disposables.add(new EditSourceTrackingImpl(constObservable(true), annotatedDocuments, instantiationService));
	const document = disposables.add(workspace.createDocument({
		uri: URI.file('C:\\repo\\file.ts'),
		initialValue: 'hello',
		languageId: 'typescript',
	}));

	return { disposables, document, details, headHash, branch, impl };
}

function chatEdit(requestId: string) {
	return EditSources.chatApplyEdits({
		modelId: undefined,
		sessionId: 'session-1',
		requestId,
		languageId: 'typescript',
		mode: 'agent',
		extensionId: undefined,
		codeBlockSuggestionId: undefined,
	});
}
