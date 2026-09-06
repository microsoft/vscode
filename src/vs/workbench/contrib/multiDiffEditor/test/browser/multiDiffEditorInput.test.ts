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
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
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
});
