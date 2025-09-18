/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LocalHistoryQuickAccessProvider } from '../../browser/localHistoryQuickAccess.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkingCopyHistoryService } from '../../../../services/workingCopy/common/workingCopyHistory.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

suite('LocalHistoryQuickAccess', () => {

	let instantiationService: TestInstantiationService;
	let provider: LocalHistoryQuickAccessProvider;

	setup(() => {
		instantiationService = new TestInstantiationService();
		
		// Mock services
		instantiationService.stub(IWorkingCopyHistoryService, {
			getAll: () => Promise.resolve([])
		});
		instantiationService.stub(ILabelService, {
			getUriLabel: (uri: any) => uri.path
		});
		instantiationService.stub(IEditorService, {
			openEditor: () => Promise.resolve()
		});
		instantiationService.stub(ICommandService, {
			executeCommand: () => Promise.resolve()
		});
		instantiationService.stub(IFileService, {
			exists: () => Promise.resolve(true)
		});

		provider = instantiationService.createInstance(LocalHistoryQuickAccessProvider);
	});

	test('should have correct prefix', () => {
		assert.strictEqual(LocalHistoryQuickAccessProvider.PREFIX, '@local');
	});

	test('should return empty message when no local history', async () => {
		const picks = await provider._getPicks('', new DisposableStore(), CancellationToken.None);
		assert.strictEqual(picks.length, 1);
		assert(picks[0].label?.includes('No local history entries found'));
	});
});