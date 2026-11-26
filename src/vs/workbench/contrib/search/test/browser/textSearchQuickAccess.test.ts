/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IPickerQuickAccessItem } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IQuickPick, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ISearchComplete, ISearchService, OneLineRange, TextSearchMatch } from '../../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { TextSearchQuickAccess } from '../../browser/quickTextSearch/textSearchQuickAccess.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';

suite('TextSearchQuickAccess', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('changing the query does not show buffered matches from the previous query', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const instantiationService = workbenchInstantiationService({
				configurationService: () => new TestConfigurationService({
					search: { searchOnType: true, quickAccess: { preserveInput: false } },
					editor: { wordSeparators: '' }
				})
			}, store);
			instantiationService.stub(IViewsService, {});
			instantiationService.stub(INotebookService, { getNotebookTextModels: () => [] });
			instantiationService.stub(INotebookEditorService, {
				onDidAddNotebookEditor: Event.None,
				retrieveExistingWidgetFromURI: () => undefined
			});
			instantiationService.stub(INotebookSearchService, {
				notebookSearch: () => ({
					openFilesToScan: new ResourceSet(),
					allScannedFiles: Promise.resolve(new ResourceSet()),
					completeData: Promise.resolve({ results: [], messages: [] })
				})
			});
			const folder = instantiationService.get(IWorkspaceContextService).getWorkspace().folders[0].uri;
			const previousCompletion = new DeferredPromise<ISearchComplete>();
			const previousProgress = new DeferredPromise<void>();
			instantiationService.stub(ISearchService, {
				textSearchSplitSyncAsync: (query, token = CancellationToken.None, onProgress) => {
					if (query.contentPattern.pattern === 'old') {
						queueMicrotask(() => {
							onProgress?.({
								resource: URI.joinPath(folder, 'old.txt'),
								results: [new TextSearchMatch('old', new OneLineRange(0, 0, 3))]
							});
							previousProgress.complete();
						});
						return {
							syncResults: { results: [], messages: [] },
							asyncResults: raceCancellationError(previousCompletion.p, token)
						};
					}
					return {
						syncResults: { results: [], messages: [] },
						asyncResults: Promise.resolve({ results: [], messages: [] })
					};
				}
			});
			const changedValue = store.add(new Emitter<string>());
			const currentResults = new DeferredPromise<void>();
			let items: readonly (IPickerQuickAccessItem | IQuickPickSeparator)[] = [];
			const picker = new class extends mock<IQuickPick<IPickerQuickAccessItem, { useSeparators: true }>>() {
				override value = '%old';
				override activeItems: IPickerQuickAccessItem[] = [];
				override readonly onDidChangeValue = changedValue.event;
				override readonly onDidChangeActive = Event.None;
				override readonly onDidTriggerButton = Event.None;
				override readonly onDidTriggerItemButton = Event.None;
				override readonly onDidTriggerSeparatorButton = Event.None;
				override readonly onDidAccept = Event.None;
				override readonly onWillHide = Event.None;
				override readonly onDidHide = Event.None;
				override get items() { return items; }
				override set items(value: readonly (IPickerQuickAccessItem | IQuickPickSeparator)[]) {
					items = value;
					if (this.value === '%new' && value.length) {
						currentResults.complete();
					}
				}
			};
			const provider = store.add(instantiationService.createInstance(TextSearchQuickAccess));
			store.add(provider.provide(picker, CancellationToken.None));
			await previousProgress.p;

			picker.value = '%new';
			changedValue.fire(picker.value);
			await currentResults.p;
			previousCompletion.complete({ results: [], messages: [] });
			await clock.runAllAsync();

			assert.deepStrictEqual(picker.items.map(item => item.label), ['No matching results']);
		} finally {
			clock.restore();
		}
	});
});
