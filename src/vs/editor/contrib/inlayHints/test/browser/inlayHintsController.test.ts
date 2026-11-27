/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Barrier, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { InlayHintList, InlayHintsProvider } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IInlayHintsCache, InlayHintsController } from '../../browser/inlayHintsController.js';
import { InlayHintItem, InlayHintsFragments } from '../../browser/inlayHints.js';

suite('InlayHintsController', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels a pending request when the document changes', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const inlayHintsCache = new class implements Pick<IInlayHintsCache, 'get' | 'set'> {
			declare readonly _serviceBrand: undefined;
			get(): InlayHintItem[] | undefined { return undefined; }
			set(): void { }
		};
		const serviceCollection = new ServiceCollection(
			[ILanguageFeaturesService, languageFeaturesService],
			[IInlayHintsCache, inlayHintsCache],
		);

		const firstRequestStarted = new Barrier();
		let firstRequest: { token: CancellationToken; release: () => void } | undefined;

		disposables.add(languageFeaturesService.inlayHintsProvider.register('*', new class implements InlayHintsProvider {
			provideInlayHints(model: ITextModel, _range: Range, token: CancellationToken): Promise<InlayHintList> {
				// Computed against the document as it is when the request starts
				const column = model.getLineContent(1).indexOf('value') + 'value'.length + 1;
				const result: InlayHintList = { hints: [{ label: ': number', position: { lineNumber: 1, column } }], dispose() { } };
				const empty: InlayHintList = { hints: [], dispose() { } };
				return new Promise(resolve => {
					const listener = token.onCancellationRequested(() => {
						listener.dispose();
						resolve(empty);
					});
					if (!firstRequest) {
						// Hold the first response until the test releases it
						firstRequest = {
							token,
							release: () => {
								listener.dispose();
								resolve(token.isCancellationRequested ? empty : result);
							}
						};
						firstRequestStarted.open();
					}
				});
			}
		}));

		const textModel = disposables.add(createTextModel('    value = make()'));
		const editor = disposables.add(createTestCodeEditor(textModel, { serviceCollection }));
		editor.layout({ width: 500, height: 300 });
		disposables.add(editor.registerAndInstantiateContribution(InlayHintsController.ID, InlayHintsController));

		await firstRequestStarted.wait();

		// Remove the leading whitespace while the first request is still pending
		editor.executeEdits('test', [{ range: new Range(1, 1, 1, 5), text: '' }]);
		assert.strictEqual(firstRequest!.token.isCancellationRequested, true, 'pending request should be cancelled by the edit');

		firstRequest!.release();
		await timeout(0);

		const renderedHints = textModel.getAllDecorations()
			.map(decoration => decoration.options.before?.content ?? decoration.options.after?.content)
			.filter(content => content?.includes('number'));
		assert.deepStrictEqual(renderedHints, [], 'the stale hint should not be rendered');
	});

	test('releases the lists of finished providers when the request is cancelled', async () => {
		const registry = new LanguageFeatureRegistry<InlayHintsProvider>();
		const model = disposables.add(createTextModel('value'));
		const tokenSource = disposables.add(new CancellationTokenSource());

		let released = 0;
		const finishedList: InlayHintList = {
			hints: [{ label: ': number', position: { lineNumber: 1, column: 6 } }],
			dispose() { released++; }
		};
		const pendingList = new DeferredPromise<InlayHintList>();
		disposables.add(registry.register('*', { provideInlayHints: async () => finishedList }));
		disposables.add(registry.register('*', { provideInlayHints: () => pendingList.p }));

		const result = InlayHintsFragments.create(registry, model, [model.getFullModelRange()], tokenSource.token);

		// One provider has finished, the document changes while the other is pending
		await timeout(0);
		tokenSource.cancel();
		pendingList.complete({ hints: [], dispose() { } });

		await assert.rejects(result, isCancellationError);
		assert.strictEqual(released, 1);
	});
});
