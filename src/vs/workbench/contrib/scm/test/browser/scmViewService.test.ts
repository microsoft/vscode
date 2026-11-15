/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { SCMViewService } from '../../browser/scmViewService.js';
import { ISCMProvider, ISCMRepository, ISCMService } from '../../common/scm.js';

suite('SCMViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRepository(id: string): ISCMRepository {
		const provider = new class extends mock<ISCMProvider>() {
			override readonly providerId = 'git';
			override readonly label = 'Git';
			override readonly rootUri = URI.file(`/${id}`);
		}();

		return new class extends mock<ISCMRepository>() {
			override readonly id = id;
			override readonly provider = provider;
		}();
	}

	for (const flushStorage of [false, true]) {
		test(`keeps a previously hidden repository hidden when it is added after loading finished${flushStorage ? ' and storage was flushed' : ''}`, () => runWithFakedTimers({}, async () => {
			const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
			const scmService = new class extends mock<ISCMService>() {
				override readonly onDidAddRepository = onDidAddRepository.event;
				override readonly onDidRemoveRepository = Event.None;
				override readonly repositories = [];
			}();

			const editorService = new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
			}();

			const extensionService = new class extends mock<IExtensionService>() {
				override readonly onWillStop = Event.None;
			}();

			const instantiationService = new class extends mock<IInstantiationService>() {
				override createInstance = (() => ({})) as IInstantiationService['createInstance'];
			}();

			const parent = createRepository('parent');
			const submodule = createRepository('parent/submodule');
			const newRepository = createRepository('new');

			const storageService = disposables.add(new TestStorageService());
			storageService.store('scm:view:visibleRepositories', JSON.stringify({
				all: [parent, submodule].map(r => `git:Git:${r.provider.rootUri!.toString()}`),
				visible: [0],
				sortKey: 'discoveryTime'
			}), StorageScope.WORKSPACE, StorageTarget.MACHINE);

			const scmViewService = new SCMViewService(scmService, new MockContextKeyService(), editorService, extensionService, instantiationService,
				new TestConfigurationService({ scm: { repositories: { selectionMode: 'multiple' } } }), storageService, new (mock<IWorkspaceContextService>())());

			onDidAddRepository.fire(parent);

			// Repositories finish loading 5s after the last repository was added
			await timeout(5000);

			if (flushStorage) {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
			}

			onDidAddRepository.fire(submodule);
			onDidAddRepository.fire(newRepository);

			assert.deepStrictEqual(scmViewService.visibleRepositories.map(r => r.id), ['parent', 'new']);

			scmViewService.dispose();
		}));
	}
});
