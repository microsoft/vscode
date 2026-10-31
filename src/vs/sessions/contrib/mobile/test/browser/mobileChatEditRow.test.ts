/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatEditCompareModelFactory, IChatEditPhoneDiff } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPhonePresenter.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatTextEditGroup } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { MobileChatEditRow } from '../../browser/mobileChatEditRow.js';

suite('MobileChatEditRow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.parse('test:/edit.ts');
	const originalURI = URI.parse('snapshot:/before');
	const modifiedURI = URI.parse('snapshot:/after');
	const edit = upcastPartial<IChatTextEditGroup>({ uri });
	const response = upcastPartial<IChatResponseViewModel>({ sessionResource: URI.parse('test:/session') });

	function createHarness(entry?: IModifiedFileEntry) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({
			getUriBasenameLabel: () => 'edit.ts',
			getUriLabel: uri => uri.toString(),
		}));
		instantiationService.stub(IModelService, upcastPartial<IModelService>({ getModel: () => null }));
		instantiationService.stub(ILanguageService, upcastPartial<ILanguageService>({ guessLanguageIdByFilepathOrFirstLine: () => null }));
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IChatEditingService, upcastPartial<IChatEditingService>({
			getEditingSession: () => upcastPartial<IChatEditingSession>({ getEntry: () => entry }),
		}));
		const comparisons: [URI, URI][] = [];
		instantiationService.stub(IEditorWorkerService, upcastPartial<IEditorWorkerService>({
			computeDiff: async (original, modified) => {
				comparisons.push([original, modified]);
				return { identical: false, quitEarly: false, changes: [new DetailedLineRangeMapping(new LineRange(1, 2), new LineRange(1, 4), undefined)], moves: [] };
			},
		}));
		const opened: IChatEditPhoneDiff[] = [];
		return {
			comparisons, opened,
			create: (factory: ChatEditCompareModelFactory) => store.add(instantiationService.createInstance(MobileChatEditRow, edit, response, factory, async diff => {
				opened.push(diff);
				return true;
			})),
		};
	}

	test('uses editing snapshots and live counters instead of comparing an already-edited file', async () => {
		const added = observableValue('added', 1);
		const removed = observableValue('removed', 2);
		const harness = createHarness(upcastPartial<IModifiedFileEntry>({ originalURI, modifiedURI, linesAdded: added, linesRemoved: removed }));
		const row = harness.create(async () => assert.fail('An existing edit snapshot must not resolve the live file'));
		added.set(7, undefined);
		row.domNode.querySelector<HTMLElement>('[role="button"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ comparisons: harness.comparisons, opened: harness.opened }, {
			comparisons: [],
			opened: [{ uri, originalURI, modifiedURI, added: 7, removed: 2 }],
		});
	});

	test('owns the fallback compare reference and computes counts for the opened diff', async () => {
		const harness = createHarness();
		let disposed = 0;
		const reference = Object.assign(store.add(toDisposable(() => disposed++)), {
			object: {
				originalSha1: 'before',
				original: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: upcastPartial<ITextModel>({ uri: originalURI }) }),
				modified: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: upcastPartial<ITextModel>({ uri: modifiedURI }) }),
			},
		});
		const row = harness.create(async () => reference);
		await timeout(0);
		row.domNode.querySelector<HTMLElement>('[role="button"]')!.click();
		await timeout(0);
		row.dispose();
		assert.deepStrictEqual({ comparisons: harness.comparisons, opened: harness.opened, disposed }, {
			comparisons: [[originalURI, modifiedURI]],
			opened: [{ uri, originalURI, modifiedURI, added: 3, removed: 1 }],
			disposed: 1,
		});
	});

	test('disposes a compare reference that resolves after the row closes', async () => {
		const harness = createHarness();
		const deferred = new DeferredPromise<Awaited<ReturnType<ChatEditCompareModelFactory>>>();
		const row = harness.create(() => deferred.p);
		row.dispose();
		let disposed = 0;
		await deferred.complete(Object.assign(store.add(toDisposable(() => disposed++)), {
			object: {
				originalSha1: '',
				original: upcastPartial<IResolvedTextEditorModel>({}),
				modified: upcastPartial<IResolvedTextEditorModel>({}),
			},
		}));
		await timeout(0);
		assert.deepStrictEqual({ disposed, comparisons: harness.comparisons, opened: harness.opened }, { disposed: 1, comparisons: [], opened: [] });
	});
});
