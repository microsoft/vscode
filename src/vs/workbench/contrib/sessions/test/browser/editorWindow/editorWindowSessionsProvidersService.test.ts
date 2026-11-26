/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { EditorWindowSessionsProvidersService } from '../../../browser/editorWindow/editorWindowSessionsProvidersService.js';
import { SessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionsListingScope, ISessionsProvider } from '../../../common/sessionsProvider.js';
import { ChatViewSessionsListService, IChatViewSessionsListService } from '../../../../chat/common/chatViewSessionsListService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/chatConstants.js';

suite('EditorWindowSessionsProvidersService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(configurationService = new TestConfigurationService()) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ willShutdown: false }));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({ stat: () => Promise.reject(new Error('no .git')) }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatViewSessionsListService, instantiationService.createInstance(ChatViewSessionsListService));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			onDidChangeWorkbenchState: Event.None,
			getWorkbenchState: () => WorkbenchState.FOLDER,
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.parse('vscode-remote://host/work/repo'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.parse('vscode-remote://host/work/repo') })] }),
		}));
		return store.add(instantiationService.createInstance(EditorWindowSessionsProvidersService));
	}

	test('providers list every session only while the new editor list and its workspaces filter are both on', () => {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: true });
		const service = createService(configurationService);
		let scope: ISessionsListingScope | undefined;
		store.add(service.registerProvider(upcastPartial<ISessionsProvider>({
			id: 'local', order: 0, setListingScope: value => { scope = value; },
		})));
		const folders = () => scope!.folders.get().map(uri => uri.toString());
		const set = (key: string, value: boolean) => {
			configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([key]), affectsConfiguration: k => k === key }));
		};
		const filterOff = folders();
		set(SESSIONS_LIST_WORKSPACES_FILTER_SETTING, true);
		const bothOn = folders();
		set(ChatConfiguration.ChatViewSessionsListEnabled, false);
		const legacyList = folders();
		assert.deepStrictEqual({ filterOff, bothOn, legacyList }, {
			filterOff: ['vscode-remote://host/work/repo'], bothOn: [], legacyList: ['vscode-remote://host/work/repo'],
		});
	});

	/** A provider that records the listing scopes it is given, as they are set before it is registered. */
	function createProvider(id: string, scopes: { readonly id: string; readonly registered: boolean; readonly folders: string[] }[], service: EditorWindowSessionsProvidersService): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({
			id,
			order: 0,
			setListingScope: (scope: ISessionsListingScope) => scopes.push({ id, registered: !!service.getProvider(id), folders: scope.folders.get().map(folder => folder.toString()) }),
		});
	}

	test('scopes every provider and session backend to the window\'s folders before it registers, whoever registers it', () => {
		const scopes: { readonly id: string; readonly registered: boolean; readonly folders: string[] }[] = [];
		const service = createService();
		store.add(service.registerProvider(createProvider('local', scopes, service)));
		// Such as a Dev Container provider that its service restores, later
		store.add(service.registerProvider(createProvider('dev-container', scopes, service)));
		store.add(service.registerSessionBackend('local', createProvider('backend', scopes, service)));
		// A provider that cannot scope its listing still registers
		store.add(service.registerProvider(upcastPartial<ISessionsProvider>({ id: 'unscoped', order: 0 })));

		assert.deepStrictEqual({ scopes, providers: service.getProviders({ includeSessionBackends: true }).map(provider => provider.id) }, {
			scopes: [
				{ id: 'local', registered: false, folders: ['vscode-remote://host/work/repo'] },
				{ id: 'dev-container', registered: false, folders: ['vscode-remote://host/work/repo'] },
				{ id: 'backend', registered: false, folders: ['vscode-remote://host/work/repo'] },
			],
			providers: ['local', 'dev-container', 'unscoped', 'backend'],
		});
	});

	test('the Agents window\'s service scopes no provider: each lists all of its sessions', () => {
		const scoped: string[] = [];
		const service = store.add(new SessionsProvidersService(upcastPartial<ILifecycleService>({ willShutdown: false })));
		store.add(service.registerProvider(upcastPartial<ISessionsProvider>({ id: 'local', order: 0, setListingScope: () => scoped.push('local') })));
		store.add(service.registerSessionBackend('local', upcastPartial<ISessionsProvider>({ id: 'backend', order: 0, setListingScope: () => scoped.push('backend') })));

		assert.deepStrictEqual(scoped, []);
	});
});
