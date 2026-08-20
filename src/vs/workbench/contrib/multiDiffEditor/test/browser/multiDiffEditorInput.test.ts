/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert, { strictEqual } from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput, ResourceConfigurationEventDispatcher } from '../../browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../browser/multiDiffSourceResolverService.js';

suite('MultiDiffEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('should multiplex resource configuration listeners', () => {
		let upstreamListeners = 0;
		const emitter = disposables.add(new Emitter<ITextResourceConfigurationChangeEvent>({
			onWillAddFirstListener: () => upstreamListeners++,
			onDidRemoveLastListener: () => upstreamListeners--,
		}));
		const dispatcher = new ResourceConfigurationEventDispatcher(emitter.event, resource => resource.toString());
		const store = disposables.add(new DisposableStore());
		const resources = Array.from({ length: 200 }, (_, index) => URI.file(`/workspace/file${index}.ts`));
		const changeCounts = resources.map(() => 0);

		for (let i = 0; i < resources.length; i++) {
			store.add(dispatcher.filteredEvent(resources[i])(() => changeCounts[i]++));
		}

		strictEqual(upstreamListeners, 1);

		emitter.fire({
			affectedKeys: new Set(['editor.fontSize']),
			affectsConfiguration: (resource, section) => section === 'editor' && resource?.toString() === resources[42].toString(),
		});

		strictEqual(changeCounts[42], 1);
		strictEqual(changeCounts.reduce((sum, value) => sum + value, 0), 1);

		emitter.fire({
			affectedKeys: new Set(['diffEditor.ignoreTrimWhitespace']),
			affectsConfiguration: (resource, section) => section === 'diffEditor' && resource?.toString() === resources[100].toString(),
		});

		strictEqual(changeCounts[100], 1);
		strictEqual(changeCounts.reduce((sum, value) => sum + value, 0), 2);

		store.clear();
		strictEqual(upstreamListeners, 0);
	});

	test('should support event disposables, thisArgs, duplicate listeners, and listener errors', () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		let unexpectedErrors = 0;
		setUnexpectedErrorHandler(() => unexpectedErrors++);

		try {
			let upstreamListeners = 0;
			const emitter = disposables.add(new Emitter<ITextResourceConfigurationChangeEvent>({
				onWillAddFirstListener: () => upstreamListeners++,
				onDidRemoveLastListener: () => upstreamListeners--,
			}));
			const dispatcher = new ResourceConfigurationEventDispatcher(emitter.event, resource => resource.toString());
			const store = disposables.add(new DisposableStore());
			const resource = URI.file('/workspace/file.ts');
			const event = dispatcher.filteredEvent(resource);

			let duplicateCalls = 0;
			const duplicateListener = () => duplicateCalls++;
			event(duplicateListener, undefined, store);
			event(duplicateListener, undefined, store);

			const thisArg = { calls: 0 };
			event(function (this: typeof thisArg) {
				this.calls++;
			}, thisArg, store);

			let listenerAfterErrorCalls = 0;
			event(() => {
				throw new Error('expected');
			}, undefined, store);
			event(() => listenerAfterErrorCalls++, undefined, store);

			strictEqual(upstreamListeners, 1);

			emitter.fire({
				affectedKeys: new Set(['editor.fontSize']),
				affectsConfiguration: (changedResource, section) => section === 'editor' && changedResource?.toString() === resource.toString(),
			});

			strictEqual(duplicateCalls, 2);
			strictEqual(thisArg.calls, 1);
			strictEqual(unexpectedErrors, 1);
			strictEqual(listenerAfterErrorCalls, 1);

			store.clear();
			strictEqual(upstreamListeners, 0);
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('updates its name from the resolved source label', async () => {
		const sourceLabel = observableValue('sourceLabel', 'Current Turn Changes');
		const sourceResolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override resolve() {
				return Promise.resolve({
					resources: ValueWithChangeEvent.const([]),
					label: new ValueWithChangeEventFromObservable(sourceLabel),
				});
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
		}();
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Fallback',
			undefined,
			false,
			new class extends mock<ITextModelService>() { }(),
			new class extends mock<ITextResourceConfigurationService>() { }(),
			new class extends mock<IInstantiationService>() { }(),
			sourceResolverService,
			textFileService,
		));
		await input.getViewModel();

		const names = [input.getName()];
		disposables.add(input.onDidChangeLabel(() => names.push(input.getName())));
		sourceLabel.set('Last Turn Changes', undefined);

		assert.deepStrictEqual(names, [
			'Current Turn Changes (0 files)',
			'Last Turn Changes (0 files)',
		]);
	});

	test('disposes models that finish resolving after input disposal', async () => {
		const referenceRequested = new DeferredPromise<void>();
		const referenceResult = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		let referenceDisposed = false;
		const textModelService = new class extends mock<ITextModelService>() {
			override createModelReference() {
				void referenceRequested.complete();
				return referenceResult.p;
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
		}();
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Test',
			[new MultiDiffEditorItem(undefined, URI.parse('file:///modified.ts'), undefined)],
			false,
			textModelService,
			new class extends mock<ITextResourceConfigurationService>() { }(),
			new class extends mock<IInstantiationService>() { }(),
			new class extends mock<IMultiDiffSourceResolverService>() { }(),
			textFileService,
		));

		const viewModelPromise = input.getViewModel();
		await referenceRequested.p;
		input.dispose();
		await referenceResult.complete({
			object: new class extends mock<IResolvedTextEditorModel>() { }(),
			dispose: () => referenceDisposed = true,
		});

		await assert.rejects(viewModelPromise, CancellationError);
		assert.strictEqual(referenceDisposed, true);
	});
});
