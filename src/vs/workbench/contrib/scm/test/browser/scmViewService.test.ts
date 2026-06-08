/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISCMMenus, ISCMProvider, ISCMRepository, ISCMService } from '../../common/scm.js';
import { SCMViewService } from '../../browser/scmViewService.js';
import { SCMMenus } from '../../browser/menus.js';
import { URI } from '../../../../../base/common/uri.js';

function makeProvider(providerId: string, label: string, rootUri: URI): ISCMProvider {
	return new class extends mock<ISCMProvider>() {
		override providerId = providerId;
		override label = label;
		override name = label;
		override rootUri = rootUri;
		override dispose() { }
	}();
}

function makeRepository(id: string, provider: ISCMProvider): ISCMRepository {
	return new class extends mock<ISCMRepository>() {
		override id = id;
		override provider = provider;
		override dispose() { }
	}();
}

suite('SCMViewService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let storageService: TestStorageService;
	let onDidAddRepositoryEmitter: Emitter<ISCMRepository>;
	let onDidRemoveRepositoryEmitter: Emitter<ISCMRepository>;

	setup(() => {
		onDidAddRepositoryEmitter = store.add(new Emitter<ISCMRepository>());
		onDidRemoveRepositoryEmitter = store.add(new Emitter<ISCMRepository>());

		instantiationService = store.add(new TestInstantiationService());
		storageService = store.add(new TestStorageService());

		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			'scm.repositories.selectionMode': 'multiple',
			'scm.repositories.sortOrder': 'discovery time',
			'scm.repositories.explorer': false,
			'scm.graph.showIncomingChanges': true,
			'scm.graph.showOutgoingChanges': true,
		}));
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidActiveEditorChange = Event.None;
			override activeEditor = undefined;
		}());
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override onWillStop = Event.None;
		}());
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder() { return undefined; }
		}());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override onDidAddRepository = onDidAddRepositoryEmitter.event;
			override onDidRemoveRepository = onDidRemoveRepositoryEmitter.event;
			override repositories = [];
		}());

		// Stub SCMMenus to avoid complex menu setup in unit tests
		instantiationService.stubInstance(SCMMenus, new class extends mock<ISCMMenus>() {
			override getRepositoryMenus() { return undefined as any; }
			override dispose() { }
		}());
	});

	function getProviderStorageKey(provider: ISCMProvider): string {
		return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
	}

	test('late-arriving deselected worktree remains deselected after loading completes', () => {
		const mainProvider = makeProvider('git', 'Git', URI.file('/repo/main'));
		const worktreeProvider = makeProvider('git', 'Git', URI.file('/repo/worktree'));
		const mainRepository = makeRepository('main', mainProvider);
		const worktreeRepository = makeRepository('worktree', worktreeProvider);

		// Simulate previous session state: main was visible, worktree was deselected
		const previousState = {
			all: [getProviderStorageKey(mainProvider), getProviderStorageKey(worktreeProvider)],
			visible: [0],
			sortKey: 'discoveryTime'
		};
		storageService.store('scm:view:visibleRepositories', JSON.stringify(previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = store.add(instantiationService.createInstance(SCMViewService));

		// Add main repo during loading (before loading finishes)
		onDidAddRepositoryEmitter.fire(mainRepository);

		// Simulate loading completing (e.g. the 5-second debounce fired)
		(service as any).finishLoading();

		assert.strictEqual(service.didFinishLoadingRepositories.get(), true);

		// Add worktree repo late (after loading has finished) - simulates a worktree
		// being detected after git status completes
		onDidAddRepositoryEmitter.fire(worktreeRepository);

		// Worktree should NOT be in visible repositories since it was deselected in the previous session
		assert.deepStrictEqual(service.visibleRepositories, [mainRepository]);
	});

	test('late-arriving previously visible worktree is added as visible', () => {
		const mainProvider = makeProvider('git', 'Git', URI.file('/repo/main'));
		const worktreeProvider = makeProvider('git', 'Git', URI.file('/repo/worktree'));
		const mainRepository = makeRepository('main', mainProvider);
		const worktreeRepository = makeRepository('worktree', worktreeProvider);

		// Both repos were visible in the previous session
		const previousState = {
			all: [getProviderStorageKey(mainProvider), getProviderStorageKey(worktreeProvider)],
			visible: [0, 1],
			sortKey: 'discoveryTime'
		};
		storageService.store('scm:view:visibleRepositories', JSON.stringify(previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = store.add(instantiationService.createInstance(SCMViewService));

		onDidAddRepositoryEmitter.fire(mainRepository);

		(service as any).finishLoading();

		// Worktree was visible before, so it should be added as visible when it arrives late
		onDidAddRepositoryEmitter.fire(worktreeRepository);

		assert.deepStrictEqual(service.visibleRepositories, [mainRepository, worktreeRepository]);
	});

	test('deselected worktree during initial loading remains deselected', () => {
		const mainProvider = makeProvider('git', 'Git', URI.file('/repo/main'));
		const worktreeProvider = makeProvider('git', 'Git', URI.file('/repo/worktree'));
		const mainRepository = makeRepository('main', mainProvider);
		const worktreeRepository = makeRepository('worktree', worktreeProvider);

		const previousState = {
			all: [getProviderStorageKey(mainProvider), getProviderStorageKey(worktreeProvider)],
			visible: [0],
			sortKey: 'discoveryTime'
		};
		storageService.store('scm:view:visibleRepositories', JSON.stringify(previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service = store.add(instantiationService.createInstance(SCMViewService));

		// Main repo arrives first and is selected
		onDidAddRepositoryEmitter.fire(mainRepository);
		// Worktree arrives while loading is still in progress (before debounce fires)
		onDidAddRepositoryEmitter.fire(worktreeRepository);

		assert.deepStrictEqual(service.visibleRepositories, [mainRepository]);
	});
});
