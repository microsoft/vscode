/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { SCMMenus } from '../../browser/menus.js';
import { SCMViewService } from '../../browser/scmViewService.js';
import { ISCMProvider, ISCMRepository, ISCMService } from '../../common/scm.js';

suite('SCMViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('active repository follows the active editor when its repository is opened after the editor', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const repositories: ISCMRepository[] = [];
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override readonly repositories = repositories;
			override readonly onDidAddRepository = onDidAddRepository.event;
			override readonly onDidRemoveRepository = Event.None;
			override getRepository(idOrResource: string | URI): ISCMRepository | undefined {
				return repositories.find(r => URI.isUri(idOrResource) && isEqualOrParent(idOrResource, r.provider.rootUri!));
			}
		}());

		const activeEditor = disposables.add(new TestFileEditorInput(URI.file('/repositoryB/file.txt'), 'testEditor'));
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditor = activeEditor;
			override readonly onDidActiveEditorChange = Event.None;
		}());

		const scmViewService = disposables.add(instantiationService.createInstance(SCMViewService));

		// The menus are not disposed by the view service since it is a singleton
		const menus = disposables.add(scmViewService.menus as SCMMenus);
		disposables.add(menus.titleMenu);

		const activeRepositories: (string | undefined)[] = [];
		disposables.add(autorun(reader => {
			activeRepositories.push(scmViewService.activeRepository.read(reader)?.repository.id);
		}));

		const addRepository = (id: string) => {
			const provider = new class extends mock<ISCMProvider>() {
				override readonly id = id;
				override readonly providerId = 'test';
				override readonly label = id;
				override readonly rootUri = URI.file(`/${id}`);
			}();
			const repository = new class extends mock<ISCMRepository>() {
				override readonly id = id;
				override readonly provider = provider;
			}();

			repositories.push(repository);
			onDidAddRepository.fire(repository);
		};

		addRepository('repositoryA');
		addRepository('repositoryB');

		assert.deepStrictEqual(activeRepositories, [undefined, 'repositoryA', 'repositoryB']);
	}));

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
