/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileChangesEvent, FileChangeType } from '../../../../../platform/files/common/files.js';
import { IEditableData } from '../../../../common/views.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { ExplorerService } from '../../browser/explorerService.js';
import { IExplorerView } from '../../browser/files.js';
import { ExplorerItem, NewExplorerItem } from '../../common/explorerModel.js';

suite('Files - ExplorerService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let explorerService: ExplorerService;
	let focusChanged: Emitter<boolean>;
	let fileService: TestFileService;
	let item: NewExplorerItem;
	let calls: string[];
	let focusDuringRender: boolean;

	const editableData: IEditableData = {
		validationMessage: () => null,
		onFinish: async () => { },
	};

	setup(() => {
		calls = [];
		focusDuringRender = false;
		focusChanged = store.add(new Emitter<boolean>());
		fileService = store.add(new TestFileService());
		const configurationService = new TestConfigurationService({ explorer: { autoReveal: false } });
		const instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(IHostService, { onDidChangeFocus: focusChanged.event });
		instantiationService.stub(IBulkEditService, {});
		explorerService = store.add(instantiationService.createInstance(ExplorerService));
		explorerService.registerView(new class extends mock<IExplorerView>() {
			override async setEditable(_stat: ExplorerItem, isEditing: boolean): Promise<void> {
				calls.push(isEditing ? 'start editing' : 'finish editing');
				if (isEditing && focusDuringRender) {
					focusChanged.fire(true);
				}
			}
			override async refresh(): Promise<void> {
				calls.push('refresh');
			}
			override hasPhantomElements(): boolean {
				return false;
			}
			override isItemVisible(): boolean {
				return true;
			}
		});
		const root = explorerService.roots[0];
		item = new NewExplorerItem(fileService, configurationService, NullFilesConfigurationService, root, false);
		root.addChild(item);
	});

	test('refreshes on window focus when not editing', () => {
		focusChanged.fire(false);
		const afterBlur = [...calls];
		focusChanged.fire(true);

		assert.deepStrictEqual({ afterBlur, afterFocus: calls }, { afterBlur: [], afterFocus: ['refresh'] });
	});

	for (const focusBeforeRender of [true, false]) {
		test(`defers focus refresh ${focusBeforeRender ? 'before' : 'after'} rendering the input`, async () => {
			focusDuringRender = focusBeforeRender;
			await explorerService.setEditable(item, editableData);
			if (!focusBeforeRender) {
				focusChanged.fire(true);
			}
			const whileEditing = {
				calls: [...calls],
				editable: explorerService.isEditable(item),
				children: [...explorerService.roots[0].children.values()],
			};

			await explorerService.setEditable(item, null);

			assert.deepStrictEqual({ whileEditing, calls, editable: explorerService.isEditable(undefined) }, {
				whileEditing: { calls: ['start editing'], editable: true, children: [item] },
				calls: ['start editing', 'finish editing', 'refresh'],
				editable: false,
			});
		});
	}

	test('coalesces deferred focus refreshes and clears them after editing', async () => {
		await explorerService.setEditable(item, editableData);
		focusChanged.fire(true);
		focusChanged.fire(false);
		focusChanged.fire(true);
		await explorerService.setEditable(item, null);
		await explorerService.setEditable(item, editableData);
		focusChanged.fire(false);
		await explorerService.setEditable(item, null);

		assert.deepStrictEqual(calls, ['start editing', 'finish editing', 'refresh', 'start editing', 'finish editing']);
	});

	test('still allows an explicit refresh while editing', async () => {
		await explorerService.setEditable(item, editableData);
		await explorerService.refresh(false);

		assert.deepStrictEqual(calls, ['start editing', 'refresh']);
	});

	test('defers file changes that were already queued when editing started', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		fileService.fireFileChanges(new FileChangesEvent([{ resource: joinPath(explorerService.roots[0].resource, 'external.txt'), type: FileChangeType.ADDED }], false));
		await explorerService.setEditable(item, editableData);
		await timeout(500);
		const whileEditing = [...calls];

		await explorerService.setEditable(item, null);
		await timeout(500);

		assert.deepStrictEqual({ whileEditing, calls }, {
			whileEditing: ['start editing'],
			calls: ['start editing', 'finish editing', 'refresh'],
		});
	}));
});
