/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { EditorWindowSessionsProvidersService } from '../../../browser/agentsView/editorWindowSessionsProvidersService.js';
import { ISessionsListingScope, ISessionsProvider } from '../../../common/sessionsProvider.js';

suite('EditorWindowSessionsProvidersService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(enabled: boolean) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ willShutdown: false }));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.AgentsViewEnabled]: enabled }));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({ stat: () => Promise.reject(new Error('no .git')) }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.parse('vscode-remote://host/work/repo') })] }),
		}));
		return store.add(instantiationService.createInstance(EditorWindowSessionsProvidersService));
	}

	/** A provider that records the listing scopes it is given, as they are set before it is registered. */
	function createProvider(id: string, scopes: { readonly id: string; readonly registered: boolean; readonly folders: string[] }[], service: EditorWindowSessionsProvidersService): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({
			id,
			order: 0,
			setListingScope: (scope: ISessionsListingScope) => scopes.push({ id, registered: !!service.getProvider(id), folders: scope.folders.get().map(folder => folder.toString()) }),
		});
	}

	test('scopes every provider and session backend before it registers, whoever registers it, while the Agents view is enabled', () => {
		const scopes: { readonly id: string; readonly registered: boolean; readonly folders: string[] }[] = [];
		const service = createService(true);
		store.add(service.registerProvider(createProvider('local', scopes, service)));
		// Such as a Dev Container provider that its service restores, later
		store.add(service.registerProvider(createProvider('dev-container', scopes, service)));
		store.add(service.registerSessionBackend('local', createProvider('backend', scopes, service)));
		// A provider that cannot scope its listing still registers
		store.add(service.registerProvider(upcastPartial<ISessionsProvider>({ id: 'unscoped', order: 0 })));

		const disabled: typeof scopes = [];
		const disabledService = createService(false);
		store.add(disabledService.registerProvider(createProvider('local', disabled, disabledService)));

		assert.deepStrictEqual({ scopes, providers: service.getProviders({ includeSessionBackends: true }).map(provider => provider.id), disabled }, {
			scopes: [
				{ id: 'local', registered: false, folders: ['vscode-remote://host/work/repo'] },
				{ id: 'dev-container', registered: false, folders: ['vscode-remote://host/work/repo'] },
				{ id: 'backend', registered: false, folders: ['vscode-remote://host/work/repo'] },
			],
			providers: ['local', 'dev-container', 'unscoped', 'backend'],
			disabled: [],
		});
	});
});
