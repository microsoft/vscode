/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { SessionComparisonDialogResizeController, SessionComparisonSetupDialog } from '../../browser/sessionComparisonSetupDialog.js';
import { ISessionComparisonHarness } from '../../../../services/sessions/common/sessionComparison.js';

const WIDTH_STORAGE_KEY = 'sessions.comparisonSetupDialog.width';
const HEIGHT_STORAGE_KEY = 'sessions.comparisonSetupDialog.height';

suite('SessionComparisonDialogResizeController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createController(storageService: TestStorageService): { dialog: HTMLElement; body: HTMLElement } {
		const dialog = dom.append(mainWindow.document.body, dom.$('.session-comparison-setup-dialog'));
		const body = dom.append(dialog, dom.$('.session-comparison-setup-body'));
		disposables.add({ dispose: () => dialog.remove() });
		disposables.add(new SessionComparisonDialogResizeController(dialog, body, storageService));
		return { dialog, body };
	}

	test('keeps the default size when no dimensions are stored', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: '',
			height: '',
		});

	});

	test('restores stored dimensions and clamps them to the viewport', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store(WIDTH_STORAGE_KEY, mainWindow.innerWidth * 2, StorageScope.PROFILE, StorageTarget.MACHINE);
		storageService.store(HEIGHT_STORAGE_KEY, 480, StorageScope.PROFILE, StorageTarget.MACHINE);

		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: `${Math.floor(mainWindow.innerWidth * 0.9)}px`,
			height: '480px',
		});
	});

	test('resizes and persists dimensions with the keyboard', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog, body } = createController(storageService);
		dialog.style.width = '560px';
		dialog.style.height = '400px';
		const widthHandle = body.querySelector<HTMLElement>('.session-comparison-setup-resize-width');
		assert.ok(widthHandle);

		widthHandle.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

		assert.deepStrictEqual({
			width: dialog.style.width,
			storedWidth: storageService.getNumber(WIDTH_STORAGE_KEY, StorageScope.PROFILE),
			storedHeight: storageService.getNumber(HEIGHT_STORAGE_KEY, StorageScope.PROFILE),
			ariaValue: widthHandle.getAttribute('aria-valuenow'),
		}, {
			width: '580px',
			storedWidth: 580,
			storedHeight: 400,
			ariaValue: '580',
		});
	});

	suite('evaluator defaults', () => {
		const saveDefaults = Reflect.get(SessionComparisonSetupDialog.prototype, '_saveEvaluatorDefaults') as (this: object, judgeHarness: ISessionComparisonHarness, synthesisHarness: ISessionComparisonHarness) => void;
		const clearDefaults = Reflect.get(SessionComparisonSetupDialog.prototype, '_clearEvaluatorDefaults') as (this: object) => void;
		const getInitialState = Reflect.get(SessionComparisonSetupDialog.prototype, '_getInitialEvaluatorState') as (this: object, judgeHarness: ISessionComparisonHarness, synthesisHarness: ISessionComparisonHarness, useSavedDefaults: boolean) => {
			readonly judgeHarness: ISessionComparisonHarness;
			readonly synthesisHarness: ISessionComparisonHarness;
			readonly expanded: boolean;
		};

		function createDialogHarness(storageService: TestStorageService): object {
			const harness = Object.create(SessionComparisonSetupDialog.prototype);
			Reflect.set(harness, 'storageService', storageService);
			return harness;
		}

		test('uses saved evaluator settings and collapses the section by default', () => {
			const storageService = disposables.add(new TestStorageService());
			const dialog = createDialogHarness(storageService);
			const fallbackJudge = { providerId: 'fallback', sessionTypeId: 'judge', label: 'Fallback Judge' };
			const fallbackSynthesis = { providerId: 'fallback', sessionTypeId: 'synthesis', label: 'Fallback Synthesizer' };
			const savedJudge = { providerId: 'saved', sessionTypeId: 'judge', label: 'Saved Judge', modelId: 'judge-model' };
			const savedSynthesis = { providerId: 'saved', sessionTypeId: 'synthesis', label: 'Saved Synthesizer', modelId: 'synthesis-model' };

			saveDefaults.call(dialog, savedJudge, savedSynthesis);
			const state = getInitialState.call(dialog, fallbackJudge, fallbackSynthesis, true);

			assert.deepStrictEqual({
				judgeHarness: state.judgeHarness,
				synthesisHarness: state.synthesisHarness,
				expanded: state.expanded,
				userKeys: storageService.keys(StorageScope.PROFILE, StorageTarget.USER),
			}, {
				judgeHarness: savedJudge,
				synthesisHarness: savedSynthesis,
				expanded: false,
				userKeys: ['sessions.comparisonSetupDialog.evaluatorDefaults'],
			});
		});

		test('expands the section when evaluator defaults have not been saved', () => {
			const storageService = disposables.add(new TestStorageService());
			const dialog = createDialogHarness(storageService);
			const judgeHarness = { providerId: 'provider', sessionTypeId: 'judge', label: 'Judge' };
			const synthesisHarness = { providerId: 'provider', sessionTypeId: 'synthesis', label: 'Synthesizer' };

			const state = getInitialState.call(dialog, judgeHarness, synthesisHarness, true);

			assert.deepStrictEqual({
				judgeHarness: state.judgeHarness,
				synthesisHarness: state.synthesisHarness,
				expanded: state.expanded,
			}, {
				judgeHarness,
				synthesisHarness,
				expanded: true,
			});
		});

		test('clears saved evaluator settings and expands the section', () => {
			const storageService = disposables.add(new TestStorageService());
			const dialog = createDialogHarness(storageService);
			const judgeHarness = { providerId: 'provider', sessionTypeId: 'judge', label: 'Judge' };
			const synthesisHarness = { providerId: 'provider', sessionTypeId: 'synthesis', label: 'Synthesizer' };

			saveDefaults.call(dialog, judgeHarness, synthesisHarness);
			clearDefaults.call(dialog);
			const state = getInitialState.call(dialog, judgeHarness, synthesisHarness, true);

			assert.deepStrictEqual({
				judgeHarness: state.judgeHarness,
				synthesisHarness: state.synthesisHarness,
				expanded: state.expanded,
				userKeys: storageService.keys(StorageScope.PROFILE, StorageTarget.USER),
			}, {
				judgeHarness,
				synthesisHarness,
				expanded: true,
				userKeys: [],
			});
		});
	});
});
