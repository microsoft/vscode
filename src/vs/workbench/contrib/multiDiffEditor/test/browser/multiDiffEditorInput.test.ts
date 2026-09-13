/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ITextFileEditorModelManager, ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../browser/multiDiffSourceResolverService.js';

suite('MultiDiffEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('keeps binary resources in the multi diff model', async () => {
		const originalUri = URI.parse('file:///original.png');
		const modifiedUri = URI.parse('file:///modified.png');
		const textModelService = new class extends mock<ITextModelService>() {
			override createModelReference(): Promise<IReference<IResolvedTextEditorModel>> {
				return Promise.reject(new TextFileOperationError('binary', TextFileOperationResult.FILE_IS_BINARY));
			}
		}();
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(): T { return {} as T; }
		}();
		let saveCallCount = 0;
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
			override save(): Promise<undefined> {
				saveCallCount++;
				return Promise.resolve(undefined);
			}
		}();
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		const instantiationService = createCodeEditorServices(disposables, services);
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Test',
			[new MultiDiffEditorItem(originalUri, modifiedUri, undefined)],
			false,
			textModelService,
			textResourceConfigurationService,
			instantiationService,
			new class extends mock<IMultiDiffSourceResolverService>() { }(),
			textFileService,
		));

		const viewModel = await input.getViewModel();
		const item = viewModel.items.get()[0];
		await input.save(1);

		assert.deepStrictEqual({
			itemCount: viewModel.items.get().length,
			originalUri: item.originalUri?.toString(),
			modifiedUri: item.modifiedUri?.toString(),
			isBinary: item.isBinary,
			originalSourceUri: item.documentDiffItem.original?.uri.toString(),
			modifiedSourceUri: item.documentDiffItem.modified?.uri.toString(),
			hasOriginalTextModel: item.documentDiffItem.original?.textModel !== undefined,
			hasModifiedTextModel: item.documentDiffItem.modified?.textModel !== undefined,
			saveCallCount,
		}, {
			itemCount: 1,
			originalUri: originalUri.toString(),
			modifiedUri: modifiedUri.toString(),
			isBinary: true,
			originalSourceUri: originalUri.toString(),
			modifiedSourceUri: modifiedUri.toString(),
			hasOriginalTextModel: false,
			hasModifiedTextModel: false,
			saveCallCount: 0,
		});
	});
});
