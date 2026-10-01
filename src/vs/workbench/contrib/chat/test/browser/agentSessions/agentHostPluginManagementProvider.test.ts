/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostPluginManagementRequest, IAgentHostPluginManagementResult } from '../../../../../../platform/agentHost/common/agentHostPluginManagement.js';
import { createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IDialogService, IConfirmationResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { AgentHostPluginManagementProvider } from '../../../browser/agentSessions/agentHost/agentHostPluginManagementProvider.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';

function result(enabled = true): IAgentHostPluginManagementResult {
	return { plugins: [{ name: 'demo', marketplace: 'catalog', spec: 'demo@catalog', enabled, canToggle: true, canUninstall: true, canUpdate: true }], catalog: [], messages: [] };
}

suite('AgentHostPluginManagementProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('another-provider:///draft');

	function createFixture(remote = false) {
		const requests: IAgentHostPluginManagementRequest[] = [];
		let project = URI.file('/first');
		let manage = async (_request: IAgentHostPluginManagementRequest): Promise<IAgentHostPluginManagementResult> => result();
		const connection = new class extends mock<IAgentConnection>() {
			override readonly pluginManagementProviders = ['provider'];
			override readonly pluginManagement = { manage: async (request: IAgentHostPluginManagementRequest) => { requests.push(request); return manage(request); } };
			override readonly resourceUris = remote ? createAgentHostResourceUriMapper('host') : identityAgentHostResourceUriMapper;
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getWorkingDirectories(): readonly string[] { return []; }
		}();
		const workspaceService = new class extends mock<IAICustomizationWorkspaceService>() {
			override getActiveProjectRoot(): URI { return project; }
		}();
		const dialogService = new class extends mock<IDialogService>() {
			onConfirm = async (): Promise<IConfirmationResult> => ({ confirmed: true });
			override async confirm(): Promise<IConfirmationResult> { return this.onConfirm(); }
		}();
		const progressService = new class extends mock<IProgressService>() {
			override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
				return task({ report() { } });
			}
		}();
		const provider = store.add(new AgentHostPluginManagementProvider('provider', connection, customizationService, workspaceService, dialogService, new class extends mock<INotificationService>() { }(), progressService));
		return { provider, requests, dialogService, setProject: (uri: URI) => { project = uri; }, setManage: (handler: typeof manage) => { manage = handler; } };
	}

	test('captures the install directory before the trust dialog', async () => {
		const fixture = createFixture();
		fixture.dialogService.onConfirm = async () => {
			fixture.setProject(URI.file('/second'));
			return { confirmed: true };
		};
		await fixture.provider.install(session, 'demo@catalog');
		assert.deepStrictEqual(fixture.requests.map(request => [request.operation, request.target, request.workingDirectory]), [['install', 'demo@catalog', URI.file('/first').toString()]]);
	});

	test('deduplicates concurrent inventory reads', async () => {
		const fixture = createFixture();
		const response = new DeferredPromise<IAgentHostPluginManagementResult>();
		fixture.setManage(() => response.p);
		const first = fixture.provider.getItems(session, false, CancellationToken.None);
		const second = fixture.provider.getItems(session, false, CancellationToken.None);
		await response.complete(result(false));
		const items = await Promise.all([first, second]);
		assert.deepStrictEqual({ requests: fixture.requests.length, enabled: items.map(value => value[0].enabled), label: items[0][0].actions?.[0].label }, { requests: 1, enabled: [false, false], label: 'Enable' });
	});

	test('a stale inventory error cannot overwrite a newer project snapshot', async () => {
		const fixture = createFixture();
		const response = new DeferredPromise<IAgentHostPluginManagementResult>();
		fixture.setManage(() => response.p);
		const first = fixture.provider.getItems(session, false, CancellationToken.None);
		const rejected = assert.rejects(first, /old context/);
		fixture.setProject(URI.file('/second'));
		fixture.setManage(async () => result());
		await fixture.provider.getItems(session, false, CancellationToken.None);
		await response.error(new Error('old context'));
		await rejected;
		assert.deepStrictEqual({ error: fixture.provider.inventoryError.get(), installed: fixture.provider.installedPlugins.get()?.map(plugin => plugin.spec) }, { error: undefined, installed: ['demo@catalog'] });
	});

	test('remote management rejects client-local roots and preserves host-side Windows URI paths', async () => {
		const fixture = createFixture(true);
		await assert.rejects(fixture.provider.getItems(session, false, CancellationToken.None), /Select a project on this agent host/);
		const directory = URI.parse('file:///C:/repo');
		fixture.setProject(toAgentHostUri(directory, 'host'));
		await fixture.provider.getItems(session, false, CancellationToken.None);
		fixture.setProject(toAgentHostUri(directory, 'another-host'));
		await assert.rejects(fixture.provider.getItems(session, false, CancellationToken.None), /Select a project on this agent host/);
		assert.deepStrictEqual(fixture.requests.map(request => request.workingDirectory), [directory.toString()]);
	});

	test('cancellation during trust confirmation does not submit an SDK mutation', async () => {
		const fixture = createFixture();
		const cancellation = store.add(new CancellationTokenSource());
		fixture.dialogService.onConfirm = async () => {
			cancellation.cancel();
			return { confirmed: true };
		};
		await assert.rejects(fixture.provider.install(session, 'demo@catalog', undefined, cancellation.token), CancellationError);
		assert.deepStrictEqual(fixture.requests, []);
	});
});
