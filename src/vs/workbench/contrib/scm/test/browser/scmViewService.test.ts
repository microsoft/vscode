/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ISCMProvider, ISCMService } from '../../common/scm.js';
import { SCMService } from '../../common/scmService.js';
import { ISCMViewServiceState, SCMViewService } from '../../browser/scmViewService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Command } from '../../../../../editor/common/languages.js';

function createMockProvider(id: string, rootUri: URI, options?: { isHidden?: boolean }): ISCMProvider {
	return {
		id,
		providerId: 'git',
		label: 'Git',
		name: 'Git',
		rootUri,
		groups: [],
		onDidChangeResourceGroups: Event.None,
		onDidChangeResources: Event.None,
		isHidden: options?.isHidden,
		inputBoxTextModel: {} as ITextModel,
		contextValue: observableValue('contextValue', undefined),
		count: observableValue('count', undefined),
		commitTemplate: observableValue('commitTemplate', ''),
		artifactProvider: observableValue('artifactProvider', undefined),
		historyProvider: observableValue('historyProvider', undefined),
		acceptInputCommand: undefined,
		actionButton: observableValue('actionButton', undefined),
		statusBarCommands: observableValue<readonly Command[] | undefined>('statusBarCommands', undefined),
		getOriginalResource: () => Promise.resolve(null),
		dispose: () => { },
	} as ISCMProvider;
}

function getProviderStorageKey(provider: ISCMProvider): string {
	return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}

suite('SCMViewService - Visibility Persistence', () => {

	const disposables = new DisposableStore();

	function createViewServiceWithState(previousState?: ISCMViewServiceState): { viewService: SCMViewService; scmService: SCMService; storageService: TestStorageService } {
		const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		const storageService = disposables.add(new TestStorageService());

		if (previousState) {
			storageService.store('scm:view:visibleRepositories', JSON.stringify(previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		instantiationService.stub(IStorageService, storageService);

		const configurationService = new TestConfigurationService({
			scm: {
				repositories: {
					selectionMode: 'multiple',
					sortOrder: 'discovery time',
					explorer: false,
				}
			}
		});
		instantiationService.stub(IConfigurationService, configurationService);

		const contextKeyService = disposables.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);

		const scmService = instantiationService.createInstance(SCMService);
		instantiationService.stub(ISCMService, scmService);

		const viewService = disposables.add(instantiationService.createInstance(SCMViewService));

		return { viewService, scmService, storageService };
	}

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isHidden repos do not break visibility restoration', () => {
		// Set up previous state: 3 repos, repo2 is hidden
		const provider1 = createMockProvider('1', URI.file('/repo1'));
		const provider2 = createMockProvider('2', URI.file('/repo2'));
		const provider3 = createMockProvider('3', URI.file('/repo3'));

		const previousState: ISCMViewServiceState = {
			all: [
				getProviderStorageKey(provider1),
				getProviderStorageKey(provider2),
				getProviderStorageKey(provider3)
			],
			visible: [0, 2], // repo1 and repo3 are visible, repo2 is hidden
			sortKey: 'discoveryTime' as any
		};

		const { viewService, scmService } = createViewServiceWithState(previousState);

		// Register an isHidden repo FIRST (before the known repos)
		disposables.add(scmService.registerSCMProvider(
			createMockProvider('hidden-1', URI.file('/hidden-repo'), { isHidden: true })
		));

		// Then register the known repos
		disposables.add(scmService.registerSCMProvider(provider1));
		disposables.add(scmService.registerSCMProvider(provider2));
		disposables.add(scmService.registerSCMProvider(provider3));

		// repo2 should still be hidden, the isHidden repo should not
		// have caused all repos to become visible
		assert.deepStrictEqual(
			viewService.visibleRepositories.map(r => r.provider.rootUri?.toString()),
			[provider1.rootUri!.toString(), provider3.rootUri!.toString()]
		);
	});

	test('new repo does not reset visibility of existing repos', () => {
		// Set up previous state: 3 repos, repo2 is hidden
		const provider1 = createMockProvider('1', URI.file('/repo1'));
		const provider2 = createMockProvider('2', URI.file('/repo2'));
		const provider3 = createMockProvider('3', URI.file('/repo3'));

		const previousState: ISCMViewServiceState = {
			all: [
				getProviderStorageKey(provider1),
				getProviderStorageKey(provider2),
				getProviderStorageKey(provider3)
			],
			visible: [0, 2], // repo1 and repo3 are visible, repo2 is hidden
			sortKey: 'discoveryTime' as any
		};

		const { viewService, scmService } = createViewServiceWithState(previousState);

		// Register the known repos
		disposables.add(scmService.registerSCMProvider(provider1));
		disposables.add(scmService.registerSCMProvider(provider2));
		disposables.add(scmService.registerSCMProvider(provider3));

		// Register a NEW repo that wasn't in the previous state
		const provider4 = createMockProvider('4', URI.file('/repo4'));
		disposables.add(scmService.registerSCMProvider(provider4));

		// repo2 should still be hidden, repo4 should be visible
		const visibleUris = viewService.visibleRepositories.map(r => r.provider.rootUri?.toString());
		assert.ok(visibleUris.includes(provider1.rootUri!.toString()), 'repo1 should be visible');
		assert.ok(!visibleUris.includes(provider2.rootUri!.toString()), 'repo2 should be hidden');
		assert.ok(visibleUris.includes(provider3.rootUri!.toString()), 'repo3 should be visible');
		assert.ok(visibleUris.includes(provider4.rootUri!.toString()), 'repo4 (new) should be visible');
	});

	test('visibility state is correctly restored when repos arrive in order', () => {
		const provider1 = createMockProvider('1', URI.file('/repo1'));
		const provider2 = createMockProvider('2', URI.file('/repo2'));
		const provider3 = createMockProvider('3', URI.file('/repo3'));

		const previousState: ISCMViewServiceState = {
			all: [
				getProviderStorageKey(provider1),
				getProviderStorageKey(provider2),
				getProviderStorageKey(provider3)
			],
			visible: [0, 2],
			sortKey: 'discoveryTime' as any
		};

		const { viewService, scmService } = createViewServiceWithState(previousState);

		disposables.add(scmService.registerSCMProvider(provider1));
		disposables.add(scmService.registerSCMProvider(provider2));
		disposables.add(scmService.registerSCMProvider(provider3));

		assert.deepStrictEqual(
			viewService.visibleRepositories.map(r => r.provider.rootUri?.toString()),
			[provider1.rootUri!.toString(), provider3.rootUri!.toString()]
		);
	});

	test('visibility state is correctly restored when hidden repo arrives first', () => {
		const provider1 = createMockProvider('1', URI.file('/repo1'));
		const provider2 = createMockProvider('2', URI.file('/repo2'));
		const provider3 = createMockProvider('3', URI.file('/repo3'));

		const previousState: ISCMViewServiceState = {
			all: [
				getProviderStorageKey(provider1),
				getProviderStorageKey(provider2),
				getProviderStorageKey(provider3)
			],
			visible: [0, 2],
			sortKey: 'discoveryTime' as any
		};

		const { viewService, scmService } = createViewServiceWithState(previousState);

		// Register the hidden repo first
		disposables.add(scmService.registerSCMProvider(provider2));
		disposables.add(scmService.registerSCMProvider(provider1));
		disposables.add(scmService.registerSCMProvider(provider3));

		// repo2 should still be hidden regardless of registration order
		const visibleUris = viewService.visibleRepositories.map(r => r.provider.rootUri?.toString());
		assert.ok(visibleUris.includes(provider1.rootUri!.toString()), 'repo1 should be visible');
		assert.ok(!visibleUris.includes(provider2.rootUri!.toString()), 'repo2 should be hidden');
		assert.ok(visibleUris.includes(provider3.rootUri!.toString()), 'repo3 should be visible');
	});
});
